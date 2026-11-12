# `/hitl:brainstorming` — the hitl workflow without installing it in the repository

**Status:** draft, awaiting review
**Reviewed:** round 1 (2026-11-12).
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
- The wipe deletes a plan that a later slice still needs (see D3).

## Decisions made with the author

### D1. Both modes, one plugin

No-install commands ship in the existing `hitl` plugin, namespaced like its other commands:
`/hitl:brainstorming`, `/hitl:review-spec`, `/hitl:review-plan`, `/hitl:handover`,
`/hitl:implement-stack`, `/hitl:review-slice`, `/hitl:umbrella-pr`. Their agents ship as
plugin agents (`hitl:spec-reviewer`, `hitl:plan-reviewer`, `hitl:handover`,
`hitl:implementer`, `hitl:slice-reviewer`, `hitl:fixer`).

**In a repository that ran `/hitl:init`** (detected by `.claude/hitl.json`):

- **The entry point adapts.** `/hitl:brainstorming` is the one command a user can type in any
  repository. Here it says so in its first line ("hitl is installed here — following this
  repository's rules"), creates the worktree as the repository's `HITL.md` prescribes, and
  runs the design session under the repository's own doctrine, commands and agents. It reads
  nothing from the plugin's doctrine.
- **Project memory is not applied.** The repository's `AGENTS.md` and
  `.claude/review-context.md` are the only source of standards, so one contributor's PRs do
  not differ from another's. No active-feature record is written (the repository's own hook
  gates the session).
- **The other six `/hitl:` workflow commands refuse** with one line naming the repository's
  unprefixed command. The repository's doctrine names those, and the agent and the launch
  line use them; a command with two behaviours would hide which one failed.
- **Version skew is accepted.** The repository may carry an older hitl than the plugin;
  following the repository's files is correct, and `/hitl:diff` is the upgrade path.

### D2. Project memory lives in `~/.hitl/projects/<key>/`

- **Key:** the normalized git remote — `upstream` if present, else `origin` — as
  `<host>/<owner>/<repo>`, lowercase, without scheme, user, port or `.git`
  (`git@github.com:Acme/API.git` → `github.com/acme/api`). No remote → `local/<basename of the
  main checkout>`. Two clones of one project where only one has an `upstream` remote (a
  fork workflow) get different keys; accepted.
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

### D3. Feature documents: committed on the branch, archived, wiped by a last branch

1. **During the feature** the spec, plans and handover are committed on the feature branch
   under `docs/superpowers/` exactly as today: PRs carry a `Plan:` line, and the umbrella PR
   always has a diff.
2. **The feature's documents** are the files under `docs/superpowers/` that the feature
   branch adds relative to its merge-base with the base branch. Nothing else under that
   path is archived or deleted.
3. **Archive.** `/hitl:implement-stack` and `/hitl:umbrella-pr` copy the feature's documents
   to `~/.hitl/projects/<key>/features/<feature>/` on every run. An edit made after the last
   run of either is not archived; accepted.
4. **Wipe branch.** After the last slice and before the umbrella PR,
   `/hitl:implement-stack` builds `<feature branch>-wipe`: a branch holding exactly one
   commit that deletes the feature's documents, with a draft PR against its parent.
   - It is **not a stack-table row and has no plan.** The handover agent never writes it;
     the stack table, the `**Owns:**` parser and the `Plan:` parser never see it. Its PR
     body carries, in place of the `Plan:` line, one sentence saying it is generated and
     must merge last.
   - Its parent is the last slice's branch, or the feature branch once every slice has
     merged into it.
   - It is **rebuilt, never edited**: on every run and every resume the branch is reset in
     place to its parent's tip plus the one delete commit, force-pushed, and its PR's base
     re-targeted if the parent changed. The branch is never deleted on the remote (that
     would close the PR). A reworked stack, a new slice or a changed plan therefore can
     never be deleted by an earlier branch and re-added by a later one: the delete exists
     only at the tip.
   - It gets no implementer, no review and no fixer.
   - It is a deterministic script with tests, not an agent.
   - Rebuilding force-pushes the wipe branch. This is the one exception to "never
     force-push unasked": the branch holds no human or agent work, only the generated
     delete. Every other branch keeps the existing rule.
   - The umbrella PR body names the wipe PR as **required before merge**. Merging stays the
     human's act, as everything else in the stack.

