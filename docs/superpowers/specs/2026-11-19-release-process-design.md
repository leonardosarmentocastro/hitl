# Automatic releases — design

**Review mode:** simple
**Reviewed:** round 1 (2026-11-19) · round 2 (2026-11-19).

## Intent

A feature merged to `main` does not reach anyone's Claude Code until someone runs the manual
release recipe in `AGENTS.md`. That step gets forgotten: `main` has carried release-worthy
changes since 0.3.0 with the version still at 0.3.0, and `v0.3.0` was never tagged. A
release must happen by itself when a feature or a fix merges, with nothing for the author to
remember — no version to pick, no changelog entry to write.

## How a release reaches a user today

- The marketplace is this repository (`.claude-plugin/marketplace.json`, plugin `source: "./"`).
  A commit on `main` that raises the version *is* the publication; there is no registry to
  push to. Claude Code detects an update by the `version` in `plugin.json`.
- The version is recorded in three files that tests keep equal: `.claude-plugin/plugin.json`,
  `.claude-plugin/marketplace.json` (`plugins[0].version`) and `.hitl/manifest.json`
  (`version`; `self-manifest.test.ts`).
- `CHANGELOG.md` is hand-written. `/hitl:diff` prints its `## x.y.z` sections as upgrade
  notes (`changelogSections`, `notesBetween` in `installer/lib.mjs`), read offline from the
  installed plugin, so the file must keep existing and keep that shape.
- `/hitl:diff` reads the marketplace at the tag `v<recorded version>` and refuses when that
  tag is missing. Tags are load-bearing.
- Work reaches `main` through pull requests whose head branch is named by intent —
  `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, `chore/<topic>` (`.hitl/HITL.md`,
  § Feature branches) — and whose title says what changed in plain words.
- The repository has no GitHub Actions workflows. `main` is unprotected.

## Goals

- A push to `main` after which at least one unreleased pull request from a `feat/` or `fix/`
  branch is merged produces, with no human step: the version raised in the three files, a
  new `## <version>` section in `CHANGELOG.md` listing the unreleased pull requests' titles,
  one commit on `main`, the tag `v<version>` on that commit, and a GitHub Release whose
  notes are that section.
- A push to `main` with no unreleased `feat/` or `fix/` pull request releases nothing.
- The chores and the release are two workflows; a failed release is retried without redoing
  the chores.
- No released version is ever left without its tag.

## Non-goals

- Running the gates on pull requests (a general CI). Only a run that releases executes them.
- Major versions. Nothing in a branch prefix says "breaking"; a major is cut by hand when
  1.0 comes: a pull request raises the three files and adds the `## <version>` section, and
  `release-publish` tags it.
- Releasing commits pushed to `main` without a pull request.
- Publishing anywhere other than this repository (no npm, no other marketplace).

## Anti-goals

- Anything the author of a change must remember for it to be released.
- A release that changes a `## x.y.z` section already released.
- A release commit that fails the local gates (`pnpm test`, `pnpm format:check`).
- A workflow that needs a personal access token or any secret beyond the run's own
  `GITHUB_TOKEN`.
- A release loop: a release commit that causes another release.

## Approaches

Trigger, decided first: automatic on every push to `main` (chosen), over a manual button and
over a bot-maintained release PR, because the forgotten step is the problem.

How it is built:

1. **Own script, two chained workflows — chosen.** A tested script does the file changes;
   `release-prepare` commits them; `release-publish` tags and creates the GitHub Release.
   Needs no secret, and the release half is retryable alone.
2. **Off-the-shelf tool** (release-please, semantic-release, changesets). Rejected: bumping
   three JSON files and keeping the changelog shape `/hitl:diff` parses needs more
   configuration than approach 1 needs code.
3. **Own script, one workflow.** Rejected: a failure after the bump is committed has no
   separate step to re-run, and the human asked for the chores and the release to be
   separate.

Where the release signal and the notes come from:

- **X. Pull requests — chosen by the human.** The head branch prefix of each merged pull
  request decides whether and how far the version moves; the titles are the notes. Nothing
  to remember. Costs the plain-words upgrade instructions a hand-written note can carry.
- **Y. One note file per change**, gathered at release. Rejected: still a step to remember.
- **Z. Hand-written bullets under a shared `## Unreleased`** (the first version of this
  spec). Rejected: a branch cut before a release merges its bullet, without conflict, into
  the section already released — the change is then never released; and a forgotten bullet
  means no release. Another project (ai-memory) guards this with a frozen-sections check;
  the human preferred to remove the hand-written step.

## Design

### Which pull requests are unreleased

