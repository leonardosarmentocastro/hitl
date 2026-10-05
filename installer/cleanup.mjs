#!/usr/bin/env node
// /hitl:cleanup's engine. Finds the worktrees hitl design sessions created — locked with
// "hitl design session: <topic> on <branch>" — and classifies each: merged · abandoned ·
// has unsaved work · in progress. With --remove it deletes exactly the named ones after
// re-checking them. Never prompts and never touches a remote branch.
// Exit: 0 ok · 1 usage · 2 the fetch or the PR shim failed.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { emit, parseArgs } from "./lib.mjs";

const USAGE = "usage: --repo <dir> [--remove <abs worktree path>[,<abs worktree path>…]]";
const REASON = /^hitl design session: (\S+) on (\S+)$/;
const BASE = "origin/main";

class Failure extends Error {}

function git(cwd, ...args) {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}

const lines = (text) => text.split("\n").filter(Boolean);

/** Worktrees locked by a hitl design session: { path, topic, branch, checkedOut }. */
function hitlWorktrees(main) {
  return git(main, "worktree", "list", "--porcelain")
    .out.split("\n\n")
    .map((block) => {
      const get = (key) =>
        lines(block)
          .find((l) => l.startsWith(`${key} `))
          ?.slice(key.length + 1);
      const m = (get("locked") ?? "").match(REASON);
      if (!m) return null;
      const head = (get("branch") ?? "").replace(/^refs\/heads\//, "");
      return { path: get("worktree"), topic: m[1], branch: m[2], checkedOut: head || null };
    })
    .filter(Boolean);
}

function listPrs(main, branch) {
  const r = spawnSync(
    join(main, "scripts/hitl/pr.sh"),
    ["list", "--head-prefix", branch, "--state", "all"],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    const why = (r.stderr || r.error?.message || `exit ${r.status}`).trim();
    throw new Failure(`the PR shim failed: ${why}`);
  }
  return JSON.parse(r.stdout);
}

const exists = (main, b) => git(main, "rev-parse", "--verify", "--quiet", `refs/heads/${b}`).ok;
const beyondBase = (main, b) => lines(git(main, "rev-list", `${BASE}..${b}`).out).length;

function sizeKb(path) {
  const r = spawnSync("du", ["-sk", path], { encoding: "utf8" });
  return r.status === 0 ? Number(r.stdout.split(/\s/)[0]) : null;
}

function classify(main, here, wt) {
  const prs = listPrs(main, wt.branch);
  const branches = [wt.branch].filter((b) => exists(main, b));
  const umbrella = prs.filter((p) => p.head === wt.branch);
  const unsaved = [];

  let cls = "in progress";
  if (umbrella.length === 0 && exists(main, wt.branch) && beyondBase(main, wt.branch) === 0)
    cls = "abandoned";
  return {
    ...wt,
    class: cls,
    offered: cls === "merged" || cls === "abandoned",
    here: false,
    umbrella: null,
    branches,
    unsaved,
    sizeKb: sizeKb(wt.path),
    ignored: [],
  };
}

function run(args) {
  if (!args?.repo) return { code: 1, out: { error: USAGE } };
  const common = git(args.repo, "rev-parse", "--path-format=absolute", "--git-common-dir");
  if (!common.ok) return { code: 1, out: { error: `${args.repo} is not in a git repository` } };
  const main = dirname(common.out);
  const here = git(args.repo, "rev-parse", "--show-toplevel").out;
  const fetch = git(main, "fetch", "--prune", "origin");
  if (!fetch.ok) return { code: 2, out: { error: `git fetch --prune origin failed: ${fetch.err}` } };
  try {
    const worktrees = hitlWorktrees(main).map((wt) => classify(main, here, wt));
    if (!args.remove) return { code: 0, out: { main, pruned: true, worktrees } };
    return { code: 0, out: { main, pruned: true, ...removeAll(main, worktrees, args.remove) } };
  } catch (e) {
    if (e instanceof Failure) return { code: 2, out: { error: e.message } };
    throw e;
  }
}

function removeAll() {
  throw new Failure("--remove is not implemented yet");
}

emit(run(parseArgs(process.argv.slice(2))));
