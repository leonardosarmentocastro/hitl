# hitl v1 — design

**Status:** awaiting spec review.
**Reviewed:** round 1 (2026-09-16).

## Goal

Package the human-in-the-loop delivery workflow built in treasury-2 as a Claude Code plugin,
`hitl`, that installs the workflow into any repository hosted on GitHub. After
`/hitl:init` the target repository owns everything that runs — six agents, six commands, the
Stop hook, the doctrine, the PR shim and the wipe script — and changes it by pull request.
The plugin keeps only four commands of its own: `/hitl:init` (with `--adopt`),
`/hitl:diff`, `/hitl:help` and `/hitl:customize`.

v1 is done when a throwaway GitHub repository, initialised with discovery, carries one
two-slice feature end to end through the chain and the wipe job fires on merge, and when
`/hitl:init --adopt` on this repository produces a manifest whose first `/hitl:diff` reports
every file unchanged except `.claude/review-context.md`, which is repo-specific by definition.

The decisions below were fixed one at a time in the grill session that preceded this spec
(vehicle, installer-only model, `HITL.md`, core versus optional, provider shim, self-marketplace,
manifest, help, prerequisites, customize, collision rules, README section, proof, bootstrap).
This spec is self-contained; it restates what it needs and does not depend on the grill notes.

## Non-goals

- **GitLab, Bitbucket, Buildkite.** A separate feature with its own spec, verified on a real
  GitLab project. v1 stops at init when the origin host is not GitHub.
- **Any runtime in the plugin.** No command or agent of the installed workflow reads the
  plugin root or the manifest at run time. Delete `.claude/hitl.json` and the workflow runs
  identically; only `/hitl:diff` and `/hitl:help` lose their input.
- **treasury's stack.** Stories, accessibility rules, the e2e harness and its ports, CI
  jobs, lefthook configuration, dependency holds and web-review specifics are never shipped.
  Nothing implementation-shaped (a port, a folder, a library) ever comes from hitl.
- **Vendoring superpowers or grill-me.** Both stay external prerequisites.
- **Touching treasury-2.** Direction is one-way, hitl → repositories. treasury-2 is adopted
  only after the proof passes, as an acceptance step, not as part of v1's slices.
- **Publishing to the official marketplace.** hitl is its own marketplace.

## Prerequisites

Checked by `/hitl:init` and reported by `/hitl:help`:

| Prerequisite | Needed by | Hard or soft |
|---|---|---|
| Node 20 or newer on `PATH` | the installer scripts only (`init`, `diff`, `help`, `adopt`) | hard |
| `git` | installer and installed workflow | hard |
| `gh`, authenticated | the GitHub backend of the PR shim | hard |
| superpowers plugin in `enabledPlugins` (user or project scope) | the reviewers, the hook and the handover agent parse artefacts whose shape `brainstorming` and `writing-plans` produce | hard — init refuses and prints the two install lines |
| Matt Pocock's `grill-me` skill | recommended start for a feature whose shape is unclear | soft — mentioned by help and README |

Node is an install-time prerequisite only. The installed workflow needs bash, `git` and `gh`.
The installer targets Node 20 or newer; this repository's own `engines` floor of 24 applies
to developing hitl, not to installing it.
The installer is Node because two of its operations — merging the Stop hook into
`.claude/settings.json` and writing and reading a JSON manifest with hashes — need a JSON
parser, and `node` is far more likely to be present on a machine running Claude Code than
`jq`. The installed scripts stay bash so that a repository without Node can run them.

## Design

### Plugin layout

Repository `leonardosarmentocastro/hitl`, plugin name `hitl`, self-marketplace:

