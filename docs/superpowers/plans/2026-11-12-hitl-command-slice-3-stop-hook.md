# hitl-command slice 3 — limited Stop hook

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Reviewed:** round 1 (2026-11-12).

**Owns:** The review guard on the feature's own specs and plans in no-install sessions, silent everywhere else.

**Goal:** A turn cannot end in a `/hitl:brainstorming` worktree while a spec or plan the feature added lacks its `**Reviewed:**` header line — and the hook does nothing in any other repository, branch or worktree on the machine.

**Architecture:** The plugin declares one `Stop` hook (`hooks/hooks.json`) running `runtime/stop-hook.sh`. The script exits 0 through a chain of cheap checks (no `~/.hitl`, not a git folder, installed repository, no active-feature record) before it looks at any document. The header rule is the installed hook's; one shared test table proves both scripts agree on it.

**Tech Stack:** bash, Node ≥ 20 (payload parsing and the record lookup), vitest.

**Spec:** `docs/superpowers/specs/2026-11-12-hitl-command-design.md` — D5, Anti-goals (first bullet), Constraints.

## Global Constraints

- Local gates: `pnpm test` and `pnpm format:check`.
- The installed hook `templates/claude/hooks/unreviewed-artifact.sh` is **not modified**; `drift.test.ts` stays green without a manifest change.
- Tests set `HITL_HOME` to a temp directory and never read the real `~/.hitl`.
- Exit codes: `0` let the turn end · `2` refuse, with the reason on stderr. Any internal failure (no node, unreadable record, not a git folder) is `0`: this hook runs in every repository on the machine and must never block one it does not own.
- `runtime/stop-hook.sh` is hand-written, not rendered: a shell script cannot carry the Markdown mode markers. The shared header rule is kept in step by the test in Task 2.

## Consumed from slice 1

- `runtime/session.mjs get --worktree <dir>` → `{ record: { worktree, topic, base, created } }`, exit 3 when there is none or its folder is gone.
- `hitlHome()` — `HITL_HOME` or `~/.hitl`.

## Review Focus

- A repository whose base branch already carries un-marked superpowers specs must not block (the common case for a superpowers user) — Task 2.
- A session in the main checkout, or in another worktree of the same repository, must not be gated by a sibling's record — Task 2.
- The implementation session on a slice branch in the same worktree stays gated — Task 2.
- The base ref missing locally (never fetched) must not silently disable the guard — Task 2. This is the one case where a document that predates the feature can block; the spec records it (D5).
- A machine with no `~/.hitl` at all pays no node start-up per turn — Task 2.

---

### Task 1: `session.mjs get --field`

**Files:**
- Modify: `runtime/session.mjs`
- Test: `scripts/__tests__/session.test.ts`

**Interfaces:**
- Produces: `session.mjs get --worktree <dir> --field <worktree|topic|base|created>` prints the bare value and a newline (no JSON), exit 0; exit 3 with nothing on stdout when there is no record; exit 1 for an unknown field.

- [ ] **Step 1: Failing tests:** after `start … --base origin/main`, `get --field base` stdout is exactly `origin/main\n`; no record → exit 3 and empty stdout; `--field nope` → exit 1.
- [ ] **Step 2:** `pnpm test -- session` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `pnpm test -- session` → PASS.
- [ ] **Step 5:** Commit `feat(runtime): read one field of the active-feature record`.

### Task 2: The hook

**Files:**
- Create: `runtime/stop-hook.sh` (executable), `hooks/hooks.json`
- Test: `scripts/__tests__/plugin-stop-hook.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces: `hooks/hooks.json`:

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [{ "type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}/runtime/stop-hook.sh\"" }] }
    ]
  }
}
```

Order of checks in `runtime/stop-hook.sh` (each failing check is `exit 0`):

