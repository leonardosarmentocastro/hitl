# `/hitl:grill-me` command — slice 1 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Reviewed:** round 1 (2026-11-19).

**Owns:** the `/hitl:grill-me` entry command — a hitl design session that opens with a grill and hands its confirmed summary to the brainstorming skill — with its tests and its README and help text.

**Goal:** Add `commands/grill-me.md`, a second hand-written entry command that equals `commands/brainstorming.md` except for the enumerated grill differences, pinned by tests.

**Architecture:** `grill-me.md` is a copy of `brainstorming.md`. Text that exists only in the grill command sits between `<!-- grill-me:only -->` and `<!-- grill-me:end -->` markers; the two places that invoke the brainstorming skill are replaced by a pointer to one closing section, `## The design conversation`. A drift test rebuilds `brainstorming.md` from `grill-me.md` by removing the marked blocks, undoing the two replacements and normalising the command name, and requires equality.

**Tech Stack:** Markdown prompt; vitest (`pnpm test`); Prettier (`pnpm format:check`, never formats Markdown).

**Spec:** `docs/superpowers/specs/2026-11-19-grill-me-command-design.md`

## Global Constraints

- `commands/brainstorming.md`, everything under `templates/`, `runtime/`, `installer/`, `doctrine/` and `.hitl/` is not modified. `grill-me` is not added to `PLUGIN_COMMANDS` or `pluginFiles()`; no manifest or plugin re-render is needed.
- Markdown is never formatted. Copy text from `brainstorming.md` byte for byte, including line wraps.
- The grill skill is matched by the exact un-namespaced names `grilling`, else `grill-me`. `hitl:grill-me` never counts.
- Exact copy fixed by the spec (the missing-skill message) is copied verbatim from this plan.
- Local gates before the PR: `pnpm test` and `pnpm format:check`.
- TDD: each test is written and seen failing before the text that satisfies it. Task 1 writes all its pins before the one copied prompt file they describe: the file is a single unit, created in one step, so the pins fail together and pass together.
- The slice PR body carries the five dry runs of § Dry runs as an unticked checklist under `## Dry runs`; the human ticks them.
- Files touched: 5 (2 created, 3 modified) plus this plan and the spec — far below the ~20-file tripwire.

## Review Focus

A prompt's behaviour is not exercised by unit tests; these are the conditions most likely to bite, each with what covers it.

1. No grill skill installed, and Claude counts `hitl:grill-me` as the grill skill → the command must stop before a worktree exists. Pinned sentence in Task 1; dry run 4.
2. An installed repository (this one) skips the grill rules because step 2 says the command's steps end → both branches must point at `## The design conversation`. Pinned in Task 1; dry run 2.
3. Claude proceeds to the brainstorm in the same turn as the summary → it must wait for the human's confirmation. Pinned in Task 1; dry run 1.
4. The brainstorm re-asks what the grill settled → only the summary's open items are asked. Pinned sentence in Task 1; dry run 1.
5. A later fix to `brainstorming.md` is not copied to `grill-me.md` → the drift test in Task 1 fails.

## File Structure

- Create `commands/grill-me.md` — the command.
- Create `scripts/__tests__/grill-me-command.test.ts` — pins and the drift test.
- Modify `scripts/__tests__/plugin-prompts.test.ts:314` — `grill-me` joins the old-layout list.
- Modify `README.md` — § Use it without installing, and the closing "Pairs well with" paragraph.
- Modify `commands/help.md` — the closing recommendation.

---

### Task 1: The command and its tests

**Files:**
- Create: `commands/grill-me.md`
- Create: `scripts/__tests__/grill-me-command.test.ts`
- Modify: `scripts/__tests__/plugin-prompts.test.ts:314`

**Interfaces:**
- Consumes: `commands/brainstorming.md` as it is on the branch (138 lines).
- Produces: `commands/grill-me.md` with the markers `<!-- grill-me:only -->` / `<!-- grill-me:end -->`, each alone on its line, and a closing section headed `## The design conversation`.

- [ ] **Step 1: Write the failing tests**

In `scripts/__tests__/plugin-prompts.test.ts`, line 314, add `"grill-me"` to the list:

```ts
for (const c of ["brainstorming", "grill-me", "customize", "cleanup", "help", "init"])
```

