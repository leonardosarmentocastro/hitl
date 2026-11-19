# pr-tldr — slice 1: the body shape

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Owns:** the shape of the slice PR body and the umbrella PR body — bullet TL;DR, Why, Needs you, the agent fold — and the doctrine rules that state it. Not the ticket line.

**Goal:** Every PR hitl writes opens with a 1–3 bullet TL;DR and a Why, shows the human only what asks something of them, and folds what only agents read.

**Architecture:** Wording only. The shape lives in three prompt templates (`implement-stack.md`, `handover.md`, `umbrella-pr.md`), one supporting prompt (`review-slice.md`) and the doctrine (`templates/HITL.md`). Tests pin the rendered template text; this repository's own `.claude/`, `.hitl/` and the plugin's no-install files are re-rendered from the templates.

**Tech Stack:** Markdown templates, Node 24, vitest (`pnpm test`), Prettier (`pnpm format:check`; Markdown is never formatted).

**Spec:** `docs/superpowers/specs/2026-11-19-pr-tldr-design.md`

## Global Constraints

- Edit only under `templates/`, `commands/customize.md` and `scripts/__tests__/`. Never hand-edit `.claude/`, `.hitl/HITL.md`, `scripts/hitl/`, `commands/` (other than `customize.md`), `agents/`, `doctrine/` or `runtime/`: they are renders.
- After every template change, re-render both ways, exactly as `AGENTS.md` gives it:
  ```bash
  rm .hitl/manifest.json
  node --input-type=module -e 'import { THIS_REPO_CHOICES as c } from "./installer/lib.mjs"; console.log(JSON.stringify(c))' > /tmp/hitl-answers.json
  node installer/adopt.mjs --repo . --plugin-root . --answers /tmp/hitl-answers.json
  node installer/render-plugin.mjs --plugin-root .
  ```
  and commit the renders with the template change.
- Keep every `<!-- hitl:mode … -->` marker pair intact; text that differs between installed and no-install mode stays inside its markers.
- A `<!-- hitl:knob pr-body-sections -->` anchor makes the paragraph right under it tunable. The TL;DR/Why wording and the Review decisions wording stay under an anchor. The reader rule, the Needs-you list and the exemptions must NOT be the paragraph right under an anchor.
- Summary text, exactly: `For agents — skip when reviewing`.
- TL;DR limits, exactly: 1 to 3 bullets; one line each; about 15 words at most; a fragment, not a sentence.
- The Needs-you list is closed: (1) a deferred gap the reviewer marked 🟠; (2) `The security follow-up did not run for this slice.`; (3) each allowed plan edit the implementer made.
- No ticket line in this slice: slice 2 owns it.
- Local gates before the slice is done: `pnpm test` and `pnpm format:check`.
- The slice PR body carries a `## Dry runs` checklist (Task 4), above the fold: its reader is the human.

## Review Focus

- A handover document written before this change (body starts with `Plan:`, has `## Notes`): `/umbrella-pr` must copy it whole and unchanged. Pinned by Task 2's test on the delimiting sentence.
- A handover document with a feature-added `##` heading after the umbrella body: it must not be copied into the PR. Same test.
- A slice with none of the three Needs-you cases: no `## Needs you` heading at all, not an empty one. Pinned by Task 1's test ("omit the whole section") and Task 4's dry run.
- A refactor slice with nothing a user would notice: one bullet `No visible change: …`. Pinned by Task 1's test.
- Tuning `pr-body-sections` through `/hitl:customize`: must not be able to remove the reader rule or the Needs-you list. Pinned by Task 3's anchor test.

---

### Task 1: The slice PR body

**Files:**
- Modify: `templates/claude/commands/implement-stack.md` (the body block after `Body (write it`; the `FOL:` bullet in step c2)
- Modify: `templates/claude/commands/review-slice.md` (§ 2 Triage: the DEFERRED bullet and the two "print the block" sentences)
- Test: `scripts/__tests__/pr-body.test.ts`, `scripts/__tests__/plugin-prompts.test.ts`

