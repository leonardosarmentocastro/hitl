# hitl-command slice 5 — archive, wipe branch and cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Reviewed:** round 1 (2026-11-12) · round 2 (2026-11-12).

**Owns:** The feature's documents leave the branch through a generated wipe PR and are kept on the machine with no CI job, and a finished no-install feature is cleaned up by `/hitl:cleanup`.

**Goal:** Every `/hitl:implement-stack` and `/hitl:umbrella-pr` run archives the feature's documents to `~/.hitl` and rebuilds a one-commit `<feature branch>-wipe` draft PR at the tip of the stack; `/hitl:cleanup` works where nothing is installed and switches the guard off.

**Architecture:** `runtime/wipe.mjs` is a deterministic script: it computes the feature's documents by merge-base, archives them, builds the delete commit with git plumbing (a temporary index — the working tree and the checked-out branch are never touched), force-pushes only that branch and creates or retargets its PR through the shim, which gains a `retarget` verb. `installer/cleanup.mjs` learns which shim to use and about the wipe branch and the record.

**Tech Stack:** Node ≥ 20 ESM, bash, vitest with temp git repositories and the fake `gh`.

**Spec:** `docs/superpowers/specs/2026-11-12-hitl-command-design.md` — D3, D1 (`/hitl:cleanup`), G5, Constraints; forwarded item "exclude entries on cleanup".

## Global Constraints

- Local gates: `pnpm test` and `pnpm format:check`.
- The **only** branch this slice ever force-pushes is `<feature branch>-wipe`. `wipe.mjs` refuses any other target (see Task 2).
- `wipe.mjs` never checks out, resets or stashes: the session's working tree is on a slice branch with the implementer's state.
- The wipe branch is not a stack-table row: no template may add it to the handover table, and the handover agent is not changed.
- The `retarget` verb is a template change to the shim, so it reaches the installed mode: this repository's `scripts/hitl/` copies and manifest are regenerated (Task 1).
- `.git/info/exclude` entries are **left in place** by `/hitl:cleanup`: they are two ignore lines local to the clone, and the next feature needs them.
- Tests set `HITL_HOME`; never the real `~/.hitl`; never `docs/superpowers/` of this repository.
- ~20-file tripwire: about 22 files, because the `retarget` verb is mirrored into this repository's `scripts/hitl/`, the plugin's `runtime/pr/` and the manifest. The mirrors are generated.

## Consumed from earlier slices

- Slice 1: `memoryDir(repo)`, `getRecord(worktree)` → `{ worktree, topic, base, created }`, `endSession(worktree)`; `context.mjs`.
- Slice 2: `runtime/pr/pr.sh` (verbs `create`, `list`, `view`, `edit`, `comment`; records `{ number, url, head, base, state, draft, title, body, head_sha }`).
- Slice 4: the rendered `commands/implement-stack.md` and `commands/umbrella-pr.md` and their first-step context check; `scripts/__tests__/plugin-prompts.test.ts`.

## Review Focus

- A document added or renamed on a slice branch (not on the feature branch) must still be wiped and archived — Task 2.
- Specs that were on the base branch before the feature must never be deleted or archived — Task 2.
- Re-running after the wipe PR merged must do nothing — not push an empty commit, not empty the archive — Task 2.
- A wrong `--feature-branch` (say `main`) must not let the script force-push anything but a `-wipe` branch it built — Task 2.
- `/hitl:cleanup` in a repository without `scripts/hitl/pr.sh` must work, and in an installed repository must keep using the repository's shim — Task 4.

---

### Task 1: Shim verb `retarget`

**Files:**
- Modify: `templates/scripts/pr.sh`, `templates/scripts/backends/github.sh`, `scripts/__fixtures__/fake-gh/gh`, `scripts/__tests__/pr-shim.test.ts`; regenerated: `scripts/hitl/pr.sh`, `scripts/hitl/backend.sh`, `runtime/pr/pr.sh`, `runtime/pr/backend.sh`, `.claude/hitl.json`

