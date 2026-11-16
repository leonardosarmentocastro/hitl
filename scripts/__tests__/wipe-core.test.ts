// scripts/__tests__/wipe-core.test.ts
// The self-contained wipe builder: the feature's documents against an explicit base, one
// generated commit on `<feature branch>-wipe`, force-pushed, and its draft PR created or
// retargeted through the installed PR shim (here against a fake gh that keeps a store of PRs).
// No active-feature record and no memory folder are involved.
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildWipe } from "../../templates/scripts/wipe-core.mjs";

const ROOT = process.cwd();
const CLI = join(ROOT, "templates/scripts/wipe-core.mjs");
const SHIM = join(ROOT, "scripts/hitl/pr.sh");
const FAKE_GH_DIR = join(ROOT, "scripts/__fixtures__/fake-gh");
const IDENTITY = {
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
};
const GIT_ENV = { ...process.env, ...IDENTITY };

beforeAll(() => {
  // buildWipe runs git in this process; it needs an identity to write a commit.
  Object.assign(process.env, IDENTITY);
});

const OLD = "docs/superpowers/specs/2026-01-01-old-design.md";
const SPEC = "docs/superpowers/specs/2026-11-12-x-design.md";
const PLAN1 = "docs/superpowers/plans/2026-11-12-x-slice-1-a.md";
const HANDOVER = "docs/superpowers/handover/x.md";
const THREE = [HANDOVER, PLAN1, SPEC].sort();

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    env: GIT_ENV,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function tmp(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

function put(repo: string, path: string, text = `${path}\n`) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
}

function commit(repo: string, msg: string, ...paths: string[]) {
  for (const p of paths) put(repo, p);
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", msg);
}

let home: string;
let remote: string;
let repo: string;
let log: string;
let store: string;

/**
 * A bare origin and a clone: `main` carries an old spec; `feat/x` adds a spec, a plan and the
 * handover; `feat/y` adds only code. All pushed.
 */
beforeEach(() => {
  home = tmp("hitl-home-");
  const base = tmp("hitl-wipe-core-");
  remote = join(base, "remote.git");
  git(base, "init", "-q", "--bare", "-b", "main", remote);
  repo = join(base, "repo");
  git(base, "clone", "-q", remote, repo);
  commit(repo, "init", OLD);
  git(repo, "push", "-q", "origin", "HEAD:main");
  git(repo, "checkout", "-q", "-b", "feat/x");
  commit(repo, "docs", SPEC, PLAN1, HANDOVER);
  git(repo, "push", "-q", "origin", "feat/x");
  git(repo, "checkout", "-q", "-b", "feat/y", "main");
  commit(repo, "code", "src/y.txt");
  git(repo, "push", "-q", "origin", "feat/y");
  git(repo, "checkout", "-q", "feat/x");
  git(repo, "fetch", "-q", "origin");
  log = join(base, "gh.log");
  writeFileSync(log, "");
  store = join(base, "prs.json");
  writeFileSync(store, "[]");
});

function env() {
  return {
    ...GIT_ENV,
    HITL_HOME: home,
    PATH: `${FAKE_GH_DIR}:${process.env.PATH}`,
    FAKE_GH_LOG: log,
    FAKE_GH_MODE: "store",
    FAKE_GH_STORE: store,
  };
}

function core(...args: string[]) {
  const r = spawnSync("node", [CLI, ...args], { cwd: repo, encoding: "utf8", env: env() });
  let out: unknown = null;
  try {
    out = r.stdout.trim() === "" ? null : JSON.parse(r.stdout);
  } catch {
    out = { unparsable: r.stdout };
  }
  return { status: r.status, out: out as Record<string, unknown>, stderr: r.stderr };
}

function build(feature: string, parent: string, base = "main", ...extra: string[]) {
  return core(
    "build",
    "--repo",
    repo,
    "--feature-branch",
    feature,
    "--parent",
    parent,
    "--base",
    base,
    "--shim",
    SHIM,
    ...extra,
  );
}

function prs(): Array<Record<string, unknown>> {
  return JSON.parse(readFileSync(store, "utf8"));
}

const remoteSha = (ref: string) =>
  spawnSync("git", ["--git-dir", remote, "rev-parse", "--verify", "--quiet", ref], {
    encoding: "utf8",
  }).stdout.trim();

const localRef = (ref: string) =>
  spawnSync("git", ["-C", repo, "rev-parse", "--verify", "--quiet", ref]).status === 0;

