# Handover — release-process

Launch: `cd .claude/worktrees/release-process && claude --model opus` then `/implement-stack docs/superpowers/handover/release-process.md`
Mode: start
Feature branch: feat/release-process
Spec(s): docs/superpowers/specs/2026-11-19-release-process-design.md

## Stack

| slice | plan | branch | parent | status | owns |
|---|---|---|---|---|---|
| 1 | docs/superpowers/plans/2026-11-19-release-process-slice-1-prepare.md | feat/release-process-slice-1-prepare | feat/release-process | open #70 | a merged `feat/` or `fix/` pull request becomes a release commit on `main` — version raised in the three files, a new changelog section from the pull request titles. |
| 2 | docs/superpowers/plans/2026-11-19-release-process-slice-2-publish.md | feat/release-process-slice-2-publish | feat/release-process-slice-1-prepare | open #71 | a released version on `main` gets its tag `v<version>` and its GitHub Release, retryable on its own, and users are told how to receive it. |

## Umbrella PR body

Plan: docs/superpowers/specs/2026-11-19-release-process-design.md

## TL;DR

**What** — Releases of this plugin now happen by themselves. When a feature or a fix is merged into `main`, the version number is raised, the changelog gets a new section, the version is tagged and a GitHub Release is published, with no step for anyone to remember.

**Why** — Until now a merged change reached nobody until someone ran a manual release recipe, and that step was forgotten: `main` carried unreleased changes for a while and the last version was never tagged. The tag matters, because the upgrade command refuses to work for a version that has none.

**How** — The name of the branch a pull request comes from decides the release: a `feat/` branch raises the minor version, a `fix/` branch the patch version, anything else releases nothing. The pull request titles become the release notes, so nobody writes a changelog entry by hand; an optional hand-written note can still be left for the next release to carry. The work is split into two automated jobs: the first raises the version and commits it after the usual checks pass, the second adds the tag and the GitHub Release and can be retried alone if it fails. A new release is refused while the previous one has no tag, so no version is ever left untagged, and after tagging the second job restarts the first once so nothing merged in between is left behind. We wrote a small script of our own instead of adopting a release tool, because this repository keeps its version in three files and its changelog in a shape the upgrade command reads, and it needs no secret beyond the one every run already has.

## Slices

<!-- stack -->
| slice | title | PR |
|---|---|---|
| 1 | prepare | — |
| 2 | publish | — |
<!-- /stack -->

## Notes

Spec, plans and this document are transient and leave through the generated wipe PR before
this feature merges into `main`. This description is the durable record.