```
.claude-plugin/plugin.json          name "hitl", version "0.1.0"
.claude-plugin/marketplace.json     name "hitl", plugins: [{ name: "hitl", source: "./" }]
commands/init.md                    /hitl:init [--adopt]
commands/diff.md                    /hitl:diff [--apply]
commands/help.md                    /hitl:help
commands/customize.md               /hitl:customize
installer/                          Node ESM scripts, zero dependencies (see § Installer scripts)
templates/                          everything init writes (see § Templates)
.claude/, HITL.md, scripts/hitl/,   this repository's own install, rendered from templates
.github/workflows/
scripts/__tests__/                  vitest: installer, installed scripts, drift, anchors
scripts/__fixtures__/               fixture trees, fake gh, fixture marketplace clone
```

Install for a user: `claude plugin marketplace add leonardosarmentocastro/hitl` then
`claude plugin install hitl@hitl`. Claude Code clones the marketplace to
`~/.claude/plugins/marketplaces/hitl/` and caches the plugin under
`~/.claude/plugins/cache/hitl/hitl/<version>/`, which is `${CLAUDE_PLUGIN_ROOT}` for the
four commands.

**Versioning.** The plugin version is `.claude-plugin/plugin.json`'s `version`. A release is
a git tag `v<version>` on the commit that sets it. `/hitl:diff` reads the templates of a
recorded version from the marketplace clone at that tag. The first release is `0.1.0`.
When the recorded version equals the plugin's own version, the recorded render is taken from
the plugin root's `templates/` and no tag is consulted; the tag is needed only for an older
recorded version. Every installer script takes `--plugin-root`, defaulting to
`${CLAUDE_PLUGIN_ROOT}`, so this repository's tests and its own `--adopt` run against its
working tree before any release exists.

This repository is the first consumer of its own templates: its `.claude/`, `HITL.md`,
`scripts/hitl/` and wipe workflow are exactly what `/hitl:init` renders with this
repository's recorded choices, and a test asserts it (see § Testing, drift test).

### Templates

Every template is a finished file, readable as the file it becomes. Per-repository variation
is handled by **selection** (which files to install) and **composition** (which fragments to
append to `HITL.md`), never by substitution inside a file. Rendering is a pure function of
(template version, choices), and the manifest records the choices, so `/hitl:diff` can rebuild
the exact file init wrote.

```
templates/
  HITL.md                                  the core doctrine, complete
  testing/e2e.md                           optional fragments appended under
  testing/tiers.md                         "## Testing and gates", in this order
  testing/ci.md
  testing/hooks.md
  testing/effective-date.md
  claude/agents/{spec-reviewer,plan-reviewer,slice-reviewer,implementer,fixer,handover}.md
  claude/commands/{review-spec,review-plan,review-slice,handover,implement-stack,umbrella-pr}.md
  claude/hooks/unreviewed-artifact.sh
  claude/review-context.md
  claude/fixtures/spec-fixture-design.md, plans/…      dry-run fixtures for the prompts
  claude/settings.hook.json                the Stop hook entry, merged into settings.json
  scripts/pr.sh                            PR shim dispatcher
  scripts/backends/github.sh               installed as scripts/hitl/backend.sh
  scripts/wipe-superpowers-docs.sh
  ci/github-actions/wipe-superpowers-docs.yml
```

**Changes to the doctrine as cut from treasury-2**, all made in slice 1 unless noted:

- The wipe sentence in `## Specs and plans` no longer varies by CI: "a workflow deletes them
  once the feature lands on `main`; where no such job is installed, they are deleted by hand
  after merge". The `ci` choice decides only whether the workflow file is installed.
- The implementer's and fixer's gate sentence loses treasury's stack ("the unit, e2e and story
  suites") and reads "the gates named under `## Local gates` in `AGENTS.md`".
- `## Where things live` names `scripts/hitl/` (the PR shim and the wipe script) and
  `.claude/hitl.json` (install metadata, read by nothing at run time).
- A new short section, `## Load-bearing invariants` (slice 5, see § Customize).
- Knob anchors, HTML comments invisible to a reader (slice 5, see § Customize).

The optional fragments carry **principle text only**:

