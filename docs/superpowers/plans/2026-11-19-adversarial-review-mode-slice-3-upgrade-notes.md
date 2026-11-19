# Three review modes, slice 3 — the upgrade says what changed

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Owns:** someone who upgrades an installed repository reads, in the upgrade report and the upgrade PR, the release notes for every version they skipped — starting with the note that `elaborate` no longer includes the security review.

**Reviewed:** round 1 (2026-11-19) · round 2 (2026-11-19).

**Goal:** A `CHANGELOG.md` at the plugin root; `installer/diff.mjs` reports the sections between the recorded and the latest version as `notes`; `/hitl:diff` prints them and puts them in the upgrade PR; a test fails a release that forgets to move `## Unreleased` under its version.

**Architecture:** Two pure functions in `installer/lib.mjs` parse the changelog and pick the range; `diff.mjs` calls them and adds one field to its report. The command prompt only prints what the script returns.

**Tech Stack:** Node ESM (`installer/lib.mjs`, `installer/diff.mjs`), Markdown, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-adversarial-review-mode-design.md`

## Global Constraints

- Changelog headings are `## <version>` with no `v` (`## 0.4.0`), newest first; unreleased work sits under `## Unreleased`, above every version.
- `notes` never causes a refusal: no file, an unreadable shape or no section in range is an empty list.
- `## Unreleased` is never part of `notes`.
- The "latest" version is `pluginVersion(pluginRoot)` — `.claude-plugin/plugin.json` — as `diff.mjs` already reads it.
- The version bump and the rename of `## Unreleased` belong to the separate release commit; this slice does neither.
- `commands/diff.md` and `AGENTS.md` are hand-written; nothing under `templates/` changes, so no re-render is needed.
- Local gates before the PR: `pnpm test` and `pnpm format:check`. Markdown is never formatted.

## Review Focus

- A plugin with no `CHANGELOG.md` → `notes: []`, report otherwise identical (Task 2).
- An upgrade that skips two releases → both sections, newest first (Task 1).
- Recorded and latest equal → no notes, including the recorded version's own section (Tasks 1, 2).
- A changelog whose first heading is not `## Unreleased`, or with text before any heading → parsed without throwing (Task 1).
- A release commit that bumps `plugin.json` but leaves entries under `## Unreleased` → `pnpm test` fails (Task 3).

---

### Task 1: parse the changelog and pick the range

**Files:**
- Modify: `installer/lib.mjs`
- Test: `scripts/__tests__/changelog.test.ts` (create)

**Interfaces:**
- Consumes: `compareVersions(a, b)` from `installer/lib.mjs`.
- Produces:
  - `changelogSections(text: string): { version: string, text: string }[]` — one entry per `## ` heading, in file order; `version` is the heading text trimmed (`"Unreleased"` or `"0.4.0"`); `text` is the body up to the next `## ` heading, trimmed. Lines before the first `## ` heading are ignored.
  - `notesBetween(sections, recorded: string, latest: string): { version: string, text: string }[]` — the sections whose version matches `/^\d+\.\d+\.\d+$/`, is greater than `recorded` and not greater than `latest`, newest first, empty bodies dropped.

- [ ] **Step 1: Write the failing tests.**

```ts
const TEXT = `# Changelog\n\nintro\n\n## Unreleased\n\n- u\n\n## 0.5.0\n\n- five\n\n## 0.4.0\n\n- four a\n- four b\n\n## 0.3.0\n\n- three\n`;

it("splits on ## headings and ignores the preamble", () => {
  expect(changelogSections(TEXT).map((s) => s.version)).toEqual(["Unreleased", "0.5.0", "0.4.0", "0.3.0"]);
  expect(changelogSections(TEXT)[2].text).toBe("- four a\n- four b");
});
it("returns the sections after recorded up to latest, newest first", () => {
  expect(notesBetween(changelogSections(TEXT), "0.3.0", "0.5.0")).toEqual([
    { version: "0.5.0", text: "- five" },
    { version: "0.4.0", text: "- four a\n- four b" },
  ]);
});
it("leaves out Unreleased and anything newer than latest", () => {
  expect(notesBetween(changelogSections(TEXT), "0.3.0", "0.4.0").map((s) => s.version)).toEqual(["0.4.0"]);
});
it("is empty at the same version, for an empty text and for a heading that is no version", () => {
  expect(notesBetween(changelogSections(TEXT), "0.5.0", "0.5.0")).toEqual([]);
  expect(changelogSections("")).toEqual([]);
  expect(notesBetween(changelogSections("## v0.4.0\n\n- x\n"), "0.3.0", "0.4.0")).toEqual([]);
});
it("orders by version, not by position in the file", () => {
  const s = changelogSections("## 0.4.0\n\n- a\n\n## 0.10.0\n\n- b\n");
  expect(notesBetween(s, "0.3.0", "0.10.0").map((x) => x.version)).toEqual(["0.10.0", "0.4.0"]);
});
```

- [ ] **Step 2: Run** `pnpm test scripts/__tests__/changelog.test.ts` — expect FAIL (not exported).
- [ ] **Step 3: Implement both functions** in `installer/lib.mjs`, exported, next to `compareVersions`.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(installer): read release notes out of a changelog`.