- [ ] **Step 1: Rewrite the slice test in `pr-body.test.ts`** (replace the existing `it`, and the file's header comment, which describes the old shape)

```ts
it("the slice body is TL;DR bullets, Why, Needs you, then the agent fold", () => {
  const installed = renderAll(ROOT, THIS_REPO_CHOICES);
  const text = installed.get(".claude/commands/implement-stack.md")!.content;
  const body = text.slice(text.indexOf("Body (write it"));
  const i = (s: string) => body.indexOf(s);
  expect(i("## TL;DR")).toBeGreaterThan(-1);
  expect(i("## Why")).toBeGreaterThan(i("## TL;DR"));
  expect(i("## Needs you")).toBeGreaterThan(i("## Why"));
  expect(i("<details>")).toBeGreaterThan(i("## Needs you"));
  expect(i("<summary>For agents — skip when reviewing</summary>")).toBeGreaterThan(i("<details>"));
  expect(i("\nPlan: <plan path>\n")).toBeGreaterThan(i("<summary>"));
  expect(i("## Review decisions")).toBeGreaterThan(i("\nPlan: <plan path>\n"));
  expect(i("</details>")).toBeGreaterThan(i("## Review decisions"));
  for (const gone of ["What — ", "How — ", "## What"]) expect(i(gone)).toBe(-1);
  expect(body).toContain("never more than three bullets");
  expect(body).toContain("No visible change:");
  expect(body).toContain("omit the whole section when there is none");
  // The security follow-up line now goes to Needs you, in both commands.
  expect(text).toMatch(/did not run for this slice\."\s+under the PR body's `## Needs you`/);
  const slice = installed.get(".claude/commands/review-slice.md")!.content;
  expect(slice).toMatch(/marked\s+it 🟠, tell the human under the PR body's `## Needs you`/);
  expect(slice).toContain("`## Needs you` block");
});
```

In `plugin-prompts.test.ts`, in the test "commands/implement-stack.md opens PRs through the plugin shim with memory sections", replace the five lines from `expect(stack.indexOf("## TL;DR"))` through `expect(section).toBeLessThan(body.indexOf("## Review decisions"));` with:

```ts
const body = stack.slice(stack.indexOf("Body (write it"));
const section = body.indexOf("<one section per pr-section fact");
expect(section).toBeGreaterThan(body.indexOf("## Needs you"));
expect(section).toBeLessThan(body.indexOf("<details>"));
```

- [ ] **Step 2: Run** `pnpm test -- pr-body plugin-prompts` — Expected: both FAIL (`## Why` not found / `-1`).

- [ ] **Step 3: Replace the body block in `templates/claude/commands/implement-stack.md`.** Keep the anchor line and the `Body (write it …` sentence above it. The fenced block becomes exactly:

````
```
## TL;DR

- <what changed, as someone using it would notice it: one line, about 15 words at most, a fragment and not a sentence>
- <a second or third change, only if there is one; never more than three bullets>

## Why

<2–3 sentences: the problem this solves>

## Needs you

<one line per case in the list below; omit the whole section when there is none>
<!-- hitl:mode no-install -->

<one section per pr-section fact in the hitl context block's project memory, written as that fact describes; none if there is no such fact>
<!-- hitl:mode end -->

<details>
<summary>For agents — skip when reviewing</summary>

Plan: <plan path>

## Review decisions
<the blocks from both steps of /review-slice, plus both fixers' not-reproduced items, minus the Needs-you lines; or "None — every finding was applied.">

</details>
```
````

Directly after the block (after the existing no-install `_not captured_` paragraph, outside any anchor) add:

