# Handover — hitl-v1

Launch: `claude --model opus` then `/implement-stack docs/superpowers/handover/hitl-v1.md`
Mode: start
Feature branch: feat/hitl-v1
Spec(s): docs/superpowers/specs/2026-09-16-hitl-v1-design.md

## Stack

| slice | plan | branch | parent | status | owns |
|---|---|---|---|---|---|
| 1 | docs/superpowers/plans/2026-09-16-hitl-v1-slice-1-plugin-skeleton-and-init-core.md | feat/hitl-v1-slice-1-plugin-skeleton-and-init-core | feat/hitl-v1 | open #1 | the plugin manifests; `templates/` cut generically from `.claude/` with the slice-1 doctrine changes; the shared installer module and `render.mjs`; `/hitl:init` taking its answers from flags; the manifest with every field; the collision and manifest-present refusals; this repository's wipe script moved to `scripts/hitl/`; this repository's `AGENTS.md` naming `installer/` and `templates/` as tested code. |
| 2 | docs/superpowers/plans/2026-09-16-hitl-v1-slice-2-pr-shim.md | feat/hitl-v1-slice-2-pr-shim | feat/hitl-v1-slice-1-plugin-skeleton-and-init-core | open #2 | `scripts/hitl/pr.sh`, the GitHub backend, and the three call sites (`/implement-stack`, `/umbrella-pr`, the handover agent) rewritten to use the shim. |
| 3 | docs/superpowers/plans/2026-09-16-hitl-v1-slice-3-discovery-and-interview.md | feat/hitl-v1-slice-3-discovery-and-interview | feat/hitl-v1-slice-2-pr-shim | open #3 | `discover.mjs`; the five testing fragments and `## Testing and gates` in `HITL.md`; `## Local gates` in `AGENTS.md`; wipe-wrapper selection; the interview in `commands/init.md` producing `ci`, `testing` and `gates`; the `AGENTS.md` hitl block, in this repository too. |
| 4 | docs/superpowers/plans/2026-09-16-hitl-v1-slice-4-adopt-diff-help.md | feat/hitl-v1-slice-4-adopt-diff-help | feat/hitl-v1-slice-3-discovery-and-interview | open #4 | `--adopt` and `adopt.mjs`; `diff.mjs` and `/hitl:diff` with `--apply`; `help.mjs` and `/hitl:help`. |
| 5 | docs/superpowers/plans/2026-09-16-hitl-v1-slice-5-customize.md | feat/hitl-v1-slice-5-customize | feat/hitl-v1-slice-4-adopt-diff-help | open #5 | the knob anchors in every template and in this repository's copies; the knob table and the `## Load-bearing invariants` section in `HITL.md`; `commands/customize.md` and the `customize-testing.mjs` script behind its `testing-rules` knob; `--adopt` run on this repository and its manifest committed. |

## Umbrella PR body

Plan: docs/superpowers/specs/2026-09-16-hitl-v1-design.md

**What** — A Claude Code plugin, `hitl`, that installs the human-in-the-loop delivery workflow into any GitHub-hosted repository. One command copies the six agents, six commands, the Stop hook, the doctrine, a PR shim and the wipe script into the target repository, which owns them from then on. The plugin keeps four commands of its own: init (with an adopt mode for repositories that already carry the files), diff, help and customize.

**Why** — The workflow was built inside one product repository and could only be copied by hand, file by file, with no record of which version was copied or what was changed afterwards. Every repository that wants the same review gates, stacked slices and delivery discipline needs the same files, and the doctrine needs to move to new repositories without dragging that product's stack along with it. A plugin with a recorded install makes the workflow reusable, versionable and diffable.

**How** — The plugin ships no runtime: after install nothing in the target repository reads the plugin or its manifest, so the workflow keeps running even if the plugin is removed, and changes to the guardrails go through ordinary pull requests. Every installed file is a finished template; per-repository variation comes from choosing which files to install and which testing fragments to append to the doctrine, never from substitution inside a file, so the installer can rebuild exactly what it wrote and report drift against it. A small manifest records the plugin version, the choices made and a hash per owned file, which is what diff and help read. The one place the workflow talks to a code host is a small shell shim with a swappable backend, so a later GitLab or Bitbucket backend does not touch the agents or commands. The installer is written in Node because it must merge JSON settings and hash files, while the installed scripts stay bash so a repository without Node can run them. This repository is itself the first consumer: its own workflow files are the render of the templates, and a drift test keeps them identical.

## Slices

<!-- stack -->
| slice | title | PR |
|---|---|---|
| 1 | plugin skeleton and init core | — |
| 2 | pr shim | — |
| 3 | discovery and interview | — |
| 4 | adopt, diff and help | — |
| 5 | customize | — |
<!-- /stack -->

## Notes

Spec, plans and this document are transient and are removed from `main` after merge. This
description is the durable record.
