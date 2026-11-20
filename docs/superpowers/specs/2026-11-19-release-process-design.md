# Automatic releases — design

**Review mode:** simple

## Intent

A feature merged to `main` does not reach anyone's Claude Code until someone runs the manual
release recipe in `AGENTS.md`. That step gets forgotten: `main` has carried released-worthy
changes since 0.3.0 with the version still at 0.3.0, and `v0.3.0` was never tagged. The
release must happen by itself when a merge to `main` carries release notes.

## How a release reaches a user today

- The marketplace is this repository (`.claude-plugin/marketplace.json`, plugin `source: "./"`).
  A commit on `main` that raises the version *is* the publication; there is no registry to
  push to.
- The version is recorded in three files that tests keep equal: `.claude-plugin/plugin.json`,
  `.claude-plugin/marketplace.json` (`plugins[0].version`) and `.hitl/manifest.json`
  (`version`; `self-manifest.test.ts`).
- `CHANGELOG.md` is hand-written in user words. `/hitl:diff` prints its sections as upgrade
  notes (`changelogSections`, `notesBetween` in `installer/lib.mjs`). A PR that changes what
  a user notices adds a bullet under `## Unreleased`.
- `/hitl:diff` reads the marketplace at the tag `v<recorded version>` and refuses when that
  tag is missing. Tags are load-bearing.
- The repository has no GitHub Actions workflows. `main` is unprotected.

## Goals

- A push to `main` whose `## Unreleased` section has at least one bullet produces, with no
  human step: the version raised in the three files, `## Unreleased` promoted to
  `## <version>` with a new empty `## Unreleased` above it, one commit on `main`, the tag
  `v<version>` on that commit, and a GitHub Release whose notes are that section.
- A push to `main` with an empty `## Unreleased` releases nothing.
- The chores and the release are two workflows; a failed release is retried without redoing
  the chores.

## Non-goals

- Generating changelog text from commits. The notes stay hand-written.
- Running the gates on pull requests (a general CI). Only the release run executes them.
- Enforcing that a feature PR adds an `## Unreleased` bullet.
- Publishing anywhere other than this repository (no npm, no other marketplace).

## Anti-goals

- A release that replaces or reorders the hand-written notes `/hitl:diff` prints.
- A release commit that fails the local gates (`pnpm test`, `pnpm format:check`).
- A workflow that needs a personal access token or any secret beyond the run's own
  `GITHUB_TOKEN`.
- A release loop: a release commit that causes another release.

## Approaches

1. **Own script, two chained workflows — chosen.** A tested script does the file changes;
   `release-prepare` commits them; `release-publish` tags and creates the GitHub Release.
   Fits the hand-written changelog exactly, needs no secret, and the release half is
   retryable alone. Costs a small script to maintain.
2. **Off-the-shelf tool** (release-please, semantic-release, changesets). Rejected: these
   write the changelog from commits or changeset files, which would replace the notes
   `/hitl:diff` reads; keeping the notes and bumping three JSON files needs more
   configuration than approach 1 needs code.
3. **Own script, one workflow.** Rejected: same script, one file fewer, but a failure after
   the bump is committed has no separate step to re-run, and the human asked for the chores
   and the release to be separate.

The trigger was decided first: automatic on every push to `main` (chosen), over a manual
button and over a bot-maintained release PR, because the forgotten step is the problem.

## Design

### The release script — `scripts/release.mjs`

Repo-specific (never rendered into a target repository, so it lives beside `scripts/hitl/`,
not in it). Two commands, both taking `--repo <path>`; tested under `scripts/__tests__/`
against temp directories.

**`prepare`** — decide and write.

- Reads `CHANGELOG.md`. A *bullet* is a line of the `## Unreleased` section that starts with
  `- `. No bullets → writes nothing, prints `{"released":false}`, exits 0.
- Otherwise computes the next version from the current one (`pluginVersion`):

  | `## Unreleased` contains | current `0.y.z` | current `x.y.z`, x ≥ 1 |
  |---|---|---|
  | a bullet starting `- **Breaking:**` | minor | major |
  | only bullets starting `- **Fix:**` | patch | patch |
  | anything else | minor | minor |

  The markers stay in the released text.
