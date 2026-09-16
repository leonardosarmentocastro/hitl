# hitl

A Claude Code plugin that installs a human-in-the-loop delivery workflow into a repository:
brainstorm → spec → cold spec review → plans → cold plan review → handover → stacked slice
PRs, each implemented, reviewed and fixed by subagents, with a human deciding at every gate.

It is **installer-only**. Nothing runs from the plugin: `/hitl:init` writes the agents,
commands, hook, doctrine (`HITL.md`) and scripts into your repository, which owns them from
then on and changes them by pull request. `/hitl:diff` shows what changed upstream since.

Status: bootstrapped 2026-09-15 as an ejected copy of the workflow built in
[treasury-2](https://github.com/leonardosarmentocastro/treasury-2). The plugin itself is
being built with that workflow — see `HITL.md` and `docs/superpowers/`.

## Prerequisites

- Claude Code with the [superpowers](https://github.com/obra/superpowers) plugin (hard
  prerequisite — the chain starts with its `brainstorming` and `writing-plans` skills).
- Optionally, [Matt Pocock's skills](https://github.com/mattpocock/skills) for `/grill-me`,
  a good way to start a feature you cannot yet see the shape of.

## Developing

```
pnpm install
pnpm test
```

The plugin's own `.claude/` is rendered from `templates/`; `pnpm test` fails if the two
drift. Edit the template and its copy together.
