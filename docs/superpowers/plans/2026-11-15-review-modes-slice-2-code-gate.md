# Review modes, slice 2 — elaborate slice review

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Owns:** a slice of a feature marked elaborate gets a second review — adversarial and security, on the diff including the first fixes — and a second fix pass before its PR opens.

**Goal:** `/review-slice` and `/implement-stack` read the feature's mode from its spec(s) and, in elaborate mode, run the adversarial and security step after the cold review and its fixes.

**Architecture:** The two reviewers from slice 1 gain a slice side. `/review-slice` gains a `--step` argument; `/implement-stack` calls it twice per slice in elaborate mode, with a fixer run after each. The mode is read with slice 1's `review-mode.sh` from the handover document's `Spec(s):` lines.

**Tech Stack:** Markdown prompts under `templates/`, Node ESM (`installer/lib.mjs`), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-15-review-modes-design.md`

## Global Constraints

- Simple mode is today's behaviour, unchanged: one review, one fix, "no second review".
- At the code gate an invalid mode value or a listed spec file that does not exist is a STOP in `/implement-stack` and a refusal in `/review-slice` — never simple. No line in any listed spec is simple.
- `/implement-stack` reads the mode once per slice, when that slice's review starts.
- The second reviewers are briefed cold: nothing about the first review, its triage or each other. Only the security follow-up sees the adversarial review, as data.
- Triage at the code gate has no YOUR CALL. The second fixer's commits are not reviewed again.
- New reviewers keep the existing finding types (DEFERRED included at a slice), severities, cap and output skeleton with its `| Verdict |` row.
- Templates are the source; after any change under `templates/`, run the re-render commands in slice 1's plan (`docs/superpowers/plans/2026-11-15-review-modes-slice-1-spec-gate.md`, "Re-render commands") and commit the results with the change.
- Local gates before the PR: `pnpm test` and `pnpm format:check`. Markdown is never formatted.

## Review Focus

- A feature with two specs, one elaborate and one with no line → elaborate (pinned by slice 1's script tests; this slice passes every `Spec(s):` path to the script — asserted in Task 2).
- `/review-slice --step second` in a simple-mode feature must refuse, not quietly run three reviewers — Task 2.
- A second review where one reviewer wrote nothing must STOP the stack, not open the PR — Task 3.
- A slice whose first triage had no APPLY rows still gets the second review — Task 3.
- A fix-up run in elaborate mode must not re-apply findings the PR already records as declined — Task 3.

---

### Task 1: the reviewers' slice side, and the fixture diff

**Files:**
- Modify: `templates/claude/agents/adversarial-reviewer.md`, `templates/claude/agents/security-reviewer.md`
- Create: `templates/claude/fixtures/slice/slice-fixture.patch`, `templates/claude/fixtures/slice/2026-09-06-slice-fixture-slice-1-tag-export.md`
- Modify: `installer/lib.mjs` (`FIXTURES`)
- Test: `scripts/__tests__/review-modes.test.ts`, `scripts/__tests__/lib.test.ts`

**Interfaces:**
- Produces: slice briefs both agents accept (the body after the first sentence is exactly what `/review-slice` § 1 gives the cold slice reviewer today — diff path, plan path, changed files, output path, forwarded items, stack table):
  - `Adversarial review of the slice on branch <branch> against parent <PARENT>. …`
  - `Security review of the slice on branch <branch> against parent <PARENT>. …`
  - `Security follow-up on the slice on branch <branch> against parent <PARENT>. Adversarial review: <ADV>. …`

- [ ] **Step 1: Write the failing tests** in `review-modes.test.ts`, describe "the reviewers' slice side", on the installed and plugin render of both agents: contains `## Reviewing a slice`, `DEFERRED`, `STACK TABLE`, `read each in full`; security contains `injection`, `secrets in code, logs or errors`; adversarial still contains `No scenario, no finding.`; security still contains `No attack, no finding.`. In `lib.test.ts`: `ownedFiles(...)` contains both new fixture paths under `.claude/fixtures/slice/`.
- [ ] **Step 2: Run** `pnpm test` — expect FAIL.
- [ ] **Step 3: Edit both agent templates.** Opening paragraph: the target is a spec or a slice, told by the brief ("of the spec at" / "of the slice on branch"). Add `## Reviewing a slice`, built from `templates/claude/agents/slice-reviewer.md`:
  - grounding additions for a slice, copied from the slice reviewer: the diff file, the plan, every changed file "read each in full" when it exists on disk, the `STACK TABLE` in the brief as the only authority on which slice owns what, the forwarded items;
  - DEFERRED and its rule copied from the slice reviewer (a gap a later slice owns is DEFERRED, never a defect of this slice); the slice reviewer's output title and location column (`file:line`) in place of `§<section>`;
  - **Adversarial at a slice**: the same method applied to the code — which inputs, orderings, repeated or concurrent calls, empty or huge values, or failures of what it calls make this diff do the wrong thing; the scenario names the input and the wrong result.
  - **Security at a slice**: injection into a shell, a query, a path or a template; a missing or bypassable check; secrets in code, logs or errors; unsafe handling of files, URLs or deserialised data; a new dependency or permission wider than the slice needs.
  - The follow-up section says it applies to a slice the same way.
