# Handover — release-publish-chain

Launch: `cd .claude/worktrees/release-publish-chain && claude --model opus` then `/implement-stack docs/superpowers/handover/release-publish-chain.md`
Mode: start
Feature branch: fix/release-publish-chain
Spec(s): docs/superpowers/specs/2026-11-19-release-publish-chain-design.md

## Stack

| slice | plan | branch | parent | status | owns |
|---|---|---|---|---|---|
| 1 | docs/superpowers/plans/2026-11-19-release-publish-chain-slice-1-one-workflow.md | fix/release-publish-chain-slice-1-one-workflow | fix/release-publish-chain | open #75 | a release on `main` is prepared and published in one `release` workflow run — publishing also after a failed prepare, on the version that run released, and a catch-up run only after a backfill — and the release instructions describe that workflow. |

## Umbrella PR body

Plan: docs/superpowers/specs/2026-11-19-release-publish-chain-design.md

## TL;DR

**What** — Releases on `main` now run as a single `release` workflow with two steps in a row:
prepare the version, then tag and publish it. The two separate release workflows are gone, and
the release instructions describe the new one.

**Why** — Publishing used to start only when GitHub noticed that the prepare workflow had
finished, and GitHub sends no such notice for a run the automation started itself. So a version
released during a catch-up run was never tagged or published until someone started publishing
by hand, and until then the next release refused to go out.

**How** — Publishing is now the second job of the same run, so nothing depends on GitHub
starting one workflow when another completes. It runs even when preparing failed or refused, so
a version left untagged still gets its tag. It acts on the version its own run released, falling
back to the one on `main`, which keeps a retry of an older run on that run's version. A
follow-up run starts only after publishing tags a version its own run did not release, so a
normal release ends in one run, and nothing beyond the token every run already has is needed.

## Slices

<!-- stack -->
| slice | title | PR |
|---|---|---|
| 1 | one workflow | #75 |
<!-- /stack -->

## Notes

Spec, plans and this document are transient and leave through the generated wipe PR before
this feature merges into `main`. This description is the durable record.
