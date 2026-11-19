# Three review modes, slice 2 — the code gate

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Owns:** a slice of a feature marked `elaborate` gets a second review by the adversarial reviewer alone, one marked `complete` gets adversarial, security and the follow-up, and every slice PR says in words which mode reviewed it.

**Reviewed:** round 1 (2026-11-19) · round 2 (2026-11-19).

**Goal:** `/review-slice --step second` runs one reviewer or three by mode; `/implement-stack` runs the second step in both modes, stops when the mode changed mid-slice, and opens each PR with the mode line at the top of `## Review decisions`.

**Architecture:** One second-step section in `/review-slice` (§ 1S), the security part conditional on `complete`. It always ends with the three path lines `ADV:`, `SEC:`, `FOL:`; in `elaborate` the last two read `none`, so `/implement-stack` reads one shape in both modes. Which files it requires comes from the mode it read itself, never from the lines: `ADV` always, `SEC` too in complete.

**Tech Stack:** Markdown prompts under `templates/`, hand-written plugin commands under `commands/`, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-adversarial-review-mode-design.md`

## Global Constraints

- `simple` is unchanged: one review, one fix, `--step second` refused with today's message.
- `complete` at the code gate is exactly today's elaborate second step.
- The three mode lines are fixed copy, verbatim:
  - `Review mode: simple — cold review only.`
  - `Review mode: elaborate — cold review, then an adversarial review. No security review.`
  - `Review mode: complete — cold review, then an adversarial and a security review.`
- The adversarial slice brief exists once per wording in `/review-slice`.
- Slice 1 left two interim sentences (`Here \`complete\` runs the same second step as \`elaborate\`.` in `review-slice.md`, `A slice in complete mode runs every step an elaborate one runs.` in `implement-stack.md`) and their pins; this slice removes both sentences and both pins.
- `templates/` is the source. After any change under it, run both refresh procedures in `AGENTS.md` § Local gates and commit the regenerated files with the change. `README.md`, `commands/help.md` and `commands/customize.md` are hand-written and not rendered.
- Local gates before the PR: `pnpm test` and `pnpm format:check`. Markdown is never formatted.
- The spec's § Fixtures dry runs are run by the `/implement-stack` session, not by the implementer.
- File count: over the ~20-file tripwire for the same reason as slice 1 — each template is committed three times.

## Review Focus

- `--step second` with no handover document → must ask "elaborate or complete?", never assume (Task 1).
- An `elaborate` second step whose adversarial reviewer wrote nothing → STOP, no PR (Tasks 1, 2).
- The spec's line edited from `complete` to `elaborate` between the cold step and the second step → STOP, not a quiet lighter review (Task 2).
- A `complete` second step that prints `SEC: none` → STOP as an unreviewed slice, never a PR (Task 2).
- A slice where every finding was applied → the PR still carries the mode line, above "None — every finding was applied." (Task 2).

---

### Task 1: `/review-slice` second step by mode

**Files:**
- Modify: `templates/claude/commands/review-slice.md` (rendered to `.claude/commands/`, `commands/`)
- Test: `scripts/__tests__/review-modes.test.ts` (describe "/review-slice --step second")

**Interfaces:**
- Produces: every run prints the mode line once, right after the mode is known. `--step second` ends with three lines — `ADV: <path>`, then `SEC: <path>` and `FOL: <path>` in complete, `SEC: none` and `FOL: none` in elaborate. Task 2 reads the mode line and these three lines.

