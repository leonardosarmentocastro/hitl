# Handover — hitl-dot-folder

Launch: `cd .claude/worktrees/hitl-dot-folder && claude --model opus` then `/implement-stack docs/superpowers/handover/hitl-dot-folder.md`
Mode: start
Feature branch: feat/hitl-dot-folder
Spec(s): docs/superpowers/specs/2026-11-16-hitl-dot-folder-design.md

## Stack

| slice | plan | branch | parent | status | owns |
|---|---|---|---|---|---|
| 1 | docs/superpowers/plans/2026-11-16-hitl-dot-folder-slice-1-fresh-install.md | feat/hitl-dot-folder-slice-1-fresh-install | feat/hitl-dot-folder | open #47 | `/hitl:init` writes the doctrine, the reviewer context and the install record under `.hitl/`, every installed file names those paths, the plugin recognises the new install record, and this repository itself is on the new layout at 0.3.0. |
| 2 | docs/superpowers/plans/2026-11-16-hitl-dot-folder-slice-2-upgrade-move.md | feat/hitl-dot-folder-slice-2-upgrade-move | feat/hitl-dot-folder-slice-1-fresh-install | todo | `/hitl:diff --apply` upgrades an old-layout install to the `.hitl/` layout with no hand edits: the moved files keep the repository's edits, `CLAUDE.md` imports the new path, the install record relocates, and a run that stopped part-way resumes. |
| 3 | docs/superpowers/plans/2026-11-16-hitl-dot-folder-slice-3-old-layout-refused.md | feat/hitl-dot-folder-slice-3-old-layout-refused | feat/hitl-dot-folder-slice-2-upgrade-move | todo | On a repository still on the old layout, the plugin's commands stop with the upgrade message, the plugin's Stop hook and session registration treat it as installed, and `/hitl:help` names the upgrade as the next step. |
| 4 | docs/superpowers/plans/2026-11-16-hitl-dot-folder-slice-4-adopt-moves.md | feat/hitl-dot-folder-slice-4-adopt-moves | feat/hitl-dot-folder-slice-3-old-layout-refused | todo | `/hitl:init --adopt` on a repository that carries hitl's files in the old places and has no install record moves the doctrine and the reviewer context into `.hitl/`, rewrites the `CLAUDE.md` import line, then writes the install record. |

## Umbrella PR body

Plan: docs/superpowers/specs/2026-11-16-hitl-dot-folder-design.md

## TL;DR

**What** — In a repository where hitl is installed, everything that belongs to hitl and is not loaded by Claude Code itself now lives in one `.hitl/` folder: the workflow doctrine, the reviewer context and the install record. The repository root no longer carries a hitl file, and `CLAUDE.md` imports the doctrine from its new place. This is a breaking change, released as hitl 0.3.0.

**Why** — hitl's files were scattered: the doctrine sat at the repository root, where a visitor expects only what they need, and the reviewer context and install record sat in `.claude/`, mixed with what Claude Code loads. One folder makes it plain what is hitl's, and mirrors the `~/.hitl/` folder hitl already keeps on the machine.

**How** — A fresh install writes the new layout directly and refuses to put a second doctrine beside one it finds in the old place. An existing install upgrades through the normal upgrade command: a short, explicit list of moves tells the upgrade which old file is the repository's copy of which new one, so the usual comparison and three-way merge keep the repository's edits, and a run that stopped part-way picks up where it left off. Moves are never guessed from content similarity, because a guess must not decide which file gets deleted. There is no period in which both layouts work: on a repository still on the old layout the plugin's commands stop and name the upgrade command, while the repository's own installed commands keep working so a feature in flight can finish first. Adopting a hand-copied repository moves its files the same way before recording the install. After upgrading, everyone on the repository needs the 0.3.0 plugin or newer, since an older plugin no longer recognises the repository as installed.

## Slices

<!-- stack -->
| slice | title | PR |
|---|---|---|
| 1 | fresh install in the new layout | — |
| 2 | the upgrade moves the files | — |
| 3 | the old layout is refused | — |
| 4 | adopt moves, then records | — |
<!-- /stack -->

## Notes

Spec, plans and this document are transient and are removed from `main` after merge. This
description is the durable record.
