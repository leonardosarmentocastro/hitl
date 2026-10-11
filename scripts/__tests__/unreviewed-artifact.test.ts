import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const HOOK = join(process.cwd(), ".claude/hooks/unreviewed-artifact.sh");

function repoWith(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "hook-"));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(root, rel, ".."), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return root;
}

function runHook(root: string, stdin = "{}", cwd = root) {
  return spawnSync("bash", [HOOK], {
    cwd,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    input: stdin,
    encoding: "utf8",
  });
}

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
};

function git(cwd: string, ...args: string[]) {
  execFileSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" });
}

/** A repoWith that is also a git repository with one commit (files committed). */
function gitRepoWith(files: Record<string, string>): string {
  const root = repoWith(files);
  git(root, "init", "-q", "-b", "main");
  git(root, "add", "-A");
  git(root, "commit", "-q", "--allow-empty", "-m", "init");
  return root;
}

const payload = (cwd: string) => JSON.stringify({ hook_event_name: "Stop", cwd });

const REVIEWED = "# A spec\n\n**Reviewed:** round 1 (2026-09-06).\n\n## Goal\n";
const UNREVIEWED = "# A spec\n\n**Status:** draft.\n\n## Goal\n";

describe("unreviewed-artifact Stop hook", () => {
  it("refuses with exit 2 and names the unreviewed plan", () => {
    const root = repoWith({
      "docs/superpowers/specs/2026-09-06-x-design.md": REVIEWED,
      "docs/superpowers/plans/2026-09-06-x-slice-1-a.md": UNREVIEWED,
    });
    const r = runHook(root);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("docs/superpowers/plans/2026-09-06-x-slice-1-a.md");
    expect(r.stderr).not.toContain("x-design.md");
  });

  it("keeps refusing when stop_hook_active is true", () => {
    const root = repoWith({ "docs/superpowers/specs/2026-09-06-x-design.md": UNREVIEWED });
    const r = runHook(root, JSON.stringify({ hook_event_name: "Stop", stop_hook_active: true }));
    expect(r.status).toBe(2);
  });

  it("exits 0 when every artefact carries a Reviewed line", () => {
    const root = repoWith({
      "docs/superpowers/specs/2026-09-06-x-design.md": REVIEWED,
      "docs/superpowers/plans/2026-09-06-x-slice-1-a.md": REVIEWED,
    });
    expect(runHook(root).status).toBe(0);
  });

  it("accepts a failed or grandfathered line", () => {
    const root = repoWith({
      "docs/superpowers/specs/2026-09-06-x-design.md":
        "# A\n\n**Reviewed:** round 1 failed (2026-09-06) — reviewer returned nothing.\n",
      "docs/superpowers/plans/2026-09-06-x-slice-1-a.md":
        "# B\n\n**Reviewed:** grandfathered (2026-09-06).\n",
    });
    expect(runHook(root).status).toBe(0);
  });

  it("ignores a Reviewed line quoted in the body — only the header block counts", () => {
    const root = repoWith({
      "docs/superpowers/plans/2026-09-06-x-slice-1-a.md":
        "# A plan\n\n**Owns:** x.\n\n## Task 1\n\n```\n**Reviewed:** round 1 (2026-09-06).\n```\n",
    });
    const r = runHook(root);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("x-slice-1-a.md");
  });

  it("gates the payload's cwd, not CLAUDE_PROJECT_DIR", () => {
    const dirty = gitRepoWith({ "docs/superpowers/plans/2026-09-06-x-slice-1-a.md": UNREVIEWED });
    const clean = gitRepoWith({ "README.md": "hi\n" });
    expect(runHook(clean, payload(dirty)).status).toBe(2);
    expect(runHook(dirty, payload(clean)).status).toBe(0);
  });

  it("resolves a cwd below the repository root to the root", () => {
    const repo = gitRepoWith({
      "docs/superpowers/specs/2026-09-06-x-design.md": UNREVIEWED,
      "apps/web/README.md": "hi\n",
    });
    const clean = gitRepoWith({ "README.md": "hi\n" });
    const r = runHook(clean, payload(join(repo, "apps/web")));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("docs/superpowers/specs/2026-09-06-x-design.md");
  });

  it("gates a linked worktree on its own files, not the main checkout's", () => {
    const main = gitRepoWith({ "README.md": "hi\n" });
    const wt = join(main, ".claude/worktrees/topic");
    git(main, "worktree", "add", "-q", wt, "-b", "feat/topic");
    mkdirSync(join(main, "docs/superpowers/plans"), { recursive: true });
    writeFileSync(join(main, "docs/superpowers/plans/2026-09-06-y-slice-1-a.md"), UNREVIEWED);
    expect(runHook(main, payload(wt)).status).toBe(0);
    expect(runHook(main, payload(main)).status).toBe(2);
  });

  it("quotes a cwd with spaces", () => {
    const parent = mkdtempSync(join(tmpdir(), "hook sp-"));
    const repo = join(parent, "my repo");
    mkdirSync(join(repo, "docs/superpowers/specs"), { recursive: true });
    writeFileSync(join(repo, "docs/superpowers/specs/2026-09-06-x-design.md"), UNREVIEWED);
    git(repo, "init", "-q", "-b", "main");
    const clean = gitRepoWith({ "README.md": "hi\n" });
    expect(runHook(clean, payload(repo)).status).toBe(2);
  });

  it("exits 0 when there are no artefacts at all", () => {
    const root = repoWith({ "README.md": "hi\n" });
    expect(runHook(root).status).toBe(0);
  });

  it("is executable", () => {
    const root = repoWith({});
    expect(() =>
      execFileSync(HOOK, [], {
        cwd: root,
        env: { ...process.env, CLAUDE_PROJECT_DIR: root },
        encoding: "utf8",
      }),
    ).not.toThrow();
  });
});

