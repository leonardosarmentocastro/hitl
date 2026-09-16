# hitl v1 — slice 1: plugin skeleton and init core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Owns:** the plugin manifests; `templates/` cut generically from `.claude/` with the slice-1 doctrine changes; the shared installer module and `render.mjs`; `/hitl:init` taking its answers from flags; the manifest with every field; the collision and manifest-present refusals; this repository's wipe script moved to `scripts/hitl/`; this repository's `AGENTS.md` naming `installer/` and `templates/` as tested code.

**Goal:** `/hitl:init` renders the workflow into an empty GitHub repository from templates that this repository itself is proven to be a render of.

**Architecture:** `templates/` holds finished files; `installer/lib.mjs` is the one module that knows which files are owned (a pure function of the choices), how `HITL.md` is composed, how to hash, and how to read and write the manifest; `installer/render.mjs` is a CLI over it that refuses before its first write and prints JSON. A drift test renders the templates with this repository's choices and asserts equality with the repository's own copies, so a template and its twin cannot diverge.

**Tech Stack:** Node 24 ESM with zero dependencies for the installer (targets Node 20+), bash for installed scripts, vitest for tests, Claude Code plugin manifests.

**Spec:** `docs/superpowers/specs/2026-09-16-hitl-v1-design.md`

## Global Constraints

- Every behaviour change is test-first: failing test, run red, minimal code, run green, commit. Gates before the PR: `pnpm test` and `pnpm format:check`.
- Installer scripts are Node ESM under `installer/`, no dependencies, target Node 20 or newer; they never run `git` to change state and never call the PR shim.
- Templates are finished files: no placeholder syntax. Variation is by selection (which files) and composition (`HITL.md` = core + fragments), never substitution.
- Owned-file list defined once, in `installer/lib.mjs`, as a pure function of the choices. Choices shape: `{ provider: "github", ci: "github-actions" | "none", testing: string[], gates: string[] }`. Manifest shape: `{ version, provider, ci, testing, files: { "<repo path>": "<sha256 hex>" } }`, keys of `files` sorted.
- Markdown is never formatted (`.prettierignore` already excludes `*.md`); the copied `.sh` and `.yml` files keep their bytes.
- Tests that read the disk use temp directories or `scripts/__fixtures__/`, never `docs/superpowers/`.
- Nothing in this slice reads the manifest at run time from a workflow command or agent; the manifest is install metadata only.
- **Tripwire:** this slice crosses the ~20-file mark because cutting the templates copies eighteen files from `.claude/`, `HITL.md`, the wipe script and the workflow into `templates/`. That is one capability (init renders from templates) and splitting the copy from its first consumer would be a horizontal cut below the thinness floor, so the tripwire is crossed knowingly.
- Doctrine changes in this slice are exactly the three listed in the spec § Templates for slice 1 (wipe sentence, gate sentence, `## Where things live`), applied to both `.claude/`+`HITL.md` and `templates/`. The `## Load-bearing invariants` section and the knob anchors belong to slice 5 and are not added here.

---

## File structure

| Path | Responsibility |
|---|---|
| `.claude-plugin/plugin.json` | plugin name `hitl`, version `0.1.0` |
| `.claude-plugin/marketplace.json` | self-marketplace `hitl` with one plugin, source `./` |
| `installer/lib.mjs` | owned-file list, `HITL.md` composition, `renderAll`, hashing, manifest IO, collision check, appended-block and settings helpers |
| `installer/render.mjs` | CLI: `--repo`, `--plugin-root`, `--answers`; refuses (exit 3) on manifest present or collision; writes everything; prints JSON |
| `templates/**` | finished files (see Task 3 for the exact list) |
| `commands/init.md` | the `/hitl:init` prompt: prerequisites, build answers from flags, run `render.mjs`, relay |
| `scripts/hitl/wipe-superpowers-docs.sh` | this repository's wipe script, moved from `scripts/` |
| `.github/workflows/wipe-superpowers-docs.yml` | path updated to `scripts/hitl/` |
| `scripts/__tests__/lib.test.ts` | unit tests for `lib.mjs` |
| `scripts/__tests__/drift.test.ts` | this repository equals its own render |
| `scripts/__tests__/render.test.ts` | `render.mjs` on temp repositories |
| `AGENTS.md` | names `installer/` and `templates/` as tested code |

Every task below runs from the repository root on branch `feat/hitl-v1-slice-1-plugin-skeleton-and-init-core`.

---

### Task 1: plugin manifests and the lib primitives (`pluginVersion`, `sha256`, `ownedFiles`)

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`
- Create: `installer/lib.mjs`
- Test: `scripts/__tests__/lib.test.ts`

**Interfaces:**
- Produces: `pluginVersion(pluginRoot): string`; `sha256(text: string): string` (hex); `ownedFiles(choices): Array<{ repoPath: string, template: string | null, executable: boolean }>` where `template` is a path relative to `templates/` and `null` means "composed" (`HITL.md`); `OWNED_DIRS = ["scripts/hitl", ".claude/fixtures"]`; `TESTING_ORDER = ["e2e", "tiers", "ci", "hooks", "effective-date"]`.

- [ ] **Step 1: Write the failing test**

```ts
// scripts/__tests__/lib.test.ts
import { describe, expect, it } from "vitest";
import { ownedFiles, pluginVersion, sha256 } from "../../installer/lib.mjs";

const ROOT = process.cwd();

