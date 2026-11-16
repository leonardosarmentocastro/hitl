# The `.hitl/` folder — slice 4: adopt moves, then records — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Owns:** `/hitl:init --adopt` on a repository that carries hitl's files in the old places and has no install record moves the doctrine and the reviewer context into `.hitl/`, rewrites the `CLAUDE.md` import line, then writes the install record.

**Goal:** A hand-copied repository with a root `HITL.md` is adopted onto the new layout with no hand edits.

**Architecture:** `installer/adopt.mjs` applies the `MOVES` list as plain renames (content untouched) and reuses `rewriteClaudeLine`, both before it writes the manifest. Nothing is merged: adopt records templates, and the first `/hitl:diff` shows the drift, as today.

**Tech Stack:** Node ≥ 24 ESM, vitest.

**Spec:** `docs/superpowers/specs/2026-11-16-hitl-dot-folder-design.md` — section 4, and the fourth Acceptance bullet.

## Global Constraints

- Paths and import lines as in slice 1's Global Constraints, verbatim.
- Adopt never edits the content of a file it moves, and never touches agents, commands or the hook.
- Files at both a `from` and its `to` refuse before anything is written.
- An absent `@HITL.md` line is never added.
- Adopt on a repository with any manifest already refuses (slice 3); this slice does not change that.
- Local gates: `pnpm test`, `pnpm format:check`.

## Review Focus

- A repository whose only hitl file is a root `HITL.md`: must be adoptable, not `nothing-to-adopt` (Task 1 test).
- Both `HITL.md` and `.hitl/HITL.md` present: must refuse and leave both untouched (Task 1 test).
- A move that fails after the first rename: the report must name what already moved (Task 1 test).
- A repository already on the new paths with no manifest: adopt must move nothing and still record (Task 1 test).
- The human must be told the agents still name the old paths (Task 2 text test).

---

### Task 1: `adopt.mjs` moves before it records

**Files:**
- Modify: `installer/adopt.mjs`
- Test: `scripts/__tests__/adopt.test.ts`

**Interfaces:**
- Consumes: `MOVES`, `collisions` (already counts `from` paths, slice 1), `rewriteClaudeLine` (slice 2), `MANIFEST_PATH`.
- Produces: success output `{ wrote: [".hitl/manifest.json"], moved: [{ from, to }], claudeLine: "rewritten" | "current" | "absent", manifest }`. New refusal `{ refused: "move-collision", paths: [<from>, <to>] }`, exit 3. On a failure part-way: exit 2, `{ error, moved, claudeLine: <state or null>, manifest: "untouched" }`.

- [ ] **Step 1: Write the failing tests**

```ts
it("moves a root doctrine and the reviewer context, rewrites the import line, then records", () => {
  // repo: HITL.md ("mine\n"), .claude/review-context.md ("ctx\n"), .claude/agents/fixer.md, CLAUDE.md "@HITL.md\n"
  expect(status).toBe(0);
  expect(out.moved).toEqual([
    { from: "HITL.md", to: ".hitl/HITL.md" },
    { from: ".claude/review-context.md", to: ".hitl/review-context.md" },
  ]);
  expect(readFileSync(join(repo, ".hitl/HITL.md"), "utf8")).toBe("mine\n");
  expect(existsSync(join(repo, "HITL.md"))).toBe(false);
  expect(readFileSync(join(repo, "CLAUDE.md"), "utf8")).toBe("@.hitl/HITL.md\n");
  expect(out.claudeLine).toBe("rewritten");
  expect(out.wrote).toEqual([".hitl/manifest.json"]);
});

it("adopts a repository whose only hitl file is a root HITL.md", () => {
  expect(status).toBe(0);
  expect(out.moved).toEqual([{ from: "HITL.md", to: ".hitl/HITL.md" }]);
});

it("refuses when a file exists at both the old and the new path, touching nothing", () => {
  expect(status).toBe(3);
  expect(out).toEqual({ refused: "move-collision", paths: ["HITL.md", ".hitl/HITL.md"] });
  expect(existsSync(join(repo, ".hitl/manifest.json"))).toBe(false);
  expect(readFileSync(join(repo, "HITL.md"), "utf8")).toBe("old\n");
});

it("moves nothing in a repository already on the new paths", () => {
  expect(out.moved).toEqual([]);
  expect(out.claudeLine).toBe("current");
});

it("names what already moved when a later step fails", () => {
  // repo: HITL.md, .claude/agents/fixer.md, and CLAUDE.md created as a *directory*, so reading
  // it throws after the move succeeded
  expect(status).toBe(2);
  expect(out.moved).toEqual([{ from: "HITL.md", to: ".hitl/HITL.md" }]);
  expect(out.manifest).toBe("untouched");
  expect(existsSync(join(repo, ".hitl/manifest.json"))).toBe(false);
});
```

