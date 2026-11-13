// scripts/__tests__/context.test.ts
// The one reader every no-install command calls: mode, host, memory, gates, record and base,
// with ordered refusals and a brief text block for prompts.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const CONTEXT = join(ROOT, "runtime/context.mjs");
const MEMORY = join(ROOT, "runtime/memory.mjs");
const SESSION = join(ROOT, "runtime/session.mjs");
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

function node(script: string, args: string[]) {
  const r = spawnSync("node", [script, ...args], {
    encoding: "utf8",
    env: { ...GIT_ENV, HITL_HOME: home },
  });
  return { status: r.status, stdout: r.stdout };
}

function context(repo: string, ...extra: string[]) {
  const r = node(CONTEXT, ["--repo", repo, "--plugin-root", ROOT, ...extra]);
  return { status: r.status, out: JSON.parse(r.stdout) };
}

function brief(repo: string, ...extra: string[]) {
  return node(CONTEXT, ["--repo", repo, "--plugin-root", ROOT, "--format", "brief", ...extra]);
}

/**
 * A clone of a local bare remote whose default branch is `develop`, with origin's url then
 * pointed at `url` (origin/HEAD stays set locally, so nothing asks the network).
 */
function clone(url = "git@github.com:Acme/API.git"): string {
  const base = tmp("hitl-context-");
  const remote = join(base, "remote.git");
  git(base, "init", "-q", "--bare", "-b", "develop", remote);
  const seed = join(base, "seed");
  git(base, "clone", "-q", remote, seed);
  git(seed, "commit", "-q", "--allow-empty", "-m", "init");
  git(seed, "push", "-q", "origin", "HEAD:develop");
  const c = join(base, "clone");
  git(base, "clone", "-q", remote, c);
  git(c, "remote", "set-url", "origin", url);
  return c;
}

function fact(repo: string, name: string, type: string, body: string) {
  const file = join(tmp("hitl-body-"), "body.md");
  writeFileSync(file, body);
  const r = node(MEMORY, [
    "write",
    "--repo",
    repo,
    "--name",
    name,
    "--type",
    type,
    "--description",
    `about ${name}`,
    "--body-file",
    file,
  ]);
  expect(r.status).toBe(0);
}

function installed(repo: string) {
  mkdirSync(join(repo, ".claude"), { recursive: true });
  writeFileSync(join(repo, ".claude/hitl.json"), "{}\n");
}

describe("context.mjs JSON", () => {
  it("reports a no-install GitHub repository with its memory and default base", () => {
    const r = clone();
    fact(r, "gates", "gates", "- `pnpm test`\n");
    const { status, out } = context(r);
    expect(status).toBe(0);
    expect(out).toEqual({
      mode: "no-install",
      host: "github",
      key: "github.com/acme/api",
      memoryDir: join(home, "projects/github.com/acme/api"),
      doctrine: join(ROOT, "doctrine/HITL.md"),
      prShim: join(ROOT, "runtime/pr/pr.sh"),
      gates: ["pnpm test"],
      facts: [
        { name: "gates", description: "about gates", type: "gates", body: "- `pnpm test`\n" },
      ],
      skipped: [],
      record: null,
      base: { base: "origin/develop", branch: "develop" },
    });
  });

  it("reports an installed repository, and --require no-install refuses it", () => {
    const r = clone();
    installed(r);
    expect(context(r).out.mode).toBe("installed");
    expect(context(r, "--require", "no-install")).toEqual({
      status: 3,
      out: { refused: "installed" },
    });
  });

  it("refuses a GitLab repository when GitHub is required", () => {
    const r = clone("git@gitlab.com:acme/api.git");
    expect(context(r, "--require", "github")).toEqual({
      status: 3,
      out: { refused: "not-github", host: "gitlab" },
    });
  });

  it("refuses without a gates fact when gates are required", () => {
    const r = clone();
    expect(context(r).out.gates).toBeNull();
    expect(context(r, "--require", "gates")).toEqual({ status: 3, out: { refused: "no-gates" } });
  });

  it("checks requirements in a fixed order, whatever order they are given in", () => {
    const r = clone("git@gitlab.com:acme/api.git");
    installed(r);
    expect(context(r, "--require", "gates,github,no-install").out).toEqual({
      refused: "installed",
    });
  });

  it("takes the key from upstream and the host from origin", () => {
    const r = clone("git@gitlab.com:me/api.git");
    git(r, "remote", "add", "upstream", "git@github.com:Acme/API.git");
    const { out } = context(r);
    expect(out.key).toBe("github.com/acme/api");
    expect(out.host).toBe("gitlab");
  });

  it("gives a linked worktree the same key as its main checkout, and its own record", () => {
    const r = clone();
    const wt = join(r, ".claude/worktrees/thing");
    git(r, "worktree", "add", "-q", wt, "-b", "feat/thing");
    expect(
      node(SESSION, ["start", "--worktree", wt, "--topic", "thing", "--base", "origin/develop"])
        .status,
    ).toBe(0);
    const fromWt = context(wt).out;
    expect(fromWt.key).toBe(context(r).out.key);
    expect(fromWt.record).toEqual(expect.objectContaining({ worktree: wt, topic: "thing" }));
    expect(context(r).out.record).toBeNull();
  });
});

describe("context.mjs --format brief", () => {
  it("prints the hitl context block", () => {
    const r = clone();
    const wt = join(r, ".claude/worktrees/thing");
    git(r, "worktree", "add", "-q", wt, "-b", "feat/thing");
    node(SESSION, ["start", "--worktree", wt, "--topic", "thing", "--base", "origin/develop"]);
    fact(r, "gates", "gates", "- `pnpm test`\n- `pnpm format:check`\n");
    fact(r, "screenshots", "pr-section", "Add before/after screenshots.\n");
    const b = brief(wt);
    expect(b.status).toBe(0);
    expect(b.stdout).toBe(
      [
        "## hitl context (no-install)",
        `Plugin root: ${ROOT}`,
        `Doctrine: ${join(ROOT, "doctrine/HITL.md")}`,
        `PR shim: ${join(ROOT, "runtime/pr/pr.sh")}`,
        "Host: github",
        "Base: develop",
        `Worktree: ${wt}`,
        "Gates:",
        "- `pnpm test`",
        "- `pnpm format:check`",
        "Project memory — this project's conventions, recorded by its user:",
        "### screenshots (pr-section)",
        "Add before/after screenshots.",
        "",
      ].join("\n"),
    );
  });

  it("says none for no gates, no record and no other fact, and names a GitLab host", () => {
    const r = clone("git@gitlab.com:acme/api.git");
    fact(r, "gates", "gates", "none\n");
    expect(context(r).out.gates).toEqual([]);
    const b = brief(r);
    expect(b.status).toBe(0);
    expect(b.stdout).toContain("\nHost: gitlab\n");
    expect(b.stdout).toContain("\nWorktree: none\n");
    expect(b.stdout).toContain("\nGates:\n- none\n");
    expect(b.stdout.endsWith("recorded by its user:\n(nothing recorded)\n")).toBe(true);
  });

  it("refuses without a gates fact even when gates are not required", () => {
    const r = clone();
    const b = brief(r);
    expect(b.status).toBe(3);
    expect(JSON.parse(b.stdout)).toEqual({ refused: "no-gates" });
  });
});