```
The TL;DR says only what changed — no why, no how, no risk. A change nobody using the thing
would notice says so in its one bullet: `No visible change: <what was reorganised>`. There is
no What and no How section.

`## Needs you` holds only these, one line each, and they are not repeated in the fold: a
deferred gap the reviewer marked 🟠 (it is a question about reordering the slices); "The
security follow-up did not run for this slice."; each allowed plan edit the implementer made.
Nothing else is ever written there. The fold's label addresses the human: an agent told to
read the PR body reads the fold.
```

In step c2, the `FOL:` bullet's ending changes from `add the line "The security follow-up did not run for this slice." to the PR body's Review decisions.` to `add the line "The security follow-up did not run for this slice." under the PR body's `## Needs you`.` The fix-up step that appends Review decisions as a PR comment is left untouched.

- [ ] **Step 4: Edit `templates/claude/commands/review-slice.md` § 2.** The DEFERRED bullet's last sentence becomes: ``If the reviewer marked it 🟠, tell the human under the PR body's `## Needs you` — it is a resequencing question.`` After the sentence that ends "No file, function or test names." add: ``Then, only if a 🟠 DEFERRED exists, a `## Needs you` block with one line for each; those lines are left out of the Review decisions block.`` The second step's closing sentence ("Print the triage table and the `## Review decisions` block as above") needs no change: "as above" carries it.

- [ ] **Step 5: Re-render** (Global Constraints), then run `pnpm test` — Expected: PASS, including the drift, self-manifest and plugin-drift tests.

- [ ] **Step 6: Commit**

```bash
git add -A templates scripts/__tests__ .claude .hitl commands agents doctrine runtime scripts/hitl
git commit -m "feat(pr-body): slice PRs open with a bullet TL;DR and fold what agents read"
```

### Task 2: The umbrella PR body

**Files:**
- Modify: `templates/claude/agents/handover.md` (the `## Umbrella PR body` part of the document template, and the "Write the What/Why/How" paragraph after it)
- Modify: `templates/claude/commands/umbrella-pr.md` (step 2, first sentence)
- Test: `scripts/__tests__/pr-body.test.ts`

- [ ] **Step 1: Add the failing test to `pr-body.test.ts`**

```ts
it("the umbrella body is TL;DR bullets, Why and Slices — no Plan line, no Notes, no fold", () => {
  const installed = renderAll(ROOT, THIS_REPO_CHOICES);
  const agent = installed.get(".claude/agents/handover.md")!.content;
  const body = agent.slice(agent.indexOf("## Umbrella PR body"), agent.indexOf("## Fix-up"));
  const i = (s: string) => body.indexOf(s);
  expect(i("## TL;DR")).toBeGreaterThan(-1);
  expect(i("## Why")).toBeGreaterThan(i("## TL;DR"));
  expect(i("## Slices")).toBeGreaterThan(i("## Why"));
  expect(i("<!-- stack -->")).toBeGreaterThan(i("## Slices"));
  for (const gone of ["Plan:", "## Notes", "**What**", "**How**", "<details>", "durable record"])
    expect(i(gone)).toBe(-1);
  expect(body).toContain("never one bullet per slice");
  const cmd = installed.get(".claude/commands/umbrella-pr.md")!.content;
  expect(cmd).toContain("everything under the handover document's `## Umbrella PR body` heading");
  expect(cmd).toContain("`## TL;DR`, `## Why`, `## Slices` or `## Notes`");
  expect(cmd).toContain("opens as it is");
  expect(cmd).not.toContain("everything from `Plan:`");
});
```

- [ ] **Step 2: Run** `pnpm test -- pr-body` — Expected: the new test FAILS.

- [ ] **Step 3: Edit `templates/claude/agents/handover.md`.** Between the `## Umbrella PR body` heading and `## Slices`, the template reads exactly:

```
## TL;DR

- <what the feature changes, as someone using it would notice it: one line, about 15 words at most, a fragment and not a sentence>
- <a second or third change, only if there is one; never more than three bullets, and never one bullet per slice>

## Why

<2–3 sentences: the problem it solves, in plain words a newcomer follows.>
```

Delete the `Plan: <umbrella spec path>` line and the whole `## Notes` section with both of its mode variants (their `<!-- hitl:mode … -->` markers go with them). The paragraph "Write the What/Why/How from the spec's Goal and Design, in the register of explaining to a newcomer. Never paste plan text." becomes: "Write the TL;DR and the Why from the spec's Goal, in the register of explaining to a newcomer. The TL;DR says only what changed — no why, no how, no risk; there is no What and no How. Never paste plan text."