1. `[ -d "${HITL_HOME:-$HOME/.hitl}/projects" ]` — before anything that starts node.
2. Root = git toplevel of the payload's `cwd` (same `payload_cwd` function and same fallback chain as the installed hook: `CLAUDE_PROJECT_DIR`, then `$PWD`); not a git folder → exit 0.
3. `[ ! -f "$root/.claude/hitl.json" ]`.
4. `base=$(node "$HERE/session.mjs" get --worktree "$root" --field base)` succeeds.
5. `mb=$(git merge-base HEAD "$base")`. If that fails, `mb` is empty and **every** spec and plan is checked (step 6 skips nothing), and the message gains the line `(base ref <base> was not found locally, so every spec and plan was checked — run git fetch)`.
6. For each `docs/superpowers/specs/*.md` and `docs/superpowers/plans/*.md` in the working tree: skip it when `git cat-file -e "$mb:$f"` succeeds (it existed before the feature); otherwise apply the installed hook's `has_reviewed_header` (header block = between the `# ` title and the first `## `).
7. None missing → exit 0. Otherwise exit 2 with this message on stderr:

```
Unreviewed artefact(s) in this hitl feature — run the review loop before ending the turn:
  - <path>
The line belongs in the header block, above the first '##' heading; one quoted further
down does not count. Specs: /hitl:review-spec. Plans: /hitl:review-plan. If the reviewer
failed, the command records a '**Reviewed:** round N failed' line.
```

- [ ] **Step 1: Write the failing tests.** Helpers as in `unreviewed-artifact.test.ts` (`gitRepoWith`, `GIT_ENV`), plus `register(root, base)` which runs `session.mjs start`. Each case runs the hook with stdin `{"cwd": "<root>"}` and `HITL_HOME`:

| case | expect |
|---|---|
| no `HITL_HOME/projects` directory | exit 0 |
| registered worktree, feature spec without the line | exit 2, stderr names the file and `/hitl:review-spec` |
| same, spec has `**Reviewed:** round 1 (2026-01-01).` in the header | exit 0 |
| same, the line only below the first `##` | exit 2 |
| un-marked spec committed on `main` before the branch, none added | exit 0 |
| that old spec plus a new un-marked plan on the branch | exit 2, stderr names only the plan |
| new un-marked spec, untracked (not committed) | exit 2 |
| repository has `.claude/hitl.json` and a record | exit 0 |
| un-marked spec, **no** record for this path | exit 0 |
| record for worktree A; hook run with `cwd` in the main checkout holding an un-marked spec | exit 0 |
| registered worktree checked out on `feat/x-slice-1-a`, carrying an un-marked feature plan | exit 2 |
| record whose `base` is `origin/nope` (no such ref), old un-marked spec on main | exit 2, stderr contains `was not found locally` |
| `cwd` not a git folder | exit 0 |
| stdin not JSON, `CLAUDE_PROJECT_DIR` = registered worktree with un-marked spec | exit 2 |

And the shared rule: one table of header fixtures (line in header; line after first `##`; line inside a fenced block in the header; `round 1 failed`; no title) run through **both** `.claude/hooks/unreviewed-artifact.sh` and `runtime/stop-hook.sh` (the latter in a registered worktree), asserting the same pass/refuse result for each.

- [ ] **Step 2:** `pnpm test -- plugin-stop-hook` → FAIL (script missing).
- [ ] **Step 3:** Write `runtime/stop-hook.sh` and `hooks/hooks.json`; `chmod +x`.
- [ ] **Step 4:** `pnpm test` and `pnpm format:check` → green.
- [ ] **Step 5:** Commit `feat(hooks): plugin Stop hook limited to no-install hitl features`.

## Dry run (human, before this slice merges)

`claude --plugin-dir <this worktree>`:

1. Scratch repository with no hitl files, after `/hitl:brainstorming`: commit an un-marked spec, try to end the turn → refused with the message above; run `/hitl:review-spec` → the turn ends.
2. Same repository, main checkout, a plain session with an un-marked spec lying there → not blocked.
3. Any unrelated repository on the machine, `/superpowers:brainstorming` with an un-marked spec → not blocked.
4. This repository (installed) → only the repository's own hook speaks.
