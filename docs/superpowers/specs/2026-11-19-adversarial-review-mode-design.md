# Three review modes: simple, elaborate, complete — design

**Issue:** #36
**Review mode:** simple
**Reviewed:** round 1 (2026-11-19) · round 2 (2026-11-19).

## Intent

A feature is reviewed in one of two modes today. `simple` is cold reviews only. `elaborate`
adds an adversarial reviewer **and** a security reviewer plus a security follow-up, on the
spec and again on every slice. There is nothing in between: the adversarial lens only comes
bundled with the security one, at about three extra reviewer runs per gate.

A second cold round on a spec mostly repeats the first one's lens. An adversarial round does
not. It was tried by hand on the GitLab merge-request spec (round 1 cold, round 2 the
adversarial reviewer alone, commit `df5bfd8`): round 2 changed the spec in five places that
round 1 had passed — among them a token that would have followed a redirect to another host,
a half-removed workflow/script pair after an upgrade, and a stack in flight during an upgrade
that would have built no wipe PR — and forwarded two items to the plan gate.

So the modes become a ladder of three, each one step heavier than the last:

| Mode | Spec gate, round 2 | Code gate, second step per slice | Reviewer runs per gate |
|---|---|---|---|
| `simple` | another cold round, only if round 1 changed the spec | none | spec ≤ 2 · slice 1 |
| `elaborate` | the adversarial reviewer | the adversarial reviewer, then a second fix | 2 |
| `complete` | adversarial + security in parallel, then the security follow-up | the same three, then a second fix | 4 |

`complete` is exactly what `elaborate` does today. `elaborate` is new behaviour under an
existing name.

## Goals

- `**Review mode:**` accepts `simple`, `elaborate` or `complete`.
- `elaborate` runs the cold review, then the adversarial reviewer alone, at the spec gate and
  on every slice.
- `complete` behaves exactly as `elaborate` does before this change.
- Someone whose spec already says `elaborate` learns that its meaning changed: at upgrade
  time, where hitl is installed (a release note in the upgrade report and PR), and at review
  time, everywhere (the command says the mode in words, and every slice PR carries it).

## Non-goals

- The plan gate. It has no mode today and gets none: cold rounds, as now.
- An adversarial brief for plans.
- Any change to what the adversarial or the security reviewer looks for.
- A fourth mode, or a way to compose reviewers per feature.
- Backfilling the changelog for releases before this one.

## Anti-goals

- A spec marked `elaborate` silently losing its security review with nothing telling its
  owner. The parser cannot tell an old `elaborate` from a new one, so the telling is done by
  the release note (installed repositories), by the commands' mode line (wherever a human
  runs the command) and by the slice PR's body (the code gate, where no human watches the
  session) — all three are required, not polish.
- The adversarial brief existing in more copies than it does today.

## Constraints

- The `**Review mode:**` header line is a load-bearing invariant: its parser
  (`review-mode.sh`), the three commands that read it and the doctrine change together. Across the stack that means: every line that says which
  values the line accepts, or which mode wins, changes in the same slice as the parser
  (slice 1); text that describes what the code gate does in each mode follows in slice 2.
- Everything lands in `templates/` and is rendered: this repository's `.claude/`,
  `.hitl/HITL.md`, `scripts/hitl/` and `.hitl/manifest.json`, and the plugin's no-install
  files, are regenerated as `AGENTS.md` describes. The drift tests hold them equal.
- `review-mode.sh` is a script with behaviour: test-first in
  `scripts/__tests__/review-mode.test.ts`. So is `installer/diff.mjs`. The commands' and
  doctrine's wording is pinned by `scripts/__tests__/review-modes.test.ts` and
  `knob-anchors.test.ts`, which are updated with it; prompts are otherwise validated by a dry
  run on a fixture.
- The elaborate and complete round rule stays outside the `review-rounds` knob anchors: two
  recorded rounds, never a third, whatever that knob has been tuned to.

## Approaches

**A. One second-step section per command, the security part conditional — chosen.** Each of
`/review-spec` and `/review-slice` keeps its single second-step section. It always spawns the
adversarial reviewer; in `complete` it also spawns the security reviewer and then the
follow-up. One condition per section; the adversarial brief exists once per wording.

**B. A section per mode.** No condition to miss, but the adversarial brief is copied into
both sections, each of which already exists in an installed and a no-install wording — four
copies per command, which drift.

**C. The script names the reviewers and the commands loop over them.** Dropped: machinery
for a fourth mode nobody asked for, and the follow-up (which reads the adversarial review)
does not fit a plain loop.

A was picked because the two modes differ by little, and one condition is cheaper than four
copies.

## Design

### The mode line and its parser