describe("installer/lib primitives", () => {
  it("reads the plugin version from .claude-plugin/plugin.json", () => {
    expect(pluginVersion(ROOT)).toBe("0.1.0");
  });

  it("hashes with sha256 hex", () => {
    expect(sha256("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("owns the workflow only when ci is github-actions", () => {
    const withCi = ownedFiles({ provider: "github", ci: "github-actions", testing: [], gates: [] });
    const without = ownedFiles({ provider: "github", ci: "none", testing: [], gates: [] });
    const paths = (list: { repoPath: string }[]) => list.map((f) => f.repoPath);
    expect(paths(withCi)).toContain(".github/workflows/wipe-superpowers-docs.yml");
    expect(paths(without)).not.toContain(".github/workflows/wipe-superpowers-docs.yml");
  });

  it("lists every agent, command, the hook, review-context, fixtures and the wipe script", () => {
    const paths = ownedFiles({ provider: "github", ci: "none", testing: [], gates: [] }).map(
      (f) => f.repoPath,
    );
    expect(paths).toEqual(
      expect.arrayContaining([
        "HITL.md",
        ".claude/agents/spec-reviewer.md",
        ".claude/agents/plan-reviewer.md",
        ".claude/agents/slice-reviewer.md",
        ".claude/agents/implementer.md",
        ".claude/agents/fixer.md",
        ".claude/agents/handover.md",
        ".claude/commands/review-spec.md",
        ".claude/commands/review-plan.md",
        ".claude/commands/review-slice.md",
        ".claude/commands/handover.md",
        ".claude/commands/implement-stack.md",
        ".claude/commands/umbrella-pr.md",
        ".claude/hooks/unreviewed-artifact.sh",
        ".claude/review-context.md",
        ".claude/fixtures/spec-fixture-design.md",
        ".claude/fixtures/plans/2026-09-06-spec-fixture-slice-1-schema.md",
        ".claude/fixtures/plans/2026-09-06-spec-fixture-slice-2-api.md",
        "scripts/hitl/wipe-superpowers-docs.sh",
      ]),
    );
    expect(paths).toHaveLength(19);
  });

  it("marks the shell scripts executable and HITL.md as composed", () => {
    const list = ownedFiles({ provider: "github", ci: "none", testing: [], gates: [] });
    const byPath = Object.fromEntries(list.map((f) => [f.repoPath, f]));
    expect(byPath[".claude/hooks/unreviewed-artifact.sh"].executable).toBe(true);
    expect(byPath["scripts/hitl/wipe-superpowers-docs.sh"].executable).toBe(true);
    expect(byPath["HITL.md"].template).toBeNull();
    expect(byPath[".claude/agents/fixer.md"].template).toBe("claude/agents/fixer.md");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- scripts/__tests__/lib.test.ts`
Expected: FAIL — cannot find module `../../installer/lib.mjs`.

- [ ] **Step 3: Write the plugin manifests and the primitives**

```json
// .claude-plugin/plugin.json
{
  "name": "hitl",
  "description": "Installs a human-in-the-loop delivery workflow (spec, plan and slice reviews, stacked slice PRs, a Stop hook) into a repository, which then owns it.",
  "version": "0.1.0",
  "author": { "name": "Leonardo Sarmento de Castro" },
  "repository": "https://github.com/leonardosarmentocastro/hitl",
  "license": "MIT",
  "keywords": ["workflow", "review", "tdd", "human-in-the-loop"]
}
```

```json
// .claude-plugin/marketplace.json
{
  "name": "hitl",
  "description": "Marketplace for the hitl plugin",
  "owner": { "name": "Leonardo Sarmento de Castro" },
  "plugins": [
    {
      "name": "hitl",
      "description": "Installs a human-in-the-loop delivery workflow into a repository, which then owns it.",
      "version": "0.1.0",
      "source": "./",
      "author": { "name": "Leonardo Sarmento de Castro" }
    }
  ]
}
```

```js
// installer/lib.mjs
// Shared code for every installer script. Zero dependencies; Node 20+.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const TESTING_ORDER = ["e2e", "tiers", "ci", "hooks", "effective-date"];
export const OWNED_DIRS = ["scripts/hitl", ".claude/fixtures"];
export const MANIFEST_PATH = ".claude/hitl.json";

const AGENTS = [
  "spec-reviewer",
  "plan-reviewer",
  "slice-reviewer",
  "implementer",
  "fixer",
  "handover",
];
const COMMANDS = [
  "review-spec",
  "review-plan",
  "review-slice",
  "handover",
  "implement-stack",
  "umbrella-pr",
];
const FIXTURES = [
  "spec-fixture-design.md",
  "plans/2026-09-06-spec-fixture-slice-1-schema.md",
  "plans/2026-09-06-spec-fixture-slice-2-api.md",
];

/** The owned files for a set of choices. `template` is relative to templates/; null = composed. */
export function ownedFiles(choices) {
  const files = [
    { repoPath: "HITL.md", template: null, executable: false },
    ...AGENTS.map((a) => ({
      repoPath: `.claude/agents/${a}.md`,
      template: `claude/agents/${a}.md`,
      executable: false,
    })),
    ...COMMANDS.map((c) => ({
      repoPath: `.claude/commands/${c}.md`,
      template: `claude/commands/${c}.md`,
      executable: false,
    })),
    {
      repoPath: ".claude/hooks/unreviewed-artifact.sh",
      template: "claude/hooks/unreviewed-artifact.sh",
      executable: true,
    },
    {
      repoPath: ".claude/review-context.md",
      template: "claude/review-context.md",
      executable: false,
    },
    ...FIXTURES.map((f) => ({
      repoPath: `.claude/fixtures/${f}`,
      template: `claude/fixtures/${f}`,
      executable: false,
    })),
    {
      repoPath: "scripts/hitl/wipe-superpowers-docs.sh",
      template: "scripts/wipe-superpowers-docs.sh",
      executable: true,
    },
  ];
  if (choices.ci === "github-actions") {
    files.push({
      repoPath: ".github/workflows/wipe-superpowers-docs.yml",
      template: "ci/github-actions/wipe-superpowers-docs.yml",
      executable: false,
    });
  }
  return files;
}

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function pluginVersion(pluginRoot) {
  const p = join(pluginRoot, ".claude-plugin/plugin.json");
  return JSON.parse(readFileSync(p, "utf8")).version;
}

export function readManifest(repoRoot) {
  const p = join(repoRoot, MANIFEST_PATH);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- scripts/__tests__/lib.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add .claude-plugin installer/lib.mjs scripts/__tests__/lib.test.ts
git commit -m "feat(installer): plugin manifests and owned-file list"
```

---

### Task 2: move this repository's wipe script under `scripts/hitl/`

**Files:**
- Move: `scripts/wipe-superpowers-docs.sh` → `scripts/hitl/wipe-superpowers-docs.sh`
- Modify: `.github/workflows/wipe-superpowers-docs.yml` (the `run:` line)
- Modify: `scripts/__tests__/wipe-superpowers-docs.test.ts:8` (the `SCRIPT` path)

**Interfaces:**
- Produces: the wipe script at the path `ownedFiles` names, so the drift test in Task 3 can compare it.

- [ ] **Step 1: Change the test's path first and watch it fail**

In `scripts/__tests__/wipe-superpowers-docs.test.ts` replace line 8:

```ts
const SCRIPT = fileURLToPath(new URL("../hitl/wipe-superpowers-docs.sh", import.meta.url));
```

Run: `pnpm test -- scripts/__tests__/wipe-superpowers-docs.test.ts`
Expected: FAIL — `bash: scripts/hitl/wipe-superpowers-docs.sh: No such file or directory` (all three tests).

- [ ] **Step 2: Move the script and update the workflow**

```bash
mkdir -p scripts/hitl
git mv scripts/wipe-superpowers-docs.sh scripts/hitl/wipe-superpowers-docs.sh
```

In `.github/workflows/wipe-superpowers-docs.yml` change the last line to:

```yaml
        run: scripts/hitl/wipe-superpowers-docs.sh --push
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `pnpm test -- scripts/__tests__/wipe-superpowers-docs.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 4: Commit**

```bash
git add -A scripts .github/workflows/wipe-superpowers-docs.yml
git commit -m "chore(scripts): move the wipe script under scripts/hitl"
```

---

### Task 3: the slice-1 doctrine edits, the template cut, `composeHitl`, `renderAll`, and the drift test

**Files:**
- Modify: `HITL.md` (two places), `.claude/agents/implementer.md:29-31` and `:42`, `.claude/agents/fixer.md:31`
- Create: `templates/HITL.md`, `templates/claude/agents/*.md` (6), `templates/claude/commands/*.md` (6), `templates/claude/hooks/unreviewed-artifact.sh`, `templates/claude/review-context.md`, `templates/claude/fixtures/spec-fixture-design.md`, `templates/claude/fixtures/plans/*.md` (2), `templates/claude/settings.hook.json`, `templates/scripts/wipe-superpowers-docs.sh`, `templates/ci/github-actions/wipe-superpowers-docs.yml`
- Modify: `installer/lib.mjs` (add `composeHitl`, `renderAll`)
- Test: `scripts/__tests__/drift.test.ts`

**Interfaces:**
- Consumes: `ownedFiles`, `TESTING_ORDER` from Task 1.
- Produces: `composeHitl(pluginRoot, testing: string[]): string`; `renderAll(pluginRoot, choices): Map<repoPath, { content: string, executable: boolean }>`; `THIS_REPO_CHOICES = { provider: "github", ci: "github-actions", testing: [], gates: ["pnpm test", "pnpm format:check"] }` exported for the drift test and for slice 5's self-adopt.

- [ ] **Step 1: Write the failing drift test**

```ts
// scripts/__tests__/drift.test.ts
// This repository is the first consumer of its own templates: every owned file here must be
// byte-for-byte what /hitl:init renders with this repository's choices. review-context.md is
// repo-specific by definition and is the one exception.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { THIS_REPO_CHOICES, renderAll } from "../../installer/lib.mjs";

const ROOT = process.cwd();
const EXCEPT = new Set([".claude/review-context.md"]);

describe("this repository equals its own render", () => {
  const rendered = renderAll(ROOT, THIS_REPO_CHOICES);

  for (const [repoPath, { content, executable }] of rendered) {
    if (EXCEPT.has(repoPath)) continue;
    it(`${repoPath} matches its template`, () => {
      expect(readFileSync(join(ROOT, repoPath), "utf8")).toBe(content);
    });
    if (executable) {
      it(`${repoPath} is executable`, () => {
        expect(statSync(join(ROOT, repoPath)).mode & 0o111).not.toBe(0);
      });
    }
  }

  it("renders the workflow for this repository (ci: github-actions)", () => {
    expect(rendered.has(".github/workflows/wipe-superpowers-docs.yml")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test -- scripts/__tests__/drift.test.ts`
Expected: FAIL — `renderAll is not a function` (or `THIS_REPO_CHOICES` undefined).

- [ ] **Step 3: Make the three doctrine edits in this repository's copies**

In `HITL.md`, § Specs and plans, first bullet: replace

```
  life of a feature branch, and a workflow deletes them once the feature lands on
  `main`.
```

with

```
  life of a feature branch; a workflow deletes them once the feature lands on `main`, and
  where no such job is installed they are deleted by hand after merge.
```

In `HITL.md`, `### Where things live`, replace the paragraph with:

```
`.claude/agents/` (reviewer, implementer, fixer, handover agents) · `.claude/commands/`
(`/review-spec`, `/review-plan`, `/handover`, `/implement-stack`, `/umbrella-pr`) ·
`.claude/hooks/` and `.claude/settings.json` (the Stop hook above, declared for everyone who
clones the repo) · `.claude/review-context.md` (repo-specific reviewer context) ·
`.claude/reviews/` (gitignored review output) · `scripts/hitl/` (the PR shim and the wipe
script) · `.claude/hitl.json` (install metadata written by `/hitl:init`, read by nothing at
run time) · `docs/superpowers/` (transient specs, plans, handover).
```

In `.claude/agents/implementer.md` replace the "Local gates before you report done" bullet's first sentence:

```
- **Local gates before you report done.** Run every gate named under `## Local gates` in
  `AGENTS.md` — unless the plan's Global Constraints state
```

(keep the rest of the bullet as it is), and in its `## Reply` list replace the example on line 2 with:

```
2. gates run and results (e.g. `pnpm test ✔ · pnpm lint ✔`, or `no gate named yet`)
```

In `.claude/agents/fixer.md` replace the Gates bullet's first sentence:

```
- **Gates.** Run the gates named under `## Local gates` in `AGENTS.md` for what you touched
  before reporting done. If
```

(keep the rest).

- [ ] **Step 4: Cut the templates by copying**

```bash
mkdir -p templates/claude/agents templates/claude/commands templates/claude/hooks \
         templates/claude/fixtures/plans templates/scripts templates/ci/github-actions
cp HITL.md templates/HITL.md
cp .claude/agents/*.md templates/claude/agents/
cp .claude/commands/*.md templates/claude/commands/
cp .claude/hooks/unreviewed-artifact.sh templates/claude/hooks/
cp .claude/review-context.md templates/claude/review-context.md
cp .claude/fixtures/spec-fixture-design.md templates/claude/fixtures/
cp .claude/fixtures/plans/*.md templates/claude/fixtures/plans/
cp scripts/hitl/wipe-superpowers-docs.sh templates/scripts/
cp .github/workflows/wipe-superpowers-docs.yml templates/ci/github-actions/
chmod +x templates/claude/hooks/unreviewed-artifact.sh templates/scripts/wipe-superpowers-docs.sh
```

Then make `templates/claude/review-context.md` the generic placeholder file the spec describes (this repository's copy keeps its own anchors — that is the drift exception):

```markdown
# Review context (repo-owned)

Reviewers read this file after `HITL.md`, `AGENTS.md` and `CONTEXT.md` (if present). It
holds what those do not say and a reviewer needs. Keep it short; if a rule belongs in
`AGENTS.md`, put it there.

## Scare score anchors

- 1–2 — config, docs, copy.
- 3–4 — a standard feature or fix with tests and a small blast radius.
- 5–6 — (name the change class that is risky in this repository, e.g. a schema migration
  or a shared component; leave this line until you know)
- 7–8 — (name the change class that needs a second human, e.g. auth, money, deletion)
- 9–10 — changes the chain itself: a gate, the round rule, or what a terminal state is.

## Anchors reviewers most often get wrong here

- (one line per recurring mis-call, added as they happen; delete this line when the first
  real one lands)
```

And write the hook entry template:

```json
// templates/claude/settings.hook.json
{
  "type": "command",
  "command": "\"${CLAUDE_PROJECT_DIR}/.claude/hooks/unreviewed-artifact.sh\""
}
```

- [ ] **Step 5: Add `composeHitl`, `renderAll` and `THIS_REPO_CHOICES` to `installer/lib.mjs`**

```js
export const THIS_REPO_CHOICES = {
  provider: "github",
  ci: "github-actions",
  testing: [],
  gates: ["pnpm test", "pnpm format:check"],
};

/** HITL.md = the core doctrine, then "## Testing and gates" + the chosen fragments in TESTING_ORDER. */
export function composeHitl(pluginRoot, testing) {
  const core = readFileSync(join(pluginRoot, "templates/HITL.md"), "utf8");
  const chosen = TESTING_ORDER.filter((t) => testing.includes(t));
  if (chosen.length === 0) return core;
  const fragments = chosen.map((t) =>
    readFileSync(join(pluginRoot, `templates/testing/${t}.md`), "utf8").trimEnd(),
  );
  return `${core.trimEnd()}\n\n## Testing and gates\n\n${fragments.join("\n\n")}\n`;
}

/** Every owned file rendered for the choices: repoPath -> { content, executable }. */
export function renderAll(pluginRoot, choices) {
  const out = new Map();
  for (const f of ownedFiles(choices)) {
    const content =
      f.template === null
        ? composeHitl(pluginRoot, choices.testing)
        : readFileSync(join(pluginRoot, "templates", f.template), "utf8");
    out.set(f.repoPath, { content, executable: f.executable });
  }
  return out;
}
```

- [ ] **Step 6: Run the drift test and the whole suite**

Run: `pnpm test`
Expected: PASS. The drift test lists one `matches its template` test per owned file (18 after the exception) plus two executable checks and the workflow check. If any file fails, the two copies differ: fix the copy that is wrong, never the test.

- [ ] **Step 7: Commit**

```bash
git add HITL.md .claude/agents/implementer.md .claude/agents/fixer.md templates installer/lib.mjs scripts/__tests__/drift.test.ts
git commit -m "feat(templates): cut the templates from .claude and prove this repo is their render"
```

---

### Task 4: `render.mjs` writes an install into an empty repository

**Files:**
- Modify: `installer/lib.mjs` (add `manifestFor`, `withMarkerBlock`, `withClaudeLine`, `mergeSettings`, `readmeBlock`, `gitignoreBlock`, `collisions`)
- Create: `installer/render.mjs`
- Test: `scripts/__tests__/render.test.ts`

**Interfaces:**
- Consumes: `renderAll`, `sha256`, `pluginVersion`, `readManifest`, `OWNED_DIRS`, `ownedFiles` from Tasks 1 and 3.
- Produces: CLI `node installer/render.mjs --repo <dir> --plugin-root <dir> --answers <json file>`; stdout JSON `{ "wrote": string[], "appended": string[], "kept": string[], "settings": "added" | "present", "manifest": Manifest }` on exit 0. `lib.mjs` gains: `manifestFor(version, choices, rendered): Manifest`; `withMarkerBlock(existing: string | null, block: string): { text, changed }`; `withClaudeLine(existing: string | null): { text, changed }`; `mergeSettings(existingText: string | null, hookEntry: object): { text, added }`; `readmeBlock(version: string): string`; `gitignoreBlock(): string`; `collisions(repoRoot, choices): string[]`; constants `BLOCK_START = "<!-- hitl:start -->"`, `BLOCK_END = "<!-- hitl:end -->"`. Slice 3 adds the `AGENTS.md` block through the same `withMarkerBlock` helper.

- [ ] **Step 1: Write the failing test**

```ts
// scripts/__tests__/render.test.ts
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PLUGIN_ROOT = process.cwd();
const RENDER = join(PLUGIN_ROOT, "installer/render.mjs");

function tempRepo(files: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "hitl-render-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

const ANSWERS = { provider: "github", ci: "github-actions", testing: [], gates: ["pnpm test"] };

function render(repo: string, answers: object = ANSWERS) {
  const answersPath = join(repo, "..", `answers-${Date.now()}-${Math.random()}.json`);
  writeFileSync(answersPath, JSON.stringify(answers));
  const r = spawnSync(
    "node",
    [RENDER, "--repo", repo, "--plugin-root", PLUGIN_ROOT, "--answers", answersPath],
    { encoding: "utf8" },
  );
  return { ...r, json: r.stdout ? JSON.parse(r.stdout) : null };
}

describe("render.mjs on an empty repository", () => {
  it("writes every owned file, executable where needed", () => {
    const repo = tempRepo();
    const r = render(repo);
    expect(r.status).toBe(0);
    for (const p of [
      "HITL.md",
      ".claude/agents/fixer.md",
      ".claude/commands/implement-stack.md",
      ".claude/hooks/unreviewed-artifact.sh",
      ".claude/review-context.md",
      ".claude/fixtures/spec-fixture-design.md",
      "scripts/hitl/wipe-superpowers-docs.sh",
      ".github/workflows/wipe-superpowers-docs.yml",
    ]) {
      expect(existsSync(join(repo, p)), p).toBe(true);
    }
    expect(statSync(join(repo, ".claude/hooks/unreviewed-artifact.sh")).mode & 0o111).not.toBe(0);
    expect(r.json.wrote).toContain("HITL.md");
  });

  it("creates CLAUDE.md with the @HITL.md line and appends it to an existing one", () => {
    const fresh = tempRepo();
    render(fresh);
    expect(readFileSync(join(fresh, "CLAUDE.md"), "utf8")).toBe("@HITL.md\n");

    const existing = tempRepo({ "CLAUDE.md": "# Mine\n\nRules.\n" });
    render(existing);
    expect(readFileSync(join(existing, "CLAUDE.md"), "utf8")).toBe("# Mine\n\nRules.\n\n@HITL.md\n");
  });

  it("appends marked blocks to README.md and .gitignore, creating them if absent", () => {
    const repo = tempRepo({ "README.md": "# app\n" });
    const r = render(repo);
    const readme = readFileSync(join(repo, "README.md"), "utf8");
    expect(readme.startsWith("# app\n")).toBe(true);
    expect(readme).toContain("<!-- hitl:start -->");
    expect(readme).toContain("## How changes land here");
    expect(readme).toContain("hitl 0.1.0");
    expect(readme).toContain("<!-- hitl:end -->");
    const ignore = readFileSync(join(repo, ".gitignore"), "utf8");
    expect(ignore).toContain(".claude/reviews/");
    expect(ignore).toContain(".claude/fixtures/scratch/");
    expect(ignore).toContain(".claude/settings.local.json");
    expect(r.json.appended).toEqual(expect.arrayContaining(["CLAUDE.md", "README.md", ".gitignore"]));
  });

  it("merges the Stop hook into settings.json and keeps other hooks", () => {
    const repo = tempRepo({
      ".claude/settings.json": JSON.stringify({
        hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "echo hi" }] }] },
        permissions: { allow: ["Bash(ls)"] },
      }),
    });
    const r = render(repo);
    const settings = JSON.parse(readFileSync(join(repo, ".claude/settings.json"), "utf8"));
    expect(settings.permissions.allow).toEqual(["Bash(ls)"]);
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    expect(JSON.stringify(settings.hooks.Stop)).toContain("unreviewed-artifact.sh");
    expect(r.json.settings).toBe("added");
  });

  it("writes the manifest with the version, the choices and a hash per owned file", () => {
    const repo = tempRepo();
    render(repo);
    const manifest = JSON.parse(readFileSync(join(repo, ".claude/hitl.json"), "utf8"));
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.provider).toBe("github");
    expect(manifest.ci).toBe("github-actions");
    expect(manifest.testing).toEqual([]);
    expect(manifest).not.toHaveProperty("gates");
    expect(Object.keys(manifest.files)).toHaveLength(20);
    expect(manifest.files["HITL.md"]).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(manifest.files)).toEqual([...Object.keys(manifest.files)].sort());
  });

  it("omits the workflow when ci is none", () => {
    const repo = tempRepo();
    render(repo, { ...ANSWERS, ci: "none" });
    expect(existsSync(join(repo, ".github/workflows/wipe-superpowers-docs.yml"))).toBe(false);
    const manifest = JSON.parse(readFileSync(join(repo, ".claude/hitl.json"), "utf8"));
    expect(manifest.ci).toBe("none");
    expect(Object.keys(manifest.files)).toHaveLength(19);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test -- scripts/__tests__/render.test.ts`
Expected: FAIL — `Cannot find module installer/render.mjs` (spawn exit code 1, `json` null).

- [ ] **Step 3: Add the helpers to `installer/lib.mjs`**

```js
export const BLOCK_START = "<!-- hitl:start -->";
export const BLOCK_END = "<!-- hitl:end -->";

function withTrailingNewline(text) {
  return text === "" || text.endsWith("\n") ? text : `${text}\n`;
}

/** Append a marked block to a file's text; a file already carrying the markers is left alone. */
export function withMarkerBlock(existing, block) {
  if (existing !== null && existing.includes(BLOCK_START)) return { text: existing, changed: false };
  const base = existing === null ? "" : withTrailingNewline(existing);
  const gap = base === "" ? "" : "\n";
  return { text: `${base}${gap}${BLOCK_START}\n${block.trimEnd()}\n${BLOCK_END}\n`, changed: true };
}

/** Append the `@HITL.md` import line to CLAUDE.md; recognised and left alone on a re-run. */
export function withClaudeLine(existing) {
  if (existing !== null && existing.split("\n").includes("@HITL.md")) {
    return { text: existing, changed: false };
  }
  const base = existing === null ? "" : withTrailingNewline(existing);
  const gap = base === "" ? "" : "\n";
  return { text: `${base}${gap}@HITL.md\n`, changed: true };
}

/** Merge the Stop hook entry into settings.json text; other hooks and keys are kept. Throws on bad JSON. */
export function mergeSettings(existingText, hookEntry) {
  const settings = existingText === null ? {} : JSON.parse(existingText);
  settings.hooks ??= {};
  settings.hooks.Stop ??= [];
  const present = JSON.stringify(settings.hooks.Stop).includes("unreviewed-artifact.sh");
  if (!present) settings.hooks.Stop.push({ hooks: [hookEntry] });
  return { text: `${JSON.stringify(settings, null, 2)}\n`, added: !present };
}

export function readmeBlock(version) {
  return `## How changes land here

Every feature and bugfix follows a human-in-the-loop chain: brainstorm → spec → cold spec
review → plans → cold plan review → handover → stacked slice PRs, each implemented, reviewed
and fixed by subagents, with a human deciding at every gate. The doctrine is \`HITL.md\`.

- Specs and plans live under \`docs/superpowers/\` for the life of a feature branch and are
  removed from \`main\` after the feature merges. The PR description is the durable record.
- \`.claude/\` (agents, commands, hook) and \`HITL.md\` are reviewed like code: change them by
  pull request.
- Installed by hitl ${version}. \`/hitl:diff\` shows what changed upstream since;
  \`/hitl:help\` explains the state of this install.
- Prerequisites: Claude Code with the superpowers plugin, \`git\`, \`gh\`; \`/grill-me\` from
  Matt Pocock's skills is the recommended start for a feature whose shape is unclear.`;
}

export function gitignoreBlock() {
  return `# hitl: review output and dry-run scratch space are never committed.
.claude/reviews/
.claude/fixtures/scratch/
.claude/settings.local.json`;
}

/** Owned paths that already exist: directories for OWNED_DIRS, files for everything else. */
export function collisions(repoRoot, choices) {
  const hits = OWNED_DIRS.filter((d) => existsSync(join(repoRoot, d)));
  for (const f of ownedFiles(choices)) {
    const insideOwnedDir = OWNED_DIRS.some((d) => f.repoPath.startsWith(`${d}/`));
    if (!insideOwnedDir && existsSync(join(repoRoot, f.repoPath))) hits.push(f.repoPath);
  }
  return hits;
}

/** The manifest for a render: version, the recorded choices (never gates), sorted file hashes. */
export function manifestFor(version, choices, rendered) {
  const files = {};
  for (const p of [...rendered.keys()].sort()) files[p] = sha256(rendered.get(p).content);
  return { version, provider: choices.provider, ci: choices.ci, testing: [...choices.testing], files };
}
```

- [ ] **Step 4: Write `installer/render.mjs`**

```js
#!/usr/bin/env node
// /hitl:init's writer. Refuses before its first write (manifest present, collision, bad
// settings.json); otherwise writes every owned file, the appended blocks, the merged hook
// and the manifest, and prints one JSON report. Exit: 0 ok · 1 usage · 2 error · 3 refused.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  MANIFEST_PATH,
  collisions,
  gitignoreBlock,
  manifestFor,
  mergeSettings,
  pluginVersion,
  readManifest,
  readmeBlock,
  renderAll,
  withClaudeLine,
  withMarkerBlock,
} from "./lib.mjs";

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

function readIfPresent(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function writeFile(repoRoot, rel, text, executable = false) {
  const abs = join(repoRoot, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text);
  if (executable) chmodSync(abs, 0o755);
}

export function run(args) {
  const { repo, "plugin-root": pluginRoot, answers: answersPath } = args;
  if (!repo || !pluginRoot || !answersPath) return { code: 1, out: { error: "usage: --repo <dir> --plugin-root <dir> --answers <file>" } };
  const choices = JSON.parse(readFileSync(answersPath, "utf8"));
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

  // Writes.
  const rendered = renderAll(pluginRoot, choices);
  const wrote = [];
  for (const [rel, { content, executable }] of rendered) {
    writeFile(repo, rel, content, executable);
    wrote.push(rel);
  }
  const appended = [];
  const kept = [];
  const append = (rel, result) => {
    if (result.changed) {
      writeFile(repo, rel, result.text);
      appended.push(rel);
    } else kept.push(rel);
  };
  append("CLAUDE.md", withClaudeLine(readIfPresent(join(repo, "CLAUDE.md"))));
  append("README.md", withMarkerBlock(readIfPresent(join(repo, "README.md")), readmeBlock(version)));
  append(".gitignore", withMarkerBlock(readIfPresent(join(repo, ".gitignore")), gitignoreBlock()));
  writeFile(repo, ".claude/settings.json", settings.text);
  const manifestOut = manifestFor(version, choices, rendered);
  writeFile(repo, MANIFEST_PATH, `${JSON.stringify(manifestOut, null, 2)}\n`);

  return { code: 0, out: { wrote, appended, kept, settings: settings.added ? "added" : "present", manifest: manifestOut } };
}

const args = parseArgs(process.argv.slice(2));
const result = args ? run(args) : { code: 1, out: { error: "usage: --repo <dir> --plugin-root <dir> --answers <file>" } };
process.stdout.write(`${JSON.stringify(result.out, null, 2)}\n`);
process.exit(result.code);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test -- scripts/__tests__/render.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add installer scripts/__tests__/render.test.ts
git commit -m "feat(installer): render.mjs writes an install and its manifest"
```

---

### Task 5: refusals — manifest present, collision, unparsable settings

**Files:**
- Test: `scripts/__tests__/render.test.ts` (append a `describe`)
- Modify: `installer/render.mjs` only if a test fails (the refusal branches already exist; this task proves them)

**Interfaces:**
- Consumes: the CLI from Task 4.
- Produces: the refusal contract slices 3 and 4 rely on: exit 3 with `{ refused: "manifest-present", version }`, `{ refused: "collision", paths }` or `{ refused: "settings-unparsable", error }`, and no file written.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/__tests__/render.test.ts` (the helpers `tempRepo`, `render`, `ANSWERS` are in scope):

```ts
import { readdirSync } from "node:fs";

function tree(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((p) => !p.startsWith(".git/") && p !== ".git")
    .sort();
}

describe("render.mjs refusals", () => {
  it("refuses a second run with the installed version and writes nothing", () => {
    const repo = tempRepo();
    render(repo);
    const before = tree(repo);
    const r = render(repo);
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "manifest-present", version: "0.1.0" });
    expect(tree(repo)).toEqual(before);
  });

  it("refuses on an owned filename inside .claude/commands but not on a foreign one", () => {
    const foreign = tempRepo({ ".claude/commands/deploy.md": "mine\n" });
    expect(render(foreign).status).toBe(0);
    expect(readFileSync(join(foreign, ".claude/commands/deploy.md"), "utf8")).toBe("mine\n");

    const owned = tempRepo({ ".claude/commands/review-spec.md": "old\n" });
    const r = render(owned);
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "collision", paths: [".claude/commands/review-spec.md"] });
    expect(existsSync(join(owned, "HITL.md"))).toBe(false);
  });

  it("refuses on scripts/hitl/ and .claude/fixtures/ as directories", () => {
    const repo = tempRepo({ "scripts/hitl/other.sh": "", ".claude/fixtures/mine.md": "" });
    const r = render(repo);
    expect(r.status).toBe(3);
    expect(r.json.refused).toBe("collision");
    expect(r.json.paths).toEqual(expect.arrayContaining(["scripts/hitl", ".claude/fixtures"]));
  });

  it("refuses on HITL.md, review-context.md and the workflow as files", () => {
    for (const p of [
      "HITL.md",
      ".claude/review-context.md",
      ".github/workflows/wipe-superpowers-docs.yml",
    ]) {
      const repo = tempRepo({ [p]: "x\n" });
      const r = render(repo);
      expect(r.status, p).toBe(3);
      expect(r.json.paths, p).toEqual([p]);
    }
  });

  it("refuses an unparsable settings.json before writing anything", () => {
    const repo = tempRepo({ ".claude/settings.json": "{ not json" });
    const before = tree(repo);
    const r = render(repo);
    expect(r.status).toBe(3);
    expect(r.json.refused).toBe("settings-unparsable");
    expect(tree(repo)).toEqual(before);
  });
});
```

- [ ] **Step 2: Run them**

Run: `pnpm test -- scripts/__tests__/render.test.ts`
Expected: PASS if Task 4's branches are correct. If a refusal test fails, fix `render.mjs` (the branch order is: manifest, collisions, settings, then writes) and re-run until green. Do not weaken a test.

- [ ] **Step 3: Commit**

```bash
git add scripts/__tests__/render.test.ts installer/render.mjs
git commit -m "test(installer): render.mjs refuses on manifest, collision and bad settings"
```

---

### Task 6: the `/hitl:init` prompt and this repository's `AGENTS.md`

**Files:**
- Create: `commands/init.md`
- Modify: `AGENTS.md` (§ Local gates first bullet; § Test-driven development first bullet)
- Modify: `README.md` (the `## Developing` section gains one line)

**Interfaces:**
- Consumes: the `render.mjs` CLI and its refusal contract.
- Produces: `/hitl:init [--ci github-actions|none]` (slice 3 replaces the flag with the interview; slice 4 adds `--adopt`).

- [ ] **Step 1: Write `commands/init.md`**

```markdown
---
description: Install the hitl workflow into this repository from the plugin's templates. Usage: /hitl:init [--ci github-actions|none]
argument-hint: [--ci github-actions|none]
---

You are installing the hitl delivery workflow into the repository at the current working
directory. The plugin ships no runtime: after this command the repository owns every file
written and changes it by pull request. You orchestrate; `render.mjs` does every write.

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

## 2. Build the answers

This version takes its answers from flags; discovery and the interview arrive in a later
version. `--ci` defaults to `none`.

```bash
ANSWERS=$(mktemp)
cat > "$ANSWERS" <<EOF
{ "provider": "github", "ci": "<github-actions|none from --ci>", "testing": [], "gates": [] }
EOF
```

## 3. Render

```bash
node "${CLAUDE_PLUGIN_ROOT}/installer/render.mjs" --repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}" --answers "$ANSWERS"
```

Read the JSON it prints and act on the exit code:

- `3` with `refused: "manifest-present"` → say "hitl is already initialised at <version>;
  run `/hitl:diff` to see what changed upstream." Stop.
- `3` with `refused: "collision"` → list every path, then: "These files are owned by hitl and
  already exist. If this repository was ejected from an earlier hitl or from treasury-2, run
  `/hitl:init --adopt` (available in a later version). Otherwise remove them and re-run.
  Nothing was written." Stop.
- `3` with `refused: "settings-unparsable"` → print the error and "fix `.claude/settings.json`
  and re-run; nothing was written." Stop.
- `1` or `2` → print the output verbatim and stop.
- `0` → continue.

## 4. Report

In plain words: the count and list of files written, the files appended (`CLAUDE.md`,
`README.md`, `.gitignore`) and the ones left alone because the block was already there,
whether the Stop hook was added to `.claude/settings.json` or already present, and the
manifest path `.claude/hitl.json`. End with:

> Review the changes and open a pull request. From now on `.claude/` and `HITL.md` are
> reviewed like code. Nothing was committed.

Never commit. Never open a PR.
```

- [ ] **Step 2: Update `AGENTS.md`**

Replace the first bullet under `## Local gates` with:

```
- `pnpm test` — the script tests under `scripts/__tests__/` (the Stop hook, the wipe
  script, the installer under `installer/`, every script this plugin installs, and the
  drift test that proves this repository equals its own render). Run before a PR opens.
```

Replace the first bullet under `## Test-driven development, here` with:

```
- Everything under `scripts/`, `installer/` and `.claude/hooks/` has behaviour of its own
  and is tested under `scripts/__tests__/`. `templates/` is tested by the drift test: this
  repository's own `.claude/`, `HITL.md`, `scripts/hitl/` and wipe workflow must equal what
  `installer/` renders from `templates/` with this repository's choices, except
  `.claude/review-context.md`, which is repo-specific. Tests that read the disk use temp
  directories or `scripts/__fixtures__/`, never `docs/superpowers/`, which the wipe deletes.
```

- [ ] **Step 3: Add the developing note to `README.md`**

Under `## Developing`, after the code block, add:

```
The plugin's own `.claude/` is rendered from `templates/`; `pnpm test` fails if the two
drift. Edit the template and its copy together.
```

- [ ] **Step 4: Dry-run the prompt**

Install the working tree as a plugin from a scratch marketplace and run it on a temp repo:

```bash
T=$(mktemp -d) && git -C "$T" init -q -b main && git -C "$T" remote add origin https://github.com/example/app.git
# In a Claude Code session opened in $T with this repository added as a local marketplace
# (claude plugin marketplace add /path/to/hitl && claude plugin install hitl@hitl):
#   /hitl:init --ci none
```

Expected: the report names 19 files written, `CLAUDE.md`, `README.md`, `.gitignore` appended, hook added, and the closing sentence. Running `/hitl:init` again reports "already initialised at 0.1.0". If the plugin cannot be installed locally on this machine, run `render.mjs` by hand with the same answers and check the same report; note in the PR body that the prompt was exercised by hand.

- [ ] **Step 5: Run the gates**

Run: `pnpm test && pnpm format:check`
Expected: both green. If `format:check` flags `installer/*.mjs` or the plugin JSON, run `pnpm format` and re-check.

- [ ] **Step 6: Commit**

```bash
git add commands/init.md AGENTS.md README.md
git commit -m "feat(commands): /hitl:init from flags; AGENTS.md names installer and templates as tested"
```
