# Slice 5 — Install on GitLab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Owns:** `/hitl:init`, `/hitl:init --adopt` and `/hitl:help` accept and describe a GitLab repository: the installer renders the GitLab backend for `provider: gitlab`, and the prerequisite is the token, not `gh`.

**Goal:** A GitLab repository can be installed, and its install tells the human what it needs.

**Architecture:** `ownedFiles` renders the GitLab wrapper, its Node module and the host rule into `scripts/hitl/` for `provider: gitlab`. `render.mjs` and `adopt.mjs` validate the provider. `help.mjs` reports prerequisites for the repository's provider (manifest first, remote otherwise). The init and help prompts follow.

**Tech Stack:** Node 20+ ES modules, zero dependencies; vitest; Markdown prompts.

**Spec:** `docs/superpowers/specs/2026-11-15-gitlab-mr-design.md` (§ 3)

## Global Constraints

- Zero dependencies, Node 20+. Markdown is never formatted; code is Prettier `printWidth: 100`.
- `installer/lib.mjs` imports nothing from `runtime/` (it is imported from a tagged snapshot
  holding only `templates/`, `installer/`, `.claude-plugin/`).
- An installed GitLab repository gets exactly these backend files in `scripts/hitl/`:
  `backend.sh` (from `templates/scripts/backends/gitlab.sh`), `gitlab.mjs`
  (from `templates/scripts/backends/gitlab.mjs`), `host.mjs` (from `templates/scripts/host.mjs`),
  byte for byte. A GitHub repository gets none of the last two.
- Prerequisite checks never print the token's value; they report only whether it is set.
- Other hosts are still refused. No-install mode is slice 6.
- After any `templates/` change run both refreshes from `AGENTS.md`. Local gates: `pnpm test`,
  `pnpm format:check`.

## Review Focus

- An installed GitLab repository whose `GITLAB_TOKEN` is unset: `/hitl:help` must say so and
  name the `api` scope; nothing else about the install should read as broken.
- A self-hosted remote with `GITLAB_URL` unset: discovery says `unknown`; init's refusal must
  tell the human that a self-hosted GitLab needs `GITLAB_URL`, not just "no backend".
- A manifest with `provider: gitlab` on a machine where the remote no longer matches: help
  reports the provider from the manifest (the install is GitLab) and `gitlabUrl: "missing"`.
- An answers file with an unknown provider (`"bitbucket"`): refused before any write.
- Upgrading a GitHub install must not add `gitlab.mjs` or `host.mjs`.

---

### Task 1: The installer renders the GitLab backend

**Files:**
- Modify: `installer/lib.mjs`, `installer/render.mjs`, `installer/adopt.mjs`
- Test: `scripts/__tests__/lib.test.ts`, `render.test.ts`, `adopt.test.ts`

**Interfaces:**
- Produces:
  - `export const PROVIDERS = ["github", "gitlab"]` in `installer/lib.mjs`.
  - `ownedFiles(choices)` for `provider: "gitlab"` additionally returns
    `{ repoPath: "scripts/hitl/gitlab.mjs", template: "scripts/backends/gitlab.mjs", executable: true }` and
    `{ repoPath: "scripts/hitl/host.mjs", template: "scripts/host.mjs", executable: false }`;
    `scripts/hitl/backend.sh` already follows `choices.provider`.
  - `render.mjs` and `adopt.mjs` return
    `{ code: 3, out: { refused: "unknown-provider", provider, allowed: PROVIDERS } }` before
    any write when `choices.provider` is not in `PROVIDERS`.
  - `readmeBlock(version, provider = "github")`: the prerequisites line names `` `gh` `` for
    github and, for gitlab, "a `GITLAB_TOKEN` with the `api` scope (and `GITLAB_URL` for a
    self-hosted GitLab)". Its callers pass `choices.provider`.

- [ ] **Step 1: Write the failing tests:**
  - `lib.test.ts`: `ownedFiles` for gitlab has the three backend paths with the templates
    above; for github it has neither `gitlab.mjs` nor `host.mjs`;
  - `render.test.ts`: rendering `{ provider: "gitlab", testing: [], gates: [] }` into a temp
    repository writes `scripts/hitl/backend.sh`, `gitlab.mjs`, `host.mjs` byte-equal to their
    templates, the manifest says `"provider": "gitlab"` and hashes all three, and the README
    block names `GITLAB_TOKEN` and not `gh`;
  - `render.test.ts` and `adopt.test.ts`: `provider: "bitbucket"` → exit 3,
    `refused: "unknown-provider"`, nothing written;
  - `adopt.test.ts`: a tree already carrying the gitlab files adopts with `provider: gitlab`.
