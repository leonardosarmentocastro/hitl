// scripts/__tests__/cleanup.test.ts
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
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

/** A bare remote, a clone of it with one pushed commit on main, and the stub shim installed. */
function world() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "hitl-cleanup-")));
  const remote = join(base, "remote.git");
  git(base, "init", "-q", "--bare", "-b", "main", remote);
  const main = join(base, "main");
  git(base, "clone", "-q", remote, main);
  writeFileSync(join(main, ".gitignore"), ".claude/worktrees/\nnode_modules/\nscripts/hitl/\n");
  git(main, "add", ".gitignore");
  git(main, "commit", "-q", "-m", "init");
  git(main, "push", "-q", "origin", "HEAD:main");
  git(main, "fetch", "-q", "origin");
  mkdirSync(join(main, "scripts/hitl"), { recursive: true });
  copyFileSync(STUB, join(main, "scripts/hitl/pr.sh"));
  chmodSync(join(main, "scripts/hitl/pr.sh"), 0o755);
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
  return { base, main, prsFile, setPrs };
}
type World = ReturnType<typeof world>;

function designWorktree(w: World, topic: string, prefix = "feat") {
  const path = join(w.main, ".claude/worktrees", topic);
  const branch = `${prefix}/${topic}`;
  git(w.main, "worktree", "add", "-q", path, "-b", branch, "origin/main");
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
    env: { ...ENV, FAKE_PRS: w.prsFile, ...env },
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
});

describe("cleanup.mjs — failures offer nothing", () => {
  it("exits 2 when the PR shim fails", () => {
    const w = world();
    designWorktree(w, "a");
    const r = cleanup(w, [], { FAKE_PRS_FAIL: "1" });
    expect(r.status).toBe(2);
    expect(r.json.error).toMatch(/PR shim/);
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
