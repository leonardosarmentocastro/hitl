# The `.hitl/` folder — slice 3: the old layout is refused — Implementation Plan

**Reviewed:** round 1 (2026-11-16) · round 2 (2026-11-16).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Owns:** On a repository still on the old layout, the plugin's commands stop with the upgrade message, the plugin's Stop hook and session registration treat it as installed, and `/hitl:help` names the upgrade as the next step.

**Goal:** Nobody starts new work through the plugin on an old-layout repository, and the plugin never mistakes one for a repository without hitl.

**Architecture:** The scripts report the layout (`layoutOf` from slice 2); the hand-written commands branch on it and print one fixed message. No plugin code learns to *work* on the old layout.

**Tech Stack:** Node ≥ 24 ESM, bash, vitest.

**Spec:** `docs/superpowers/specs/2026-11-16-hitl-dot-folder-design.md` — section 2, and the third Acceptance bullet.

## Global Constraints

- The message, verbatim, on one line:
  `This repository uses an older hitl layout. Run /hitl:diff --apply to upgrade it.`
- Old layout = `.claude/hitl.json` exists and `.hitl/manifest.json` does not. Both present = current.
- An old-layout repository reports `mode: "installed"`.
- `/hitl:diff` is never blocked: it is the fix.
- The repository's own installed commands and its own Stop hook are untouched by this slice.
- What proves what (forwarded from the spec review): script tests prove the `layout` and `mode` values, the engines' refusals, the hook's silence and the session refusal; text tests guard each command's wording against regression. The behaviour of the prompt itself — the spec's third Acceptance bullet — is proved by one dry run, described in Task 3 and recorded in the PR body.
- The one sentence in `commands/customize.md` that tests for `.claude/hitl.json` is the only old-path text this slice adds; it is allowed by exact sentence in `old-paths.test.ts`.
- Local gates: `pnpm test`, `pnpm format:check`.
- File tripwire: about 24 files (3 runtime scripts, 5 installer engines, 5 commands, their tests). One capability — every plugin entry point answers the same question the same way — so it is not split; a refusal in the engines without the commands' message would have nothing a human could see.

## Review Focus

- A repository holding both manifests (an apply that stopped between the two): must behave as current, not be blocked (Task 1 test).
- An old-layout repository must never be reported `ejected` or `not installed` by `/hitl:help` (Task 2 test).
- The plugin Stop hook on an old-layout repository must stay silent, or every turn would be double-checked (Task 1 test).
- `/hitl:brainstorming` must stop before creating a worktree (Task 3: the branch sits in step 2, before step 4).
- `/hitl:init --adopt` on an old-layout install must not stamp a second, newer manifest (Task 2 test).

---

### Task 1: The runtime reports the layout and keeps treating old as installed

**Files:**
- Modify: `runtime/context.mjs`, `runtime/session.mjs`, `runtime/stop-hook.sh`
- Test: `scripts/__tests__/context.test.ts`, `scripts/__tests__/session.test.ts`, `scripts/__tests__/plugin-stop-hook.test.ts`

**Interfaces:**
- Consumes: `layoutOf(repoRoot)` from `installer/lib.mjs` (slice 2).
- Produces: `readContext()` output gains `layout: "current" | "old" | "none"`; `mode` is `"installed"` when `layout` is not `"none"`. `--format brief` prints a `Layout:` line only when it is `old`.

- [ ] **Step 1: Write the failing tests**

```ts
// context.test.ts — replaces slice 1's "only the old manifest path" test
it("reports an old-layout repository as installed, layout old", () => {
  expect(ctx).toMatchObject({ mode: "installed", layout: "old" });
});
it("reports both manifests as the current layout", () => {
  expect(ctx).toMatchObject({ mode: "installed", layout: "current" });
});
it("reports a repository without hitl as layout none", () => {
  expect(ctx).toMatchObject({ mode: "no-install", layout: "none" });
});

// session.test.ts
it("refuses to register a worktree of an old-layout repository", () => {
  expect(out).toEqual({ refused: "installed" });
});

// plugin-stop-hook.test.ts
it("stays silent on an old-layout repository with an unreviewed spec", () => {
  expect(status).toBe(0);
  expect(stderr).toBe("");
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm test -- context session plugin-stop-hook`
Expected: FAIL.

