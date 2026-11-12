# `/hitl:brainstorming` — the hitl workflow without installing it in the repository

**Status:** draft, awaiting review
**Branch:** `feat/hitl-command`

## Intent

hitl today is installer-only: `/hitl:init` writes the agents, commands, Stop hook, doctrine
and scripts into a repository, which then owns them. Some repositories cannot take that
install — no permission to commit tooling, a team that has not agreed to it, a client
project. The author ran the workflow by hand on such a project (GitLab, 13 stacked slices
and an umbrella MR). It worked, but only because a hand-written handover document stood in
for `/implement-stack`, `/review-slice`, `/umbrella-pr` and the PR script, pointed agents at
prompt files in a local hitl clone by absolute path, and the author re-explained the
project's PR conventions in every new session.

This feature adds a **no-install mode**: the same chain, run entirely from the plugin that
is already installed per user, with nothing hitl-owned committed to the target repository
except the transient feature documents the chain has always committed.

`/hitl:brainstorming` is the entry point, used in place of `/superpowers:brainstorming`.

## What must survive the move (the reason hitl exists)

1. A design session in its own worktree on a feature branch.
2. Spec → `/review-spec` (≤ 2 rounds, triage, human answers YOUR CALL) → human approval →
   slice plans → `/review-plan` (≤ 2 rounds, bubble-up) → handover document → the session
   ends with a launch line.
3. A second session that runs, per slice, implementer → one slice review → fixer → draft PR
   stacked on its parent, then a draft umbrella PR, and stops. Nothing merges.
4. The Stop hook guard: a turn cannot end while a spec or plan lacks its `**Reviewed:**` line.

## Goals

- **G1.** A user with the hitl plugin installed (user scope) can run the full chain in any
  GitHub repository by typing `/hitl:brainstorming`, without `/hitl:init` and without
  committing `HITL.md`, `.claude/agents`, `.claude/commands`, `.claude/hooks`, `scripts/hitl`
  or any settings change to the repository.
- **G2.** Per-project knowledge (local gates, reviewer context, PR conventions, quirks such as
  a branch-name length cap) is remembered on the user's machine and applied on every later
  run in that repository, so the user never re-explains it.
- **G3.** The handover is the same structured document `/implement-stack` reads today, and
  the launch line runs the plugin's own implementation command.
- **G4.** Every slice PR and the umbrella PR open with a **TL;DR** (What / Why / How in plain
  words). This applies to both modes.
- **G5.** The transient documents are removed from the feature branch before it merges
  without a CI job and without the human deleting them by hand, and a copy is kept on the
  user's machine for later reference.

## Non-goals

- **GitLab.** No-install mode ships GitHub-only. GitLab is issue #19.
- **ADRs.** Distilling decisions into `docs/adr/` is issue #20.
- **Replacing `/hitl:init`.** The installed mode stays as it is and is the recommended path
  where a team accepts it. Both modes coexist.
- **Syncing memory across machines.** The memory lives on one machine; the user may version
  `~/.hitl/` themselves.
- **Project-specific proof artefacts** (before/after screenshots, a Figma-vs-markup table).
  These are not built into hitl; they are exactly what per-project memory (G2) is for.
