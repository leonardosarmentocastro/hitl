# The `.hitl/` folder — slice 1: fresh install in the new layout — Implementation Plan

**Reviewed:** round 1 (2026-11-16).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Owns:** `/hitl:init` writes the doctrine, the reviewer context and the install record under `.hitl/`, every installed file names those paths, the plugin recognises the new install record, and this repository itself is on the new layout at 0.3.0.

**Goal:** A fresh install produces `.hitl/HITL.md`, `.hitl/review-context.md`, `.hitl/manifest.json` and `@.hitl/HITL.md` in `CLAUDE.md`, with nothing of hitl's at the repository root.

**Architecture:** The paths are constants and one list in `installer/lib.mjs`; everything else follows them. Templates and hand-written command text are edited to name the new paths, then this repository's own copy is re-rendered from them.

**Tech Stack:** Node ≥ 24 ESM (`.mjs`), bash, vitest (`scripts/__tests__/*.test.ts`), Prettier (`printWidth: 100`, Markdown never formatted).

**Spec:** `docs/superpowers/specs/2026-11-16-hitl-dot-folder-design.md` — section 1, and the first and last-but-one Acceptance bullets.

## Global Constraints

- New paths, verbatim: `.hitl/HITL.md`, `.hitl/review-context.md`, `.hitl/manifest.json`, import line `@.hitl/HITL.md`.
- Old paths, verbatim: `HITL.md` (root), `.claude/review-context.md`, `.claude/hitl.json`, import line `@HITL.md`.
- Plugin version becomes `0.3.0`.
- `.claude/fixtures/`, `.claude/reviews/`, `.claude/worktrees/`, `scripts/hitl/` and everything Claude Code loads do not move.
- No-install mode does not change in meaning; `doctrine/HITL.md` stays the plugin's doctrine path.
- This slice does **not** teach the upgrade, the old-layout refusal or adopt's move (slices 2, 3, 4). Between this slice and slice 3 the plugin sees an old-layout repository as not installed; that is accepted in the spec.
- Local gates before reporting done: `pnpm test` and `pnpm format:check`.
- File tripwire: this slice crosses ~20 files, because every agent template, most command texts and their rendered copies in this repository name a moved path. It is one capability (the layout), and splitting it would leave templates and their own render disagreeing, which the drift test forbids.
- Tests that read the disk use temp directories, never `docs/superpowers/`.
- Tasks 1 to 3 are committed with the `drift`, `self-manifest` and `plugin-drift` suites red: the templates lead and this repository's own copy follows in Task 4. The slice ends green; no single commit before Task 4 is expected to.
- Known side effect until slice 4: because `collisions` now counts old-path files, `/hitl:init --adopt` accepts a repository whose only hitl file is a root `HITL.md` and records it without moving anything. Feature-branch only; slice 4 adds the move.

## Review Focus

- A repository that already has a root `HITL.md` and no manifest: fresh init must refuse, not install a second doctrine (Task 1 test).
- A repository that already has `.hitl/` holding unrelated files: init must proceed (Task 1 test).
- A `CLAUDE.md` that already carries `@.hitl/HITL.md`: init must not append it twice (Task 1 test).
- A stale reference left in a hand-written plugin command (they are not rendered, so the drift tests cannot see them): the old-path scan in Task 3 covers `commands/*.md`.
- `/hitl:customize`'s anchor search missing `.hitl/`, so a knob in the doctrine is "not found": Task 3's knob-anchors assertion.

---

### Task 1: The layout constants and the fresh-install writer

**Files:**
- Modify: `installer/lib.mjs` (`MANIFEST_PATH`, `ownedFiles`, `withClaudeLine`, `readmeBlock`, `collisions`)
- Modify: `installer/customize-testing.mjs:50-65` (doctrine path)
- Modify: `installer/help.mjs:68` (`ejected` test)
- Modify: `.claude-plugin/plugin.json` (version)
- Test: `scripts/__tests__/lib.test.ts`, `scripts/__tests__/render.test.ts`, `scripts/__tests__/customize-testing.test.ts`, `scripts/__tests__/help.test.ts`, `scripts/__tests__/adopt.test.ts`, `scripts/__tests__/diff.test.ts`

