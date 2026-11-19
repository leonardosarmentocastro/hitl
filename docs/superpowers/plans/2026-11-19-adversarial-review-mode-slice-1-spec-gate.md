# Three review modes, slice 1 — the spec gate

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Owns:** a spec is reviewed in one of three modes — `simple`, `elaborate` (round 2 is the adversarial reviewer alone) or `complete` (round 2 is adversarial, security and the follow-up) — and `/review-spec` says which, in words.

**Goal:** `review-mode.sh` accepts `complete` and ranks the three values; `/review-spec` asks for one of three, prints the mode line, and runs an adversarial-only round 2 in `elaborate`; the doctrine names the three values.

**Architecture:** One second-round section in `/review-spec` (§ 1E) that always spawns the adversarial reviewer and, only in `complete`, also the security reviewer and its follow-up. The code-gate commands learn nothing new yet: they treat `complete` like `elaborate`, so nothing breaks between this slice and the next.

**Tech Stack:** POSIX sh + awk (`templates/scripts/review-mode.sh`), Markdown prompts under `templates/`, Node ESM (`installer/lib.mjs`), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-adversarial-review-mode-design.md`

## Global Constraints

- `complete` must behave exactly as `elaborate` does before this slice: same three briefs, same file names, same recording rule, same `Lens` triage.
- The three mode lines are fixed copy, used verbatim wherever a task says "the mode line":
  - `Review mode: simple — cold review only.`
  - `Review mode: elaborate — cold review, then an adversarial review. No security review.`
  - `Review mode: complete — cold review, then an adversarial and a security review.`
- The elaborate and complete round rule stays outside the `<!-- hitl:knob review-rounds -->` anchors: two recorded rounds, never a third.
- The adversarial brief exists once per wording (installed, no-install) in each command — never one copy per mode.
- `templates/` is the source. After any change under it, run both refresh procedures in `AGENTS.md` § Local gates ("Refreshing this repository's manifest", "Refreshing the plugin's no-install files") and commit the regenerated files with the change.
- Local gates before the PR: `pnpm test` and `pnpm format:check`. Markdown is never formatted.
- The spec's § Fixtures dry runs are run by the `/implement-stack` session, not by the implementer; no task here runs them.
- File count: this slice passes the ~20-file tripwire because every template it edits is committed three times (template, this repository's render, the plugin's render); splitting would cut below a testable capability.

## Review Focus

- A feature with one `elaborate` spec and one `complete` spec → `complete` (Task 1).
- A spec that says `Complete.` with a capital and a period → `complete` (Task 1).
- An invalid value next to a `complete` spec → still refused (Task 1).
- A spec already at two recorded rounds whose line was changed to `elaborate` afterwards → stop, rerun nothing (Task 2).
- A slice reviewed between this slice and the next, in a feature marked `complete` → gets the full second step, not a refusal (Task 3).

---

### Task 1: the parser accepts `complete`

**Files:**
- Modify: `templates/scripts/review-mode.sh` (rendered to `scripts/hitl/review-mode.sh`, `runtime/review-mode.sh`)
- Test: `scripts/__tests__/review-mode.test.ts`

**Interfaces:**
- Produces: `review-mode.sh <spec>...` → stdout one word, exit 0: `complete` | `elaborate` | `simple` | `absent`. Exit 2, one stderr line, for an invalid value: `review-mode: <path>: invalid value '<value>' — use simple, elaborate or complete`. All other exits and messages unchanged.

- [ ] **Step 1: Write the failing tests** in the existing `describe("review-mode.sh")`, using its `spec`, `run`, `expectOk`, `expectRefused` helpers:
  - "reads complete": `**Review mode:** complete` → `complete`
  - "reads Complete. with a capital and a period": `**Review mode:**  Complete. ` → `complete`
  - "any complete wins": specs `simple`, `elaborate`, `complete` in that order → `complete`; and `complete` then `elaborate` → `complete`
  - "elaborate beats simple whatever the order": `elaborate` then `simple` → `elaborate`
  - "an invalid value beats complete": `complete` then `thorough` → refused, `invalid value`
  - "the refusal names the three values": `**Review mode:** thorough` → stderr contains `use simple, elaborate or complete`
- [ ] **Step 2: Run** `pnpm test scripts/__tests__/review-mode.test.ts` — expect the new tests to FAIL.
- [ ] **Step 3: Edit the script.** A third `case` arm and a rank so a lighter value never overwrites a heavier one; the new refusal text; the header comment describes three values and "the heaviest wins".
- [ ] **Step 4: Re-render, run** `pnpm test` — expect PASS.
- [ ] **Step 5: Commit** `feat(review-mode): accept complete; the heaviest mode wins`.

### Task 2: `/review-spec` in three modes

**Files:**
- Modify: `templates/claude/commands/review-spec.md` (rendered to `.claude/commands/review-spec.md`, `commands/review-spec.md`)
- Test: `scripts/__tests__/review-modes.test.ts` (describe "/review-spec"), `scripts/__tests__/knob-anchors.test.ts`

**Interfaces:**
- Consumes: Task 1's four output words.
- Produces: in `elaborate`, round 2 writes exactly one file, `.claude/reviews/<stamp>-<topic>-spec-adversarial.md`; in `complete`, the three files it writes today. Both record ` · round 2 (<date>)`.

- [ ] **Step 1: Update the pinned strings** on both renders. Replace `simple or elaborate?` with `simple, elaborate or complete?`; replace the § 1E heading pin with `## 1E. Round 2 — adversarial, and security in complete mode`; replace the two elaborate-only sentences with `Round 2 always runs in elaborate and complete mode, whether or not round 1 changed the spec.` and `In elaborate and complete mode, before applying the count below: the limit is two recorded rounds, whatever that count has been tuned to.` Add: the three mode lines; `Print the mode line once per run, as soon as the mode is known`; `In elaborate mode, spawn the \`adversarial-reviewer\` agent alone`; `round 2 failed (<YYYY-MM-DD>) — adversarial reviewer, <why>`; `In elaborate mode the table has no \`Lens\` column.` Keep every other existing pin (`-spec-security.md`, `-spec-security-followup.md`, `Lens`, `docs(spec): record review mode`). In `knob-anchors.test.ts`, the review-spec anchor test also rejects `/complete mode/i` inside an anchored paragraph.
- [ ] **Step 2: Run** `pnpm test scripts/__tests__/review-modes.test.ts` — expect FAIL.
- [ ] **Step 3: Edit the template**, in both the installed and no-install wording where a block has both:
  - Frontmatter description: "and, in elaborate mode, an adversarial reviewer; in complete mode, a security reviewer too".
  - `### Mode`: three values. The one-time question is "simple, elaborate or complete?" with the three explanation lines from the spec's § Spec gate, verbatim. After the bullets: the three mode lines and the rule "Print the mode line once per run, as soon as the mode is known: after the answer to the one-time question has been written and committed, when one was asked; on a dry run; and before the 'two rounds have run' stop. On the script's exit 2, print its message instead."
  - The two-recorded-rounds paragraph: applies in elaborate and complete; its added stop sentence becomes "this command cannot tell whether round 2 was a second cold round or this mode's own round; if the mode line was changed after two cold rounds, the adversarial round did not run, and nothing is rerun."
  - "The round that runs follows the mode line as it reads now": with round 1 recorded, elaborate or complete → § 1E; simple → § 1.
  - § 1E: new heading. The `ADV` path is set in both modes; `SEC` and `FUP` only in complete. Then: "In elaborate mode, spawn the `adversarial-reviewer` agent alone, with its brief below and nothing else." followed by the existing adversarial brief (one copy), then "In complete mode," and the existing parallel spawn and follow-up, referring to the adversarial brief above rather than repeating it.
  - § 2: elaborate — append ` · round 2 (<date>)` only if `<ADV>` exists with a `| Verdict |` row, else `round 2 failed (<YYYY-MM-DD>) — adversarial reviewer, <why>`; complete — today's text.
  - § 3: "After § 1E in complete mode" keeps the `Lens` paragraph; add "In elaborate mode the table has no `Lens` column."
  - § 5: the closing paragraph names both modes.
