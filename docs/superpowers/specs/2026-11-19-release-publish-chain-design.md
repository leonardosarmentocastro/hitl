# Releases publish in the same run — design

**Review mode:** elaborate
**Reviewed:** round 1 (2026-11-19) · round 2 (2026-11-19).

## Problem

On `main`, a release is two workflows: `release-prepare` (raise the version, write the
changelog section, commit) and `release-publish` (tag `v<version>`, create the GitHub
Release). Publishing starts when a `release-prepare` run completes (`workflow_run`).

GitHub starts no `workflow_run` for a run that was itself started with the workflow's own
token. `release-publish` starts `release-prepare` with that token to catch up after it backfills
a missing tag, so a version released in that catch-up run is never published. Seen on
2026-11-20 (UTC, GitHub's clock): v0.3.0 was backfilled, the catch-up run committed `chore(release): 0.4.0`, and
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
  workflow, never cancelling a run in progress. GitHub keeps at most one run waiting in the
  group: a newer waiting run replaces an older one, which then shows as cancelled. That is
  harmless — every run reads `main` as it is when it starts and does the same work.
- Job `prepare`: the steps of today's `release-prepare` job, unchanged.
- Job `publish`: `needs: prepare`, and runs unless the run was cancelled — also when
  `prepare` failed or refused, so a red `prepare` (`tag-missing`, or a hand-raised major
  version) is still followed by the tag. Its steps are today's `release-publish` steps,
  except the catch-up below and which version it acts on: it checks out `main` afresh (so it
  sees the release commit `prepare` just pushed), tags the version if it has no tag, creates
  the GitHub Release if it is missing, and does nothing when both exist.
- The version `publish` acts on: the version this run's `prepare` released, when it released
  one (`prepare` passes `released` and `version` on as job outputs); otherwise the version on
  `main` — the backfill. So "Re-run failed jobs" on an older run finishes that run's own
  version even after later releases have moved `main` (GitHub keeps the outputs of the jobs it
  does not re-run). Limit: a backfill whose Release step failed, retried after `main` has
  moved, acts on the newer version; that older version's Release is then created by hand.
- The catch-up: `publish` starts `release` again with `workflow_dispatch` only when it created
  a tag for a version this run's `prepare` did not release — a backfill, such as a version
  left untagged or a hand-raised major version. A normal release, whose `prepare` released the
  version `publish` just tagged, starts no further run: anything merged meanwhile started its
  own `release` run, which waits in the concurrency group. The dispatched run releases what the
  untagged version held back and publishes it in its own `publish` job; that job tags a version
  its own `prepare` released, so the chain ends there. GitHub allows this dispatch from the
  workflow's own token — it worked on 2026-11-20 (UTC).
- Permissions are granted per job and nowhere at the workflow level: `prepare` gets
  `contents: write` and `pull-requests: read`; `publish` gets `contents: write` and
  `actions: write`.
- `AGENTS.md`, the **Releasing** section: every mention of the two workflows becomes the one
  `release` workflow and its two jobs. A failed `publish` job is retried with "Re-run failed
  jobs"; "Re-run all jobs" also works but adds one empty catch-up run, because the re-run
  `prepare` refuses and the tag counts as a backfill. A skipped release, a catch-up that did
  not start (the tag exists, so a re-run will not start it again) and a backfill run someone
  cancelled are retried by starting `release` from the Actions tab. An older version still
  without its GitHub Release, after a backfill retry acted on a newer one, is created by hand:
  `node scripts/release.mjs notes` for its notes, then `gh release create v<version>`. A
  hand-raised major version gives a red `prepare` job followed by a green `publish` job in the
  same run, then one catch-up run, which is expected.

## Proof

Workflow files are validated by a person watching a real run (`.hitl/HITL.md`), never by a
test written for them. Nothing under `scripts/` changes, so the existing tests and gates stay
as they are and must still pass.

- **Read in the pull request:** `publish` is set to run after a failed `prepare` (not only
  after a successful one), and `prepare` passes `released` and `version` on as job outputs
  that `publish` reads. Either one wrong brings the original bug back silently.
- **One run in a throwaway copy, before this merges into `main`:** a private scratch
  repository holding this repository's state with the fix, where a released version is left
  untagged on purpose and a `feat/` pull request is merged on top. The watcher confirms: the
  `release` run shows a red `prepare` (`tag-missing`), then a `publish` that tags the
  untagged version and starts one catch-up run; the catch-up run releases the merged pull
  request and its own `publish` tags and publishes it; no further run follows. The scratch
  repository is deleted afterwards. This is the human's step, outside the slice's code.
- **Watched on the first release after this merges:** one `release` run, `prepare` then
  `publish`, the version tagged with its GitHub Release, and no catch-up run after it.

## Delivery slices

One slice: the workflow merge and the `AGENTS.md` rewrite, together — the instructions must
never describe workflows that do not exist.

## Decisions and declined alternatives

- Catch-up after every tag `publish` creates (as before): declined — every release would be
  followed by an empty run. It runs only after a backfill (human, round 1).
- Proof by watching the next normal release only: declined — the old setup passed that too.
  The two workflow settings are read in the pull request and both paths run once in a
  throwaway copy (human, round 2).
- *Forwarded to the plan gate:* a `release-prepare` run still in progress when this merges is
  in a different concurrency group from the new `release` run, so the two can race to push.
  It recovers on its own (the new run's `publish` backfills the tag and starts a catch-up);
  the plan says so, so the first watcher is not surprised.
