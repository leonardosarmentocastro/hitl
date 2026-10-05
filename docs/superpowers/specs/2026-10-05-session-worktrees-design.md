# Session worktrees — one design session, one worktree

**Reviewed:** round 1 (2026-10-05) · round 2 (2026-10-05).

**Feature branch:** `feat/session-worktrees` · **Deferred elsewhere:** issue #10 (auto-launching
`/implement-stack` in a fresh session).

## Problem

Two Claude sessions started in the same checkout trip over each other:

1. **The Stop hook gates the wrong tree.** `.claude/hooks/unreviewed-artifact.sh` does
   `cd "${CLAUDE_PROJECT_DIR:-$PWD}"`. `CLAUDE_PROJECT_DIR` is the folder the session was
   *launched* in and never changes, so a session that moved into a worktree (`EnterWorktree`)
   is still refused for a sibling session's unreviewed specs and plans. Seen in treasury-2 on
   2026-09-26: session B waited ~7 minutes for session A to run `/review-plan`. A test pins the
   current behaviour (`scripts/__tests__/unreviewed-artifact.test.ts`, "reads
   CLAUDE_PROJECT_DIR, not the cwd it was invoked from").
2. **A shared checkout moves under a session.** Two sessions in one folder share one checked-out
   branch. If one (or the human) switches it — say to `fix/complex-feature` for manual testing —
   the other keeps reading code and reasons from a codebase state that is not `main`, with no
   signal that anything changed. `/review-spec` also picks "the newest spec on this branch",
   which another session's spec can be.
3. **Nothing says where a design session should live**, so it lives in the shared checkout.

## Outcome

Every design session runs in its own locked git worktree on its own feature branch, cut from
an up-to-date `main` before it reads any code; the Stop hook gates the tree the session is in;
the implementation session is launched in that same worktree; and a plugin command offers to
remove worktrees once they are provably safe to remove.

## Design

### 1. The Stop hook reads the session's folder

Claude Code sends every hook a JSON payload on stdin; its `cwd` field is the session's
*current* working directory, which follows `EnterWorktree`.

The hook resolves the tree it gates in this order and uses the first that works:

1. `cwd` from the stdin payload, parsed with `node -e` (Node is already required by the
   installer; jq stays a non-prerequisite), then resolved to its git root with
   `git -C "$cwd" rev-parse --show-toplevel`. A `cwd` below the repository root (a session
   launched in `apps/`) therefore gates the whole tree, and a `cwd` inside a worktree gates that
   worktree.
2. `CLAUDE_PROJECT_DIR`, as today.
3. `$PWD`, as today.

A step that fails — no stdin, stdin that is not JSON, no `cwd` field, Node missing, a `cwd` that
is not in a git repository — falls through to the next. The gate is never silently disabled by
a parse failure: the worst case is today's behaviour. The hook only reads stdin when stdin is
not a terminal, so running it by hand does not hang.

`.claude/settings.json` keeps launching the script through `${CLAUDE_PROJECT_DIR}/.claude/hooks/…`:
the main checkout's copy of the script runs, gating the worktree's files. That only differs from
the worktree's copy while a branch changes the hook itself.

Both copies change: `templates/claude/hooks/unreviewed-artifact.sh` and this repository's
`.claude/hooks/unreviewed-artifact.sh`, with `.claude/hitl.json` regenerated (AGENTS.md §
Refreshing this repository's manifest).

### 2. Design sessions start in a worktree

**Doctrine (HITL.md, template and this repo's copy).** A new rule under § Feature branches.
The chain diagram is not changed: it sits inside the `review-rounds` customization anchor, and a
node there would become part of that knob (`/hitl:customize review-rounds` could rewrite it, and a
repository that customized the knob would hit a `/hitl:diff` conflict). § Feature branches is not
anchored.

> The first action of any session that begins the chain — a brainstorm, a grill, a design
> discussion — before it reads any code, is to put itself in its own worktree on the feature
> branch:
>
> ```bash
> MAIN=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
> git fetch origin
> git worktree add "$MAIN/.claude/worktrees/<topic>" -b feat/<topic> origin/main
> git branch --unset-upstream feat/<topic>
> git worktree lock --reason "hitl design session: <topic> on feat/<topic>" "$MAIN/.claude/worktrees/<topic>"
> ```
>
> then `EnterWorktree` with `path: $MAIN/.claude/worktrees/<topic>`. `$MAIN` is the main
> checkout, so the worktree lands under the main checkout's `.claude/worktrees/` even when the
> session starts inside another linked worktree (the only place `EnterWorktree` switches
> between worktrees). `<topic>` is kebab-case, chosen
> from the request; the branch prefix follows § Feature branches (`fix/<topic>` for a bugfix).

- **Already in this topic's worktree.** If the session's git root is a *linked* worktree (not the
  main checkout — `git rev-parse --git-dir` differs from `--git-common-dir`) whose branch is
  `feat/<topic>` or `fix/<topic>` for this request's topic (resuming a design), it stays there
  and creates nothing; if that worktree is not locked, it locks it with the reason above, so
  `/hitl:cleanup` and the cleanup hint cover it. A linked worktree on any other branch — another
  topic, or a `claude -w` worktree on its own branch — does not count: the session creates this
  topic's worktree as above and enters it.
- **Collision.** After the fetch, if `$MAIN/.claude/worktrees/<topic>`, the local branch or
  `origin/<branch>` already exists, the session asks the human whether to reuse it or pick
  another name. It never overwrites or deletes.
- **Why `git worktree add` + `lock` + `EnterWorktree path:`, not `EnterWorktree name:`.** A
  worktree that `EnterWorktree` creates by name is removed when the session exits if nothing
  tracked changed — exactly the state a design session is in before its spec is committed. A
  worktree entered by `path:` is never removed by the harness, and the lock keeps `git worktree
  prune` off it too.
- **Why unset the upstream.** `git worktree add -b … origin/main` makes the new branch track
  `origin/main`; a later bare `git push` or `git pull` would then aim at `main`.
- **Why before reading code.** A grill or brainstorm explores the code to test its assumptions;
  a checkout another session can switch makes those reads wrong without warning.
- The feature branch is still the integration target exactly as § Feature branches describes;
  this rule only says *where* it is checked out and *when* it is created (at the start of
  design, not "before implementation").

**`.gitignore`.** `gitignoreBlock()` in `installer/lib.mjs` gains `.claude/worktrees/`, so every
install and every `/hitl:diff --apply` adds it; this repository's `.gitignore` gets the same
line. For `/hitl:diff --apply` that needs a change: it used to leave an existing hitl marker
block in `.gitignore` alone (`withMarkerBlock` skips a file that has the markers), so it now
replaces the block's contents with the current `gitignoreBlock()`, and `/hitl:diff` stages
`.gitignore` when it did.

**Recursive scans skip sibling worktrees.** A worktree nested in the main checkout is visible to
anything that walks the tree; `.gitignore` does not stop `grep -r` or an agent's file search.
Every scan that walks the tree excludes `.claude/worktrees/`:

- the five agents that read "every `AGENTS.md` in the tree (excluding `node_modules/`)" —
  `spec-reviewer`, `plan-reviewer`, `slice-reviewer`, `implementer`, `fixer` (templates and this
  repo's copies) — say "(excluding `node_modules/` and `.claude/worktrees/`)";
- `/hitl:customize`'s anchor search (`commands/customize.md`, both occurrences) becomes
  `grep -rn --exclude-dir=worktrees "hitl:knob <id>" HITL.md AGENTS.md .claude/`.

The slice-2 plan re-checks `templates/`, `commands/` and `installer/` for any other recursive
walk at the time it is written.

**Launch line.** The implementation session must run in the worktree: `/implement-stack`
begins with `git checkout <parent>`, slice 1's parent is `feat/<topic>`, and git refuses to
check out a branch that is checked out in another worktree. So:

- The **handover document** (committed, shared) carries a relative path:
  ``Launch: `cd .claude/worktrees/<topic> && claude --model opus` then `/implement-stack docs/superpowers/handover/<feature>.md` ``.
  `/handover` and `/review-plan` brief the handover agent with this line, as today.
- The **line printed on screen** at the end of the design session uses the absolute path, from
  `git rev-parse --show-toplevel` in the session's worktree, so it can be pasted from anywhere.
  `/handover` and `/review-plan` print this one. The two lines differ only in that path.
- When the session is not in a linked worktree (a repository that has not adopted the rule
  yet), both lines omit the `cd`, as today.

**End of the implementation session (slice 3, with the command it names).** `/implement-stack`
§ 2's final report gains, after "Nothing is merged. The stack is yours to review.", a block in
plain words: *after the umbrella PR merges, from the main checkout (not from this session — it
is running inside the worktree), run `/hitl:cleanup`, or these commands:* `git worktree unlock
<abs path>` (only when the worktree is locked), `git worktree remove <abs path>`, `git branch -D
feat/<topic> <its local slice branches>`. The session never removes the worktree itself: a
fix-up round (`/implement-stack … fix-up`) needs it until the umbrella merges. The block lands in
slice 3 so it never names a command that does not exist yet.

### 3. `/hitl:cleanup`

A plugin command, like `/hitl:help`: `commands/cleanup.md` plus `installer/cleanup.mjs`. It is
not installed into target repositories, so the drift test does not cover it; its tests do.

**Which worktrees it considers.** Only those `git worktree list --porcelain` shows as locked with
a reason of the form `hitl design session: <topic> on <branch>`. A worktree made by hand, or
locked for any other reason, is never listed. The feature branch `B` is the `<branch>` in the
lock reason — **not** the checked-out branch: `/implement-stack` runs in the same worktree and
leaves it on a slice branch, so what is checked out may be `B` or any `B-slice-*`.

**Freshness.** Before classifying (and again before `--remove` re-checks), the script runs
`git fetch --prune origin`, and its output says so (pruning removes stale remote-tracking refs
repo-wide). If the fetch fails, it offers nothing, says why, and exits 2 — the same as a
PR-shim failure.

**Saved.** A local branch is *saved* when its tip is reachable from a remote-tracking ref
(`git rev-list <branch> --not --remotes` is empty), **or** a merged PR whose head is exactly that
branch records a head commit that is the tip or a descendant of it (`git merge-base
--is-ancestor <tip> <head_sha>`; a `head_sha` not present locally proves nothing). The second
test is what keeps a squash-merged branch saved after the host deleted it and the fetch pruned
it. It needs a new `head_sha` field in the PR shim's record (see Interface).

**Classification.** For each considered worktree, with `B` from its lock reason and the slice
branches `B-slice-*` that exist locally (together, "the branches to delete"):

| Class | Conditions (all must hold) | Offered for removal |
|---|---|---|
| **merged** | the PR shim (`scripts/hitl/pr.sh list --head-prefix B --state merged`) reports a merged PR whose head is exactly `B`; no tracked change and no untracked, non-ignored file in the worktree; every branch to delete is saved | yes |
| **abandoned** | no PR in any state has head `B`; `git rev-list origin/main..B` is empty; every slice branch to delete is saved or has no commit beyond `origin/main`; no tracked change and no untracked, non-ignored file | yes |
| **has unsaved work** | merged or abandoned by the PR test, but one of the "nothing lost" checks fails | no — listed with what is unsaved |
| **in progress** | anything else (open umbrella PR — even when slice PRs are merged —, or commits with no merged umbrella PR, e.g. a design abandoned after its spec was committed) | no — listed one line each, so nothing is invisible |

The PR shim is used rather than `git branch --merged` because a squash-merged umbrella is not
an ancestor of `main`. If the shim exits non-zero (host unreachable, not authenticated), the
command offers nothing and says why: it cannot tell merged from abandoned without the host.

A worktree the command is being run *from* is never offered; it says to run it from the main
checkout.

**The prompt.** One list, then one question. For each removable worktree: its path, branch, the
size `du -sh` reports, the reason it is safe in plain words ("its umbrella PR #12 is merged and
nothing in it is unsaved" / "nothing was ever committed or saved in it"), and the gitignored
entries that will also be deleted, as `git status --ignored` names them (e.g. `node_modules/ (412 MB), .env, .superpowers/`)
— so the human's yes is informed rather than resting on a "nothing is lost" that ignored files
make untrue. Then the total size, and: *Remove all N? (yes / pick some / no)*; "pick some" means
naming the listed paths. The "has unsaved work" and "in progress" entries follow, not offered. With nothing removable and
nothing unsaved it says so in one line.

**Removal**, per chosen worktree: `git worktree unlock`, `git worktree remove` (no `--force`;
a refusal is reported, not overridden), then `git branch -D` on `B` and its local slice
branches — `-D` because a squash-merged branch is not "merged" to git; the "saved" test above
is what makes it safe. Remote branches are never touched; the report ends with
"Remote branches are left alone — delete them on the host if it does not do so on merge."

**Interface.** `installer/cleanup.mjs --repo <dir>` prints one JSON document classifying every
considered worktree; `--remove <abs worktree path>[,<abs worktree path>…]` removes exactly
those — a worktree is named by its path, never by a topic, which a reused name could make
ambiguous — re-checking each
one's class first, and prints what it removed and what it refused. Exit 0 ok · 1 usage · 2 the
PR shim or the fetch failed. The command prompt does the asking; the script never prompts.

**PR shim change.** `scripts/hitl/pr.sh`'s record gains `head_sha` (the PR's head commit; GitHub
`headRefOid`, the only backend today). Additive: existing callers ignore it. The shim's header
comment documents it as part of the record, and a future backend must supply it. Templates
(`templates/scripts/pr.sh`, `templates/scripts/backends/github.sh`) and this repo's copies change
together, with the manifest regenerated.

## Testing

- **Hook** (`scripts/__tests__/unreviewed-artifact.test.ts`): the pinned test is reversed — the
  payload's `cwd` wins over `CLAUDE_PROJECT_DIR`. New cases: a `cwd` in a subfolder gates the
  repository root; a `cwd` in a linked worktree gates the worktree, not the main checkout; no
  payload, a non-JSON payload, a payload without `cwd`, a `cwd` outside any git repository, and
  Node absent from `PATH` each fall back to `CLAUDE_PROJECT_DIR`. Slice 1's PR also records one
  observation of the real harness, since every test feeds a synthetic payload: with an
  unreviewed spec in the main checkout, a session that has entered a sibling worktree with
  `EnterWorktree` ends its turn unrefused, and a session in the main checkout is still refused.
- **`.gitignore`**: the render tests assert `.claude/worktrees/` in the rendered block; the drift
  and self-manifest tests cover this repository's copy. In this repository the line is also
  load-bearing for a local gate: `pnpm format:check` (`prettier --check .`) only skips nested
  worktrees once `.gitignore` lists them.
- **Doctrine and prompts** (HITL.md, `/handover`, `/review-plan`, the five
  agents, `/hitl:customize`): not unit tested (AGENTS.md); the drift test proves template and copy
  agree, and behaviour is shown by dry runs on `.claude/fixtures/`, recorded in slice 2's PR:
  (a) `/handover` run from a linked worktree prints the absolute `cd` line and the document
  carries the relative one; (b) the same run from the main checkout prints no `cd`; (c) a
  fixture design request in a fresh session — the session's first action creates, locks and
  enters `.claude/worktrees/<topic>`; (d) `/hitl:customize`'s anchor search from the main checkout
  with a sibling worktree present returns only the main checkout's anchors.
- **`/hitl:cleanup`** (`scripts/__tests__/cleanup.test.ts`): temp repositories with real linked
  worktrees and a stub of the installed PR shim (`scripts/__fixtures__/stub-pr-shim/pr.sh`) — the engine depends on the shim's contract, whose `gh` mapping `pr-shim.test.ts` proves with `fake-gh`. Cases: one per class; an unlocked or
  differently-locked worktree is ignored; a worktree checked out on a slice branch whose slice
  PR is merged while the umbrella PR is open is "in progress", and once the umbrella merges its
  `B` and every `B-slice-*` are removed; an abandoned worktree with a local slice branch carrying
  an unpushed commit is "has unsaved work"; a squash-merged PR classifies as merged; a local
  commit not on the remote makes it "has unsaved work"; an untracked file does too; ignored
  entries are reported with sizes; shim failure offers nothing and exits 2; `--remove` deletes
  the worktree and local branches and leaves the remote branch; `--remove` re-checks and
  refuses a worktree that gained a commit since listing; the worktree the script runs from is
  never offered; a fetch failure offers nothing and exits 2; a squash-merged branch deleted on
  the host and pruned locally is still saved through the PR's `head_sha`, and one whose local tip
  has a commit beyond `head_sha` is not.
- **PR shim** (`scripts/__tests__/pr-shim.test.ts`): the record carries `head_sha` from the
  backend.
- **`/implement-stack`'s cleanup block** (slice 3): a prompt; the drift test covers
  template/copy agreement.

## Delivery slices

| # | Owns | Thread a test can prove |
|---|---|---|
| 1 | The Stop hook gates the session's own tree | hook tests above; template + copy + manifest |
| 2 | Design sessions start in a worktree | `.gitignore` block render test; fixture dry runs (a)–(d); drift test for template/copy agreement |
| 3 | `/hitl:cleanup` offers safe removals | `cleanup.test.ts`; `head_sha` in `pr-shim.test.ts`; `/implement-stack`'s cleanup block |

Slice 2 depends on slice 1 (a session in a worktree is only isolated once the hook follows it);
slice 3 depends on slice 2 (it finds worktrees by the lock reason slice 2 introduces).

## Out of scope

- Issue #10: optionally starting `/implement-stack` by itself in a fresh (tmux) session.
- Deleting remote branches.
- Changing what `settings.json` launches the hook through.
- Pulling this into treasury-2 (`/hitl:diff --apply` there, after release).

## Decisions and declined alternatives

- Spec review round 1 — *a hook `cwd` that follows a Bash `cd` into the main checkout gates the
  main checkout*: declined, not worth it. The harness resets the shell's `cd` after each command
  without moving the session, and a worktree-isolated session refuses git commands aimed outside
  its worktree.
- Spec review round 1 — *slice branches named `slice/...` survive cleanup*: declined, wrong. The
  handover agent only creates `<feature-branch>-slice-<N>-<label>`, which `B-slice-*` matches.
- Spec review round 1 — *proving a host-deleted, squash-merged branch saved*: the human chose to
  add `head_sha` to the PR shim's record over listing such worktrees as unprovable.
- **Bubbled up from plan review (round 1)** — `/hitl:diff --apply` now refreshes the hitl
  block in an existing `.gitignore` (it used to leave it untouched), so an already-installed
  repository gets `.claude/worktrees/` on upgrade. The human chose this over a manual upgrade
  note. Owned by slice 2.
- **Bubbled up from plan review (round 2)** — a worktree on a detached HEAD whose commits are on
  no branch and no remote is "has unsaved work": removing it would discard them. Ignored files are
  reported as `git status --ignored` names them (possibly nested), not reduced to top-level
  entries. The cleanup tests use a stub of the installed PR shim rather than `fake-gh`.
