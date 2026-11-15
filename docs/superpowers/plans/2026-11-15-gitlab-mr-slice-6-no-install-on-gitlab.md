# Slice 6 — No-install on GitLab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Owns:** without an install, the plugin's shim picks the GitLab or GitHub backend from the repository's remote, and the plugin's commands run a stack on GitLab.

**Goal:** `/hitl:implement-stack` and `/hitl:umbrella-pr` open Draft MRs on a GitLab project where hitl is not installed.

**Architecture:** The plugin's `runtime/pr/backend.sh` becomes a dispatcher that, on the first backend call, asks the host rule which host the `origin` remote is and sources that backend. `runtime/context.mjs`'s `github` requirement becomes `host` (any host with a backend). The mode-gated prompt text that refused non-GitHub hosts now refuses only hosts without a backend.

**Tech Stack:** Node 20+ ES modules, zero dependencies; bash; vitest; Markdown prompts.

**Spec:** `docs/superpowers/specs/2026-11-15-gitlab-mr-design.md` (§ 4)

## Global Constraints

- Zero dependencies, Node 20+. Markdown is never formatted; code is Prettier `printWidth: 100`.
- The host is decided only by `templates/scripts/host.mjs` (slice 3). The dispatcher and
  `context.mjs` call it; neither re-implements any part of the rule.
- A usage error (`pr.sh` exit 1) must still be reported without running any backend and
  without needing a git repository: the dispatcher resolves the host lazily, on the first
  `backend_*` call.
- The token goes only to the backend the remote selected: a GitHub remote never triggers an
  HTTP request to GitLab; a GitLab remote never runs `gh`.
- The refusal line for a host with no backend, used verbatim by every prompt below:
  `No PR backend for this repository's host (<host>): hitl opens PRs on GitHub and GitLab. A self-hosted GitLab needs GITLAB_URL set to its address. Implement from the handover by hand.`
- After any `templates/` change run both refreshes from `AGENTS.md`. Local gates: `pnpm test`,
  `pnpm format:check`.

## Review Focus

- A repository with no `origin` remote, or run outside a git repository: `list` exits 2 with
  the no-backend message; it must not fall back to `gh`.
- `GITLAB_URL` exported globally while working in a GitHub repository: the GitHub backend
  answers and no request reaches the GitLab host.
- A Bitbucket remote: design sessions still run (`/hitl:brainstorming`), with the one-line
  notice; `/hitl:implement-stack` refuses before any fetch, checkout or branch.
- The existing plugin-shim tests ran in a directory that is not a repository; they must now
  run in one with a GitHub `origin`, and still prove usage errors call nothing.
- A GitLab repository without `GITLAB_TOKEN`: `/hitl:brainstorming` stops and names the token
  before creating a worktree.

---

### Task 1: The plugin's shim picks the backend per call

**Files:**
- Create: `templates/scripts/backends/dispatch.sh`
- Modify: `templates/scripts/host.mjs` (a CLI), `installer/lib.mjs` (`pluginFiles`)
- Create (rendered): `runtime/pr/backend-github.sh`, `runtime/pr/backend-gitlab.sh`, `runtime/pr/gitlab.mjs`, `runtime/pr/host.mjs`; Modify (rendered): `runtime/pr/backend.sh`
- Test: `scripts/__tests__/host.test.ts`, `scripts/__tests__/pr-shim.test.ts`, `scripts/__tests__/pr-shim-dispatch.test.ts`

**Interfaces:**
- `templates/scripts/host.mjs` gains a CLI (when run as main; the same realpath `isMain` check
  the other scripts use): `node host.mjs` prints the `host` word of the current directory's
  `origin` remote (`git remote get-url origin`; no remote or not a repository → `unknown`) and
  exits 0.