**Interfaces:**
- Produces, all exported from `installer/lib.mjs`:
  - `MANIFEST_PATH = ".hitl/manifest.json"`
  - `OLD_MANIFEST_PATH = ".claude/hitl.json"`
  - `DOCTRINE_PATH = ".hitl/HITL.md"`
  - `CLAUDE_LINE = "@.hitl/HITL.md"`, `OLD_CLAUDE_LINE = "@HITL.md"`
  - `MOVES = [{ from: "HITL.md", to: ".hitl/HITL.md" }, { from: ".claude/review-context.md", to: ".hitl/review-context.md" }]`
  - `ownedFiles(choices)` returns `MOVES[*].to` in place of the old paths (the review-context template stays at `templates/claude/review-context.md`).
  - `collisions(repoRoot, choices)` additionally returns every `MOVES[*].from` path that exists.

- [ ] **Step 1: Write the failing tests**

In `scripts/__tests__/lib.test.ts`:

```ts
it("owns the doctrine and the reviewer context under .hitl/", () => {
  const paths = ownedFiles(DEFAULT_CHOICES).map((f) => f.repoPath);
  expect(paths).toContain(".hitl/HITL.md");
  expect(paths).toContain(".hitl/review-context.md");
  expect(paths).not.toContain("HITL.md");
  expect(paths).not.toContain(".claude/review-context.md");
  expect(MANIFEST_PATH).toBe(".hitl/manifest.json");
});

it("appends the .hitl import line once", () => {
  expect(withClaudeLine(null)).toEqual({ text: "@.hitl/HITL.md\n", changed: true });
  expect(withClaudeLine("# x\n\n@.hitl/HITL.md\n").changed).toBe(false);
});

it("names the doctrine by its new path in the README block", () => {
  const block = readmeBlock("0.3.0");
  expect(block).toContain("`.hitl/HITL.md`");
  expect(block).not.toMatch(/(?<!\.hitl\/)HITL\.md/);
});

it("counts a file at an old path as a collision", () => {
  const repo = mkdtempSync(join(tmpdir(), "hitl-old-"));
  writeFileSync(join(repo, "HITL.md"), "mine\n");
  expect(collisions(repo, DEFAULT_CHOICES)).toEqual(["HITL.md"]);
});
```

