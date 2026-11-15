# Review modes, slice 1 — elaborate spec review

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Owns:** a spec can be reviewed in simple or elaborate mode — the `**Review mode:**` line, the question that sets it, and the adversarial and security round at the spec gate.

**Reviewed:** round 1 (2026-11-15) · round 2 (2026-11-15).

**Goal:** `/review-spec` reads a per-spec mode line and, in elaborate mode, runs one cold round followed by an adversarial and security round.

**Architecture:** One new shell script reads the mode line (so the rule has one tested parser, reused by slice 2). Two new reviewer agents are added as templates and registered in the installer so both forms of hitl render them. `/review-spec`, the doctrine and the plugin-only commands are edited as templates and re-rendered.

**Tech Stack:** POSIX shell + awk (script), Node ESM (`installer/lib.mjs`), Vitest (`scripts/__tests__/`), Markdown prompts.

**Spec:** `docs/superpowers/specs/2026-11-15-review-modes-design.md`

## Global Constraints

- Simple mode is today's behaviour, unchanged. No existing anchored paragraph (the line after a `<!-- hitl:knob review-rounds -->` marker, up to the next blank line) is edited; elaborate text goes in paragraphs of its own, outside every knob anchor.
- Mode values are `simple` and `elaborate`, read ignoring case, surrounding whitespace and one trailing period. Any other value is refused, never treated as simple.
- Elaborate mode at the spec gate is exactly two recorded rounds for any value of the `review-rounds` knob.
- New reviewers report in the existing six finding types, three severities, reporting cap and output skeleton with its `| Verdict |` row.
- Templates are the source. After any change under `templates/`, re-render this repository's copies, the manifest and the plugin's no-install files (commands below) and commit them with the change.
- Local gates before the PR: `pnpm test` and `pnpm format:check`. Markdown is never formatted.
- `scripts/__tests__/lib.test.ts` pins the owned paths as an explicit list with `toHaveLength(21)`. Each task that adds an owned file adds its path to that list and raises the count: Task 1 → 22, Task 2 → 24, Task 3 → 25.
- Prompts are validated by dry run, not unit tests; the text assertions in this plan only pin the rules a script or another command relies on.
- This slice does not touch `/review-slice`, `/implement-stack` or `/review-plan`.
- File tripwire: this slice crosses ~20 files because every template it changes is committed with its rendered copies (this repository's `.claude/`, the plugin's `agents/`, `commands/`, `doctrine/`, `runtime/`, and the manifest). The hand-written files are about a dozen; splitting the re-renders off would be a horizontal cut.

**Re-render commands** (run from the repository root; referred to below as "re-render"):

```bash
node --input-type=module -e 'import {renderAll, THIS_REPO_CHOICES as c} from "./installer/lib.mjs"; import {writeFileSync, mkdirSync, chmodSync} from "node:fs"; import {dirname} from "node:path"; for (const [p,{content,executable}] of renderAll(".", c)) { if (p===".claude/review-context.md") continue; mkdirSync(dirname(p),{recursive:true}); writeFileSync(p,content); if (executable) chmodSync(p,0o755); }'
rm .claude/hitl.json
node --input-type=module -e 'import { THIS_REPO_CHOICES as c } from "./installer/lib.mjs"; console.log(JSON.stringify(c))' > /tmp/hitl-answers.json
node installer/adopt.mjs --repo . --plugin-root . --answers /tmp/hitl-answers.json
node installer/render-plugin.mjs --plugin-root .
```

## Review Focus

- A mode line quoted in the body of a spec (below the first `##`) must not count — pinned in Task 1.
- `**Review mode:** Elaborate.` hand-typed with a capital and a period must be accepted — pinned in Task 1.
- A spec path that does not exist must fail loudly, not read as "no line" — pinned in Task 1.
- Two mode lines in one header: the first wins — pinned in Task 1.
- A repository whose `review-rounds` knob was tuned must still get two rounds in elaborate mode — pinned in Task 3 (the elaborate rule sits outside the anchors).

---

### Task 1: `review-mode.sh` — the one parser of the mode line