- `pluginFiles()` becomes, for the shim:
  - `runtime/pr/backend.sh` ← `scripts/backends/dispatch.sh` (executable)
  - `runtime/pr/backend-github.sh` ← `scripts/backends/github.sh`
  - `runtime/pr/backend-gitlab.sh` ← `scripts/backends/gitlab.sh`
  - `runtime/pr/gitlab.mjs` ← `scripts/backends/gitlab.mjs`
  - `runtime/pr/host.mjs` ← `scripts/host.mjs`
- `templates/scripts/backends/dispatch.sh` — sourced by `pr.sh`. It defines the six
  `backend_<verb>` functions; each calls `hitl_load_backend` and then calls itself again (the
  loaded backend has redefined it). `hitl_load_backend` runs `node "$HERE/host.mjs"` and:
  `github` → `. "$HERE/backend-github.sh"`; `gitlab` → `. "$HERE/backend-gitlab.sh"`; anything
  else → stderr `pr.sh: no PR backend for this repository's host (<host>): hitl opens PRs on GitHub and GitLab. A self-hosted GitLab needs GITLAB_URL set to its address.` and `exit 2`.
- Installed mode is untouched: `scripts/hitl/backend.sh` is still the provider's own backend.

- [ ] **Step 1: Write the failing tests.**
  - `host.test.ts`: the CLI prints `github`, `gitlab` (with `GITLAB_URL` matching) and
    `unknown` (no remote; not a repository) for temp directories.
  - `pr-shim.test.ts`: `runShim` now runs in a temp git repository whose `origin` is
    `git@github.com:o/r.git` (both shims). Every existing case must pass unchanged — including
    "exits 1 on a usage error without calling gh". Add, for the plugin shim only: a usage
    error in a directory that is **not** a repository still exits 1.
  - new `pr-shim-dispatch.test.ts`, all through `runtime/pr/pr.sh` (use slice 3's
    `startFakeGitlab` and `repoWithOrigin`, and the fake `gh` on `PATH` with its log):
    - GitHub remote, `GITLAB_URL` and `GITLAB_TOKEN` set to the fake GitLab → `list` answers
      from the fake `gh`; the fake GitLab logged zero requests;
    - remote at the fake GitLab with `GITLAB_URL` matching → `list` answers from the fake
      GitLab; the fake `gh` log is empty;
    - `git@gitlab.com:g/r.git` remote with no token → exit 2 naming `GITLAB_TOKEN`, fake `gh`
      log empty (the GitLab backend was chosen);
    - Bitbucket remote, no remote, and not a repository → exit 2, stderr contains
      `no PR backend`, both logs empty.
- [ ] **Step 2: Run** `pnpm test` — the new cases FAIL.
- [ ] **Step 3: Implement** the CLI, `dispatch.sh` and the `pluginFiles` entries; run
  `node installer/render-plugin.mjs --plugin-root .`.
- [ ] **Step 4: Run** `pnpm test` — PASS (plugin-drift included; `wipe.test.ts` and
  `cleanup.test.ts` use the plugin shim — give their temp repositories a GitHub `origin` if
  they have none).
- [ ] **Step 5: Commit** `feat(runtime): the plugin's PR shim picks the backend from the remote`.

### Task 2: `context.mjs` requires a host with a backend

**Files:**
- Modify: `runtime/context.mjs`
- Test: `scripts/__tests__/context.test.ts`

**Interfaces:**
- Produces: `REQUIREMENTS = ["no-install", "host", "gates"]`; `--require github` is now a
  usage error. With `host` required, a `ctx.host` that is not `github` or `gitlab` refuses
  `{ refused: "no-backend", host: ctx.host }` (exit 3), in the same position in the fixed
  order the `github` check had. `ctx.host` and the brief's `Host:` line already come from
  `hostOf`, which now honours `GITLAB_URL`.