- [ ] **Step 3: Implement.** `context.mjs`: `const layout = layoutOf(top)`; `mode: layout === "none" ? "no-install" : "installed"`; add `layout`. `session.mjs`: refuse when `layoutOf(wt) !== "none"`. `stop-hook.sh`: `{ [ -f .hitl/manifest.json ] || [ -f .claude/hitl.json ]; } && exit 0`.

- [ ] **Step 4: Run to see them pass**

Run: `pnpm test -- context session plugin-stop-hook`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add runtime scripts/__tests__
git commit -m "feat(runtime): report the layout; an old-layout repository is still installed"
```

### Task 2: The installer's engines refuse or name the old layout

**Files:**
- Modify: `installer/help.mjs`, `installer/cleanup.mjs`, `installer/render.mjs`, `installer/adopt.mjs`, `installer/customize-testing.mjs`
- Test: `scripts/__tests__/help.test.ts`, `scripts/__tests__/cleanup.test.ts`, `scripts/__tests__/render.test.ts`, `scripts/__tests__/adopt.test.ts`, `scripts/__tests__/customize-testing.test.ts`

**Interfaces:**
- Consumes: `layoutOf`, `readManifestOf` (slice 2).
- Produces:
  - `help.mjs`: `state: "old layout"` when the layout is `old` (checked before every other state); `manifestVersion` is the old manifest's version.
  - `cleanup.mjs`: exit 3, `{ refused: "old-layout" }`, before the fetch and before anything is listed.
  - `render.mjs` (check and write) and `adopt.mjs`: exit 3, `{ refused: "manifest-present", version, layout: "old" }` on an old layout; the current-layout refusal gains `layout: "current"`.
  - `customize-testing.mjs`: exit 3, `{ refused: "old-layout" }`.

- [ ] **Step 1: Write the failing tests**

```ts
// help.test.ts
it("reports an old-layout install as old layout, never ejected or behind", () => {
  expect(out.state).toBe("old layout");
  expect(out.manifestVersion).toBe("0.2.1");
});

// cleanup.test.ts
it("refuses an old-layout repository before fetching", () => {
  expect(status).toBe(3);
  expect(out).toEqual({ refused: "old-layout" });
});

// render.test.ts
it("refuses an old-layout repository as manifest-present, layout old", () => {
  expect(out).toMatchObject({ refused: "manifest-present", version: "0.2.1", layout: "old" });
});

// adopt.test.ts
it("refuses an old-layout install instead of stamping a second manifest", () => {
  expect(out).toMatchObject({ refused: "manifest-present", layout: "old" });
  expect(existsSync(join(repo, ".hitl/manifest.json"))).toBe(false);
});

// customize-testing.test.ts
it("refuses an old-layout repository", () => {
  expect(out).toEqual({ refused: "old-layout" });
});
```

Each fixture is a temp repository shaped like a real old install, so a wrong check order fails: `.claude/hitl.json` with `{ "version": "0.2.1", "provider": "github", "testing": [], "files": {} }`, `.claude/agents/fixer.md`, a root `HITL.md`, `.claude/review-context.md`, and no `.hitl/`. With those files present, `help` must still say `old layout` (not `ejected`), and `render` and `adopt` must still refuse `manifest-present` (not `collision`, not `nothing-to-adopt`).

Adding `layout: "current"` to the existing `manifest-present` refusal changes its shape: update the existing exact-equality assertions on it in `render.test.ts` and `adopt.test.ts`.

- [ ] **Step 2: Run to see them fail**

Run: `pnpm test -- help cleanup render adopt customize-testing`
Expected: FAIL.

- [ ] **Step 3: Implement** each check with `layoutOf` / `readManifestOf` at the top of the engine's `run`, before any write.

- [ ] **Step 4: Run to see them pass**

Run: `pnpm test -- help cleanup render adopt customize-testing`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add installer scripts/__tests__
git commit -m "feat(installer): help, cleanup, init, adopt and customize name the old layout"
```