- [ ] **Step 4: Edit `templates/claude/commands/umbrella-pr.md` step 2.** Its opening, "Build the body: everything from `Plan:` under `## Umbrella PR body` through the `## Notes` section, with the `<!-- stack -->` table's PR column refreshed from", becomes:

```
2. Build the body: everything under the handover document's `## Umbrella PR body` heading,
   stopping at the first `##` heading that is not `## TL;DR`, `## Why`, `## Slices` or `## Notes`,
   or at the end of the document. Never reshape it: a body written in an earlier shape (a
   `Plan:` line first, a `## Notes` section last) opens as it is, and a heading the feature
   added to its handover document is never copied. The `<!-- stack -->` table's PR column is refreshed from
```

The rest of step 2 and steps 3–5 are untouched.

- [ ] **Step 5: Re-render**, run `pnpm test` — Expected: PASS. If another test asserts the old umbrella text (search `scripts/__tests__` for `## Notes` and `durable record`), update the assertion to the new shape in this task.

- [ ] **Step 6: Commit** — `git commit -m "feat(pr-body): the umbrella PR is a bullet TL;DR, a Why and the slices"` (same `git add` as Task 1).

### Task 3: The doctrine and the tuning knob

**Files:**
- Modify: `templates/HITL.md` § Pull requests
- Modify: `commands/customize.md` (hand-written, not rendered: the `pr-body-sections` row)
- Test: `scripts/__tests__/pr-body.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
it("the doctrine states the shape, and tuning cannot remove the reader rule", () => {
  const installed = renderAll(ROOT, THIS_REPO_CHOICES);
  const doc = installed.get(".hitl/HITL.md")!.content;
  const pr = doc.slice(doc.indexOf("## Pull requests"), doc.indexOf("## Delivery slices"));
  expect(pr).toContain("`## TL;DR`");
  expect(pr).toContain("1 to 3 bullets");
  expect(pr).toContain("`## Needs you`");
  expect(pr).toContain("For agents — skip when reviewing");
  expect(pr).toContain("The umbrella PR carries no `Plan:` line");
  expect(pr).not.toContain("**How**");
  expect(pr).not.toContain("human reviewers");
  // The paragraph right under a knob anchor is the tunable one.
  const lines = readFileSync(join(ROOT, "templates/HITL.md"), "utf8").split("\n");
  const tunable = lines
    .map((l, n) => (l === "<!-- hitl:knob pr-body-sections -->" ? (lines[n + 1] ?? "") : null))
    .filter((l): l is string => l !== null);
  expect(tunable).toHaveLength(2);
  for (const l of tunable) {
    expect(l).not.toContain("names its reader");
    expect(l).not.toContain("Needs you");
  }
  expect(pr).toContain("A section enters a PR body only if it has a reader");
  expect(readFileSync(join(ROOT, "commands/customize.md"), "utf8")).toContain(
    "TL;DR bullets plus Why",
  );
});
```

(Add `readFileSync` from `node:fs` and `join` from `node:path` to the file's imports.)

- [ ] **Step 2: Run** `pnpm test -- pr-body` — Expected: the new test FAILS.

- [ ] **Step 3: Rewrite `templates/HITL.md` § Pull requests.** The section reads, in this order (keep the two anchor lines exactly where shown; everything else has no anchor above it):

```
- Every slice PR body includes a line pointing to the slice's plan, for the agents that check
  the diff against what was planned:

  `Plan: docs/superpowers/plans/<file>.md`

  It sits inside the fold (below), on a line of its own. Omit only when there is genuinely no
  plan (e.g. this convention's own bootstrap PR); the reviewer then falls back to searching
  `docs/superpowers/plans/`. The umbrella PR carries no `Plan:` line.
- A section enters a PR body only if it has a reader: the human, above the fold and short, or
  an agent, inside the fold. A section with neither is not written. There is no What and no
  How section.
- Exempt from this section's rules: the generated wipe PR, whose body is written by
  `wipe.mjs`, and the upgrade PR `/hitl:diff --apply` opens, whose body is a merge report.
<!-- hitl:knob pr-body-sections -->
- Every PR body opens with `## TL;DR`: 1 to 3 bullets, each one line of about 15 words at
  most, a fragment and not a sentence, saying only what changed as someone using the thing
  would notice it — no why, no how, no risk, no file, function or test names. A change nobody
  using the thing would notice says `No visible change: <what was reorganised>`. Then
  `## Why`: 2–3 sentences in plain words (explain it as you would to an intern), concise and
  realistic — do not invent rationale to fill space; one honest line is fine for a trivial
  change. An umbrella PR summarises the feature, never one bullet per slice, and then lists
  its slices.
- A slice PR shows `## Needs you` after `## Why` only when one of these happened, one line
  each, and nothing else is ever written there: a deferred gap the reviewer marked 🟠; "The
  security follow-up did not run for this slice."; an allowed plan edit the implementer made.
- A slice PR ends with one `<details>` block whose summary is exactly
  `For agents — skip when reviewing`. The label addresses the human; an agent told to read
  the PR body reads the fold. It holds the `Plan:` line and `## Review decisions`.
<!-- hitl:knob pr-body-sections -->
- A PR opened by `/implement-stack` carries `## Review decisions` inside the fold: every
  declined or deferred review finding in plain words — the concern as a user or the data
  would experience it, the decision, the reason — never file, function or test names. A human
  overturns one by commenting on the PR.
```

The no-install doctrine is rendered from the same file: if the old section had `<!-- hitl:mode … -->` variants inside it, keep each variant's mode-specific wording (the wipe sentence differs by mode) and apply the same changes to both.

- [ ] **Step 4: Edit the `pr-body-sections` row of `commands/customize.md`.** "Where" column: `` `.hitl/HITL.md` § Pull requests (the TL;DR and Why bullet and the Review decisions bullet, both anchored); `implement-stack.md`, the body block ``. Default column: `TL;DR bullets plus Why, with Review decisions in the agent fold — a newcomer can follow it`.

- [ ] **Step 5: Re-render**, run `pnpm test` — Expected: PASS. `knob-anchors.test.ts` must still pass unchanged (ten knobs; `pr-body-sections` anchored).

- [ ] **Step 6: Commit** — `git commit -m "docs(doctrine): a PR section names its reader"` (same `git add` as Task 1, plus `commands/customize.md`).

### Task 4: Dry run and gates

**Files:** none committed.

- [ ] **Step 1: Umbrella dry run.** Following the re-rendered `.claude/agents/handover.md` as the handover agent would, write the `## Umbrella PR body` section for the fixture spec `.claude/fixtures/spec-fixture-design.md` and the fixture plans under `.claude/fixtures/plans/` into a scratch file outside the repository (never under `docs/superpowers/`). Then build the PR body from it by the re-rendered `.claude/commands/umbrella-pr.md` step 2 rule, without calling the PR script. Check: 1 to 3 one-line bullets under `## TL;DR`; `## Why`; `## Slices` with the stack markers; no What, How, Notes, `Plan:` or `<details>`.

- [ ] **Step 2: Old-shape dry run.** Apply the same step 2 rule to `git show main:.claude/agents/handover.md`'s body shape filled for the same fixture (a `Plan:` line first, `## Notes` last), followed by a made-up `## My note` heading. Check: the body is copied whole, `Plan:` and `## Notes` included, and `## My note` is not.

- [ ] **Step 3: Slice body dry run.** Following the re-rendered `.claude/commands/implement-stack.md` body block, write a slice body for the fixture slice with no Needs-you case. Check: no `## Needs you` heading; the fold is last; `Plan:` starts at column 0 inside it. Write it once more with "the security follow-up did not run": `## Needs you` appears with that one line, and the line is absent from the fold.

- [ ] **Step 4: Run the gates** — `pnpm test` and `pnpm format:check`, both PASS.

- [ ] **Step 5: Report.** In the reply, give a `## Dry runs` checklist with one `- [x]` line per check above (or `- [ ]` with what was seen instead), for the slice PR body. A check that could not be run is reported as not run, never ticked.