- [ ] **Step 1: Write the failing tests** in `context.test.ts`: `--require host` passes for a
  GitHub remote and for a `gitlab.com` remote; passes for a self-hosted remote with
  `GITLAB_URL` matching and refuses `no-backend` with `host: "unknown"` without it; refuses
  for Bitbucket; `--require github` exits 1; the brief prints `Host: gitlab`. Rewrite the
  existing `not-github` cases.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(context): require a host with a backend, not GitHub`.

### Task 3: The plugin's commands and agents run on GitLab

**Files:**
- Modify: `templates/claude/commands/implement-stack.md`, `templates/claude/commands/umbrella-pr.md`, `templates/claude/commands/handover.md`, `templates/claude/commands/review-plan.md`, `templates/claude/agents/handover.md`
- Modify: `commands/brainstorming.md`, `README.md`
- Modify (rendered): `commands/*.md`, `agents/handover.md`, `.claude/commands/*.md`, `.claude/agents/handover.md`, `.claude/hitl.json`
- Test: `scripts/__tests__/plugin-prompts.test.ts`, `scripts/__tests__/brainstorming-command.test.ts`

- [ ] **Step 1: Write the failing tests:**
  - `plugin-prompts.test.ts`: no file under `commands/`, `agents/`, `templates/` or
    `README.md` contains `issues/19`, `not-github` or `--require no-install,github`; the
    rendered `commands/implement-stack.md` and `commands/umbrella-pr.md` contain
    `--require no-install,host,gates`, `refused: "no-backend"` and the refusal line from
    Global Constraints;
  - `brainstorming-command.test.ts`: `commands/brainstorming.md` contains `GITLAB_TOKEN` and
    the phrase `no PR backend`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Edit the templates** (no-install branches only):
  - `implement-stack.md`, `umbrella-pr.md`: the context call requires
    `no-install,host,gates`; the `refused: "not-github"` bullet becomes
    `refused: "no-backend"` and prints the refusal line with the output's `host`.
  - `agents/handover.md`: "only when the block's `Host:` line says `github`" → "only when the
    block's `Host:` line says `github` or `gitlab`"; the fallback sentence becomes "If the
    `Host:` is neither, do not run the PR shim: …" (rest unchanged).
  - `commands/handover.md` and `commands/review-plan.md`: "When the block's `Host:` is not
    `github`, print …issue #19…" → "When the block's `Host:` is neither `github` nor
    `gitlab`, print after the launch line, exactly:" followed by the refusal line with
    `/implement-stack will refuse:` put in front of it.
- [ ] **Step 4: Edit `commands/brainstorming.md`** § 2 Mode: three bullets replace the two
  host bullets —
  - `host: "github"` → require `gh auth status` (unchanged);
  - `host: "gitlab"` → require a non-empty `GITLAB_TOKEN`; if it is empty, stop and say:
    "hitl needs a GitLab access token with the `api` scope in `GITLAB_TOKEN`. Export it in
    the shell that runs Claude Code, then re-run /hitl:brainstorming.";
  - any other host → say exactly, once, "Design session only here: there is no PR backend
    for this repository's host (<host>). A self-hosted GitLab needs GITLAB_URL set to its
    address." and continue; neither `gh` nor the token is required.
- [ ] **Step 5: Edit `README.md`:** the prerequisites sentence (near "GitHub is the only code
  host for now") names both hosts — `gh` signed in for GitHub; `GITLAB_TOKEN` with the `api`
  scope, plus `GITLAB_URL` for a self-hosted instance, for GitLab; the limitation bullet that
  links issue #19 is replaced by one line: "Code hosts: GitHub and GitLab. hitl labels the
  merge requests it opens `hitl` and finds them by that label."
- [ ] **Step 6: Re-render** (both refreshes); run `pnpm test` and `pnpm format:check` — PASS.
- [ ] **Step 7: Dry-run:** in a scratch repository with `origin` `git@gitlab.com:g/r.git`,
  run `node runtime/context.mjs --repo <scratch> --plugin-root . --require no-install,host`
  (expect exit 0, `"host": "gitlab"`), then with a Bitbucket origin (expect exit 3,
  `refused: "no-backend"`). Note the outputs in the commit body. The first real run on a
  GitLab project is watched by a human, as the spec says.
- [ ] **Step 8: Commit** `feat(commands): run the no-install workflow on GitLab`.