- [ ] **Step 4: Write the fixtures.**
  - `slice/2026-09-06-slice-fixture-slice-1-tag-export.md`: a fixture plan of about 25 lines, header `**Owns:** export one tag's expenses as a CSV file.` and `**Reviewed:** grandfathered (2026-09-06).`, one task: an `exportTag(tag)` function and its test.
  - `slice/slice-fixture.patch`: a unified diff of about 40 lines adding `src/export-tag.js` and its test, with two planted problems and nothing else notable: *injection* — the tag name is interpolated into a shell command (`execSync(\`grep ${tag} expenses.csv > out.csv\`)`); *breakable assumption* — it reads `rows[0].currency` for the header, which throws when the tag has no expenses.
  - Add both to `FIXTURES`.
- [ ] **Step 5: Re-render. Run** `pnpm test` and `pnpm format:check` — expect PASS. If Prettier reports the `.patch` or fixture `.js` content, the patch is not a formatted type; do not add ignore rules without need.
- [ ] **Step 6: Commit** `feat(agents): adversarial and security reviewers, slice side`.

### Task 2: `/review-slice --step second`

**Files:**
- Modify: `templates/claude/commands/review-slice.md`
- Test: `scripts/__tests__/review-modes.test.ts`, `scripts/__tests__/plugin-prompts.test.ts`

**Interfaces:**
- Consumes: `review-mode.sh` (slice 1), the slice briefs (Task 1).
- Produces: `/review-slice [<handover path>] [--parent <ref>] [--step cold|second]`, default `cold` (today's behaviour, byte-for-byte in what it runs). `--step second` writes `.claude/reviews/<stamp>-<feature>-slice-<N>-code-adversarial.md`, `…-code-security.md`, `…-code-security-followup.md` and prints the same two things the cold step prints: a triage table (with a `Lens` column) and a `## Review decisions` block. Its last line names the three paths, one per line, prefixed `ADV:`, `SEC:`, `FOL:` — `/implement-stack` reads them.

- [ ] **Step 1: Write the failing tests** on the installed and plugin render of `review-slice.md`: contains `--step cold|second`, `## 1S. Second step — adversarial and security`, `-code-adversarial.md`, `-code-security.md`, `-code-security-followup.md`, `ADV:`, `Lens`, the exact sentences `refused: this feature is in simple mode — there is no second step` and `An invalid value or a missing spec file is a refusal, never simple.`; installed contains `scripts/hitl/review-mode.sh`, plugin contains `"${CLAUDE_PLUGIN_ROOT}/runtime/review-mode.sh"`; plugin names `` `hitl:adversarial-reviewer` `` and `` `hitl:security-reviewer` ``.
- [ ] **Step 2: Run** `pnpm test` — expect FAIL.
- [ ] **Step 3: Edit `templates/claude/commands/review-slice.md`.**
  - Frontmatter `description` and `argument-hint`: add `[--step cold|second]` and "in elaborate mode, a second step with an adversarial and a security reviewer".
  - **§ 0, added**: resolve the mode. Take every path under the handover document's `Spec(s):` line and pass them all to the script in one call. Exit 2 → print its message and stop: "An invalid value or a missing spec file is a refusal, never simple." `absent` → simple. With no handover document, after asking for the parent and the plan, also ask: "simple or elaborate?". `--step second` in simple mode → `refused: this feature is in simple mode — there is no second step`. The existing shell block (BASE, DIFF, CHANGED, the empty-diff refusal) is shared by both steps; `OUT` becomes the three paths for the second step.
  - **§ 1**: unchanged; one line added at its top — "With `--step second`, run § 1S instead."
  - **New § 1S**: spawn `adversarial-reviewer` and `security-reviewer` in one message with the Task 1 briefs "and nothing else — nothing about the cold review, its triage or each other"; when both return, spawn `security-reviewer` with the follow-up brief. Check each of the adversarial and security files exists and has a `| Verdict |` row; if either does not, print `no review: <which>` and stop without a triage table. A follow-up file missing or without a verdict row: carry on and print `the security follow-up did not run`.
  - **§ 2, added paragraph**: for the second step, triage the three files as one list with a `Lens` column; the same problem from two lenses is one row. Repeat-decline rule: a finding that repeats something already declined for this slice — in this session's earlier Review decisions block, or, when the slice's PR already exists, in its body's `## Review decisions` (read with the PR shim's `view`) — is declined again for the same reason and adds no new line to the block.
  - **§ 3, added**: after the cold step in elaborate mode, by hand, print "elaborate mode: after the fixes, run `/review-slice --step second`".