- [ ] **Step 4: Re-render, run** `pnpm test` — expect PASS (`plugin-prompts.test.ts` still finds `hitl:adversarial-reviewer` in `commands/review-spec.md`).
- [ ] **Step 5: Commit** `feat(review-spec): elaborate is adversarial only; complete adds security`.

### Task 3: the code gate tolerates `complete`

**Files:**
- Modify: `templates/claude/commands/review-slice.md`, `templates/claude/commands/implement-stack.md` (and their four renders)
- Test: `scripts/__tests__/review-modes.test.ts`

**Interfaces:**
- Produces: at the code gate `complete` and `elaborate` both run today's second step (adversarial, security, follow-up). Slice 2 replaces this.

- [ ] **Step 1: Write the failing tests** on both renders: `review-slice.md` contains `` `complete`, `elaborate` or `simple` → that is the mode. `` and `Here \`complete\` runs the same second step as \`elaborate\`.`; `implement-stack.md` contains `` `complete`, `elaborate` or `simple` → that is the mode for this slice. `` and `A slice in complete mode runs every step an elaborate one runs.` The simple-mode refusal pin stays.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Edit** the `### Mode` bullet of `review-slice.md` and step c's bullet of `implement-stack.md` to those sentences. Nothing else in either file changes.
- [ ] **Step 4: Re-render, run** `pnpm test` — expect PASS.
- [ ] **Step 5: Commit** `feat(code-gate): read complete as elaborate until the code gate splits them`.