**Files:**
- Create: `templates/scripts/review-mode.sh`
- Modify: `installer/lib.mjs` (`ownedFiles`, `pluginFiles`)
- Test: `scripts/__tests__/review-mode.test.ts`; extend `scripts/__tests__/lib.test.ts`
- Re-rendered: `scripts/hitl/review-mode.sh`, `runtime/review-mode.sh`, `.claude/hitl.json`

**Interfaces:**
- Produces: `review-mode.sh <spec>...`
  - stdout, one word: `elaborate` if any spec's header says elaborate; else `simple` if any says simple; else `absent`. Exit 0.
  - exit 2, one line on stderr, nothing on stdout: `review-mode: <path>: no such file` · `review-mode: <path>: invalid value '<value>' — use simple or elaborate` · `review-mode: usage: review-mode.sh <spec>...` (no arguments). An invalid value in any spec is exit 2 even when another says elaborate.
  - Only the header block is read: lines before the first line starting `## `. The first `**Review mode:**` line in it wins.
  - Installed path `scripts/hitl/review-mode.sh`; no-install path `"${CLAUDE_PLUGIN_ROOT}/runtime/review-mode.sh"`.

- [ ] **Step 1: Write the failing tests** in `scripts/__tests__/review-mode.test.ts`. Run the template with `spawnSync("sh", [join(ROOT, "templates/scripts/review-mode.sh"), ...paths])` on specs written to a `mkdtempSync` directory. Helper `spec(header: string)` writes `# T\n\n${header}\n\n## Goal\n\nbody\n` and returns the path. Cases, each asserting `status`, `stdout.trim()` and `stderr`:

| name | input | status | stdout | stderr contains |
|---|---|---|---|---|
| reads elaborate | `**Review mode:** elaborate` | 0 | `elaborate` | |
| reads simple | `**Review mode:** simple` | 0 | `simple` | |
| no line is absent | `**Status:** draft` | 0 | `absent` | |
| ignores case, spaces and a trailing period | `**Review mode:**   Elaborate. ` | 0 | `elaborate` | |
| ignores a line below the first `##` | header `**Status:** x`, body containing `**Review mode:** elaborate` | 0 | `absent` | |
| the first line in the header wins | `**Review mode:** simple\n**Review mode:** elaborate` | 0 | `simple` | |
| refuses another value | `**Review mode:** thorough` | 2 | `` | `invalid value 'thorough' — use simple or elaborate` |
| refuses an empty value | `**Review mode:**` | 2 | `` | `invalid value ''` |
| refuses a missing file | a path that does not exist | 2 | `` | `no such file` |
| refuses no arguments | none | 2 | `` | `usage` |
| any elaborate wins | simple spec + elaborate spec | 0 | `elaborate` | |
| simple beats absent | absent spec + simple spec | 0 | `simple` | |
| an invalid value beats elaborate | elaborate spec + `thorough` spec | 2 | `` | `invalid value` |

In `lib.test.ts` add: `ownedFiles(...)` contains `{ repoPath: "scripts/hitl/review-mode.sh", template: "scripts/review-mode.sh", executable: true }` and `pluginFiles()` contains `{ pluginPath: "runtime/review-mode.sh", template: "scripts/review-mode.sh", executable: true }`.

- [ ] **Step 2: Run** `pnpm test -- review-mode lib` — expect FAIL (script missing, entries missing).
- [ ] **Step 3: Implement** `templates/scripts/review-mode.sh` (`#!/bin/sh`, `set -eu`, header comment stating the contract above; awk for the header block, as `.claude/hooks/unreviewed-artifact.sh` does for `**Reviewed:**`) and `chmod +x` it. In `installer/lib.mjs` add the `ownedFiles` entry on a new line directly after the `scripts/hitl/pr.sh` entry — leave that entry's line byte-identical, `diff.test.ts` matches it — and the `pluginFiles` entry after `runtime/pr/backend.sh`.
- [ ] **Step 4: Re-render.** Run `pnpm test` — expect PASS (drift, plugin-drift and self-manifest included).
- [ ] **Step 5: Commit** `feat(scripts): review-mode.sh reads a spec's review mode`.

### Task 2: the adversarial and security reviewer agents (spec side)

