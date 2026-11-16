# The `.hitl/` folder — slice 2: the upgrade moves the files — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Owns:** `/hitl:diff --apply` upgrades an old-layout install to the `.hitl/` layout with no hand edits: the moved files keep the repository's edits, `CLAUDE.md` imports the new path, the install record relocates, and a run that stopped part-way resumes.

**Goal:** An install recorded by a pre-0.3.0 hitl upgrades through `/hitl:diff --apply` and ends on the new layout with its customizations intact.

**Architecture:** `installer/diff.mjs` learns the `MOVES` list from slice 1: a manifest path that is a move's `from` is classified as the repository's copy of `to`, using the existing three-way logic, then written at `to` and removed at `from`. The manifest is read from whichever layout the repository is on and always written at the new path, last.

**Tech Stack:** Node ≥ 24 ESM, vitest, `git merge-file`.

**Spec:** `docs/superpowers/specs/2026-11-16-hitl-dot-folder-design.md` — section 3, *Testing the upgrade*, the second Acceptance bullet, and the layout function of section 2.

## Global Constraints

- Paths and import lines as in slice 1's Global Constraints, verbatim.
- The manifest describes the templates, never the repository's edits.
- Order of an apply: owned-file writes (moves included, each `to` written and its `from` removed back to back) → `CLAUDE.md` line → README block → `.gitignore` → manifest written at `.hitl/manifest.json` → `.claude/hitl.json` removed. The manifest is relocated last.
- An absent `@HITL.md` line is never added.
- Text outside the README's `<!-- hitl:start -->` / `<!-- hitl:end -->` markers is never touched.
- The engine still runs only `git rev-parse`, `archive` and `merge-file`; branch, commit, push and PR stay in `commands/diff.md`.
- This slice does not make plugin commands refuse an old layout (slice 3) and does not touch adopt (slice 4).
- Local gates: `pnpm test`, `pnpm format:check`.

## Review Focus

- A customized doctrine on an old install: after the upgrade its edits must be in `.hitl/HITL.md`, never a fresh render (Task 2 tests, `both` clean and conflict).
- An apply that stopped part-way, re-run: must resume, never refuse forever and never overwrite (Task 3 tests, three stop points).
- A doctrine already moved by hand to `.hitl/HITL.md` while the manifest is old: must not be treated as `new upstream` (Task 2 test).
- A file at `to` that still carries conflict hunks from an earlier run: a re-run must not merge it again (Task 3 test).
- A `CLAUDE.md` with no import line, or with both lines: no line added; old line removed (Task 4 tests).

---

### Task 1: The layout function and the old-layout fixture

**Files:**
- Modify: `installer/lib.mjs`
- Modify: `installer/diff.mjs` (manifest lookup only)
- Test: `scripts/__tests__/lib.test.ts`, `scripts/__tests__/diff.test.ts`

**Interfaces:**
- Consumes: `MANIFEST_PATH`, `OLD_MANIFEST_PATH`, `MOVES` (slice 1).
- Produces, exported from `installer/lib.mjs`:
  - `layoutOf(repoRoot: string): "current" | "old" | "none"` — `current` when `MANIFEST_PATH` exists; else `old` when `OLD_MANIFEST_PATH` exists; else `none`.
  - `readManifest(repoRoot)` — unchanged: reads `MANIFEST_PATH` only.
  - `readManifestOf(repoRoot): { manifest, path, layout } | null` — the manifest of whichever layout the repository is on, `null` for `none`.
- Produces, in `scripts/__tests__/diff.test.ts`:
  - `fixtureOldLayout(): { mk, plugin, repo }` — a marketplace whose tag `v<CURRENT>` is this repository's installer and templates patched back to the old layout, a plugin root at `NEXT`, and a repository installed by the tag's own `render.mjs`.

- [ ] **Step 1: Write the failing tests**

`lib.test.ts`:

```ts
it("tells the three layouts apart, current winning when both manifests exist", () => {
  expect(layoutOf(empty)).toBe("none");
  expect(layoutOf(withOldManifest)).toBe("old");
  expect(layoutOf(withBoth)).toBe("current");
  expect(readManifestOf(withOldManifest)?.path).toBe(".claude/hitl.json");
});
```

