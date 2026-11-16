# Slice 1 — Installed wipe PR — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Reviewed:** round 1 (2026-11-15) · round 2 (2026-11-15).

**Owns:** an installed repository's feature documents leave through the generated wipe PR built by `/umbrella-pr`.

**Goal:** In installed mode, `/umbrella-pr` builds the same generated `<feature-branch>-wipe` Draft PR that no-install mode builds today.

**Architecture:** The wipe builder is split. A self-contained core (`templates/scripts/wipe-core.mjs`, no imports beyond Node's own) finds the feature's documents against an explicit base, builds the one-commit wipe branch, pushes it and creates or retargets its Draft PR through the shim. The installer copies it verbatim to `scripts/hitl/wipe.mjs`; the plugin renders it to `runtime/wipe-core.mjs`, and `runtime/wipe.mjs` imports that copy and adds only the active-feature record and the archive.

**Tech Stack:** Node 20+ ES modules, zero dependencies; vitest; bash shim; Markdown prompt templates.

**Spec:** `docs/superpowers/specs/2026-11-15-gitlab-mr-design.md` (§ 5)

## Global Constraints

- Zero dependencies, Node 20+. `templates/scripts/wipe-core.mjs` imports only `node:` modules.
- Markdown is never formatted by Prettier; code is Prettier at `printWidth: 100`.
- Tests read the disk only through temp directories or `scripts/__fixtures__/`.
- A change under `templates/` requires both refreshes in `AGENTS.md` (§ Local gates): the
  manifest (`rm .claude/hitl.json` → `adopt.mjs`) and the plugin files (`render-plugin.mjs`).
  The rendered files of this repository (`.claude/`, `scripts/hitl/`, `HITL.md`) are produced
  by re-rendering, never edited by hand: after a template change, copy each rendered owned file
  into place the way the drift test expects (`renderAll` output equals the tree).
- Local gates before the slice is done: `pnpm test`, `pnpm format:check`.
- The no-install behaviour of `runtime/wipe.mjs` (record, archive, outputs, exit codes) does
  not change: `scripts/__tests__/wipe.test.ts` passes unmodified except for import paths.
- The CI wipe job, its script and the doctrine wording are slice 2's. Do not remove them here.

## Review Focus

- A feature branch with no documents added (`nothing-to-wipe`) must not create a branch or PR.
- `--base` given as `origin/main` and as `main` must both work (the merge-base is the same).
- A second run after new slice commits must move the wipe branch (force-push of that one
  branch only) and retarget the existing PR, never open a second one.
- `--no-push` (the `--dry-run` path) must leave no ref, no push and no PR behind.
- The parent guard: `--parent` that is the wipe branch itself, or a branch that is not the
  feature branch or one of its `-`-suffixed slices, is refused (`bad-branch`), exit 3.

---

### Task 1: The self-contained wipe core

**Files:**
- Create: `templates/scripts/wipe-core.mjs`
- Test: `scripts/__tests__/wipe-core.test.ts`

**Interfaces:**
- Produces (all exported from `templates/scripts/wipe-core.mjs`):
  - `WIPE_MESSAGE: string`, `WIPE_BODY: string` — moved verbatim from `runtime/wipe.mjs`.
  - `featureDocs(repo: string, tip: string, base: string): string[]` — moved verbatim.
  - `wipeCommit(repo: string, parentTip: string, files: string[]): string` — moved verbatim.
  - `buildWipe(opts): { code: 0|2|3, out: object }` where `opts` is
    `{ repo, featureBranch, parent, base, shim, noPush?: boolean, beforePush?: (parentTip: string, files: string[]) => object | void }`.
    Behaviour is today's `build()` in `runtime/wipe.mjs` with two differences: the base comes
    from `opts.base` (not a record), and instead of archiving it calls `beforePush` (when
    given) right before the wipe commit is created, merging any object it returns into the
    `built` output. Outputs: `{refused:"bad-branch"}` (code 3) ·
    `{status:"nothing-to-wipe"}` · `{status:"merged", pr}` ·
    `{status:"would-build", branch, parent, files}` · `{status:"built", branch, pr, files}`.
    A thrown failure becomes `{ code: 2, out: { error } }`.
  - CLI (when run as main): `build --repo <dir> --feature-branch <b> --parent <branch> --base <branch> --shim <path> [--no-push]`.
    Prints one JSON document (2-space indent, trailing newline) and exits with `code`;
    missing flag or unknown verb → code 1 with `{ error: <usage> }`. It parses its own argv
    (it cannot import `installer/lib.mjs`).

- [ ] **Step 1: Write the failing tests** in `scripts/__tests__/wipe-core.test.ts`. Reuse the
  repository-building helpers and the fake-`gh` store setup from `scripts/__tests__/wipe.test.ts`
  (copy what you need; that file's top 120 lines show them). Run the CLI at
  `templates/scripts/wipe-core.mjs` with `--shim <ROOT>/scripts/hitl/pr.sh` and **no**
  `HITL_HOME`/session record. Cases, one `it` each:
  - `build` with `--base main` on a feature branch that added a spec, a plan and a handover:
    `status: "built"`, `files` are those three sorted, `refs/heads/<b>-wipe` exists on the
    remote as exactly one commit over the parent tip whose tree lacks the files, the store
    holds one draft PR `head: <b>-wipe`, `base: <parent>`, title `Wipe transient docs: <b>`.
  - no record and no memory folder are needed or created (assert no `archive` key in the
    output and that a temp `HITL_HOME` stays empty).
  - `--base origin/main` gives the same `files`.
  - nothing added → `status: "nothing-to-wipe"`, no wipe ref, no PR.
  - second run with a new parent → same PR number, its base retargeted, ref moved.
  - `--no-push` → `status: "would-build"`, no ref, no PR.
  - `--parent <b>-wipe` and `--parent other` → exit 3, `refused: "bad-branch"`; the feature
    branch equal to the base → exit 3.
  - missing `--base` → exit 1.
  - `beforePush` (import `buildWipe` directly): the hook is called once with the parent tip
    and the files before the push, and `{ archive: "x" }` returned by it appears in the output.
- [ ] **Step 2: Run** `pnpm test scripts/__tests__/wipe-core.test.ts` — FAIL (module not found).
- [ ] **Step 3: Implement** `templates/scripts/wipe-core.mjs` by moving `git`, `docsAt`,
  `featureDocs`, `wipeCommit`, `branchOf`, `shim`, the constants and the body of `build` out of
  `runtime/wipe.mjs`, replacing the record lookup with `opts.base` and the two archive lines
  with the `beforePush` call. Keep the `isMain` realpath check used elsewhere in the repo.
- [ ] **Step 4: Run** the test file — PASS.
- [ ] **Step 5: Commit** `feat(wipe): a self-contained wipe core with an explicit base`.

### Task 2: `runtime/wipe.mjs` over the core; the plugin ships the core

**Files:**
- Modify: `installer/lib.mjs` (`pluginFiles`)
- Modify: `runtime/wipe.mjs`
- Create (rendered): `runtime/wipe-core.mjs`
- Test: `scripts/__tests__/wipe.test.ts`, `scripts/__tests__/plugin-drift.test.ts` (existing)

**Interfaces:**
- Consumes: Task 1's exports.
- Produces: `pluginFiles()` gains
  `{ pluginPath: "runtime/wipe-core.mjs", template: "scripts/wipe-core.mjs", executable: true }`.
  `runtime/wipe.mjs` keeps its CLI (`archive | build`), its exit codes and its exports
  (`featureDocs`, `wipeCommit`, `archiveDocs`, `WIPE_MESSAGE`, `WIPE_BODY`, `run`), the first
  two and the constants now re-exported from `./wipe-core.mjs`.

This is a refactor: the behaviour is already pinned by `wipe.test.ts`, and the red step is
the plugin-drift test.

- [ ] **Step 1: Add the `pluginFiles` entry** (nothing rendered yet).
- [ ] **Step 2: Run** `pnpm test scripts/__tests__/plugin-drift.test.ts` — FAIL
  (`runtime/wipe-core.mjs` is missing).
- [ ] **Step 3: Implement.** Run
  `node installer/render-plugin.mjs --plugin-root .`. Rewrite `runtime/wipe.mjs`'s `build` as:
  read the record (`refused: "no-record"` unchanged), then
  `buildWipe({ repo, featureBranch, parent, base: record.base, shim, noPush, beforePush })`
  where `beforePush(parentTip, files)` runs `archiveDocs(repo, parentTip, files, dest)` and
  returns `{ archive: dest }`. `archive` (the verb) and `archiveDocs` stay in this file.
- [ ] **Step 4: Run** `pnpm test scripts/__tests__/wipe.test.ts scripts/__tests__/plugin-drift.test.ts` — PASS, with every pre-existing `wipe.test.ts` case untouched.
- [ ] **Step 5: Commit** `refactor(wipe): the no-install builder runs over the shared core`.

### Task 3: The installer installs the core as `scripts/hitl/wipe.mjs`

**Files:**
- Modify: `installer/lib.mjs` (`ownedFiles`)
- Create (rendered): `scripts/hitl/wipe.mjs`
- Modify (regenerated): `.claude/hitl.json`
- Test: `scripts/__tests__/render.test.ts`

**Interfaces:**
- Produces: `ownedFiles(choices)` gains, for every provider,
  `{ repoPath: "scripts/hitl/wipe.mjs", template: "scripts/wipe-core.mjs", executable: true }`.

- [ ] **Step 1: Write the failing test** in `scripts/__tests__/render.test.ts`:
  rendering with the default choices writes `scripts/hitl/wipe.mjs`, executable, byte-equal to
  `templates/scripts/wipe-core.mjs`.
- [ ] **Step 2: Run** it — FAIL.
- [ ] **Step 3: Implement** the `ownedFiles` entry; copy the file into this repository's
  `scripts/hitl/wipe.mjs` (mode 755); refresh the manifest per `AGENTS.md`.
- [ ] **Step 4: Run** `pnpm test` — PASS (render, drift, self-manifest).
- [ ] **Step 5: Commit** `feat(installer): install the wipe builder into scripts/hitl`.

### Task 4: The installed commands build and report the wipe PR

**Files:**
- Modify: `templates/claude/commands/umbrella-pr.md`
- Modify: `templates/claude/commands/implement-stack.md`
- Modify (rendered): `.claude/commands/umbrella-pr.md`, `.claude/commands/implement-stack.md`, `commands/umbrella-pr.md`, `commands/implement-stack.md`, `.claude/hitl.json`
- Test: `scripts/__tests__/render.test.ts`

These are prompts: the test below pins that the installed render carries the step; the
behaviour is validated by the dry run in Step 5.

- [ ] **Step 1: Write the failing test** in `scripts/__tests__/render.test.ts`: the installed
  render of `.claude/commands/umbrella-pr.md` contains
  `node scripts/hitl/wipe.mjs build --repo "$PWD" --feature-branch "<feature-branch>" --parent "<parent>" --base origin/main --shim scripts/hitl/pr.sh`
  and the line `Required before merge: #<pr> removes the transient docs — merge it last.`;
  the installed render of `.claude/commands/implement-stack.md` contains
  `The wipe PR #<pr> is generated; merge it last.` and
  `only the wipe builder pushes it`.
- [ ] **Step 2: Run** it — FAIL.
- [ ] **Step 3: Edit `templates/claude/commands/umbrella-pr.md`.**
  - Step 1b: keep its prose for both modes; mode-gate only the command line. Installed:
    the command in Step 1 above, and the sentence "archive the feature's documents and" is
    no-install only (installed mode archives nothing). The `--dry-run` → `--no-push` rule
    applies to both.
  - Step 2: the four-line wipe `status` list is no longer mode-gated.
  - Step 4, installed branch: "with the refreshed table" → "with the refreshed table and its
    wipe line", as the no-install branch already says.
- [ ] **Step 4: Edit `templates/claude/commands/implement-stack.md`.** Un-gate, so both modes
  carry them: the final-report sentence "`/umbrella-pr` also builds the wipe PR; when it
  reports one, add to the final report: `The wipe PR #<pr> is generated; merge it last.`"; the
  fix-up ending "Then always run `/umbrella-pr` (no `--dry-run`), even when the umbrella
  exists … Report as in § 2." (delete the installed-only "Report as in § 2, without the
  umbrella step unless it does not exist yet."); and one `## Never` line for both modes:
  "Force-push unasked (the generated wipe branch is the one exception, and only the wipe
  builder pushes it)." The `wipe.mjs archive` block in § 0 stays no-install only.
- [ ] **Step 5: Re-render and dry-run the prompt.** Run both refreshes; `pnpm test` — PASS.
  Then run the installed `/umbrella-pr --dry-run` itself, as `AGENTS.md` prescribes for
  prompts, in a scratch clone of this repository on a throwaway feature branch that carries
  one spec and a minimal handover document. There is no stack fixture under `.claude/fixtures/`, so the scratch clone is the fixture; and a subagent cannot invoke a slash command, so the implementer follows the rendered command's text step by step, exactly as written. Expected: the printed body's `<!-- stack -->`
  block ends with `Required before merge: the wipe PR (not built in a dry run).`, and
  afterwards there is no `<b>-wipe` ref locally or on the remote and no new PR. Record the
  printed stack block in the commit body.
- [ ] **Step 6: Run** `pnpm format:check` — PASS.
- [ ] **Step 7: Commit** `feat(commands): the installed umbrella-pr builds the wipe PR`.