A pull request is *unreleased* when it is merged into `main`, its merge commit is in the
checked-out history of `main`, and that commit is not an ancestor of the tag
`v<current version>`. Ancestry, not dates, so a pull request merged while a release run is
in flight (its merge commit is not in that run's checkout, or not yet known) is left for the
next run, never lost and never released twice.

Titles are trusted as release notes because only a maintainer merges into `main`.

### The release script — `scripts/release.mjs`

Repo-specific (never rendered into a target repository, so it lives beside `scripts/hitl/`,
not in it). Two commands, both taking `--repo <path>`; tested under `scripts/__tests__/`
against temporary git repositories.

**`prepare --prs <file>`** — decide and write. `<file>` is the JSON that
`gh pr list --state merged --base main --json number,title,headRefName,mergeCommit` prints.

- Keeps the unreleased pull requests (above) and reads each one's prefix, the part of
  `headRefName` before the first `/`:

  | Unreleased pull requests | Next version |
  |---|---|
  | at least one `feat/` | minor (`0.3.0` → `0.4.0`) |
  | no `feat/`, at least one `fix/` | patch (`0.3.0` → `0.3.1`) |
  | none of either | no release |

- No release → writes nothing, prints `{"released":false}`, exits 0.
- Otherwise writes, then prints `{"released":true,"version":"<next>","bump":"minor|patch","prs":[<numbers listed>]}`:
  - `CHANGELOG.md`: a new `## <next>` section is inserted between `## Unreleased` and the
    newest released section; `## Unreleased` stays the first section and is left empty. The
    new section's body is, in order: whatever text stood under `## Unreleased` (may be
    none), then one line per unreleased `feat/` and `fix/` pull request, in number order:
    `- <title> (#<number>)`. Pull requests with any other prefix are not listed. No released
    section changes.
  - `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`: the version string
    is replaced in place. The files are not re-serialized (they hold hand-formatted inline
    objects that Prettier accepts as they are).
  - `.hitl/manifest.json`: records the new version and still passes `self-manifest.test.ts`.
- Refuses (non-zero, nothing written) when: the three version files disagree; the tag
  `v<current version>` does not exist in the repository (the previous release was not
  published — releasing again would leave it untagged for good); `CHANGELOG.md` has no
  `## Unreleased` first section; or a `## <next>` section already exists.
- `## Unreleased` is no longer required from anyone and never triggers a release. It
  remains as an optional place for a hand-written note — an upgrade instruction a title
  cannot carry — which the next release carries into its section.
- Proven by a test that runs `prepare` on a temporary copy of this repository's four files
  and asserts what `changelog.test.ts` and `self-manifest.test.ts` assert of the real ones
  (`Unreleased` first, versions newest first, the three versions equal the newest section),
  and that Prettier accepts the two `.claude-plugin` files.

**`target --version <x.y.z>`** — prints the commit a version's tag belongs on: the oldest
commit in `main`'s first-parent history at which `.claude-plugin/plugin.json` holds that
version. For an automatic release that is the `chore(release)` commit; for a version raised
by hand in a pull request it is that pull request's merge into `main`. Non-zero when no
commit holds it.

**`notes --version <x.y.z>`** — prints that version's changelog section body, using
`changelogSections`. Non-zero when the section is missing or empty.

### Workflow 1 — `.github/workflows/release-prepare.yml`

- Triggers: `push` to `main`; and `workflow_dispatch`, the catch-up — started by
  `release-publish` (below) or by a human. Its own `concurrency` group, never cancelling a run in
  progress; a waiting run replaced by a newer one loses nothing, because every run reads the
  head of `main` and all unreleased pull requests. Permissions: `contents: write`,
  `pull-requests: read`.
- Steps: check out the head of `main` with full history and tags; list the merged pull
  requests with `gh` (the 100 most recent); run `prepare`. When `released` is true: set up
  Node from `.nvmrc` and pnpm from `packageManager`, install, run both gates, commit the
  four files as `chore(release): <version>` (author `github-actions[bot]`) and push to
  `main`. When it is false, the run ends green without running the gates.
- A refusal, a failing gate or a rejected push fails the run and releases nothing; nothing
  is lost, since the pull requests stay unreleased for the next run.
- No loop: a push made with `GITHUB_TOKEN` starts no workflow, and the release commit
  belongs to no pull request.
- A push whose head commit message carries `[skip ci]` starts no run. The wipe commit
  carries it, so the rule is: the wipe pull request and the pull request into `main` are
  merged with a merge commit (as every one has been so far), never squashed or rebased —
  the head commit of the push is then GitHub's merge commit. If a push is skipped anyway,
  nothing fails and nothing is lost: the next push, or a human starting `release-prepare`
  from the Actions tab, releases what was skipped.

### Workflow 2 — `.github/workflows/release-publish.yml`

- Triggers: `workflow_run` of `release-prepare`, `completed`, whatever its conclusion; and
  `workflow_dispatch`, the retry. `workflow_run` is used because the release commit's own
  push cannot start a workflow. Its own `concurrency` group.
  Permissions: `contents: write`, `actions: write`.
- Steps: check out `main` with full history and tags; read the version from
  `.claude-plugin/plugin.json`. Then, independently:
  - if the tag `v<version>` is missing, create it on the commit `target` prints and push it;
  - if the GitHub Release `v<version>` is missing, create it with the output of `notes` as
    its body.
