# Releases publish in the same run — design

## Problem

On `main`, a release is two workflows: `release-prepare` (raise the version, write the
changelog section, commit) and `release-publish` (tag `v<version>`, create the GitHub
Release). Publishing starts when a `release-prepare` run completes (`workflow_run`).

GitHub starts no `workflow_run` for a run that was itself started with the workflow's own
token. `release-publish` starts `release-prepare` with that token to catch up after it backfills
a missing tag, so a version released in that catch-up run is never published. Seen on
2026-11-20: v0.3.0 was backfilled, the catch-up run committed `chore(release): 0.4.0`, and
v0.4.0 stayed untagged until `release-publish` was started by hand. While a version is
untagged, the next release refuses (`tag-missing`) and `/hitl:diff` cannot read it.

## Goal

Every version committed by the release automation is tagged and published with no person
starting anything, including a version released by the catch-up run.

- Non-goal: changing what is released, when, or what the notes say. `scripts/release.mjs`
  does not change.
- Anti-goal: a personal access token or any secret beyond the token every run already has.

## Approaches

1. `release-prepare` starts `release-publish` itself at the end of every run, and the
   `workflow_run` trigger is removed. Smallest change; keeps two workflows, still one
   workflow starting another.
2. Keep the `workflow_run` trigger and also start `release-publish` from `release-prepare`.
   Smallest edit, but a normal merge publishes twice, and the unreliable trigger stays.
3. **Chosen:** one workflow, `release`, with two jobs: `prepare`, then `publish`. Nothing
   depends on GitHub starting a workflow when another completes. One run page per release.
   Retrying publishing alone is GitHub's "Re-run failed jobs". Costs a merge of the two files
   and a rewrite of the release instructions.

## Design

- `.github/workflows/release.yml` replaces `release-prepare.yml` and `release-publish.yml`,
  which are deleted.
- Triggers: a push to `main`, and `workflow_dispatch`. One `concurrency` group for the
  workflow, never cancelling a run in progress.
- Job `prepare`: the steps of today's `release-prepare` job, unchanged.
- Job `publish`: `needs: prepare`, and runs unless the run was cancelled — also when
  `prepare` failed or refused, so a red `prepare` (`tag-missing`, or a hand-raised major
  version) is still followed by the tag. Its steps are today's `release-publish` steps,
  unchanged: it checks out `main` afresh (so it sees the release commit `prepare` just
  pushed), tags the version if it has no tag, creates the GitHub Release if it is missing,
  and does nothing when both exist.
- The catch-up: when `publish` created the tag, it starts `release` again with
  `workflow_dispatch` (which GitHub allows from the workflow's own token — it worked on
  2026-11-20). That run releases whatever was merged meanwhile and publishes it; it then finds
  nothing new to tag on the next pass, so the chain ends.
- Permissions are set per job: `prepare` keeps `contents: write` and `pull-requests: read`;
  `publish` keeps `contents: write` and `actions: write`.
- `AGENTS.md`, the **Releasing** section: every mention of the two workflows becomes the one
  `release` workflow and its two jobs. A skipped release and a failed publish are both retried
  by starting `release` from the Actions tab, or, for a failed `publish` job, with "Re-run
  failed jobs". A hand-raised major version gives a red `prepare` job followed by a green
  `publish` job in the same run, which is expected.

## Proof

Workflow files are validated by a person watching a real run (`.hitl/HITL.md`), never by a
test written for them. The next release on `main` is watched: one `release` run, `prepare`
then `publish`, and the version is tagged with its GitHub Release. Nothing under `scripts/`
changes, so the existing tests and gates stay as they are and must still pass.

## Delivery slices

One slice: the workflow merge and the `AGENTS.md` rewrite, together — the instructions must
never describe workflows that do not exist.