### Task 3: The commands print the upgrade message and stop

**Files:**
- Modify: `commands/brainstorming.md` (step 2), `commands/customize.md` (step 1), `commands/cleanup.md`, `commands/help.md`, `commands/init.md` (both `manifest-present` branches)
- Test: `scripts/__tests__/plugin-prompts.test.ts`, `scripts/__tests__/brainstorming-command.test.ts`

- [ ] **Step 1: Write the failing test** in `plugin-prompts.test.ts`:

```ts
const UPGRADE = "This repository uses an older hitl layout. Run /hitl:diff --apply to upgrade it.";

describe("the old layout is refused with one message", () => {
  for (const c of ["brainstorming", "customize", "cleanup", "help", "init"])
    it(`/hitl:${c} carries it`, () => {
      expect(readFileSync(join(ROOT, `commands/${c}.md`), "utf8")).toContain(UPGRADE);
    });
  it("/hitl:diff does not refuse", () => {
    expect(readFileSync(join(ROOT, "commands/diff.md"), "utf8")).not.toContain(UPGRADE);
  });
});
```

In `brainstorming-command.test.ts`: the text contains `` `layout: "old"` `` and that branch appears before the `` `mode: "installed"` `` branch.

- [ ] **Step 2: Run to see it fail**

Run: `pnpm test -- plugin-prompts brainstorming-command`
Expected: FAIL.

- [ ] **Step 3: Edit the commands**

- `brainstorming.md`, step 2, as the first bullet after reading the JSON: "**`layout: "old"`** → say exactly, as your only output, the message in a code block, and stop. Create no worktree, write no record."
- `customize.md`, step 1, before reading the manifest (most knobs never call a script, so the command tests the files itself): "If `.hitl/manifest.json` is absent and `.claude/hitl.json` is present, print the message and stop." Its `testing-rules` branch also handles exit `3`, `refused: "old-layout"` the same way. Add that exact sentence to `MOVE_SOURCE_ALLOWED["customize.md"]` in `scripts/__tests__/old-paths.test.ts`, since it names the old manifest path.
- `cleanup.md`: exit `3`, `refused: "old-layout"` → the message; stop.
- `help.md`: `old layout` → "Installed hitl <manifestVersion> on the layout from before 0.3.0." then the message, then the prerequisites as always.
- `init.md`, both `manifest-present` branches: when `layout` is `old`, the message in place of the "already initialised" sentence.

- [ ] **Step 4: Run both gates**

Run: `pnpm test && pnpm format:check`
Expected: PASS.

- [ ] **Step 5: Dry run of `/hitl:brainstorming` on an old-layout repository**

In a temp git repository holding one commit and only `.claude/hitl.json` (`{ "version": "0.2.1", "provider": "github", "testing": [], "files": {} }`), with the plugin loaded from this branch (`claude --plugin-dir <this worktree>`), run `/hitl:brainstorming anything`. Expected: the output is the upgrade message and nothing else; `git worktree list` shows one entry; `git branch` shows no new branch; nothing was written under `~/.hitl/projects/` for that repository. If the implementer cannot launch a nested Claude Code session, it reports this step as *not run* and the PR body lists it, with these expected results, as an open check for the human — it is then the only proof of the spec's third Acceptance bullet, so the PR must not present that bullet as verified.

- [ ] **Step 6: Commit**

```bash
git add commands scripts/__tests__
git commit -m "feat(commands): stop with the upgrade message on an old-layout repository"
```

## Review decisions

- Keeping the dry run's repository under `.claude/fixtures/` — declined, not worth it: the whole fixture is one JSON file and a commit, and it must be a separate git repository, which a folder inside this one is not.
- Task 3, `customize.md` "step 1" — clarified by the implementer, no acceptance criterion changed: the step that reads the manifest is numbered 0 ("Ground yourself") in the command, so the layout check sits at the start of step 0, before the manifest is read, as the task intends.