- Then, only when this run created the tag, it starts `release-prepare` once
  (`workflow_dispatch`). A `release-prepare` run that began before the tag existed refused
  and failed; this catch-up releases the pull requests that run left behind, also after a
  human retried a failed publish. It ends by itself: the catch-up either releases (one more
  round) or releases nothing, and a publish run that creates no tag starts nothing.
- Idempotent: it runs after every `release-prepare` and does nothing when both exist. It
  never tags a version other than the current one.
- A failed publish shows as a red run, which GitHub reports to the maintainer; until it is
  retried, every `release-prepare` refuses, red as well. Nothing is released half-way in
  silence.

### Documentation

- `AGENTS.md`, **Releasing**: replaced by what is true now — the head branch prefix of a
  pull request into `main` decides the release (`feat/` minor, `fix/` patch, anything else
  none); the pull request title becomes the release note, so it is written for a user; the
  optional `## Unreleased` note; the two workflows; how to retry a failed publish; never
  raise a version by hand below 1.0. Slice 1 writes the section; slice 2 completes it with
  the publish workflow and the retry.
- `README.md`: how a user gets a new version, as the Claude Code documentation states it
  (checked 2026-11-19; the builder re-checks the wording against the docs), using the same
  commands `/hitl:help` prints (`commands/help.md`):
  - Automatic updates are off by default for a marketplace like this one. Turning them on
    once: `/plugin` → **Marketplaces** → `hitl` → enable auto-update. Claude Code then
    updates shortly after a session starts.
  - By hand: the `/hitl:help` recipe, then a new session or `/reload-plugins`.

### Rollout

- **Before this feature merges**, the human (or the agent with their go-ahead) tags
  `v0.3.0` at `94c5a4f`, the merge that released 0.3.0, and pushes the tag. `prepare`
  refuses without it.
- Workflows only run once they are on `main`, so the first real run is the merge of this
  feature. Pull requests #57 and #63 and this feature's own are unreleased `feat/` pull
  requests, so that run releases 0.4.0, carrying the bullet that stands under
  `## Unreleased` today. The human watches that run; workflow YAML is validated that way,
  not by tests.
- That run is also the first time the test suite executes on a GitHub runner. If a gate
  fails there for a reason unrelated to the release, nothing is released; the fix arrives as
  an ordinary pull request and its merge releases everything pending.
- After the first release, the human starts `release-publish` once from the Actions tab and
  watches it do nothing: the retry path, observed.

## Known consequences

- A feature whose pull request into `main` comes from a branch not named `feat/…` or
  `fix/…` is not released by its own merge; it ships, unlisted, with the next release.
- Release notes are as good as pull request titles. A note that needs more than a title —
  an instruction to upgrade by hand — goes under `## Unreleased`, and that is optional and
  subject to the misplaced-bullet risk described under approach Z.
- Any pull request merged into `main` from a `feat/` or `fix/` branch counts, whatever the
  rest of its name. A slice or wipe pull request that GitHub retargets to `main` and that
  is merged there would be released under its own title.
- More than 100 pull requests merged between two releases would hide the oldest from
  `prepare`. Not expected at this repository's pace.

## Decisions and declined alternatives

- Round 1, finding 3 (a stale branch's bullet lands in a released section): answered by the
  human choosing approach X; hand-written bullets are no longer the release signal.
- Round 1, finding 9 (text under `## Unreleased` that is not a bullet): moot under X; any
  text there is carried as written.
- *Forwarded to the plan gate:* `prepare` refuses a current version that is not plain
  `x.y.z`.
- *Forwarded to the plan gate:* the pull request listing must be the most recently
  *merged*, not the most recently created.
- **Bubbled up from plan review (round 2)** — `prepare`'s output also carries `prs`, the
  numbers of the pull requests it listed, so the run log says what a release contains.
- Round 2, finding 1 (a `prepare` run that starts before the previous version is tagged):
  publish starts `release-prepare` after creating a tag; `prepare` keeps refusing rather
  than tagging itself, so tagging stays in one place.

## Left to the builder

- How `prepare` produces the new `.hitl/manifest.json` (through the installer's own
  functions or a targeted edit), as long as the self-manifest test passes.
- The script's argument parsing and error wording, following `installer/` and `runtime/`.
- Action versions and the exact shell of each workflow step.
- Which existing tests and durable instructions mention the hand-written `## Unreleased`
  duty (for example `changelog.test.ts`, `AGENTS.md`) and must follow the new rule.

## Delivery slices

1. **prepare** — a merged `feat/` or `fix/` pull request becomes a release commit:
   `scripts/release.mjs prepare`, its tests, `release-prepare.yml`, the `AGENTS.md` section.
2. **publish** — a released version on `main` gets its tag and GitHub Release:
   `scripts/release.mjs target` and `notes`, their tests, `release-publish.yml`, the `README.md` section,
   the rest of the `AGENTS.md` section.
