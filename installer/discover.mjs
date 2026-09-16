#!/usr/bin/env node
// Reads the target repository and prints what /hitl:init's interview needs to know. Pure
// reader: the only git call is `git remote get-url origin`. Exit: 0 ok · 1 usage (or --repo is
// not a directory).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./lib.mjs";

const APPENDABLE = ["CLAUDE.md", "AGENTS.md", "README.md", ".gitignore", ".claude/settings.json"];

/** github | gitlab | bitbucket | unknown, from an https, ssh:// or scp-style remote url. */
export function hostOf(remote) {
  if (!remote) return "unknown";
  const m = remote.match(/^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^/:]+)[/:]/i);
  const host = (m?.[1] ?? "").toLowerCase();
  if (host === "github.com") return "github";
  if (host === "gitlab.com") return "gitlab";
  if (host === "bitbucket.org") return "bitbucket";
  return "unknown";
}

function originOf(repo) {
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], {
      cwd: repo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return url === "" ? null : url;
  } catch {
    return null;
  }
}

export function discover(repo) {
  const has = (p) => existsSync(join(repo, p));
  const topLevelMatches = (re) => readdirSync(repo).some((name) => re.test(name));

  const ci = [];
  if (has(".github/workflows")) ci.push("github-actions");
  if (has(".gitlab-ci.yml")) ci.push("gitlab-ci");
  if (has(".buildkite")) ci.push("buildkite");

  const e2e = [];
  if (topLevelMatches(/^playwright\.config\./)) e2e.push("playwright");
  if (has("cypress")) e2e.push("cypress");
  if (has("e2e")) e2e.push("e2e-dir");

  const hooks = [];
  if (has("lefthook.yml")) hooks.push("lefthook");
  if (has(".husky")) hooks.push("husky");
  if (has(".pre-commit-config.yaml")) hooks.push("pre-commit");

  let scripts = {};
  if (has("package.json")) {
    try {
      scripts = JSON.parse(readFileSync(join(repo, "package.json"), "utf8")).scripts ?? {};
    } catch {
      scripts = {};
    }
  }

  const pytestInPyproject =
    has("pyproject.toml") &&
    readFileSync(join(repo, "pyproject.toml"), "utf8").includes("[tool.pytest");
  const testRunner =
    "test" in scripts ||
    topLevelMatches(/^vitest\.config\./) ||
    topLevelMatches(/^jest\.config\./) ||
    has("pytest.ini") ||
    pytestInPyproject ||
    has("go.mod");

  const remote = originOf(repo);
  return {
    host: hostOf(remote),
    remote,
    ci,
    e2e,
    hooks,
    scripts,
    testRunner,
    existing: Object.fromEntries(APPENDABLE.map((p) => [p, has(p)])),
  };
}

/** True when `dir` is an existing directory. */
function isDirectory(dir) {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

// Compare realpaths: Node resolves symlinks in import.meta.url but not in argv[1], and
// import.meta.main needs Node 24 while the target is Node 20.
const isMain =
  process.argv[1] !== undefined &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (!args?.repo || !isDirectory(args.repo)) {
    process.stdout.write(`${JSON.stringify({ error: "usage: --repo <dir>" })}\n`);
    process.exit(1);
  }
  process.stdout.write(`${JSON.stringify(discover(args.repo), null, 2)}\n`);
}
