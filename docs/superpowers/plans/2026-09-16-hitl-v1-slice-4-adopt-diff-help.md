# hitl v1 — slice 4: adopt, diff and help

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Owns:** `--adopt` and `adopt.mjs`; `diff.mjs` and `/hitl:diff` with `--apply`; `help.mjs` and `/hitl:help`.

**Reviewed:** round 1 (2026-09-16) · round 2 (2026-09-16).

**Goal:** an installed repository can be stamped after the fact (`--adopt`), can see and apply what changed upstream since its recorded version with a three-way merge (`/hitl:diff`), and can ask where it stands (`/hitl:help`).

**Architecture:** three more Node scripts over `installer/lib.mjs`. `adopt.mjs` writes only the manifest, with the hashes of the templates as rendered, never of the repository's files. `diff.mjs` holds three versions per owned file — the render at the recorded version (the plugin root when versions match, else a read-only `git archive` snapshot of the marketplace clone at tag `v<recorded>`), the repository's file, and the render at the plugin's version — and classifies each into exactly one of eight states by hash, running `git merge-file` only for the one state that needs content; `--apply` writes files and the manifest and nothing else. The recorded render deliberately uses the tagged version's own `installer/lib.mjs` on that snapshot, not the spec's literal `git show v<recorded>:templates/…`, so the composition rules travel with the tag; the consequence is that every release tag must carry `installer/` and `.claude-plugin/` beside `templates/`, which a tag of this repository always does. `help.mjs` reads the tree and the manifest into one of six states that partition every tree. The prompts do every git step that changes state (branch, commit, push, PR through the shim).

**Tech Stack:** Node 24 ESM, zero dependencies (targets Node 20+), `git archive`, `git merge-file`, `tar`, vitest.

**Spec:** `docs/superpowers/specs/2026-09-16-hitl-v1-design.md`

## Global Constraints

- Every behaviour change is test-first: failing test, run red, minimal code, run green, commit. Gates before the PR: `pnpm test` and `pnpm format:check`.
- Installer scripts are Node ESM under `installer/`, no dependencies, Node 20 or newer. They never run `git` to change state: `diff.mjs` runs only `git rev-parse`, `git archive` and `git merge-file`; branch, commit, push and PR are the command's, and the PR goes through `scripts/hitl/pr.sh` (slice 2), never `gh`.
- When the manifest's version equals the plugin's, the recorded render is taken from the plugin root; the marketplace tag is consulted only for an older recorded version.
- `--plugin-root`, `--marketplace` and (for help) `--home` are explicit flags so tests never touch `~/.claude` or `${CLAUDE_PLUGIN_ROOT}`.
- Manifest shape `{ version, provider, ci, testing, files }` and choices shape `{ provider, ci, testing, gates }` are slice 1's; `gates` is never recorded. The owned-file list is `ownedFiles(choices)` from `installer/lib.mjs`; "owned at the recorded version" means "a key of `manifest.files`".
- `adopt.mjs` records template hashes, never the repository's file hashes (spec § Decisions).
- In `/hitl:diff --apply`, every file is written before the shim is called, since `scripts/hitl/pr.sh` may itself be among the files applied (forwarded plan-gate item).
- Markdown is never formatted. Tests that read the disk use temp directories, never `docs/superpowers/`.
- Owned-file count is unchanged by this slice; the drift test stays green because no template changes here.
- Branch `feat/hitl-v1-slice-4-adopt-diff-help`, parent `feat/hitl-v1-slice-3-discovery-and-interview`.

---

## File structure

| Path | Responsibility |
|---|---|
| `installer/lib.mjs` | `parseArgs` (moved here by slice 3) gains an optional `booleans` list so `--apply` takes no value; gains `emit({ code, out })`, shared by the three new scripts |
| `installer/adopt.mjs` | CLI: refuses `manifest-present` and `nothing-to-adopt`; writes only `.claude/hitl.json` |
| `installer/diff.mjs` | CLI: recorded/repo/latest per owned file → eight states; `--apply` writes files, manifest and README version |
| `installer/help.mjs` | CLI: install state (six), locally-edited count, prerequisite probes |
| `commands/init.md` | gains the `--adopt` path |
| `commands/diff.md` | `/hitl:diff [--apply]` |
| `commands/help.md` | `/hitl:help` |
| `scripts/__tests__/adopt.test.ts` | adopt on an ejected tree |
| `scripts/__tests__/diff.test.ts` | a fixture marketplace with tag `v0.1.0` and a `0.2.0` plugin root; one test per state, refusals, `--apply` |
| `scripts/__tests__/help.test.ts` | one test per state; prerequisites |

Interfaces consumed from earlier slices: `installer/lib.mjs` — `renderAll(pluginRoot, choices)`, `manifestFor(version, choices, rendered)`, `readManifest(repoRoot)`, `collisions(repoRoot, choices)`, `pluginVersion(pluginRoot)`, `sha256(text)`, `ownedFiles(choices)`, `OWNED_DIRS`, `MANIFEST_PATH`, `BLOCK_START`, `BLOCK_END` (slice 1); `parseArgs(argv)` in `lib.mjs` (slice 3 moved it there from `render.mjs`); `installer/render.mjs` CLI `--repo --plugin-root --answers` (slice 1); `installer/discover.mjs --repo <dir>` printing the discovery report with `host` (slice 3); `scripts/hitl/pr.sh create --base --head --title --body-file` printing the PR record with `number` and `url` (slice 2).

Every task runs from the repository root on branch `feat/hitl-v1-slice-4-adopt-diff-help`.

---

### Task 1: `parseArgs` booleans, `emit`, and `adopt.mjs`

**Files:**
- Modify: `installer/lib.mjs` (`parseArgs` gains `booleans`; add `emit`)
- Create: `installer/adopt.mjs`
- Test: `scripts/__tests__/adopt.test.ts`

**Interfaces:**
- Consumes: `renderAll`, `manifestFor`, `readManifest`, `collisions`, `pluginVersion`, `MANIFEST_PATH` from `lib.mjs`; the `render.mjs` CLI to build the ejected fixture.
- Produces: `parseArgs(argv: string[], booleans?: string[]): Record<string, string | true> | null`; `emit({ code, out })` prints JSON and exits; CLI `node installer/adopt.mjs --repo <dir> --plugin-root <dir> --answers <file>` → exit 0 `{ wrote: [".claude/hitl.json"], manifest }`, exit 3 `{ refused: "manifest-present", version }` or `{ refused: "nothing-to-adopt" }`, exit 1 usage.

- [ ] **Step 1: Write the failing test**

