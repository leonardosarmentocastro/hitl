# Handover — session-worktrees

Launch: `cd .claude/worktrees/session-worktrees && claude --model opus` then `/implement-stack docs/superpowers/handover/session-worktrees.md`
Mode: start
Feature branch: feat/session-worktrees
Spec(s): docs/superpowers/specs/2026-10-05-session-worktrees-design.md

## Stack

| slice | plan | branch | parent | status | owns |
|---|---|---|---|---|---|
| 1 | docs/superpowers/plans/2026-10-05-session-worktrees-slice-1-hook-reads-session-cwd.md | feat/session-worktrees-slice-1-hook-reads-session-cwd | feat/session-worktrees | open #11 | the Stop hook gates the git root of the folder the session is currently in (the payload's `cwd`), falling back to `CLAUDE_PROJECT_DIR` and then `$PWD`. |
| 2 | docs/superpowers/plans/2026-10-05-session-worktrees-slice-2-design-session-worktree.md | feat/session-worktrees-slice-2-design-session-worktree | feat/session-worktrees-slice-1-hook-reads-session-cwd | open #12 | design sessions start in their own locked worktree on the feature branch — the HITL.md rule, the `.claude/worktrees/` ignore entry, recursive scans that skip sibling worktrees, and the launch line that `cd`s into the worktree. |
| 3 | docs/superpowers/plans/2026-10-05-session-worktrees-slice-3-hitl-cleanup.md | feat/session-worktrees-slice-3-hitl-cleanup | feat/session-worktrees-slice-2-design-session-worktree | todo | `/hitl:cleanup` — finding the hitl design-session worktrees, classifying each (merged · abandoned · has unsaved work · in progress), and removing the ones the human picks — plus `head_sha` in the PR shim's record and `/implement-stack`'s end-of-stack cleanup hint. |

## Umbrella PR body

Plan: docs/superpowers/specs/2026-10-05-session-worktrees-design.md

**What** — Every design session now works in its own private copy of the repository (a locked git worktree on its own feature branch), created from an up-to-date `main` before it looks at any code. The implementation session is started in that same copy, and a new `/hitl:cleanup` command offers to delete those copies once it can prove nothing in them would be lost.

**Why** — Two sessions started in the same folder interfered with each other: the end-of-turn check refused one session because of the other's unreviewed documents, and a branch switched by one session (or the human) silently changed the code the other was reading. Nothing told a design session where it should live, so it lived in the shared folder.

**How** — The end-of-turn check now looks at the folder the session is actually in, as reported by Claude Code, and falls back to the old behaviour whenever that information is missing, so the check is never switched off by accident. The workflow rules gain one instruction: the first thing a design session does is create, lock and enter its own worktree under `.claude/worktrees/`; that folder is ignored by git and skipped by every tree-wide search, and the launch line printed at the end of design now moves into it. Worktrees are created and locked by hand rather than through the harness's named worktrees, because the harness deletes a named worktree that has no committed changes yet — exactly the state of a fresh design. Cleanup only considers worktrees carrying the design-session lock, asks the PR host whether the umbrella merged (a squash merge is invisible to plain git), never removes anything with unsaved work, and never deletes a remote branch; to keep a squash-merged branch provably saved after the host deletes it, the PR helper now also reports each PR's head commit.

## Slices

<!-- stack -->
| slice | title | PR |
|---|---|---|
| 1 | the Stop hook reads the session's folder | — |
| 2 | design sessions start in a worktree | — |
| 3 | `/hitl:cleanup` | — |
<!-- /stack -->

## Notes

Spec, plans and this document are transient and are removed from `main` after merge. This
description is the durable record.
