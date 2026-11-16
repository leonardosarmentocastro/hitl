# The `.hitl/` folder — design

**Reviewed:** round 1 (2026-11-16).

## Intent

In installed mode, everything that is hitl's and not Claude Code's lives in a `.hitl/`
folder: the doctrine, the reviewer context and the install record. The repository root holds
only what a visitor needs, `.claude/` holds only what Claude Code itself loads plus hitl's
working folders, and the repository folder mirrors `~/.hitl/` on the machine.

| today | after |
|---|---|
| `HITL.md` | `.hitl/HITL.md` |
| `.claude/review-context.md` | `.hitl/review-context.md` |
| `.claude/hitl.json` | `.hitl/manifest.json` |
| `@HITL.md` in `CLAUDE.md` | `@.hitl/HITL.md` |

This is a breaking change and is released as hitl **0.3.0**. The human decided that the price
is paid once, by upgrading: there is no period in which both layouts work.

## Goals

1. A fresh `/hitl:init` writes the three files under `.hitl/` and nothing at the root except
   the blocks it appends to `CLAUDE.md`, `README.md`, `AGENTS.md` and `.gitignore`.
2. An existing install upgrades through `/hitl:diff --apply` with no hand edits: the files
   move, edits the repository made to them survive, and `CLAUDE.md` still loads the doctrine.
3. `/hitl:init --adopt` on a repository that carries the files in the old places moves them,
   then records.
4. The plugin refuses to work on a repository still on the old layout and names the command
   that fixes it.
5. Agents, commands, hook, doctrine and README block name the new paths; no reference to the
   old paths remains in anything hitl renders for installed mode.
6. This repository's own copy uses the new layout.

## Non-goals

- No-install mode. It reads the doctrine from the plugin (`doctrine/HITL.md`) and keeps doing
  so; its rendered files change only where a shared template changes, and never in meaning.
- Moving `.claude/fixtures/`, `.claude/reviews/` or `.claude/worktrees/`. They stay.
- Moving anything Claude Code loads: `.claude/agents/`, `.claude/commands/`, `.claude/hooks/`,
  `.claude/settings.json`.
- `scripts/hitl/` stays.

## Anti-goals

- A plugin that understands both layouts. The old layout is recognised for exactly two
  purposes: refusing with the upgrade message, and being upgraded by `/hitl:diff --apply`.
  (`--adopt` separately moves old-place *files* in a repository that has no manifest at all.)
- An upgrade that leaves a customized doctrine behind at the root and installs a fresh one
  under `.hitl/`.
- Rename detection by content similarity.

## Constraints

- The upgrade engine (`installer/diff.mjs`) trusts a recorded render only when it hashes to
  what the manifest recorded, and refuses manifest paths the recorded version never owned.
  The recorded render of an older version is produced by that version's own `lib.mjs`, so it
  carries the **old** paths. The move must work with that, not around it.
