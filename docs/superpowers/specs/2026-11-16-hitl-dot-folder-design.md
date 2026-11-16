# The `.hitl/` folder — design

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
  purposes: refusing with the upgrade message, and being upgraded by `/hitl:diff --apply`
  (and adopted by `--adopt`).
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
- Upgrading from version X needs tag `vX` in the marketplace clone (existing rule). Releasing
  0.3.0 therefore requires `v0.2.1` to be tagged.
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
  the README block (`readmeBlock`), `/hitl:init`'s and `/hitl:help`'s text.
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

`runtime/context.mjs` reports it as a `layout` field. On **old**:

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
- `/hitl:init` (without `--adopt`) refuses as `manifest-present`, as today.

The opposite mismatch cannot be handled: a plugin older than 0.3.0 sees an upgraded
repository as not installed. The cure is updating the plugin. The release notes and the
upgrade PR body say so (section 3).

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
- if the repository already has a file at `to` while `from` is still present, the engine
  refuses (`refused: "move-collision"`, with the paths) and writes nothing. If only `to` is
  present, the file is classified at `to` as an ordinary path (someone moved it by hand).

The existing safety checks apply to the `from` path as before (the recorded render must own
it and hash to the manifest).

With `--apply`, additionally:

- the manifest is written at `.hitl/manifest.json` and `.claude/hitl.json` is removed;
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

`installer/adopt.mjs`, before writing the manifest, applies the same move list to a repository
that has no manifest: a file at `from` with nothing at `to` is renamed, content untouched; the
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
2. **The upgrade moves the files** — section 3.
3. **Old layout is refused** — section 2.
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
- No file rendered for installed mode contains `` `HITL.md` at the repo root ``,
  `.claude/review-context.md` or `.claude/hitl.json`.