`diff.test.ts` — the fixture, built the way `fixtureMarketplaceWithCiJob` is built (copy the plugin, patch text, assert every anchor is present before replacing, commit, tag):

- in the copy's `installer/lib.mjs`: `MANIFEST_PATH` back to `".claude/hitl.json"`, the two owned `repoPath`s back to `"HITL.md"` and `".claude/review-context.md"`, `CLAUDE_LINE` back to `"@HITL.md"`;
- in the copy's `templates/HITL.md` and `templates/claude/review-context.md`: `.hitl/HITL.md` → `HITL.md`, `.hitl/review-context.md` → `.claude/review-context.md`, `.hitl/manifest.json` → `.claude/hitl.json`, so the recorded text of both moved files differs from the latest, as it does in the real release;
- `repo` is produced by running the **copy's** `installer/render.mjs --mode write`, so it holds `HITL.md`, `.claude/review-context.md`, `.claude/hitl.json` and `@HITL.md`.

```ts
describe("diff.mjs on an old-layout install", () => {
  it("finds the manifest at the old path and reports the versions", () => {
    const { out, status } = runDiff(repo, plugin, mk);
    expect(status).toBe(0);
    expect(out.recorded).toBe(CURRENT);
    expect(out.latest).toBe(NEXT);
  });

  it("refuses an old-layout manifest at the plugin's own version as unowned-path", () => {
    // same repo, plugin root = ROOT (version CURRENT): the latest render owns no `from` path
    expect(out.refused).toBe("unowned-path");
    expect(out.paths).toEqual([".claude/review-context.md", "HITL.md"]);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm test -- lib diff`
Expected: FAIL — `layoutOf` is not exported; diff refuses `no-manifest`.

- [ ] **Step 3: Implement** `layoutOf` and `readManifestOf` in `lib.mjs`; in `diff.mjs` replace `readManifest(repo)` with `readManifestOf(repo)` and keep `manifest`, `manifestPath`, `layout` in scope. Add `manifestPath` to every report and refusal that has a manifest.

- [ ] **Step 4: Run to see them pass**

Run: `pnpm test -- lib diff`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add installer scripts/__tests__
git commit -m "feat(diff): read the install record from either layout"
```

### Task 2: A moved file is classified and reported as one entry

**Files:**
- Modify: `installer/diff.mjs`
- Test: `scripts/__tests__/diff.test.ts`

**Interfaces:**
- Consumes: `MOVES`, `fixtureOldLayout()`.
- Produces: in the report's `files`, for each move whose `from` is a manifest key and whose `to` the latest render owns (and `from` it does not): one entry `{ path: <to>, movedFrom: <from>, state, merged? }` and no entry for `from`. New refusal `{ refused: "move-collision", paths: [<from>, <to>] }`, exit 3.

The rule, since the tests alone do not fix it — for each such move, with `rec` = the recorded text and hash of `from`, `lat` = the latest text of `to`:

| on disk | source text | result |
|---|---|---|
| neither | — | state `missing locally`; write `lat` at `to` |
| only `from` | file at `from` | classify as today against `rec`/`lat`; write the outcome at `to`, remove `from` |
| only `to` | file at `to` | classify as today against `rec`/`lat`; write the outcome at `to` (Task 3 adds the conflict-hunk guard) |
| both | file at `from` | compute the outcome; if the file at `to` equals it, remove `from` only; else refuse `move-collision` |

"The outcome" is: the latest render for `unchanged`, `upstream changed`; the source text for `locally edited`, `already applied`; the three-way merge for `both`. Every moved entry is a write, whatever its state.

- [ ] **Step 1: Write the failing tests** (report only, no `--apply`)

```ts
it("reports an untouched doctrine as one moved entry, upstream changed", () => {
  const e = entry(out, ".hitl/HITL.md");
  expect(e).toMatchObject({ movedFrom: "HITL.md", state: "upstream changed" });
  expect(entry(out, "HITL.md")).toBeUndefined();
});