Create `scripts/__tests__/grill-me-command.test.ts`. Same header comment style, imports and `ROOT` as `brainstorming-command.test.ts`. It reads both files once:

```ts
const grill = readFileSync(join(ROOT, "commands/grill-me.md"), "utf8");
const brainstorm = readFileSync(join(ROOT, "commands/brainstorming.md"), "utf8");

const MISSING_SKILL = [
  "/hitl:grill-me needs the grill-me skill from Matt Pocock's skills. Install it, then re-run /hitl:grill-me:",
  "  npx skills add mattpocock/skills",
  "Or start with /hitl:brainstorming, which needs no extra skill.",
].join("\n");

/** A block that exists only in grill-me.md, with the blank line after it. */
const ONLY = /<!-- grill-me:only -->\n[\s\S]*?<!-- grill-me:end -->\n\n?/g;

/** The two places brainstorming.md starts the design conversation, and what grill-me.md says there. */
const REPLACED: [string, string][] = [
  [
    "invoke the\n  superpowers brainstorming skill with `$ARGUMENTS`, and follow",
    "run\n  § The design conversation below, and follow",
  ],
  [
    "Then invoke the superpowers brainstorming skill with `$ARGUMENTS`, under the doctrine.",
    "Then run § The design conversation below, under the doctrine.",
  ],
];
```

`describe("/hitl:grill-me")` carries every `it` of `brainstorming-command.test.ts`, unchanged, against `grill`, plus:

```ts
it("names itself in its usage and its re-run messages", () => {
  expect(grill).toMatch(/^---\ndescription: .*Usage: \/hitl:grill-me <what to design>\n/);
  expect(grill).toMatch(/\nargument-hint: <what to design>\n---\n/);
  // only the superpowers stop message can satisfy this one
  expect(grill).toContain("artefacts this workflow reviews). Install it, then re-run /hitl:grill-me:");
  expect(grill).toContain("then re-run /hitl:grill-me.");
  // outside the grill-only blocks, the other command is never named
  expect(grill.replace(ONLY, "")).not.toContain("/hitl:brainstorming");
});

it("has exactly two grill-only blocks", () => {
  expect(grill.match(ONLY)?.length).toBe(2);
});

it("stops with the fixed message when no grill skill is available", () => {
  expect(grill).toContain(MISSING_SKILL);
  const prereq = grill.slice(grill.indexOf("## 1. "), grill.indexOf("## 2. "));
  expect(prereq).toContain(MISSING_SKILL);
  expect(prereq).toContain("named exactly `grilling`, or else one named exactly `grill-me`");
  expect(prereq).toContain("this command itself (`hitl:grill-me`) never counts");
  expect(prereq).toContain("A `grill-me` that only the human can trigger is not in that list.");
  expect(prereq.indexOf("superpowers@")).toBeLessThan(prereq.indexOf("named exactly `grilling`"));
});

it("sends both modes to the design conversation, never straight to the brainstorm", () => {
  const installed = grill.slice(
    grill.indexOf('`mode: "installed"`'),
    grill.indexOf('`host: "github"`'),
  );
  const step7 = grill.slice(
    grill.indexOf("## 7. Design session"),
    grill.indexOf("## The design conversation"),
  );
  for (const part of [installed, step7]) {
    expect(part).toContain("§ The design conversation");
    expect(part).not.toContain("superpowers brainstorming skill");
  }
});

describe("the design conversation", () => {
  const section = grill.slice(grill.indexOf("## The design conversation"));

  it("grills before it hands over to the brainstorming skill", () => {
    const grillAt = section.indexOf("Invoke the grill skill found in step 1");
    const handOver = section.indexOf("Invoke the superpowers brainstorming skill");
    expect(grillAt).toBeGreaterThan(-1);
    expect(handOver).toBeGreaterThan(grillAt);
  });

  it("waits for the human to confirm the summary", () => {
    expect(section).toContain("Then stop and wait.");
    expect(section).toContain("go on only when the human confirms it");
  });

  it("hands over settled decisions and open items", () => {
    expect(section).toContain("Its decisions are settled: do not reopen them.");
    expect(section).toContain("Its open items are the brainstorm's questions.");
  });

  it("ends the session when there is nothing to build", () => {
    expect(section).toContain("**Nothing to build.** The session ends here: no hand-over, no spec.");
  });
});

describe("drift from /hitl:brainstorming", () => {
  const body = (t: string) => t.replace(/^---\n[\s\S]*?\n---\n/, "");

  it("equals brainstorming.md outside the enumerated differences", () => {
    let expected = body(brainstorm);
    for (const [from, to] of REPLACED) {
      expect(expected.split(from).length).toBe(2); // exactly one occurrence
      expected = expected.replace(from, to);
    }
    const actual = body(grill)
      .replace(ONLY, "")
      .replaceAll("/hitl:grill-me", "/hitl:brainstorming");
    expect(actual.trimEnd()).toBe(expected.trimEnd());
  });
});
```