**Interfaces:**
- Produces: `pr.sh retarget <number> --base <branch>` → prints the PR's record (with the new `base`); usage error (exit 1) without `--base` or with a non-numeric number; backend error exit 2. Backend function `backend_retarget <number> <base>` (`gh pr edit <number> --base <base>`, then the record). The header comment and `usage` list the verb.

- [ ] **Step 1: Failing tests** in `pr-shim.test.ts` (both shim paths): `retarget 7 --base feat/x` exits 0 and prints a record whose `base` is `feat/x`, and the fake `gh` recorded `pr edit 7 --base feat/x`; `retarget 7` → exit 1; `retarget x --base b` → exit 1; fake `gh` failing → exit 2.
- [ ] **Step 2:** `pnpm test -- pr-shim` → FAIL.
- [ ] **Step 3:** Implement in the two templates; teach the fake `gh` `pr edit --base`.
- [ ] **Step 4:** Refresh: copy the renders onto `scripts/hitl/`, run `render-plugin.mjs`, regenerate the manifest.
- [ ] **Step 5:** `pnpm test` → green.
- [ ] **Step 6:** Commit `feat(shim): retarget a PR's base`.

### Task 2: `runtime/wipe.mjs`

**Files:**
- Create: `runtime/wipe.mjs`
- Test: `scripts/__tests__/wipe.test.ts`

