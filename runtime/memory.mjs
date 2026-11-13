#!/usr/bin/env node
// Per-project memory for no-install mode: `~/.hitl/projects/<key>/`, one markdown file per
// fact plus a `MEMORY.md` index. The key is the normalized git remote (upstream, else origin),
// computed from the main checkout so every worktree and clone of a project shares it. Nothing
// here writes a fact as a side effect: `write` is run by a prompt after the user agreed.
// CLI: key | write | list. Exit: 0 ok · 1 usage · 2 error.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { emit, parseArgs } from "../installer/lib.mjs";

export const FACT_TYPES = ["gates", "review-context", "pr-section", "quirk"];
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const INDEX = "MEMORY.md";

export function hitlHome() {
  return process.env.HITL_HOME || join(homedir(), ".hitl");
}

function git(repo, ...args) {
  return execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

/** The main checkout of the repository `repo` belongs to (also from a linked worktree). */
export function mainCheckout(repo) {
  return dirname(git(repo, "rev-parse", "--path-format=absolute", "--git-common-dir"));
}

function safeSegment(s) {
  return s.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
}

/** `<host>/<path>` lowercase, without scheme, user, port or `.git`; null when unusable. */
export function normalizeRemote(url) {
  const text = (url ?? "").trim();
  if (text === "") return null;
  let host;
  let path;
  const scheme = text.match(/^[a-z][a-z0-9+.-]*:\/\/(.*)$/i);
  if (scheme) {
    const rest = scheme[1];
    const slash = rest.indexOf("/");
    const authority = slash === -1 ? rest : rest.slice(0, slash);
    path = slash === -1 ? "" : rest.slice(slash + 1);
    host = authority.slice(authority.lastIndexOf("@") + 1).replace(/:\d*$/, "");
  } else {
    const scp = text.match(/^(?:[^@/]+@)?([^/:]+):(.*)$/);
    if (!scp) return null;
    host = scp[1];
    path = scp[2];
  }
  const segments = [host, ...path.split("/")].filter((s) => s !== "");
  if (host === "" || segments.length === 0) return null;
  const last = segments.length - 1;
  segments[last] = segments[last].replace(/\.git$/i, "");
  if (segments.some((s) => s === "." || s === ".." || s === "")) return null;
  return segments.map(safeSegment).join("/");
}

function remoteUrl(repo, name) {
  try {
    return git(repo, "remote", "get-url", name);
  } catch {
    return null;
  }
}

/** The project key: upstream's, else origin's, else `local/<basename of the main checkout>`. */
export function projectKey(repo) {
  for (const name of ["upstream", "origin"]) {
    const key = normalizeRemote(remoteUrl(repo, name));
    if (key !== null) return key;
  }
  return `local/${safeSegment(basename(mainCheckout(repo)))}`;
}

export function memoryDir(repo) {
  return join(hitlHome(), "projects", projectKey(repo));
}

/** Parse one fact file; null when its frontmatter is missing or invalid. */
function parseFact(text) {
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---\n", 3);
  if (end === -1) return null;
  const fields = {};
  let inMetadata = false;
  for (const line of text.slice(4, end).split("\n")) {
    if (line === "metadata:") {
      inMetadata = true;
      continue;
    }
    const nested = line.match(/^\s+([a-z]+):\s?(.*)$/);
    if (nested && inMetadata) {
      fields[`metadata.${nested[1]}`] = nested[2].trim();
      continue;
    }
    const top = line.match(/^([a-z]+):\s?(.*)$/);
    if (top) {
      inMetadata = false;
      fields[top[1]] = top[2].trim();
    }
  }
  const type = fields["metadata.type"];
  if (!fields.name || !FACT_TYPES.includes(type)) return null;
  return {
    name: fields.name,
    description: fields.description ?? "",
    type,
    body: text.slice(end + 5),
  };
}

/** Every valid fact in `dir`; files that are not valid facts are listed in `skipped`. */
export function readFacts(dir) {
  const facts = [];
  const skipped = [];
  if (!existsSync(dir)) return { facts, skipped };
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(".md") || file === INDEX) continue;
    const fact = parseFact(readFileSync(join(dir, file), "utf8"));
    if (fact === null) skipped.push(file);
    else facts.push(fact);
  }
  return { facts, skipped };
}

/** Write `<name>.md` and add or replace its line in MEMORY.md; returns the fact's path. */
export function writeFact(dir, fact) {
  if (!NAME.test(fact.name)) throw new Error(`fact name must be kebab-case: ${fact.name}`);
  if (!FACT_TYPES.includes(fact.type)) throw new Error(`unknown fact type: ${fact.type}`);
  const description = String(fact.description ?? "")
    .replace(/\s*\n\s*/g, " ")
    .trim();
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${fact.name}.md`);
  writeFileSync(
    path,
    `---\nname: ${fact.name}\ndescription: ${description}\nmetadata:\n  type: ${fact.type}\n---\n${fact.body}`,
  );
  const indexPath = join(dir, INDEX);
  const line = `- [${fact.name}](${fact.name}.md) — ${description}`;
  const lines = existsSync(indexPath)
    ? readFileSync(indexPath, "utf8")
        .split("\n")
        .filter((l) => l !== "")
    : [];
  const at = lines.findIndex((l) => l.startsWith(`- [${fact.name}](`));
  if (at === -1) lines.push(line);
  else lines[at] = line;
  writeFileSync(indexPath, `${lines.join("\n")}\n`);
  return path;
}

/** The gate commands of the `gates` fact: null without one, [] when it says `none`. */
export function gatesOf(facts) {
  const fact = facts.find((f) => f.type === "gates");
  if (!fact) return null;
  if (fact.body.trim() === "none") return [];
  const out = [];
  for (const line of fact.body.split("\n")) {
    const m = line.match(/^- `(.+)`\s*$/);
    if (m) out.push(m[1]);
  }
  return out;
}

const USAGE =
  "usage: key --repo <dir> | list --repo <dir> | write --repo <dir> --name <n> --type <gates|review-context|pr-section|quirk> --description <d> --body-file <f>";

export function run(verb, args) {
  const usage = { code: 1, out: { error: USAGE } };
  if (!args?.repo || !["key", "write", "list"].includes(verb)) return usage;
  let key;
  let dir;
  try {
    key = projectKey(args.repo);
    dir = join(hitlHome(), "projects", key);
  } catch {
    return { code: 2, out: { error: `not a git repository: ${args.repo}` } };
  }
  if (verb === "key") return { code: 0, out: { key, dir } };
  if (verb === "list") return { code: 0, out: { key, dir, ...readFacts(dir) } };
  const { name, type, description, "body-file": bodyFile } = args;
  if (!name || !NAME.test(name) || !FACT_TYPES.includes(type) || description === undefined)
    return usage;
  if (!bodyFile) return usage;
  let body;
  try {
    body = readFileSync(bodyFile, "utf8");
  } catch {
    return { code: 2, out: { error: `cannot read --body-file ${bodyFile}` } };
  }
  return { code: 0, out: { wrote: writeFact(dir, { name, description, type, body }) } };
}

// Compare realpaths: Node resolves symlinks in import.meta.url but not in argv[1].
const isMain =
  process.argv[1] !== undefined &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (isMain) emit(run(process.argv[2], parseArgs(process.argv.slice(3))));
