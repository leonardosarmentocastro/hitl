// scripts/__tests__/cleanup.test.ts
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const CLEANUP = join(ROOT, "installer/cleanup.mjs");
const STUB = join(ROOT, "scripts/__fixtures__/stub-pr-shim/pr.sh");
const SESSION = join(ROOT, "runtime/session.mjs");
const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, env: ENV, encoding: "utf8" }).trim();
}

type Pr = { number: number; head: string; state: "open" | "merged" | "closed"; head_sha?: string };

/** A shim at `path` that fails like a host error. */
function failingShim(path: string) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, '#!/usr/bin/env bash\necho "plugin shim: must not run" >&2\nexit 2\n');
  chmodSync(path, 0o755);
}

/**
 * A bare remote and a clone of it with one pushed commit on the default branch. Installed (the
 * default): the clone carries a manifest and the stub shim under scripts/hitl/. No-install:
 * neither; the stub shim sits in a plugin root at runtime/pr/pr.sh instead.
 */
function world(defaultBranch = "main", installed = true) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "hitl-cleanup-")));
  const home = join(base, "hitl-home");
  const pluginRoot = join(base, "plugin");
  const remote = join(base, "remote.git");
  git(base, "init", "-q", "--bare", "-b", defaultBranch, remote);
  const main = join(base, "main");
  git(base, "clone", "-q", remote, main);
  writeFileSync(join(main, ".gitignore"), ".claude/worktrees/\nnode_modules/\nscripts/hitl/\n");
  git(main, "add", ".gitignore");
  git(main, "commit", "-q", "-m", "init");
  git(main, "push", "-q", "origin", `HEAD:${defaultBranch}`);
  git(main, "fetch", "-q", "origin");
  const shim = installed ? join(main, "scripts/hitl/pr.sh") : join(pluginRoot, "runtime/pr/pr.sh");
  mkdirSync(join(shim, ".."), { recursive: true });
  copyFileSync(STUB, shim);
  chmodSync(shim, 0o755);
  if (installed) {
    mkdirSync(join(main, ".claude"), { recursive: true });
    writeFileSync(join(main, ".claude/hitl.json"), "{}\n");
  }
  const prsFile = join(base, "prs.json");
  const setPrs = (prs: Pr[]) =>
    writeFileSync(
      prsFile,
      JSON.stringify(
        prs.map((p) => ({
          url: `https://host/pr/${p.number}`,
          base: "main",
          draft: false,
          title: "t",
          body: "",
          head_sha: null,
          ...p,
        })),
      ),
    );
  setPrs([]);
  return { base, main, prsFile, setPrs, home, pluginRoot, installed };
}
type World = ReturnType<typeof world>;

function designWorktree(w: World, topic: string, prefix = "feat", start = "origin/main") {
  const path = join(w.main, ".claude/worktrees", topic);
  const branch = `${prefix}/${topic}`;
  git(w.main, "worktree", "add", "-q", path, "-b", branch, start);
  git(w.main, "worktree", "lock", "--reason", `hitl design session: ${topic} on ${branch}`, path);
  return { path, branch };
}

function commit(cwd: string, file: string): string {
  writeFileSync(join(cwd, file), file);
  git(cwd, "add", file);
  git(cwd, "commit", "-q", "-m", file);
  return git(cwd, "rev-parse", "HEAD");
}

