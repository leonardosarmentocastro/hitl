#!/usr/bin/env node
// The one reader every no-install command calls first: the mode (installed or not), the code
// host, the project's memory and gates, the active-feature record and the base branch, plus
// the plugin paths the doctrine and the PR shim live at. `--require` refuses, in a fixed order
// (no-install, github, gates), before anything else is reported; `--format brief` prints the
// "hitl context" block prompts read. Exit: 0 ok · 1 usage · 2 error · 3 refused.
import { execFileSync } from "node:child_process";
import { existsSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hostOf } from "../installer/discover.mjs";
import { emit, parseArgs } from "../installer/lib.mjs";
import { gatesOf, hitlHome, projectKey, readFacts } from "./memory.mjs";
import { defaultBase, getRecord } from "./session.mjs";

const REQUIREMENTS = ["no-install", "github", "gates"];
const USAGE =
  "usage: --repo <dir> --plugin-root <dir> [--require <no-install,github,gates>] [--format json|brief]";

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function originOf(repo) {
  try {
    const url = git(repo, "remote", "get-url", "origin");
    return url === "" ? null : url;
  } catch {
    return null;
  }
}

function branchOf(base) {
  return base.startsWith("origin/") ? base.slice("origin/".length) : base;
}

/** Everything a no-install command needs to know, as one object. */
export function readContext(repo, pluginRoot) {
  const top = realpathSync(git(repo, "rev-parse", "--show-toplevel"));
  const root = resolve(pluginRoot);
  const key = projectKey(repo);
  const dir = join(hitlHome(), "projects", key);
  const { facts, skipped } = readFacts(dir);
  const record = getRecord(top);
  return {
    mode: existsSync(join(top, ".claude/hitl.json")) ? "installed" : "no-install",
    host: hostOf(originOf(repo)),
    key,
    memoryDir: dir,
    doctrine: join(root, "doctrine/HITL.md"),
    prShim: join(root, "runtime/pr/pr.sh"),
    gates: gatesOf(facts),
    facts,
    skipped,
    record,
  };
}

/** The first unmet requirement, as a refusal, or null. */
function refusal(ctx, required) {
  if (required.includes("no-install") && ctx.mode === "installed") return { refused: "installed" };
  if (required.includes("github") && ctx.host !== "github")
    return { refused: "not-github", host: ctx.host };
  if (required.includes("gates") && ctx.gates === null) return { refused: "no-gates" };
  return null;
}

/** The "hitl context" block prompts read. */
export function briefOf(ctx, pluginRoot) {
  const lines = [
    "## hitl context (no-install)",
    `Plugin root: ${resolve(pluginRoot)}`,
    `Doctrine: ${ctx.doctrine}`,
    `PR shim: ${ctx.prShim}`,
    `Host: ${ctx.host}`,
    `Base: ${ctx.base.branch}`,
    `Worktree: ${ctx.record ? ctx.record.worktree : "none"}`,
    "Gates:",
  ];
  if (ctx.gates.length === 0) lines.push("- none");
  else for (const g of ctx.gates) lines.push(`- \`${g}\``);
  lines.push("Project memory — this project's conventions, recorded by its user:");
  const others = ctx.facts.filter((f) => f.type !== "gates");
  if (others.length === 0) lines.push("(nothing recorded)");
  for (const f of others) lines.push(`### ${f.name} (${f.type})`, f.body.replace(/\n+$/, ""));
  return `${lines.join("\n")}\n`;
}

function isDirectory(dir) {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

export function run(args) {
  const usage = { code: 1, out: { error: USAGE } };
  if (!args?.repo || !args["plugin-root"] || !isDirectory(args.repo)) return usage;
  const format = args.format ?? "json";
  if (!["json", "brief"].includes(format)) return usage;
  const required = args.require === undefined ? [] : args.require.split(",").map((s) => s.trim());
  if (required.some((r) => !REQUIREMENTS.includes(r))) return usage;
  try {
    const ctx = readContext(args.repo, args["plugin-root"]);
    const refused = refusal(ctx, format === "brief" ? [...required, "gates"] : required);
    if (refused) return { code: 3, out: refused };
    // An installed repository never uses the base; elsewhere only the brief needs it, so JSON
    // reports a lookup failure (offline, no origin/HEAD, detached HEAD) instead of failing.
    ctx.base = null;
    if (ctx.mode === "no-install") {
      try {
        ctx.base = ctx.record
          ? { base: ctx.record.base, branch: branchOf(ctx.record.base) }
          : defaultBase(args.repo);
      } catch (e) {
        const error = `cannot resolve the default branch: ${String(e?.message ?? e)}`;
        if (format === "brief") return { code: 2, out: { error } };
        ctx.baseError = error;
      }
    }
    if (format === "brief") return { code: 0, text: briefOf(ctx, args["plugin-root"]) };
    return { code: 0, out: ctx };
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
  const result = run(parseArgs(process.argv.slice(2)));
  if (result.text !== undefined) {
    process.stdout.write(result.text);
    process.exit(result.code);
  }
  emit(result);
}