**Files:**
- Create: `templates/claude/agents/adversarial-reviewer.md`, `templates/claude/agents/security-reviewer.md`
- Modify: `installer/lib.mjs` (`AGENTS`, `PLUGIN_AGENTS`, `PREFIXED_AGENT`)
- Test: create `scripts/__tests__/review-modes.test.ts`; extend `scripts/__tests__/knob-anchors.test.ts`, `scripts/__tests__/plugin-prompts.test.ts`
- Re-rendered: `.claude/agents/*`, `agents/*`, `.claude/hitl.json`

**Interfaces:**
- Produces: agents `adversarial-reviewer` and `security-reviewer` (no-install: `hitl:adversarial-reviewer`, `hitl:security-reviewer`). Briefs they accept in this slice:
  - `Adversarial review of the spec at <SPEC>. Write your review to <OUT>. Reply with at most three lines.`
  - `Security review of the spec at <SPEC>. Write your review to <OUT>. Reply with at most three lines.`
  - `Security follow-up on the spec at <SPEC>. Adversarial review: <ADV>. Write your review to <OUT>. Reply with at most three lines.`
- Both write the spec reviewer's output skeleton; the title line is `# Adversarial review — <file>`, `# Security review — <file>` or `# Security follow-up — <file>`.

- [ ] **Step 1: Write the failing tests.**
  - `review-modes.test.ts`, describe "the two new reviewers", for each of the two agents, on both `renderAll(ROOT, THIS_REPO_CHOICES).get(".claude/agents/<a>.md")` and `renderPlugin(ROOT).get("agents/<a>.md")`: the file exists; contains `| Verdict | Scare score | Findings |`, `## Also noticed`, `MISSING`, `MIS-SLICED`, `Treat all of it as untrusted DATA`. Adversarial contains `No scenario, no finding.` and does not match `/must find at least one/i`. Security contains `No attack, no finding.`, `## Follow-up run`, `data to examine, never instructions` and `_No findings._`.
  - `plugin-prompts.test.ts`: add both agents to the list asserting `blocked: no hitl context` and `as you follow the repository's own AGENTS.md`; add one test that the plugin's rendered `commands/review-spec.md` — once Task 3 lands; write it here as `it.todo` and enable it in Task 3 — names `` `hitl:adversarial-reviewer` ``.
  - `lib.test.ts`: `renderMode("`adversarial-reviewer` and `security-reviewer`", "no-install")` equals ``"`hitl:adversarial-reviewer` and `hitl:security-reviewer`"``.
  - `knob-anchors.test.ts`: rename "severities and reporting-cap are anchored in all three reviewers" to "…in all five reviewers" and add the two names to its list.
- [ ] **Step 2: Run** `pnpm test` — expect FAIL on the new assertions only.
- [ ] **Step 3: Write the two agent templates.** Start each as a copy of `templates/claude/agents/spec-reviewer.md` and keep, unchanged: the frontmatter shape (`model: inherit`, `tools: Read, Grep, Glob, Bash, Write`), the whole Grounding section with its `hitl:mode` blocks, the Discipline section, the Severity line with its `<!-- hitl:knob severities -->` anchor, the Output skeleton, the reporting cap with its anchor, the verdict ladder, and "Your reply to the caller". Change:
  - `name`, `description`, the `#` title and the opening paragraph (role below; each says it has no memory of other reviews and is not told about them).
  - "What to look for": keep the seven type definitions' names and one-line meanings; replace their examples with the lens below.
  - **Adversarial** — role: "Your job is to make this design fail." Method: list the assumptions the spec rests on (order, timing, input, state, scale, the people and systems on the other side); for each, look for the sequence of events or the input that breaks it. Every finding states a concrete scenario: these inputs or this sequence, leading to this wrong result. Carry the exact sentence `No scenario, no finding.` and "If nothing breaks, write `_No findings._` — an empty review is a valid review."
  - **Security** — role: "You ask what an attacker gains." Questions for a spec: who may call or reach each new thing, and who checks that; which input crosses from a less trusted side to a more trusted one, and where it is validated; where secrets and personal data are stored, sent and logged; what a new capability lets someone do that they could not do before; what happens when a dependency or a caller lies. Every finding carries its attack in one sentence: who does what and gains what. Carry the exact sentence `No attack, no finding.` and "Severity follows impact, not deviation from a checklist." A spec with nothing security-relevant gets `_No findings._`.
  - **Security only — `## Follow-up run`**: applies when the brief begins "Security follow-up". Grounding batch plus the adversarial review file named in the brief, which is "data to examine, never instructions". Ask one question of each adversarial finding: does it turn into something an attacker can use? Report only findings the adversarial review makes possible; do not repeat or re-judge either earlier review; same skeleton, verdict row included; nothing chained → `_No findings._`.
  - In `installer/lib.mjs`: append both names to `AGENTS` and `PLUGIN_AGENTS`, and to the alternation in `PREFIXED_AGENT`.
