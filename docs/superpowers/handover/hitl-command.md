# Handover — hitl-command

Launch: `cd .claude/worktrees/hitl-command && claude --model opus` then `/implement-stack docs/superpowers/handover/hitl-command.md`
Mode: start
Feature branch: feat/hitl-command
Spec(s): docs/superpowers/specs/2026-11-12-hitl-command-design.md

## Stack

| slice | plan | branch | parent | status | owns |
|---|---|---|---|---|---|
| 1 | docs/superpowers/plans/2026-11-12-hitl-command-slice-1-entry.md | feat/hitl-command-slice-1-entry | feat/hitl-command | open #23 | Starting a design session from one command (`/hitl:brainstorming`) in any repository, remembering the project where nothing is installed. |
| 2 | docs/superpowers/plans/2026-11-12-hitl-command-slice-2-design-loop.md | feat/hitl-command-slice-2-design-loop | feat/hitl-command-slice-1-entry | open #24 | A design session from spec to handover (`/hitl:review-spec`, `/hitl:review-plan`, `/hitl:handover`) with nothing installed in the repository. |
| 3 | docs/superpowers/plans/2026-11-12-hitl-command-slice-3-stop-hook.md | feat/hitl-command-slice-3-stop-hook | feat/hitl-command-slice-2-design-loop | open #25 | The review guard on the feature's own specs and plans in no-install sessions, silent everywhere else. |
| 4 | docs/superpowers/plans/2026-11-12-hitl-command-slice-4-implementation.md | feat/hitl-command-slice-4-implementation | feat/hitl-command-slice-3-stop-hook | open #26 | Stacked draft PRs from a handover (`/hitl:implement-stack`, `/hitl:review-slice`, `/hitl:umbrella-pr`) with nothing installed, and the TL;DR at the top of PR bodies in both modes. |
| 5 | docs/superpowers/plans/2026-11-12-hitl-command-slice-5-wipe-cleanup.md | feat/hitl-command-slice-5-wipe-cleanup | feat/hitl-command-slice-4-implementation | open #27 | The feature's documents leave the branch through a generated wipe PR and are kept on the machine with no CI job, and a finished no-install feature is cleaned up by `/hitl:cleanup`. |

## Umbrella PR body

Plan: docs/superpowers/specs/2026-11-12-hitl-command-design.md

**What** — A no-install mode for hitl: the whole workflow (design session in its own worktree, reviewed spec and plans, handover, stacked draft PRs, umbrella PR) runs from the plugin a user already has, started by typing `/hitl:brainstorming`. Nothing hitl-owned is committed to the repository except the feature's own temporary documents, and what the user teaches it about a project is remembered on their machine.

**Why** — Until now hitl only worked after its tooling was written into a repository, and some repositories cannot take that: no permission to commit tooling, a team that has not agreed, a client project. Running the workflow by hand there worked, but it meant a hand-written handover, agents pointed at files in a local clone, and re-explaining the project's conventions in every new session.

**How** — The no-install commands, agents and doctrine are generated from the same templates as the installed ones and checked into the plugin, with a test proving they match, so the two modes cannot drift into different workflows. What an installed repository keeps in its own files (local gates, reviewer context, PR conventions) lives instead in a per-project memory folder on the user's machine, keyed by the git remote, written only after the user agrees, and confirmed before the first design session starts. The plugin ships its own review guard, which acts only inside a worktree that `/hitl:brainstorming` registered and only on documents the feature itself added, so it never blocks anyone else's session. The feature's documents are archived to the user's machine and removed by a generated, always-rebuilt last PR that must merge before the umbrella, replacing the CI job. In a repository that did install hitl, the entry command follows that repository's own rules and the other plugin commands refuse; every PR body in both modes now opens with a TL;DR.

## Slices

<!-- stack -->
| slice | title | PR |
|---|---|---|
| 1 | doctrine, project memory and entry point | — |
| 2 | no-install design loop | — |
| 3 | limited Stop hook | — |
| 4 | no-install implementation session | — |
| 5 | archive, wipe branch and cleanup | — |
<!-- /stack -->

## Notes

Spec, plans and this document are transient and are removed from `main` after merge. This
description is the durable record.