### D4. Repository standards come from memory, not from files in the repository

Installed-mode prompts read `HITL.md`, `AGENTS.md` § Local gates, `CONTEXT.md` and
`.claude/review-context.md` from the repository. In no-install mode:

| Installed mode reads | No-install mode reads |
|---|---|
| `HITL.md` (repo root) | the **no-install doctrine** shipped in the plugin (`${CLAUDE_PLUGIN_ROOT}`), below |
| `AGENTS.md` § Local gates | the `gates` fact in project memory; the repository's own `AGENTS.md`/`CLAUDE.md` are still read as the repository's standards when present |
| `CONTEXT.md` | `CONTEXT.md` if the repository has one (it is the repository's, not hitl's) |
| `.claude/review-context.md` | the reviewer-context facts in project memory |
| `scripts/hitl/pr.sh` | the plugin's PR shim, run from `${CLAUDE_PLUGIN_ROOT}` |

**The no-install doctrine.** `templates/HITL.md` stays the single source. The generator
renders two outputs from it: the installed doctrine `/hitl:init` writes (unchanged by this,
except the two edits named below) and a no-install doctrine checked in inside the plugin.
The parts that differ are marked in the template and are, at least: every command and agent
name (`/hitl:` prefix); § Where things live; the Stop hook paragraph (who declares it, when
it acts — D5); the worktree bullet's ignore wording (D6); how specs and plans leave the
branch (D3, replacing the workflow / by-hand sentence); where local gates and reviewer
context come from (this table). The load-bearing invariants section is identical in both.
It ships with the plugin, not under `~/.hitl/`: it must change together with the commands
that read it, and it is not user-editable — project-specific rules belong in memory.

Two edits reach the installed doctrine and so every consuming repository through
`/hitl:diff`: the TL;DR (D7), and the sentence that `.claude/hitl.json` is "read by nothing
at run time", which becomes: its presence tells the plugin's commands and Stop hook that the
repository is installed.

On the first `/hitl:brainstorming` in a repository with no memory, the command finds the
likely local gates (the plugin's existing discovery, `installer/discover.mjs`), proposes them,
asks the user to confirm or correct, and saves them. "This repository has no gates" is a
confirmable answer and is saved as such. A run with no confirmed answer does not start the
design session.

### D5. The Stop hook is shipped by the plugin, and limited

The plugin declares a `Stop` hook. It acts only when **all** of these hold, and exits 0
otherwise:

- the session's git root is not an installed-mode repository (no `.claude/hitl.json`) —
  there the repository's own hook already runs;
- project memory holds an **active-feature record** whose worktree path is the session's
  git root and whose branch is the current branch, and that worktree path still exists.

The record is written by `/hitl:brainstorming` at the moment it creates the worktree (so the
guard is live for the whole design session), as `{ worktree path, branch, feature }`. It is
keyed by worktree path, so another clone of the same remote on a same-named branch is never
gated. It is cleared by `/hitl:cleanup` when it removes the worktree; a record whose
worktree path no longer exists is ignored and may be pruned by any no-install command.

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
measured table); hitl ships none of those. This is an installed-mode template change too:
this repository's manifest is regenerated with it (`AGENTS.md`), and consuming repositories
receive it through `/hitl:diff`.

### D8. The launch line

The handover ends the design session with:

```
cd <main checkout>/.claude/worktrees/<topic> && claude --model opus
/hitl:implement-stack docs/superpowers/handover/<feature>.md
```

## Constraints

- **One source of truth for prompts.** The no-install commands, agents and doctrine are generated from
  `templates/` and checked in under the plugin's own directories; a drift test proves they
  equal the render, as this repository's `.claude/` already is proved against its render.
  Changing a template changes both modes.
