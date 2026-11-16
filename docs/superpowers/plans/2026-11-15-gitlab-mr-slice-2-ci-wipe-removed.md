# Slice 2 — CI wipe job removed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Reviewed:** round 1 (2026-11-15) · round 2 (2026-11-15).

**Owns:** the GitHub Actions wipe job, its script, its init question and the `ci` choice are gone; an upgrade removes them; the doctrine states that the last PR of every stack is the generated wipe PR.

**Goal:** One wipe mechanism everywhere: the generated wipe PR. Nothing installs, asks about or records a CI wipe job any more.

**Architecture:** Deletions in `templates/` and `installer/`, with two compatibility rules: a manifest or answers file that still carries `ci` is accepted and the key is dropped, and `/hitl:diff` keeps passing the recorded `ci` to the *recorded* version's renderer so the workflow shows as "removed upstream". The upgrade report gains two plain-words warnings.

**Tech Stack:** Node 20+ ES modules, zero dependencies; vitest; Markdown prompts and doctrine.

**Spec:** `docs/superpowers/specs/2026-11-15-gitlab-mr-design.md` (§ 5)

## Global Constraints

- Zero dependencies, Node 20+. Markdown is never formatted; code is Prettier `printWidth: 100`.
- Tests use temp directories or `scripts/__fixtures__/`, never `docs/superpowers/`.
- After any `templates/` change run both refreshes from `AGENTS.md` and re-render this
  repository's owned files; commit them with the change.
- `installer/lib.mjs` must stay importable from a tagged snapshot holding only `templates/`,
  `installer/` and `.claude-plugin/` (`installer/diff.mjs` imports it that way): it imports
  nothing from `runtime/`.
- The `ci` *testing fragment* (`testing: ["ci"]`, `templates/testing/ci.md`) is unrelated and
  stays. `discover.mjs` keeps reporting `ci` systems: the interview's CI-rule question reads it.