```ts
// scripts/__tests__/adopt.test.ts
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderAll, sha256 } from "../../installer/lib.mjs";

const PLUGIN_ROOT = process.cwd();
const RENDER = join(PLUGIN_ROOT, "installer/render.mjs");
const ADOPT = join(PLUGIN_ROOT, "installer/adopt.mjs");
const ANSWERS = { provider: "github", ci: "github-actions", testing: [], gates: [] };

function answersFile(answers: object) {
  const p = join(mkdtempSync(join(tmpdir(), "hitl-answers-")), "answers.json");
  writeFileSync(p, JSON.stringify(answers));
  return p;
}

function run(script: string, repo: string, answers: object = ANSWERS) {
  const r = spawnSync(
    "node",
    [script, "--repo", repo, "--plugin-root", PLUGIN_ROOT, "--answers", answersFile(answers)],
    { encoding: "utf8" },
  );
  return { ...r, json: r.stdout ? JSON.parse(r.stdout) : null };
}

/** A repository that was ejected by hand: a full render, its manifest removed, one file edited. */
function ejectedRepo() {
  const repo = mkdtempSync(join(tmpdir(), "hitl-ejected-"));
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: repo });
  expect(run(RENDER, repo).status).toBe(0);
  rmSync(join(repo, ".claude/hitl.json"));
  writeFileSync(join(repo, ".claude/agents/handover.md"), "# edited by hand\n");
  return repo;
}

function tree(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((p) => p !== ".git" && !p.startsWith(".git/"))
    .sort();
}

describe("adopt.mjs", () => {
  it("writes only the manifest, with the template's hash even where the repo file was edited", () => {
    const repo = ejectedRepo();
    const before = tree(repo);
    const editedHash = sha256(readFileSync(join(repo, ".claude/agents/handover.md"), "utf8"));
    const templateHash = sha256(renderAll(PLUGIN_ROOT, ANSWERS).get(".claude/agents/handover.md")!.content);

    const r = run(ADOPT, repo);
    expect(r.status).toBe(0);
    expect(r.json.wrote).toEqual([".claude/hitl.json"]);
    const manifest = JSON.parse(readFileSync(join(repo, ".claude/hitl.json"), "utf8"));
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.ci).toBe("github-actions");
    expect(manifest.files[".claude/agents/handover.md"]).toBe(templateHash);
    expect(manifest.files[".claude/agents/handover.md"]).not.toBe(editedHash);
    expect(readFileSync(join(repo, ".claude/agents/handover.md"), "utf8")).toBe("# edited by hand\n");
    expect(tree(repo)).toEqual([...before, ".claude/hitl.json"].sort());
  });

  it("refuses when a manifest is present", () => {
    const repo = ejectedRepo();
    run(ADOPT, repo);
    const r = run(ADOPT, repo);
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "manifest-present", version: "0.1.0" });
  });

  it("refuses when nothing owned exists", () => {
    const repo = mkdtempSync(join(tmpdir(), "hitl-empty-"));
    const r = run(ADOPT, repo);
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "nothing-to-adopt" });
    expect(existsSync(join(repo, ".claude/hitl.json"))).toBe(false);
  });

  it("exits 1 on a missing flag", () => {
    const r = spawnSync("node", [ADOPT, "--repo"], { encoding: "utf8" });
    expect(r.status).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test -- scripts/__tests__/adopt.test.ts`
Expected: FAIL — `installer/adopt.mjs` not found (spawn exit 1, `json` null).

- [ ] **Step 3: Extend `parseArgs` and add `emit` in `installer/lib.mjs`**

Replace slice 3's `parseArgs` in `installer/lib.mjs` with the version below (same behaviour for
`--key value` pairs, so slice 3's tests keep passing) and add `emit` beside it:

```js
// Argument parsing and output shared by the installer CLIs. `--name value` pairs; names in
// `booleans` take no value. Returns null on any malformed argv so the caller prints usage.
export function parseArgs(argv, booleans = []) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) return null;
    const name = key.slice(2);
    if (booleans.includes(name)) {
      args[name] = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) return null;
    args[name] = value;
    i += 1;
  }
  return args;
}

/** Print one JSON document and exit with the code. Exit: 0 ok · 1 usage · 2 error · 3 refused. */
export function emit({ code, out }) {
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  process.exit(code);
}
```

- [ ] **Step 4: Write `installer/adopt.mjs`**

```js
#!/usr/bin/env node
// /hitl:init --adopt's writer. Stamps an already-ejected repository with a manifest whose
// hashes are those of the templates as they would be rendered — never the repository's own
// files — so the first /hitl:diff shows every local difference. Writes nothing else.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { emit, parseArgs } from "./lib.mjs";
import { MANIFEST_PATH, collisions, manifestFor, pluginVersion, readManifest, renderAll } from "./lib.mjs";

const USAGE = "usage: --repo <dir> --plugin-root <dir> --answers <file>";

export function run(args) {
  const { repo, "plugin-root": pluginRoot, answers: answersPath } = args;
  if (!repo || !pluginRoot || !answersPath) return { code: 1, out: { error: USAGE } };
  const choices = JSON.parse(readFileSync(answersPath, "utf8"));

  const existing = readManifest(repo);
  if (existing) return { code: 3, out: { refused: "manifest-present", version: existing.version } };
  if (collisions(repo, choices).length === 0) return { code: 3, out: { refused: "nothing-to-adopt" } };

  const manifest = manifestFor(pluginVersion(pluginRoot), choices, renderAll(pluginRoot, choices));
  const abs = join(repo, MANIFEST_PATH);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, `${JSON.stringify(manifest, null, 2)}\n`);
  return { code: 0, out: { wrote: [MANIFEST_PATH], manifest } };
}

const args = parseArgs(process.argv.slice(2));
emit(args ? run(args) : { code: 1, out: { error: USAGE } });
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test -- scripts/__tests__/adopt.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add installer/lib.mjs installer/adopt.mjs scripts/__tests__/adopt.test.ts
git commit -m "feat(installer): adopt.mjs stamps an ejected repository with template hashes"
```

---

### Task 2: `diff.mjs` — recorded render, refusals, and the four equality patterns

**Files:**
- Create: `installer/diff.mjs`
- Test: `scripts/__tests__/diff.test.ts`

**Interfaces:**
- Consumes: `renderAll`, `manifestFor`, `readManifest`, `pluginVersion`, `sha256`, `MANIFEST_PATH`, `BLOCK_START`, `BLOCK_END` from `lib.mjs`; `parseArgs`, `emit` from `lib.mjs`.
- Produces: CLI `node installer/diff.mjs --repo <dir> --plugin-root <dir> --marketplace <dir> [--apply]` → exit 0 `{ recorded, latest, files: [{ path, state, merged?, local? }] }`; exit 3 `{ refused: "no-manifest" }`, `{ refused: "tag-missing", tag }`, `{ refused: "manifest-mismatch", paths }`. States after this task: `unchanged`, `upstream changed`, `locally edited`, `already applied`, `both` (with `merged: "clean" | "conflict"`). Task 3 adds `missing locally`, `new upstream`, `removed upstream`; Task 4 adds `--apply`.

- [ ] **Step 1: Write the failing tests (add one `it` at a time; run red, make it pass, then the next)**

