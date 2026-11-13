// scripts/__tests__/plugin-stop-hook.test.ts
// The plugin's own Stop hook: it guards only a worktree registered by /hitl:brainstorming in a
// repository without hitl installed, only on the specs and plans the feature added, and is
// silent everywhere else. Its header rule is the installed hook's (the shared table below).
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const HOOK = join(ROOT, "runtime/stop-hook.sh");
const INSTALLED_HOOK = join(ROOT, ".claude/hooks/unreviewed-artifact.sh");
const SESSION = join(ROOT, "runtime/session.mjs");

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

function tmp(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

function write(root: string, files: Record<string, string>) {
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(root, rel, ".."), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
}

function commitAll(root: string, message = "change") {
  git(root, "add", "-A");
  git(root, "commit", "-q", "--allow-empty", "-m", message);
}

/** A git repository on `main` with one commit holding `files`. */
function gitRepoWith(files: Record<string, string>): string {
  const root = tmp("plugin-hook-");
  write(root, files);
  git(root, "init", "-q", "-b", "main");
  commitAll(root, "init");
  return root;
}

let home: string;
beforeEach(() => {
  home = tmp("hitl-home-");
});

/** Register `root` as the active feature, as /hitl:brainstorming does. */
function register(root: string, base: string) {
  execFileSync("node", [SESSION, "start", "--worktree", root, "--topic", "x", "--base", base], {
    env: { ...GIT_ENV, HITL_HOME: home },
    encoding: "utf8",
  });
}

/** A repository whose `main` holds `mainFiles`, and a registered worktree on `feat/x`. */
function featureWorktree(
  mainFiles: Record<string, string> = { "README.md": "hi\n" },
  base = "main",
) {
  const main = gitRepoWith(mainFiles);
  const wt = join(main, ".claude/worktrees/x");
  git(main, "worktree", "add", "-q", wt, "-b", "feat/x");
  register(wt, base);
  return { main, wt };
}

function runHook(
  hook: string,
  opts: { stdin: string; cwd?: string; projectDir?: string; hitlHome?: string; path?: string },
) {
  const env: Record<string, string | undefined> = {
    ...process.env,
    HITL_HOME: opts.hitlHome ?? home,
  };
  if (opts.path !== undefined) env.PATH = opts.path;
  if (opts.projectDir === undefined) delete env.CLAUDE_PROJECT_DIR;
  else env.CLAUDE_PROJECT_DIR = opts.projectDir;
  return spawnSync("bash", [hook], {
    cwd: opts.cwd ?? tmpdir(),
    env,
    input: opts.stdin,
    encoding: "utf8",
  });
}

const payload = (cwd: string) => JSON.stringify({ hook_event_name: "Stop", cwd });
const plugin = (cwd: string) => runHook(HOOK, { stdin: payload(cwd), cwd });

const SPEC = "docs/superpowers/specs/2026-01-01-x-design.md";
const PLAN = "docs/superpowers/plans/2026-01-01-x-slice-1-a.md";
const OLD_SPEC = "docs/superpowers/specs/2025-01-01-old-design.md";
const REVIEWED = "# A spec\n\n**Reviewed:** round 1 (2026-01-01).\n\n## Goal\n";
const UNREVIEWED = "# A spec\n\n**Status:** draft.\n\n## Goal\n";
const BELOW = "# A spec\n\n## Goal\n\n**Reviewed:** round 1 (2026-01-01).\n";

describe("plugin Stop hook", () => {
  it("exits 0 without starting node when HITL_HOME has no projects directory", () => {
    const { wt } = featureWorktree();
    write(wt, { [SPEC]: UNREVIEWED });
    // A fake `node` first on PATH leaves a marker if the hook starts it at all.
    const bin = tmp("fake-node-");
    const marker = join(bin, "node-ran");
    writeFileSync(join(bin, "node"), `#!/bin/sh\ntouch '${marker}'\nexit 1\n`, { mode: 0o755 });
    const r = runHook(HOOK, {
      stdin: payload(wt),
      cwd: wt,
      hitlHome: tmp("hitl-empty-"),
      path: `${bin}${delimiter}${process.env.PATH ?? ""}`,
    });
    expect(r.status).toBe(0);
    expect(existsSync(marker)).toBe(false);
  });

  it("refuses a feature spec without the line, naming it and /hitl:review-spec", () => {
    const { wt } = featureWorktree();
    write(wt, { [SPEC]: UNREVIEWED });
    commitAll(wt);
    const r = plugin(wt);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(SPEC);
    expect(r.stderr).toContain("/hitl:review-spec");
  });

  it("exits 0 when the feature spec carries the line in its header", () => {
    const { wt } = featureWorktree();
    write(wt, { [SPEC]: REVIEWED });
    commitAll(wt);
    expect(plugin(wt).status).toBe(0);
  });

  it("refuses when the line is only below the first ## heading", () => {
    const { wt } = featureWorktree();
    write(wt, { [SPEC]: BELOW });
    commitAll(wt);
    expect(plugin(wt).status).toBe(2);
  });

  it("ignores an un-marked spec the base branch already carried", () => {
    const { wt } = featureWorktree({ [OLD_SPEC]: UNREVIEWED });
    expect(plugin(wt).status).toBe(0);
  });

  it("names only the feature's new plan, not the base branch's old spec", () => {
    const { wt } = featureWorktree({ [OLD_SPEC]: UNREVIEWED });
    write(wt, { [PLAN]: UNREVIEWED });
    commitAll(wt);
    const r = plugin(wt);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(PLAN);
    expect(r.stderr).not.toContain(OLD_SPEC);
  });

  it("refuses an untracked new spec", () => {
    const { wt } = featureWorktree();
    write(wt, { [SPEC]: UNREVIEWED });
    expect(plugin(wt).status).toBe(2);
  });

  it("exits 0 in an installed repository even with a record", () => {
    const { wt } = featureWorktree();
    write(wt, { ".claude/hitl.json": "{}\n", [SPEC]: UNREVIEWED });
    expect(plugin(wt).status).toBe(0);
  });

  it("exits 0 when there is no record for this path", () => {
    const repo = gitRepoWith({ "README.md": "hi\n" });
    write(repo, { [SPEC]: UNREVIEWED });
    register(gitRepoWith({ "README.md": "hi\n" }), "main");
    expect(plugin(repo).status).toBe(0);
  });

  it("does not gate the main checkout on its worktree's record", () => {
    const { main } = featureWorktree();
    write(main, { [SPEC]: UNREVIEWED });
    expect(plugin(main).status).toBe(0);
  });

  it("stays live on a slice branch checked out in the registered worktree", () => {
    const { wt } = featureWorktree();
    git(wt, "checkout", "-q", "-b", "feat/x-slice-1-a");
    write(wt, { [PLAN]: UNREVIEWED });
    commitAll(wt);
    const r = plugin(wt);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(PLAN);
  });

  it("checks every spec and plan, and says so, when the base ref is not found", () => {
    const { wt } = featureWorktree({ [OLD_SPEC]: UNREVIEWED }, "origin/nope");
    const r = plugin(wt);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(OLD_SPEC);
    expect(r.stderr).toContain("was not found locally");
  });

  it("says the base shares no history, not that it is missing, when there is no merge-base", () => {
    const { main, wt } = featureWorktree({ [OLD_SPEC]: UNREVIEWED }, "other");
    git(main, "checkout", "-q", "--orphan", "other");
    commitAll(main, "unrelated");
    const r = plugin(wt);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(OLD_SPEC);
    expect(r.stderr).not.toContain("was not found locally");
    expect(r.stderr).toContain("shares no history");
    expect(r.stderr).toContain("git fetch --unshallow");
  });

  it("exits 0 when the cwd is not a git folder", () => {
    featureWorktree();
    const loose = tmp("plugin-loose-");
    expect(plugin(loose).status).toBe(0);
  });

  it("falls back to CLAUDE_PROJECT_DIR when stdin is not JSON", () => {
    const { wt } = featureWorktree();
    write(wt, { [SPEC]: UNREVIEWED });
    const r = runHook(HOOK, { stdin: "not json", projectDir: wt, cwd: tmp("plugin-loose-") });
    expect(r.status).toBe(2);
  });

  it("is executable", () => {
    const { wt } = featureWorktree();
    expect(() =>
      execFileSync(HOOK, [], {
        cwd: wt,
        env: { ...process.env, HITL_HOME: home, CLAUDE_PROJECT_DIR: wt },
        input: payload(wt),
        encoding: "utf8",
      }),
    ).not.toThrow();
  });

  it("is declared as the plugin's Stop hook", () => {
    const hooks = JSON.parse(readFileSync(join(ROOT, "hooks/hooks.json"), "utf8"));
    expect(hooks).toEqual({
      hooks: {
        Stop: [
          {
            hooks: [{ type: "command", command: '"${CLAUDE_PLUGIN_ROOT}/runtime/stop-hook.sh"' }],
          },
        ],
      },
    });
  });
});

describe("shared header rule with the installed hook", () => {
  const FIXTURES: [string, string][] = [
    ["line in the header", REVIEWED],
    ["line after the first ##", BELOW],
    [
      "line inside a fenced block in the header",
      "# A spec\n\n```\n**Reviewed:** round 1 (2026-01-01).\n```\n\n## Goal\n",
    ],
    ["round 1 failed", "# A spec\n\n**Reviewed:** round 1 failed (2026-01-01) — nothing.\n"],
    ["no title", "**Reviewed:** round 1 (2026-01-01).\n\n## Goal\n"],
  ];

  for (const [name, content] of FIXTURES) {
    it(`agrees on: ${name}`, () => {
      const plain = tmp("installed-hook-");
      write(plain, { [SPEC]: content });
      const installed = runHook(INSTALLED_HOOK, { stdin: "{}", cwd: plain, projectDir: plain });

      const { wt } = featureWorktree();
      write(wt, { [SPEC]: content });
      const ours = plugin(wt);

      expect([0, 2]).toContain(installed.status);
      expect(ours.status).toBe(installed.status);
    });
  }
});
