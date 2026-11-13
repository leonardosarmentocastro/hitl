# `/hitl:brainstorming` — the hitl workflow without installing it in the repository

**Status:** draft, awaiting review
**Reviewed:** round 1 (2026-11-12) · round 2 (2026-11-12).
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

- **GitLab PRs.** The implementation session ships GitHub-only; GitLab is issue #19. The
  design session runs on any host (see Constraints, Prerequisites).
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

**`/hitl:cleanup` works in both modes.** Today it runs the repository's `scripts/hitl/pr.sh`,
which a no-install repository does not have. Where `.claude/hitl.json` is absent it uses the
plugin's PR shim instead, treats `<feature branch>-wipe` as one of the feature's branches,
clears the active-feature record (D5) when it removes the worktree, and — if the feature's
documents reached the base branch (D3) — says so in one line with their paths.

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
2. **The feature's documents** are the files under `docs/superpowers/` that exist at a given
   tip and do not exist at that tip's merge-base with the base branch. The wipe measures
   them at its parent's tip, so a document added or renamed on a slice branch is covered.
   Nothing else under that path is archived, deleted or gated.
3. **Archive.** `/hitl:implement-stack` and `/hitl:umbrella-pr` copy the feature's documents
   to `~/.hitl/projects/<key>/features/<YYYY-MM-DD>-<topic>/` on every run — the date is the
   active-feature record's creation date (D5), so a later feature reusing a name gets its
   own folder. An edit made after the last run of either is not archived; accepted.