**Interfaces:**
- Consumes: `memoryDir`, `getRecord` (slice 1); the shim (`list`, `create`, `retarget`).
- Produces:
  - `featureDocs(repo: string, tip: string, base: string): string[]` — paths under `docs/superpowers/` that exist at `tip` and not at `git merge-base <tip> <base>`; sorted.
  - `archiveDocs(repo: string, tip: string, files: string[], dest: string): void` — `dest` ends up holding exactly those files (content from `git show <tip>:<path>`, path relative to `docs/superpowers/`); anything else previously in `dest` is removed.
  - `wipeCommit(repo: string, parentTip: string, files: string[]): string` — the sha of a commit whose parent is `parentTip` and whose tree is the parent's minus `files`, built with a temporary `GIT_INDEX_FILE`; message exactly `chore(docs): wipe transient superpowers artifacts [skip ci]`.
  - CLI `wipe.mjs archive --repo <worktree>` → archives `featureDocs(repo, "HEAD", record.base)` to the feature's archive folder and prints `{ status: "archived", archive, files }`; `{ status: "nothing-to-archive" }` when there are none (the folder is left as it is); exit 3 `no-record` without a record. No branch, push or PR.
  - CLI `wipe.mjs build --repo <worktree> --feature-branch <b> --parent <branch> --shim <path> [--no-push]` → one JSON document:
    - `--no-push` is the dry run: after the refusals and the `merged` / `nothing-to-wipe` checks it prints `{ status: "would-build", branch, parent, files }` and does nothing else — no archive, no `update-ref`, no push, no `create` or `retarget` call (it may call the shim's `list`).
    - no record for `<worktree>` → exit 3 `{ refused: "no-record" }`.
    - `<b>` is the record's base branch (`record.base` without its remote prefix), or `<parent>` is neither `<b>` nor a branch starting `<b>-` → exit 3 `{ refused: "bad-branch" }`.
    - `featureDocs` at the parent's tip is empty → `{ status: "merged", pr }` when a merged PR with head `<b>-wipe` exists, else `{ status: "nothing-to-wipe" }`; nothing archived, built or pushed either way.
    - `featureDocs` is not empty → build, **whatever merged PRs exist**: a merged `<b>-wipe` PR while documents are still on the branch belongs to an earlier feature that used the same name, and is ignored (only an *open* PR for that head is reused).
    - otherwise: archive to `<memoryDir>/features/<record.created>-<record.topic>/`; `git update-ref refs/heads/<b>-wipe <wipeCommit>`; `git push --force origin <b>-wipe`; PR: none open for that head → `create --draft --base <parent> --head <b>-wipe --title "Wipe transient docs: <b>"` with the body below; one open whose `base` differs → `retarget`; → `{ status: "built", branch, pr, archive, files }`.
    - The parent's tip is `origin/<parent>` when that ref exists, else the local branch. The base for `featureDocs` is `record.base`.
    - Any git or shim failure → exit 2 `{ error }`. A local `<b>-wipe` ref may be left behind by a failed push; that is harmless, because the next run resets it.

PR body, exactly:

```
Generated by hitl — do not edit; it is rebuilt on every run.

It deletes this feature's specs, plans and handover from the branch. They are transient: the
PR descriptions are the record. Merge this **last** — after every slice, and before the
umbrella PR. Fix-up rounds happen before it merges.
```

- [ ] **Step 1: Write the failing tests** (temp repo with a bare `origin`, fake `gh` on `PATH`, `HITL_HOME` temp, a record started with `session.mjs start`):
  - `featureDocs`: old spec committed on `main` + feature spec, plan and handover on `feat/x` + one plan added on `feat/x-slice-1-a` → at the slice tip returns the four feature files, never the old spec; at `feat/x` returns three.
  - `archiveDocs`: writes the files; a second call with fewer files removes the stale one.
  - `wipeCommit`: `git diff --name-status <parent> <sha>` lists exactly the files as `D`; `git status --porcelain` in the worktree and `git rev-parse HEAD` are unchanged by the call.
  - `build`: first run → `status: "built"`, `origin/feat/x-wipe` has one commit over the parent, the old spec still exists in its tree, the fake `gh` saw `pr create --draft … --base feat/x-slice-1-a`, the archive folder is `features/<today>-x/` with the four files.
  - second `build` with `--parent feat/x` after the PR exists on base `feat/x-slice-1-a` → fake `gh` saw `pr edit <n> --base feat/x`; `origin/feat/x-wipe`'s parent is `feat/x`'s tip; **no second `pr create`**.
  - rebuild after a new commit on the parent → the wipe branch is again exactly one commit over the new tip (the push was forced).
  - parent with no feature documents left and fake `gh` listing a merged wipe PR → `status: "merged"`, no push (`origin/feat/x-wipe` unchanged), archive untouched.
  - parent still carrying the feature documents and fake `gh` listing a **merged** wipe PR (an earlier feature of the same name) and no open one → `status: "built"` and the fake `gh` saw a new `pr create`.
  - parent with no feature documents → `nothing-to-wipe`.
  - `build --no-push` → `status: "would-build"` with the files; `origin` has no `feat/x-wipe`, no local `feat/x-wipe` ref exists, the archive folder does not exist, and the fake `gh` log holds no `pr create` or `pr edit`.
  - `archive` on a slice branch → the folder holds the four files and no ref or `gh` call was made; `archive` without a record → exit 3.
  - `--feature-branch main` → exit 3 `bad-branch`; `--parent other/branch` → exit 3 `bad-branch`; no record → exit 3 `no-record`.
- [ ] **Step 2:** `pnpm test -- wipe` → FAIL.
- [ ] **Step 3:** Implement `runtime/wipe.mjs`.
- [ ] **Step 4:** `pnpm test -- wipe` → PASS.
- [ ] **Step 5:** Commit `feat(runtime): archive the feature's documents and build the wipe branch`.

### Task 3: Wire the wipe into the two commands

**Files:**
- Modify: `templates/claude/commands/implement-stack.md`, `templates/claude/commands/umbrella-pr.md`; rendered `commands/implement-stack.md`, `commands/umbrella-pr.md`
- Test: `scripts/__tests__/plugin-prompts.test.ts`

No-install mode blocks only (the installed render does not change):

- **`umbrella-pr`, a new step before the body is built.** It fetches first, because this is the command re-run after slices merged on the host and the parent's tip must be current:

  ```bash
  git fetch -q --prune origin
  node "${CLAUDE_PLUGIN_ROOT}/runtime/wipe.mjs" build --repo "$PWD" --feature-branch "<feature-branch>" --parent "<parent>" --shim "${CLAUDE_PLUGIN_ROOT}/runtime/pr/pr.sh"
  ```

  `<parent>` is the branch of the last stack-table row whose PR is not merged, or the feature branch when every slice has merged. `refused` or `error` → stop and report it verbatim. This is the command the human re-runs after merging slices on the host. **Under `--dry-run` the same call carries `--no-push`**: nothing is archived, pushed or opened, and the printed body shows the line for `would-build` as `Required before merge: the wipe PR (not built in a dry run).`
- **`umbrella-pr`, the stack block:** inside the `<!-- stack -->` markers, after the table, one line by status — `built`: `Required before merge: #<pr> removes the transient docs — merge it last. Fix-ups happen before it merges.`; `merged`: `Transient docs removed by #<pr>.`; `nothing-to-wipe`: no line.
- **`implement-stack` § 0**, after its `git fetch`: `node "${CLAUDE_PLUGIN_ROOT}/runtime/wipe.mjs" archive --repo "$PWD"` — every run archives, including one that later stops on a blocked slice (spec D3.3). A `refused` or `error` here is reported and the run continues: the archive is a convenience, never a gate.
- **`implement-stack` § 2:** unchanged in substance — it runs `/hitl:umbrella-pr`, which now builds the wipe. One added sentence in the final report: `The wipe PR #<pr> is generated; merge it last.` And in § Never, after "Force-push unasked": `(the generated wipe branch is the one exception, and only wipe.mjs pushes it)`.

- [ ] **Step 1: Extend the test:**

```ts
const u = rendered.get("commands/umbrella-pr.md")!.content;
expect(u).toContain('runtime/wipe.mjs" build --repo "$PWD" --feature-branch');
expect(u).toContain("Required before merge: #<pr>");
expect(u.indexOf("runtime/wipe.mjs")).toBeGreaterThan(u.indexOf("--require no-install,github,gates"));
expect(u.indexOf("git fetch -q --prune origin")).toBeLessThan(u.indexOf("runtime/wipe.mjs"));
expect(u.indexOf("git fetch -q --prune origin")).toBeGreaterThan(-1);
expect(u).toContain("--no-push");
expect(u).toContain("not built in a dry run");
expect(rendered.get("commands/implement-stack.md")!.content).toContain('runtime/wipe.mjs" archive --repo "$PWD"');
expect(rendered.get("commands/implement-stack.md")!.content).toContain("only wipe.mjs pushes it");
const installed = renderAll(ROOT, THIS_REPO_CHOICES);
expect(installed.get(".claude/commands/umbrella-pr.md")!.content).not.toContain("wipe.mjs");
```

- [ ] **Step 2:** `pnpm test -- plugin-prompts` → FAIL.
- [ ] **Step 3:** Add the mode blocks; re-render.
- [ ] **Step 4:** `pnpm test` → green, `self-manifest` included with no regeneration.
- [ ] **Step 5:** Commit `feat(commands): build the wipe PR from /hitl:umbrella-pr`.

### Task 4: `/hitl:cleanup` in both modes

**Files:**
- Modify: `installer/cleanup.mjs`, `commands/cleanup.md`, `scripts/__tests__/cleanup.test.ts`, `README.md`, `.claude-plugin/plugin.json`

**Interfaces:**
- Consumes: `getRecord`, `endSession`, `memoryDir` (slice 1).
- Produces: `cleanup.mjs --repo <dir> [--plugin-root <dir>] [--remove …]`.
  - Shim: `<main>/scripts/hitl/pr.sh` when `<main>/.claude/hitl.json` exists; otherwise `<plugin-root>/runtime/pr/pr.sh`; neither available → exit 2 `{ error: "no PR shim: pass --plugin-root" }`.
  - Base: today `BASE` is the constant `origin/main`. In a no-install repository each entry is compared against its own record's `base` (`getRecord(<worktree path>)`); an entry without a record, and every entry of an installed repository, keeps `origin/main`. The "does not exist after the fetch" check applies per base in use.
  - `branches` of an entry also includes `<branch>-wipe` when it exists locally; it is subject to the same `isSaved` proof as a slice branch and is deleted with the others on removal.
  - New per-entry field `docsOnBase: string[]`: for a `merged` entry in a no-install repository with a record, the files of the feature's archive folder (`<memoryDir>/features/<created>-<topic>/`, mapped back under `docs/superpowers/`) that exist at the entry's base. `[]` otherwise.
  - On a successful removal in a no-install repository: `endSession(<worktree path>)`; the `removed` entry gains `recordCleared: boolean`.
- `commands/cleanup.md` passes `--plugin-root "${CLAUDE_PLUGIN_ROOT}"` on both invocations and, for an entry with a non-empty `docsOnBase`, prints: `These transient documents reached main because the wipe PR did not merge first — remove them by hand:` followed by the paths.

- [ ] **Step 1: Failing tests** in `cleanup.test.ts` (existing helpers; the stub shim fixture placed at `<plugin-root>/runtime/pr/pr.sh` for the no-install cases):
  - repository without `scripts/hitl/` and without `--plugin-root` → exit 2 with the error above; with `--plugin-root` → classified as before.
  - installed repository (manifest + its own stub shim) with a `--plugin-root` whose shim would fail → still exit 0 (the repository's shim was used).
  - merged feature with a pushed `feat/x-wipe` → `branches` includes it; removal deletes it.
  - `feat/x-wipe` with a local commit on no remote → `has unsaved work`.
  - merged, archive lists a spec that exists at `origin/main` → `docsOnBase` holds that path; when the wipe merged first (file absent on main) → `[]`.
  - no-install repository whose default branch is `develop`, record base `origin/develop`, no `origin/main` at all → classified (not exit 2), and an untouched feature branch is `abandoned` against `origin/develop`.
  - removal in a no-install repository with a record → `recordCleared: true`, and `session.mjs get` then exits 3; in an installed repository → no record touched.
  - after that removal, `<git common dir>/info/exclude` is byte-identical to before (the two hitl lines stay).
- [ ] **Step 2:** `pnpm test -- cleanup` → FAIL.
- [ ] **Step 3:** Implement in `installer/cleanup.mjs`; update `commands/cleanup.md`.
- [ ] **Step 4:** `pnpm test` → green.
- [ ] **Step 5:** Docs, no test: `README.md` gains a section "Use it without installing" (what `/hitl:brainstorming` does; where memory lives; GitHub for PRs, design-only elsewhere with a link to issue #19; the wipe PR merges last); `.claude-plugin/plugin.json` `description` becomes `A human-in-the-loop delivery workflow for Claude Code (spec, plan and slice reviews, stacked slice PRs, a Stop hook): install it into a repository with /hitl:init, or run it anywhere with /hitl:brainstorming.` `pnpm format:check` → green.
- [ ] **Step 6:** Commit `feat(cleanup): work without an install, know the wipe branch, clear the record`.

## Dry run (human, before this slice merges)

Scratch GitHub repository with no hitl files, `claude --plugin-dir <this worktree>`, continuing from slice 4's dry run:

1. `/hitl:umbrella-pr` → a draft PR `feat/<topic>-wipe` on the last slice branch whose diff is only deletions under `docs/superpowers/`; the umbrella body names it as required before merge; `~/.hitl/projects/<key>/features/<date>-<topic>/` holds the spec, plans and handover.
2. Merge slice 1 and 2 on GitHub; run `/hitl:umbrella-pr` again → the same PR number, now based on the feature branch, still one commit.
3. Merge the wipe PR, then the umbrella; from the main checkout run `/hitl:cleanup` → the worktree is offered and removed with its branches, no `docsOnBase` warning; a new session in that repository is not gated.
4. Repeat 1–3 but merge the umbrella without the wipe → `/hitl:cleanup` prints the "reached main" list.
