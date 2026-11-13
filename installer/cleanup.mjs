#!/usr/bin/env node
// /hitl:cleanup's engine. Finds the worktrees hitl design sessions created — locked with
// "hitl design session: <topic> on <branch>" — and classifies each: merged · abandoned ·
// has unsaved work · in progress. With --remove it deletes exactly the named ones after
// re-checking them. Never prompts and never touches a remote branch.
// An installed repository (one with .claude/hitl.json) uses its own PR shim and origin/main.
// Where nothing is installed it uses the plugin's shim (--plugin-root), compares each entry
// against its active-feature record's base, reports the feature's archived documents that
// reached that base, and clears the record of a removed worktree. `<branch>-wipe` is one of
// the feature's branches. The .git/info/exclude lines are left in place for the next feature.
// Exit: 0 ok · 1 usage · 2 the fetch or the PR shim failed.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { memoryDir } from "../runtime/memory.mjs";
import { endSession, getRecord } from "../runtime/session.mjs";
import { emit, parseArgs, MANIFEST_PATH } from "./lib.mjs";

const USAGE =
  "usage: --repo <dir> [--plugin-root <dir>] [--remove <abs worktree path>[,<abs worktree path>…]]";
const REASON = /^hitl design session: (\S+) on (\S+)$/;
const DEFAULT_BASE = "origin/main";
const DOCS = "docs/superpowers";

class Failure extends Error {}

function git(cwd, ...args) {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  const raw = r.stdout ?? "";
  return { ok: r.status === 0, out: raw.trim(), raw, err: (r.stderr ?? "").trim() };
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

function listPrs(shim, branch) {
  const r = spawnSync(shim, ["list", "--head-prefix", branch, "--state", "all"], {
    encoding: "utf8",
  });
  if (r.status !== 0) {
    const why = (r.stderr || r.error?.message || `exit ${r.status}`).trim();
    throw new Failure(`the PR shim failed: ${why}`);
  }
  try {
    return JSON.parse(r.stdout);
  } catch {
    throw new Failure("the PR shim printed something that is not a JSON list of PRs");
  }
}

const exists = (main, b) => git(main, "rev-parse", "--verify", "--quiet", `refs/heads/${b}`).ok;
function beyondBase(main, base, b) {
  const r = git(main, "rev-list", `${base}..${b}`);
  if (!r.ok) throw new Failure(`could not compare ${b} with ${base}: ${r.err}`);
  return lines(r.out).length;
}

/** The files of a feature's archive folder, as paths under docs/superpowers/. */
function archived(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => `${DOCS}/${join(e.parentPath, e.name).slice(dir.length + 1)}`)
    .sort();
}

/** On a remote-tracking ref, or at/behind the head commit of a merged PR for that branch. */
function isSaved(main, b, prs) {
  const r = git(main, "rev-list", b, "--not", "--remotes");
  if (r.ok && r.out === "") return true;
  const tip = git(main, "rev-parse", b).out;
  return prs.some(
    (p) =>
      p.head === b &&
      p.state === "merged" &&
      p.head_sha &&
      git(main, "merge-base", "--is-ancestor", tip, p.head_sha).ok,
  );
}

function sizeKb(path) {
  const r = spawnSync("du", ["-sk", path], { encoding: "utf8" });
  return r.status === 0 ? Number(r.stdout.split(/\s/)[0]) : null;
}

function ignoredEntries(path) {
  return lines(git(path, "status", "--porcelain", "--ignored=matching").raw)
    .filter((l) => l.startsWith("!! "))
    .map((l) => l.slice(3))
    .map((entry) => ({ entry, sizeKb: sizeKb(join(path, entry)) }));
}