| fragment | principle |
|---|---|
| e2e | A user-visible bug ships a reproduces-then-proves-fixed e2e written red first; a feature's critical happy path gets one; it belongs to the slice that first makes the path exercisable, never a terminal "e2e slice" (MIS-SLICED); a pure API fix needs none. |
| tiers | Test tiers order `unit > component > e2e`; the plan names the tests before implementation. |
| ci | One terminal check; a red run is read, not re-run; a flaky test is a red job. |
| hooks | Never `--no-verify`; formatting is never a review turn. |
| effective-date | A new rule applies to a pilot area and to anything a slice touches; grandfathered code is never a finding. Pilot areas are named by the humans in `AGENTS.md`. |

When at least one fragment is chosen, `HITL.md` ends with a `## Testing and gates` heading
followed by the chosen fragments in the order above. With none chosen the heading is absent.

### Installer scripts

`installer/` holds Node ESM scripts with no dependencies. Each reads its input as JSON and
prints JSON, so a command prompt can run them, read the result and decide what to say. They
never run `git` to change state and never call the PR shim; every branch, commit, push and PR
is the command's, so the human sees them as ordinary shell steps.

| script | input | output |
|---|---|---|
| `discover.mjs` | the repository root | the discovery report |
| `render.mjs` | the repository root, the answers | writes the files; prints what it wrote and skipped |
| `adopt.mjs` | the repository root, the answers | writes only the manifest |
| `diff.mjs` | the repository root, the marketplace clone path, `--apply` | the per-file state table; with `--apply`, writes the results |
| `help.mjs` | the repository root | the install state and the prerequisite check |

Shared code (template composition, hashing, manifest IO, the owned-file list) lives in one
module the five import. The owned-file list is defined once, there.

### `/hitl:init`

The prompt orchestrates; the scripts do the deterministic work. Steps, in order:

1. **Prerequisites.** Any hard prerequisite missing stops with what to install.
2. **Manifest present.** `.claude/hitl.json` exists → "initialised at <version>; run
   `/hitl:diff`". Stop.
3. **Collision.** Inside `.claude/agents/`, `.claude/commands/` and `.claude/hooks/` only the
   owned **filenames** collide; a repository's own commands, agents and hooks there are left
   alone and listed as kept, so a repository already using Claude Code can install. `HITL.md`,
   `.claude/review-context.md` and `.github/workflows/wipe-superpowers-docs.yml` collide as
   files; `scripts/hitl/` and `.claude/fixtures/` collide as directories. Any collision → list
   every one, offer `--adopt` (the repository was ejected from treasury-2 or an earlier hitl)
   or removal, write nothing.
4. **Discovery.** `discover.mjs` prints:

   ```json
   { "host": "github | gitlab | bitbucket | unknown", "remote": "<origin url or null>",
     "ci": ["github-actions" | "gitlab-ci" | "buildkite"],
     "e2e": ["playwright" | "cypress" | "e2e-dir"],
     "hooks": ["lefthook" | "husky" | "pre-commit"],
     "scripts": { "<name>": "<command>" },
     "testRunner": true | false,
     "existing": { "CLAUDE.md": bool, "AGENTS.md": bool, "README.md": bool, ".gitignore": bool,
                   ".claude/settings.json": bool } }
   ```

   Detection: host from `git remote get-url origin`; CI from `.github/workflows/`,
   `.gitlab-ci.yml`, `.buildkite/`; e2e from `playwright.config.*`, `cypress/`, `e2e/`;
   hooks from `lefthook.yml`, `.husky/`, `.pre-commit-config.yaml`; scripts from
   `package.json`; `testRunner` true when a `test` script or a known runner config exists.
   A host other than `github` stops here: "no backend for <host> in v1".