- [ ] **Step 2: Run** `pnpm test` — the new cases FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test` — PASS (this repository's own manifest is unchanged: it is
  github).
- [ ] **Step 5: Commit** `feat(installer): render the GitLab backend for provider gitlab`.

### Task 2: `/hitl:help` reports the host's prerequisite

**Files:**
- Modify: `installer/help.mjs`, `commands/help.md`
- Test: `scripts/__tests__/help.test.ts`

**Interfaces:**
- Consumes: `resolveHost` from `templates/scripts/host.mjs` (slice 3).
- Produces: `help.mjs`'s output gains `provider: "github" | "gitlab" | "bitbucket" | "unknown"`
  — the manifest's `provider` when there is a manifest, else the host of the `origin` remote
  — and `prerequisites` becomes:
  - always: `node`, `git`, `superpowers` (unchanged);
  - `provider` github or unknown/bitbucket: `gh` (unchanged probe);
  - `provider` gitlab: no `gh` key; `gitlabToken: boolean` (`GITLAB_TOKEN` non-empty) and
    `gitlabUrl: "not-needed" | "set" | "missing"` — `not-needed` when the remote is
    `gitlab.com`; `set` when `resolveHost` says gitlab through `GITLAB_URL`; `missing`
    otherwise.
  `run(args)` accepts an optional `env` (default `process.env`) so tests can pass one.

- [ ] **Step 1: Write the failing tests** in `help.test.ts`:
  - a GitLab manifest, remote `git@gitlab.com:g/r.git`, `GITLAB_TOKEN=t` → `provider: "gitlab"`,
    `prerequisites.gitlabToken === true`, `gitlabUrl === "not-needed"`, no `gh` key;
  - the same without the token → `gitlabToken === false`;
  - a GitLab manifest, remote `git@gitlab.corp:g/r.git`, no `GITLAB_URL` → `gitlabUrl: "missing"`;
    with `GITLAB_URL=https://gitlab.corp` → `"set"`;
  - no manifest, GitHub remote → `provider: "github"` and `gh` present as today;
  - the token's value appears nowhere in the output.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** `help.mjs`. **Step 4: Run** — PASS.
- [ ] **Step 5: Edit `commands/help.md`.** The prerequisites paragraph becomes: `node` (the
  installer **and the scripts under `scripts/hitl/`**), `git`, the superpowers plugin, and
  the code host's line by `provider`:
  - github: `gh` authenticated (the PR shim);
  - gitlab: `GITLAB_TOKEN` set — "a GitLab access token with the `api` scope, exported in the
    shell that runs Claude Code" — and, when `gitlabUrl` is `missing`, "`GITLAB_URL` set to
    the address of this self-hosted GitLab (e.g. `https://gitlab.example.com`)". Then one
    note, GitLab only: "hitl finds its merge requests by the `hitl` label it puts on them. A
    merge request opened by hand is invisible to hitl until that label is added."
- [ ] **Step 6: Commit** `feat(help): report the GitLab token and GITLAB_URL prerequisites`.

### Task 3: `/hitl:init` and `--adopt` accept GitLab

**Files:**
- Modify: `commands/init.md`
- Test: the test file that reads `commands/init.md` (grep `init.md` under `scripts/__tests__/`; use `plugin-prompts.test.ts` if none)

- [ ] **Step 1: Write the failing test:** `commands/init.md` contains `GITLAB_TOKEN`,
  `"provider": "<github|gitlab>"` and `GITLAB_URL`, and no longer contains `in v1`.
- [ ] **Step 2: Run** it — FAIL.
- [ ] **Step 3: Edit `commands/init.md`.**
  - § 1 Prerequisites: run discovery's host first, then check by host — `gh auth status` only
    when `host` is `github`; when `host` is `gitlab`, `[ -n "$GITLAB_TOKEN" ]`, and if it is
    empty stop with: "hitl needs a GitLab access token with the `api` scope in `GITLAB_TOKEN`.
    Export it in the shell that runs Claude Code, then re-run /hitl:init." Node 20+ is needed
    at run time too: say "the scripts hitl installs are run with it".
  - `--adopt` step 3 and § 2: `host` is `github` or `gitlab` → continue with
    `provider = <host>`. Any other host → stop with "no backend for <host>: hitl opens PRs on
    GitHub and GitLab." When `host` is `unknown` and `remote` is non-null, add: "If
    `<hostname of the remote>` is a self-hosted GitLab, export
    `GITLAB_URL=https://<hostname>` and re-run." When `remote` is null, keep "the origin
    remote could not be read".
  - `--adopt` step 5 and § 4: the answers file is
    `{ "provider": "<github|gitlab>", "testing": [...], "gates": [...] }`. Relay
    `refused: "unknown-provider"` as "no backend for <provider>".
  - After a GitLab render, add to the closing report: "Opening PRs needs `GITLAB_TOKEN` (and
    `GITLAB_URL` for a self-hosted GitLab) in every shell that runs the workflow —
    `/hitl:help` checks them."
- [ ] **Step 4: Run** `pnpm test` and `pnpm format:check` — PASS.
- [ ] **Step 5: Dry-run:** in a scratch git repository with `origin` set to
  `git@gitlab.com:g/r.git`, run
  `node installer/discover.mjs --repo <scratch>` (expect `"host": "gitlab"`), then
  `node installer/render.mjs --repo <scratch> --plugin-root . --answers <file with provider gitlab>`
  and `GITLAB_TOKEN= <scratch>/scripts/hitl/pr.sh list --head-prefix x` (expect exit 2 naming
  `GITLAB_TOKEN`). Note the outputs in the commit body.
- [ ] **Step 6: Commit** `feat(init): install hitl on a GitLab repository`.
