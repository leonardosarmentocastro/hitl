# Releases publish in the same run, slice 1: one workflow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Owns:** a release on `main` is prepared and published in one `release` workflow run — publishing also after a failed prepare, on the version that run released, and a catch-up run only after a backfill — and the release instructions describe that workflow.

**Reviewed:** round 1 (2026-11-19).

**Goal:** Replace `release-prepare.yml` and `release-publish.yml` with one `release.yml` whose `publish` job follows its `prepare` job, so no release depends on GitHub starting one workflow when another completes.

**Architecture:** One workflow, two jobs. `prepare` is today's `release-prepare` job plus job outputs set only once the release commit is pushed. `publish` is today's `release-publish` job, run after `prepare` unless cancelled, acting on `prepare`'s version when it released one and on `main`'s otherwise, and dispatching `release` again only after a backfill.

**Tech Stack:** GitHub Actions YAML, `gh`, `jq`, the existing `scripts/release.mjs` (unchanged).

**Spec:** docs/superpowers/specs/2026-11-19-release-publish-chain-design.md

## Global Constraints

- Workflow files are validated by a person watching a real run, never by a test written for them (`.hitl/HITL.md`). This slice adds no test.
- `scripts/release.mjs` and its tests do not change. `pnpm test` and `pnpm format:check` must still pass.
- No personal access token and no secret beyond `github.token`.
- Actions stay at the versions slice 1 and 2 of the release feature pinned: `actions/checkout@v7`, `actions/setup-node@v7`, `pnpm/action-setup@v6`.
- Permissions are granted per job and nowhere at the workflow level: `prepare` gets `contents: write` and `pull-requests: read`; `publish` gets `contents: write` and `actions: write`.
- Markdown is never Prettier-formatted here; wrap `AGENTS.md` by hand at about 100 columns.

## Review Focus

- `prepare` fails after deciding to release (gates red, push rejected): nothing reached `main`, so `publish` must not act on that unpushed version. Pinned by Task 1: the job outputs come from the commit step, which runs last.
- `publish` after a red `prepare` (`tag-missing`, hand-raised major): `publish` must still run. Pinned by Task 1's `if: ${{ !cancelled() }}`; checked by the PR reviewer by reading.
- "Re-run failed jobs" on an older run after `main` moved: `publish` must act on that run's version, from `prepare`'s kept outputs. Pinned by Task 1's version step.
- A normal release must not dispatch a catch-up run; a backfill must dispatch exactly one. Pinned by Task 1's catch-up condition.
- A `release-prepare` run still in progress when this merges (forwarded from the spec gate): it is in another concurrency group and can race the first `release` run to push. It recovers on its own — the new run's `publish` backfills the tag and dispatches one catch-up. Task 2's PR body tells the first watcher.

---

### Task 1: The `release` workflow

**Files:**
- Create: `.github/workflows/release.yml`
- Delete: `.github/workflows/release-prepare.yml`, `.github/workflows/release-publish.yml`

**Interfaces:**
- Produces: workflow file name `release.yml`, `name: release`; jobs `prepare` and `publish`; `prepare` job outputs `released` (`'true'` or empty) and `version`.