- Local gates: `pnpm test`, `pnpm format:check`.
- File count: this slice crosses the ~20-file tripwire because every template change is
  committed with its rendered copies (this repository's `.claude/` and `scripts/hitl/`, the
  plugin's `commands/`, `agents/`, `runtime/`, the manifest). The capability is one; it is not split.

## Review Focus

- A manifest written by an older hitl (`"ci": "github-actions"`) must upgrade: the workflow
  and the script show as "removed upstream" and are deleted when unedited.
- An edited workflow (for example `branches: [master]`) is kept by the upgrade while its
  script is deleted: the report must name the kept file and tell the human to delete the pair.
- An answers file with `ci: "something-else"` must not be refused any more.
- A repository that never had the job (`ci: "none"`) upgrades with no "removed upstream" entry
  for the workflow.
- After this slice this repository itself has no `.github/workflows/wipe-superpowers-docs.yml`;
  the drift and self-manifest tests must still pass.

---

### Task 1: The installer stops rendering and recording the CI job

**Files:**
- Delete: `templates/ci/github-actions/wipe-superpowers-docs.yml`, `templates/scripts/wipe-superpowers-docs.sh`, `scripts/__tests__/wipe-superpowers-docs.test.ts`, `.github/workflows/wipe-superpowers-docs.yml`, `scripts/hitl/wipe-superpowers-docs.sh`
- Modify: `installer/lib.mjs`, `installer/render.mjs`, `installer/adopt.mjs`, `installer/help.mjs`, `installer/customize-testing.mjs`
- Modify (regenerated): `.claude/hitl.json`
- Test: `scripts/__tests__/lib.test.ts`, `render.test.ts`, `adopt.test.ts`, `customize-testing.test.ts`, `help.test.ts`, `drift.test.ts`, `diff.test.ts`

**Interfaces:**
- Produces:
  - `ownedFiles(choices)` no longer returns `scripts/hitl/wipe-superpowers-docs.sh` or
    `.github/workflows/wipe-superpowers-docs.yml`, whatever `choices.ci` is.
  - `CI_CHOICES` is deleted. `DEFAULT_CHOICES = { provider: "github", testing: [], gates: [] }`;
    `THIS_REPO_CHOICES` loses `ci`.
  - `manifestFor(version, choices, rendered)` returns `{ version, provider, testing, files }` —
    no `ci` key.
  - `render.mjs` and `adopt.mjs` no longer return `refused: "unknown-ci"`; a `ci` key in the
    answers file, any value or absent, is ignored.
  - `customize-testing.mjs` usage becomes `--repo <dir> --plugin-root <dir> --testing <a,b|''>`;
    a passed `--ci` is a usage error (exit 1). It no longer writes or deletes the workflow and
    writes a manifest without `ci`.

- [ ] **Step 1: Write the failing tests.**
  - `lib.test.ts`: `ownedFiles({provider:"github",ci:"github-actions",testing:[],gates:[]})`
    contains neither path; `manifestFor(...)` has no `ci` key.
  - `render.test.ts` and `adopt.test.ts`: an answers file with `"ci": "jenkins"` and one with
    no `ci` both exit 0; the written manifest has no `ci` key and no workflow file exists.
  - `customize-testing.test.ts`: `--ci none` exits 1; a run on a manifest that had
    `"ci": "github-actions"` writes one without the key and leaves an existing workflow file
    untouched.
  - `help.test.ts`: a tree holding only `.github/workflows/wipe-superpowers-docs.yml` is
    `not installed` (the workflow is no longer an owned path).
  Delete or rewrite the existing cases that assert the old behaviour in those files. Two
  more, by name: `drift.test.ts` asserts the render includes the workflow (near line 38) —
  it now asserts the render does **not** include it; and every existing `diff.test.ts` case
  that expects the workflow or the script in the *current* tree's render is deleted here
  (Task 2 re-adds upgrade coverage against an old-version fixture).
- [ ] **Step 2: Run** `pnpm test` — the new cases FAIL.
- [ ] **Step 3: Implement** the interface changes above and delete the listed files. In
  `help.mjs`, `installState` calls `collisions(repo, DEFAULT_CHOICES)`.
- [ ] **Step 4: Refresh** the manifest per `AGENTS.md`; run `pnpm test` — PASS, whole suite.
  `installer/diff.mjs` is touched here only as far as needed to keep compiling and green
  (it may still pass `ci: manifest.ci` everywhere); its upgrade behaviour is Task 2's.
- [ ] **Step 5: Commit** `feat(installer): stop installing and recording the CI wipe job`.

### Task 2: The upgrade removes the job and reports what it kept

**Files:**
- Modify: `installer/diff.mjs`
- Modify: `commands/diff.md`
- Test: `scripts/__tests__/diff.test.ts`

**Interfaces:**
- Consumes: Task 1's `ownedFiles`, `manifestFor`.
- Produces: `diff.mjs`'s report (the JSON `out`) gains `keptRemoved: string[]` — the sorted
  paths whose state is `removed upstream` with `local: "edited"`; `[]` when none. The choices
  given to the **recorded** render keep `ci: manifest.ci` when the manifest has it (the old
  renderer needs it); the choices given to the **latest** render and to the new manifest have
  no `ci`. After `--apply`, the manifest has no `ci` key.

- [ ] **Step 1: Write the failing tests** in `diff.test.ts`. The fixture is "a manifest
  written by an older hitl": add a helper beside `fixtureMarketplaceWithRemoval` that builds a
  marketplace tag whose `installer/lib.mjs` owns what the released versions own:
  `scripts/hitl/wipe-superpowers-docs.sh` **always**, and
  `.github/workflows/wipe-superpowers-docs.yml` **only when
  `choices.ci === "github-actions"`** (the old conditional, not an unconditional injection),
  with those two template files written into the tag, and whose manifest records `ci`. The `ci: "none"` case below must fail if `diff.mjs` stops passing `manifest.ci` to
  the recorded render — check that by temporarily removing it. Cases:
  - a manifest from the recorded version with `"ci": "github-actions"` and both files
    unedited: both paths are `removed upstream` / `local: "same"`; `--apply` deletes both,
    `keptRemoved` is `[]`, and the written manifest has no `ci`.
  - the same with the workflow edited: the script is deleted, the workflow is kept,
    `keptRemoved` equals `[".github/workflows/wipe-superpowers-docs.yml"]`.
  - a manifest with `"ci": "none"`: no entry for the workflow path at all; the script is
    `removed upstream` / `local: "same"` and `--apply` deletes it; `keptRemoved` is `[]`.
- [ ] **Step 2: Run** `pnpm test scripts/__tests__/diff.test.ts` — FAIL.
- [ ] **Step 3: Implement** in `installer/diff.mjs` as the Interfaces block says.
- [ ] **Step 4: Run** `pnpm test` — PASS.
- [ ] **Step 5: Edit `commands/diff.md`.** Where it relays the report, add two rules, in plain
  words:
  - when `keptRemoved` is not empty: name each kept file, and say "hitl no longer ships these.
    You edited them, so they were kept. Delete `.github/workflows/wipe-superpowers-docs.yml`
    and `scripts/hitl/wipe-superpowers-docs.sh` together, by hand: one without the other is a
    job that fails on every push."
  - when either path is `removed upstream`: begin with "The CI wipe job is gone: " only if
    the **workflow** path is among them (a repository that never had the job loses only the
    script), then, in both cases: "A feature's documents now leave through a generated wipe PR,
    merged last. If a stack is in flight, bring the upgraded base branch into its feature
    branch first, then re-run `/umbrella-pr` there — it builds the wipe PR. Branches cut
    before this upgrade still carry the old command and would build nothing."
- [ ] **Step 6: Commit** `feat(diff): remove the CI wipe job on upgrade and report kept files`.

### Task 3: The interview and the knob no longer ask about the job

**Files:**
- Modify: `commands/init.md`, `commands/customize.md`
- Test: `scripts/__tests__/plugin-prompts.test.ts` (or the test file that already reads `commands/init.md`; grep for `init.md` under `scripts/__tests__/`)

- [ ] **Step 1: Write the failing test:** `commands/init.md` and `commands/customize.md`
  contain neither `wipe-superpowers-docs` nor `"ci":` nor `--ci`.
- [ ] **Step 2: Run** it — FAIL.
- [ ] **Step 3: Edit `commands/init.md`.**
  - `--adopt` step 4: "ask exactly two things" → one; delete the `ci` question.
  - `--adopt` step 5 and § 4 Render: the answers file is
    `{ "provider": "github", "testing": [...], "gates": [...] }`.
  - § 3 table: delete the rows "`ci` contains `github-actions`", "`ci` is non-empty and lacks
    `github-actions`" and "`ci` is empty", and the sentence "A "no" to the wipe-job question
    sets `ci = "none"`." Keep the "`ci` is non-empty" row (the CI rule, `testing += "ci"`) and
    add its counterpart: `ci` is empty → say "skipped: no CI system found".
- [ ] **Step 4: Edit `commands/customize.md`.** The `testing-rules` knob row: "which testing
  principles `HITL.md` carries" (drop "and whether the wipe job is installed" and "the wipe
  workflow"); delete the wipe-job question near line 63 and the `--ci` argument from the
  `customize-testing.mjs` call.
- [ ] **Step 5: Run** `pnpm test` — PASS. **Commit** `docs(commands): init and customize no longer ask about the wipe job`.

### Task 4: The doctrine states the one rule

**Files:**
- Modify: `templates/HITL.md`, `installer/lib.mjs` (`readmeBlock`), `AGENTS.md`, `README.md`
- Modify (rendered): `HITL.md`, `doctrine/HITL.md`, `.claude/hitl.json`
- Test: `scripts/__tests__/render.test.ts`

Read `templates/HITL.md` around each `<!-- hitl:mode -->` block named below before editing;
where the no-install branch already has the wording, make it the single un-gated text.

- [ ] **Step 1: Write the failing test** in `render.test.ts`: the installed render of
  `HITL.md` contains `<feature branch>-wipe` and `merged last`, and contains none of
  `a workflow deletes them`, `the wipe script`, `never empty`.
- [ ] **Step 2: Run** it — FAIL.
- [ ] **Step 3: Edit `templates/HITL.md`** (both modes end up saying the same thing):
  - § Specs and plans, first bullet: they "live under `docs/superpowers/` for the life of a
    feature branch, and leave it through the generated `<feature branch>-wipe` PR, merged
    **last** — after every slice, before the umbrella PR." Then one sentence, both modes:
    "Documents that reached the base branch because the wipe PR did not merge first are
    deleted by hand, in one commit; nothing else removes them."
  - § Feature branches, the one-slice sentence: replace "its diff is never empty because the
    feature branch carries the spec, the plan and the handover document" with "it carries the
    feature's code; the documents have left through the wipe PR before it merges."
  - § Where things live: `scripts/hitl/` is "(the PR shim and the wipe builder)".
  - § Load-bearing invariants, the `docs/superpowers/` line: "the Stop hook, the wipe builder,
    every command."
  - § Pull requests: the sentence exempting the generated wipe PR from the `Plan:` and
    `## TL;DR` rules applies in both modes.
  - Delivery-chain prerequisites: Node 20+ is needed at run time, not only by the installer
    (add it where the doctrine lists what the workflow needs; if it lists nothing, add one
    line under § Where things live: "The scripts under `scripts/hitl/` need Node 20+.").
- [ ] **Step 4: Edit the rest.** `readmeBlock`: "are removed from `main` after the feature
  merges" → "leave through a generated wipe PR, merged last". `AGENTS.md`: "the wipe script" →
  "the wipe builder" in the local-gates paragraph; "and wipe workflow" removed from the drift
  sentence. `README.md`: remove any sentence saying installed mode wipes through a CI job
  (grep `wipe`), keeping the wipe-PR description for both modes.
- [ ] **Step 5: Re-render** (both refreshes); run `pnpm test` and `pnpm format:check` — PASS.
- [ ] **Step 6: Commit** `docs(doctrine): the last PR of every stack is the generated wipe PR`.

### Task 5: `/hitl:cleanup` reports documents that reached the base branch, in installed mode too

**Files:**
- Modify: `installer/cleanup.mjs`
- Test: `scripts/__tests__/cleanup.test.ts`

Today `docsOnBase` is computed only where there is an active-feature record and an archive
(no-install mode). With the CI job gone, an installed repository needs the same notice.

**Interfaces:**
- Produces: for an entry classified `merged` in an **installed** repository (no record),
  `docsOnBase` is the sorted list of paths under `docs/superpowers/` that exist at the merged
  umbrella PR's `head_sha` **and** on the base (`git cat-file -e <base>:<path>`). No
  merge-base is involved: after a merge-commit or fast-forward merge the merge-base is
  `head_sha` itself and would hide everything. (By doctrine nothing under `docs/superpowers/`
  belongs on the base, so a path present on both is a document to remove.) When `head_sha` is
  missing or is not a commit in the clone, `docsOnBase` is `[]`. The no-install computation (from the
  archive) is unchanged. `commands/cleanup.md` already prints the list for any non-empty
  `docsOnBase` and needs no edit.

- [ ] **Step 1: Write the failing tests** in `cleanup.test.ts`, using its existing installed
  fixture helpers: an installed repository whose umbrella PR merged with the spec still in the
  tree → the entry's `docsOnBase` lists the spec, in three fixtures — the umbrella merged by
  **merge commit**, by **squash**, and by **fast-forward**; the same after a wipe PR merged
  first (the spec is not on the base) → `[]`; a document on the base that is not in the
  feature's tree at `head_sha` → not listed.
- [ ] **Step 2: Run** `pnpm test scripts/__tests__/cleanup.test.ts` — FAIL.
- [ ] **Step 3: Implement** in `installer/cleanup.mjs`.
- [ ] **Step 4: Run** `pnpm test` and `pnpm format:check` — PASS.
- [ ] **Step 5: Commit** `feat(cleanup): report transient documents left on the base branch in installed mode`.

## Review decisions

- A dry run of `/hitl:init` and `/hitl:customize` after Task 3's prompt edits — declined, not
  worth it: the edits only remove a question; the spec leaves the first real run to a human.
- Implementer clarification (Task 2): with the passthrough of `manifest.ci` to the recorded
  render removed, the two `"ci": "github-actions"` cases fail (the recorded render no longer
  owns the workflow, so the manifest's workflow path is refused as unowned); the `"ci": "none"`
  case cannot fail, because an absent `ci` and `"none"` render identically under the old
  conditional. The guard the task asks for is held by the `github-actions` cases; checked by
  temporarily removing the passthrough.
- Implementer clarification (Task 4): the specs-and-plans bullet reads "merged last" without
  bold, so the rendered doctrine contains the exact phrase Step 1's test asserts.
- Implementer clarification (Tasks 1 and 3): the `unknown-ci` refusal is gone, so its two
  relay bullets in `commands/init.md` were removed with it; the testing-rules knob's
  `customize-testing.mjs` report no longer carries `removed` (it deletes nothing now), and
  `commands/customize.md` reports `wrote`, `kept` and `testing` only. `self-manifest.test.ts`
  was updated alongside the listed tests (it asserted the manifest's `ci`).
