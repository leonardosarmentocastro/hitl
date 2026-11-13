// scripts/__tests__/wipe.test.ts
// The feature's documents: measured by merge-base, archived under project memory, and deleted
// by one generated commit on `<feature branch>-wipe`, whose draft PR is created or retargeted
// through the plugin's PR shim (here against a fake gh that keeps a small store of PRs).
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
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
import { archiveDocs, featureDocs, wipeCommit } from "../../runtime/wipe.mjs";

const ROOT = process.cwd();
const CLI = join(ROOT, "runtime/wipe.mjs");
const SESSION = join(ROOT, "runtime/session.mjs");
const SHIM = join(ROOT, "runtime/pr/pr.sh");
const FAKE_GH_DIR = join(ROOT, "scripts/__fixtures__/fake-gh");
const IDENTITY = {
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
};
const GIT_ENV = { ...process.env, ...IDENTITY };

beforeAll(() => {
  // wipeCommit runs git in this process; it needs an identity to write a commit.
  Object.assign(process.env, IDENTITY);
});

const OLD = "docs/superpowers/specs/2026-01-01-old-design.md";
const SPEC = "docs/superpowers/specs/2026-11-12-x-design.md";
const PLAN1 = "docs/superpowers/plans/2026-11-12-x-slice-1-a.md";
const HANDOVER = "docs/superpowers/handover/x.md";
const PLAN2 = "docs/superpowers/plans/2026-11-12-x-slice-2-b.md";
const FOUR = [HANDOVER, PLAN1, PLAN2, SPEC].sort();

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

