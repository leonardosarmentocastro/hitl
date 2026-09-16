# hitl v1 — slice 3: discovery and interview

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Owns:** `discover.mjs`; the five testing fragments and `## Testing and gates` in `HITL.md`; `## Local gates` in `AGENTS.md`; wipe-wrapper selection; the interview in `commands/init.md` producing `ci`, `testing` and `gates`; the `AGENTS.md` hitl block, in this repository too.

**Reviewed:** round 1 (2026-09-16) · round 2 (2026-09-16).

**Goal:** `/hitl:init` reads the target repository, asks one question per finding, and renders `HITL.md`, the wipe workflow and `AGENTS.md` from the answers instead of from flags.

**Architecture:** `installer/discover.mjs` is a pure reader that prints one JSON report of what the tree contains; the `/hitl:init` prompt turns each finding into a question and collects the answers JSON that slice 1's `render.mjs` already accepts. `composeHitl` (slice 1) gains its fragment files under `templates/testing/`, and `render.mjs` gains the `AGENTS.md` block through the same `withMarkerBlock` helper the README and `.gitignore` blocks use. A `--mode check` on `render.mjs` lets the prompt refuse before it interviews.

**Tech Stack:** Node 24 ESM with zero dependencies (targets Node 20+), vitest, Claude Code plugin command prompt.

**Spec:** `docs/superpowers/specs/2026-09-16-hitl-v1-design.md`

## Global Constraints

- Every behaviour change is test-first: failing test, run red, minimal code, run green, commit. Gates before the PR: `pnpm test` and `pnpm format:check`.
- Installer scripts are Node ESM under `installer/`, no dependencies, target Node 20 or newer; they never run `git` to change state (`git remote get-url` is a read) and never call the PR shim.
- Fragments are **principle text only**: nothing implementation-shaped (no port, folder, library, command). `.storybook/` is not discovered.
- The owned-file list is unchanged by this slice: fragments compose `HITL.md`, they are not owned files. The manifest records `testing` and `ci`, never `gates`.
- Choices shape stays `{ provider, ci, testing, gates }`; `render.mjs` keeps its exit contract (0 ok · 1 usage · 2 error · 3 refused) and its stdout JSON.
- Tests that read the disk use temp directories or `scripts/__fixtures__/`, never `docs/superpowers/`. Fixture directories carry a `.keep` file where an empty directory is needed, because git does not track empty directories.
- Markdown is never formatted; the drift test from slice 1 must stay green (this slice changes no template that this repository owns a copy of, except through `AGENTS.md`, which the drift test does not compare byte for byte).
- **Tripwire:** this slice exceeds ~20 files because each discovery rule gets its own one-file fixture tree (fourteen trees). They are the test data of one capability and are not split.

---

## File structure

| Path | Responsibility |
|---|---|
| `installer/lib.mjs` | gains `parseArgs` (moved from `render.mjs`), `agentsBlock(gates, testing)`, `DEFAULT_CHOICES` |
| `installer/render.mjs` | gains `--mode check`; appends the `AGENTS.md` block |
| `installer/discover.mjs` | CLI `--repo <dir>`; prints the discovery report |
| `templates/testing/{e2e,tiers,ci,hooks,effective-date}.md` | the five principle fragments |
| `scripts/__fixtures__/discover/<case>/…` | one fixture tree per detection rule plus `empty/` |
| `scripts/__tests__/discover.test.ts` | discovery: host, ci, e2e, hooks, scripts, testRunner, existing |
| `scripts/__tests__/lib.test.ts` | append: `composeHitl`, `agentsBlock`, `parseArgs` |
| `scripts/__tests__/render.test.ts` | append: `--mode check`, the `AGENTS.md` block |
| `scripts/__tests__/drift.test.ts` | append: this repository's `AGENTS.md` carries the block |
| `AGENTS.md` | this repository's `## Local gates` moved inside the hitl block |
| `commands/init.md` | discovery, interview, answers, render |

Every task runs from the repository root on branch `feat/hitl-v1-slice-3-discovery-and-interview`, cut from `feat/hitl-v1-slice-2-pr-shim`.

---

### Task 1: `parseArgs` moves to `lib.mjs`; `render.mjs --mode check` refuses without writing

**Files:**
- Modify: `installer/lib.mjs` (add `parseArgs`, `DEFAULT_CHOICES`)
- Modify: `installer/render.mjs` (import `parseArgs`; `--mode check`; answers optional in check mode)
- Test: `scripts/__tests__/lib.test.ts` (append), `scripts/__tests__/render.test.ts` (append)