The `it`s inherited from `brainstorming-command.test.ts` keep their assertions; "reads an installed repository's doctrine at its .hitl/ path" still expects ``Read the repository's `.hitl/HITL.md` ``.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- grill-me-command plugin-prompts`
Expected: FAIL — `ENOENT … commands/grill-me.md` in both files.

- [ ] **Step 3: Create `commands/grill-me.md`**

Start from a byte-for-byte copy of `commands/brainstorming.md`, then make exactly these edits.

(a) Frontmatter — replace the `description` line; keep `argument-hint`:

```
description: Start a hitl design session from a grill — its own worktree on a feature branch, then Matt Pocock's grill-me skill, then the superpowers brainstorming skill writes the spec from what the grill settled, under the hitl doctrine. Needs Matt Pocock's skills. Usage: /hitl:grill-me <what to design>
```

(b) Own name — `/hitl:brainstorming` becomes `/hitl:grill-me` in the superpowers stop message (line 29) and the `GITLAB_TOKEN` message (line 69). These are the only two occurrences in the body.

(c) Grill prerequisite — insert after the superpowers message's closing code fence (line 32) and its blank line, before "For `node` or `git` missing":

````
<!-- grill-me:only -->
and that a grill skill is available: the skills this session can invoke include one named
exactly `grilling`, or else one named exactly `grill-me`. A `grill-me` that only the human can
trigger is not in that list. Only these two un-namespaced names count: a namespaced entry
never does, and this command itself (`hitl:grill-me`) never counts.
Check superpowers first; when both are missing, print the superpowers message. If neither
grill skill is there, stop and print exactly:

```
/hitl:grill-me needs the grill-me skill from Matt Pocock's skills. Install it, then re-run /hitl:grill-me:
  npx skills add mattpocock/skills
Or start with /hitl:brainstorming, which needs no extra skill.
```
<!-- grill-me:end -->

````

(d) Installed branch (lines 59–60) and step 7 (line 137) — apply the two `REPLACED` pairs from the test, leaving the surrounding lines as they are.

(e) Closing section — append after the last line, preceded by one blank line:

````
<!-- grill-me:only -->
## The design conversation

Both modes run this section: step 7, and the `mode: "installed"` branch of step 2 once the
worktree exists — "this command's own steps end here" there means steps 3 to 7, not this
section.