- [ ] **Step 1: Update the pinned strings** on both renders. Replace the § 1S heading pin with `## 1S. Second step — adversarial, and security in complete mode`. Add: the three mode lines; `simple, elaborate or complete?`; `ask only "elaborate or complete?"`; `not.toContain("taken as elaborate")`; `In elaborate mode, spawn the` and `agent alone, with the brief below and nothing else` (the agent between them is `adversarial-reviewer` installed, `hitl:adversarial-reviewer` in the plugin render — assert each form's own name); `SEC: none`; `FOL: none`; `In elaborate mode the table has no \`Lens\` column.`; `A line beginning "Review mode:" is not a decline and is skipped.`; `` `<mode>` mode: after the fixes, run `` followed on the same line by `` `/review-slice --step second` `` in the installed render and `` `/hitl:review-slice --step second` `` in the plugin's. Add `not.toContain` for slice 1's interim sentence. Keep the refusal, `--pr <number>`, repeat-decline and file-name pins. One count assertion: `Adversarial review of the slice on branch` occurs exactly once in each render.
- [ ] **Step 2: Run** `pnpm test scripts/__tests__/review-modes.test.ts` — expect FAIL.
- [ ] **Step 3: Edit the template**, both wordings:
  - Frontmatter description names both modes.
  - `### Mode`: three values, `absent` → `simple`; then the three mode lines and "Print the mode line once per run, as soon as the mode is known." With no handover document: ask "simple, elaborate or complete?"; with `--step second` and no handover, ask only "elaborate or complete?" (that exact wording — it is pinned) and remove "which is taken as elaborate and asks nothing". Simple-mode refusal unchanged.
  - The path block: `ADV` in both modes; `SEC` and `FOL` only in complete.
  - § 1S: new heading; "Only in elaborate or complete mode, with `--step second`". "In elaborate mode, spawn the `adversarial-reviewer` agent alone, with the brief below and nothing else." then the adversarial brief once; "In complete mode," the parallel spawn and follow-up as today, pointing at that brief.
  - The checks: elaborate checks `<ADV>` only; complete as today. The closing lines: always three; `SEC: none` and `FOL: none` in elaborate.
  - § 2 "The second step": complete triages three files with `Lens`; "In elaborate mode the table has no `Lens` column." The earlier-declines reader gains: `A line beginning "Review mode:" is not a decline and is skipped.`
  - § 3: the closing print uses `<mode>` and applies after the cold step in elaborate or complete. The whole sentence sits on one line of the template — it is pinned.
- [ ] **Step 4: Re-render, run** `pnpm test` — expect PASS.
- [ ] **Step 5: Commit** `feat(review-slice): one reviewer in elaborate, three in complete`.

### Task 2: `/implement-stack` — both modes, the mode-change stop, the PR's mode line

**Files:**
- Modify: `templates/claude/commands/implement-stack.md` (rendered to `.claude/commands/`, `commands/`)
- Test: `scripts/__tests__/review-modes.test.ts` (describe "/implement-stack in elaborate mode"), `scripts/__tests__/knob-anchors.test.ts`, `scripts/__tests__/plugin-prompts.test.ts` if a pin there moves

**Interfaces:**
- Consumes: Task 1's mode line and three path lines.
- Produces: every slice PR body's `## Review decisions` begins with the mode line; so does every fix-up Review decisions comment.

- [ ] **Step 1: Update the pinned strings** on both renders. Replace `**c2. Second review (elaborate mode).**` / `**d2. Second fix (elaborate mode).**` / `In elaborate mode the second fixer's commits ship as they are; there is no third review.` with the same sentences reading `(elaborate and complete modes)` and `In elaborate and complete modes the second fixer's …`. Add: `\`ADV\` always; in complete mode \`SEC\` too`; `A \`SEC:\` line that reads \`none\` or is missing in complete mode is the same STOP`; `a \`SEC:\` or \`FOL:\` line that is not \`none\` in elaborate mode`; `the mode word in its \`Review mode:\` line differs from the mode read at step c, or it prints no such line`; `The \`## Review decisions\` section begins with the mode line for the mode read at step c, verbatim`; `In complete mode only: a \`FOL:\` file missing`; in the Fix-up slice of the text, `begins with the mode line for the mode read at the start of that section`. In `knob-anchors.test.ts`: no paragraph under a `<!-- hitl:knob pr-body-sections -->` anchor in `templates/claude/commands/implement-stack.md` contains `begins with the mode line`. Add `not.toContain` for slice 1's interim sentence. Keep the stop messages and `In simple mode: no second review. The fixer's commits ship as they are.`
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Edit the template**, both wordings:
  - Frontmatter description: "two steps in elaborate and complete mode".
  - Step c: three values; drop the interim sentence. After d: "In elaborate or complete mode: continue with c2."
  - c2: new heading. It prints a triage table (with `Lens` in complete), the Review decisions block, and the three path lines. Run the existing check on "`ADV` always; in complete mode `SEC` too". Stops: `no review` for a checked file (unchanged message), and "A `SEC:` line that reads `none` or is missing in complete mode is the same STOP" — the security review did not run; a wrong-gate row (unchanged); and one merged mode-change stop — `/review-slice` refuses the step, or "the mode word in its `Review mode:` line differs from the mode read at step c, or it prints no such line", or it prints "a `SEC:` or `FOL:` line that is not `none` in elaborate mode" → today's "slice <N>: the review mode changed during the slice". The follow-up note is prefixed "In complete mode only:".
    The two `SEC:` stops spell out the spec's "c2 checks `ADV` always, `SEC` in `complete`" and its mode-change stop for the path lines; the spec records them.
- d2: new heading; the fixer gets the adversarial review in elaborate mode, and the adversarial, security and follow-up reviews in complete mode.
  - The PR body template: the `## Review decisions` placeholder is preceded by `<the mode line for the mode read at step c>`, and the paragraph after the template — outside the `<!-- hitl:knob pr-body-sections -->` anchor's paragraph — says: "The `## Review decisions` section begins with the mode line for the mode read at step c, verbatim, in all three modes — also when the rest is 'None — every finding was applied.'"
  - § Fix-up step 2: "In elaborate or complete mode, then run … `--step second`"; step 3: the appended Review decisions comment "begins with the mode line for the mode read at the start of that section".
  - "A resumed `branched` slice …" sentence near the top names both modes.
- [ ] **Step 4: Re-render, run** `pnpm test` — expect PASS.
- [ ] **Step 5: Commit** `feat(implement-stack): second step in elaborate and complete; PRs say the mode`.

### Task 3: the agents' wording

**Files:**
- Modify: `templates/claude/agents/adversarial-reviewer.md`, `templates/claude/agents/security-reviewer.md`, `templates/claude/agents/fixer.md` (rendered to `.claude/agents/`, `agents/`)
- Test: `scripts/__tests__/review-modes.test.ts`

- [ ] **Step 1: Write the failing tests** on both renders: the adversarial reviewer's description contains `Invoked in elaborate and complete mode`; the security reviewer's contains `Invoked in complete mode`; the fixer contains `or several in complete mode` and `in elaborate mode, after the second review, the adversarial review`; none of the three contains `several in elaborate mode`.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Edit** the two descriptions and the fixer's description and "Your brief names" paragraph: one file after the cold step; after the second review, the adversarial review in elaborate mode, or the adversarial, security and follow-up reviews in complete mode. No other line of the reviewers changes.
- [ ] **Step 4: Re-render, run** `pnpm test` — expect PASS.
- [ ] **Step 5: Commit** `docs(agents): which mode invokes which reviewer`.

### Task 4: doctrine, README, help and the customize row

**Files:**
- Modify: `templates/HITL.md` (rendered to `.hitl/HITL.md`, `doctrine/HITL.md`), `README.md`, `commands/help.md`, `commands/customize.md`
- Test: `scripts/__tests__/review-modes.test.ts` (describe "doctrine and plugin commands"), `scripts/__tests__/knob-anchors.test.ts`, `scripts/__tests__/help.test.ts` if it pins the changed line

- [ ] **Step 1: Update the tests.** Doctrine: contains `- **Complete**, at the code gate`, `then the adversarial reviewer alone, on the slice's diff including those fixes`, `begins with the review mode in words`, `the security reviewer in complete mode only` (`- **Elaborate**, at the code gate` and `second fix` are already there today and prove nothing). In `knob-anchors.test.ts`: no paragraph under a `<!-- hitl:knob pr-body-sections -->` anchor in `templates/HITL.md` contains `review mode in words`. `commands/help.md`: replace `(twice in elaborate mode)` with `(twice in elaborate and complete mode)`. `README.md`: contains `three modes`, `**complete**`. `commands/customize.md`: the `review-rounds` row still contains `simple mode and the plan gate` and now contains `elaborate and complete mode`.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Edit.**
  - Doctrine § Review modes: "**Elaborate**, at the code gate" — cold review, triage, fixer; "then the adversarial reviewer alone, on the slice's diff including those fixes" (pinned); triage; a second fix. "**Complete**, at the code gate" — today's elaborate text. Both keep: no third review; a second review that produced nothing is a STOP; the PR's `## Review decisions` covers both steps.
  - Doctrine § Gates and who decides, the Code gate bullet: the section "begins with the review mode in words", then the declines. In § Pull requests the same sentence goes in a paragraph of its own, separated by a blank line from the `## Review decisions` bullet: that bullet sits under the `pr-body-sections` knob anchor, and the mode line must not be tunable away by `/hitl:customize`.
  - Doctrine § Review gates: the two opening sentences and the "Two further reviewers" paragraph — the adversarial reviewer runs in elaborate and complete mode, "the security reviewer in complete mode only" (pinned); the second `/review-slice` step runs in both.
  - `README.md`: the diagram line reads `(elaborate, complete: + a second review)`; the modes paragraph describes three modes in the spec's order.
  - `commands/help.md`: the per-slice line. `commands/customize.md`: the `review-rounds` row — "elaborate and complete mode are always one cold round plus their own round".
- [ ] **Step 4: Re-render, run** `pnpm test` and `pnpm format:check` — expect PASS.
- [ ] **Step 5: Commit** `docs: the code gate in three modes`.