describe("wipe-core build", () => {
  it("builds one delete commit over the parent, pushes it and opens one draft PR", () => {
    const r = build("feat/x", "feat/x");
    expect(r.status, r.stderr).toBe(0);
    expect(r.out).toMatchObject({ status: "built", branch: "feat/x-wipe", files: THREE });
    const tip = remoteSha("refs/heads/feat/x-wipe");
    expect(tip).not.toBe("");
    expect(git(repo, "rev-parse", `${tip}^`)).toBe(remoteSha("refs/heads/feat/x"));
    expect(git(repo, "rev-list", "--count", `${remoteSha("refs/heads/feat/x")}..${tip}`)).toBe("1");
    const tree = git(repo, "ls-tree", "-r", "--name-only", tip).split("\n");
    for (const f of THREE) expect(tree).not.toContain(f);
    expect(tree).toContain(OLD);
    const all = prs();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      headRefName: "feat/x-wipe",
      baseRefName: "feat/x",
      title: "Wipe transient docs: feat/x",
      isDraft: true,
    });
    expect(r.out.pr).toBe(all[0].number);
    expect(r.out.ref).toBe(`#${all[0].number}`);
  });

  it("reports merged with the wipe PR's number and ref once the documents are gone", () => {
    const first = build("feat/x", "feat/x");
    expect(first.status, first.stderr).toBe(0);
    const all = prs();
    all[0].state = "MERGED";
    writeFileSync(store, JSON.stringify(all));
    git(repo, "rm", "-q", ...THREE);
    git(repo, "commit", "-q", "-m", "wipe merged");
    git(repo, "push", "-q", "origin", "feat/x");
    git(repo, "fetch", "-q", "origin");
    const r = build("feat/x", "feat/x");
    expect(r.status, r.stderr).toBe(0);
    expect(r.out).toEqual({ status: "merged", pr: all[0].number, ref: `#${all[0].number}` });
  });

  it("needs and creates no record and no memory folder", () => {
    const r = build("feat/x", "feat/x");
    expect(r.status, r.stderr).toBe(0);
    expect(r.out).not.toHaveProperty("archive");
    expect(readdirSync(home)).toEqual([]);
  });

  it("gives the same files with --base origin/main", () => {
    const r = build("feat/x", "feat/x", "origin/main");
    expect(r.status, r.stderr).toBe(0);
    expect(r.out.files).toEqual(THREE);
  });

  it("reports nothing-to-wipe and makes no ref and no PR when nothing was added", () => {
    const r = build("feat/y", "feat/y");
    expect(r.status, r.stderr).toBe(0);
    expect(r.out).toEqual({ status: "nothing-to-wipe" });
    expect(remoteSha("refs/heads/feat/y-wipe")).toBe("");
    expect(localRef("refs/heads/feat/y-wipe")).toBe(false);
    expect(prs()).toEqual([]);
  });

  it("keeps the same PR on a second run with a new parent, retargets it and moves the ref", () => {
    const first = build("feat/x", "feat/x");
    expect(first.status, first.stderr).toBe(0);
    const firstTip = remoteSha("refs/heads/feat/x-wipe");
    git(repo, "checkout", "-q", "-b", "feat/x-slice-1-a");
    commit(repo, "slice", "src/a.txt");
    git(repo, "push", "-q", "origin", "feat/x-slice-1-a");
    const r = build("feat/x", "feat/x-slice-1-a");
    expect(r.status, r.stderr).toBe(0);
    expect(r.out.pr).toBe(first.out.pr);
    const all = prs();
    expect(all).toHaveLength(1);
    expect(all[0].baseRefName).toBe("feat/x-slice-1-a");
    const tip = remoteSha("refs/heads/feat/x-wipe");
    expect(tip).not.toBe(firstTip);
    expect(git(repo, "rev-parse", `${tip}^`)).toBe(remoteSha("refs/heads/feat/x-slice-1-a"));
  });

  it("--no-push reports what it would build and leaves no ref, no push and no PR", () => {
    const r = build("feat/x", "feat/x", "main", "--no-push");
    expect(r.status, r.stderr).toBe(0);
    expect(r.out).toEqual({
      status: "would-build",
      branch: "feat/x-wipe",
      parent: "feat/x",
      files: THREE,
    });
    expect(remoteSha("refs/heads/feat/x-wipe")).toBe("");
    expect(localRef("refs/heads/feat/x-wipe")).toBe(false);
    expect(prs()).toEqual([]);
  });

  it("refuses the wipe branch as parent, a foreign parent, and the base as feature branch", () => {
    for (const r of [
      build("feat/x", "feat/x-wipe"),
      build("feat/x", "other"),
      build("main", "main"),
      build("main", "main", "origin/main"),
    ]) {
      expect(r.status).toBe(3);
      expect(r.out).toEqual({ refused: "bad-branch" });
    }
    expect(prs()).toEqual([]);
  });

  it("exits 1 with a usage error when --base is missing", () => {
    const r = core(
      "build",
      "--repo",
      repo,
      "--feature-branch",
      "feat/x",
      "--parent",
      "feat/x",
      "--shim",
      SHIM,
    );
    expect(r.status).toBe(1);
    expect(typeof r.out.error).toBe("string");
  });

  it("exits 1 on an unknown verb", () => {
    const r = core("archive", "--repo", repo);
    expect(r.status).toBe(1);
  });
});

describe("buildWipe beforePush", () => {
  it("is called once with the parent tip and the files, and its object joins the output", () => {
    const seen: Array<[string, string[]]> = [];
    const saved = { ...process.env };
    Object.assign(process.env, env());
    try {
      const r = buildWipe({
        repo,
        featureBranch: "feat/x",
        parent: "feat/x",
        base: "main",
        shim: SHIM,
        beforePush: (parentTip: string, files: string[]) => {
          seen.push([parentTip, files]);
          expect(remoteSha("refs/heads/feat/x-wipe")).toBe("");
          return { archive: "x" };
        },
      });
      expect(r.code).toBe(0);
      expect(r.out).toMatchObject({ status: "built", archive: "x", files: THREE });
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
    }
    expect(seen).toEqual([[remoteSha("refs/heads/feat/x"), THREE]]);
  });
});
