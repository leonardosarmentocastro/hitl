# Handover — adversarial-review-mode

Launch: `cd .claude/worktrees/adversarial-review-mode && claude --model opus` then `/implement-stack docs/superpowers/handover/adversarial-review-mode.md`
Mode: start
Feature branch: feat/adversarial-review-mode
Spec(s): docs/superpowers/specs/2026-11-19-adversarial-review-mode-design.md

## Stack

| slice | plan | branch | parent | status | owns |
|---|---|---|---|---|---|
| 1 | docs/superpowers/plans/2026-11-19-adversarial-review-mode-slice-1-spec-gate.md | feat/adversarial-review-mode-slice-1-spec-gate | feat/adversarial-review-mode | open #59 | a spec is reviewed in one of three modes — `simple`, `elaborate` (round 2 is the adversarial reviewer alone) or `complete` (round 2 is adversarial, security and the follow-up) — and `/review-spec` says which, in words. |
| 2 | docs/superpowers/plans/2026-11-19-adversarial-review-mode-slice-2-code-gate.md | feat/adversarial-review-mode-slice-2-code-gate | feat/adversarial-review-mode-slice-1-spec-gate | open #60 | a slice of a feature marked `elaborate` gets a second review by the adversarial reviewer alone, one marked `complete` gets adversarial, security and the follow-up, and every slice PR says in words which mode reviewed it. |
| 3 | docs/superpowers/plans/2026-11-19-adversarial-review-mode-slice-3-upgrade-notes.md | feat/adversarial-review-mode-slice-3-upgrade-notes | feat/adversarial-review-mode-slice-2-code-gate | open #61 | someone who upgrades an installed repository reads, in the upgrade report and the upgrade PR, the release notes for every version they skipped — starting with the note that `elaborate` no longer includes the security review. |

## Dry runs (this stack only)

Added by hand by the design session, from the spec's § Fixtures. No command or agent carries
this; `/implement-stack` acts on this section alone.

For slices 1 and 2, after the slice's last fixer and before its PR opens, this session runs
the dry runs below itself. They are fixture runs, not slice reviews, so they do not count as
reviewing more often than the mode prescribes. A dry-run triage that reaches a design
question is answered by this session — the fixture is throwaway. Afterwards the scratch copy
and any scratch branch are deleted and the session is back on the slice branch with a clean
tree.

Add a `## Dry runs` section to the slice's PR body: one checklist line per observation in
"must show", each ticked or marked failed, plus one line "back on the slice branch, clean
tree". Any failed line is a STOP for the slice: report it and ask the human.

| Slice | Run | Must show |
|---|---|---|
| 1 | `/review-spec .claude/fixtures/spec-fixture-elaborate-design.md` | the elaborate mode line; exactly one round-2 review file, the adversarial one, with a verdict row; no security and no follow-up file; a triage table without `Lens`; ` · round 2` recorded in the scratch copy |
| 1 | `/review-spec .claude/fixtures/spec-fixture-complete-design.md` | the complete mode line; three round-2 files; a triage table with `Lens`; ` · round 2` recorded in the scratch copy |
| 2 | `/review-slice` then `/review-slice --step second`, answering `elaborate` | the elaborate mode line on both steps; after `--step second`, one review file with a verdict row, `SEC: none`, `FOL: none`, no `Lens` |
| 2 | `/review-slice` then `/review-slice --step second`, answering `complete` | the complete mode line on both steps; after `--step second`, three real paths, `Lens` |
| 2 | `/review-slice --step second`, answering `simple` to the cold step | the refusal "this feature is in simple mode — there is no second step" |

The mode lines, verbatim:

- `Review mode: elaborate — cold review, then an adversarial review. No security review.`
- `Review mode: complete — cold review, then an adversarial and a security review.`

The slice-2 runs use `.claude/fixtures/slice/slice-fixture.patch` and
`.claude/fixtures/slice/2026-09-06-slice-fixture-slice-1-tag-export.md`: apply the patch on a
scratch branch cut from the slice branch, run `/review-slice --parent <slice branch>` with no
handover path (it then asks for the plan and the mode), and delete the scratch branch after.

If a dry run shows the behaviour from before this slice's edits, the command was read from
an older copy: that is a failed line, not a pass.

Slice 3 has no dry run.

## Umbrella PR body

Plan: docs/superpowers/specs/2026-11-19-adversarial-review-mode-design.md

## TL;DR

**What** — A feature can now be reviewed in one of three modes instead of two: `simple`, `elaborate` and `complete`. `elaborate` becomes a lighter middle step — the usual cold review followed by one adversarial review, with no security review — and `complete` is the new name for what `elaborate` did before. The upgrade step also gains release notes, so people learn that `elaborate` changed meaning.

**Why** — Until now the adversarial review only came bundled with the security review, at about three extra reviewer runs on the spec and on every slice, with nothing in between. A trial on a real spec showed that an adversarial second round finds problems a second cold round does not, so it deserves to be available on its own at a lower cost. Because an existing name changes meaning, a spec already marked `elaborate` must not lose its security review without its owner being told.

**How** — The modes form a ladder, each one step heavier than the last, and when several specs disagree the heaviest mode wins. Each review command keeps a single second-step section that always runs the adversarial reviewer and adds the security reviewer and its follow-up only in `complete`; this was chosen over one section per mode so the adversarial brief is not copied and left to drift. The plan gate is untouched and has no mode. The change of meaning is announced in three places, all required: a release note shown in the upgrade report and upgrade PR for installed repositories, a one-line statement of the mode printed by the review commands, and the same line at the top of the review decisions of every slice PR. The orchestrator decides which reviews it requires from the mode it read itself, so a `complete` slice that reports no security review stops instead of opening a PR, and a mode that changes mid-slice is also a stop.

## Slices

<!-- stack -->
| slice | title | PR |
|---|---|---|
| 1 | the spec gate | — |
| 2 | the code gate | — |
| 3 | the upgrade says what changed | — |
<!-- /stack -->

## Notes

Spec, plans and this document are transient and leave through the generated wipe PR before
this feature merges into `main`. This description is the durable record.