Update the existing "writes only the manifest" test's name to "writes only the manifest when nothing needs moving" and assert `moved: []`.

- [ ] **Step 2: Run to see them fail**

Run: `pnpm test -- adopt`
Expected: FAIL — `moved` is undefined; the root doctrine stays.

- [ ] **Step 3: Implement.** Order in `run`: existing refusals → `move-collision` check over all of `MOVES` (both paths exist) → `nothing-to-adopt` guard → for each move with a file at `from`: `mkdirSync(dirname(to), { recursive: true })`, `renameSync` → `rewriteClaudeLine` on `CLAUDE.md`, written only when `rewritten` → manifest. Wrap the moves, the line and the manifest in one `try` that returns the exit-2 report.

- [ ] **Step 4: Run to see them pass**

Run: `pnpm test -- adopt`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add installer/adopt.mjs scripts/__tests__/adopt.test.ts
git commit -m "feat(adopt): move an old-place doctrine and reviewer context into .hitl/ before recording"
```

### Task 2: `/hitl:init --adopt` reports the move

**Files:**
- Modify: `commands/init.md` (the `--adopt` branch)
- Modify: `scripts/__tests__/old-paths.test.ts` (`MOVE_SOURCE_ALLOWED` gains `"init.md"`)
- Test: `scripts/__tests__/plugin-prompts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe("/hitl:init --adopt and the move to .hitl/", () => {
  const text = readFileSync(join(ROOT, "commands/init.md"), "utf8");
  it("carries the fixed copy", () => {
    expect(text).toContain('refused: "move-collision"');
    expect(text).toContain("moved <from> → <to>");
    expect(text).toContain("The agents and commands in `.claude/` still name the old paths. `/hitl:diff` shows them as locally edited: take the upstream text for those lines.");
    expect(text).toContain("`CLAUDE.md` has no `@HITL.md` line, so nothing there was changed; if the doctrine should load, add `@.hitl/HITL.md`.");
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm test -- plugin-prompts old-paths`
Expected: FAIL.

- [ ] **Step 3: Edit `commands/init.md`, the `--adopt` result branches**

- exit `3`, `refused: "move-collision"` → "both <from> and <to> exist; hitl will not choose. Keep the one you want at <to>, delete the other, and re-run. Nothing was written." Stop.
- exit `2` → print `error`; list `moved` as "already moved: <from> → <to>"; "no manifest was written. Fix the error and re-run `/hitl:init --adopt`: it continues from here."
- exit `0` → the existing manifest sentence with `.hitl/manifest.json`; then one line per entry of `moved`, "moved <from> → <to>"; when `claudeLine` is `rewritten`, "`CLAUDE.md` now imports `@.hitl/HITL.md`"; when `absent`, the `CLAUDE.md` sentence above; when `moved` is not empty, the "agents and commands … still name the old paths" sentence. Replace "Nothing else was touched." with "Nothing else was touched. Never commit."

- [ ] **Step 4: Run both gates**

Run: `pnpm test && pnpm format:check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add commands/init.md scripts/__tests__
git commit -m "docs(init): --adopt reports what it moved into .hitl/"
```