/** A PATH holding only the tools the hook needs besides node. */
function pathWithoutNode(): string {
  const bin = mkdtempSync(join(tmpdir(), "bin-"));
  for (const tool of ["git", "awk", "cat", "dirname"]) {
    const where = execFileSync("bash", ["-c", `command -v ${tool}`], { encoding: "utf8" }).trim();
    symlinkSync(where, join(bin, tool));
  }
  return bin;
}

describe("fallback to CLAUDE_PROJECT_DIR", () => {
  const dirty = () =>
    gitRepoWith({ "docs/superpowers/plans/2026-09-06-x-slice-1-a.md": UNREVIEWED });
  const cleanRepo = () => gitRepoWith({ "README.md": "hi\n" });

  for (const [name, input] of [
    ["no payload", ""],
    ["a payload that is not JSON", "not json"],
    ["JSON that is not an object", "[]"],
    ["JSON null", "null"],
    ["a payload without cwd", JSON.stringify({ hook_event_name: "Stop" })],
    ["a cwd that is not a string", JSON.stringify({ cwd: 42 })],
  ] as const) {
    it(`falls back on ${name}`, () => {
      expect(runHook(dirty(), input).status).toBe(2);
    });
  }

  it("falls back when the cwd is not in a git repository", () => {
    const loose = repoWith({ "README.md": "hi\n" });
    expect(runHook(dirty(), payload(loose)).status).toBe(2);
  });

  it("falls back when the cwd no longer exists", () => {
    expect(runHook(dirty(), payload(join(tmpdir(), "gone-" + Date.now()))).status).toBe(2);
  });

  it("falls back when node is not on PATH", () => {
    const root = dirty();
    const r = spawnSync(
      execFileSync("bash", ["-c", "command -v bash"], { encoding: "utf8" }).trim(),
      [HOOK],
      {
        cwd: root,
        env: { ...process.env, PATH: pathWithoutNode(), CLAUDE_PROJECT_DIR: root },
        input: payload(cleanRepo()),
        encoding: "utf8",
      },
    );
    expect(r.status).toBe(2);
  });
});