function classify(ctx, here, wt) {
  const { main, shim } = ctx;
  const base = wt.base;
  const prs = listPrs(shim, wt.branch);
  const slices = lines(
    git(main, "for-each-ref", "--format=%(refname:short)", `refs/heads/${wt.branch}-slice-*`).out,
  );
  if (exists(main, `${wt.branch}-wipe`)) slices.push(`${wt.branch}-wipe`);
  const branches = [wt.branch, ...slices].filter((b) => exists(main, b));
  const umbrella = prs.filter((p) => p.head === wt.branch);
  const merged = umbrella.find((p) => p.state === "merged") ?? null;
  const present = existsSync(wt.path);
  const unsaved = present
    ? lines(git(wt.path, "status", "--porcelain").raw).map((l) => `not committed: ${l.slice(3)}`)
    : ["the worktree folder is missing"];
  if (present && !wt.checkedOut) {
    const loose = git(wt.path, "rev-list", "HEAD", "--not", "--branches", "--remotes");
    if (!loose.ok || loose.out !== "")
      unsaved.push("detached HEAD has commits that are on no branch and no remote");
  }

  let cls = "in progress";
  if (merged) {
    cls = "merged";
    for (const b of branches)
      if (!isSaved(main, b, prs))
        unsaved.push(`${b} has commits that are on no remote branch and in no merged PR`);
  } else if (
    umbrella.length === 0 &&
    exists(main, wt.branch) &&
    beyondBase(main, base, wt.branch) === 0
  ) {
    cls = "abandoned";
    for (const b of slices)
      if (!isSaved(main, b, prs) && beyondBase(main, base, b) > 0)
        unsaved.push(`${b} has commits that are on no remote branch`);
  }
  if (cls !== "in progress" && unsaved.length > 0) cls = "has unsaved work";
  const shown = merged ?? umbrella[0] ?? null;
  const isHere = resolve(wt.path) === resolve(here);
  const docsOnBase =
    merged && wt.record
      ? archived(
          join(memoryDir(main), "features", `${wt.record.created}-${wt.record.topic}`),
        ).filter((f) => git(main, "cat-file", "-e", `${base}:${f}`).ok)
      : [];
  const { record: _record, base: _base, ...entry } = wt;
  return {
    ...entry,
    class: cls,
    offered: (cls === "merged" || cls === "abandoned") && !isHere && present,
    here: isHere,
    umbrella: shown ? { number: shown.number, url: shown.url } : null,
    branches,
    unsaved,
    sizeKb: present ? sizeKb(wt.path) : null,
    ignored: present ? ignoredEntries(wt.path) : [],
    docsOnBase,
  };
}

/** A base as a ref to verify: `origin/<b>` must be the remote-tracking ref the fetch updated. */
const remoteRef = (base) => (base.startsWith("origin/") ? `refs/remotes/${base}` : base);

function run(args) {
  if (!args?.repo) return { code: 1, out: { error: USAGE } };
  const common = git(args.repo, "rev-parse", "--path-format=absolute", "--git-common-dir");
  if (!common.ok) return { code: 1, out: { error: `${args.repo} is not in a git repository` } };
  const main = dirname(common.out);
  const here = git(args.repo, "rev-parse", "--show-toplevel").out;
  const installed = existsSync(join(main, MANIFEST_PATH));
  let shim;
  if (installed) shim = join(main, "scripts/hitl/pr.sh");
  else if (args["plugin-root"]) shim = join(resolve(args["plugin-root"]), "runtime/pr/pr.sh");
  else return { code: 2, out: { error: "no PR shim: pass --plugin-root" } };
  const fetch = git(main, "fetch", "--prune", "origin");
  if (!fetch.ok)
    return { code: 2, out: { error: `git fetch --prune origin failed: ${fetch.err}` } };
  const found = hitlWorktrees(main).map((wt) => {
    const record = installed ? null : getRecord(wt.path);
    return { ...wt, base: record?.base ?? DEFAULT_BASE, record };
  });
  const bases = new Set(found.map((wt) => wt.base));
  if (installed) bases.add(DEFAULT_BASE);
  for (const base of bases)
    if (!git(main, "rev-parse", "--verify", "--quiet", `${remoteRef(base)}^{commit}`).ok)
      return {
        code: 2,
        out: { error: `${base} does not exist after the fetch; nothing can be checked against it` },
      };
  const ctx = { main, shim, installed };
  try {
    const worktrees = found.map((wt) => classify(ctx, here, wt));
    if (!args.remove) return { code: 0, out: { main, pruned: true, worktrees } };
    return { code: 0, out: { main, pruned: true, ...removeAll(ctx, worktrees, args.remove) } };
  } catch (e) {
    if (e instanceof Failure) return { code: 2, out: { error: e.message } };
    throw e;
  }
}

function removeAll({ main, installed }, worktrees, list) {
  const removed = [];
  const refused = [];
  for (const path of list.split(",").map((p) => resolve(p))) {
    const wt = worktrees.find((w) => resolve(w.path) === path);
    if (!wt) {
      refused.push({ path, why: "not a hitl design-session worktree" });
      continue;
    }
    if (!wt.offered) {
      const why = wt.here ? "this command is running inside it" : `it is ${wt.class}`;
      refused.push({ path, why });
      continue;
    }
    git(main, "worktree", "unlock", path);
    const rm = git(main, "worktree", "remove", path);
    if (!rm.ok) {
      git(
        main,
        "worktree",
        "lock",
        "--reason",
        `hitl design session: ${wt.topic} on ${wt.branch}`,
        path,
      );
      refused.push({ path, why: rm.err });
      continue;
    }
    const done = { path, branches: wt.branches.filter((b) => git(main, "branch", "-D", b).ok) };
    if (!installed) done.recordCleared = endSession(path);
    removed.push(done);
  }
  return { removed, refused };
}

emit(run(parseArgs(process.argv.slice(2))));