5. **Interview**, in the prompt, one question per finding, each with a recommendation. A
   finding with nothing behind it is reported in one line and skipped:

   | finding | question | effect of yes |
   |---|---|---|
   | `ci` has `github-actions` | install the wipe job? | `.github/workflows/wipe-superpowers-docs.yml`; `ci: "github-actions"` |
   | `ci` non-empty | adopt the CI rule? | `ci` fragment |
   | `ci` non-empty but no `github-actions` | — | "skipped: no wipe wrapper for <ci> in v1; specs are deleted by hand after merge" |
   | `e2e` non-empty | adopt the e2e rule? | `e2e` fragment |
   | `testRunner` true | adopt test tiers? | `tiers` fragment |
   | `hooks` non-empty | adopt the commit-hook rule? | `hooks` fragment |
   | always | does this repository have code that new rules must not apply to retroactively? | `effective-date` fragment |
   | `scripts` non-empty | confirm the local gate commands (recommended: the test, lint and typecheck scripts found) | `## Local gates` in `AGENTS.md` |
   | `scripts` empty | type the local gate commands, or "none yet" | same |
   | `testRunner` false | — | "skipped: no test runner found; the TDD rule's first-task harness applies" |

   Pilot areas are asked, never discovered. Nothing else is asked.
6. **Render.** `render.mjs` takes the answers:

   ```json
   { "provider": "github", "ci": "github-actions | none",
     "testing": ["e2e", "tiers", "ci", "hooks", "effective-date"],
     "gates": ["pnpm test", "pnpm lint"] }
   ```

   and writes, in one pass and only if step 3 found nothing:
   - every owned file verbatim, executable bits set on the scripts; `backend.sh` is the
     `github` backend; the workflow only when `ci` is `github-actions`;
   - `HITL.md` composed as § Templates describes;
   - `CLAUDE.md`: the line `@HITL.md`, created if the file is absent, appended if present,
     recognised and left alone on a re-run;
   - `AGENTS.md`: a `<!-- hitl:start -->…<!-- hitl:end -->` block holding `## Local gates`
     with one line per gate command; the file is created as a stub if absent;
   - `README.md`: a block in the same markers, about fifteen lines, titled "How changes land
     here": the chain in one sentence, where specs live and that they are wiped on merge, that
     `.claude/` and `HITL.md` are reviewed like code, the hitl version, `/hitl:diff`, and the
     prerequisites;
   - `.gitignore`: a block in the same markers with `.claude/reviews/` (review output),
     `.claude/fixtures/scratch/` (where the review commands copy a fixture for a dry run) and
     `.claude/settings.local.json`;
   - `.claude/settings.json`: merged as JSON; other hooks kept, the Stop hook entry added if
     absent, and the report says which;
   - `.claude/hitl.json`, the manifest.
7. **Report.** What was written, what was skipped and why, and "review the changes and open a
   pull request; `.claude/` and `HITL.md` are reviewed like code from now on". Init never
   commits.

**Manifest** (`.claude/hitl.json`):

```json
{ "version": "0.1.0", "provider": "github", "ci": "github-actions",
  "testing": ["e2e", "tiers"],
  "files": { "HITL.md": "<sha256 hex>", ".claude/agents/fixer.md": "<sha256 hex>", "…": "…" } }
```

`files` holds every owned file as written, keyed by repository-relative path. Appended files
and `settings.json` are the repository's and are not tracked. `gates` are content of
`AGENTS.md`, not a render choice, and are not recorded.

**`--adopt`** runs steps 1 and 2; its own step 3 is the inverse check — no owned path exists →
"nothing to adopt; run `/hitl:init`", stop; then step 4; then it asks only what a render
needs (`ci`, `testing`; `provider` is fixed by discovery), and runs `adopt.mjs`, which writes the manifest with the
hashes of the **templates as they would be rendered** at the plugin's current version with
those answers — not the hashes of the repository's files. Nothing else is touched. The first
`/hitl:diff` then lists every file whose content differs from its template, which for a
repository ejected by hand is the check that the templates were cut faithfully.

### The PR shim

`scripts/hitl/pr.sh` is the only thing in the installed workflow that talks to a code host.
It sources `scripts/hitl/backend.sh`, the one backend init selected, from its own directory;
nothing reads the manifest at run time. Changing host is re-running init with a different
provider, which replaces `backend.sh`.

