# Handover — review-modes

Launch: `cd .claude/worktrees/review-modes && claude --model opus` then `/implement-stack docs/superpowers/handover/review-modes.md`
Mode: start
Feature branch: feat/review-modes
Spec(s): docs/superpowers/specs/2026-11-15-review-modes-design.md

## Stack

| slice | plan | branch | parent | status | owns |
|---|---|---|---|---|---|
| 1 | docs/superpowers/plans/2026-11-15-review-modes-slice-1-spec-gate.md | feat/review-modes-slice-1-spec-gate | feat/review-modes | open #31 | a spec can be reviewed in simple or elaborate mode — the `**Review mode:**` line, the question that sets it, and the adversarial and security round at the spec gate. |
| 2 | docs/superpowers/plans/2026-11-15-review-modes-slice-2-code-gate.md | feat/review-modes-slice-2-code-gate | feat/review-modes-slice-1-spec-gate | open #32 | a slice of a feature marked elaborate gets a second review — adversarial and security, on the diff including the first fixes — and a second fix pass before its PR opens. |

## Umbrella PR body

Plan: docs/superpowers/specs/2026-11-15-review-modes-design.md

## TL;DR

**What** — A feature can now be reviewed in one of two modes, chosen by the human once per
feature and written in its spec: simple, which is exactly today's behaviour, or elaborate.
In elaborate mode the spec and each slice of code get, after the usual cold review, one
adversarial review that tries to make the work fail and one security review that asks what
an attacker would gain.

**Why** — Systems built by agents keep shipping exploitable holes, and nothing in the
workflow looked for them on purpose. The existing reviewers also work from a fixed list of
things to look for, so they miss the problems nobody thought to list.

**How** — The mode is a single line in the spec's header, asked for once when the spec is
first reviewed, so the unattended implementation session reads it without asking anyone.
Elaborate mode keeps two sittings, as today: the cold review first, then the two new
reviews on the corrected version, and that second round always runs so a feature marked
risky can never skip its security review. The two new reviewers work in parallel without
seeing each other; a short one-way follow-up then lets the security reviewer check whether
any broken assumption the adversarial reviewer found is something an attacker can use. Both
report in the existing finding types and severities, so triage, the record of review
decisions and the end-of-turn check work unchanged. The plan gate is left alone in both
modes, there is no repository-wide default, and both the installed and the no-install form
of the workflow get the feature.

## Slices

<!-- stack -->
| slice | title | PR |
|---|---|---|
| 1 | Elaborate spec review | — |
| 2 | Elaborate slice review | — |
<!-- /stack -->

## Notes

Spec, plans and this document are transient and are removed from `main` after merge. This
description is the durable record.