- Writes, then prints `{"released":true,"version":"<next>","bump":"major|minor|patch"}`:
  - `CHANGELOG.md`: the `## Unreleased` heading becomes `## <next>`, and a new
    `## Unreleased` heading with an empty body is inserted above it. No other byte of the
    file changes.
  - `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`: the version string
    is replaced in place. The files are not re-serialized (they hold hand-formatted inline
    objects that Prettier accepts as they are).
  - `.hitl/manifest.json`: records the new version and still passes `self-manifest.test.ts`.
- Refuses (non-zero, nothing written) when the three version files disagree, when
  `CHANGELOG.md` has no `## Unreleased` section, or when a `## <next>` section already
  exists.
- After `prepare` on this repository, `pnpm test` and `pnpm format:check` pass.

**`notes --version <x.y.z>`** — prints that version's changelog section body, using
`changelogSections`. Non-zero when the section is missing or empty.

### Workflow 1 — `.github/workflows/release-prepare.yml`

- Trigger: `push` to `main`. `concurrency` group `release`, never cancelling a run in
  progress. `permissions: contents: write`.
- Steps: check out the head of `main`; set up Node from `.nvmrc` and pnpm from
  `packageManager`; install; run `prepare`; run both gates; when `released` is true, commit
  the four files as `chore(release): <version>` (author `github-actions[bot]`) and push to
  `main`.
- A failing gate or a rejected push fails the run and releases nothing; the next push to
  `main` finds the bullets still under `## Unreleased` and releases them.
- No loop, twice over: a push made with `GITHUB_TOKEN` starts no workflow, and the release
  commit leaves `## Unreleased` empty.

### Workflow 2 — `.github/workflows/release-publish.yml`

- Triggers: `workflow_run` of `release-prepare`, `completed`, only when its conclusion is
  `success`; and `workflow_dispatch`, the retry. `workflow_run` is used because the release
  commit's own push cannot start a workflow. Same `concurrency` group.
  `permissions: contents: write`.
- Steps: check out `main` with full history and tags; read the version from
  `.claude-plugin/plugin.json`; if the tag `v<version>` already exists, stop successfully.
  Otherwise tag the last commit that changed `.claude-plugin/plugin.json`, push the tag, and
  create the GitHub Release `v<version>` with the output of `notes` as its body.
- Idempotent: it runs after every `release-prepare`, including the ones that released
  nothing, and acts only when the current version has no tag.

### Documentation

- `AGENTS.md`, **Releasing**: replaced by what is true now — a bullet under `## Unreleased`
  is what causes a release; the `**Breaking:**` and `**Fix:**` markers and what each does;
  the two workflows; how to retry a failed publish; never bump a version by hand.
- `README.md`: how a user gets a new version (the update commands, and automatic updates if
  Claude Code offers them for this marketplace), stated from the Claude Code documentation,
  not from memory.

### Rollout

- Workflows only run once they are on `main`, so the first real run is the merge of this
  feature. `## Unreleased` already holds a bullet, so that merge releases 0.4.0. The human
  watches that run; workflow YAML is validated that way, not by tests.
- `v0.3.0` is tagged by hand at `94c5a4f` (the merge that released 0.3.0), by the human or
  with their go-ahead. The publish workflow does not backfill it: it only ever tags the
  current version.

## Known consequence

A feature merged without an `## Unreleased` bullet is not released by its own merge; it
ships with the next merge that has one. This matches the existing rule that only a change a
user notices gets a bullet.

## Left to the builder

- How `prepare` produces the new `.hitl/manifest.json` (through the installer's own
  functions or a targeted edit), as long as the self-manifest test passes.
- The script's argument parsing and error wording, following `installer/` and `runtime/`.
- Action versions and the exact shell of each workflow step.

## Delivery slices

1. **prepare** — a merge to `main` with unreleased notes becomes a release commit:
   `scripts/release.mjs prepare`, its tests, `release-prepare.yml`, the `AGENTS.md` section.
2. **publish** — a released version on `main` gets its tag and GitHub Release:
   `scripts/release.mjs notes`, its tests, `release-publish.yml`, the `README.md` section.