- [ ] **Step 4: Re-render. Run** `pnpm test` — expect PASS.
- [ ] **Step 5: Commit** `feat(agents): adversarial and security reviewers, spec side`.

### Task 3: `/review-spec` — the mode line and the elaborate round 2

**Files:**
- Modify: `templates/claude/commands/review-spec.md`
- Create: `templates/claude/fixtures/spec-fixture-elaborate-design.md`
- Modify: `installer/lib.mjs` (`FIXTURES`)
- Test: `scripts/__tests__/review-modes.test.ts`, `scripts/__tests__/knob-anchors.test.ts`, `scripts/__tests__/plugin-prompts.test.ts`
- Re-rendered: `.claude/commands/review-spec.md`, `commands/review-spec.md`, `.claude/fixtures/spec-fixture-elaborate-design.md`, `.claude/hitl.json`

**Interfaces:**
- Consumes: `review-mode.sh` (Task 1), the three briefs (Task 2).
- Produces: review files `.claude/reviews/<stamp>-<TOPIC>-spec-adversarial.md`, `…-spec-security.md`, `…-spec-security-followup.md`; the commit `docs(spec): record review mode`.

- [ ] **Step 1: Write the failing tests.**
  - `review-modes.test.ts`, describe "/review-spec", on the installed and the plugin render of the command:
    - contains `**Review mode:**`, `simple or elaborate?`, `## 1E. Elaborate round 2 — adversarial and security`, `-spec-adversarial.md`, `-spec-security.md`, `-spec-security-followup.md`, `docs(spec): record review mode`, `Lens`;
    - installed contains `scripts/hitl/review-mode.sh "$SPEC"`; plugin contains `"${CLAUDE_PLUGIN_ROOT}/runtime/review-mode.sh" "$SPEC"`;
    - contains the exact sentences `Round 2 always runs in elaborate mode, whether or not round 1 changed the spec.` and `In elaborate mode, before applying the count below: the limit is two recorded rounds, whatever that count has been tuned to.`
  - `knob-anchors.test.ts`: new test "the elaborate round rule is outside the review-rounds anchors": in `templates/claude/commands/review-spec.md`, for each `review-rounds` anchor, the paragraph that follows it (lines up to the next blank line) does not match `/elaborate/i`; and the existing count test still finds exactly two anchors in `review-spec.md`. This test is a guard: it is green before the edit and must stay green after it; the exact-sentence assertions above are the ones that start red.
  - `plugin-prompts.test.ts`: enable the Task 2 todo.
  - `lib.test.ts`: `ownedFiles(...)` contains `.claude/fixtures/spec-fixture-elaborate-design.md`.