- [ ] **Step 1: Write `.github/workflows/release.yml`**

  - Header comment: one paragraph saying what the workflow does (prepare, then publish in the same run; catch-up after a backfill), replacing the two old header comments.
  - `on:` `push: branches: [main]` and `workflow_dispatch:`.
  - `concurrency: { group: release, cancel-in-progress: false }`.
  - No workflow-level `permissions:`. `defaults: run: shell: bash` as today.
  - Job `prepare`: `permissions: contents: write, pull-requests: read`. Steps copied from `release-prepare.yml` unchanged, except the last step ("Commit and push the release") gets `id: commit` and, after `git push origin HEAD:main`, writes `released=true` and `version=$VERSION` to `$GITHUB_OUTPUT`. Job `outputs:` `released: ${{ steps.commit.outputs.released }}`, `version: ${{ steps.commit.outputs.version }}` — from the commit step, never from the `prepare` step, so a release that failed its gates or its push is not published.
  - Job `publish`: `needs: prepare`, `if: ${{ !cancelled() }}`, `permissions: contents: write, actions: write`, `env: GH_TOKEN: ${{ github.token }}`. Steps copied from `release-publish.yml`, with these changes:
    - "Read the version" (`id: version`): if `needs.prepare.outputs.released == 'true'`, `version=${{ needs.prepare.outputs.version }}`; otherwise `jq -r .version .claude-plugin/plugin.json` as today. Also write `backfill=false` in the first case and `backfill=true` in the second.
    - The catch-up step: `if: ${{ !cancelled() && steps.tag.outputs.created == 'true' && steps.version.outputs.backfill == 'true' }}`, running `gh workflow run release.yml --ref main`. Rename it "Catch up pull requests held back while this version had no tag".
    - Tag and Release steps unchanged otherwise.

- [ ] **Step 2: Delete the two old workflow files**

Run: `git rm .github/workflows/release-prepare.yml .github/workflows/release-publish.yml`

- [ ] **Step 3: Check the gates still pass**

Run: `pnpm test && pnpm format:check`
Expected: both pass. (`format:check` runs Prettier over the YAML, which also fails on a file that does not parse. GitHub reports any remaining workflow-syntax error on the pushed branch, which the human sees.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/
git commit -m "fix(release): prepare and publish in one release run, catch up only after a backfill"
```

### Task 2: The release instructions

**Files:**
- Modify: `AGENTS.md` (the **Releasing** section, today lines 50–78)

**Interfaces:**
- Consumes: the workflow name `release` and job names `prepare` and `publish` from Task 1.

- [ ] **Step 1: Rewrite the Releasing section**

Every mention of `release-prepare` becomes the `prepare` job of the `release` workflow, every mention of `release-publish` the `publish` job. The first paragraph's pointer "`release-prepare` (`.github/workflows/`, …)" becomes "the `prepare` job of `release` (`.github/workflows/release.yml`, `scripts/release.mjs prepare`)". Keep the paragraph on what decides a release and the bullets on titles, `## Unreleased` and merge commits (with "start `release` from the Actions tab" for a skipped release). Replace the last three bullets with ones that say, from the spec's §Design `AGENTS.md` bullet:
- `publish` runs after `prepare` in the same run, also when `prepare` is red; it tags the version that run released (else the version on `main`) and creates its GitHub Release; `/hitl:diff` needs the tag.
- **A failed publish:** "Re-run failed jobs". "Re-run all jobs" also works but adds one empty catch-up run. A catch-up that did not start, and a backfill run someone cancelled: start `release` from the Actions tab. An older version still without its Release after a backfill retry acted on a newer one: `node scripts/release.mjs notes --repo . --version <version> | jq -r .notes > <file>` for its notes (the command prints JSON), then `gh release create v<version> --notes-file <file> --verify-tag`.
- **A major version** is raised by hand, in a pull request that changes the three version files and adds the `## <version>` section. Its run shows a red `prepare` (`tag-missing`), then a green `publish` that tags it, then one catch-up run — all expected.

- [ ] **Step 2: Check nothing else names the old workflows**

Run: `grep -rn 'release-prepare\|release-publish' --exclude-dir=node_modules --exclude-dir=.git --exclude=.git --exclude-dir=docs . | grep -v '^./scripts/__tests__/release-'`
Expected: no output. (The two test files name their own file, not a workflow. `--exclude=.git` skips a worktree's `.git` file, which names the worktree.)

- [ ] **Step 3: Gates and commit**

Run: `pnpm test && pnpm format:check` — both pass.

```bash
git add AGENTS.md
git commit -m "docs(agents): releases run as one release workflow"
```

The slice PR body notes, for the human: the two settings to read (Review Focus lines 1–2), the throwaway-copy run the spec asks for before this merges into `main`, and the possible race with a `release-prepare` run in progress at merge time.