### Task 4: the doctrine names three values

**Files:**
- Modify: `templates/HITL.md` (rendered to `.hitl/HITL.md`, `doctrine/HITL.md`)
- Test: `scripts/__tests__/review-modes.test.ts` (describe "doctrine and plugin commands"), `scripts/__tests__/knob-anchors.test.ts`

- [ ] **Step 1: Write the failing tests** on `templates/HITL.md`: contains `one of three modes`, `` `simple`, `elaborate` or `complete` `` (twice: § Review modes and § Specs and plans), `- **Complete**, at the spec gate`, `any \`complete\` wins, then any \`elaborate\``; does not contain `one of two modes`. In `knob-anchors.test.ts` the doctrine anchor test also rejects `/complete mode/i`; its anchor count stays 4.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Edit the doctrine**, only these places:
  - § Review modes opener: three modes, three values.
  - "**Elaborate**, at the spec gate": round 2 always runs and is the adversarial reviewer alone, then triage. Add "**Complete**, at the spec gate" carrying today's elaborate text (adversarial and security in parallel, the follow-up, one merged triage). Both: two recorded rounds, never a third.
  - The `/implement-stack` precedence bullet: "any `complete` wins, then any `elaborate`, no line is simple", STOP rule unchanged.
  - The rationalizations row: "The cold review was clean, skip round 2" / "In elaborate and complete mode round 2 always runs. …".
  - § Specs and plans, the `**Review mode:**` bullet: three values.
  - Leave the "**Elaborate**, at the code gate" bullet, § Review gates and § Pull requests untouched — slice 2 owns them.
- [ ] **Step 4: Re-render, run** `pnpm test` — expect PASS.
- [ ] **Step 5: Commit** `docs(doctrine): three review modes; the spec gate in each`.

### Task 5: a fixture for `complete`

**Files:**
- Create: `templates/claude/fixtures/spec-fixture-complete-design.md` (rendered to `.claude/fixtures/`)
- Modify: `installer/lib.mjs` (`FIXTURES`)
- Test: `scripts/__tests__/lib.test.ts`, `scripts/__tests__/review-modes.test.ts`

- [ ] **Step 1: Write the failing tests.** `lib.test.ts`: the owned-files list contains `.claude/fixtures/spec-fixture-complete-design.md`, placed after the elaborate fixture. `review-modes.test.ts`: the complete fixture, with its `**Status:**` and `**Review mode:**` lines removed, equals the elaborate fixture with the same two lines removed; and running `templates/scripts/review-mode.sh` on each template fixture prints `complete` and `elaborate`.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Create the fixture** as a copy of `spec-fixture-elaborate-design.md` with `**Status:** fixture for complete-mode dry runs. Deliberately imperfect.` and `**Review mode:** complete`. Add it to `FIXTURES` after the elaborate one.
- [ ] **Step 4: Re-render, run** `pnpm test` and `pnpm format:check` — expect PASS.
- [ ] **Step 5: Commit** `test(fixtures): a complete-mode spec fixture`.