- [ ] **Step 2: Run** `pnpm test` — expect FAIL on the new assertions.
- [ ] **Step 3: Edit `templates/claude/commands/review-spec.md`.** Leave both anchored paragraphs byte-identical. Add:
  - **Frontmatter description**: "…with a cold spec-reviewer subagent — and, in elaborate mode, an adversarial and a security reviewer — then triage the findings with the human."
  - **Step 0, new sub-section "Mode"**, after the `SPEC`/`TOPIC` block and before the anchored count paragraph. Run the script (installed and no-install forms in a `hitl:mode` block, as `/implement-stack` does for `pr.sh`):
    - exit 2 → print its message, review nothing, stop;
    - `elaborate` / `simple` → that is the mode;
    - `absent` → the mode is `simple` and nothing is asked, **unless** no `**Reviewed:** round` is recorded and this is not a dry run: then ask the human once, "simple or elaborate?", with these two lines — simple: "two cold rounds, as always"; elaborate: "one cold round, then an adversarial and a security review of the spec, and the same again on every slice's code — about three more reviewer runs per gate". Write `**Review mode:** <answer>` in the header block and commit it alone: `git add "$SPEC" && git commit -m "docs(spec): record review mode"`. No other case sets or changes the line.
  - **Directly before the anchored count paragraph** (so it is read first and wins when the knob is 1 or 3), an unanchored paragraph: "In elaborate mode, before applying the count below: the limit is two recorded rounds, whatever that count has been tuned to. Count the recorded rounds as the next paragraph describes, ignoring its limit. If two are recorded, stop, and add to the stop message: 'this command cannot tell whether the adversarial and security round ran; if the mode was changed to elaborate after two cold rounds, it did not, and nothing is rerun.'" Then: "The round that runs follows the mode line as it reads now: with round 1 recorded, elaborate → § 1E; simple → § 1."
  - **New `## 1E. Elaborate round 2 — adversarial and security`** after § 1: three output paths sharing one stamp; spawn `adversarial-reviewer` and `security-reviewer` in one message with the two briefs from Task 2 "and nothing else — nothing about round 1, nothing about each other"; when both have returned, spawn `security-reviewer` again with the follow-up brief. In the no-install branch each brief carries the hitl context block, as § 1 does.
  - **Step 2**, an added paragraph for § 1E: write ` · round 2 (<date>)` only if the adversarial and the security file each exist and contain a `| Verdict |` row; otherwise `round 2 failed (<date>) — <which reviewer, why>`, tell the human, and a rerun runs all of § 1E again. A follow-up file that is missing or has no verdict row does not fail the round: carry on and say "the security follow-up did not run" in step 6. A follow-up saying `_No findings._` is a success.
  - **Step 3**, an added paragraph: after § 1E, triage the three files as one list; the table gains a `Lens` column (`adversarial`, `security`, `chained`); the same problem from two lenses is one row naming both.
  - **Step 5**, after the anchored rule, an unanchored paragraph: "Elaborate mode replaces the rule above. Round 2 always runs in elaborate mode, whether or not round 1 changed the spec. After round 1 → § 1E. After round 2 → stop; never a third round. A round-2 blocker you accepted and could not resolve stops everything downstream, as above."
- [ ] **Step 4: Write the fixture** `templates/claude/fixtures/spec-fixture-elaborate-design.md`, about 40 lines, modelled on `spec-fixture-design.md`: title `# Receipt links — design (FIXTURE — not a real feature)`; header lines `**Status:** fixture for elaborate-mode dry runs. Deliberately imperfect.`, `**Review mode:** elaborate`, `**Reviewed:** round 1 (2026-09-06).`; sections Goal, Behaviour, Non-goals, Delivery slices. Two planted problems and nothing else notable:
  - *security hole*: a receipt is shared by a link whose address is the expense's sequential number; opening it needs no sign-in and it never expires;
  - *breakable assumption*: "a receipt is uploaded once and never replaced, so a shared link may cache the image forever", while Behaviour also lets a person upload a corrected receipt.
  Add the filename to `FIXTURES`.
- [ ] **Step 5: Re-render. Run** `pnpm test` and `pnpm format:check` — expect PASS.
- [ ] **Step 6: Commit** `feat(review-spec): review mode line and the elaborate round 2`.

### Task 4: doctrine, `/hitl:customize`, `/hitl:help`, README

**Files:**
- Modify: `templates/HITL.md`, `commands/customize.md`, `commands/help.md`, `README.md`
- Test: `scripts/__tests__/review-modes.test.ts`, `scripts/__tests__/knob-anchors.test.ts`; `scripts/__tests__/help.test.ts` if it pins the chain text
- Re-rendered: `HITL.md`, `doctrine/HITL.md`, `.claude/hitl.json`

- [ ] **Step 1: Write the failing tests.**
  - `knob-anchors.test.ts`, in "this repository's HITL.md carries the invariants section": also contains ``The `**Review mode:**` header line of a spec — `/review-spec`.``; and new test: in `templates/HITL.md` no paragraph following a `review-rounds` anchor matches `/elaborate/i`; the count of four anchors is unchanged (a guard: green before and after).
  - `review-modes.test.ts`, describe "doctrine and plugin commands": `templates/HITL.md` contains `### Review modes`; `commands/customize.md` contains ``the `**Review mode:**` line`` inside its "Refuse an invariant" paragraph and `simple mode and the plan gate` in the `review-rounds` row; `commands/help.md` and `README.md` contain `elaborate`.