`review-mode.sh` (template `templates/scripts/review-mode.sh`):

- accepts `simple`, `elaborate`, `complete` — case, surrounding whitespace and one trailing
  period ignored, as now;
- prints one word: `complete` if any spec says complete; else `elaborate` if any says
  elaborate; else `simple` if any says simple; else `absent`. The heaviest mode wins;
- any other value is exit 2 with
  `review-mode: <path>: invalid value '<value>' — use simple, elaborate or complete`, even
  when another spec carries a valid mode. Every other exit and message is unchanged.

A spec with a round recorded and no line is still `simple`.

### The mode line the commands print

Right after reading the mode, `/review-spec` and `/review-slice` print one line, exactly:

- `Review mode: simple — cold review only.`
- `Review mode: elaborate — cold review, then an adversarial review. No security review.`
- `Review mode: complete — cold review, then an adversarial and a security review.`

The line is printed once per run, as soon as the mode is known: after the one-time
question's answer has been written and committed, when one was asked; on a dry run; and
before the "two rounds have run" stop. A run that stops on the parser's exit 2 prints the
parser's message instead.

`/implement-stack` reads the second-step line to learn which mode `/review-slice` ran in
(see § Code gate).

### Spec gate — `/review-spec`

- **Asking.** With no line and no round recorded (and not a dry run), the one-time question
  is "simple, elaborate or complete?", with three lines:
  - simple: two cold rounds, as always;
  - elaborate: one cold round, then an adversarial review of the spec, and the same on every
    slice's code — one more reviewer run and one more fix per slice;
  - complete: one cold round, then an adversarial and a security review of the spec, and the
    same again on every slice's code — about three more reviewer runs per gate.
- **Round 2 (§ 1E).** Runs in `elaborate` and `complete`, always, whether or not round 1
  changed the spec.
  - `elaborate`: spawn the `adversarial-reviewer` alone, with today's brief and nothing
    else, writing `<ADV>`.
  - `complete`: as today — adversarial and security in one message, neither told about the
    other, then the security follow-up.
- **Recording.** `elaborate`: ` · round 2 (<date>)` only if `<ADV>` exists and has a
  `| Verdict |` row; otherwise `round 2 failed (<date>) — adversarial reviewer, <why>`, and a
  rerun runs § 1E again. `complete`: as today.
- **Triage.** `elaborate`: the plain table (`# · Sev · Type · Finding · Verdict`), no `Lens`
  column. `complete`: as today, with `Lens`.
- **Round rule.** In both `elaborate` and `complete`: two recorded rounds, never a third,
  whatever the round count has been tuned to. The stop message for two recorded rounds says
  the command cannot tell whether the second was the cold one or the mode's own, and reruns
  nothing.
- The round that runs follows the mode line as it reads now, as today.

### Code gate — `/review-slice` and `/implement-stack`

`/review-slice`:

- Mode: `complete`, `elaborate` or `simple`; `absent` is `simple`. With no handover document
  it asks "simple, elaborate or complete?"; with `--step second` and no handover it asks only
  "elaborate or complete?" *(my call: today that case is "taken as elaborate", which no
  longer names one behaviour)*.
- `--step second` in simple mode is refused, with today's message.
- **Second step (§ 1S).** `elaborate`: the `adversarial-reviewer` alone, today's brief.
  `complete`: as today.
- **Checks.** `elaborate`: only `<ADV>` must exist with a verdict row. `complete`: as today.
- **Path lines.** The step always ends with the three lines `ADV:`, `SEC:`, `FOL:`. In
  `elaborate` the last two read `SEC: none` and `FOL: none` *(my call: one shape for
  `/implement-stack` to read in both modes)*.
- **Triage.** `elaborate`: no `Lens` column. The repeat-decline rule and `--pr` are
  unchanged in both modes.
- After the cold step in `elaborate` or `complete` it prints
  "`<mode>` mode: after the fixes, run `/review-slice --step second`".

`/implement-stack`:

- Step c reads the mode once per slice; `complete` and `elaborate` both continue to c2 and
  d2; `simple` does not.
- c2 checks every path line that is not `none`: `ADV` always, `SEC` in `complete`. A missing
  review is the same STOP as today. The "security follow-up did not run" note applies only
  in `complete`.
- If the mode word in the second step's printed mode line differs from the mode read at
  step c, or the step prints no mode line, or the step is refused — STOP: "slice <N>: the review mode changed during the slice" *(my call: today
  only a change to simple or to an invalid value stops; a change between elaborate and
  complete mid-slice is the same kind of surprise)*.