```
pr.sh create  --base <branch> --head <branch> --title <text> --body-file <path> [--draft]
pr.sh list    --head-prefix <text> [--state open|merged|closed|all]     default: all
pr.sh view    <number>
pr.sh edit    <number> --body-file <path>
pr.sh comment <number> --body-file <path>
```

Every verb prints one JSON document on stdout — `list` an array, the others a record — and
nothing else. The record:

```json
{ "number": 12, "url": "https://…", "head": "feat/x-slice-1-api", "base": "feat/x",
  "state": "open | merged | closed", "draft": true, "title": "…", "body": "…" }
```

`view` adds `reviews: [{ author, state: "approved | changes_requested | commented", body }]`
and `comments: [{ author, body, created_at }]`. `comment` returns the record of the PR it
commented on. `state` is normalised to the three words whatever the host reports.

Exit codes: `0` success; `1` usage error (verb or flag unknown or missing, usage on stderr);
`2` backend error, the host tool's stderr passed through; `3` on `create` only, a PR for that
head already exists — the existing record is on stdout so the caller falls through to `edit`,
which is what `/implement-stack` does today by reading `gh`'s error text.

The GitHub backend uses `gh` and its built-in `--jq` for normalisation, so `jq` is not a
prerequisite. The contract header of `pr.sh` documents what is best-effort per host: draft
PRs (Bitbucket has none), review versus comment, `[skip ci]` in the wipe commit, and a CI
job's right to push to a protected `main`. The word stays "PR" everywhere, with one line "a
merge request on GitLab".

**Callers**, after slice 2: `/implement-stack` (`create`, `edit`, `comment`), `/umbrella-pr`
(`list`, `create`, `view`, `edit`), the handover agent (`list`, `view`) and `/hitl:diff`
(`create`). No template calls `gh` directly except `backend.sh`.

### `/hitl:diff`

Requires a manifest. For every owned file the script holds three versions: the render at the
recorded version (templates read with `git show v<recorded>:templates/…` from the marketplace
clone at `~/.claude/plugins/marketplaces/hitl/`, composed with the recorded `ci` and
`testing`), the repository's current file, and the render at `${CLAUDE_PLUGIN_ROOT}`'s
version. Per file it reports one state:

| state | condition | action on `--apply` |
|---|---|---|
| unchanged | all three equal | none |
| upstream changed | repo = recorded, latest ≠ recorded | write latest |
| locally edited | repo ≠ recorded, latest = recorded | keep |
| both | all three differ | `git merge-file` of repo against recorded and latest; clean result written, or the file written with conflict hunks and named in the PR |
| missing locally | owned file absent | write latest |
| new upstream | file has no template at the recorded version | write latest |
| removed upstream | template at the recorded version, none at latest | delete when repo = recorded; otherwise keep and name it in the PR |

Choices are constant within a diff: recorded and latest are both rendered with the manifest's
`ci` and `testing`. Changing a choice after init is done through `/hitl:customize`, knob
`testing-rules` (see § Customize), which edits `HITL.md` and the workflow file with the
agent's help and records the new choice in the manifest, so the recorded render stays exact.

Without `--apply` the command prints the table and stops. With `--apply` it cuts
`chore/hitl-<recorded>-to-<latest>` off the current branch, runs the script, bumps the
manifest's `version` and `files`, rewrites the version line inside the README block, commits
`chore(hitl): <recorded> → <latest>`, pushes, and
opens the PR "hitl <recorded> → <latest>" through the shim, whose body lists every file and
its state and names any file carrying conflict hunks. With every file `unchanged` or `locally
edited`, `--apply` says "nothing to apply" and does nothing. When the marketplace clone lacks
the recorded tag the command stops with `claude plugin marketplace update hitl`.

### `/hitl:help`

`help.mjs` reads the tree and the manifest and prints one of six states, which partition every
tree, plus the prerequisite check; the prompt says the matching thing:

- **not installed** (no owned path, no manifest) → "run `/hitl:init`";
- **ejected, not adopted** (`.claude/agents/` and `HITL.md` present, no manifest) → "run
  `/hitl:init --adopt`";
- **partially installed** (some owned path, but not both of the above, no manifest) → "run
  `/hitl:init`; it lists what collides";
- **behind** (manifest version < plugin version) → "run `/hitl:diff`";
- **ahead** (manifest version > plugin version, a stale plugin cache) → "update the plugin";
- **up to date** → the chain in five lines, the four plugin commands and the six workflow
  commands, and "to change a rule: edit `HITL.md` or `.claude/` by PR, or `/hitl:customize`".

It always ends with the prerequisite table and which entries are missing, with `grill-me`
listed as recommended.

### `/hitl:customize`

A grill-style interview, one knob per turn, the treasury default and its reason offered as the
recommendation. Each knob has an id and one or more **anchors**: the HTML comment
`<!-- hitl:knob <id> -->` on the line immediately above the paragraph that states the rule,
in the templates and therefore in the installed files. Customize edits only anchored
paragraphs, every anchor of the knob together, writes to the working tree and never commits.

| id | anchored in | default and its reason |
|---|---|---|
| `review-rounds` | `HITL.md` § Gates ("Rounds") and § Review gates, every restatement; `review-spec` and `review-plan`, the round count and the round rule | 2 — one is too few, three chases non-deterministic findings |
| `severities` | the three reviewer agents, their severity definitions | blocker / major / minor |
| `reporting-cap` | the three reviewer agents; `HITL.md` § Review gates | every blocker, at most five majors, minors one line — a longer list is not read |
| `file-tripwire` | `HITL.md` § Delivery slices | ~20 files, a tripwire not a cap |
| `small-lane` | `HITL.md` § Delivery chain, the "no smaller lane" paragraph | none — size shrinks the artefact, never the gate |
| `effective-date-pilots` | the `effective-date` fragment | none until the humans name one |
| `local-gates` | `AGENTS.md` § Local gates | discovered at init |
| `pr-body-sections` | `HITL.md` § Pull requests; `implement-stack`, the PR body block | What / Why / How plus Review decisions |
| `scare-anchors` | `.claude/review-context.md` | treasury's ladder, 5 to 8 as placeholders |
| `testing-rules` | `HITL.md` § Testing and gates; the wipe workflow file | the choices made at init |

The severity *definitions* and the cap are knobs; the finding-type **names** are not. A rule
stated in more than one place is anchored at every place, and customize edits all of them;
the Rationalizations table is prose and carries no anchor.

`testing-rules` is the one knob that works by whole files rather than by paragraph: it adds
or removes fragments from the plugin's `templates/testing/` under `## Testing and gates`,
adds or removes the wipe workflow file, and updates `testing` and `ci` in the manifest. It is
the only case where customize writes the manifest; without that write `/hitl:diff` would
report `HITL.md` as locally edited forever.

**Load-bearing invariants** are listed in a short `## Load-bearing invariants` section of
`HITL.md` and refused by customize with "change it together with its parser, by PR": the
`**Reviewed:**` line, the `**Owns:**` line, the `Plan:` line, the spec and plan filename
patterns, the stack-table columns, the seven finding-type names (six plus DEFERRED), and the
`docs/superpowers/` path.

### This repository as a consumer

This repository's own `.claude/`, `HITL.md`, `scripts/hitl/` and wipe workflow are the render
of `templates/` with choices `provider: github`, `ci: github-actions`, `testing: []`, with one
exception: `.claude/review-context.md` is repo-specific by definition, this repository's copy
carries its own anchors, and it is expected to read `locally edited` in `/hitl:diff`. Its
manifest is produced by `/hitl:init --adopt` in slice 5, the last slice that changes a
template, so the hashes it records are final; until then the drift test states the choices
itself. Its `AGENTS.md` already names the local gates.

## Error handling