function today(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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
let base: string;
let remote: string;
let repo: string;
let log: string;
let store: string;

/**
 * A bare origin and a clone: `main` carries an old spec; `feat/x` adds the spec, a plan and the
 * handover; `feat/x-slice-1-a` (checked out) adds a second plan. All pushed.
 */
beforeEach(() => {
  home = tmp("hitl-home-");
  base = tmp("hitl-wipe-");
  remote = join(base, "remote.git");
  git(base, "init", "-q", "--bare", "-b", "main", remote);
  repo = join(base, "repo");
  git(base, "clone", "-q", remote, repo);
  commit(repo, "init", OLD);
  git(repo, "push", "-q", "origin", "HEAD:main");
  git(repo, "checkout", "-q", "-b", "feat/x");
  commit(repo, "docs", SPEC, PLAN1, HANDOVER);
  git(repo, "push", "-q", "origin", "feat/x");
  git(repo, "checkout", "-q", "-b", "feat/x-slice-1-a");
  commit(repo, "slice", PLAN2, "src/a.txt");
  git(repo, "push", "-q", "origin", "feat/x-slice-1-a");
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

function start() {
  const r = spawnSync(
    "node",
    [SESSION, "start", "--worktree", repo, "--topic", "x", "--base", "origin/main"],
    { encoding: "utf8", env: env() },
  );
  expect(r.status, r.stderr).toBe(0);
}

function wipe(...args: string[]) {
  const r = spawnSync("node", [CLI, ...args], { cwd: repo, encoding: "utf8", env: env() });
  let out: unknown = null;
  try {
    out = r.stdout.trim() === "" ? null : JSON.parse(r.stdout);
  } catch {
    out = { unparsable: r.stdout };
  }
  return { status: r.status, out: out as Record<string, unknown>, stderr: r.stderr };
}

function build(parent: string, ...extra: string[]) {
  return wipe(
    "build",
    "--repo",
    repo,
    "--feature-branch",
    "feat/x",
    "--parent",
    parent,
    "--shim",
    SHIM,
    ...extra,
  );
}

function calls(): string[] {
  return readFileSync(log, "utf8").split("\n").filter(Boolean);
}

function archiveDir(): string {
  const key = JSON.parse(
    execFileSync("node", [join(ROOT, "runtime/memory.mjs"), "key", "--repo", repo], {
      encoding: "utf8",
      env: env(),
    }),
  ).dir;
  return join(key, "features", `${today()}-x`);
}

function filesIn(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name).slice(dir.length + 1))
    .sort();
}

const remoteSha = (ref: string) =>
  spawnSync("git", ["--git-dir", remote, "rev-parse", "--verify", "--quiet", ref], {
    encoding: "utf8",
  }).stdout.trim();

/** Remove the feature's documents from a branch, as a merged wipe PR would have. */
function dropDocs(branch: string) {
  git(repo, "checkout", "-q", branch);
  git(repo, "rm", "-q", "-r", SPEC, PLAN1, HANDOVER);
  git(repo, "commit", "-q", "-m", "wipe");
  git(repo, "push", "-q", "origin", branch);
}

function seedPr(pr: Record<string, unknown>) {
  const all = JSON.parse(readFileSync(store, "utf8"));
  all.push({
    url: `https://github.com/o/r/pull/${pr.number}`,
    isDraft: true,
    title: "t",
    body: "",
    headRefOid: "",
    reviews: [],
    comments: [],
    ...pr,
  });
  writeFileSync(store, JSON.stringify(all));
}

describe("featureDocs", () => {
  it("lists the documents added since the merge-base, never the base branch's own", () => {
    expect(featureDocs(repo, "feat/x-slice-1-a", "origin/main")).toEqual(FOUR);
    expect(featureDocs(repo, "feat/x", "origin/main")).toEqual([HANDOVER, PLAN1, SPEC].sort());
  });
});

describe("archiveDocs", () => {
  it("writes the files relative to docs/superpowers and removes stale ones", () => {
    const dest = join(tmp("hitl-arch-"), "features", "d-x");
    archiveDocs(repo, "feat/x-slice-1-a", FOUR, dest);
    expect(filesIn(dest)).toEqual(FOUR.map((f) => f.slice("docs/superpowers/".length)).sort());
    expect(readFileSync(join(dest, "plans/2026-11-12-x-slice-2-b.md"), "utf8")).toBe(`${PLAN2}\n`);
    archiveDocs(repo, "feat/x-slice-1-a", [SPEC], dest);
    expect(filesIn(dest)).toEqual(["specs/2026-11-12-x-design.md"]);
  });

  it("leaves the previous archive whole when a copy fails partway, and no temp folder", () => {
    const parent = join(tmp("hitl-arch-"), "features");
    const dest = join(parent, "d-x");
    archiveDocs(repo, "feat/x-slice-1-a", FOUR, dest);
    const missing = "docs/superpowers/plans/2026-11-12-x-slice-9-gone.md";
    expect(() => archiveDocs(repo, "feat/x-slice-1-a", [SPEC, missing], dest)).toThrow();
    expect(filesIn(dest)).toEqual(FOUR.map((f) => f.slice("docs/superpowers/".length)).sort());
    expect(readdirSync(parent)).toEqual(["d-x"]);
  });
});

describe("wipeCommit", () => {
  it("deletes exactly the files over the parent without touching the worktree", () => {
    put(repo, "src/dirty.txt", "uncommitted\n");
    const statusBefore = git(repo, "status", "--porcelain");
    const headBefore = git(repo, "rev-parse", "HEAD");
    const parent = git(repo, "rev-parse", "feat/x-slice-1-a");
    const sha = wipeCommit(repo, parent, FOUR);
    expect(git(repo, "diff", "--name-status", parent, sha).split("\n")).toEqual(
      FOUR.map((f) => `D\t${f}`),
    );
    expect(git(repo, "rev-parse", `${sha}^`)).toBe(parent);
    expect(git(repo, "log", "-1", "--format=%s", sha)).toBe(
      "chore(docs): wipe transient superpowers artifacts [skip ci]",
    );
    expect(git(repo, "status", "--porcelain")).toBe(statusBefore);
    expect(git(repo, "rev-parse", "HEAD")).toBe(headBefore);
  });
});

describe("wipe.mjs build", () => {
  it("builds one delete commit over the parent, pushes it and opens a draft PR", () => {
    start();
    const r = build("feat/x-slice-1-a");
    expect(r.status, r.stderr).toBe(0);
    expect(r.out).toMatchObject({ status: "built", branch: "feat/x-wipe", files: FOUR });
    expect(typeof r.out.pr).toBe("number");
    expect(r.out.archive).toBe(archiveDir());
    const tip = remoteSha("feat/x-wipe");
    expect(tip).not.toBe("");
    expect(git(repo, "rev-parse", `${tip}^`)).toBe(remoteSha("feat/x-slice-1-a"));
    git(repo, "cat-file", "-e", `${tip}:${OLD}`);
    const created = calls().filter((c) => c.startsWith("pr create"));
    expect(created).toHaveLength(1);
    expect(created[0]).toContain("--draft");
    expect(created[0]).toContain("--base feat/x-slice-1-a");
    expect(created[0]).toContain("--head feat/x-wipe");
    expect(created[0]).toContain("--title Wipe transient docs: feat/x");
    const pr = JSON.parse(readFileSync(store, "utf8"))[0];
    expect(pr.body).toBe(
      "Generated by hitl — do not edit; it is rebuilt on every run.\n\n" +
        "It deletes this feature's specs, plans and handover from the branch. They are transient: the\n" +
        "PR descriptions are the record. Merge this **last** — after every slice, and before the\n" +
        "umbrella PR. Fix-up rounds happen before it merges.\n",
    );
    expect(filesIn(archiveDir())).toEqual(
      FOUR.map((f) => f.slice("docs/superpowers/".length)).sort(),
    );
  });

  it("retargets the open PR when the parent changes, without a second create", () => {
    start();
    expect(build("feat/x-slice-1-a").status).toBe(0);
    const r = build("feat/x");
    expect(r.status, r.stderr).toBe(0);
    expect(r.out.status).toBe("built");
    const n = (JSON.parse(readFileSync(store, "utf8"))[0] as { number: number }).number;
    expect(r.out.pr).toBe(n);
    expect(calls()).toContain(`pr edit ${n} --base feat/x`);
    expect(calls().filter((c) => c.startsWith("pr create"))).toHaveLength(1);
    expect(git(repo, "rev-parse", `${remoteSha("feat/x-wipe")}^`)).toBe(remoteSha("feat/x"));
  });

  it("rebuilds as exactly one commit over the parent's new tip (force-pushed)", () => {
    start();
    expect(build("feat/x-slice-1-a").status).toBe(0);
    commit(repo, "more", "src/b.txt");
    git(repo, "push", "-q", "origin", "feat/x-slice-1-a");
    const r = build("feat/x-slice-1-a");
    expect(r.status, r.stderr).toBe(0);
    const tip = remoteSha("feat/x-wipe");
    expect(git(repo, "rev-parse", `${tip}^`)).toBe(remoteSha("feat/x-slice-1-a"));
    expect(calls().filter((c) => c.startsWith("pr edit"))).toHaveLength(0);
  });

  it("does nothing once the wipe PR merged and the documents are gone", () => {
    start();
    dropDocs("feat/x");
    seedPr({ number: 9, headRefName: "feat/x-wipe", baseRefName: "feat/x", state: "MERGED" });
    mkdirSync(archiveDir(), { recursive: true });
    writeFileSync(join(archiveDir(), "kept.md"), "kept\n");
    const r = build("feat/x");
    expect(r.status, r.stderr).toBe(0);
    expect(r.out).toEqual({ status: "merged", pr: 9 });
    expect(remoteSha("feat/x-wipe")).toBe("");
    expect(filesIn(archiveDir())).toEqual(["kept.md"]);
    expect(calls().filter((c) => /^pr (create|edit)/.test(c))).toEqual([]);
  });

  it("ignores a merged wipe PR of an earlier feature while documents remain", () => {
    start();
    seedPr({ number: 9, headRefName: "feat/x-wipe", baseRefName: "feat/x", state: "MERGED" });
    const r = build("feat/x-slice-1-a");
    expect(r.status, r.stderr).toBe(0);
    expect(r.out.status).toBe("built");
    expect(r.out.pr).not.toBe(9);
    expect(calls().filter((c) => c.startsWith("pr create"))).toHaveLength(1);
  });

  it("reports nothing-to-wipe when the parent carries no feature documents", () => {
    start();
    dropDocs("feat/x");
    const r = build("feat/x");
    expect(r.status, r.stderr).toBe(0);
    expect(r.out).toEqual({ status: "nothing-to-wipe" });
    expect(remoteSha("feat/x-wipe")).toBe("");
  });

  it("--no-push reports what it would build and changes nothing", () => {
    start();
    const r = build("feat/x-slice-1-a", "--no-push");
    expect(r.status, r.stderr).toBe(0);
    expect(r.out).toEqual({
      status: "would-build",
      branch: "feat/x-wipe",
      parent: "feat/x-slice-1-a",
      files: FOUR,
    });
    expect(remoteSha("feat/x-wipe")).toBe("");
    expect(
      spawnSync("git", ["-C", repo, "rev-parse", "--verify", "--quiet", "refs/heads/feat/x-wipe"])
        .status,
    ).not.toBe(0);
    expect(existsSync(archiveDir())).toBe(false);
    expect(calls().filter((c) => /^pr (create|edit)/.test(c))).toEqual([]);
  });

  it("refuses a feature branch that is the base branch, or a foreign parent", () => {
    start();
    const main = wipe(
      "build",
      "--repo",
      repo,
      "--feature-branch",
      "main",
      "--parent",
      "main",
      "--shim",
      SHIM,
    );
    expect(main.status).toBe(3);
    expect(main.out).toEqual({ refused: "bad-branch" });
    const other = build("other/branch");
    expect(other.status).toBe(3);
    expect(other.out).toEqual({ refused: "bad-branch" });
    const self = build("feat/x-wipe");
    expect(self.status).toBe(3);
    expect(self.out).toEqual({ refused: "bad-branch" });
    expect(remoteSha("main")).not.toBe("");
    expect(calls()).toEqual([]);
  });

  it("refuses without a record", () => {
    const r = build("feat/x-slice-1-a");
    expect(r.status).toBe(3);
    expect(r.out).toEqual({ refused: "no-record" });
  });
});

describe("wipe.mjs archive", () => {
  it("archives the documents at HEAD and makes no ref and no gh call", () => {
    start();
    const r = wipe("archive", "--repo", repo);
    expect(r.status, r.stderr).toBe(0);
    expect(r.out).toEqual({ status: "archived", archive: archiveDir(), files: FOUR });
    expect(filesIn(archiveDir())).toEqual(
      FOUR.map((f) => f.slice("docs/superpowers/".length)).sort(),
    );
    expect(
      spawnSync("git", ["-C", repo, "rev-parse", "--verify", "--quiet", "refs/heads/feat/x-wipe"])
        .status,
    ).not.toBe(0);
    expect(calls()).toEqual([]);
  });

  it("reports nothing-to-archive when HEAD has no feature documents", () => {
    start();
    git(repo, "checkout", "-q", "main");
    const r = wipe("archive", "--repo", repo);
    expect(r.status, r.stderr).toBe(0);
    expect(r.out).toEqual({ status: "nothing-to-archive" });
  });

  it("refuses without a record", () => {
    const r = wipe("archive", "--repo", repo);
    expect(r.status).toBe(3);
    expect(r.out).toEqual({ refused: "no-record" });
  });
});