In `scripts/__tests__/render.test.ts` (a fresh install into an empty temp repository, using the file's existing helper for running `render.mjs`):

```ts
it("writes the three hitl files under .hitl/ and nothing of its own at the root", () => {
  // run render.mjs --mode write into an empty repo
  expect(existsSync(join(repo, ".hitl/HITL.md"))).toBe(true);
  expect(existsSync(join(repo, ".hitl/review-context.md"))).toBe(true);
  expect(existsSync(join(repo, ".hitl/manifest.json"))).toBe(true);
  expect(existsSync(join(repo, "HITL.md"))).toBe(false);
  expect(existsSync(join(repo, ".claude/hitl.json"))).toBe(false);
  expect(readFileSync(join(repo, "CLAUDE.md"), "utf8")).toBe("@.hitl/HITL.md\n");
});

it("refuses when a root HITL.md exists and no manifest does", () => {
  // repo holds only HITL.md; run --mode check
  expect(out).toEqual({ refused: "collision", paths: ["HITL.md"] });
  expect(existsSync(join(repo, ".hitl"))).toBe(false);
});

it("installs into a repository whose .hitl/ holds unrelated files", () => {
  // repo holds .hitl/notes.txt; run --mode write; exit 0, notes.txt untouched
});
```

In `scripts/__tests__/help.test.ts`: a repository with `.claude/agents/` and `.hitl/HITL.md` and no manifest reports `state: "ejected"`; so does one with `.claude/agents/` and a root `HITL.md`.

In `scripts/__tests__/customize-testing.test.ts`: change the existing assertions to read and expect the doctrine at `.hitl/HITL.md` and `wrote` to contain `.hitl/HITL.md`.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test -- lib render help customize-testing`
Expected: the new tests FAIL (old paths returned).

- [ ] **Step 3: Implement**

In `installer/lib.mjs`: add the constants above; `ownedFiles` uses `DOCTRINE_PATH` and `.hitl/review-context.md`; `withClaudeLine` uses `CLAUDE_LINE`; `readmeBlock` says `` `.hitl/HITL.md` `` in both places it names the doctrine and "`.claude/` (agents, commands, hook) and `.hitl/` (the doctrine, the reviewer context) are reviewed like code"; `collisions` appends each existing `MOVES[*].from`. In `customize-testing.mjs` replace the two `"HITL.md"` literals with `DOCTRINE_PATH`. In `help.mjs` `ejected` is `.claude/agents` plus `DOCTRINE_PATH` or root `HITL.md`. Set `"version": "0.3.0"` in `.claude-plugin/plugin.json`.

- [ ] **Step 4: Update the existing tests that name an old path only as a path**

`adopt.test.ts`, `diff.test.ts`, `render.test.ts`, `lib.test.ts`: replace `HITL.md` → `.hitl/HITL.md`, `.claude/review-context.md` → `.hitl/review-context.md`, `.claude/hitl.json` → `.hitl/manifest.json` (prefer importing `MANIFEST_PATH`). Do not add upgrade or adopt-move behaviour here.

- [ ] **Step 5: Run the touched suites**

Run: `pnpm test -- lib render help customize-testing adopt diff`
Expected: PASS. (`drift`, `self-manifest`, `plugin-drift` and the runtime suites still fail until Tasks 2–4; that is expected.)

- [ ] **Step 6: Commit**

```bash
git add installer .claude-plugin scripts/__tests__
git commit -m "feat(installer): install the doctrine, reviewer context and manifest under .hitl/"
```

### Task 2: The plugin recognises the new install record

**Files:**
- Modify: `runtime/context.mjs:55`, `runtime/session.mjs:98`, `runtime/stop-hook.sh:47`, `installer/cleanup.mjs:6` (comment only; it already imports `MANIFEST_PATH`)
- Test: `scripts/__tests__/context.test.ts`, `scripts/__tests__/session.test.ts`, `scripts/__tests__/plugin-stop-hook.test.ts`, `scripts/__tests__/cleanup.test.ts`

**Interfaces:**
- Consumes: `MANIFEST_PATH` from `installer/lib.mjs` (Task 1).
- Produces: `mode: "installed"` exactly when `.hitl/manifest.json` exists at the repository top.

- [ ] **Step 1: Write the failing tests**

In each of the four suites, change the fixture that makes a repository "installed" to write `.hitl/manifest.json` and keep the existing assertions (`mode: "installed"`; `start` refuses `installed`; the plugin Stop hook exits 0 silently; cleanup uses `scripts/hitl/pr.sh`). Add to `context.test.ts`:

```ts
it("does not call a repository with only the old manifest path installed (slice 3 owns that case)", () => {
  // repo with .claude/hitl.json only
  expect(ctx.mode).toBe("no-install");
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm test -- context session plugin-stop-hook cleanup`
Expected: FAIL — the scripts still test `.claude/hitl.json`.

- [ ] **Step 3: Implement**

`context.mjs` and `session.mjs` import `MANIFEST_PATH` from `../installer/lib.mjs` (both already import from it) and use it in place of the literal. `stop-hook.sh`: `[ -f .hitl/manifest.json ] && exit 0`.

- [ ] **Step 4: Run to see them pass**

Run: `pnpm test -- context session plugin-stop-hook cleanup`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add runtime installer/cleanup.mjs scripts/__tests__
git commit -m "feat(runtime): detect an install by .hitl/manifest.json"
```

### Task 3: Every installed file and plugin command names the new paths

**Files:**
- Modify: `templates/HITL.md` (*Where things live*, *Review gates*: lines naming `.claude/review-context.md` and `.claude/hitl.json`; add `.hitl/` to *Where things live*)
- Modify: `templates/claude/agents/{spec-reviewer,plan-reviewer,slice-reviewer,adversarial-reviewer,security-reviewer,implementer,fixer}.md` (grounding steps)
- Modify: `templates/claude/review-context.md:3`
- Modify: `commands/brainstorming.md:52`, `commands/customize.md`, `commands/help.md`, `commands/init.md`, `commands/diff.md`
- Modify: `README.md` (the file table at lines ~165–171 and the prose at ~233)
- Create: `scripts/__tests__/old-paths.test.ts`
- Test: `scripts/__tests__/knob-anchors.test.ts`, `scripts/__tests__/brainstorming-command.test.ts`

**Interfaces:**
- Consumes: `renderAll`, `readmeBlock`, `DEFAULT_CHOICES` from `installer/lib.mjs`.
- Produces: `scripts/__tests__/old-paths.test.ts`, with `MOVE_SOURCE_ALLOWED: Record<string, string[]>` (file basename → exact allowed sentences), empty in this slice; slices 2, 3 and 4 add sentences to it.

- [ ] **Step 1: Write the failing test `scripts/__tests__/old-paths.test.ts`**

```ts
const BARE_DOCTRINE = /(?<!\.hitl\/)(?<!doctrine\/)HITL\.md/;
const OLD = [".claude/review-context.md", ".claude/hitl.json"];
// Exact sentences a hand-written command may carry although they name an old path: the source
// of a move, or the test for the old layout. Stripped before the scan; the rest of the file is
// still checked. Slices 2, 3 and 4 add their own sentences.
const MOVE_SOURCE_ALLOWED: Record<string, string[]> = {};

describe("nothing installed names an old path", () => {
  const rendered = renderAll(ROOT, { ...DEFAULT_CHOICES, testing: [...TESTING_ORDER] });
  for (const [path, { content }] of rendered)
    it(path, () => {
      expect(content).not.toMatch(BARE_DOCTRINE);
      for (const o of OLD) expect(content).not.toContain(o);
    });
  it("the README block", () => {
    expect(readmeBlock("0.3.0")).not.toMatch(BARE_DOCTRINE);
  });
});

describe("no hand-written plugin command names an old path", () => {
  // every commands/*.md that is not a pluginFiles() render
  for (const file of handWritten)
    it(file, () => {
      let text = readFileSync(join(ROOT, "commands", file), "utf8");
      for (const allowed of MOVE_SOURCE_ALLOWED[file] ?? []) {
        expect(text).toContain(allowed); // a stale allowance is a failure too
        text = text.replace(allowed, "");
      }
      expect(text).not.toMatch(BARE_DOCTRINE);
      for (const o of OLD) expect(text).not.toContain(o);
    });
});
```

`handWritten` is `readdirSync("commands")` minus the basenames of `pluginFiles()` entries under `commands/`. `TESTING_ORDER` is exported from `lib.mjs` if it is not already.

Add to `brainstorming-command.test.ts`: `expect(text).toContain("Read the repository's \`.hitl/HITL.md\`")`.
In `knob-anchors.test.ts`, point the doctrine and reviewer-context lookups at the new paths and assert `commands/customize.md` contains `.hitl/ AGENTS.md .claude/` in its anchor `grep`.

- [ ] **Step 2: Run to see it fail**

Run: `pnpm test -- old-paths knob-anchors brainstorming-command`
Expected: FAIL, naming each file that still holds an old path.

- [ ] **Step 3: Edit the text**

- Agents: `` `HITL.md` at the repo root (the workflow doctrine) `` → `` `.hitl/HITL.md` (the workflow doctrine) ``; `.claude/review-context.md` → `.hitl/review-context.md`.
- `templates/HITL.md`, *Where things live*: `.hitl/` (`HITL.md`, this doctrine; `review-context.md`, repo-specific reviewer context; `manifest.json`, install metadata written by `/hitl:init` — its presence tells the hitl plugin's commands and Stop hook that this repository is installed). Remove the two old entries. *Review gates*: `.hitl/review-context.md`. Leave every `hitl:mode no-install` branch as it is.
- `templates/claude/review-context.md:3`: "after `.hitl/HITL.md`, `AGENTS.md` and `CONTEXT.md`".
- `commands/brainstorming.md:52`: "Read the repository's `.hitl/HITL.md`".
- `commands/customize.md`: description, the knob table, both `grep` lines (`grep -rn --exclude-dir=worktrees "hitl:knob <id>" .hitl/ AGENTS.md .claude/`), the `diff`/`cp`/`patch` recipe and `.rej` name, and the manifest path.
- `commands/help.md:39`: "edit .hitl/HITL.md or .claude/ by pull request".
- `commands/init.md`: every `HITL.md` and `.claude/hitl.json`; in the `collision` branch add, naming no old path (the refusal's `paths` already lists them): "A doctrine or reviewer context from the earlier layout is in the way: `/hitl:init --adopt` moves it."
- `commands/diff.md`: `.claude/hitl.json` → `.hitl/manifest.json` (refusal texts, the staging line, the undo recipe). The move itself is slice 2.
- `README.md`: the table rows and the prose.

- [ ] **Step 4: Run to see it pass**

Run: `pnpm test -- old-paths knob-anchors brainstorming-command`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add templates commands README.md scripts/__tests__
git commit -m "feat(templates): name the .hitl/ paths in agents, doctrine and plugin commands"
```

### Task 4: This repository moves to the new layout

**Files:**
- Move: `HITL.md` → `.hitl/HITL.md`; `.claude/review-context.md` → `.hitl/review-context.md`
- Delete: `.claude/hitl.json`; Create: `.hitl/manifest.json`
- Modify: `CLAUDE.md`, `AGENTS.md`, `.claude/agents/*.md` (re-rendered), `doctrine/HITL.md` and the other plugin renders if they changed
- Test: `scripts/__tests__/drift.test.ts`, `scripts/__tests__/self-manifest.test.ts`, `scripts/__tests__/plugin-drift.test.ts`, `scripts/__tests__/pr-body.test.ts`, `scripts/__tests__/review-modes.test.ts`

- [ ] **Step 1: Point the self tests at the new paths**

`drift.test.ts`: `EXCEPT = new Set([".hitl/review-context.md"])`. `self-manifest.test.ts`: reads `MANIFEST_PATH`; the "unchanged except" file is `.hitl/review-context.md`. `pr-body.test.ts` and `review-modes.test.ts`: read the doctrine at `.hitl/HITL.md`.

- [ ] **Step 2: Run to see them fail**

Run: `pnpm test -- drift self-manifest plugin-drift pr-body review-modes`
Expected: FAIL — `.hitl/HITL.md` does not exist.

- [ ] **Step 3: Move and re-render**

```bash
mkdir -p .hitl
git mv HITL.md .hitl/HITL.md
git mv .claude/review-context.md .hitl/review-context.md
git rm -q .claude/hitl.json
node --input-type=module -e '
import { writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { THIS_REPO_CHOICES as c, renderAll } from "./installer/lib.mjs";
for (const [p, f] of renderAll(".", c)) {
  if (p === ".hitl/review-context.md") continue;
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, f.content);
  if (f.executable) chmodSync(p, 0o755);
}'
node --input-type=module -e 'import { THIS_REPO_CHOICES as c } from "./installer/lib.mjs"; console.log(JSON.stringify(c))' > /tmp/hitl-answers.json
node installer/adopt.mjs --repo . --plugin-root . --answers /tmp/hitl-answers.json
node installer/render-plugin.mjs --plugin-root .
```

In `.hitl/review-context.md` change its own line naming `HITL.md` to `.hitl/HITL.md`. `CLAUDE.md` becomes `@.hitl/HITL.md` then `@AGENTS.md`. In `AGENTS.md`: "The workflow doctrine is `.hitl/HITL.md`"; the manifest recipe says `rm .hitl/manifest.json` and names `.hitl/manifest.json`; the drift paragraph names `.hitl/HITL.md` and `.hitl/review-context.md`; the README block inside this repository's `README.md`, if it has one, is replaced by `readmeBlock("0.3.0")`.

- [ ] **Step 4: Run both gates**

Run: `pnpm test && pnpm format:check`
Expected: every suite PASS; Prettier clean.

- [ ] **Step 5: Commit**

```bash
git add -A .hitl .claude CLAUDE.md AGENTS.md README.md doctrine agents commands runtime scripts/__tests__
git commit -m "chore(hitl): move this repository to the .hitl/ layout at 0.3.0"
```

## Review decisions

- None declined in round 1.