- **Init half-written.** The render script checks every collision before its first write and
  writes nothing on a failure before that point. A failure mid-write (disk, permissions) is
  reported with the files written so far; the human removes them and re-runs. Init is not
  transactional beyond that, and says so.
- **`settings.json` unparsable.** Parsed together with the collision check, before the first
  write; a parse error is reported and nothing is written, since the hook is core.
- **Discovery cannot read the remote.** `host: "unknown"`; init stops as for a non-GitHub host
  and says the remote could not be read.
- **Shim.** Every failure surfaces as exit `2` with the host tool's own message; no verb
  retries. Callers stop on `2` exactly as they stop on a `gh` failure today.
- **Diff without the recorded tag, or without a manifest.** Stops with the one-line remedy.
- **Customize asked to change an invariant.** Refuses with the PR route and changes nothing.

## Testing

Under vitest in `scripts/__tests__/`, fixtures under `scripts/__fixtures__/`. Tests that read
the disk never read `docs/superpowers/`.

- **Drift test.** Render the templates with this repository's choices and assert the result
  equals every owned file in this repository byte for byte, except
  `.claude/review-context.md`. A template edit without its twin fails the suite.
- **Init.** Temp git repositories: empty; one per owned-path collision; an existing
  `CLAUDE.md`; a `settings.json` with other hooks; a second run on an initialised repository;
  `--adopt` on an ejected tree. Assert the files, the appended blocks, the merge, the
  manifest and the refusals.
- **Discovery.** Fixture trees in, report out, one per detection rule and one empty tree.
- **Shim.** A fake `gh` on `PATH` that records its arguments and returns canned JSON; one test
  per verb for the normalised record and the exit code, plus the exit-3 path and a backend
  failure.
- **Diff.** A temp git repository standing in for the marketplace clone with two tagged
  versions; one test per state in the table and one conflict.
- **Knob anchors.** Every knob id in the table has at least one anchor in the templates and
  every anchor in the templates names a listed id.
- **Prompts** (the four plugin commands) are validated by a dry run on a fixture, as
  `AGENTS.md` says; they have no unit tests.
- **The plugin's own CI** runs `pnpm test` and `pnpm format:check`; it is configuration and is
  validated by a human watching it run.

## Delivery slices

Five slices, each one capability a test proves, stacked on `feat/hitl-v1`:

| N | label | owns | proof |
|---|---|---|---|
| 1 | `plugin-skeleton-and-init-core` | the plugin manifests; `templates/` cut generically from `.claude/`, with the doctrine changes listed in § Templates except the slice-5 ones; the shared installer module and `render.mjs`; `/hitl:init` taking its answers from flags; the manifest with every field (`testing` empty until slice 3 asks); the collision and manifest-present refusals; this repository's wipe script moved to `scripts/hitl/` | drift test green; init on an empty temp repo; refusals |
| 2 | `pr-shim` | `pr.sh`, the GitHub backend, and the three call sites rewritten to use the shim | fake-`gh` tests; no `gh pr` outside `backend.sh`; drift test |
| 3 | `discovery-and-interview` | `discover.mjs`; the five fragments and `## Testing and gates`; `## Local gates`; wipe-wrapper selection; the interview in `commands/init.md` producing `ci`, `testing` and `gates` | discovery fixtures; init with each answer |
| 4 | `adopt-diff-help` | `--adopt` and `adopt.mjs`; `diff.mjs` and `/hitl:diff` with `--apply`; `help.mjs` and `/hitl:help` | diff state tests; `--adopt` on a fixture ejected tree; help states |
| 5 | `customize` | the knob anchors in every template and in this repository's copies; the knob table and the invariants section in `HITL.md`; `commands/customize.md`; `--adopt` run on this repository and its manifest committed | anchor test; a dry run refusing an invariant; this repository's manifest exists and its diff reports every file unchanged except `review-context.md` |

Slice 1 crosses the twenty-file tripwire because cutting the templates moves eighteen files;
its plan's Global Constraints say so. No slice is split below the thinness floor to avoid it.