```ts
// scripts/__tests__/diff.test.ts
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const DIFF = join(ROOT, "installer/diff.mjs");
const ANSWERS = { provider: "github", ci: "github-actions", testing: [], gates: [] };

function git(cwd: string, args: string[]) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
}

function copyPlugin(dest: string) {
  for (const d of ["templates", "installer", ".claude-plugin"]) {
    cpSync(join(ROOT, d), join(dest, d), { recursive: true });
  }
}

/**
 * A marketplace clone whose only tag, v0.1.0, is this repository's templates and installer;
 * and a plugin root at 0.2.0 whose fixer agent gained one line at the end.
 */
function fixtureMarketplace() {
  const mk = mkdtempSync(join(tmpdir(), "hitl-mk-"));
  copyPlugin(mk);
  git(mk, ["init", "-q", "-b", "main"]);
  git(mk, ["config", "user.email", "t@example.com"]);
  git(mk, ["config", "user.name", "t"]);
  git(mk, ["add", "-A"]);
  git(mk, ["commit", "-q", "-m", "0.1.0"]);
  git(mk, ["tag", "v0.1.0"]);

  const plugin = mkdtempSync(join(tmpdir(), "hitl-plugin-"));
  copyPlugin(plugin);
  const pj = join(plugin, ".claude-plugin/plugin.json");
  writeFileSync(pj, JSON.stringify({ ...JSON.parse(readFileSync(pj, "utf8")), version: "0.2.0" }, null, 2));
  appendFileSync(join(plugin, "templates/claude/agents/fixer.md"), "\nUpstream added this line in 0.2.0.\n");
  return { mk, plugin };
}

/** A repository installed by the v0.1.0 marketplace's own render.mjs. */
function installedRepo(mk: string, answers: object = ANSWERS) {
  const repo = mkdtempSync(join(tmpdir(), "hitl-repo-"));
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: repo });
  const answersPath = join(repo, "..", `answers-${Math.random()}.json`);
  writeFileSync(answersPath, JSON.stringify(answers));
  const r = spawnSync(
    "node",
    [join(mk, "installer/render.mjs"), "--repo", repo, "--plugin-root", mk, "--answers", answersPath],
    { encoding: "utf8" },
  );
  expect(r.status, r.stdout + r.stderr).toBe(0);
  return repo;
}

function diff(repo: string, plugin: string, mk: string, apply = false) {
  const args = [DIFF, "--repo", repo, "--plugin-root", plugin, "--marketplace", mk];
  if (apply) args.push("--apply");
  const r = spawnSync("node", args, { encoding: "utf8" });
  return { ...r, json: r.stdout ? JSON.parse(r.stdout) : null };
}

function stateOf(json: any, path: string) {
  return json.files.find((f: any) => f.path === path);
}

function editManifest(repo: string, edit: (m: any) => void) {
  const p = join(repo, ".claude/hitl.json");
  const m = JSON.parse(readFileSync(p, "utf8"));
  edit(m);
  writeFileSync(p, JSON.stringify(m, null, 2));
}

const FIXER = ".claude/agents/fixer.md";
const HANDOVER = ".claude/agents/handover.md";

let mk: string;
let plugin: string;
beforeAll(() => {
  ({ mk, plugin } = fixtureMarketplace());
});

describe("diff.mjs refusals", () => {
  it("refuses without a manifest", () => {
    const repo = mkdtempSync(join(tmpdir(), "hitl-nomanifest-"));
    const r = diff(repo, plugin, mk);
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "no-manifest" });
  });

  it("refuses when the marketplace lacks the recorded tag", () => {
    const repo = installedRepo(mk);
    editManifest(repo, (m) => (m.version = "0.0.9"));
    const r = diff(repo, plugin, mk);
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "tag-missing", tag: "v0.0.9" });
  });

  it("refuses a manifest ahead of the plugin instead of proposing a downgrade", () => {
    const repo = installedRepo(mk);
    editManifest(repo, (m) => (m.version = "9.9.9"));
    const r = diff(repo, plugin, mk);
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "ahead", recorded: "9.9.9", plugin: "0.2.0" });
  });

  it("refuses when the recorded render does not hash to the manifest", () => {
    const repo = installedRepo(mk);
    editManifest(repo, (m) => (m.files["HITL.md"] = "0".repeat(64)));
    const r = diff(repo, plugin, mk);
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "manifest-mismatch", paths: ["HITL.md"] });
  });
});

describe("diff.mjs across versions (recorded 0.1.0 from the tag, latest 0.2.0)", () => {
  it("reports the versions, unchanged files and the upstream change", () => {
    const repo = installedRepo(mk);
    const r = diff(repo, plugin, mk);
    expect(r.status).toBe(0);
    expect(r.json.recorded).toBe("0.1.0");
    expect(r.json.latest).toBe("0.2.0");
    expect(stateOf(r.json, HANDOVER).state).toBe("unchanged");
    expect(stateOf(r.json, "HITL.md").state).toBe("unchanged");
    expect(stateOf(r.json, FIXER).state).toBe("upstream changed");
    expect(r.json.files.filter((f: any) => f.state !== "unchanged")).toHaveLength(1);
  });

  it("reports a local edit as locally edited", () => {
    const repo = installedRepo(mk);
    appendFileSync(join(repo, HANDOVER), "\nOurs.\n");
    expect(stateOf(diff(repo, plugin, mk).json, HANDOVER).state).toBe("locally edited");
  });

  it("reports a hand-applied upstream change as already applied", () => {
    const repo = installedRepo(mk);
    cpSync(join(plugin, "templates/claude/agents/fixer.md"), join(repo, FIXER));
    expect(stateOf(diff(repo, plugin, mk).json, FIXER).state).toBe("already applied");
  });

  it("merges cleanly when the local edit and the upstream change touch different lines", () => {
    const repo = installedRepo(mk);
    const text = readFileSync(join(repo, FIXER), "utf8");
    writeFileSync(join(repo, FIXER), text.replace("# Fixer\n", "# Fixer\n\nOurs, near the top.\n"));
    const f = stateOf(diff(repo, plugin, mk).json, FIXER);
    expect(f.state).toBe("both");
    expect(f.merged).toBe("clean");
  });

  it("reports a conflict when both edit the same lines", () => {
    const repo = installedRepo(mk);
    appendFileSync(join(repo, FIXER), "\nOurs, at the end.\n");
    const f = stateOf(diff(repo, plugin, mk).json, FIXER);
    expect(f.state).toBe("both");
    expect(f.merged).toBe("conflict");
  });
});

describe("diff.mjs at the same version reads the plugin root, not the tag", () => {
  it("reports everything unchanged with a marketplace path that is not even a git repository", () => {
    const repo = installedRepo(mk);
    const notAClone = mkdtempSync(join(tmpdir(), "hitl-notaclone-"));
    const r = diff(repo, mk, notAClone);
    expect(r.status).toBe(0);
    expect(r.json.recorded).toBe("0.1.0");
    expect(r.json.latest).toBe("0.1.0");
    expect(r.json.files.every((f: any) => f.state === "unchanged")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- scripts/__tests__/diff.test.ts`
Expected: FAIL — `installer/diff.mjs` not found (every test; `json` null).

- [ ] **Step 3: Write `installer/diff.mjs`**