**Interfaces:**
- Consumes: `render.mjs` `run(args)` and its refusal branches from slice 1.
- Produces: `parseArgs(argv: string[]): Record<string, string> | null` exported from `lib.mjs` (so `discover.mjs` can import it without executing `render.mjs`'s main); `DEFAULT_CHOICES = { provider: "github", ci: "github-actions", testing: [], gates: [] }`; `node installer/render.mjs --repo <dir> --plugin-root <dir> --mode check [--answers <file>]` → exit 0 `{ "ok": true }` with nothing written, or exit 3 with the same refusal JSON as a write would give. `--mode write` is the default.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/__tests__/lib.test.ts`:

```ts
import { DEFAULT_CHOICES, parseArgs } from "../../installer/lib.mjs";

describe("parseArgs", () => {
  it("reads --key value pairs", () => {
    expect(parseArgs(["--repo", "/r", "--mode", "check"])).toEqual({ repo: "/r", mode: "check" });
  });
  it("returns null on a dangling flag or a non-flag token", () => {
    expect(parseArgs(["--repo"])).toBeNull();
    expect(parseArgs(["repo", "/r"])).toBeNull();
  });
  it("exposes the default choices used by check mode", () => {
    expect(DEFAULT_CHOICES).toEqual({ provider: "github", ci: "github-actions", testing: [], gates: [] });
  });
});
```

Append to `scripts/__tests__/render.test.ts` (helpers `tempRepo`, `render`, `tree`, `PLUGIN_ROOT`, `RENDER` are in scope):

```ts
function check(repo: string) {
  const r = spawnSync("node", [RENDER, "--repo", repo, "--plugin-root", PLUGIN_ROOT, "--mode", "check"], {
    encoding: "utf8",
  });
  return { ...r, json: r.stdout ? JSON.parse(r.stdout) : null };
}

describe("render.mjs --mode check", () => {
  it("reports ok on a clean repository and writes nothing", () => {
    const repo = tempRepo({ "README.md": "# app\n" });
    const before = tree(repo);
    const r = check(repo);
    expect(r.status).toBe(0);
    expect(r.json).toEqual({ ok: true });
    expect(tree(repo)).toEqual(before);
  });

  it("refuses on a collision with the same JSON as a write would, and writes nothing", () => {
    const repo = tempRepo({ "HITL.md": "x\n" });
    const r = check(repo);
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "collision", paths: ["HITL.md"] });
    expect(tree(repo)).toEqual(["HITL.md"]);
  });

  it("refuses on a present manifest", () => {
    const repo = tempRepo();
    render(repo);
    expect(check(repo).json).toEqual({ refused: "manifest-present", version: "0.1.0" });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test -- scripts/__tests__/lib.test.ts scripts/__tests__/render.test.ts`
Expected: FAIL — `parseArgs` and `DEFAULT_CHOICES` are not exported from `lib.mjs`; `--mode check` is treated as an unknown pair and `--answers` is missing, so the check tests get exit 1.

- [ ] **Step 3: Move `parseArgs` and add `DEFAULT_CHOICES` to `installer/lib.mjs`**

```js
export const DEFAULT_CHOICES = { provider: "github", ci: "github-actions", testing: [], gates: [] };

/** `--key value` pairs → object; null on a dangling flag or a token without `--`. */
export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--") || value === undefined) return null;
    args[key.slice(2)] = value;
  }
  return args;
}
```

- [ ] **Step 4: Update `installer/render.mjs`**

Delete its local `parseArgs`, add `DEFAULT_CHOICES` and `parseArgs` to the import from `./lib.mjs`, and replace the start of `run` up to the settings check with:

```js
const USAGE = "usage: --repo <dir> --plugin-root <dir> [--mode write|check] [--answers <file>]";

export function run(args) {
  const { repo, "plugin-root": pluginRoot, answers: answersPath } = args;
  const mode = args.mode ?? "write";
  if (!repo || !pluginRoot || !["write", "check"].includes(mode)) return { code: 1, out: { error: USAGE } };
  if (mode === "write" && !answersPath) return { code: 1, out: { error: USAGE } };
  const choices = answersPath ? JSON.parse(readFileSync(answersPath, "utf8")) : DEFAULT_CHOICES;
  const version = pluginVersion(pluginRoot);

  // Refusals, all before the first write.
  const manifest = readManifest(repo);
  if (manifest) return { code: 3, out: { refused: "manifest-present", version: manifest.version } };
  const hits = collisions(repo, choices);
  if (hits.length > 0) return { code: 3, out: { refused: "collision", paths: hits } };
  const settingsPath = join(repo, ".claude/settings.json");
  let settings;
  try {
    const hookEntry = JSON.parse(readFileSync(join(pluginRoot, "templates/claude/settings.hook.json"), "utf8"));
    settings = mergeSettings(readIfPresent(settingsPath), hookEntry);
  } catch (e) {
    return { code: 3, out: { refused: "settings-unparsable", error: String(e.message) } };
  }
  if (mode === "check") return { code: 0, out: { ok: true } };
```

and the bottom of the file:

```js
const args = parseArgs(process.argv.slice(2));
const result = args ? run(args) : { code: 1, out: { error: USAGE } };
process.stdout.write(`${JSON.stringify(result.out, null, 2)}\n`);
process.exit(result.code);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test -- scripts/__tests__/lib.test.ts scripts/__tests__/render.test.ts`
Expected: PASS (the slice 1 tests still green, plus 3 + 3 new).

- [ ] **Step 6: Commit**

```bash
git add installer/lib.mjs installer/render.mjs scripts/__tests__/lib.test.ts scripts/__tests__/render.test.ts
git commit -m "feat(installer): render.mjs --mode check; parseArgs shared in lib"
```

---

### Task 2: `discover.mjs` and its fixture trees

**Files:**
- Create: `installer/discover.mjs`
- Create: `scripts/__fixtures__/discover/empty/.keep`, `github-actions/.github/workflows/ci.yml`, `gitlab-ci/.gitlab-ci.yml`, `buildkite/.buildkite/pipeline.yml`, `playwright/playwright.config.ts`, `cypress/cypress/e2e/.keep`, `e2e-dir/e2e/.keep`, `lefthook/lefthook.yml`, `husky/.husky/pre-commit`, `pre-commit/.pre-commit-config.yaml`, `scripts/package.json`, `vitest-config/vitest.config.ts`, `pytest/pyproject.toml`, `existing/CLAUDE.md`, `existing/AGENTS.md`, `existing/README.md`, `existing/.gitignore`, `existing/.claude/settings.json`
- Test: `scripts/__tests__/discover.test.ts`

**Interfaces:**
- Consumes: `parseArgs` from Task 1.
- Produces: `node installer/discover.mjs --repo <dir>` → exit 0 and the report `{ host, remote, ci, e2e, hooks, scripts, testRunner, existing }` exactly as the spec's step 4 shows; `discover(repoRoot)` and `hostOf(remote)` exported for tests.

- [ ] **Step 1: Create the fixture trees**

Each fixture file's content is the smallest thing that makes the rule fire:

```bash
F=scripts/__fixtures__/discover
mkdir -p $F/empty $F/github-actions/.github/workflows $F/gitlab-ci $F/buildkite/.buildkite \
         $F/playwright $F/cypress/cypress/e2e $F/e2e-dir/e2e $F/lefthook $F/husky/.husky \
         $F/pre-commit $F/scripts $F/vitest-config $F/pytest $F/existing/.claude
touch $F/empty/.keep $F/cypress/cypress/e2e/.keep $F/e2e-dir/e2e/.keep
printf 'name: ci\non: push\njobs: {}\n' > $F/github-actions/.github/workflows/ci.yml
printf 'stages: [test]\n' > $F/gitlab-ci/.gitlab-ci.yml
printf 'steps: []\n' > $F/buildkite/.buildkite/pipeline.yml
printf 'export default {};\n' > $F/playwright/playwright.config.ts
printf 'pre-commit:\n  commands: {}\n' > $F/lefthook/lefthook.yml
printf '#!/bin/sh\n' > $F/husky/.husky/pre-commit
printf 'repos: []\n' > $F/pre-commit/.pre-commit-config.yaml
printf '{ "name": "app", "scripts": { "test": "vitest run", "lint": "eslint .", "build": "tsc" } }\n' > $F/scripts/package.json
printf 'export default {};\n' > $F/vitest-config/vitest.config.ts
printf '[tool.pytest.ini_options]\ntestpaths = ["tests"]\n' > $F/pytest/pyproject.toml
printf '# app\n' > $F/existing/CLAUDE.md
printf '# app\n' > $F/existing/AGENTS.md
printf '# app\n' > $F/existing/README.md
printf 'node_modules/\n' > $F/existing/.gitignore
printf '{}\n' > $F/existing/.claude/settings.json
```

- [ ] **Step 2: Write the failing test**

```ts
// scripts/__tests__/discover.test.ts
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync } from "node:fs";
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

  it("exits 1 with usage when --repo is missing", () => {
    const r = spawnSync("node", [DISCOVER], { encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout).error).toContain("--repo");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm test -- scripts/__tests__/discover.test.ts`
Expected: FAIL — cannot find module `../../installer/discover.mjs`.

- [ ] **Step 4: Write `installer/discover.mjs`**

```js
#!/usr/bin/env node
// Reads the target repository and prints what /hitl:init's interview needs to know. Pure
// reader: the only git call is `git remote get-url origin`. Exit: 0 ok · 1 usage.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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
    has("pyproject.toml") && readFileSync(join(repo, "pyproject.toml"), "utf8").includes("[tool.pytest");
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

const args = parseArgs(process.argv.slice(2));
if (!args?.repo) {
  process.stdout.write(`${JSON.stringify({ error: "usage: --repo <dir>" })}\n`);
  process.exit(1);
}
process.stdout.write(`${JSON.stringify(discover(args.repo), null, 2)}\n`);
```

Note: the script's main runs on import too, which the `hostOf` test triggers with no `--repo`; guard it so an import does not exit. Replace the last five lines with:

```js
import { fileURLToPath } from "node:url";

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = parseArgs(process.argv.slice(2));
  if (!args?.repo) {
    process.stdout.write(`${JSON.stringify({ error: "usage: --repo <dir>" })}\n`);
    process.exit(1);
  }
  process.stdout.write(`${JSON.stringify(discover(args.repo), null, 2)}\n`);
}
```

(move the `fileURLToPath` import to the top with the others).

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test -- scripts/__tests__/discover.test.ts`
Expected: PASS — 7 `hostOf` cases, 9 fixture cases and 6 other tests.

- [ ] **Step 6: Commit**

```bash
git add installer/discover.mjs scripts/__fixtures__/discover scripts/__tests__/discover.test.ts
git commit -m "feat(installer): discover.mjs reports host, ci, e2e, hooks, scripts and runner"
```

---

### Task 3: the five fragments and `composeHitl`'s composition

**Files:**
- Create: `templates/testing/e2e.md`, `templates/testing/tiers.md`, `templates/testing/ci.md`, `templates/testing/hooks.md`, `templates/testing/effective-date.md`
- Test: `scripts/__tests__/lib.test.ts` (append)

**Interfaces:**
- Consumes: `composeHitl(pluginRoot, testing)` and `TESTING_ORDER` from slice 1.
- Produces: the fragment files `composeHitl` reads; `HITL.md` ends with `## Testing and gates` followed by the chosen fragments in `TESTING_ORDER`.

- [ ] **Step 1: Write the failing test**

Append to `scripts/__tests__/lib.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TESTING_ORDER, composeHitl } from "../../installer/lib.mjs";

describe("composeHitl", () => {
  const core = readFileSync(join(ROOT, "templates/HITL.md"), "utf8");

  it("returns the core unchanged when nothing is chosen", () => {
    const out = composeHitl(ROOT, []);
    expect(out).toBe(core);
    expect(out).not.toContain("## Testing and gates");
  });

  it("appends one heading and the chosen fragments in TESTING_ORDER, whatever the input order", () => {
    const out = composeHitl(ROOT, ["hooks", "e2e", "ci"]);
    expect(out.startsWith(core.trimEnd())).toBe(true);
    expect(out.split("## Testing and gates")).toHaveLength(2);
    const at = (h: string) => out.indexOf(h);
    expect(at("### End-to-end tests")).toBeLessThan(at("### Continuous integration"));
    expect(at("### Continuous integration")).toBeLessThan(at("### Commit hooks"));
    expect(out).not.toContain("### Test tiers");
    expect(out).not.toContain("### Effective-date regimes");
  });

  it("has a fragment file for every id in TESTING_ORDER, each with one ### heading", () => {
    for (const id of TESTING_ORDER) {
      const text = readFileSync(join(ROOT, `templates/testing/${id}.md`), "utf8");
      expect(text.match(/^### /gm), id).toHaveLength(1);
      expect(text.endsWith("\n"), id).toBe(true);
    }
  });

  it("ends with exactly one newline", () => {
    const out = composeHitl(ROOT, TESTING_ORDER);
    expect(out.endsWith("\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test -- scripts/__tests__/lib.test.ts`
Expected: FAIL — `ENOENT: templates/testing/hooks.md`.

- [ ] **Step 3: Write the fragments**

```markdown
<!-- templates/testing/e2e.md -->
### End-to-end tests

- A user-visible bug ships with an end-to-end test that reproduces it and then proves it
  fixed, written red first.
- A feature's critical happy path gets one end-to-end test.
- That test belongs to the slice that first makes the path exercisable — never to a terminal
  "e2e slice", which is MIS-SLICED.
- A pure API fix needs none.
```

```markdown
<!-- templates/testing/tiers.md -->
### Test tiers

Tiers are ordered `unit > component > e2e`: the failing test is written at the lowest tier
that can observe the behaviour, and the plan names the tests before implementation.
```

```markdown
<!-- templates/testing/ci.md -->
### Continuous integration

One terminal check decides. A red run is read, not re-run. A flaky test is a red job.
```

```markdown
<!-- templates/testing/hooks.md -->
### Commit hooks

Never `--no-verify`. Formatting is never a review turn: the hook formats, the reviewer reads
behaviour.
```

```markdown
<!-- templates/testing/effective-date.md -->
### Effective-date regimes

A new rule applies to a pilot area and to anything a slice touches; grandfathered code is
never a finding. Pilot areas are named under `## Effective-date pilots` in `AGENTS.md`.
```

Write each file without the `<!-- … -->` comment line; it only labels the block here.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- scripts/__tests__/lib.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add templates/testing scripts/__tests__/lib.test.ts
git commit -m "feat(templates): the five testing fragments composed under Testing and gates"
```

---

### Task 4: `agentsBlock` and the `AGENTS.md` block in `render.mjs`

**Files:**
- Modify: `installer/lib.mjs` (add `agentsBlock`)
- Modify: `installer/render.mjs` (append the block after `.gitignore`)
- Test: `scripts/__tests__/lib.test.ts` (append), `scripts/__tests__/render.test.ts` (append)

**Interfaces:**
- Consumes: `withMarkerBlock`, `readIfPresent`, `append` from slice 1's `render.mjs`.
- Produces: `agentsBlock(gates: string[], testing: string[] = []): string` — `## Local gates` with one `` - `<cmd>` `` line per gate, or the exact line `none yet — the first TDD task adds the harness and names its command here` when `gates` is empty; when `testing` includes `effective-date`, also `## Effective-date pilots` with a single placeholder bullet, which the slice-5 knob later edits. `render.mjs` appends it to `AGENTS.md`, creating the file as `# <repo directory name> — agent working agreements\n` plus the block when absent; `appended` gains `"AGENTS.md"`.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/__tests__/lib.test.ts`:

```ts
import { agentsBlock } from "../../installer/lib.mjs";

describe("agentsBlock", () => {
  it("lists one bullet per gate", () => {
    expect(agentsBlock(["pnpm test", "pnpm lint"])).toBe(
      "## Local gates\n\n- `pnpm test`\n- `pnpm lint`",
    );
  });
  it("writes the none-yet line when there is no gate", () => {
    expect(agentsBlock([])).toBe(
      "## Local gates\n\nnone yet — the first TDD task adds the harness and names its command here",
    );
  });
  it("adds the pilots section only when effective-date is chosen", () => {
    expect(agentsBlock(["pnpm test"], ["e2e"])).not.toContain("## Effective-date pilots");
    expect(agentsBlock(["pnpm test"], ["effective-date"])).toBe(
      "## Local gates\n\n- `pnpm test`\n\n## Effective-date pilots\n\n- (none yet — name the area a new rule applies to first, one per line)",
    );
  });
});
```

Append to `scripts/__tests__/render.test.ts`:

```ts
describe("render.mjs and AGENTS.md", () => {
  it("creates AGENTS.md as a stub plus the gates block when absent", () => {
    const repo = tempRepo();
    const r = render(repo, { ...ANSWERS, gates: ["pnpm test", "pnpm lint"] });
    const text = readFileSync(join(repo, "AGENTS.md"), "utf8");
    expect(text.startsWith(`# ${repo.split("/").pop()} — agent working agreements\n`)).toBe(true);
    expect(text).toContain("<!-- hitl:start -->\n## Local gates\n\n- `pnpm test`\n- `pnpm lint`\n<!-- hitl:end -->\n");
    expect(r.json.appended).toContain("AGENTS.md");
    expect(r.json.wrote).not.toContain("AGENTS.md");
  });

  it("keeps an existing AGENTS.md above the block", () => {
    const repo = tempRepo({ "AGENTS.md": "# app\n\nOurs.\n" });
    render(repo);
    const text = readFileSync(join(repo, "AGENTS.md"), "utf8");
    expect(text.startsWith("# app\n\nOurs.\n\n<!-- hitl:start -->")).toBe(true);
  });

  it("writes the none-yet line when gates is empty", () => {
    const repo = tempRepo();
    render(repo, { ...ANSWERS, gates: [] });
    expect(readFileSync(join(repo, "AGENTS.md"), "utf8")).toContain(
      "none yet — the first TDD task adds the harness and names its command here",
    );
  });

  it("never records gates in the manifest", () => {
    const repo = tempRepo();
    render(repo, { ...ANSWERS, gates: ["pnpm test"] });
    const manifest = JSON.parse(readFileSync(join(repo, ".claude/hitl.json"), "utf8"));
    expect(manifest).not.toHaveProperty("gates");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test -- scripts/__tests__/lib.test.ts scripts/__tests__/render.test.ts`
Expected: FAIL — `agentsBlock` is not exported; `AGENTS.md` does not exist after a render.

- [ ] **Step 3: Add `agentsBlock` to `installer/lib.mjs`**

```js
export const NO_GATES_LINE =
  "none yet — the first TDD task adds the harness and names its command here";

/** The AGENTS.md block: local gates, plus the pilots list when effective-date is chosen. */
export function agentsBlock(gates, testing = []) {
  const lines = ["## Local gates", ""];
  if (gates.length === 0) lines.push(NO_GATES_LINE);
  else for (const g of gates) lines.push(`- \`${g}\``);
  if (testing.includes("effective-date")) {
    lines.push("", "## Effective-date pilots", "", "- (none yet — name the area a new rule applies to first, one per line)");
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Append the block in `installer/render.mjs`**

Add `agentsBlock` to the import from `./lib.mjs` and `basename` to the import from `node:path`. After the `.gitignore` append line add:

```js
  const agentsExisting =
    readIfPresent(join(repo, "AGENTS.md")) ?? `# ${basename(repo)} — agent working agreements\n`;
  append("AGENTS.md", withMarkerBlock(agentsExisting, agentsBlock(choices.gates ?? [], choices.testing)));
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test -- scripts/__tests__/lib.test.ts scripts/__tests__/render.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add installer/lib.mjs installer/render.mjs scripts/__tests__/lib.test.ts scripts/__tests__/render.test.ts
git commit -m "feat(installer): AGENTS.md gets the Local gates block from the answers"
```

---

### Task 5: this repository's `AGENTS.md` carries the block

**Files:**
- Modify: `AGENTS.md` (`## Local gates` section)
- Test: `scripts/__tests__/drift.test.ts` (append)

**Interfaces:**
- Consumes: `agentsBlock(["pnpm test", "pnpm format:check"])` from Task 4 — the block text must equal its output exactly, so the slice-5 `local-gates` knob has the same shape to edit here as in any consumer.
- Produces: this repository as a consumer with the block; the explanatory sentences move to a paragraph right below the block.

- [ ] **Step 1: Write the failing test**

Append to `scripts/__tests__/drift.test.ts`:

```ts
import { agentsBlock } from "../../installer/lib.mjs";

describe("this repository's AGENTS.md carries the hitl block", () => {
  const text = readFileSync(join(ROOT, "AGENTS.md"), "utf8");
  it("holds exactly the rendered gates block between the markers", () => {
    const expected = `<!-- hitl:start -->\n${agentsBlock(["pnpm test", "pnpm format:check"])}\n<!-- hitl:end -->\n`;
    expect(text).toContain(expected);
    expect(text.split("<!-- hitl:start -->")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test -- scripts/__tests__/drift.test.ts`
Expected: FAIL — `AGENTS.md` has no `<!-- hitl:start -->`.

- [ ] **Step 3: Rewrite the `## Local gates` section of `AGENTS.md`**

Replace the whole `## Local gates` section (heading and its two bullets, as slice 1 left them) with:

```markdown
<!-- hitl:start -->
## Local gates

- `pnpm test`
- `pnpm format:check`
<!-- hitl:end -->

`pnpm test` runs the script tests under `scripts/__tests__/`: the Stop hook, the wipe script,
the installer under `installer/`, every script this plugin installs, and the drift test that
proves this repository equals its own render. `pnpm format:check` is Prettier at
`printWidth: 100`; Markdown is never formatted, because the prompts, doctrine and templates
are read as instructions. Both run before a PR opens.
```

The resulting file, top to bottom: the title and intro paragraph, `## What this repo is` unchanged, the block above with its paragraph, then `## Test-driven development, here` unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- scripts/__tests__/drift.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md scripts/__tests__/drift.test.ts
git commit -m "docs(agents): this repository's Local gates live in the hitl block"
```

---

### Task 6: the interview in `commands/init.md`

**Files:**
- Modify: `commands/init.md` (full rewrite)

**Interfaces:**
- Consumes: `discover.mjs` (Task 2), `render.mjs --mode check` (Task 1) and `render.mjs` write mode with the answers JSON `{ provider, ci, testing, gates }`.
- Produces: `/hitl:init` with no flags. `--adopt` arrives in slice 4.

- [ ] **Step 1: Rewrite `commands/init.md`**

```markdown
---
description: Install the hitl workflow into this repository — discover what the tree has, ask one question per finding, render from the plugin's templates. Usage: /hitl:init
---

You are installing the hitl delivery workflow into the repository at the current working
directory. The plugin ships no runtime: after this command the repository owns every file
written and changes it by pull request. You orchestrate and ask; the scripts read and write.

## 1. Prerequisites — stop on the first one missing

Check, in one batch:

```bash
node --version            # 20 or newer
git --version
gh auth status            # authenticated
```

and that superpowers is enabled: `enabledPlugins` in `~/.claude/settings.json` or in this
repository's `.claude/settings.json` contains a key starting with `superpowers@`. If it does
not, stop and print exactly:

```
hitl needs the superpowers plugin (its brainstorming and writing-plans skills shape the
artefacts this workflow reviews). Install it, then re-run /hitl:init:
  claude plugin marketplace add obra/superpowers-marketplace
  claude plugin install superpowers@superpowers-marketplace
```

For `node`, `git` or `gh` missing, stop and name the one to install.

## 2. Refuse early, then discover

```bash
node "${CLAUDE_PLUGIN_ROOT}/installer/render.mjs" --repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}" --mode check
```

- exit `3`, `refused: "manifest-present"` → "hitl is already initialised at <version>; run
  `/hitl:diff` to see what changed upstream." Stop.
- exit `3`, `refused: "collision"` → list every path, then: "These files are owned by hitl and
  already exist. If this repository was ejected from an earlier hitl or from treasury-2, run
  `/hitl:init --adopt` (available in a later version). Otherwise remove them and re-run.
  Nothing was written." Stop.
- exit `3`, `refused: "settings-unparsable"` → print the error and "fix
  `.claude/settings.json` and re-run; nothing was written." Stop.
- exit `0` → continue.

```bash
node "${CLAUDE_PLUGIN_ROOT}/installer/discover.mjs" --repo "$PWD"
```

Read the report. If `host` is not `github`: stop with "no backend for <host> in v1" — and,
when `host` is `unknown`, add "the origin remote could not be read" (or, when `remote` is
non-null, name the host in the url). Nothing else is written or asked.

## 3. Interview — one question per finding, one message each, with a recommendation

Ask in this order. A finding with nothing behind it is reported in one line and skipped;
say so before moving on. Collect the answers as you go.

| finding in the report | ask | on yes |
|---|---|---|
| `ci` contains `github-actions` | "I found GitHub Actions under `.github/workflows/`. Install the wipe job that removes `docs/superpowers/` from `main` after a feature merges? (recommended: yes — specs and plans are transient)" | `ci = "github-actions"` |
| `ci` is non-empty | "Adopt the CI rule — one terminal check, a red run is read not re-run, a flaky test is a red job? (recommended: yes)" | `testing += "ci"` |
| `ci` is non-empty and lacks `github-actions` | say: "skipped: no wipe wrapper for <ci> in v1; specs are deleted by hand after merge" | `ci = "none"` |
| `ci` is empty | say: "skipped: no CI system found; specs are deleted by hand after merge" | `ci = "none"` |
| `e2e` is non-empty | "I found <playwright / cypress / an `e2e/` directory>. Adopt the e2e rule — a user-visible bug ships a reproduces-then-proves-fixed e2e, a feature's critical path gets one, in the slice that first makes it exercisable? (recommended: yes)" | `testing += "e2e"` |
| `e2e` is empty | say: "skipped: no e2e harness found" | — |
| `testRunner` is true | "Adopt test tiers — `unit > component > e2e`, the plan names the tests before implementation? (recommended: yes)" | `testing += "tiers"` |
| `hooks` is non-empty | "I found <lefthook / husky / pre-commit>. Adopt the commit-hook rule — never `--no-verify`, formatting is never a review turn? (recommended: yes)" | `testing += "hooks"` |
| `hooks` is empty | say: "skipped: no commit-hook config found" | — |
| always | "Does this repository have code that new rules must not apply to retroactively? If yes, hitl adds an effective-date regime: a new rule applies to a pilot area and to what a slice touches, grandfathered code is never a finding. (recommended: yes for a repository older than a few months)" | `testing += "effective-date"` |
| `scripts` is non-empty | "Local gates — the commands the implementer and fixer run before reporting done. I found these scripts: <list>. Recommended: <the ones named `test`, `lint`, `typecheck`, `format:check` or `check`, as `<pkg manager> <name>`>. Confirm, or give the list." | `gates = [...]` |
| `scripts` is empty | "No package scripts found. Type the local gate commands, one per line, or say 'none yet'." | `gates = [...]` or `[]` |
| `testRunner` is false | say: "skipped: no test runner found; the TDD rule's first-task harness applies" | — |

Pilot areas are asked (the effective-date question), never discovered. Nothing else is
asked. The package manager for the recommendation is `pnpm` when `pnpm-lock.yaml` exists,
`yarn` when `yarn.lock` exists, otherwise `npm run`.

## 4. Render

```bash
ANSWERS=$(mktemp)
cat > "$ANSWERS" <<EOF
{ "provider": "github", "ci": "<github-actions|none>", "testing": [<chosen ids, quoted>], "gates": [<commands, quoted>] }
EOF
node "${CLAUDE_PLUGIN_ROOT}/installer/render.mjs" --repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}" --answers "$ANSWERS"
```

Exit `3` is relayed exactly as in step 2 (a collision can appear between the check and the
write if the human created a file meanwhile). Exit `1` or `2`: print the output verbatim and
stop. Exit `0`: continue.

## 5. Report

In plain words: the count and list of files written; the appended files (`CLAUDE.md`,
`README.md`, `.gitignore`, `AGENTS.md`) and the ones left alone because their block was
already there; whether the Stop hook was added to `.claude/settings.json` or already present;
the `## Testing and gates` rules adopted and the ones skipped, one line each; the local gates
written to `AGENTS.md`; the manifest path `.claude/hitl.json`. End with:

> Review the changes and open a pull request. From now on `.claude/` and `HITL.md` are
> reviewed like code. Nothing was committed.

Never commit. Never open a PR.
```

- [ ] **Step 2: Dry-run the prompt**

```bash
T=$(mktemp -d) && git -C "$T" init -q -b main \
  && git -C "$T" remote add origin https://github.com/example/app.git \
  && mkdir -p "$T/.github/workflows" && printf 'name: ci\non: push\njobs: {}\n' > "$T/.github/workflows/ci.yml" \
  && printf '{ "name": "app", "scripts": { "test": "vitest run", "lint": "eslint ." } }\n' > "$T/package.json" \
  && printf 'lockfileVersion: 9\n' > "$T/pnpm-lock.yaml"
# In a Claude Code session opened in $T with this repository installed as a local plugin:
#   /hitl:init
```

Expected: the check passes; the interview asks, in order, the wipe job, the CI rule, test tiers (no e2e or hooks questions — both reported skipped), the effective-date question, and the gates confirmation recommending `pnpm test` and `pnpm lint`; the report lists the adopted rules and `.claude/hitl.json` shows `ci: "github-actions"` and the chosen `testing`. `HITL.md` ends with `## Testing and gates` and the chosen fragments; `AGENTS.md` carries the gates block. If the plugin cannot be installed locally, run `discover.mjs` and `render.mjs` by hand with the same answers and check the same files; note in the PR body that the prompt was exercised by hand.

- [ ] **Step 3: Run the gates**

Run: `pnpm test && pnpm format:check`
Expected: both green (the drift test still passes: no owned template changed).

- [ ] **Step 4: Commit**

```bash
git add commands/init.md
git commit -m "feat(commands): /hitl:init discovers the tree and interviews per finding"
```

## Review decisions

Implementer clarifications (no acceptance criterion changed):

- **Task 1, `render.mjs`.** The replacement snippet for the start of `run` omitted slice 1's `unknown-ci` refusal. It is kept, right after the answers are read and before the manifest check, so the existing refusal test stays green and the exit contract is unchanged (Global Constraints). Check mode uses `DEFAULT_CHOICES`, whose `ci` is valid.
- **Task 2, fixture `scripts/package.json`.** Written with the plan's one-line content, then expanded by Prettier so `pnpm format:check` stays green; the JSON value is identical.
- **Task 6, `commands/init.md`.** Slice 1's exit-2 guidance (init is not transactional: which files to remove, which appended files and hook to leave) and the `foreign` line in the report are kept rather than collapsed into "print verbatim"; `render.mjs` still returns both. One line added: a "no" to the wipe-job question sets `ci = "none"`, so the answers always carry a valid `ci`.
- **Task 6, Step 2 dry run.** The prompt was not run as an installed plugin; `render.mjs --mode check`, `discover.mjs` and `render.mjs` were run by hand on the described tree with answers `ci: github-actions`, `testing: [ci, tiers, effective-date]`, `gates: [pnpm test, pnpm lint]`. The check passed, the report matched the expected findings, `HITL.md` ended with the chosen fragments, `AGENTS.md` carried the gates and pilots block, and the manifest recorded `ci` and `testing` without `gates`.
