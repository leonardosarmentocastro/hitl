#!/usr/bin/env node
// The active-feature record of no-install mode: `{ worktree, topic, base, created }`, one per
// registered worktree, at `<memoryDir>/active/<sha256(worktree) first 16 hex>.json`; and the
// two `.git/info/exclude` lines that keep hitl's worktrees and review output out of
// `git status`. Also reports the repository's default branch, never assuming `main`.
// CLI: start | get [--field <name>] | end | base. Exit: 0 ok · 1 usage · 2 error · 3 refused.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { emit, parseArgs } from "../installer/lib.mjs";
import { hitlHome, mainCheckout, memoryDir } from "./memory.mjs";

export const EXCLUDES = [".claude/worktrees/", ".claude/reviews/"];

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function isDirectory(dir) {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function canonical(dir) {
  return isDirectory(dir) ? realpathSync(dir) : resolve(dir);
}

function recordName(worktree) {
  return `${createHash("sha256").update(worktree).digest("hex").slice(0, 16)}.json`;
}

/**
 * Where the record of `worktree` lives; when the folder is gone, found by searching the
 * `active/` folder of every project key (keys nest: `<host>/<owner>/<repo>`, `local/<name>`).
 * A project's own `active/` and `features/` folders are never descended into.
 */
function recordPath(worktree) {
  const name = recordName(worktree);
  if (isDirectory(worktree)) return join(memoryDir(worktree), "active", name);
  const search = (dir) => {
    const active = join(dir, "active");
    const isProject = isDirectory(active);
    const hit = join(active, name);
    if (isProject && existsSync(hit)) return hit;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || (isProject && (e.name === "active" || e.name === "features")))
        continue;
      const found = search(join(dir, e.name));
      if (found) return found;
    }
    return null;
  };
  const projects = join(hitlHome(), "projects");
  return isDirectory(projects) ? search(projects) : null;
}

function today() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Add the missing EXCLUDES lines to `<git common dir>/info/exclude`; returns those added. */
function ensureExcludes(worktree) {
  const common = git(worktree, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const path = join(common, "info/exclude");
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  const present = new Set(text.split("\n").map((l) => l.trim()));
  const added = EXCLUDES.filter((e) => !present.has(e));
  if (added.length === 0) return [];
  mkdirSync(join(common, "info"), { recursive: true });
  const base = text === "" || text.endsWith("\n") ? text : `${text}\n`;
  writeFileSync(path, `${base}${added.join("\n")}\n`);
  return added;
}

/** Register `worktree` as the active feature. Refuses an installed repository. */
export function startSession(worktree, topic, base) {
  const wt = canonical(worktree);
  if (existsSync(join(wt, ".claude/hitl.json"))) return { refused: "installed" };
  const path = recordPath(wt);
  const previous = path && existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
  const record = { worktree: wt, topic, base, created: previous?.created ?? today() };
  const excluded = ensureExcludes(wt);
  mkdirSync(join(memoryDir(wt), "active"), { recursive: true });
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
  return { record, excluded };
}

/** The record of `worktree`, or null (also when its folder no longer exists). */
export function getRecord(worktree) {
  const wt = canonical(worktree);
  if (!isDirectory(wt)) return null;
  const path = recordPath(wt);
  if (!path || !existsSync(path)) return null;
  const record = JSON.parse(readFileSync(path, "utf8"));
  return isDirectory(record.worktree) ? record : null;
}

/** Delete the record of `worktree`; true when there was one. */
export function endSession(worktree) {
  const path = recordPath(canonical(worktree));
  if (!path || !existsSync(path)) return false;
  rmSync(path);
  return true;
}

/** The repository's default branch: origin's HEAD, asked of the remote if unset locally. */
export function defaultBase(repo) {
  let hasOrigin = true;
  try {
    git(repo, "remote", "get-url", "origin");
  } catch {
    hasOrigin = false;
  }
  if (!hasOrigin) {
    const branch = git(mainCheckout(repo), "symbolic-ref", "--short", "HEAD");
    return { base: branch, branch };
  }
  try {
    const base = git(repo, "symbolic-ref", "--short", "refs/remotes/origin/HEAD");
    if (base.startsWith("origin/")) return { base, branch: base.slice("origin/".length) };
  } catch {
    // not set locally: ask the remote
  }
  const out = git(repo, "ls-remote", "--symref", "origin", "HEAD");
  const m = out.match(/^ref: refs\/heads\/(\S+)\s+HEAD$/m);
  if (!m) throw new Error("cannot resolve origin's default branch");
  return { base: `origin/${m[1]}`, branch: m[1] };
}

const FIELDS = ["worktree", "topic", "base", "created"];

const USAGE =
  "usage: start --worktree <dir> --topic <t> --base <ref> | get --worktree <dir> [--field <worktree|topic|base|created>] | end --worktree <dir> | base --repo <dir>";

export function run(verb, args) {
  const usage = { code: 1, out: { error: USAGE } };
  if (!args) return usage;
  try {
    if (verb === "base") {
      if (!args.repo || !isDirectory(args.repo)) return usage;
      return { code: 0, out: defaultBase(args.repo) };
    }
    if (!["start", "get", "end"].includes(verb) || !args.worktree) return usage;
    if (verb === "start") {
      if (!args.topic || !args.base || !isDirectory(args.worktree)) return usage;
      const r = startSession(args.worktree, args.topic, args.base);
      return r.refused ? { code: 3, out: r } : { code: 0, out: r };
    }
    if (verb === "get") {
      if (args.field !== undefined && !FIELDS.includes(args.field)) return usage;
      const record = getRecord(args.worktree);
      if (args.field !== undefined) {
        // A hand-edited record without the field counts as no record, not the text "undefined".
        const value = record?.[args.field];
        return value == null ? { code: 3, text: "" } : { code: 0, text: `${value}\n` };
      }
      return record ? { code: 0, out: { record } } : { code: 3, out: { refused: "no-record" } };
    }
    return { code: 0, out: { cleared: endSession(args.worktree) } };
  } catch (e) {
    return { code: 2, out: { error: String(e?.message ?? e) } };
  }
}

// Compare realpaths: Node resolves symlinks in import.meta.url but not in argv[1].
const isMain =
  process.argv[1] !== undefined &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (isMain) {
  const result = run(process.argv[2], parseArgs(process.argv.slice(3)));
  // `get --field` prints the bare value, for the Stop hook to read without parsing JSON.
  if (result.text !== undefined) {
    process.stdout.write(result.text);
    process.exit(result.code);
  }
  emit(result);
}