- **Auto-launching the implementation session** (issue #10).

## Anti-goals (a failure even if it technically works)

- The plugin's Stop hook blocks a session in a repository, or on a branch, that is not
  running a no-install hitl feature. A user running plain `/superpowers:brainstorming`
  elsewhere must never be gated.
- No-install mode leaves untracked hitl files in the repository's working tree that show up
  in `git status` (worktrees, review output).
- The no-install prompts drift from the installed-mode templates, so the two modes run
  different workflows. One source of truth.
- Memory is written silently. A fact enters project memory only after the user agrees.
- The wipe deletes a plan that a later slice still needs (see § Wipe slice).

## Decisions made with the author

### D1. Both modes, one plugin

No-install commands ship in the existing `hitl` plugin, namespaced like its other commands:
`/hitl:brainstorming`, `/hitl:review-spec`, `/hitl:review-plan`, `/hitl:handover`,
`/hitl:implement-stack`, `/hitl:review-slice`, `/hitl:umbrella-pr`. Their agents ship as
plugin agents (`hitl:spec-reviewer`, `hitl:plan-reviewer`, `hitl:handover`,
`hitl:implementer`, `hitl:slice-reviewer`, `hitl:fixer`). In a repository that ran
`/hitl:init`, the repository's own unprefixed commands and agents keep working and are what
that repository's doctrine names.

### D2. Project memory lives in `~/.hitl/projects/<key>/`

- **Key:** the normalized git remote — `upstream` if present, else `origin` — as
  `<host>/<owner>/<repo>`, lowercase, without scheme, user, port or `.git`
  (`git@github.com:Acme/API.git` → `github.com/acme/api`). No remote → `local/<basename of the
  main checkout>`.
- **Worktrees and clones share it.** The key is computed from the main repository
  (`git rev-parse --git-common-dir`), so every worktree of a repository, and every clone of
  the same remote, reads the same memory.
- **Format:** one markdown file per fact with the same frontmatter shape as Claude Code's
  auto-memory (`name`, `description`, `metadata.type`), plus an index `MEMORY.md` with one
  line per file. Humans read and edit it by hand.
- **Outside the plugin directory**, so plugin updates never touch it.
- **Written only with consent.** When the user states something project-specific during a
  hitl session ("always add before/after screenshots", "the gate is `npm run verify`"), the
  command asks once whether to remember it for this project, then writes it.
- **Read at the start** of every no-install command, and its relevant parts passed to every
  agent brief (see D4).

Prior art checked: `akitaonrails/ai-memory` keys projects by the normalized remote, follows
`--git-common-dir` for worktrees and keeps human-editable markdown as source of truth. hitl
takes those three ideas and none of its server, capture hooks, index or decay.

### D3. Feature documents: committed on the branch, archived, wiped by a last slice

1. **During the feature** the spec, plans and handover are committed on the feature branch
   under `docs/superpowers/` exactly as today: PRs carry a `Plan:` line, and the umbrella PR
   always has a diff.
2. **Archive.** `/hitl:implement-stack` copies `docs/superpowers/` for the feature to
   `~/.hitl/projects/<key>/features/<feature>/` each time it builds the wipe slice, so the
   archive always holds the latest version.
3. **Wipe slice.** The last row of every no-install stack is a wipe slice: a branch holding
   exactly one commit that deletes the feature's files under `docs/superpowers/`.
   - It is **rebuilt, never edited**: on every run and every resume, `/hitl:implement-stack`
     deletes the wipe branch and cuts it again from the current last slice (or the feature
     branch, once every slice has merged into it). A reworked stack, a new slice or a
     changed plan therefore can never be deleted by an earlier slice and re-added by a later
     one: the delete exists only at the tip.
   - It gets no implementer, no review and no fixer. Its PR is a draft like every other,
     refreshed (same branch, same PR) when the branch is rebuilt.
   - It is a deterministic script with tests, not an agent.
   - Rebuilding force-pushes the wipe branch. This is the one exception to "never
     force-push unasked": the branch holds no human or agent work, only the generated
     delete. Every other branch keeps the existing rule.

### D4. Repository standards come from memory, not from files in the repository

Installed-mode prompts read `HITL.md`, `AGENTS.md` § Local gates, `CONTEXT.md` and
`.claude/review-context.md` from the repository. In no-install mode:

| Installed mode reads | No-install mode reads |
|---|---|
| `HITL.md` (repo root) | the plugin's own copy of the doctrine (`${CLAUDE_PLUGIN_ROOT}`) |
| `AGENTS.md` § Local gates | the `gates` fact in project memory; the repository's own `AGENTS.md`/`CLAUDE.md` are still read as the repository's standards when present |
| `CONTEXT.md` | `CONTEXT.md` if the repository has one (it is the repository's, not hitl's) |
| `.claude/review-context.md` | the reviewer-context facts in project memory |
| `scripts/hitl/pr.sh` | the plugin's PR shim, run from `${CLAUDE_PLUGIN_ROOT}` |

On the first `/hitl:brainstorming` in a repository with no memory, the command finds the
likely local gates (the plugin's existing discovery, `installer/discover.mjs`), proposes them,
asks the user to confirm or correct, and saves them. A run with no confirmed gate does not
start the design session.

### D5. The Stop hook is shipped by the plugin, and limited

The plugin declares a `Stop` hook. It acts only when **all** of these hold, and exits 0
otherwise:

- the session's git root is not an installed-mode repository (no `.claude/hitl.json`) —
  there the repository's own hook already runs;
- project memory records an active no-install feature whose branch is the current branch,
  or whose worktree is the session's git root.

When it acts, it enforces exactly what the installed hook enforces (same `**Reviewed:**`
header rule, same message, pointing at the `/hitl:` command names).

### D6. Worktrees and review output never show in `git status`

The design session's worktree stays at `<main checkout>/.claude/worktrees/<topic>` (where
`EnterWorktree` accepts it), and review output stays under `.claude/reviews/`. Both paths
are added to the repository's `.git/info/exclude` — local to the clone, never committed —
instead of `.gitignore`.

### D7. The TL;DR in PR bodies (both modes)

Slice and umbrella PR bodies begin with a `## TL;DR` section holding the existing What / Why
/ How lines, in the newcomer register the doctrine already requires. Project memory may add
sections after it (the author's frontend project adds before/after screenshots and a
measured table); hitl ships none of those.

### D8. The launch line

The handover ends the design session with:

```
cd <main checkout>/.claude/worktrees/<topic> && claude --model opus
/hitl:implement-stack docs/superpowers/handover/<feature>.md
```

## Constraints

- **One source of truth for prompts.** The no-install commands and agents are generated from
  `templates/` and checked in under the plugin's own directories; a drift test proves they
  equal the render, as this repository's `.claude/` already is proved against its render.
  Changing a template changes both modes.
- **Load-bearing invariants are unchanged** (`HITL.md` § Load-bearing invariants):
  `**Reviewed:**`, `**Owns:**`, `Plan:`, filename patterns, stack-table columns, the seven
  finding types, the `docs/superpowers/` path. The wipe slice is a stack-table row like any
  other.
- **Prerequisites** are the installed mode's: `node` ≥ 20, `git`, `gh` authenticated, the
  superpowers plugin (its brainstorming and writing-plans skills). `/hitl:brainstorming`
  checks them before creating the worktree and names what is missing.
- **TDD per `AGENTS.md`:** the memory key and store, the limited Stop hook, the wipe-slice
  builder and the generator are scripts with tests under `scripts/__tests__/`. The prompts
  are validated by a dry run on a fixture.
- **No-install mode never writes** to the target repository outside the feature branch's
  `docs/superpowers/` files and `.git/info/exclude`.

## Delivery slices (proposed; the plans decide)

1. **Project memory + entry point.** The key and store scripts; `/hitl:brainstorming` checks
   prerequisites, creates and locks the worktree, excludes the hitl paths, loads or seeds
   memory (gates confirmed with the user), then runs the superpowers brainstorming skill
   under the doctrine. Owns: starting a no-install design session that remembers the project.
2. **No-install design loop.** Generator + drift test for the plugin's commands and agents;
   `/hitl:review-spec`, `/hitl:review-plan`, `/hitl:handover` and the reviewer and handover
   agents read standards per D4; the launch line per D8. Owns: a design session from spec to
   handover with nothing installed.
3. **Limited Stop hook.** Owns: the review guard in no-install sessions, silent everywhere
   else.
4. **No-install implementation session.** `/hitl:implement-stack`, `/hitl:review-slice`,
   `/hitl:umbrella-pr`, implementer and fixer agents, the PR shim from the plugin root, and
   the TL;DR (D7) in both modes' PR bodies. Owns: stacked draft PRs from a handover with
   nothing installed.
5. **Archive + wipe slice.** Owns: the feature documents leave the branch, and are kept on
   the machine, with no CI job.

## Calls made by the designer (not yet confirmed by the author)

- D4's table: which file each installed-mode read maps to; the first-run gate discovery.
- D6: `.git/info/exclude` instead of `.gitignore`.
- D7: TL;DR applies to the installed mode too (a template change).
- D3: the wipe-branch force-push exception.
- The delivery-slice cut above.

## Left to the builder

- The generator's mechanism (a mode in `installer/lib.mjs`'s render, or a separate script)
  and where the rendered prompts live in the plugin tree, within the plugin's directory
  conventions.
- How a memory fact is classified (gate, reviewer context, PR section, quirk) and the exact
  file names, within D2's format.
- How "active no-install feature" is recorded in memory for the Stop hook (D5) and when it
  is cleared (`/hitl:cleanup` is the natural place).
- The wipe slice's branch name, within the existing slice naming rule.
- Whether `/hitl:help` reports no-install state; nice to have, not required.