After slice 5, as acceptance steps rather than slices: tag `v0.1.0`; the proof (a throwaway
`hitl-proof` GitHub repository, a minimal Node app with one test, `/hitl:init` with discovery,
one boring two-slice feature from `/grill-me` through `/implement-stack` to the draft umbrella
PR, merge, wipe fires); then `/hitl:init --adopt` on treasury-2 and a reading of its drift.

## Acceptance criteria

1. `/hitl:init` on an empty GitHub repository with a test script writes every owned file, the
   four appended blocks, the merged hook and the manifest; a second run says "initialised at
   0.1.0; run `/hitl:diff`" and writes nothing.
2. `/hitl:init` on a repository with any owned path present lists the paths, offers `--adopt`
   or removal, and writes nothing.
3. The drift test passes on `main` of this repository after every slice.
4. Every shim verb returns the normalised record against the fake `gh`; `create` on an
   existing head exits 3 with the existing record; no template outside `backend.sh` mentions
   `gh pr`.
5. `diff.mjs` reports each of the seven states on the fixture marketplace, under vitest;
   `--apply` cutting the branch, bumping the manifest and opening one PR through the shim is
   proven by a dry run, since those steps are the prompt's.
6. `/hitl:init --adopt` on this repository, at the end of slice 5, writes a manifest whose
   `/hitl:diff` reports every file `unchanged` except `.claude/review-context.md`.
7. `/hitl:customize` refuses an invariant and edits every anchor of a knob it accepts; the
   anchor test passes.
8. The proof feature lands and the wipe job removes `docs/superpowers/` from `main`.

## Decisions and declined alternatives

- **An `npx` wizard instead of a plugin.** Declined: a plugin carries the four commands and
  can find its own templates; a wizard would need its own distribution and cannot be
  state-aware inside Claude Code.
- **A runtime plugin with config-driven knobs and an eject escape hatch.** Declined: the
  primary use is a company repository where guardrail changes go through PR review, not a
  plugin cache refresh. Eject *is* the install.
- **Installer in bash with `jq`.** Declined for JSON handling and test cost; `node` is the more
  likely prerequisite on a Claude Code machine. Recorded so that "why is the installer JS when
  the scripts are bash" has an answer.
- **Installer as prompt only.** Declined: manifest hashes must be exact for diff to work, and
  the installer would have no tests.
- **Placeholder syntax in templates.** Declined: same manifest and diff behaviour as
  composition, but templates stop being readable as the file they become and the engine grows.
  The wipe sentence was reworded rather than made a hole.
- **One full `HITL.md` per combination of choices.** Declined: 32 files differing by a
  paragraph.
- **Finding-type names as a customize knob.** Declined: the review commands parse them.
  Severity definitions and the cap are knobs; the names are invariants.
- **`.storybook/` in discovery.** Dropped: hitl ships no story rule, so a finding would have
  nothing to offer.
- **Init commits or opens the PR.** Declined: the human reads the render before it becomes a
  PR, and the first review of `.claude/` should be theirs.
- **`--adopt` recording the repository's own file hashes.** Declined: diff would then report
  an ejected repository as unchanged and hide the drift the adoption exists to reveal.
- **Installed scripts beside `scripts/wipe-superpowers-docs.sh` as today.** Declined for one
  owned directory, `scripts/hitl/`, so the collision check and ownership are a directory test.
- **Directory-level collision for `.claude/agents`, `commands` and `hooks`.** Declined in
  spec review round 1: it would block any repository with a custom command of its own.
  Those three collide by owned filename.
- **Changing a choice by re-adopting.** Declined in spec review round 1: adopt writes only the
  manifest, so a new fragment never reached `HITL.md`. Choices change through the
  `testing-rules` knob of `/hitl:customize`.
- *Forwarded to the plan gate:* in `/hitl:diff --apply`, write every file before calling the
  shim, since `scripts/hitl/pr.sh` may itself be among the files being applied.
