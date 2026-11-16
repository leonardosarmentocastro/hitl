// scripts/__tests__/wipe-core-gitlab.test.ts
// The wipe builder through the GitLab backend of the PR shim, against the fake GitLab: the
// origin's fetch URL is the fake (what the host rule reads); its push URL is a local bare
// repository (where the wipe branch is pushed).
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type FakeGitlab, gitlabShimDir, startFakeGitlab } from "./helpers/gitlab";

const ROOT = process.cwd();
const CLI = join(ROOT, "templates/scripts/wipe-core.mjs");
const IDENTITY = {
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
};
const EMPTY = { mergeRequests: [], approvals: {}, discussions: {} };

let fake: FakeGitlab;
let shim: string;
let repo: string;
let bare: string;

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    env: { ...process.env, ...IDENTITY },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function commit(msg: string, ...paths: string[]) {
  for (const p of paths) {
    mkdirSync(dirname(join(repo, p)), { recursive: true });
    writeFileSync(join(repo, p), `${p}\n`);
  }
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", msg);
}

beforeAll(async () => {
  fake = await startFakeGitlab(EMPTY);
  shim = gitlabShimDir();
});

afterAll(() => fake.stop());

beforeEach(() => {
  fake.setState(EMPTY);
  const base = realpathSync(mkdtempSync(join(tmpdir(), "hitl-wipe-gitlab-")));
  bare = join(base, "remote.git");
  git(base, "init", "-q", "--bare", "-b", "main", bare);
  repo = join(base, "repo");
  git(base, "init", "-q", "-b", "main", repo);
  git(repo, "remote", "add", "origin", `${fake.url}/g/r.git`);
  git(repo, "config", "remote.origin.pushurl", bare);
  commit("init", "README.md");
  git(repo, "checkout", "-q", "-b", "feat/x");
  commit("docs", "docs/superpowers/specs/2026-11-15-x-design.md", "docs/superpowers/handover/x.md");
});

function build(parent: string) {
  const r = spawnSync(
    "node",
    [
      CLI,
      "build",
      "--repo",
      repo,
      "--feature-branch",
      "feat/x",
      "--parent",
      parent,
      "--base",
      "main",
      "--shim",
      join(shim, "pr.sh"),
    ],
    {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, ...IDENTITY, GITLAB_URL: fake.url, GITLAB_TOKEN: "glpat-wipe" },
    },
  );
  return { status: r.status, out: JSON.parse(r.stdout), stderr: r.stderr };
}

describe("wipe-core build on GitLab", () => {
  it("opens one Draft MR labelled hitl and reports its ref", () => {
    const r = build("feat/x");
    expect(r.status, r.stderr).toBe(0);
    const mrs = fake.state().mergeRequests as Record<string, unknown>[];
    expect(mrs).toHaveLength(1);
    expect(mrs[0]).toMatchObject({
      source_branch: "feat/x-wipe",
      target_branch: "feat/x",
      draft: true,
      labels: ["hitl"],
    });
    expect(r.out).toMatchObject({ status: "built", pr: mrs[0].iid, ref: `!${mrs[0].iid}` });
    expect(git(bare, "rev-parse", "refs/heads/feat/x-wipe")).not.toBe("");
  });

  it("retargets the same MR on a second run after a new parent commit, opening no second one", () => {
    const first = build("feat/x");
    expect(first.status, first.stderr).toBe(0);
    git(repo, "checkout", "-q", "-b", "feat/x-slice-1-a");
    commit("slice", "src/a.txt");
    const r = build("feat/x-slice-1-a");
    expect(r.status, r.stderr).toBe(0);
    expect(r.out.pr).toBe(first.out.pr);
    expect(r.out.ref).toBe(first.out.ref);
    const mrs = fake.state().mergeRequests as Record<string, unknown>[];
    expect(mrs).toHaveLength(1);
    expect(mrs[0].target_branch).toBe("feat/x-slice-1-a");
  });
});
