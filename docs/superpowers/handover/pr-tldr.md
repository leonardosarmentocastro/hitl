# Handover — pr-tldr

Launch: `cd .claude/worktrees/pr-tldr && claude --model opus` then `/implement-stack docs/superpowers/handover/pr-tldr.md`
Mode: start
Feature branch: feat/pr-tldr
Spec(s): docs/superpowers/specs/2026-11-19-pr-tldr-design.md

## Stack

| slice | plan | branch | parent | status | owns |
|---|---|---|---|---|---|
| 1 | docs/superpowers/plans/2026-11-19-pr-tldr-slice-1-body-shape.md | feat/pr-tldr-slice-1-body-shape | feat/pr-tldr | open #65 | the shape of the slice PR body and the umbrella PR body — bullet TL;DR, Why, Needs you, the agent fold — and the doctrine rules that state it. Not the ticket line. |
| 2 | docs/superpowers/plans/2026-11-19-pr-tldr-slice-2-ticket-link.md | feat/pr-tldr-slice-2-ticket-link | feat/pr-tldr-slice-1-body-shape | open #66 | the ticket link — the `**Ticket:**` spec header line, the question that records it, the script that reads it, and the clickable title above the TL;DR in slice and umbrella PR bodies. |

## Umbrella PR body

Plan: docs/superpowers/specs/2026-11-19-pr-tldr-design.md

## TL;DR

**What** — The pull requests this workflow writes get a new, shorter description. Each one opens with one to three one-line bullets saying what changed, then a short Why; anything only an agent reads is folded away at the bottom of a slice PR and labelled as such. When the feature has a ticket, its title is a clickable link on the first line.

**Why** — A reviewer flooded with AI-written PRs has to decide in seconds whether one deserves a real review. Today the summary is three paragraphs, followed by sections no human reads, so the few lines that matter are buried. Some sections had no reader at all.

**How** — Only the wording of the prompts and the doctrine changes: the summary was long because the prompts asked for sentences, so they now ask for bullets, and nothing checks the length mechanically. The explanation of the approach is removed outright rather than folded, because nobody read it; the code and its history are the record. Declined and deferred review findings move into the fold, except the three kinds that ask something of the human, which stay visible in their own short section that appears only when it has something to say. The ticket is one line in the spec, asked for once at spec review and never fetched from a tracker; a malformed one drops the link and is reported, and never stops a run. Descriptions written before this change, this one included, are opened as they are and not reshaped.

## Slices

<!-- stack -->
| slice | title | PR |
|---|---|---|
| 1 | the body shape | — |
| 2 | the ticket link | — |
<!-- /stack -->

## Notes

Spec, plans and this document are transient and leave through the generated wipe PR before
this feature merges into `main`. This description is the durable record.