1. **Grill.** Invoke the grill skill found in step 1 — `grilling`, else `grill-me` — with
   `$ARGUMENTS`. Never invoke this command (`hitl:grill-me`) here. If the invocation fails,
   print the step 1 missing-skill message and stop; the worktree stays. The grill ends when
   the human confirms a shared understanding, or when the human asks to stop it ("enough,
   write it up"). Never end it yourself, and write no spec during it. A branch the human
   stopped before answering is an open item.
2. **Summary.** Write out, in the conversation, the shared understanding: every decision
   reached, in the human's terms, and every open item. Then stop and wait. Fold a correction
   in and show the corrected summary again; go on only when the human confirms it.
3. **Hand over.** Invoke the superpowers brainstorming skill with `$ARGUMENTS` and the
   confirmed summary, under the doctrine. Where the two disagree, the summary wins. Its
   decisions are settled: do not reopen them. Its open items are the brainstorm's questions.
   The brainstorm still lays out the approaches and writes the spec; the doctrine governs
   from there.

The topic, the branch prefix and the worktree were chosen from the request, before the
grill. When the grill outgrows them:

- **The name no longer fits.** It stays. Rename nothing.
- **Nothing to build.** The session ends here: no hand-over, no spec. Tell the human to run
  `/hitl:cleanup` from the main checkout — it never offers the worktree it is run from.
- **Two features.** Continue with one, the human's choice; name the other as out of scope in
  the summary.
<!-- grill-me:end -->
````

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- grill-me-command plugin-prompts old-paths`
Expected: PASS. If the drift test fails on whitespace only, adjust blank lines around the markers in `grill-me.md` — never the regular expression's meaning, never `brainstorming.md`.

- [ ] **Step 5: Prove the drift test bites**

Temporarily change one word in step 5 (`## 5. Memory`) of `commands/grill-me.md`; run `pnpm test -- grill-me-command`; expected: the drift test FAILS. Revert the word; run again; expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add commands/grill-me.md scripts/__tests__/grill-me-command.test.ts scripts/__tests__/plugin-prompts.test.ts
git commit -m "feat(commands): /hitl:grill-me starts a design session from a grill"
```

### Task 2: README and help text

**Files:**
- Modify: `README.md` (§ Use it without installing, around lines 180–202; the closing paragraph around line 238)
- Modify: `commands/help.md:78-79`

**Interfaces:**
- Consumes: the command name `/hitl:grill-me` from Task 1.
- Produces: nothing later tasks use.

Documentation: no test is written for it (the doctrine's TDD mandate covers behaviour; no existing test pins these sentences).

- [ ] **Step 1: README, § Use it without installing**

After the paragraph that ends "only the feature's own documents under `docs/superpowers/`, as always.", add a paragraph:

```
When you cannot see the feature's shape yet, type `/hitl:grill-me` instead. It is the same
start, but the design conversation opens with a grill
([Matt Pocock's skills](https://github.com/mattpocock/skills), `npx skills add mattpocock/skills`):
you confirm a summary of what the grill settled, and the brainstorm writes the spec from it.
```

Replace the sentence "In a repository that did run `/hitl:init`, `/hitl:brainstorming` follows that repository's own rules instead." with:

```
In a repository that did run `/hitl:init`, `/hitl:brainstorming` and `/hitl:grill-me` follow
that repository's own rules instead.
```

- [ ] **Step 2: README, closing paragraph**

Replace the "Pairs well with" paragraph with:

```
Pairs well with [Matt Pocock's skills](https://github.com/mattpocock/skills): `/grill-me` is
a good way to start a feature whose shape you can't see yet, and `/hitl:grill-me` starts the
whole chain from it.
```

- [ ] **Step 3: `commands/help.md`, closing recommendation**

Replace the sentence that begins `End with: "Recommended: ` (lines 78–79) with:

```
End with: "Recommended: `/hitl:grill-me` to start a feature whose shape is unclear — it needs
`/grill-me` (Matt Pocock's skills, `npx skills add mattpocock/skills`)."
```

- [ ] **Step 4: Run the gates**

Run: `pnpm test` then `pnpm format:check`
Expected: both PASS (`help.test.ts` and `old-paths.test.ts` included).

- [ ] **Step 5: Commit**

```bash
git add README.md commands/help.md
git commit -m "docs: name /hitl:grill-me in the README and /hitl:help"
```

---

## Dry runs (human, before the slice PR merges)

The command is a prompt; these are run by a human in real sessions and ticked in the PR. The fixtures under `.claude/fixtures/` are specs and plans for the review commands; this command needs a *repository*, so the no-install runs use a throwaway git repository with a GitHub remote, and the installed run uses this repository. Load the plugin from the slice branch (`claude --plugin-dir <worktree>`).

1. **No-install, grill skill present.** The grill runs; at the summary no file exists under `docs/superpowers/`; Claude waits for confirmation; the brainstorm asks only about the summary's open items.
2. **Installed (this repository).** First line is the installed message; the worktree is created; the same grill, summary wait and hand-over happen.
3. **Nothing to build.** End the grill with "we should not build this": no spec is written, and Claude names `/hitl:cleanup` from the main checkout.
4. **No grill skill.** Start a session with `grilling` and `grill-me` moved out of every skills folder the session reads (`~/.claude/skills/` and the repository's `.claude/skills/`): the missing-skill message prints and no worktree or branch exists afterwards.
5. **Older install.** With only a `grill-me` skill present whose `SKILL.md` has no `disable-model-invocation` line and carries the grill text itself, and no `grilling`: the grill runs from `grill-me`.
