# hitl — agent working agreements

The workflow doctrine is `.hitl/HITL.md`. This file holds what is specific to *this* repository:
a Claude Code plugin that installs that workflow into other repositories.

## What this repo is

- A plugin that installs (shadcn model): `/hitl:init` writes the agents, commands, hook,
  doctrine and scripts *into* a target repository, which then owns them. This repository's
  own `.claude/` is the first consumer of its templates.
- It also runs the workflow where nothing is installed: the plugin ships its own commands,
  agents, a hook, the scripts under `runtime/` and a no-install doctrine (`doctrine/HITL.md`),
  rendered from the same templates.
- Bootstrapped on 2026-09-15 as an ejected copy of `treasury-2`'s `.claude/` tooling.

<!-- hitl:start -->
<!-- hitl:knob local-gates -->
## Local gates

- `pnpm test`
- `pnpm format:check`
<!-- hitl:end -->

`pnpm test` runs the script tests under `scripts/__tests__/`: the Stop hook, the wipe builder,
the installer under `installer/`, every script this plugin installs, and the drift test that
proves this repository equals its own render. `pnpm format:check` is Prettier at
`printWidth: 100`; Markdown is never formatted, because the prompts, doctrine and templates
are read as instructions. Both run before a PR opens.

**Refreshing this repository's manifest.** A change under `templates/` changes the render, so
the self-manifest test fails until `.hitl/manifest.json` is regenerated. `adopt.mjs` refuses
while a manifest exists, so delete it first; from the repository root:

```bash
rm .hitl/manifest.json
node --input-type=module -e 'import { THIS_REPO_CHOICES as c } from "./installer/lib.mjs"; console.log(JSON.stringify(c))' > /tmp/hitl-answers.json
node installer/adopt.mjs --repo . --plugin-root . --answers /tmp/hitl-answers.json
```

Commit the regenerated manifest with the template change.

**Refreshing the plugin's no-install files.** The same template change also changes what the
plugin ships for no-install mode (`doctrine/HITL.md` and the other entries of `pluginFiles()`),
so the plugin-drift test fails until they are rendered again; from the repository root:

```bash
node installer/render-plugin.mjs --plugin-root .
```

**Releasing.** Releases are automatic; never raise a version by hand below 1.0. On every push
to `main`, `release-prepare` (`.github/workflows/`, `scripts/release.mjs prepare`) looks at the
pull requests merged into `main` since the tag of the current version. The head branch prefix
decides: any `feat/` branch → a minor release, only `fix/` branches → a patch, anything else
(`docs/`, `chore/`) → no release. It then raises `version` in `.claude-plugin/plugin.json`,
`.claude-plugin/marketplace.json` and `.hitl/manifest.json`, writes a `## <version>` section
into `CHANGELOG.md` and commits `chore(release): <version>`.

- **The pull request title is the release note.** `/hitl:diff` prints it to every installed
  repository, so the title of a pull request into `main` says, in plain words, what changes
  for a user.
- `## Unreleased` in `CHANGELOG.md` is optional: text written there by hand (an upgrade
  instruction a title cannot carry) is moved into the next release's section. It never
  causes a release.
- Merge the wipe pull request and the pull request into `main` with a merge commit, never
  squashed or rebased: the wipe commit carries `[skip ci]`, and a push whose head commit
  carries it starts no release run. If a release was skipped, start `release-prepare` from
  the Actions tab.

## Test-driven development, here

- Everything under `scripts/`, `installer/`, `runtime/` and `.claude/hooks/` has behaviour of its own
  and is tested under `scripts/__tests__/`. `templates/` is tested by the drift test: this
  repository's own `.claude/`, `.hitl/HITL.md` and `scripts/hitl/` must equal what
  `installer/` renders from `templates/` with this repository's choices, except
  `.hitl/review-context.md`, which is repo-specific. Tests that read the disk use temp
  directories or `scripts/__fixtures__/`, never `docs/superpowers/`, which the wipe deletes.
- Prompts (agents, commands) are validated by running them on a fixture under
  `.claude/fixtures/` (a dry run — see `/review-spec`), not by unit tests.
- Workflow YAML is validated by a human watching it run.
