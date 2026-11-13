---
description: Start a hitl design session in any repository — its own worktree on a feature branch, then the superpowers brainstorming skill under the hitl doctrine. Where hitl is not installed, the doctrine comes from the plugin and the project's conventions from memory on this machine. Usage: /hitl:brainstorming <what to design>
argument-hint: <what to design>
---

You are starting a hitl design session for: $ARGUMENTS

This command is the entry point in any repository. Where hitl is installed (`/hitl:init`
ran), it follows that repository's own rules. Where it is not, nothing hitl-owned is
committed to the repository: the doctrine ships with this plugin, and what the user teaches
hitl about this project lives on this machine. You orchestrate and ask; the scripts read and
write.

## 1. Prerequisites — before anything is created; stop on the first one missing

Check, in one batch:

```bash
node --version            # 20 or newer
git --version
```

and that superpowers is enabled: `enabledPlugins` in `~/.claude/settings.json` or in this
repository's `.claude/settings.json` contains a key starting with `superpowers@`. If it does
not, stop and print exactly:

```
hitl needs the superpowers plugin (its brainstorming and writing-plans skills shape the
artefacts this workflow reviews). Install it, then re-run /hitl:brainstorming:
  claude plugin marketplace add obra/superpowers-marketplace
  claude plugin install superpowers@superpowers-marketplace
```

For `node` or `git` missing, stop and name the one to install.

## 2. Mode

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/context.mjs" --repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}"
```

Exit `2` → this folder is not a git repository (or hitl could not read it): say so, with
its `error`, and stop. Otherwise read the JSON. A `base: null` with a `baseError` is not a
failure here — step 4 resolves the base and stops there if it cannot:

- **`mode: "installed"`** → say exactly, as your first line:

  ```
  hitl is installed here — following this repository's rules.
  ```

  Read the repository's `HITL.md`, create the worktree as it prescribes, invoke the
  superpowers brainstorming skill with `$ARGUMENTS`, and follow the repository's doctrine,
  commands and agents from there. Read nothing from this plugin's doctrine, write no
  active-feature record and read no project memory. This command's own steps end here.
- **`host` other than `github`** → say exactly, once:

  ```
  Design session only here: opening PRs needs https://github.com/leonardosarmentocastro/hitl/issues/19.
  ```

  and continue; `gh` is not required here.
- **`host: "github"`** → also require `gh auth status` to succeed; if it does not, stop and
  name `gh` (installed and signed in) as what is missing.

## 3. Doctrine

Read the file at the JSON's `doctrine` path in full. It is the hitl doctrine for this
session and governs everything after this step; where this command and the doctrine
differ, the doctrine wins.

## 4. Worktree

The base branch is never assumed. First:

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/session.mjs" base --repo "$PWD"
```

If it exits non-zero, say `cannot resolve the default branch: <its error>` and stop — never
assume one. Otherwise use its `base` wherever the procedure branches from the base
(`<base>`). Then run the doctrine's § Feature branches worktree procedure — including its
*Already in this topic's worktree* and *Collision* cases; do not improvise another one.
Once the session is in the topic's worktree — created now, already there, or an existing
one the human chose to reuse — register it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/session.mjs" start --worktree "<absolute worktree path>" --topic "<topic>" --base "<base>"
```

This writes the active-feature record and adds `.claude/worktrees/` and `.claude/reviews/`
to the clone's `.git/info/exclude`, so neither shows in `git status`.

## 5. Memory

From the step 2 JSON:

- `skipped` not empty → name those files: they are in the project memory folder
  (`memoryDir`) but are not valid facts, so they are ignored until fixed by hand.
- `gates` is `null` → run the doctrine's § Project memory, *Confirming gates*, with
  `${CLAUDE_PLUGIN_ROOT}` as `<Plugin root>`: discovery is
  `node "${CLAUDE_PLUGIN_ROOT}/installer/discover.mjs" --repo "$PWD"` and the save is
  `node "${CLAUDE_PLUGIN_ROOT}/runtime/memory.mjs" write --repo "$PWD" --name gates --type gates …`
  as the doctrine gives it. Do not start the design session without a confirmed answer —
  a list of gates, or "this repository has no gates".

## 6. Remembering

The doctrine's § Project memory, *Remembering*, applies for the whole session: whenever the
human states something specific to this project, ask once, verbatim,
`Remember this for this project?` — and write nothing to memory unless they say yes.

## 7. Design session

Print the hitl context block for the session and keep it in view — the doctrine refers to
its lines (`Plugin root`, `Base`, the gates, the project memory):

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/context.mjs" --repo "<absolute worktree path>" --plugin-root "${CLAUDE_PLUGIN_ROOT}" --format brief
```

Then invoke the superpowers brainstorming skill with `$ARGUMENTS`, under the doctrine. The
project memory facts are this project's conventions and context for the design.