### Task 2: `diff.mjs` reports `notes`

**Files:**
- Modify: `installer/diff.mjs`
- Test: `scripts/__tests__/diff.test.ts`

**Interfaces:**
- Consumes: Task 1's two functions; `CHANGELOG.md` at `--plugin-root`.
- Produces: every exit-0 report (with or without `--apply`) carries `notes: { version: string, text: string }[]` = `notesBetween(changelogSections(<CHANGELOG.md>), manifest.version, latestVersion)`; `[]` when the file does not exist. Refusal reports are unchanged.

- [ ] **Step 1: Write the failing tests**, reusing the file's fixture builders (the plugin root at `NEXT`, the marketplace at `CURRENT`):
  - "reports the notes for the versions being skipped": write a `CHANGELOG.md` into the fixture plugin root with `## Unreleased` (`- later`), `## ${NEXT}` (`- next`), `## ${CURRENT}` (`- current`) → `out.notes` equals `[{ version: NEXT, text: "- next" }]`.
  - "reports no notes without a changelog": the same fixture untouched → `out.notes` equals `[]` and `out.latest` is still `NEXT`.
  - "reports no notes at the same version": a copy of the same-version describe's plugin root with that changelog written into the copy (the original is shared with other tests) → `[]`.
  - "--apply reports the notes too": the first fixture with `--apply` → the same `notes`.
- [ ] **Step 2: Run** `pnpm test scripts/__tests__/diff.test.ts` — expect FAIL.
- [ ] **Step 3: Implement.** Read the file with a guard for its absence; add `notes` to the report object next to `recorded` and `latest`, on both the plain and the `--apply` path. Update the file's header comment to mention it.
- [ ] **Step 4: Run** `pnpm test` — expect PASS.
- [ ] **Step 5: Commit** `feat(diff): report the release notes for the versions skipped`.

### Task 3: the changelog, its guard, and the release line

**Files:**
- Create: `CHANGELOG.md`
- Modify: `AGENTS.md`
- Test: `scripts/__tests__/changelog.test.ts`

**Interfaces:**
- Consumes: `changelogSections`, `pluginVersion`.

- [ ] **Step 1: Write the failing tests** in a second describe, "this repository's CHANGELOG.md", reading the real file:
  - the first section is `Unreleased`; every other heading matches `/^\d+\.\d+\.\d+$/`, in strictly descending version order;
  - a `0.3.0` section exists;
  - exactly one section, whichever it is, contains `` `elaborate` no longer includes the security review `` and `` `complete` `` — the entry starts under `Unreleased` and moves under its version at release, and this test must pass on both sides of that commit;
  - "a release renames Unreleased": if the `Unreleased` body is not empty, `pluginVersion(ROOT)` equals the newest versioned heading;
  - "the two version files agree": `.claude-plugin/marketplace.json`'s `plugins[0].version` equals `pluginVersion(ROOT)`.
- [ ] **Step 2: Run** — expect FAIL (no file).
- [ ] **Step 3: Write `CHANGELOG.md`:** a `# Changelog` title; one sentence saying it lists what changes for a repository that has hitl installed or runs it without an install; `## Unreleased` with the entry from the spec's § The release note, verbatim, as one bullet; `## 0.3.0` with the one line "The first release with a changelog; earlier changes are not listed."
- [ ] **Step 4: Add to `AGENTS.md`**, after § Local gates' refresh procedures, a paragraph "**Releasing.**": in one commit, bump `version` in `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` and rename `## Unreleased` in `CHANGELOG.md` to `## <version>`, leaving a new empty `## Unreleased` above it; then tag `v<version>`. A change that an installed repository or a no-install user will notice adds a bullet under `## Unreleased` in its own PR.
- [ ] **Step 5: Run** `pnpm test` and `pnpm format:check` — expect PASS. To see the guard fail, bump `plugin.json` locally to `0.4.0`, run the test, expect "a release renames Unreleased" and "the two version files agree" to FAIL, then restore the file.
- [ ] **Step 6: Commit** `docs(changelog): start a changelog; elaborate no longer includes security`.

### Task 4: `/hitl:diff` shows the notes

**Files:**
- Modify: `commands/diff.md`
- Test: `scripts/__tests__/plugin-prompts.test.ts`

**Interfaces:**
- Consumes: Task 2's `notes`.

- [ ] **Step 1: Write the failing test**, a new describe "/hitl:diff shows the release notes": `commands/diff.md` contains `What changed:`, `every section in range, verbatim`, `` when `notes` is empty ``, and no longer contains `one or two sentences from the plugin's release notes if present`.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Edit `commands/diff.md`.**
  - § 1, exit 0, among the "add these in plain words" items and first of them: when `notes` is not empty, print `What changed:` and then each entry as its version on one line followed by its text, verbatim, newest first. Say it is printed after the count line, and again after an `--apply` run's report.
  - § 2, the PR body: **Why** becomes "the `notes`: every section in range, verbatim, each under its version — or, when `notes` is empty, 'upstream changed these files since this repository recorded hitl <recorded>'."
- [ ] **Step 4: Run** `pnpm test` and `pnpm format:check` — expect PASS.
- [ ] **Step 5: Commit** `feat(diff): print the release notes and carry them in the upgrade PR`.