function cleanup(w: World, args: string[] = [], env: Record<string, string> = {}, repo = w.main) {
  const r = spawnSync(process.execPath, [CLEANUP, "--repo", repo, ...args], {
    encoding: "utf8",
    env: { ...ENV, FAKE_PRS: w.prsFile, HITL_HOME: w.home, ...env },
  });
  return { status: r.status, json: JSON.parse(r.stdout), stderr: r.stderr };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const at = (out: any, path: string) => out.worktrees.find((x: { path: string }) => x.path === path);

describe("cleanup.mjs — which worktrees", () => {
  it("lists only worktrees locked by a hitl design session", () => {
    const w = world();
    git(w.main, "worktree", "add", "-q", join(w.main, ".claude/worktrees/plain"), "-b", "plain");
    const other = join(w.main, ".claude/worktrees/other");
    git(w.main, "worktree", "add", "-q", other, "-b", "other");
    git(w.main, "worktree", "lock", "--reason", "something else", other);
    const { path } = designWorktree(w, "a");
    const r = cleanup(w);
    expect(r.status).toBe(0);
    expect(r.json.worktrees.map((x: { path: string }) => x.path)).toEqual([path]);
  });

  it("exits 1 without --repo", () => {
    const r = spawnSync(process.execPath, [CLEANUP], { encoding: "utf8" });
    expect(r.status).toBe(1);
  });
});

describe("cleanup.mjs — classes", () => {
  it("abandoned: no PR, no commits beyond origin/main, clean", () => {
    const w = world();
    const { path, branch } = designWorktree(w, "a");
    const e = at(cleanup(w).json, path);
    expect(e).toMatchObject({ topic: "a", branch, class: "abandoned", offered: true, here: false });
    expect(e.branches).toEqual([branch]);
    expect(e.sizeKb).toBeGreaterThan(0);
  });

  it("in progress: commits but no PR — listed, not offered", () => {
    const w = world();
    const { path } = designWorktree(w, "p");
    commit(path, "spec.md");
    expect(at(cleanup(w).json, path)).toMatchObject({ class: "in progress", offered: false });
  });

  it("merged: squash-merged umbrella PR, pushed branch, clean", () => {
    const w = world();
    const { path, branch } = designWorktree(w, "m");
    const tip = commit(path, "spec.md");
    git(path, "push", "-q", "origin", branch);
    w.setPrs([{ number: 7, head: branch, state: "merged", head_sha: tip }]);
    const e = at(cleanup(w).json, path);
    expect(e).toMatchObject({ class: "merged", offered: true, umbrella: { number: 7 } });
  });

  it("has unsaved work: a local commit on no remote and in no merged PR", () => {
    const w = world();
    const { path, branch } = designWorktree(w, "m");
    const tip = commit(path, "spec.md");
    git(path, "push", "-q", "origin", branch);
    w.setPrs([{ number: 7, head: branch, state: "merged", head_sha: tip }]);
    commit(path, "later.md");
    const e = at(cleanup(w).json, path);
    expect(e).toMatchObject({ class: "has unsaved work", offered: false });
    expect(e.unsaved.join(" ")).toContain(branch);
  });

  it("has unsaved work: an untracked file", () => {
    const w = world();
    const { path } = designWorktree(w, "a");
    writeFileSync(join(path, "notes.txt"), "x");
    const e = at(cleanup(w).json, path);
    expect(e.class).toBe("has unsaved work");
    expect(e.unsaved.join(" ")).toContain("notes.txt");
  });

  it("merged: a branch the host deleted and the fetch pruned is saved through head_sha", () => {
    const w = world();
    const { path, branch } = designWorktree(w, "d");
    const tip = commit(path, "spec.md");
    git(path, "push", "-q", "origin", branch);
    git(w.main, "push", "-q", "origin", "--delete", branch);
    w.setPrs([{ number: 8, head: branch, state: "merged", head_sha: tip }]);
    expect(at(cleanup(w).json, path).class).toBe("merged");
    commit(path, "beyond.md");
    expect(at(cleanup(w).json, path).class).toBe("has unsaved work");
  });

  it("in progress while the worktree sits on a merged slice and the umbrella is open; merged after", () => {
    const w = world();
    const { path, branch } = designWorktree(w, "s");
    const feat = commit(path, "spec.md");
    git(path, "push", "-q", "origin", branch);
    const slice = `${branch}-slice-1-api`;
    git(path, "checkout", "-q", "-b", slice);
    const sliceTip = commit(path, "api.ts");
    git(path, "push", "-q", "origin", slice);
    w.setPrs([
      { number: 1, head: slice, state: "merged", head_sha: sliceTip },
      { number: 2, head: branch, state: "open", head_sha: feat },
    ]);
    expect(at(cleanup(w).json, path)).toMatchObject({
      class: "in progress",
      offered: false,
      branch,
      checkedOut: slice,
    });
    w.setPrs([
      { number: 1, head: slice, state: "merged", head_sha: sliceTip },
      { number: 2, head: branch, state: "merged", head_sha: feat },
    ]);
    const e = at(cleanup(w).json, path);
    expect(e.class).toBe("merged");
    expect(e.branches.sort()).toEqual([branch, slice].sort());
  });

  it("has unsaved work: abandoned, but a local slice branch carries an unpushed commit", () => {
    const w = world();
    const { path, branch } = designWorktree(w, "u");
    git(path, "checkout", "-q", "-b", `${branch}-slice-1-a`);
    commit(path, "wip.ts");
    expect(at(cleanup(w).json, path).class).toBe("has unsaved work");
  });

  it("has unsaved work: a tracked edit names the file in full", () => {
    const w = world();
    const { path } = designWorktree(w, "a");
    writeFileSync(join(path, ".gitignore"), "changed\n");
    const e = at(cleanup(w).json, path);
    expect(e.class).toBe("has unsaved work");
    expect(e.unsaved).toContain("not committed: .gitignore");
  });

  it("finds slice branches of a fix/ branch", () => {
    const w = world();
    const { path, branch } = designWorktree(w, "api-v2", "fix");
    git(w.main, "branch", `${branch}-slice-1-a`, branch);
    expect(at(cleanup(w).json, path).branches.sort()).toEqual(
      [branch, `${branch}-slice-1-a`].sort(),
    );
  });

  it("reports gitignored entries with their size", () => {
    const w = world();
    const { path } = designWorktree(w, "a");
    mkdirSync(join(path, "node_modules/x"), { recursive: true });
    writeFileSync(join(path, "node_modules/x/index.js"), "x".repeat(10_000));
    const e = at(cleanup(w).json, path);
    expect(e.class).toBe("abandoned");
    expect(e.ignored).toEqual([{ entry: "node_modules/", sizeKb: expect.any(Number) }]);
  });

  it("never offers the worktree it runs in", () => {
    const w = world();
    const { path } = designWorktree(w, "a");
    expect(at(cleanup(w, [], {}, path).json, path)).toMatchObject({
      class: "abandoned",
      offered: false,
      here: true,
    });
  });

  it("does not crash on a registered worktree whose folder was deleted", () => {
    const w = world();
    const { path } = designWorktree(w, "gone");
    rmSync(path, { recursive: true, force: true });
    const r = cleanup(w);
    expect(r.status).toBe(0);
    expect(at(r.json, path)).toMatchObject({ offered: false });
    expect(at(r.json, path).unsaved).toContain("the worktree folder is missing");
  });

  it("has unsaved work: a detached HEAD with commits on no branch", () => {
    const w = world();
    const { path } = designWorktree(w, "h");
    git(path, "checkout", "-q", "--detach");
    commit(path, "loose.md");
    git(path, "checkout", "-q", "--detach", "origin/main");
    commit(path, "loose2.md");
    const e = at(cleanup(w).json, path);
    expect(e.class).toBe("has unsaved work");
    expect(e.unsaved.join(" ")).toContain("detached HEAD");
  });
});

describe("cleanup.mjs — failures offer nothing", () => {
  it("exits 2 when the PR shim fails", () => {
    const w = world();
    designWorktree(w, "a");
    const r = cleanup(w, [], { FAKE_PRS_FAIL: "1" });
    expect(r.status).toBe(2);
    expect(r.json.error).toMatch(/PR shim/);
  });

  it("exits 2 when the PR shim prints something that is not JSON", () => {
    const w = world();
    designWorktree(w, "a");
    writeFileSync(w.prsFile, "<html>rate limited</html>");
    const r = cleanup(w);
    expect(r.status).toBe(2);
    expect(r.json.error).toMatch(/PR shim/);
  });

  it("exits 2 and removes nothing when origin/main does not exist", () => {
    const w = world("master");
    const { path, branch } = designWorktree(w, "x", "feat", "origin/master");
    const tip = commit(path, "unpushed.md");
    const listed = cleanup(w);
    expect(listed.status).toBe(2);
    expect(listed.json.error).toMatch(/origin\/main/);
    const r = cleanup(w, ["--remove", path]);
    expect(r.status).toBe(2);
    expect(existsSync(path)).toBe(true);
    expect(git(w.main, "rev-parse", branch)).toBe(tip);
  });

  it("exits 2 when the fetch fails", () => {
    const w = world();
    designWorktree(w, "a");
    git(w.main, "remote", "set-url", "origin", join(w.base, "nowhere.git"));
    const r = cleanup(w);
    expect(r.status).toBe(2);
    expect(r.json.error).toMatch(/fetch/);
  });
});

describe("cleanup.mjs --remove", () => {
  it("removes the worktree and its local branches, leaves the remote branch", () => {
    const w = world();
    const { path, branch } = designWorktree(w, "m");
    const tip = commit(path, "spec.md");
    git(path, "push", "-q", "origin", branch);
    w.setPrs([{ number: 7, head: branch, state: "merged", head_sha: tip }]);
    const r = cleanup(w, ["--remove", path]);
    expect(r.status).toBe(0);
    expect(r.json.removed).toEqual([{ path, branches: [branch] }]);
    expect(existsSync(path)).toBe(false);
    expect(git(w.main, "branch", "--list", branch)).toBe("");
    expect(git(w.main, "ls-remote", "--heads", "origin", branch)).not.toBe("");
  });

  it("removes a worktree holding gitignored files", () => {
    const w = world();
    const { path } = designWorktree(w, "a");
    mkdirSync(join(path, "node_modules"), { recursive: true });
    writeFileSync(join(path, "node_modules/x.js"), "x");
    expect(cleanup(w, ["--remove", path]).json.removed).toHaveLength(1);
    expect(existsSync(path)).toBe(false);
  });

  it("removes B and its slice branches when the worktree sits on a slice branch", () => {
    const w = world();
    const { path, branch } = designWorktree(w, "s");
    const feat = commit(path, "spec.md");
    git(path, "push", "-q", "origin", branch);
    const slice = `${branch}-slice-1-api`;
    git(path, "checkout", "-q", "-b", slice);
    const sliceTip = commit(path, "api.ts");
    git(path, "push", "-q", "origin", slice);
    w.setPrs([
      { number: 1, head: slice, state: "merged", head_sha: sliceTip },
      { number: 2, head: branch, state: "merged", head_sha: feat },
    ]);
    const r = cleanup(w, ["--remove", path]);
    expect(r.json.removed).toHaveLength(1);
    expect(r.json.removed[0].branches.sort()).toEqual([branch, slice].sort());
    expect(git(w.main, "branch", "--list", branch, slice)).toBe("");
    expect(git(w.main, "ls-remote", "--heads", "origin", branch)).not.toBe("");
    expect(git(w.main, "ls-remote", "--heads", "origin", slice)).not.toBe("");
  });

  it("re-checks: refuses a worktree that gained a commit since the listing", () => {
    const w = world();
    const { path } = designWorktree(w, "a");
    expect(at(cleanup(w).json, path).offered).toBe(true);
    commit(path, "spec.md");
    const r = cleanup(w, ["--remove", path]);
    expect(r.json.removed).toEqual([]);
    expect(r.json.refused).toEqual([{ path, why: "it is in progress" }]);
    expect(existsSync(path)).toBe(true);
  });

  it("removes only the offered one of two", () => {
    const w = world();
    const a = designWorktree(w, "a");
    const p = designWorktree(w, "p");
    commit(p.path, "spec.md");
    const r = cleanup(w, ["--remove", `${a.path},${p.path}`]);
    expect(r.json.removed.map((x: { path: string }) => x.path)).toEqual([a.path]);
    expect(r.json.refused.map((x: { path: string }) => x.path)).toEqual([p.path]);
  });

  it("refuses a path that is not a hitl worktree", () => {
    const w = world();
    const r = cleanup(w, ["--remove", join(w.base, "elsewhere")]);
    expect(r.status).toBe(0);
    expect(r.json.refused[0].why).toBe("not a hitl design-session worktree");
  });
});

/** A no-install world: register the worktree as the active feature, as /hitl:brainstorming does. */
function startSession(w: World, path: string, topic: string, base = "origin/main") {
  const r = spawnSync(
    process.execPath,
    [SESSION, "start", "--worktree", path, "--topic", topic, "--base", base],
    { encoding: "utf8", env: { ...ENV, HITL_HOME: w.home } },
  );
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(r.stdout).record as { created: string; topic: string };
}

function memoryDirOf(w: World): string {
  const r = spawnSync(
    process.execPath,
    [join(ROOT, "runtime/memory.mjs"), "key", "--repo", w.main],
    {
      encoding: "utf8",
      env: { ...ENV, HITL_HOME: w.home },
    },
  );
  return JSON.parse(r.stdout).dir;
}

/** A merged no-install feature: a pushed spec on the feature branch and its merged umbrella. */
function mergedFeature(w: World, topic = "x") {
  const { path, branch } = designWorktree(w, topic);
  const record = startSession(w, path, topic);
  mkdirSync(join(path, "docs/superpowers/specs"), { recursive: true });
  const tip = commit(path, "docs/superpowers/specs/2026-11-12-x-design.md");
  git(path, "push", "-q", "origin", branch);
  w.setPrs([{ number: 7, head: branch, state: "merged", head_sha: tip }]);
  return { path, branch, record, tip };
}

const plugin = (w: World) => ["--plugin-root", w.pluginRoot];

describe("cleanup.mjs — which PR shim", () => {
  it("exits 2 in a repository without an install and without --plugin-root", () => {
    const w = world("main", false);
    designWorktree(w, "a");
    const r = cleanup(w);
    expect(r.status).toBe(2);
    expect(r.json).toEqual({ error: "no PR shim: pass --plugin-root" });
  });

  it("uses the plugin's shim where nothing is installed", () => {
    const w = world("main", false);
    const { path } = designWorktree(w, "a");
    const r = cleanup(w, plugin(w));
    expect(r.status, r.stderr).toBe(0);
    expect(at(r.json, path)).toMatchObject({ class: "abandoned", offered: true });
  });

  it("keeps using the repository's own shim in an installed repository", () => {
    const w = world();
    const { path } = designWorktree(w, "a");
    const other = join(w.base, "other-plugin");
    failingShim(join(other, "runtime/pr/pr.sh"));
    const r = cleanup(w, ["--plugin-root", other]);
    expect(r.status, r.stderr).toBe(0);
    expect(at(r.json, path).class).toBe("abandoned");
  });
});

describe("cleanup.mjs — the wipe branch", () => {
  it("is one of a merged feature's branches and is removed with them", () => {
    const w = world("main", false);
    const { path, branch } = mergedFeature(w);
    git(w.main, "branch", `${branch}-wipe`, branch);
    git(w.main, "push", "-q", "origin", `${branch}-wipe`);
    const e = at(cleanup(w, plugin(w)).json, path);
    expect(e.class).toBe("merged");
    expect(e.branches.sort()).toEqual([branch, `${branch}-wipe`].sort());
    const r = cleanup(w, [...plugin(w), "--remove", path]);
    expect(r.json.removed[0].branches.sort()).toEqual([branch, `${branch}-wipe`].sort());
    expect(git(w.main, "branch", "--list", `${branch}-wipe`)).toBe("");
  });

  it("with a local commit on no remote is unsaved work", () => {
    const w = world("main", false);
    const { path, branch } = mergedFeature(w);
    git(path, "checkout", "-q", "-b", `${branch}-wipe`);
    commit(path, "wipe.md");
    git(path, "checkout", "-q", branch);
    const e = at(cleanup(w, plugin(w)).json, path);
    expect(e.class).toBe("has unsaved work");
    expect(e.unsaved.join(" ")).toContain(`${branch}-wipe`);
  });
});

describe("cleanup.mjs — documents that reached the base branch", () => {
  function archive(w: World, record: { created: string; topic: string }) {
    const dir = join(memoryDirOf(w), "features", `${record.created}-${record.topic}`, "specs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "2026-11-12-x-design.md"), "spec\n");
  }

  it("lists an archived document that exists on the base branch", () => {
    const w = world("main", false);
    const { path, record, tip } = mergedFeature(w);
    archive(w, record);
    git(w.main, "push", "-q", "origin", `${tip}:refs/heads/main`);
    const e = at(cleanup(w, plugin(w)).json, path);
    expect(e.class).toBe("merged");
    expect(e.docsOnBase).toEqual(["docs/superpowers/specs/2026-11-12-x-design.md"]);
    expect(e.base).toBe("origin/main");
  });

  it("is empty when the wipe merged first", () => {
    const w = world("main", false);
    const { path, record } = mergedFeature(w);
    archive(w, record);
    expect(at(cleanup(w, plugin(w)).json, path).docsOnBase).toEqual([]);
  });
});

describe("cleanup.mjs — the recorded base", () => {
  it("compares a no-install feature against its record's base, without origin/main", () => {
    const w = world("develop", false);
    const { path } = designWorktree(w, "d", "feat", "origin/develop");
    startSession(w, path, "d", "origin/develop");
    const r = cleanup(w, plugin(w));
    expect(r.status, JSON.stringify(r.json)).toBe(0);
    expect(at(r.json, path).class).toBe("abandoned");
  });
});

describe("cleanup.mjs --remove — the active-feature record", () => {
  it("clears the record of a removed no-install worktree and leaves the excludes", () => {
    const w = world("main", false);
    const { path } = mergedFeature(w);
    const exclude = join(w.main, ".git/info/exclude");
    const before = readFileSync(exclude);
    const r = cleanup(w, [...plugin(w), "--remove", path]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.json.removed[0].recordCleared).toBe(true);
    mkdirSync(path, { recursive: true });
    const get = spawnSync(process.execPath, [SESSION, "get", "--worktree", path], {
      encoding: "utf8",
      env: { ...ENV, HITL_HOME: w.home },
    });
    expect(get.status).toBe(3);
    expect(readFileSync(exclude)).toEqual(before);
  });

  it("touches no record in an installed repository", () => {
    const w = world();
    const { path, branch } = designWorktree(w, "m");
    const tip = commit(path, "spec.md");
    git(path, "push", "-q", "origin", branch);
    w.setPrs([{ number: 7, head: branch, state: "merged", head_sha: tip }]);
    const r = cleanup(w, ["--remove", path]);
    expect(r.json.removed).toEqual([{ path, branches: [branch] }]);
    expect(existsSync(join(w.home, "projects"))).toBe(false);
  });
});