```js
#!/usr/bin/env node
// /hitl:diff's engine. For every owned file it holds three versions — the render at the
// recorded version, the repository's file, the render at the plugin's version — and reports
// exactly one state per file. Read-only unless --apply; even then it writes only files under
// the repository. The only git it runs is rev-parse, archive and merge-file: branch, commit,
// push and the PR belong to the command. Exit: 0 ok · 1 usage · 2 error · 3 refused.
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { emit, parseArgs } from "./lib.mjs";
import { BLOCK_END, BLOCK_START, MANIFEST_PATH, compareVersions, manifestFor, pluginVersion, readManifest, renderAll, sha256 } from "./lib.mjs";

const USAGE = "usage: --repo <dir> --plugin-root <dir> --marketplace <dir> [--apply]";

/**
 * The render at the recorded version. Same version as the plugin → the plugin root, no tag
 * consulted. Older → a read-only `git archive` snapshot of templates/ and installer/ at tag
 * v<recorded>, rendered by that version's own lib.mjs so composition rules match the day
 * the files were written. Returns null when the tag is missing.
 */
export async function recordedRender(manifest, pluginRoot, marketplace, choices) {
  if (manifest.version === pluginVersion(pluginRoot)) return renderAll(pluginRoot, choices);
  const tag = `v${manifest.version}`;
  const probe = spawnSync("git", ["-C", marketplace, "rev-parse", "-q", "--verify", `refs/tags/${tag}`], {
    encoding: "utf8",
  });
  if (probe.status !== 0) return null;
  const snapshot = mkdtempSync(join(tmpdir(), "hitl-recorded-"));
  const tar = execFileSync("git", ["-C", marketplace, "archive", "--format=tar", tag, "templates", "installer", ".claude-plugin"]);
  execFileSync("tar", ["-x", "-C", snapshot], { input: tar });
  const lib = await import(pathToFileURL(join(snapshot, "installer/lib.mjs")).href);
  return lib.renderAll(snapshot, choices);
}

/** Three-way merge of the repository's text against the recorded and latest renders. */
function mergeThree(repoText, recordedText, latestText) {
  const dir = mkdtempSync(join(tmpdir(), "hitl-merge-"));
  const [ours, base, theirs] = ["repo", "recorded", "latest"].map((n) => join(dir, n));
  writeFileSync(ours, repoText);
  writeFileSync(base, recordedText);
  writeFileSync(theirs, latestText);
  const r = spawnSync(
    "git",
    ["merge-file", "-p", "-L", "this repository", "-L", "hitl recorded", "-L", "hitl latest", ours, base, theirs],
    { encoding: "utf8" },
  );
  rmSync(dir, { recursive: true, force: true });
  if (r.status === null || r.status < 0 || r.status > 127) throw new Error(`git merge-file failed: ${r.stderr}`);
  return { text: r.stdout, merged: r.status === 0 ? "clean" : "conflict" };
}

export async function run(args) {
  const { repo, "plugin-root": pluginRoot, marketplace, apply } = args;
  if (!repo || !pluginRoot || !marketplace) return { code: 1, out: { error: USAGE } };

  const manifest = readManifest(repo);
  if (!manifest) return { code: 3, out: { refused: "no-manifest" } };
  const choices = { provider: manifest.provider, ci: manifest.ci, testing: manifest.testing, gates: [] };
  const latestVersion = pluginVersion(pluginRoot);
  // A manifest newer than the plugin is a stale plugin cache; never propose a downgrade.
  if (compareVersions(manifest.version, latestVersion) > 0) {
    return { code: 3, out: { refused: "ahead", recorded: manifest.version, plugin: latestVersion } };
  }
  const latest = renderAll(pluginRoot, choices);
  const recorded = await recordedRender(manifest, pluginRoot, marketplace, choices);
  if (recorded === null) return { code: 3, out: { refused: "tag-missing", tag: `v${manifest.version}` } };

  // Trust the recorded render only if it hashes to what the manifest recorded.
  const mismatch = [...recorded.keys()]
    .filter((p) => p in manifest.files && sha256(recorded.get(p).content) !== manifest.files[p])
    .sort();
  if (mismatch.length > 0) return { code: 3, out: { refused: "manifest-mismatch", paths: mismatch } };

  const files = [];
  const writes = []; // { path, content, executable } or { path, delete: true }
  const paths = [...latest.keys()].filter((p) => p in manifest.files).sort();
  for (const path of paths) {
    const abs = join(repo, path);
    const repoText = existsSync(abs) ? readFileSync(abs, "utf8") : null;
    const entry = { path };
    const r = repoText === null ? null : sha256(repoText);
    const rec = manifest.files[path];
    const lat = sha256(latest.get(path).content);
    if (r === rec && rec === lat) entry.state = "unchanged";
    else if (r === rec) {
      entry.state = "upstream changed";
      writes.push({ path, ...latest.get(path) });
    } else if (rec === lat) entry.state = "locally edited";
    else if (r === lat) entry.state = "already applied";
    else {
      const recordedText = recorded.get(path)?.content;
      if (recordedText === undefined) return { code: 3, out: { refused: "manifest-mismatch", paths: [path] } };
      const m = mergeThree(repoText, recordedText, latest.get(path).content);
      entry.state = "both";
      entry.merged = m.merged;
      writes.push({ path, content: m.text, executable: latest.get(path).executable });
    }
    files.push(entry);
  }

  const report = { recorded: manifest.version, latest: latestVersion, files };
  if (!apply) return { code: 0, out: report };
  return { code: 2, out: { error: "--apply arrives in Task 4" } };
}

const args = parseArgs(process.argv.slice(2), ["apply"]);
emit(args ? await run(args) : { code: 1, out: { error: USAGE } });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- scripts/__tests__/diff.test.ts`
Expected: PASS, 10 tests. If the "conflict" test reports `clean`, check that the repo edit and the upstream line are both appended at the end of the file; `git merge-file` conflicts only on overlapping hunks.

- [ ] **Step 5: Commit**

```bash
git add installer/diff.mjs scripts/__tests__/diff.test.ts
git commit -m "feat(installer): diff.mjs classifies owned files by recorded, repo and latest hashes"
```

---

### Task 3: `diff.mjs` — the absent cases: missing locally, new upstream, removed upstream, and `ci: none`

**Files:**
- Modify: `installer/diff.mjs` (the loop head and three branches)
- Test: `scripts/__tests__/diff.test.ts` (append a `describe`; the helpers from Task 2 are in scope)

**Interfaces:**
- Produces: states `missing locally` (write latest), `new upstream` (write latest), `removed upstream` with `local: "same" | "edited" | "absent"` (delete when `same`).

- [ ] **Step 1: Write the failing tests (one at a time)**