- **Load-bearing invariants are unchanged** (`HITL.md` § Load-bearing invariants):
  `**Reviewed:**`, `**Owns:**`, `Plan:`, filename patterns, stack-table columns, the seven
  finding types, the `docs/superpowers/` path. The wipe branch is outside the stack table
  (D3), so no parser changes for it.
- **Prerequisites** are the installed mode's: `node` ≥ 20, `git`, `gh` authenticated, the
  superpowers plugin (its brainstorming and writing-plans skills). `/hitl:brainstorming`
  checks them before creating the worktree and names what is missing.
- **TDD per `AGENTS.md`:** the memory key and store, the limited Stop hook, the wipe-branch
  builder and the generator are scripts with tests under `scripts/__tests__/`. The prompts
  are validated by a dry run — and because this repository is itself an installed-mode
  repository, each slice's dry run happens in a **scratch git repository with no hitl
  files**. What to observe there: `git status` shows no hitl file, tracked or untracked;
  the Stop hook blocks an unreviewed spec there and nowhere else; gates and reviewer
  context come from memory and the doctrine and PR shim from the plugin root (D4).
- **No-install mode never writes a tracked file** in the target repository other than the
  feature's documents under `docs/superpowers/`. Its untracked files are the worktree and
  the review output (D6), hidden through `.git/info/exclude`.

## Decisions and declined alternatives

Review round 1 (2026-11-12):

- *Forwarded to the plan gate:* memory facts passed into agent briefs are marked as
  untrusted data, as the other ground-truth files are.
- Declined — the wipe as a stack-table row: it has no plan, `Owns:` or `Plan:` line, so it
  would change three parsers. It is a generated branch instead (D3).
- Declined — `/hitl:brainstorming` refusing in an installed repository: the author wants one
  entry point usable anywhere (D1).
- Declined — all seven commands adapting to installed mode: two behaviours per command (D1).
- Declined — one doctrine in mode-neutral wording: vaguer instructions, and a rewrite pushed
  to every installed repository (D4).
- Declined — the no-install doctrine at `~/.hitl/HITL.md`: it would not update with the
  plugin's commands (D4).
- Out of scope — moving the installed `HITL.md` into `.hitl/`: issue #21.

## Delivery slices (proposed; the plans decide)

1. **Project memory + entry point.** The key and store scripts; `/hitl:brainstorming` checks
   prerequisites, creates and locks the worktree, writes the active-feature record (D5),
   excludes the hitl paths, loads or seeds
   memory (gates confirmed with the user), then runs the superpowers brainstorming skill
   under the doctrine; in an installed repository it follows the repository's rules instead
   (D1). Owns: starting a design session from one command in any repository, remembering
   the project where nothing is installed.
2. **No-install design loop.** Generator + drift test for the plugin's commands, agents and
   no-install doctrine; the six commands' installed-repository refusal (D1);
   `/hitl:review-spec`, `/hitl:review-plan`, `/hitl:handover` and the reviewer and handover
   agents read standards per D4; the launch line per D8. Owns: a design session from spec to
   handover with nothing installed.
3. **Limited Stop hook.** Owns: the review guard in no-install sessions, silent everywhere
   else.
4. **No-install implementation session.** `/hitl:implement-stack`, `/hitl:review-slice`,
   `/hitl:umbrella-pr`, implementer and fixer agents, the PR shim from the plugin root, and
   the TL;DR (D7) in both modes' PR bodies. Owns: stacked draft PRs from a handover with
   nothing installed.
5. **Archive + wipe branch.** Owns: the feature documents leave the branch, and are kept on
   the machine, with no CI job.

## Calls made by the designer (not yet confirmed by the author)

- D4's table: which file each installed-mode read maps to; the first-run gate discovery.
- D1: project memory is not applied in an installed repository (stated to the author with
  the entry-point decision; not objected to).
- D4: the `.claude/hitl.json` sentence change in the installed doctrine.
- D3: the wipe is a generated branch outside the stack table, not a slice row.
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
- The file format of the active-feature record (D5 fixes its content, writer and clearing).
- Whether `/hitl:help` reports no-install state; nice to have, not required.