it("reports a customized doctrine as both, merged clean", () => {
  appendFileSync(join(repo, "HITL.md"), "\n## Ours\n\nA local rule.\n");
  expect(entry(out, ".hitl/HITL.md")).toMatchObject({ state: "both", merged: "clean" });
});

it("classifies a doctrine moved by hand against the old record, never as new upstream", () => {
  // edit HITL.md, then mkdir .hitl && mv HITL.md .hitl/HITL.md
  expect(entry(out, ".hitl/HITL.md")).toMatchObject({ movedFrom: "HITL.md", state: "both" });
});

it("refuses when both paths hold different text", () => {
  // .hitl/HITL.md written with unrelated text while HITL.md is still there
  expect(status).toBe(3);
  expect(out).toMatchObject({ refused: "move-collision", paths: ["HITL.md", ".hitl/HITL.md"] });
});

it("reports a deleted doctrine as a moved entry, missing locally", () => {
  rmSync(join(repo, "HITL.md"));
  expect(entry(out, ".hitl/HITL.md")).toMatchObject({ movedFrom: "HITL.md", state: "missing locally" });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm test -- diff`
Expected: FAIL — today `HITL.md` is `removed upstream` and `.hitl/HITL.md` `new upstream`.

- [ ] **Step 3: Implement.** Extract today's per-path classification into `classify(repoText, recHash, recText, latest: { content, executable }): { state, merged?, content }` and use it for ordinary paths and for moves. Handle the moves before the ordinary loop and exclude their `from` and `to` from it. A moved write is `{ path: to, content, executable, removeFrom?: from }`.

- [ ] **Step 4: Run to see them pass**

Run: `pnpm test -- diff`
Expected: PASS, the pre-existing diff tests included.

- [ ] **Step 5: Commit**

```bash
git add installer/diff.mjs scripts/__tests__/diff.test.ts
git commit -m "feat(diff): classify a moved file as one entry at its new path"
```

### Task 3: `--apply` moves the files and the install record, and resumes

**Files:**
- Modify: `installer/diff.mjs` (the apply half)
- Test: `scripts/__tests__/diff.test.ts`

**Interfaces:**
- Consumes: Task 2's writes.
- Produces: apply output — `deleted` also lists each removed `from` and `.claude/hitl.json`; the report gains `leftovers: string[]` (`[".claude/hitl.json"]` on a current-layout repository that still has it, else `[]`). An apply is never `nothing` when the layout is `old` or `leftovers` is non-empty.

- [ ] **Step 1: Write the failing tests**

```ts
it("moves a customized doctrine with its edits and relocates the manifest", () => {
  appendFileSync(join(repo, "HITL.md"), "\n## Ours\n\nA local rule.\n");
  const { out, status } = runDiff(repo, plugin, mk, ["--apply"]);
  expect(status).toBe(0);
  const moved = readFileSync(join(repo, ".hitl/HITL.md"), "utf8");
  expect(moved).toContain("A local rule.");
  expect(moved).toContain(".hitl/review-context.md"); // the upstream change arrived too
  expect(existsSync(join(repo, "HITL.md"))).toBe(false);
  expect(existsSync(join(repo, ".claude/hitl.json"))).toBe(false);
  expect(JSON.parse(readFileSync(join(repo, ".hitl/manifest.json"), "utf8")).version).toBe(NEXT);
  expect(out.deleted).toEqual(expect.arrayContaining(["HITL.md", ".claude/review-context.md", ".claude/hitl.json"]));
  // and the record still describes the template, so the edit stays visible
  const again = runDiff(repo, plugin, mk);
  expect(entry(again.out, ".hitl/HITL.md").state).toBe("locally edited");
  expect(runDiff(repo, plugin, mk, ["--apply"]).out.nothing).toBe(true);
});

it("writes a conflicted moved file at the new path and removes the old one", () => {
  // replace a line of HITL.md that the latest template also changed
  expect(entry(out, ".hitl/HITL.md")).toMatchObject({ state: "both", merged: "conflict" });
  expect(readFileSync(join(repo, ".hitl/HITL.md"), "utf8")).toContain("<<<<<<< this repository");
  expect(existsSync(join(repo, "HITL.md"))).toBe(false);
});

it("resumes when a pair's write landed and its removal did not", () => {
  // run --apply on a copy to learn the outcome text; in the real repo write that text at
  // .hitl/HITL.md and leave HITL.md in place; then --apply
  expect(status).toBe(0);
  expect(existsSync(join(repo, "HITL.md"))).toBe(false);
});

it("resumes when the files moved and the manifest did not", () => {
  // make .hitl/manifest.json unwritable-by-collision: create .hitl/manifest.json as a directory,
  // run --apply (exit 2, manifest: "untouched"), remove the directory, run --apply again
  expect(second.status).toBe(0);
  expect(readFileSync(join(repo, ".hitl/HITL.md"), "utf8")).toContain("A local rule.");
  expect(existsSync(join(repo, ".claude/hitl.json"))).toBe(false);
});

it("does not merge again a moved file that still carries conflict hunks", () => {
  // after the conflict apply stopped before the manifest moved: text at `to` must be byte-identical after the re-run
});

it("removes a leftover old manifest on a current-layout repository", () => {
  // after a full apply, write .claude/hitl.json back
  const report = runDiff(repo, plugin, mk).out;
  expect(report.leftovers).toEqual([".claude/hitl.json"]);
  const applied = runDiff(repo, plugin, mk, ["--apply"]).out;
  expect(applied.nothing).toBeUndefined();
  expect(applied.deleted).toEqual([".claude/hitl.json"]);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm test -- diff`
Expected: FAIL.

- [ ] **Step 3: Implement.** In the write loop, a write with `removeFrom` writes `to` (unless it is a resume) then unlinks `from` immediately and pushes it to `deleted`. Move the manifest write to after the README and `.gitignore` steps; write it at `MANIFEST_PATH`, then unlink `OLD_MANIFEST_PATH` when present and push it to `deleted`. Only-`to` guard: when the file at `to` contains a line starting `<<<<<<< this repository`, its outcome is its own text, state `both`, `merged: "conflict"`. Keep the failure report's shape (`written`, `deleted`, `manifest`).

- [ ] **Step 4: Run to see them pass**

Run: `pnpm test -- diff self-manifest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add installer/diff.mjs scripts/__tests__/diff.test.ts
git commit -m "feat(diff): --apply moves files and the install record into .hitl/, resumably"
```

### Task 4: The `CLAUDE.md` line and the README block

**Files:**
- Modify: `installer/lib.mjs`, `installer/diff.mjs`
- Test: `scripts/__tests__/lib.test.ts`, `scripts/__tests__/diff.test.ts`

**Interfaces:**
- Produces, exported from `installer/lib.mjs`:
  - `rewriteClaudeLine(text: string | null): { text: string | null, state: "rewritten" | "current" | "absent" }` — a line exactly `@HITL.md` becomes `@.hitl/HITL.md` (`rewritten`); if `@.hitl/HITL.md` is also already a line, the old line is dropped (`rewritten`); only the new line → `current`; neither, or no file → `absent`, text unchanged.
  - `rewriteReadmeBlockPaths(block: string): string` — every `` `HITL.md` `` (backticks included) becomes `` `.hitl/HITL.md` ``; running it twice equals running it once.
- Produces: apply output field `claudeLine`; `CLAUDE.md` is written only when `rewritten`.

- [ ] **Step 1: Write the failing tests**

```ts
it("rewrites the import line, drops a duplicate, and adds nothing", () => {
  expect(rewriteClaudeLine("@HITL.md\n@AGENTS.md\n")).toEqual({ text: "@.hitl/HITL.md\n@AGENTS.md\n", state: "rewritten" });
  expect(rewriteClaudeLine("@HITL.md\n@.hitl/HITL.md\n")).toEqual({ text: "@.hitl/HITL.md\n", state: "rewritten" });
  expect(rewriteClaudeLine("@.hitl/HITL.md\n").state).toBe("current");
  expect(rewriteClaudeLine("# notes about @HITL.md here\n")).toEqual({ text: "# notes about @HITL.md here\n", state: "absent" });
  expect(rewriteClaudeLine(null)).toEqual({ text: null, state: "absent" });
});

it("rewrites the doctrine path in a README block exactly once", () => {
  const once = rewriteReadmeBlockPaths("The doctrine is `HITL.md`. `.claude/` and `HITL.md` are");
  expect(once).toBe("The doctrine is `.hitl/HITL.md`. `.claude/` and `.hitl/HITL.md` are");
  expect(rewriteReadmeBlockPaths(once)).toBe(once);
});
```

In `diff.test.ts`, on the old-layout fixture after `--apply`: `CLAUDE.md` is `@.hitl/HITL.md\n` and `out.claudeLine` is `"rewritten"`; with `CLAUDE.md` deleted beforehand `out.claudeLine` is `"absent"` and no `CLAUDE.md` exists afterwards; the README's hitl block names `` `.hitl/HITL.md` `` and a line added by hand outside the markers naming `` `HITL.md` `` is unchanged.

- [ ] **Step 2: Run to see them fail**

Run: `pnpm test -- lib diff`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement** both functions; in the apply, after the file writes and before the manifest: rewrite `CLAUDE.md`, then apply `rewriteReadmeBlockPaths` to the block slice alongside the existing version replace.

- [ ] **Step 4: Run to see them pass**

Run: `pnpm test -- lib diff`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add installer scripts/__tests__
git commit -m "feat(diff): --apply rewrites the CLAUDE.md import line and the README block paths"
```

### Task 5: `/hitl:diff` tells the human about the move

**Files:**
- Modify: `commands/diff.md`
- Modify: `scripts/__tests__/old-paths.test.ts` (`MOVE_SOURCE_ALLOWED` gains `"diff.md"`)
- Test: `scripts/__tests__/plugin-prompts.test.ts`

- [ ] **Step 1: Write the failing test** in `plugin-prompts.test.ts`:

```ts
describe("/hitl:diff and the move to .hitl/", () => {
  const text = readFileSync(join(ROOT, "commands/diff.md"), "utf8");
  it("carries the fixed copy", () => {
    expect(text).toContain("moved from <from>");
    expect(text).toContain("hitl's files now live in `.hitl/`. Everyone working on this repository must update the hitl plugin to 0.3.0 or newer; an older plugin no longer recognises this repository as installed.");
    expect(text).toContain("`CLAUDE.md` has no `@HITL.md` line, so nothing there was changed; if the doctrine should load, add `@.hitl/HITL.md`.");
    expect(text).toContain('refused: "move-collision"');
    expect(text).toContain("leftovers");
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm test -- plugin-prompts old-paths`
Expected: FAIL.

- [ ] **Step 3: Edit `commands/diff.md`**

- Step 1 refusals: add `move-collision` → "both <from> and <to> exist and differ; hitl will not choose. Keep the one you want at <to>, delete the other, and retry." The refusals that name the manifest say `<manifestPath>` from the output.
- The table note column: `moved from <from>` when `movedFrom` is present. "<n> to apply" counts every entry with `movedFrom`, plus each path in `leftovers`.
- After the report and again after an apply, when any entry has `movedFrom`: the "hitl's files now live in `.hitl/`…" sentence; when `claudeLine` is `absent`: the `CLAUDE.md` sentence.
- `--apply` staging: `git add -- .hitl/manifest.json <written>`; `git add -- CLAUDE.md` only when `claudeLine` is `rewritten`; the `git rm --cached --ignore-unmatch` line already covers `deleted`, which now holds the old paths and `.claude/hitl.json`.
- The part-way undo recipe names `.hitl/manifest.json`, `.claude/hitl.json`, `CLAUDE.md`, `README.md` and `.gitignore`, and adds: "or simply re-run `/hitl:diff --apply`: the move resumes."
- The PR body: the table row for a moved file reads `<to> | <state>, moved from <from>`; the two sentences above are added under **How** when they apply.

- [ ] **Step 4: Run both gates**

Run: `pnpm test && pnpm format:check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add commands/diff.md scripts/__tests__
git commit -m "docs(diff): report the move to .hitl/, stage it and say who must update the plugin"
```
