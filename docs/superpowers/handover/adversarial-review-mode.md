# Handover — adversarial-review-mode

Launch: `cd .claude/worktrees/adversarial-review-mode && claude --model opus` then `/implement-stack docs/superpowers/handover/adversarial-review-mode.md`
Mode: start
Feature branch: feat/adversarial-review-mode
Spec(s): docs/superpowers/specs/2026-11-19-adversarial-review-mode-design.md

## Stack

| slice | plan | branch | parent | status | owns |
|---|---|---|---|---|---|
| 1 | docs/superpowers/plans/2026-11-19-adversarial-review-mode-slice-1-spec-gate.md | feat/adversarial-review-mode-slice-1-spec-gate | feat/adversarial-review-mode | todo | a spec is reviewed in one of three modes — `simple`, `elaborate` (round 2 is the adversarial reviewer alone) or `complete` (round 2 is adversarial, security and the follow-up) — and `/review-spec` says which, in words. |
| 2 | docs/superpowers/plans/2026-11-19-adversarial-review-mode-slice-2-code-gate.md | feat/adversarial-review-mode-slice-2-code-gate | feat/adversarial-review-mode-slice-1-spec-gate | todo | a slice of a feature marked `elaborate` gets a second review by the adversarial reviewer alone, one marked `complete` gets adversarial, security and the follow-up, and every slice PR says in words which mode reviewed it. |
| 3 | docs/superpowers/plans/2026-11-19-adversarial-review-mode-slice-3-upgrade-notes.md | feat/adversarial-review-mode-slice-3-upgrade-notes | feat/adversarial-review-mode-slice-2-code-gate | todo | someone who upgrades an installed repository reads, in the upgrade report and the upgrade PR, the release notes for every version they skipped — starting with the note that `elaborate` no longer includes the security review. |

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
