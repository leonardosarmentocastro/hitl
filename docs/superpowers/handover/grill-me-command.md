# Handover — grill-me-command

Launch: `cd .claude/worktrees/grill-me-command && claude --model opus` then `/implement-stack docs/superpowers/handover/grill-me-command.md`
Mode: start
Feature branch: feat/grill-me-command
Spec(s): docs/superpowers/specs/2026-11-19-grill-me-command-design.md

## Stack

| slice | plan | branch | parent | status | owns |
|---|---|---|---|---|---|
| 1 | docs/superpowers/plans/2026-11-19-grill-me-command-slice-1-command.md | feat/grill-me-command-slice-1-command | feat/grill-me-command | todo | the `/hitl:grill-me` entry command — a hitl design session that opens with a grill and hands its confirmed summary to the brainstorming skill — with its tests and its README and help text. |

## Umbrella PR body

Plan: docs/superpowers/specs/2026-11-19-grill-me-command-design.md

## TL;DR

**What** — A second way to start a hitl design session: `/hitl:grill-me <what to design>`. It sets the session up exactly as `/hitl:brainstorming` does, but opens the conversation with a grill — a round of hard questions about the idea — and only then hands what was agreed to the brainstorming skill, which writes the spec.

**Why** — hitl already recommends Matt Pocock's `/grill-me` for a feature whose shape is still unclear, but a person who wanted that start had to run the grill by hand and then enter the hitl chain by hand. This makes it one command, from "an idea I cannot see the shape of" to a spec under review.

**How** — The new command is a hand-written copy of the existing entry command with a small, listed set of differences, and a test fails if the shared parts of the two ever drift apart; rendering both from one template was judged more machinery than the feature. The grill's instructions are not copied in: the command requires Matt Pocock's grill skill, checks for it before creating anything, and stops with the install line when it is missing. The grill ends only when the person confirms a shared understanding or asks to stop; the command then writes that understanding out and waits for it to be confirmed. The confirmed summary goes to the brainstorming skill as settled decisions plus open questions, so the brainstorm asks only about what is still open and the spec has the same shape as any other. If the grill concludes there is nothing to build, the session ends without a spec.

## Slices

<!-- stack -->
| slice | title | PR |
|---|---|---|
| 1 | `/hitl:grill-me` command | — |
<!-- /stack -->

## Notes

Spec, plans and this document are transient and leave through the generated wipe PR before
this feature merges into `main`. This description is the durable record.