```ts
describe("diff.mjs absent cases", () => {
  it("reports a deleted owned file as missing locally", () => {
    const repo = installedRepo(mk);
    rmSync(join(repo, ".claude/commands/handover.md"));
    expect(stateOf(diff(repo, plugin, mk).json, ".claude/commands/handover.md").state).toBe("missing locally");
  });

  it("reports a file the manifest never recorded as new upstream", () => {
    const repo = installedRepo(mk);
    editManifest(repo, (m) => delete m.files[".claude/commands/handover.md"]);
    expect(stateOf(diff(repo, plugin, mk).json, ".claude/commands/handover.md").state).toBe("new upstream");
  });

  it("reports a recorded file with no template at latest as removed upstream, same or edited", () => {
    const repo = installedRepo(mk);
    writeFileSync(join(repo, "scripts/hitl/gone.sh"), "gone\n");
    editManifest(repo, (m) => (m.files["scripts/hitl/gone.sh"] = "2a1c9f3b" + "0".repeat(56)));
    // A wrong hash first: the repo file is "edited" relative to the record.
    let f = stateOf(diff(repo, plugin, mk).json, "scripts/hitl/gone.sh");
    expect(f.state).toBe("removed upstream");
    expect(f.local).toBe("edited");
    // Now the right hash: the repo file is what was installed.
    const { sha256 } = await import("../../installer/lib.mjs");
    editManifest(repo, (m) => (m.files["scripts/hitl/gone.sh"] = sha256("gone\n")));
    f = stateOf(diff(repo, plugin, mk).json, "scripts/hitl/gone.sh");
    expect(f.local).toBe("same");
    rmSync(join(repo, "scripts/hitl/gone.sh"));
    expect(stateOf(diff(repo, plugin, mk).json, "scripts/hitl/gone.sh").local).toBe("absent");
  });

  it("never reports the wipe workflow for a repository that declined it (ci: none)", () => {
    const repo = installedRepo(mk, { ...ANSWERS, ci: "none" });
    const r = diff(repo, plugin, mk);
    expect(r.status).toBe(0);
    expect(existsSync(join(repo, ".github/workflows/wipe-superpowers-docs.yml"))).toBe(false);
    expect(stateOf(r.json, ".github/workflows/wipe-superpowers-docs.yml")).toBeUndefined();
  });
});
```

