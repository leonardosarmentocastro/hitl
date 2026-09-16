// scripts/__tests__/discover.test.ts
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hostOf } from "../../installer/discover.mjs";

const PLUGIN_ROOT = process.cwd();
const DISCOVER = join(PLUGIN_ROOT, "installer/discover.mjs");
const FIXTURES = join(PLUGIN_ROOT, "scripts/__fixtures__/discover");

/** Copy a fixture tree into a fresh git repository, optionally with an origin remote. */
function repoFrom(fixture: string, remote?: string) {
  const dir = mkdtempSync(join(tmpdir(), `hitl-discover-${fixture}-`));
  cpSync(join(FIXTURES, fixture), dir, { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  if (remote) execFileSync("git", ["remote", "add", "origin", remote], { cwd: dir });
  return dir;
}

function discover(dir: string) {
  const r = spawnSync("node", [DISCOVER, "--repo", dir], { encoding: "utf8" });
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(r.stdout);
}

const EMPTY_REPORT = {
  host: "unknown",
  remote: null,
  ci: [],
  e2e: [],
  hooks: [],
  scripts: {},
  testRunner: false,
  existing: {
    "CLAUDE.md": false,
    "AGENTS.md": false,
    "README.md": false,
    ".gitignore": false,
    ".claude/settings.json": false,
  },
};

describe("hostOf", () => {
  it.each([
    ["https://github.com/o/r.git", "github"],
    ["git@github.com:o/r.git", "github"],
    ["ssh://git@github.com/o/r.git", "github"],
    ["https://gitlab.com/o/r.git", "gitlab"],
    ["git@bitbucket.org:o/r.git", "bitbucket"],
    ["https://example.com/o/r.git", "unknown"],
    [null, "unknown"],
  ])("%s → %s", (remote, host) => {
    expect(hostOf(remote)).toBe(host);
  });
});

describe("discover.mjs", () => {
  it("prints the empty report for an empty tree without a remote", () => {
    expect(discover(repoFrom("empty"))).toEqual(EMPTY_REPORT);
  });

  it("reports the origin host and url", () => {
    const report = discover(repoFrom("empty", "git@github.com:o/r.git"));
    expect(report.host).toBe("github");
    expect(report.remote).toBe("git@github.com:o/r.git");
  });

  it.each([
    ["github-actions", "ci", ["github-actions"]],
    ["gitlab-ci", "ci", ["gitlab-ci"]],
    ["buildkite", "ci", ["buildkite"]],
    ["playwright", "e2e", ["playwright"]],
    ["cypress", "e2e", ["cypress"]],
    ["e2e-dir", "e2e", ["e2e-dir"]],
    ["lefthook", "hooks", ["lefthook"]],
    ["husky", "hooks", ["husky"]],
    ["pre-commit", "hooks", ["pre-commit"]],
  ])("fixture %s sets %s", (fixture, key, value) => {
    const report = discover(repoFrom(fixture));
    expect(report[key]).toEqual(value);
  });

  it("reads package.json scripts and marks a test script as a runner", () => {
    const report = discover(repoFrom("scripts"));
    expect(report.scripts).toEqual({ test: "vitest run", lint: "eslint .", build: "tsc" });
    expect(report.testRunner).toBe(true);
  });

  it("marks a runner config as a runner even without package.json", () => {
    expect(discover(repoFrom("vitest-config")).testRunner).toBe(true);
    expect(discover(repoFrom("pytest")).testRunner).toBe(true);
  });

  it("reports which appendable files exist", () => {
    expect(discover(repoFrom("existing")).existing).toEqual({
      "CLAUDE.md": true,
      "AGENTS.md": true,
      "README.md": true,
      ".gitignore": true,
      ".claude/settings.json": true,
    });
  });

  it("prints the report when started through a symlinked plugin path", () => {
    const link = join(mkdtempSync(join(tmpdir(), "hitl-discover-link-")), "plugin");
    symlinkSync(PLUGIN_ROOT, link);
    const r = spawnSync(
      "node",
      [join(link, "installer/discover.mjs"), "--repo", repoFrom("empty")],
      {
        encoding: "utf8",
      },
    );
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual(EMPTY_REPORT);
  });

  it("exits 1 with an error when --repo is not a directory", () => {
    const missing = join(mkdtempSync(join(tmpdir(), "hitl-discover-missing-")), "nope");
    const r = spawnSync("node", [DISCOVER, "--repo", missing], { encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(r.stderr).toBe("");
    expect(JSON.parse(r.stdout).error).toContain("--repo");
  });

  it("exits 1 with usage when --repo is missing", () => {
    const r = spawnSync("node", [DISCOVER], { encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout).error).toContain("--repo");
  });
});
