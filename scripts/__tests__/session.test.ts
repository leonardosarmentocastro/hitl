// scripts/__tests__/session.test.ts
// The active-feature record (one per registered worktree, under the project's memory) and the
// two local exclude entries, plus the repository's default branch.
import { execFileSync, spawnSync } from "node:child_process";
import {
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
import { beforeEach, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const CLI = join(ROOT, "runtime/session.mjs");
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" }).trim();
}

function tmp(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

let home: string;
beforeEach(() => {
  home = tmp("hitl-home-");
});

function cli(...args: string[]) {
  const r = spawnSync("node", [CLI, ...args], {
    encoding: "utf8",
    env: { ...GIT_ENV, HITL_HOME: home },
  });
  return { status: r.status, out: r.stdout ? JSON.parse(r.stdout) : null };
}

/** A bare remote whose default branch is `branch`, and `n` clones of it. */
function world(branch = "develop", n = 1) {
  const base = tmp("hitl-session-");
  const remote = join(base, "remote.git");
  git(base, "init", "-q", "--bare", "-b", branch, remote);
  const seed = join(base, "seed");
  git(base, "clone", "-q", remote, seed);
  git(seed, "commit", "-q", "--allow-empty", "-m", "init");
  git(seed, "push", "-q", "origin", `HEAD:${branch}`);
  const clones = Array.from({ length: n }, (_, i) => {
    const c = join(base, `clone${i}`);
    git(base, "clone", "-q", remote, c);
    return c;
  });
  return { base, remote, clones };
}

function today(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function exclude(repo: string): string {
  return join(repo, ".git/info/exclude");
}

describe("session.mjs base", () => {
  it("reports the remote's default branch", () => {
    const { clones } = world("develop");
    expect(cli("base", "--repo", clones[0])).toEqual({
      status: 0,
      out: { base: "origin/develop", branch: "develop" },
    });
  });

  it("asks the remote when origin/HEAD is not set locally", () => {
    const { clones } = world("develop");
    git(clones[0], "symbolic-ref", "-d", "refs/remotes/origin/HEAD");
    expect(cli("base", "--repo", clones[0]).out).toEqual({
      base: "origin/develop",
      branch: "develop",
    });
  });

  it("uses the main checkout's current branch with no remote", () => {
    const r = join(tmp("hitl-session-"), "solo");
    mkdirSync(r);
    git(r, "init", "-q", "-b", "trunk");
    git(r, "commit", "-q", "--allow-empty", "-m", "init");
    expect(cli("base", "--repo", r).out).toEqual({ base: "trunk", branch: "trunk" });
  });
});

describe("session.mjs start / get / end", () => {
  it("records the session with today's date and keeps the first date on a second start", () => {
    const { clones } = world();
    const wt = clones[0];
    const s = cli("start", "--worktree", wt, "--topic", "thing", "--base", "origin/develop");
    expect(s.status).toBe(0);
    expect(s.out.record).toEqual({
      worktree: wt,
      topic: "thing",
      base: "origin/develop",
      created: today(),
    });
    expect(cli("get", "--worktree", wt)).toEqual({ status: 0, out: { record: s.out.record } });

    // Rewrite the stored date to prove a second start keeps it.
    const g = cli("get", "--worktree", wt).out.record;
    const active = join(home, "projects");
    const files = execFileSync("find", [active, "-path", "*/active/*.json"], {
      encoding: "utf8",
    })
      .trim()
      .split("\n");
    expect(files).toHaveLength(1);
    writeFileSync(files[0], JSON.stringify({ ...g, created: "2020-01-02" }));
    const again = cli("start", "--worktree", wt, "--topic", "thing", "--base", "origin/develop");
    expect(again.out.record.created).toBe("2020-01-02");
  });

  it("is keyed by worktree path: a sibling clone of the same remote has no record", () => {
    const { clones } = world("develop", 2);
    cli("start", "--worktree", clones[0], "--topic", "t", "--base", "origin/develop");
    expect(cli("get", "--worktree", clones[1])).toEqual({
      status: 3,
      out: { refused: "no-record" },
    });
  });

  it("works from a linked worktree and forgets it once its folder is gone", () => {
    const { clones } = world();
    const wt = join(clones[0], ".claude/worktrees/thing");
    git(clones[0], "worktree", "add", "-q", wt, "-b", "feat/thing");
    expect(
      cli("start", "--worktree", wt, "--topic", "thing", "--base", "origin/develop").status,
    ).toBe(0);
    expect(cli("get", "--worktree", wt).status).toBe(0);
    rmSync(wt, { recursive: true, force: true });
    expect(cli("get", "--worktree", wt)).toEqual({ status: 3, out: { refused: "no-record" } });
  });

  it("creates the exclude file with both lines when it is absent", () => {
    const { clones } = world();
    rmSync(exclude(clones[0]), { force: true });
    const s = cli("start", "--worktree", clones[0], "--topic", "t", "--base", "origin/develop");
    expect(s.out.excluded).toEqual([".claude/worktrees/", ".claude/reviews/"]);
    expect(readFileSync(exclude(clones[0]), "utf8")).toBe(".claude/worktrees/\n.claude/reviews/\n");
  });

  it("appends on their own lines to a file without a trailing newline, and only once", () => {
    const { clones } = world();
    writeFileSync(exclude(clones[0]), "*.log");
    cli("start", "--worktree", clones[0], "--topic", "t", "--base", "origin/develop");
    expect(readFileSync(exclude(clones[0]), "utf8")).toBe(
      "*.log\n.claude/worktrees/\n.claude/reviews/\n",
    );
    const again = cli("start", "--worktree", clones[0], "--topic", "t", "--base", "origin/develop");
    expect(again.out.excluded).toEqual([]);
    expect(readFileSync(exclude(clones[0]), "utf8")).toBe(
      "*.log\n.claude/worktrees/\n.claude/reviews/\n",
    );
  });

  it("writes the exclude entries of the main repository from a linked worktree", () => {
    const { clones } = world();
    rmSync(exclude(clones[0]), { force: true });
    const wt = join(clones[0], ".claude/worktrees/thing");
    git(clones[0], "worktree", "add", "-q", wt, "-b", "feat/thing");
    cli("start", "--worktree", wt, "--topic", "thing", "--base", "origin/develop");
    expect(readFileSync(exclude(clones[0]), "utf8")).toBe(".claude/worktrees/\n.claude/reviews/\n");
    expect(git(clones[0], "status", "--porcelain")).toBe("");
  });

  it("refuses an installed repository and changes nothing", () => {
    const { clones } = world();
    mkdirSync(join(clones[0], ".claude"));
    writeFileSync(join(clones[0], ".claude/hitl.json"), "{}\n");
    const before = existsSync(exclude(clones[0])) ? readFileSync(exclude(clones[0]), "utf8") : null;
    expect(
      cli("start", "--worktree", clones[0], "--topic", "t", "--base", "origin/develop"),
    ).toEqual({ status: 3, out: { refused: "installed" } });
    const after = existsSync(exclude(clones[0])) ? readFileSync(exclude(clones[0]), "utf8") : null;
    expect(after).toBe(before);
    expect(existsSync(join(home, "projects"))).toBe(false);
  });

  it("clears the record once", () => {
    const { clones } = world();
    cli("start", "--worktree", clones[0], "--topic", "t", "--base", "origin/develop");
    expect(cli("end", "--worktree", clones[0])).toEqual({ status: 0, out: { cleared: true } });
    expect(cli("end", "--worktree", clones[0])).toEqual({ status: 0, out: { cleared: false } });
    expect(cli("get", "--worktree", clones[0]).status).toBe(3);
  });

  it("is a usage error without its arguments", () => {
    expect(cli("start", "--worktree", "/x").status).toBe(1);
    expect(cli("get").status).toBe(1);
    expect(cli("nope").status).toBe(1);
  });
});