(The third test uses `await import`, so declare it `async () => { ... }`; or import `sha256` at the top of the file with the other imports — do the latter and drop the inline import.)

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test -- scripts/__tests__/diff.test.ts`
Expected: the four new tests FAIL — `missing locally` comes back as `locally edited`-shaped or undefined, `new upstream`/`removed upstream` paths are absent from the report.

- [ ] **Step 3: Extend the loop in `installer/diff.mjs`**

Replace the loop head and add the three branches so the loop reads:

```js
  const paths = [...new Set([...Object.keys(manifest.files), ...latest.keys()])].sort();
  for (const path of paths) {
    const inRecorded = path in manifest.files;
    const inLatest = latest.has(path);
    const abs = join(repo, path);
    const repoText = existsSync(abs) ? readFileSync(abs, "utf8") : null;
    const entry = { path };
    if (!inRecorded) {
      entry.state = "new upstream";
      writes.push({ path, ...latest.get(path) });
    } else if (!inLatest) {
      entry.state = "removed upstream";
      if (repoText === null) entry.local = "absent";
      else if (sha256(repoText) === manifest.files[path]) {
        entry.local = "same";
        writes.push({ path, delete: true });
      } else entry.local = "edited";
    } else if (repoText === null) {
      entry.state = "missing locally";
      writes.push({ path, ...latest.get(path) });
    } else {
      const r = sha256(repoText);
      const rec = manifest.files[path];
      const lat = sha256(latest.get(path).content);
      if (r === rec && rec === lat) entry.state = "unchanged";
      else if (r === rec) {
        entry.state = "upstream changed";
        writes.push({ path, ...latest.get(path) });
      } else if (rec === lat) entry.state = "locally edited";
      else if (r === lat) entry.state = "already applied";
      else {
        const recordedText = recorded.get(path)?.content;
        if (recordedText === undefined) return { code: 3, out: { refused: "manifest-mismatch", paths: [path] } };
        const m = mergeThree(repoText, recordedText, latest.get(path).content);
        entry.state = "both";
        entry.merged = m.merged;
        writes.push({ path, content: m.text, executable: latest.get(path).executable });
      }
    }
    files.push(entry);
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- scripts/__tests__/diff.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add installer/diff.mjs scripts/__tests__/diff.test.ts
git commit -m "feat(installer): diff.mjs reports missing, new and removed files; ci none owns no workflow"
```

---

### Task 4: `diff.mjs --apply`

**Files:**
- Modify: `installer/diff.mjs` (replace the `--apply` stub)
- Test: `scripts/__tests__/diff.test.ts` (append a `describe`)

**Interfaces:**
- Produces: with `--apply`, exit 0 and the report plus `applied: true, written: string[], deleted: string[]`; or `{ nothing: true, ...report }` when the versions are equal and no file needs a write. Writes: the action column of the spec's table; the manifest at the latest version with the latest render's hashes for every owned file; the version inside the README block.

- [ ] **Step 1: Write the failing tests**

```ts
describe("diff.mjs --apply", () => {
  it("writes the upstream change, bumps the manifest and the README version, deletes what was removed", () => {
    const repo = installedRepo(mk);
    writeFileSync(join(repo, "scripts/hitl/gone.sh"), "gone\n");
    editManifest(repo, (m) => (m.files["scripts/hitl/gone.sh"] = sha256("gone\n")));
    appendFileSync(join(repo, HANDOVER), "\nOurs.\n");

    const r = diff(repo, plugin, mk, true);
    expect(r.status).toBe(0);
    expect(r.json.applied).toBe(true);
    expect(r.json.written).toEqual([FIXER]);
    expect(r.json.deleted).toEqual(["scripts/hitl/gone.sh"]);

    expect(readFileSync(join(repo, FIXER), "utf8")).toContain("Upstream added this line in 0.2.0.");
    expect(existsSync(join(repo, "scripts/hitl/gone.sh"))).toBe(false);
    expect(readFileSync(join(repo, HANDOVER), "utf8")).toContain("Ours."); // locally edited: kept

    const manifest = JSON.parse(readFileSync(join(repo, ".claude/hitl.json"), "utf8"));
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.files).not.toHaveProperty("scripts/hitl/gone.sh");
    expect(manifest.files[FIXER]).toBe(sha256(readFileSync(join(plugin, "templates/claude/agents/fixer.md"), "utf8")));
    // The manifest records the template, never the local edit.
    expect(manifest.files[HANDOVER]).toBe(sha256(readFileSync(join(plugin, "templates/claude/agents/handover.md"), "utf8")));

    const readme = readFileSync(join(repo, "README.md"), "utf8");
    expect(readme).toContain("Installed by hitl 0.2.0");
    expect(readme).not.toContain("Installed by hitl 0.1.0");

    // A second diff now sees only the local edit.
    const again = diff(repo, plugin, mk).json;
    expect(again.recorded).toBe("0.2.0");
    expect(stateOf(again, FIXER).state).toBe("unchanged");
    expect(stateOf(again, HANDOVER).state).toBe("locally edited");
  });

  it("writes a conflicted file with its hunks and reports it", () => {
    const repo = installedRepo(mk);
    appendFileSync(join(repo, FIXER), "\nOurs, at the end.\n");
    const r = diff(repo, plugin, mk, true);
    expect(stateOf(r.json, FIXER).merged).toBe("conflict");
    const text = readFileSync(join(repo, FIXER), "utf8");
    expect(text).toContain("<<<<<<< this repository");
    expect(text).toContain(">>>>>>> hitl latest");
  });

  it("says nothing to apply at the same version with no writes", () => {
    const repo = installedRepo(mk);
    const notAClone = mkdtempSync(join(tmpdir(), "hitl-notaclone-"));
    const before = readFileSync(join(repo, ".claude/hitl.json"), "utf8");
    const r = diff(repo, mk, notAClone, true);
    expect(r.status).toBe(0);
    expect(r.json.nothing).toBe(true);
    expect(readFileSync(join(repo, ".claude/hitl.json"), "utf8")).toBe(before);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test -- scripts/__tests__/diff.test.ts`
Expected: the three new tests FAIL with exit 2 and `--apply arrives in Task 4`.

- [ ] **Step 3: Replace the stub at the end of `run` in `installer/diff.mjs`**

```js
  const report = { recorded: manifest.version, latest: latestVersion, files };
  if (!apply) return { code: 0, out: report };
  if (writes.length === 0 && manifest.version === latestVersion) return { code: 0, out: { nothing: true, ...report } };

  for (const w of writes) {
    const abs = join(repo, w.path);
    if (w.delete) {
      unlinkSync(abs);
      continue;
    }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, w.content);
    if (w.executable) chmodSync(abs, 0o755);
  }

  // The manifest describes the templates, never the repository's edits: a locally edited or
  // conflicted file is recorded at the latest render's hash, which is what lets the next diff
  // still classify it as locally edited rather than as unchanged.
  const next = manifestFor(latestVersion, choices, latest);
  writeFileSync(join(repo, MANIFEST_PATH), `${JSON.stringify(next, null, 2)}\n`);

  const readmePath = join(repo, "README.md");
  if (existsSync(readmePath)) {
    const readme = readFileSync(readmePath, "utf8");
    const start = readme.indexOf(BLOCK_START);
    const end = readme.indexOf(BLOCK_END);
    if (start !== -1 && end > start) {
      const block = readme
        .slice(start, end)
        .replace(`Installed by hitl ${manifest.version}`, `Installed by hitl ${latestVersion}`);
      writeFileSync(readmePath, readme.slice(0, start) + block + readme.slice(end));
    }
  }

  return {
    code: 0,
    out: {
      ...report,
      applied: true,
      written: writes.filter((w) => !w.delete).map((w) => w.path),
      deleted: writes.filter((w) => w.delete).map((w) => w.path),
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- scripts/__tests__/diff.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add installer/diff.mjs scripts/__tests__/diff.test.ts
git commit -m "feat(installer): diff.mjs --apply writes files, bumps the manifest and the README version"
```

---

### Task 5: `help.mjs`

**Files:**
- Create: `installer/help.mjs`
- Modify: `installer/lib.mjs` (add `compareVersions`)
- Test: `scripts/__tests__/help.test.ts`

**Interfaces:**
- Consumes: `readManifest`, `pluginVersion`, `collisions`, `sha256`, `ownedFiles` from `lib.mjs`; `parseArgs`, `emit` from `lib.mjs`; the `render.mjs` CLI to build installed trees.
- Produces: CLI `node installer/help.mjs --repo <dir> --plugin-root <dir> [--home <dir>]` → exit 0 `{ state, manifestVersion: string | null, pluginVersion, locallyEdited: number | null, prerequisites: { node: true, git: bool, gh: bool, superpowers: bool } }` with `state` ∈ `not installed | ejected | partially installed | behind | ahead | up to date`.

- [ ] **Step 1: Write the failing tests**

```ts
// scripts/__tests__/help.test.ts
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PLUGIN_ROOT = process.cwd();
const HELP = join(PLUGIN_ROOT, "installer/help.mjs");
const RENDER = join(PLUGIN_ROOT, "installer/render.mjs");

function tempDir(files: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "hitl-help-"));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

function installed() {
  const repo = tempDir();
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: repo });
  const answers = join(repo, "..", `answers-${Math.random()}.json`);
  writeFileSync(answers, JSON.stringify({ provider: "github", ci: "github-actions", testing: [], gates: [] }));
  const r = spawnSync("node", [RENDER, "--repo", repo, "--plugin-root", PLUGIN_ROOT, "--answers", answers], { encoding: "utf8" });
  expect(r.status).toBe(0);
  return repo;
}

function setVersion(repo: string, version: string) {
  const p = join(repo, ".claude/hitl.json");
  const m = JSON.parse(readFileSync(p, "utf8"));
  m.version = version;
  writeFileSync(p, JSON.stringify(m));
}

function help(repo: string, home: string = tempDir()) {
  const r = spawnSync("node", [HELP, "--repo", repo, "--plugin-root", PLUGIN_ROOT, "--home", home], { encoding: "utf8" });
  return { ...r, json: r.stdout ? JSON.parse(r.stdout) : null };
}

describe("help.mjs states", () => {
  it("not installed", () => {
    const r = help(tempDir({ "README.md": "hi\n" }));
    expect(r.status).toBe(0);
    expect(r.json.state).toBe("not installed");
    expect(r.json.manifestVersion).toBeNull();
    expect(r.json.locallyEdited).toBeNull();
  });

  it("ejected (agents dir and HITL.md, no manifest)", () => {
    const r = help(tempDir({ "HITL.md": "# HITL\n", ".claude/agents/fixer.md": "x\n" }));
    expect(r.json.state).toBe("ejected");
  });

  it("partially installed (some owned path, not both of the above)", () => {
    expect(help(tempDir({ "scripts/hitl/pr.sh": "" })).json.state).toBe("partially installed");
    expect(help(tempDir({ "HITL.md": "# HITL\n" })).json.state).toBe("partially installed");
  });

  it("up to date, behind and ahead by the manifest version", () => {
    const repo = installed();
    expect(help(repo).json.state).toBe("up to date");
    expect(help(repo).json.manifestVersion).toBe("0.1.0");
    setVersion(repo, "0.0.1");
    expect(help(repo).json.state).toBe("behind");
    setVersion(repo, "9.9.9");
    expect(help(repo).json.state).toBe("ahead");
  });

  it("counts locally edited owned files against the manifest", () => {
    const repo = installed();
    expect(help(repo).json.locallyEdited).toBe(0);
    appendFileSync(join(repo, ".claude/agents/fixer.md"), "\nours\n");
    expect(help(repo).json.locallyEdited).toBe(1);
  });
});

describe("help.mjs prerequisites", () => {
  it("finds superpowers in the home or the repository settings, and probes the tools", () => {
    const repo = installed();
    const none = help(repo).json.prerequisites;
    expect(none.node).toBe(true);
    expect(typeof none.git).toBe("boolean");
    expect(typeof none.gh).toBe("boolean");
    expect(none.superpowers).toBe(false);

    const home = tempDir({ ".claude/settings.json": JSON.stringify({ enabledPlugins: { "superpowers@claude-plugins-official": true } }) });
    expect(help(repo, home).json.prerequisites.superpowers).toBe(true);

    const projectScoped = installed();
    const p = join(projectScoped, ".claude/settings.json");
    const s = JSON.parse(readFileSync(p, "utf8"));
    s.enabledPlugins = { "superpowers@superpowers-marketplace": true };
    writeFileSync(p, JSON.stringify(s));
    expect(help(projectScoped).json.prerequisites.superpowers).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- scripts/__tests__/help.test.ts`
Expected: FAIL — `installer/help.mjs` not found.

- [ ] **Step 3: Write `installer/help.mjs`**

```js
#!/usr/bin/env node
// /hitl:help's reader. Says where an install stands — one of six states that partition every
// tree — plus how many owned files differ from the manifest and which prerequisites are
// present. Reads only. Exit: 0 ok · 1 usage.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { emit, parseArgs } from "./lib.mjs";
import { collisions, compareVersions, pluginVersion, readManifest, sha256 } from "./lib.mjs";

const USAGE = "usage: --repo <dir> --plugin-root <dir> [--home <dir>]";
```

`compareVersions` lives in `installer/lib.mjs` (slice 5's `customize-testing.mjs` imports it
too); add it there, exported:

```js
/** Compare two dotted versions numerically: -1, 0 or 1. */
export function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
```

Back in `installer/help.mjs`, after the `USAGE` line (and add `installer/lib.mjs` to this
task's Files as Modify):

```js
function probe(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return r.status === 0;
}

function superpowersEnabled(settingsPath) {
  if (!existsSync(settingsPath)) return false;
  try {
    const enabled = JSON.parse(readFileSync(settingsPath, "utf8")).enabledPlugins ?? {};
    return Object.entries(enabled).some(([k, v]) => k.startsWith("superpowers@") && v === true);
  } catch {
    return false;
  }
}

export function installState(repo, manifest, plugin) {
  if (manifest) {
    const c = compareVersions(manifest.version, plugin);
    return c < 0 ? "behind" : c > 0 ? "ahead" : "up to date";
  }
  const anyOwned = collisions(repo, { provider: "github", ci: "github-actions", testing: [], gates: [] }).length > 0;
  if (!anyOwned) return "not installed";
  const ejected = existsSync(join(repo, ".claude/agents")) && existsSync(join(repo, "HITL.md"));
  return ejected ? "ejected" : "partially installed";
}

export function run(args) {
  const { repo, "plugin-root": pluginRoot, home = homedir() } = args;
  if (!repo || !pluginRoot) return { code: 1, out: { error: USAGE } };
  const plugin = pluginVersion(pluginRoot);
  const manifest = readManifest(repo);
  const state = installState(repo, manifest, plugin);

  let locallyEdited = null;
  if (manifest) {
    locallyEdited = 0;
    for (const [path, hash] of Object.entries(manifest.files)) {
      const abs = join(repo, path);
      if (!existsSync(abs) || sha256(readFileSync(abs, "utf8")) !== hash) locallyEdited += 1;
    }
  }

  const prerequisites = {
    node: Number(process.versions.node.split(".")[0]) >= 20,
    git: probe("git", ["--version"]),
    gh: probe("gh", ["auth", "status"]),
    superpowers:
      superpowersEnabled(join(home, ".claude/settings.json")) ||
      superpowersEnabled(join(repo, ".claude/settings.json")),
  };

  return {
    code: 0,
    out: { state, manifestVersion: manifest ? manifest.version : null, pluginVersion: plugin, locallyEdited, prerequisites },
  };
}

const args = parseArgs(process.argv.slice(2));
emit(args ? run(args) : { code: 1, out: { error: USAGE } });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- scripts/__tests__/help.test.ts`
Expected: PASS, 6 tests. (`gh` may be true or false on the machine; the test only checks the type.)

- [ ] **Step 5: Commit**

```bash
git add installer/help.mjs scripts/__tests__/help.test.ts
git commit -m "feat(installer): help.mjs reports the install state and prerequisites"
```

---

### Task 6: the prompts — `/hitl:init --adopt`, `/hitl:diff`, `/hitl:help` — and the gates

**Files:**
- Modify: `commands/init.md` (add the `--adopt` section; keep slice 3's interview path as it is)
- Create: `commands/diff.md`
- Create: `commands/help.md`

**Interfaces:**
- Consumes: the three CLIs above; `installer/discover.mjs --repo <dir>` (slice 3) for the host; `scripts/hitl/pr.sh create` (slice 2).
- Produces: the three user-facing commands.

- [ ] **Step 1: Add `--adopt` to `commands/init.md`**

Update the front matter's `description` and `argument-hint` to mention `--adopt`, and insert this section before the discovery step (the existing steps stay for the plain path):

```markdown
## `--adopt` — stamp a repository that was ejected by hand

If `$ARGUMENTS` contains `--adopt`, this path replaces steps 3 onward:

1. Run the prerequisite check above.
2. Manifest present → "hitl is already initialised at <version>; run `/hitl:diff`." Stop.
3. Host only: `node "${CLAUDE_PLUGIN_ROOT}/installer/discover.mjs" --repo "$PWD"`. A `host`
   other than `github` → "no backend for <host> in v1". Stop.
4. Before asking anything, run `help.mjs` (`--repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}"`).
   State `not installed` → "nothing to adopt: no hitl-owned file exists. Run `/hitl:init`."
   Stop. Any other state without a manifest → continue. Then ask exactly two things, one at
   a time, each with a recommendation:
   - `ci`: "Is the wipe workflow (`.github/workflows/wipe-superpowers-docs.yml`) part of this
     repository?" → `github-actions` or `none` (recommend what the tree shows).
   - `testing`: "Which of the testing rules does this repository's `HITL.md` carry under
     `## Testing and gates`: e2e, tiers, ci, hooks, effective-date?" → a list, possibly empty
     (recommend what `HITL.md` shows).
5. Write the answers file `{ "provider": "github", "ci": ..., "testing": [...], "gates": [] }`
   and run:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/installer/adopt.mjs" --repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}" --answers "$ANSWERS"
   ```

   - exit `3`, `refused: "nothing-to-adopt"` → "nothing to adopt: no hitl-owned file exists.
     Run `/hitl:init`." Stop. (Unreachable after step 4's check; kept as the script's own
     guard.)
   - exit `3`, `refused: "manifest-present"` → as step 2. Stop.
   - exit `0` → report: "manifest written to `.claude/hitl.json` at hitl <version>. It records
     the templates, not this repository's files: run `/hitl:diff` to see the drift." Nothing
     else was touched. Never commit.
```

- [ ] **Step 2: Write `commands/diff.md`**

```markdown
---
description: Show what changed upstream in hitl since this repository's recorded version, per owned file; --apply writes it and opens the upgrade PR. Usage: /hitl:diff [--apply]
argument-hint: [--apply]
---

You compare this repository's hitl install with the plugin's current templates. `diff.mjs`
does every comparison and, with `--apply`, every file write; you do the git steps.

## 1. Run the report

```bash
MK="$HOME/.claude/plugins/marketplaces/hitl"
node "${CLAUDE_PLUGIN_ROOT}/installer/diff.mjs" --repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}" --marketplace "$MK"
```

- exit `3`, `refused: "no-manifest"` → "no `.claude/hitl.json`; run `/hitl:init` or
  `/hitl:init --adopt`." Stop.
- exit `3`, `refused: "tag-missing"` → "the marketplace clone has no tag <tag>; run
  `claude plugin marketplace update hitl` and retry." Stop.
- exit `3`, `refused: "manifest-mismatch"` → "the manifest and the templates disagree for
  <paths>; delete `.claude/hitl.json` and re-run `/hitl:init --adopt`." Stop.
- exit `3`, `refused: "ahead"` → "the install is at <recorded>, newer than the plugin at
  <plugin>; update the plugin (`claude plugin marketplace update hitl`, then reinstall)."
  Stop.
- exit `0` → print one table, `path · state · note`, where the note is `merged: clean`,
  `merged: conflict`, or `local: same|edited|absent` when present. Then one line:
  "recorded <recorded> · latest <latest> · <n> to apply", counting every file whose state is
  `upstream changed`, `both`, `missing locally`, `new upstream`, or `removed upstream` with
  `local: same`.

Without `--apply` in `$ARGUMENTS`, stop here.

## 2. `--apply`

If every file is `unchanged` or `locally edited` (or `already applied`, `removed upstream`
with `local` other than `same`) and the versions are equal, say "nothing to apply" and stop.

Otherwise, in this order — every file is written before the shim is called, because
`scripts/hitl/pr.sh` may itself be among the files applied:

```bash
FROM=$(git branch --show-current)
git checkout -q -b "chore/hitl-<recorded>-to-<latest>"
node "${CLAUDE_PLUGIN_ROOT}/installer/diff.mjs" --repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}" --marketplace "$MK" --apply
# Stage only what the upgrade touched: every path in the report's `files`, the manifest and
# the README block. Never `git add -A`: an unrelated dirty file must not ride in.
git add .claude/hitl.json README.md <every path listed in the report's files, deleted ones with `git rm`>
git commit -q -m "chore(hitl): <recorded> → <latest>"
git push -u origin "chore/hitl-<recorded>-to-<latest>"
scripts/hitl/pr.sh create --base "$FROM" --head "chore/hitl-<recorded>-to-<latest>" --title "hitl <recorded> → <latest>" --body-file <tmp>
```

If the report lists `scripts/hitl/pr.sh` or `scripts/hitl/backend.sh` with
`merged: conflict`, the freshly written shim is not runnable bash: stop after the push, print
the branch name and the PR title and body, and tell the human to resolve the hunks and open
the PR by hand. Do not call the shim.

The PR body (no `Plan:` line — an upgrade has no plan):

```
**What** — hitl <recorded> → <latest>: the workflow files this repository installed from
hitl, brought up to the plugin's current templates.

**Why** — <one or two sentences from the plugin's release notes if present, else "upstream
changed these files since this repository recorded hitl <recorded>".>

**How** — Each owned file was compared three ways (recorded template, this repository,
latest template). Files this repository edited were kept; files both changed were merged.

| file | state |
|---|---|
<one row per file whose state is not unchanged>

<if any file has merged: conflict:> **Conflicts to resolve by hand:** <paths>. They carry
`<<<<<<<` / `>>>>>>>` hunks as committed.
```

Report `created: #N <url>`; the shim's exit `3` means the PR already exists — report its
number instead. Never merge, never mark ready for review.
```

- [ ] **Step 3: Write `commands/help.md`**

```markdown
---
description: Where this repository's hitl install stands, what to run next, and which prerequisites are missing. Usage: /hitl:help
---

```bash
node "${CLAUDE_PLUGIN_ROOT}/installer/help.mjs" --repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}"
```

Say the matching thing for `state`, then always end with the prerequisites.

- `not installed` → "hitl is not installed here. Run `/hitl:init`."
- `ejected` → "This repository carries the workflow but no manifest (ejected by hand or from
  treasury-2). Run `/hitl:init --adopt` to record it; the first `/hitl:diff` then shows the
  drift."
- `partially installed` → "Some hitl-owned files exist but not the workflow. Run
  `/hitl:init`; it lists what collides."
- `behind` → "Installed hitl <manifestVersion>; the plugin is <pluginVersion>. Run
  `/hitl:diff` to see what changed, `/hitl:diff --apply` to open the upgrade PR."
  Add "<locallyEdited> owned file(s) differ from the record" when the count is not 0.
- `ahead` → "The manifest records hitl <manifestVersion>, newer than the plugin
  (<pluginVersion>). Update the plugin: `claude plugin marketplace update hitl` then
  `claude plugin update hitl`."
- `up to date` → print, in this order:

  ```
  hitl <pluginVersion> — up to date. <locallyEdited> owned file(s) locally edited.

  The chain:
    1. brainstorm → spec committed → /review-spec (≤2 rounds) → human approves
    2. plans committed → /review-plan (≤2 rounds) → handover document
    3. new session: /implement-stack <handover>
    4. per slice: implementer → /review-slice → fixer → PR onto the parent
    5. draft umbrella PR; nothing merges — the human reviews the stack

  Plugin commands:   /hitl:init [--adopt] · /hitl:diff [--apply] · /hitl:help · /hitl:customize
  Workflow commands: /review-spec · /review-plan · /review-slice · /handover · /implement-stack · /umbrella-pr

  To change a rule: edit HITL.md or .claude/ by pull request, or run /hitl:customize.
  ```

Prerequisites, always, as a table `prerequisite · needed by · present`: `node` (the
installer), `git`, `gh` authenticated (the PR shim), the superpowers plugin enabled (the
brainstorming and writing-plans skills shape the artefacts this workflow reviews). A missing
one gets its install line (superpowers: `claude plugin marketplace add
obra/superpowers-marketplace` then `claude plugin install superpowers@superpowers-marketplace`).
End with: "Recommended: `/grill-me` (Matt Pocock's skills, `npx skills add mattpocock/skills`)
to start a feature whose shape is unclear."
```

- [ ] **Step 4: Dry-run the three prompts**

With this working tree installed as a local marketplace (`claude plugin marketplace add /path/to/hitl && claude plugin install hitl@hitl`), in a temp repository rendered by `/hitl:init` then with its manifest deleted and one agent edited:

- `/hitl:help` → `ejected` text.
- `/hitl:init --adopt` → asks `ci` and `testing`, writes the manifest.
- `/hitl:diff` → the edited agent reads `locally edited`, everything else `unchanged`.
- `/hitl:help` → `up to date`, `1 owned file(s) locally edited`.
- Bump `version` in the local marketplace's `plugin.json` to `0.2.0`, tag the previous
  commit `v0.1.0`, change one template, reinstall the plugin: `/hitl:help` → `behind`;
  `/hitl:diff` → that file `upstream changed`; `/hitl:diff --apply` on a repository with a
  GitHub remote → branch, commit, push and one PR "hitl 0.1.0 → 0.2.0" whose body lists the
  file.

If the plugin cannot be installed locally on this machine, run each script by hand with the
same inputs and check the same outputs; note in the PR body that the prompts were exercised
by hand.

- [ ] **Step 5: Run the gates**

Run: `pnpm test && pnpm format:check`
Expected: both green (the drift test stays green: no template changed in this slice). If `format:check` flags `installer/*.mjs`, run `pnpm format` and re-check.

- [ ] **Step 6: Commit**

```bash
git add commands/init.md commands/diff.md commands/help.md
git commit -m "feat(commands): /hitl:init --adopt, /hitl:diff and /hitl:help"
```