- The manifest describes the templates, never the repository's edits. That stays true.
- Neither init, adopt nor the upgrade is transactional; each already reports exactly what
  landed on failure. The new writes (moves, the `CLAUDE.md` line, the manifest's relocation)
  join those reports.
- Upgrading from version X needs tag `vX` in the marketplace clone (existing rule). No `v0.2.1`
  tag exists today (tags are `v0.1.0` and `v0.2.0`), so a 0.2.1 install cannot upgrade until
  the human tags it, on the commit whose render matches what 0.2.1 installs recorded. That is
  a release step the human owns, outside this feature's code.
- `Markdown is never formatted`; the local gates are `pnpm test` and `pnpm format:check`.

## Approaches

**A — a rename list the upgrade engine understands (chosen).** `installer/lib.mjs` exports a
list of moves (`from` → `to`). When the engine meets a `from` path in the manifest whose `to`
path the latest render owns, it treats the file at `from` as the repository's copy of `to`.
Every existing classification then applies unchanged, the result is written at `to`, and
`from` is removed. Adopt reuses the same list. A future rename is one more line.

**B — a single-use migration script run before the engine.** Rejected: the engine would refuse
the rewritten manifest paths (`unowned-path`) unless it also learned about the rename, so it
is A plus a script used once.

**C — detect renames by content similarity.** Rejected: a guess must not decide which file
gets deleted.

The human chose A.

## Design

### 1. The new layout (fresh install)

- `ownedFiles()` returns `.hitl/HITL.md` and `.hitl/review-context.md` in place of the old
  paths. `MANIFEST_PATH` is `.hitl/manifest.json`.
- `withClaudeLine` appends `@.hitl/HITL.md`. A `CLAUDE.md` that already has that line is left
  alone.
- Init must never overwrite an existing `.hitl/HITL.md`, `.hitl/review-context.md` or
  `.hitl/manifest.json`: the first two are collisions, the third is `manifest-present`. A
  `.hitl/` folder holding other files is not a collision.
- Every template that names an old path names the new one: the agents' grounding steps
  (`.hitl/HITL.md`, no longer "at the repo root"; `.hitl/review-context.md`), the commands,
  the Stop hook's message, the doctrine's *Where things live* and *Review gates* sections,
  the README block (`readmeBlock`), `/hitl:init`'s and `/hitl:help`'s text, and the
  prose of this plugin's own `README.md`.
- `/hitl:customize`: the knob table, the anchor `grep` (it must search `.hitl/` too), and
  `customize-testing.mjs` use the new paths. The doctrine's load-bearing invariants are
  unchanged; none of them names a moved path.
- Every place the plugin tests for an install uses the new manifest path:
  `runtime/context.mjs`, `runtime/session.mjs`, `runtime/stop-hook.sh`,
  `installer/cleanup.mjs`, `installer/help.mjs`. `help.mjs` calls a repository *ejected* when
  it has `.claude/agents` and a doctrine at either `.hitl/HITL.md` or the root `HITL.md`.
- `.claude-plugin/plugin.json` goes to `0.3.0`.
- This repository: the three files move, `CLAUDE.md` imports `@.hitl/HITL.md`, `AGENTS.md`'s
  prose and its two refresh recipes name the new paths, the manifest is regenerated, the
  plugin's no-install files are rendered again, and the drift and self-manifest tests read
  the new paths. `.hitl/review-context.md` stays the one file excluded from the drift test.

### 2. Recognising the old layout

One function in `installer/lib.mjs` answers "which layout is this repository on?":

- **current** — `.hitl/manifest.json` exists;
- **old** — it does not, and `.claude/hitl.json` exists;
- **none** — neither.

`runtime/context.mjs` reports it as a `layout` field. An old-layout repository still reports
`mode: "installed"`, so every plugin command that refuses or defers in an installed repository
keeps doing so; only the commands named below swap their behaviour for the upgrade message.
On **old**:

- `/hitl:brainstorming`, `/hitl:customize` and `/hitl:cleanup` print exactly

  ```
  This repository uses an older hitl layout. Run /hitl:diff --apply to upgrade it.
  ```

  and stop, before creating or changing anything.
- `/hitl:help` reports the state as `old layout` and gives that command as the next step.
- `/hitl:diff` runs (section 3).
- The plugin's Stop hook stays silent and `session.mjs start` refuses as for an installed
  repository: the repository's own hook and commands still work on the old layout and remain
  self-consistent, so a feature in flight can finish before the upgrade.
- `/hitl:init`, with or without `--adopt`, refuses as `manifest-present`; on the old layout the
  refusal carries the upgrade message.

"Finish" means the repository's own review and implementation commands. `/hitl:cleanup` is a
plugin command and waits for the upgrade.

The opposite mismatch cannot be handled: a plugin older than 0.3.0 sees an upgraded
repository as not installed. The cure is updating the plugin. The upgrade PR body says so
(section 3); so do the notes of the v0.3.0 release, which the human writes when tagging.

### 3. The upgrade moves the files

`installer/lib.mjs` exports the moves:

```
HITL.md                    → .hitl/HITL.md
.claude/review-context.md  → .hitl/review-context.md
```

`diff.mjs` reads the manifest from whichever of the two manifest paths exists (current
first). For each move whose `from` is in the manifest and whose `to` is in the latest render:

- the pair is reported as **one** entry: `path` is `to`, `movedFrom` is `from`;
- the repository's text is read at `from`, the recorded text and hash are those of `from`,
  the latest text is that of `to`;
- the state is classified exactly as today — and whatever the state, the entry is applied,
  because the move itself is a change:

  | state | written at `to` | 
  |---|---|
  | `unchanged`, `upstream changed`, `missing locally` | the latest render |
  | `locally edited`, `already applied` | the repository's text, untouched |
  | `both` | the three-way merge (`merged: clean` or `conflict`) |

  and the file at `from`, when present, is removed;
- if only `to` is on disk (moved by hand, or by an earlier apply that stopped part-way), the
  pair is still one moved entry: the repository's text is read at `to`, the recorded text and
  hash are still those of `from`. It is never treated as `new upstream`, which would
  overwrite it;
- if both `from` and `to` are on disk, the engine computes what it would write at `to` from
  the file at `from`. When the file at `to` already equals that, the move is resumed (only
  `from` is removed). Otherwise it refuses (`refused: "move-collision"`, with the paths) and
  writes nothing.

For each move the engine writes `to` and removes `from` back to back, so a part-way failure
leaves at most one pair with both files, and a re-run resumes it by the rule above.

The existing safety checks apply to the `from` path as before (the recorded render must own
it and hash to the manifest).

With `--apply`, additionally:

- the manifest is written at `.hitl/manifest.json`, then `.claude/hitl.json` is removed. A
  repository that has both (an apply that stopped between the two) is on the current layout;
  its next `/hitl:diff` reports the leftover `.claude/hitl.json` as one more thing to apply
  and `--apply` removes it;
- in `CLAUDE.md`, a line that is exactly `@HITL.md` becomes `@.hitl/HITL.md`. The output
  reports `claudeLine` as `rewritten`, `current` (the new line is already there) or `absent`.
  An absent line is not added;
- inside the README's hitl block, the references to `` `HITL.md` `` become
  `` `.hitl/HITL.md` `` along with the existing version bump; text outside the markers is
  never touched;
- the apply output lists the removed `from` paths and the old manifest under `deleted`, so
  the failure report and the staging stay exact.

The report without `--apply` shows the moved entries too and counts them in "<n> to apply".
An upgrade from an old layout is never "nothing to apply".

`commands/diff.md`:

- the table's note column shows `moved from <from>`;
- staging adds the new manifest path and `CLAUDE.md` when `claudeLine` is `rewritten`, and
  `git rm --cached` covers the removed paths; the part-way undo recipe names both manifest
  paths and `CLAUDE.md`;
- the report and the PR body add, when anything moved: "hitl's files now live in `.hitl/`.
  Everyone working on this repository must update the hitl plugin to 0.3.0 or newer; an
  older plugin no longer recognises this repository as installed." When `claudeLine` is
  `absent`: "`CLAUDE.md` has no `@HITL.md` line, so nothing there was changed; if the
  doctrine should load, add `@.hitl/HITL.md`."
- the refusal texts that name `.claude/hitl.json` name the manifest path the repository
  actually has.

Other owned files (agents, commands, hook) need nothing special: their templates changed, so
they are `upstream changed`, or `both` where the repository edited them.

### 4. Adopt moves, then records

`installer/adopt.mjs` refuses `manifest-present` when either manifest path exists. A file at a
`from` path counts as something to adopt, so a repository whose only hitl file is a root
`HITL.md` is not `nothing-to-adopt`. Before writing the manifest, adopt applies the same move
list: a file at `from` with nothing at `to` is renamed, content untouched; the
`@HITL.md` line is rewritten as in section 3. Files at both `from` and `to` refuse
(`move-collision`) before anything is written. The output gains `moved` (the pairs) and
`claudeLine`; `wrote` names the new manifest path. `commands/init.md`'s adopt branch reports
what moved.

Adopt still does not touch the repository's agents and commands. In a hand-copied repository
they keep naming the old paths until the human takes the upstream text; `/hitl:diff` shows
them as `locally edited`, which is adopt's existing contract. The adopt report says so in one
line when anything moved.

## Left to the builder

- Where the review-context template lives under `templates/`.
- The names of the layout function, the move list and the new output fields beyond those
  given above.
- How `diff.mjs` is restructured to carry `movedFrom`.
- The exact wording of prose changed in templates, beyond the path itself.

## Delivery slices

1. **Fresh install in the new layout** — section 1 whole, including this repository's own
   move and the version bump. One capability: `/hitl:init` produces the `.hitl/` layout and
   the plugin recognises it. Wide by nature (every agent and command template names a moved
   path); expect it to cross the file tripwire.
2. **The upgrade moves the files** — section 3. Introduces the layout function of section 2,
   which it needs to find the manifest.
3. **Old layout is refused** — section 2, the rest.
4. **Adopt moves, then records** — section 4.

Between slices 1 and 3 the plugin sees an old-layout repository as not installed. That state
exists only on the feature branch and is never released.

## Acceptance

- A fresh `/hitl:init` in an empty repository leaves `.hitl/HITL.md`,
  `.hitl/review-context.md` and `.hitl/manifest.json`, no `HITL.md` at the root, and
  `@.hitl/HITL.md` in `CLAUDE.md`.
- A 0.2.1 install with a customized `HITL.md` and an edited `review-context.md`, upgraded with
  `/hitl:diff --apply`: both files are under `.hitl/` with the edits intact, the old files and
  `.claude/hitl.json` are gone, `CLAUDE.md` imports `@.hitl/HITL.md`, and a second
  `/hitl:diff` reports nothing to apply.
- On an old-layout repository `/hitl:brainstorming` prints the upgrade message and creates no
  worktree.
- `/hitl:init --adopt` on a repository with a root `HITL.md` and no manifest moves it and
  writes `.hitl/manifest.json`.
- No file rendered for installed mode, nor the README block, names `HITL.md` other than as
  `.hitl/HITL.md`, and none contains `.claude/review-context.md` or `.claude/hitl.json`. The
  no-install renders are exempt where they name the plugin's `doctrine/HITL.md`; the upgrade
  and adopt code and their command text are exempt where they name the old paths as the
  source of a move.

## Testing the upgrade

The existing upgrade tests tag this repository's *current* installer and templates as the
recorded version. After slice 1 that render already has the new paths, so such a test proves
nothing about the move. The upgrade tests for this feature must use a recorded version whose
own installer returns the old paths and the old manifest path (a frozen pre-change fixture
under `scripts/__fixtures__/`, or an equivalent the plan names), and must assert the
repository's edits at `.hitl/HITL.md` for the `locally edited` and `both` states and for a
re-run after a part-way apply.

## Decisions and declined alternatives

- Reading both layouts for a deprecation period — declined by the human: breaking change,
  paid once.
- Warning and continuing on an old layout — declined by the human: block.
- Adopt refusing with hand-move instructions — declined by the human: adopt moves.
- Rewriting an import of the doctrine in a nested `CLAUDE.md` or `.claude/CLAUDE.md` —
  declined, not worth it: init only ever wrote the root file's line.
- Who tags `v0.2.1` — out of scope: a release step for the human (see Constraints).
- While this stack is in flight, a released 0.2.x plugin on the implementer's machine sees
  this repository as not installed once slice 1 lands — accepted: the implementation session
  uses the repository's own commands, and the state ends when 0.3.0 is released.
- *Forwarded to the plan gate:* the README-block rewrite must be safe to run twice (never
  `.hitl/.hitl/HITL.md`).
- *Forwarded to the plan gate:* for the old-layout refusal, name what a script test proves
  (`layout` from `context.mjs`, the engines' refusals) and what a command dry run proves.