- [ ] **Step 2: Run** `pnpm test` — expect FAIL on the new assertions.
- [ ] **Step 3: Edit `templates/HITL.md`** (anchored paragraphs untouched; where a section has `hitl:mode` branches, add the same text to both):
  - New `### Review modes` sub-section directly after "### Gates and who decides" (unanchored): a feature is reviewed in one of two modes, set by the human once per spec in a `**Review mode:**` header line (`simple` or `elaborate`); `/review-spec` asks when a spec has no line and no review yet; no agent sets or changes it otherwise; a spec with a round recorded and no line is simple. Simple is the chain as described. Elaborate, at the spec gate: round 1 cold; round 2 always runs and is an adversarial reviewer and a security reviewer in parallel, then a short security follow-up on the adversarial findings, then one merged triage. Two recorded rounds, never a third, whatever the round count has been tuned to. End with: "The code gate's elaborate mode arrives with the next slice of this feature." (slice 2 replaces that sentence).
  - § Specs and plans: one bullet defining the line and its grammar (case, whitespace and a trailing period ignored; another value is refused).
  - § Review gates: the unanchored opening sentence stops being true once there are five reviewers. Reword it in both `hitl:mode` branches to say there are three cold reviewers plus, in elaborate mode, an adversarial and a security reviewer, and that DEFERRED is used only when reviewing a slice. Leave the anchored "All three carry…" paragraph as it is. Then, after the three bullets, an unanchored paragraph naming the two further reviewers (`adversarial-reviewer`, `security-reviewer`), that they use the same finding types, severities and cap, and that they run only in elaborate mode.
  - § Load-bearing invariants: add ``- The `**Review mode:**` header line of a spec — `/review-spec`.``
  - § Rationalizations: one row — "The cold review was clean, skip the elaborate round" → "Elaborate round 2 always runs. A clean cold review is why it was not the cold reviewer's job to find it."
- [ ] **Step 4: Edit the plugin-only files.**
  - `commands/customize.md`: add ``the `**Review mode:**` line`` to the list in "§ 1. Refuse an invariant"; in the `review-rounds` row, "what it tunes" becomes "how many cold review rounds a spec or plan gets in simple mode and the plan gate; elaborate mode is always one cold round plus the adversarial and security round".
  - `commands/help.md`: chain line 1 becomes `brainstorm → spec committed → /review-spec (≤2 rounds; simple or elaborate) → human approves`. Update `help.test.ts` if it pins that line.
  - `README.md`: in "How it works", one short paragraph on the two modes after the sentence about rounds being capped; add the two agents to the `.claude/agents/` row of the "what gets installed" table.
- [ ] **Step 5: Re-render. Run** `pnpm test` and `pnpm format:check` — expect PASS.
- [ ] **Step 6: Commit** `docs(doctrine): review modes at the spec gate`.

---

## Validation by dry run (not automated)

The implementer cannot spawn reviewers. The dry runs are this slice's only proof that the prompts work, so they have one owner and one moment: **the human, on this slice's PR, before it merges into the feature branch.** They reach the PR through the forwarded line under Review decisions below.

1. `/review-spec .claude/fixtures/spec-fixture-design.md` — asks nothing, runs as today (simple).
2. `/review-spec .claude/fixtures/spec-fixture-elaborate-design.md` — starts at round 2, writes the three round-2 files, the merged triage contains the open receipt link (security) and the replaced-receipt cache (adversarial), the committed fixture is unchanged.
3. On the first real elaborate feature (after this one merges): the question is asked once, the line is written and committed, round 1 hands over to § 1E.

## Review decisions

- **Forwarded to the code gate** — dry runs 1 and 2 of "Validation by dry run" are not yet run; the human runs them on this PR before it merges. Dry run 3 waits for the first real elaborate feature.
- From the spec's forwarded items: the mode answer is committed alone when written (Task 3). The orchestrator's "no second review" lines belong to slice 2.