- [ ] **Step 4: Re-render. Run** `pnpm test` — expect PASS.
- [ ] **Step 5: Commit** `feat(review-slice): the second step for elaborate mode`.

### Task 3: `/implement-stack` — second review, second fix, PR body

**Files:**
- Modify: `templates/claude/commands/implement-stack.md`
- Test: `scripts/__tests__/review-modes.test.ts`

**Interfaces:**
- Consumes: `/review-slice --step second` and its `ADV:` / `SEC:` / `FOL:` lines (Task 2); `review-mode.sh`.

- [ ] **Step 1: Write the failing tests** on the installed and plugin render of `implement-stack.md`: contains `**c2. Second review (elaborate mode).**`, `**d2. Second fix (elaborate mode).**`, `--step second`, the exact sentences `Read the mode once per slice, when its review starts.`, `In simple mode: no second review. The fixer's commits ship as they are.`, `In elaborate mode the second fixer's commits ship as they are; there is no third review.`, `The second review runs even when the first triage had no APPLY rows.`, `The security follow-up did not run for this slice.`; does not contain the sentence `No second review. The fixer's commits ship as they are.` at the start of a line; the Never section contains `Review more often than the mode prescribes.` and not `Review twice.`.
- [ ] **Step 2: Run** `pnpm test` — expect FAIL.
- [ ] **Step 3: Edit `templates/claude/commands/implement-stack.md`.**
  - Frontmatter description: "implementer, slice review (two steps in elaborate mode), fixer, PR per slice".
  - **Step c**, at its top: "Read the mode once per slice, when its review starts." Run the script on every `Spec(s):` path of the handover document; exit 2 → **STOP**: "slice <N>: <the script's message>", ask the human. `absent` → simple. Step c is otherwise unchanged and is the cold step.
  - **Step d**: replace its closing line with "In simple mode: no second review. The fixer's commits ship as they are." and "In elaborate mode: continue with c2."
  - **New c2. Second review (elaborate mode).** "The second review runs even when the first triage had no APPLY rows." Run `/review-slice <handover path> --step second` on the branch as the first fixer left it, so the diff includes its commits; paste the stack table verbatim as in c. Then the same checks as c, on the `ADV:` and `SEC:` files: either missing, empty or without a verdict row → **STOP** "slice <N>: the second review produced nothing", naming the file and the reviewer's reply; a `DECLINE: wrong gate` that needs a design change → **STOP**. A `FOL:` file missing or without a verdict row is not a stop: add the line "The security follow-up did not run for this slice." to the PR body's Review decisions.
  - **New d2. Second fix (elaborate mode).** As d, on the second triage's APPLY rows, with the three review file paths. `blocked` → **STOP**. "In elaborate mode the second fixer's commits ship as they are; there is no third review."
  - **PR body block**: `## Review decisions` is "the blocks from both steps of /review-slice, plus both fixers' not-reproduced items; or `None — every finding was applied.`".
  - **Resume**: one sentence where resumed `branched` slices are described — a slice that has no open PR resumes from step b's check, so both review steps run again.
  - **Fix-up**, item 2: in elaborate mode, after the fixer on the cold step's APPLY rows, run `/review-slice <handover path> --parent <previous tip> --step second` and the fixer on its APPLY rows; the c2 stops apply; the repeat-decline rule reads the PR's existing `## Review decisions`.
  - **Never**, both `hitl:mode` branches: `Review twice.` becomes `Review more often than the mode prescribes.`