4. **Wipe branch.** `<feature branch>-wipe` is a branch holding exactly one commit that
   deletes the feature's documents, with a draft PR against its parent.
   - **Who builds it.** `/hitl:implement-stack`, after the last slice and before the
     umbrella PR; and `/hitl:umbrella-pr`, which is the command the human re-runs after
     slices merge on the host, so the wipe never stays stale against its parent.
   - It is **not a stack-table row and has no plan.** The handover agent never writes it;
     the stack table, the `**Owns:**` parser and the `Plan:` parser never see it. Its PR
     body carries, in place of the `Plan:` line, one sentence saying it is generated and
     must merge last.
   - Its parent is the last slice's branch, or the feature branch once every slice has
     merged into it.
   - It is **rebuilt, never edited**: each build resets the branch in place to its parent's
     tip plus the one delete commit, force-pushes it, and re-targets its PR's base if the
     parent changed. The branch is never deleted on the remote (that would close the PR). A
     reworked stack, a new slice or a changed plan therefore can never be deleted by an
     earlier branch and re-added by a later one: the delete exists only at the tip.
   - It gets no implementer, no review and no fixer.
   - It is a deterministic script with tests, not an agent.
   - Rebuilding force-pushes the wipe branch. This is the one exception to "never
     force-push unasked": the branch holds no human or agent work, only the generated
     delete. Every other branch keeps the existing rule.
   - **Once the wipe PR has merged**, both commands leave it alone (nothing to rebuild) and
     do not archive from the now-empty branch.
   - **Fix-ups happen before the wipe merges.** The umbrella PR body says so, and names the
     wipe PR as **required before merge**. A fix-up round wanted after the wipe merged needs
     the handover restored from the archive by hand; accepted.
   - **If the umbrella merges without the wipe**, the documents land on the base branch.
     There is no automated recovery: `/hitl:cleanup` reports it (D1) and the human removes
     them. Merging stays the human's act, as everything else in the stack.

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
repository is installed. One edit reaches the installed PR shim the same way: a `retarget`
verb (change a PR's base), which the wipe branch needs (D3).

The no-install doctrine also carries a section the installed one does not, § Project memory:
how gates are confirmed and the ask-before-remembering rule. Every `/hitl:` workflow command
reads the doctrine at its first step, so a session started from the launch line or resumed
later follows the same rules as the one `/hitl:brainstorming` started.

On the first `/hitl:brainstorming` in a repository with no memory, the command finds the
likely local gates (the plugin's existing discovery, `installer/discover.mjs`), proposes them,
asks the user to confirm or correct, and saves them. "This repository has no gates" is a
confirmable answer and is saved as such. A run with no confirmed answer does not start the
design session.

**Precedence.** The memory `gates` fact is the only authority on *which commands are the
local gates*: the user confirmed it. The repository's `AGENTS.md` / `CLAUDE.md` are read for
everything else they say (coding standards, conventions). **No fact, no run:** any no-install
command or agent that needs the gates and finds no `gates` fact — another machine, a changed
key, a deleted file — stops and runs the same confirm step; it never runs with no gates
silently. **A remembered gate that is not found** (command or script missing) is a stop and a
question to the human, never a skip.

### D5. The Stop hook is shipped by the plugin, and limited

The plugin declares a `Stop` hook. It acts only when **all** of these hold, and exits 0
otherwise:

- the session's git root is not an installed-mode repository (no `.claude/hitl.json`) —
  there the repository's own hook already runs;
- project memory holds an **active-feature record** whose worktree path is the session's
  git root, and that path still exists.

**The record** is `{ worktree path, topic, base ref, created date }`. The base ref is the
repository's default branch as git reports it — never assumed to be `main` — resolved once
by `/hitl:brainstorming`; the worktree, the guard, the wipe branch, the umbrella PR's base
and `/hitl:cleanup` all read it from the record. It is keyed by worktree
path — so another clone of the same remote is never gated, and the guard stays live when
the implementation session checks out slice branches in the same worktree. It is written
whenever `/hitl:brainstorming` ends up in the topic's worktree: when it creates it, when the
session was already in it, and when the human chose to reuse an existing one. It is cleared
by `/hitl:cleanup` when it removes the worktree; a record whose worktree path no longer
exists is ignored and may be pruned by any no-install command.

**What it checks.** The same `**Reviewed:**` header rule and message as the installed hook
(pointing at the `/hitl:` command names), with one deliberate difference: it checks only
**the feature's specs and plans** — files under `docs/superpowers/specs/` and
`docs/superpowers/plans/` in the working tree, tracked or not, that do not exist at the
merge-base with the record's base ref. A superpowers user's repository commonly carries
older, un-marked specs and plans on its base branch; those are not the feature's, the mode
may not edit them, and they never block — with one exception: when the base ref cannot be
resolved locally, the feature's documents cannot be told apart, so every spec and plan is
checked and the message says so (a silent guard would be worse than a loud one).

### D6. Worktrees and review output never show in `git status`

The design session's worktree stays at `<main checkout>/.claude/worktrees/<topic>` (where
`EnterWorktree` accepts it), and review output stays under `.claude/reviews/`. Both paths
are added to the repository's `.git/info/exclude` — local to the clone, never committed —
instead of `.gitignore`.

### D7. The TL;DR in PR bodies (both modes)

Slice and umbrella PR bodies open with a `## TL;DR` section holding the existing What / Why
/ How lines, in the newcomer register the doctrine already requires. In a slice PR the
`Plan:` line stays the first line (it is load-bearing) and the TL;DR follows it. Project
memory may add sections after the TL;DR of a **slice** PR (the author's frontend project
adds before/after screenshots and a measured table); hitl ships none of those, and the
umbrella body carries no memory-driven section. This is an installed-mode template change too:
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
- **A repository that is not on GitHub, or has no remote, gets the design session only.**
  `/hitl:brainstorming` checks the host before creating the worktree (the plugin's existing
  discovery reports it). Off GitHub it warns once — "design session only here: opening PRs
  needs issue #19" — does not require `gh`, and then runs the design half in full: worktree,
  spec, reviews, plans, handover, the guard and project memory (which is why D2 defines a key
  for every host and for no remote). The handover is written as usual.
  `/hitl:implement-stack` and `/hitl:umbrella-pr` refuse on their first line there, naming
  issue #19; the human implements from the handover by hand until it lands.
- **TDD per `AGENTS.md`:** the memory key and store, the limited Stop hook, the wipe-branch
  builder and the generator are scripts with tests under `scripts/__tests__/`. The prompts
  are validated by a dry run — and because this repository is itself an installed-mode
  repository, each slice's dry run happens in a **scratch git repository with no hitl
  files**. What to observe there: `git status` shows no hitl file, tracked or untracked;
  the Stop hook blocks an unreviewed spec there and nowhere else; gates and reviewer
  context come from memory and the doctrine and PR shim from the plugin root (D4); an
  un-marked spec already on the base branch does not block; a project-specific statement
  produces a question before anything is written to memory.
- **The plugin stops being installer-only.** `AGENTS.md` § What this repo is ("ships no
  runtime"), the README and the `plugin.json` description are updated to say the plugin
  also runs the workflow where nothing is installed.
- **No-install mode never writes a tracked file** in the target repository other than the
  feature's documents under `docs/superpowers/`. Its untracked files are the worktree and
  the review output (D6), hidden through `.git/info/exclude`.

## Decisions and declined alternatives

Review round 1 (2026-11-12):

- *Forwarded to the plan gate:* memory facts passed into agent briefs are marked as
  untrusted data, as the other ground-truth files are. (Resolved in plan review round 2,
  below: conventions to follow, unable to change the chain.)
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

Review round 2 (2026-11-12):

- *Forwarded to the plan gate:* how the TL;DR heading reaches a repository that customised
  the `pr-body-sections` knob.
- *Forwarded to the plan gate:* whether `/hitl:cleanup` removes the `.git/info/exclude`
  entries or leaves them for the next feature.
- Declined — `/hitl:brainstorming` refusing off GitHub: the author wants the design half on
  the GitLab project that motivated this feature (Constraints).
- Declined — an automated recovery when the umbrella merges without the wipe: a second
  generated PR against the base branch for a mistake the umbrella body already warns about.
- Declined — restoring the handover from the archive for a fix-up after the wipe merged:
  the stated rule is that fix-ups come first.

Plan review round 1 (2026-11-12):

- **Bubbled up from plan review (round 1)** — D7: `Plan:` stays the first line of a slice PR
  body and the TL;DR follows it; memory-driven sections apply to slice PRs only.
- **Bubbled up from plan review (round 1)** — D4: the shim's `retarget` verb is a third
  installed-mode change; the no-install doctrine gains § Project memory and every workflow
  command loads the doctrine, because a fresh implementation session has read nothing.
- **Bubbled up from plan review (round 1)** — D5: an unresolvable base ref makes the hook
  check every document, loudly.
- Answered (forwarded item) — the TL;DR reaches a repository that customised the
  `pr-body-sections` knob as any template change does: `/hitl:diff` merges per file and the
  human decides. Nothing special is built.
- Answered (forwarded item) — `/hitl:cleanup` leaves the two `.git/info/exclude` lines in
  place: they are local to the clone and the next feature needs them.

Plan review round 2 (2026-11-12):

- **Bubbled up from plan review (round 2)** — D2/G2: memory facts are the project's own
  conventions and are followed as the repository's `AGENTS.md` is (a branch-name quirk
  constrains the handover's branch names); they still cannot change the chain, a gate or an
  invariant. "Untrusted data" was too strong: it read as "ignore them".
- **Bubbled up from plan review (round 2)** — Constraints: `/hitl:review-slice` does not
  refuse off GitHub (it calls no code host); only `/hitl:implement-stack` and
  `/hitl:umbrella-pr` do, as written.
- **Bubbled up from plan review (round 2)** — D3: a merged wipe PR counts only when the
  feature's documents are gone; otherwise it is an earlier feature's and the wipe is built.
- **Bubbled up from plan review (round 2)** — D4: the host is read from `origin` (where PRs
  open), the memory key from `upstream` when present.
- **Bubbled up from plan review (round 2)** — D5: the base branch is the repository's
  default branch, recorded with the session (the author's answer). Declined: supporting
  only `main` and stopping elsewhere. The installed mode keeps `main` in its own,
  repository-editable doctrine.

## Delivery slices (proposed; the plans decide)

1. **Doctrine, project memory and entry point.** The generator, the no-install doctrine and
   its drift test (the entry point is the doctrine's first consumer); the key and store
   scripts; `/hitl:brainstorming` — hand-written like `commands/init.md`, since it has no
   installed-mode counterpart, and taking the worktree procedure from the doctrine rather
   than restating it. It checks prerequisites, puts the session in the topic's worktree,
   writes the active-feature record (D5), excludes the hitl paths, loads or seeds memory
   (gates confirmed with the user), then runs the superpowers brainstorming skill under the
   doctrine; in an installed repository it follows the repository's rules instead (D1).
   Owns: starting a design session from one command in any repository, remembering the
   project where nothing is installed.
2. **No-install design loop.** The rendered `/hitl:review-spec`, `/hitl:review-plan`,
   `/hitl:handover` and the reviewer and handover agents, reading standards per D4; their
   installed-repository refusal (D1); the launch line per D8. Owns: a design session from
   spec to handover with nothing installed.
3. **Limited Stop hook.** Owns: the review guard on the feature's own documents in
   no-install sessions, silent everywhere else.
4. **No-install implementation session.** `/hitl:implement-stack`, `/hitl:review-slice`,
   `/hitl:umbrella-pr`, implementer and fixer agents, the PR shim from the plugin root, and
   the TL;DR (D7) in both modes' PR bodies. Owns: stacked draft PRs from a handover with
   nothing installed.
5. **Archive, wipe branch and cleanup.** The archive and wipe-branch builder, wired into
   `/hitl:implement-stack` and `/hitl:umbrella-pr`; `/hitl:cleanup` in both modes (D1).
   Owns: the feature documents leave the branch and are kept on the machine with no CI job,
   and a finished no-install feature is cleaned up.

## Calls made by the designer (not yet confirmed by the author)

- D4's table: which file each installed-mode read maps to; the first-run gate discovery.
- D1: project memory is not applied in an installed repository (stated to the author with
  the entry-point decision; not objected to).
- D4: the `.claude/hitl.json` sentence change in the installed doctrine.
- D3: the wipe is a generated branch outside the stack table, not a slice row.
- D3: fix-ups come before the wipe merges; an umbrella merged without the wipe is reported
  by `/hitl:cleanup` and removed by hand.
- D4: the memory `gates` fact outranks the repository's files on which commands are gates.
- D5: the guard checks only the feature's own specs and plans.
- D1: `/hitl:cleanup` works in both modes.
- D7: memory-driven PR sections apply to slice PRs only, not the umbrella.
- D2: memory facts are followed like the repository's `AGENTS.md`, not treated as untrusted.
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
