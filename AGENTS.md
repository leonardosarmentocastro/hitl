# hitl — agent working agreements

The workflow doctrine is `HITL.md`. This file holds what is specific to *this* repository:
a Claude Code plugin that installs that workflow into other repositories.

## What this repo is

- An **installer-only plugin** (shadcn model): it ships no runtime. `/hitl:init` writes the
  agents, commands, hook, doctrine and scripts *into* a target repository, which then owns
  them. This repository's own `.claude/` is the first consumer of its templates.
- Bootstrapped on 2026-09-15 as an ejected copy of `treasury-2`'s `.claude/` tooling.

## Local gates

- `pnpm test` — the script tests under `scripts/__tests__/` (the Stop hook, the wipe
  script, and every script this plugin installs). Run before a PR opens.
- `pnpm format:check` — Prettier, `printWidth: 100`; Markdown is never formatted (the
  prompts, doctrine and templates are read as instructions).

## Test-driven development, here

- Everything under `scripts/` and `.claude/hooks/` has behaviour of its own and is tested
  under `scripts/__tests__/`. Tests that read the disk use `scripts/__fixtures__/`, never
  `docs/superpowers/`, which the wipe deletes.
- Prompts (agents, commands) are validated by running them on a fixture under
  `.claude/fixtures/` (a dry run — see `/review-spec`), not by unit tests.
- Workflow YAML is validated by a human watching it run.