- d2 hands the fixer every review file that is not `none`.
- **The PR says the mode.** The `## Review decisions` section of every slice PR opened by
  `/implement-stack` begins with the mode line for the mode read at step c, verbatim (for
  example "Review mode: elaborate — cold review, then an adversarial review. No security
  review."), in all three modes, also when nothing was declined. A fix-up's Review decisions
  comment begins with it too. This is the notice for the code gate, where the session runs
  unattended and the PR is what the human reads. The mode line comes first; the declines,
  or "None — every finding was applied.", follow it. `/review-slice --pr`, which reads a
  PR's Review decisions and its comments as earlier declines, skips a line beginning
  "Review mode:".
- Fix-up follows the same rules per slice section; there the mode is the one read at the
  start of that `### Slice <N>` section.

The `fixer` brief wording ("several in elaborate mode") and the two reviewers' descriptions
("Invoked in elaborate mode") are reworded to match: the adversarial reviewer runs in
elaborate and complete, the security reviewer in complete only.

### Doctrine and reference text

`templates/HITL.md` (§ Review modes, § Review gates, the rationalizations table, the
`**Review mode:**` bullet under § Specs and plans, § Load-bearing invariants; and, for the
mode line in the PR, § Pull requests and the Code gate bullet under § Gates and who decides,
which define `## Review decisions`), `README.md`,
`commands/help.md` and the `review-rounds` row of `commands/customize.md` describe three
modes. The README's diagram line becomes mode-neutral or names both. `/hitl:customize`'s
refusal list already refuses the `**Review mode:**` line and does not change.

### Fixtures

`.claude/fixtures/spec-fixture-elaborate-design.md` keeps its name and its line, so a dry
run on it now exercises the adversarial-only round. A copy,
`spec-fixture-complete-design.md`, with `**Review mode:** complete`, exercises the full
round; it is added to the installer's fixture list.

The code gate gets no new fixture *(my call)*: `/review-slice` is dry-run on the existing
`.claude/fixtures/slice/` patch and plan, applied on a scratch branch with no handover
document, answering the mode question with the mode under test, cold step then
`--step second`. `/implement-stack`'s c2/d2 and its mode-change stop are held by the pinned
strings in `review-modes.test.ts` only.

**Who runs the dry runs, and what they must show** *(decided by the human)*. The
`/implement-stack` session runs them itself, for this stack only, after the slice's last
fixer and before the PR opens. Nothing in the workflow carries a plan step to the
orchestrator, and no command or agent is changed for this: once the handover agent has
written the handover document, the design session appends a `## Dry runs (this stack only)`
section to it by hand — the table below and these rules — and commits it. `/implement-stack`
reads the whole document and acts on that section alone, adding `## Dry runs` to the PR body
it writes. If a later handover run (resume, fix-up) rewrites the document without the
section, or the orchestrator skips it, the slice PR has no `## Dry runs` section: that
absence is the sign, and the human runs the missing dry runs before merging the slice. They are fixture runs, not slice reviews, so they do not
count against "never review more often than the mode prescribes". A triage that reaches a
design question is answered by the session — the fixture is throwaway. The scratch copy and
the scratch branch are deleted afterwards, and the session is back on the slice branch with
a clean tree — that is itself a line of the checklist. The result goes into the PR body as a checklist
under `## Dry runs`, one line per observation below, each ticked or marked failed; any
failed line is a STOP for the slice.

| Slice | Run | Must show |
|---|---|---|
| 1 | `/review-spec` on the `elaborate` fixture | the elaborate mode line; exactly one round-2 review file, the adversarial one, with a verdict row; no security and no follow-up file; a triage table without `Lens`; ` · round 2` recorded in the scratch copy |
| 1 | `/review-spec` on the `complete` fixture | the complete mode line; three round-2 files; a triage table with `Lens`; ` · round 2` recorded in the scratch copy |
| 2 | `/review-slice`, `elaborate` | the elaborate mode line on both steps; after `--step second`, one review file with a verdict row, `SEC: none`, `FOL: none`, no `Lens` |
| 2 | `/review-slice`, `complete` | the complete mode line on both steps; after `--step second`, three real paths, `Lens` |
| 2 | `/review-slice --step second`, `simple` | today's refusal |

The dry-run convention exists only in the installed wording of `/review-spec`, so the
no-install wording of the new round 2 is held by the pinned strings alone, on both renders.

**Proof of the other two notices.**

- *The slice PR's mode line:* the rule's sentence is pinned in `review-modes.test.ts` on both
  renders of `/implement-stack` (slice 2), and observed once on this stack: slice 3 is
  implemented with slice 2's command, so its PR's `## Review decisions` must begin with
  "Review mode: simple — cold review only." — a line of slice 3's `## Dry runs` checklist.
- *The upgrade notice:* `diff.mjs`'s `notes` is tested in `diff.test.ts`; `/hitl:diff`'s
  "What changed:" heading and its "every section in range, verbatim" rule for the PR body
  are pinned strings in a test of `commands/diff.md` (slice 3).

### The release note

- A `CHANGELOG.md` at the plugin root. `## <version>` headings without a `v` (`## 0.4.0`),
  newest first, bullets underneath in plain words for someone who has hitl installed. Work
  not yet released sits under `## Unreleased`; the release commit renames that heading to
  the version.
- The file starts with a one-line `## 0.3.0` section ("the first release with a changelog;
  earlier changes are not listed"), so there is always a newest released heading to compare
  with. A test holds the rename: while `## Unreleased` has entries, the plugin's version
  as `diff.mjs` reads it (`pluginVersion`, from `.claude-plugin/plugin.json`) must equal the
  newest versioned heading. The same test holds `.claude-plugin/marketplace.json`'s version
  equal to it, since nothing does today. A release commit that bumps the version and forgets
  the rename fails `pnpm test`. The `AGENTS.md` release line names the three steps together:
  bump both version files, rename the heading, tag `v<version>`.
- `installer/diff.mjs` reads it from the plugin root and adds `notes` to its report: the
  sections for versions newer than the recorded one, up to the latest, newest first, each as
  `{ version, text }`. `## Unreleased` is never included. No file, or no matching section →
  an empty list; never a refusal.
- `/hitl:diff` prints the notes after its count line, under "What changed:", and uses them
  for the upgrade PR's **Why** in place of the fallback sentence when the list is not empty:
  every section in range, verbatim, each under its version — not a one- or two-sentence
  summary, which could drop the one line that matters.
- Someone running hitl without an install has no upgrade step: `/hitl:diff` refuses where
  there is no manifest, and the new `elaborate` applies as soon as the plugin updates. For
  them the mode line the commands print is the notice *(my call: no second delivery path, no
  per-machine "already told" state)*.
- The version bump and the rename of `## Unreleased` belong to the separate release commit,
  outside this stack.
- This feature's entry, under `## Unreleased`:
  "`elaborate` no longer includes the security review: it is now one cold review and one
  adversarial review. The mode that includes the security review is called `complete`. A
  spec that says `**Review mode:** elaborate` and should keep its security review must be
  changed to `complete` by hand. Everyone working on a repository should update the plugin
  together: an older plugin refuses `complete` and still runs the security review for
  `elaborate`."

## Delivery slices

1. **Spec gate in three modes.** The parser's third value and precedence; `/review-spec`
   (asking, the mode line, round 2, recording, triage, round rule); every doctrine line
   that says which values the mode line accepts and which mode wins (the § Review modes
   opener and its `/implement-stack` precedence bullet, the `**Review mode:**` bullet under
   § Specs and plans) and the doctrine's spec-gate text, with their pins; the `complete`
   fixture; the two spec-gate dry runs. To keep the code gate working in between, `/review-slice`
   and `/implement-stack` learn only to treat `complete` and `elaborate` alike, as today's
   second step — a slice in `elaborate` is briefly reviewed more heavily than it will be,
   never less. Between slices 1 and 2 the doctrine therefore describes `elaborate` as
   adversarial-only at the spec gate and adversarial plus security at the code gate: a known
   interim state on the feature branch, gone before anything reaches `main`.
2. **Code gate in three modes.** `/review-slice`'s mode line and second step,
   `/implement-stack`'s c2/d2, mode-change stop and the mode line in the PR body, the fixer
   and reviewer wording, the doctrine text describing what the code gate does per mode,
   README, help and the customize row; the three code-gate dry runs.
3. **The upgrade says what changed.** `CHANGELOG.md`, `diff.mjs`'s `notes`, `/hitl:diff`'s
   printing and PR body with their pins, the rename test, the `AGENTS.md` release line, and
   this feature's entry.

## Left to the builder

- The exact wording of the reworded doctrine, README and help paragraphs.
- Whether the README diagram line names both modes or neither.
- How `diff.mjs` compares versions (it already compares the recorded and the latest one).

## Decisions and declined alternatives

- A third value named `adversarial`, leaving `elaborate` unchanged — declined by the human
  in favour of the simple / elaborate / complete ladder, accepting that `elaborate` changes
  meaning, with a release note.
- The new mode at the spec gate only — declined: the mode means the same thing at both gates,
  as `elaborate` does today.
- The new mode at the plan gate — declined: needs an adversarial brief for plans, which no
  mode has; a separate feature.
- An option on `simple` (`simple (adversarial)`) — declined: on a slice it adds a review and
  a fix, so it is not simple there, and the parser would read two things.