- [ ] **Step 4: Re-render. Run** `pnpm test` — expect PASS.
- [ ] **Step 5: Commit** `feat(implement-stack): second review and second fix in elaborate mode`.

### Task 4: doctrine, `/hitl:help`, README — the code gate

**Files:**
- Modify: `templates/HITL.md`, `commands/help.md`, `README.md`
- Test: `scripts/__tests__/knob-anchors.test.ts`, `scripts/__tests__/review-modes.test.ts`

- [ ] **Step 1: Write the failing tests.** `knob-anchors.test.ts`: this repository's `HITL.md` contains ``The `**Review mode:**` header line of a spec — `/review-spec`, `/review-slice` and `/implement-stack`.`` (replacing slice 1's assertion). `review-modes.test.ts`: `templates/HITL.md` does not contain `arrives with the next slice` and contains `second fix`; `commands/help.md` contains `(twice in elaborate mode)`.
- [ ] **Step 2: Run** `pnpm test` — expect FAIL.
- [ ] **Step 3: Edit.**
  - `templates/HITL.md` § Review modes: replace slice 1's closing sentence with the code gate's elaborate flow — per slice: cold review, triage, fixer; then the adversarial and security step on the diff including those fixes, one merged triage, a second fix; no third review; a second review that produced nothing is a STOP; the mode is read from the spec(s) the handover lists, any `elaborate` wins, an invalid value or a missing spec is a STOP. § Gates, Code gate bullet: untouched (anchored neighbours); § Review gates, the unanchored paragraph from slice 1: add that the two reviewers also run at the code gate. § Load-bearing invariants: the mode line's parsers become `/review-spec`, `/review-slice` and `/implement-stack`. § Pull requests, the `## Review decisions` bullet is under the `pr-body-sections` anchor: leave it; the Review modes section says the block covers both steps.
  - `commands/help.md`: chain line 4 becomes `per slice: implementer → /review-slice → fixer (twice in elaborate mode) → PR onto the parent`; update `help.test.ts` if it pins the line.
  - `README.md`: extend slice 1's paragraph on modes with one sentence on the code gate, and the "how it works" diagram's slice column with "(elaborate: + adversarial, security)".
- [ ] **Step 4: Re-render. Run** `pnpm test` and `pnpm format:check` — expect PASS.
- [ ] **Step 5: Commit** `docs(doctrine): review modes at the code gate`.

---

## Validation (not automated; listed in the PR body for the human)

1. **The reviewers, by dry run.** Spawn each new reviewer directly with a slice brief whose diff is `.claude/fixtures/slice/slice-fixture.patch`, whose plan is the fixture plan beside it, whose changed-files list says "none on disk — the diff is the whole change (dry run)", and whose stack table has that one slice. The security review must report the shell injection; the adversarial review must report the empty-tag crash; the follow-up, run on the adversarial result, must write a review with a verdict row.
2. **The orchestration, by a watched run.** The first real slice of a feature marked elaborate: two review steps, two fixer runs, a PR body whose Review decisions cover both. A fixture cannot stand in for a branch, a parent and a PR.

## Review decisions

- **Forwarded to the code gate**: none.
- From the spec's forwarded items: the fixture diff is a patch file handed to the reviewer in a slice brief with no files on disk (Task 1, Validation 1); fix-up mode's repeat-decline rule reads the PR body (Tasks 2 and 3); the orchestrator's "No second review" and "Review twice" lines are edited in Task 3.
