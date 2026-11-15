# Slice 3 — GitLab backend, reading — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Reviewed:** round 1 (2026-11-15) · round 2 (2026-11-15).

**Owns:** the PR shim's `list` and `view` answer from GitLab over REST — with the one host rule (`GITLAB_URL` matched against the remote), the token and host refusals, and `ref` on the record of both backends.

**Goal:** `pr.sh list` and `pr.sh view` work against a GitLab project using only `GITLAB_TOKEN`, held to the shim's existing contract by tests against a fake API.

**Architecture:** One self-contained host rule (`templates/scripts/host.mjs`) decides host, API base and project id; the installer imports it directly. The GitLab backend is a bash wrapper (`templates/scripts/backends/gitlab.sh`) that forwards each verb to a Node module (`templates/scripts/backends/gitlab.mjs`) using built-in `fetch`. Tests assemble a shim directory from the templates and run it against a fake GitLab server that lives in its own process.

**Tech Stack:** Node 20+ ES modules (`fetch`, `node:http`), zero dependencies; bash; vitest.

**Spec:** `docs/superpowers/specs/2026-11-15-gitlab-mr-design.md` (§ 1, § 2)

## Global Constraints

- Zero dependencies, Node 20+. `host.mjs` and `gitlab.mjs` import only `node:` modules and
  each other (`gitlab.mjs` imports `./host.mjs` — they are always installed side by side).
- The shim contract is unchanged: one JSON document on stdout; exit 0 ok · 1 usage · 2 backend
  error (message on stderr) · 3 create-exists. `pr.sh` itself is not edited in this slice.
- The token is sent only as the `PRIVATE-TOKEN` header, only to the resolved API base, and is
  never printed (not in errors, not in logs).
- Every `fetch` uses `redirect: "manual"`; a 3xx is exit 2 naming `GITLAB_URL` and the
  `Location` header. Pages are requested by `page=<n>` against the same base.
- The word is "PR" in every message.
- Installing these files (`ownedFiles`, `/hitl:init`) is slice 5; the plugin's shim is slice 6;
  `create`, `edit`, `comment`, `retarget` are slice 4. Do not do them here.
- Markdown is never formatted; code is Prettier `printWidth: 100`. Local gates: `pnpm test`,
  `pnpm format:check`. Tests use temp directories and `scripts/__fixtures__/`.

## Review Focus

- A `GITLAB_URL` exported for a company instance while the repository's remote is
  `gitlab.com`: the API base must be `https://gitlab.com`, and the token must not go to the
  company host.
- A remote in each form — `https://host/g/r.git`, `ssh://git@host:2222/g/r.git`,
  `git@host:g/sub/r.git` — yields the same project id rules (`g%2Fsub%2Fr`), with or without
  the trailing `.git`.
- More than 100 results: `list` and `view`'s discussions must read every page; a page that
  fails must fail the whole call (exit 2), never return the pages read so far.
- A merge request whose `description` is `null`, or whose state is `locked`.
- A thread with replies where the last reply changes the request: all of it must reach
  `reviews[].body`.

---

### Task 1: The host rule

**Files:**
- Create: `templates/scripts/host.mjs`
- Modify: `installer/discover.mjs`
- Test: `scripts/__tests__/host.test.ts`, `scripts/__tests__/discover.test.ts`

**Interfaces:**
- Produces, exported from `templates/scripts/host.mjs`:
  - `resolveHost(remote: string | null, env?: Record<string,string|undefined>): { host: "github"|"gitlab"|"bitbucket"|"unknown", apiBase?: string, project?: string, problem?: "bad-gitlab-url" | "gitlab-url-has-api-path" }`
    — `env` defaults to `process.env`. `apiBase` (no trailing slash, no `/api/v4`) and
    `project` (already URL-encoded) are present exactly when `host` is `"gitlab"`. `problem` is
    present when `GITLAB_URL` is set and unusable; the host is then decided as if it were unset.
  - `hostOf(remote, env?)`: `resolveHost(remote, env).host`.
- `installer/discover.mjs` deletes its own `hostOf` and re-exports this one
  (`export { hostOf } from "../templates/scripts/host.mjs"`), so `runtime/context.mjs` and
  every existing caller keep working; `discover()` calls it with `process.env`.

The rule (spec § 1), as a case table the test encodes with `it.each`:

| remote | `GITLAB_URL` | host | apiBase | project |
|---|---|---|---|---|
| `git@github.com:o/r.git` | — | github | — | — |
| `https://bitbucket.org/o/r` | — | bitbucket | — | — |
| `https://gitlab.com/g/r.git` | — | gitlab | `https://gitlab.com` | `g%2Fr` |
| `git@gitlab.com:g/sub/r.git` | `https://gitlab.corp` | gitlab | `https://gitlab.com` | `g%2Fsub%2Fr` |
| `git@GitLab.Corp:g/r.git` | `https://gitlab.corp` | gitlab | `https://gitlab.corp` | `g%2Fr` |
| `ssh://git@gitlab.corp:2222/g/r.git` | `https://gitlab.corp/` | gitlab | `https://gitlab.corp` | `g%2Fr` |
| `http://127.0.0.1:4010/g/r.git` | `http://127.0.0.1:4010` | gitlab | `http://127.0.0.1:4010` | `g%2Fr` |
| `https://host/gitlab/g/r.git` | `https://host/gitlab` | gitlab | `https://host/gitlab` | `g%2Fr` |
| `https://host/gitops/r.git` | `https://host/git` | gitlab | `https://host/git` | `gitops%2Fr` |
| `git@host:g/r.git` | `https://host/gitlab` | gitlab | `https://host/gitlab` | `g%2Fr` |
| `git@gitlab.corp:g/r.git` | — | unknown | — | — |
| `git@gitlab.corp:g/r.git` | `gitlab.corp` (no scheme) | unknown, problem `bad-gitlab-url` | — | — |
| `git@gitlab.corp:g/r.git` | `` (empty) | unknown, no problem | — | — |
| `git@gitlab.corp:g/r.git` | `https://gitlab.corp/api/v4` | unknown, problem `gitlab-url-has-api-path` | — | — |
| `git@gitlab.corp:g/r.git` | `https://gitlab.corp/api/v4/` | unknown, problem `gitlab-url-has-api-path` | — | — |
| `git@gitlab.corp:g/r.git` | `gitlab.corp:8443` | unknown, problem `bad-gitlab-url` | — | — |
| `git@other.corp:g/r.git` | `https://gitlab.corp` | unknown | — | — |
| `null` | — | unknown | — | — |

Notes that decide the rows: hostnames compare case-insensitively and ignore the port; an
empty `GITLAB_URL` is unset; the `GITLAB_URL` path is stripped from an https remote's path
only on a path-segment boundary (`/git` does not match `/gitops/...`); a `GITLAB_URL` whose
path ends in `/api/v4` (with or without a trailing slash) is a problem, not a base; a
`GITLAB_URL` is usable only when it parses **and** its scheme is `http:` or `https:`
(`gitlab.corp:8443` parses, with scheme `gitlab.corp:`, and is a problem).

- [ ] **Step 1: Write the failing test** `scripts/__tests__/host.test.ts` with the table above
  (assert `host`, `apiBase`, `project`, `problem` per row), plus in `discover.test.ts`:
  `hostOf` is still exported from `installer/discover.mjs` and returns `"gitlab"` for a
  self-hosted remote when passed `{ GITLAB_URL: ... }`.
- [ ] **Step 2: Run** `pnpm test scripts/__tests__/host.test.ts` — FAIL (module not found).
- [ ] **Step 3: Implement** `resolveHost` and `hostOf`; switch `discover.mjs` over.
- [ ] **Step 4: Run** `pnpm test` — PASS.
- [ ] **Step 5: Commit** `feat(host): one rule for host, API base and project, with GITLAB_URL`.

### Task 2: A fake GitLab and a shim assembled from the templates

**Files:**
- Create: `scripts/__fixtures__/fake-gitlab/server.mjs`
- Create: `scripts/__tests__/helpers/gitlab.ts`
- Create: `templates/scripts/backends/gitlab.sh`, `templates/scripts/backends/gitlab.mjs`
- Test: `scripts/__tests__/pr-shim-gitlab.test.ts`

**Interfaces:**
- `scripts/__fixtures__/fake-gitlab/server.mjs` — run as
  `node server.mjs --state <json file> --log <file>`; listens on `127.0.0.1` port 0 and prints
  `{"port":<n>}` as its first stdout line. It re-reads the state file on every request:
  `{ mode?: "ok"|"fail"|"redirect", mergeRequests: MR[], approvals: { [iid]: { approved_by: [{ user: { username } }] } }, discussions: { [iid]: Discussion[] } }`
  with `MR` and `Discussion` in GitLab's REST shape. Routes under
  `/api/v4/projects/:id/` (`:id` is the URL-encoded path; any other id → 404
  `{"message":"404 Project Not Found"}`): `GET merge_requests` (filters `state`, `labels`,
  `source_branch`, `target_branch`; `page`, `per_page`, default 20, sets `x-next-page`),
  `GET merge_requests/:iid`, `GET merge_requests/:iid/approvals`,
  `GET merge_requests/:iid/discussions` (paged the same way). `mode: "fail"` → every request
  500 `{"message":"boom"}`; `mode: "redirect"` → every request 301 with
  `Location: http://127.0.0.1:1/elsewhere`. Every request appends one JSON line to the log:
  `{ method, path, query, token: <the PRIVATE-TOKEN header or null>, body }`.
- `scripts/__tests__/helpers/gitlab.ts` exports:
  - `startFakeGitlab(state): Promise<{ url: string, setState(s): void, requests(): Req[], stop(): void }>`
    (spawns the server asynchronously, resolves when the port line arrives);
  - `gitlabShimDir(): string` — a temp directory holding `templates/scripts/pr.sh` as `pr.sh`,
    `backends/gitlab.sh` as `backend.sh`, `backends/gitlab.mjs` as `gitlab.mjs` and
    `host.mjs`, all executable where the source is;
  - `repoWithOrigin(remoteUrl: string): string` — a temp git repository with that `origin`;
  - `runGitlabShim(shimDir, repo, args, env): { status, stdout, stderr, json }` — `spawnSync`
    of `<shimDir>/pr.sh` with `cwd: repo`; the caller passes `GITLAB_URL` and `GITLAB_TOKEN`.
    (`spawnSync` is safe here because the server is another process.)
- `templates/scripts/backends/gitlab.sh` — sourced by `pr.sh`, never run directly. It defines
  all six functions once, each forwarding its arguments unchanged:
  `backend_<verb>() { node "$HERE/gitlab.mjs" <verb> "$@"; }` for `view`, `list`, `create`,
  `edit`, `comment`, `retarget`. `pr.sh` runs under `set -e`, so the Node process's exit code
  is the shim's.
- `templates/scripts/backends/gitlab.mjs` — CLI `node gitlab.mjs <verb> <args…>` with the
  argument order `pr.sh` passes to `backend_<verb>`. Before any request, in this order:
  1. `GITLAB_TOKEN` unset or empty → stderr
     `pr.sh: GITLAB_TOKEN is not set. Create a GitLab access token with the api scope and export it.`, exit 2;
  2. `resolveHost(<git remote get-url origin>, process.env)` is not `gitlab` → stderr, exit 2:
     with `problem: "bad-gitlab-url"`: `pr.sh: GITLAB_URL is not a URL (it needs a scheme, e.g. https://gitlab.example.com).`;
     with `problem: "gitlab-url-has-api-path"`: `pr.sh: GITLAB_URL must be the instance's address, without /api/v4.`;
     otherwise: `pr.sh: the origin remote is not gitlab.com and does not match GITLAB_URL. For a self-hosted GitLab, set GITLAB_URL to its address; an instance whose ssh hostname differs from its web hostname needs an https remote.`
  A verb this slice does not implement → stderr `pr.sh: <verb> is not available on GitLab yet`, exit 2.

- [ ] **Step 1: Write the failing tests** in `pr-shim-gitlab.test.ts` — the refusals only:
  - no `GITLAB_TOKEN` → exit 2, stderr names `GITLAB_TOKEN`, the fake logged **zero** requests;
  - remote `git@other.corp:g/r.git` with `GITLAB_URL` at the fake → exit 2, stderr names
    `GITLAB_URL`, zero requests;
  - `GITLAB_URL=127.0.0.1:1` (no scheme) → exit 2, stderr contains `is not a URL`;
  - `GITLAB_URL=<fake>/api/v4` → exit 2, stderr contains `without /api/v4`;
  - the token value never appears in stdout or stderr of any of these.
- [ ] **Step 2: Run** `pnpm test scripts/__tests__/pr-shim-gitlab.test.ts` — FAIL.
- [ ] **Step 3: Implement** the fake server, the helper, `gitlab.sh`, and `gitlab.mjs` up to
  the refusals.
- [ ] **Step 4: Run** the file — PASS. `pnpm format:check` — PASS.
- [ ] **Step 5: Commit** `feat(gitlab): backend skeleton that refuses before any request`.

### Task 3: `list`

**Files:**
- Modify: `templates/scripts/backends/gitlab.mjs`
- Test: `scripts/__tests__/pr-shim-gitlab.test.ts`

**Interfaces:**
- Produces, inside `gitlab.mjs` (used by Task 4 and slice 4):
  - `api(ctx, method, path, { query?, body? }): Promise<{ status: number, json: any, headers: Headers }>`
    — `ctx = { apiBase, project, token }`; URL is
    `<apiBase>/api/v4/projects/<project><path>`; `redirect: "manual"`. A 3xx → exit 2 with
    `pr.sh: GitLab answered <status> with a redirect to <Location>; set GITLAB_URL to the address it redirects to.`
    Any other non-2xx → exit 2 with `pr.sh: GitLab <status>: <json.message ?? json.error ?? body text>`
    (a `message` that is an array or object is `JSON.stringify`-ed). Callers that must inspect
    a status (slice 4's 409) pass `{ allow: [409] }` in the options and get the response back.
  - `paged(ctx, path, query): Promise<any[]>` — requests `per_page=100&page=1,2,…` and stops
    when a page has fewer than 100 items; no cut-off.
  - `toRecord(mr): Record` — the mapping of spec § 2:
    `number: iid`, `ref: "!" + iid`, `url: web_url`, `head: source_branch`,
    `base: target_branch`, `state: opened|locked → "open", merged → "merged", closed → "closed"`,
    `draft: draft`, `title` — when `draft` is true, with one leading draft marker removed
    (`/^\s*(?:\[draft\]|\(draft\)|draft:|draft\s)\s*/i`); when `draft` is false, unchanged —
    `body: description ?? ""`,
    `head_sha: sha`.
- `list <prefix> <state>`: `paged(ctx, "/merge_requests", { labels: "hitl", state, order_by: "created_at", sort: "asc" })`
  with `state` mapped `open → opened`, others unchanged; then keep records whose `head` starts
  with `<prefix>` (plain `startsWith`); print the JSON array.

- [ ] **Step 1: Write the failing tests** (state seeded through `setState`):
  - returns records for the prefix and only those; a head that merely contains the prefix
    later in the string is excluded;
  - every request carried `labels=hitl` and the token header equal to `GITLAB_TOKEN`;
  - `--state open` sends `state=opened`; `merged`, `closed`, `all` pass through;
  - the record: an MR titled `Draft: Slice 1: api`, `draft: true`, `description: null`,
    `state: "locked"` comes back as `{ number, ref: "!<iid>", title: "Slice 1: api", draft: true, body: "", state: "open", head_sha: <sha>, … }`;
    titles `[Draft] x`, `(Draft) x`, `draft x` with `draft: true` all come back as `x`; an
    MR seeded with `draft: false` and title `Draft plans for Q3` keeps its title;
  - 250 labelled MRs with the prefix → 250 records, and the log shows `page=1`, `2`, `3`;
  - `mode: "fail"` → exit 2, stderr `GitLab 500: boom`, stdout empty;
  - `mode: "redirect"` → exit 2, stderr names the `Location`, and the log shows exactly one
    request (the redirect was not followed);
  - a prefix containing `"` or `\` matches literally;
  - the remote forms, through `pr.sh list` itself: with `GITLAB_URL` at the fake, an
    scp-style origin `git@127.0.0.1:g/sub/r.git` and an `ssh://git@127.0.0.1:2222/g/sub/r.git`
    origin both reach the fake at project `g%2Fsub%2Fr` (the port of an ssh remote is
    ignored), as does the `http://127.0.0.1:<port>/g/sub/r.git` origin.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(gitlab): list merge requests by label and branch prefix`.

### Task 4: `view`

**Files:**
- Modify: `templates/scripts/backends/gitlab.mjs`
- Test: `scripts/__tests__/pr-shim-gitlab.test.ts`

**Interfaces:**
- `view <number>` prints `toRecord(mr)` plus:
  - `reviews: [{ author, state, body }]`, in this order: one per approver
    (`approved_by[].user.username`, `state: "approved"`, `body: ""`), then one per **thread**
    in the order GitLab returned them. A thread is a discussion with at least one note where
    `resolvable === true`. It is unresolved if any resolvable note has `resolved === false` →
    `state: "changes_requested"`; otherwise `state: "commented"`. `author` is the first
    non-system note's `author.username`; `body` is every non-system note of the thread in
    order, each as `@<username>: <body>`, joined by a blank line.
  - `comments: [{ author, body, created_at }]`: every non-system note of every discussion that
    is not a thread.
  Discussions are read with `paged(ctx, "/merge_requests/<iid>/discussions", {})`.

- [ ] **Step 1: Write the failing tests:**
  - an MR with one approver, one unresolved thread of three notes (reviewer, author,
    reviewer), one resolved thread, one plain comment and one system note → `reviews` is
    `[approved, changes_requested, commented]` with the unresolved body equal to the three
    notes prefixed and joined; `comments` holds only the plain comment; the system note is
    nowhere;
  - 150 discussions → all 150 are represented (reviews + comments), log shows two pages;
  - an MR with no approvals and no discussions → `reviews: []`, `comments: []`;
  - an unknown number → exit 2 with GitLab's 404 message.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(gitlab): view a merge request with reviews and comments`.

### Task 5: `ref` on the GitHub backend

**Files:**
- Modify: `templates/scripts/backends/github.sh`, `templates/scripts/pr.sh` (header comment only)
- Modify: `scripts/__fixtures__/fake-gh/gh` (canned records), `scripts/__tests__/pr-shim.test.ts`
- Modify (rendered): `scripts/hitl/backend.sh`, `scripts/hitl/pr.sh`, `runtime/pr/backend.sh`, `runtime/pr/pr.sh`, `.claude/hitl.json`

**Interfaces:**
- Produces: every record from the GitHub backend carries `ref: "#<number>"`. The contract
  comment at the top of `pr.sh` lists the record as
  `{ number, ref, url, head, base, state, draft, title, body, head_sha }` and says:
  "`ref` is how the host writes a reference to the PR in text: `#12` on GitHub, `!12` on
  GitLab. Use it in any text posted to the host; `number` is what the verbs take."

- [ ] **Step 1: Write the failing test:** in `pr-shim.test.ts` add `ref: "#12"` to `RECORD`
  (every existing record assertion now expects it), for both the installed and the plugin shim.
- [ ] **Step 2: Run** `pnpm test scripts/__tests__/pr-shim.test.ts` — FAIL.
- [ ] **Step 3: Implement:** add `ref: ("#" + (.number | tostring))` to `RECORD_JQ`; update
  the fake `gh`'s canned post-`--jq` records where it prints them itself (its `store` and
  `raw` modes apply the real expression and need no change); edit the `pr.sh` comment; run
  both refreshes and re-render the owned files.
- [ ] **Step 4: Run** `pnpm test` and `pnpm format:check` — PASS (other suites that fabricate
  records — `wipe.test.ts`, `cleanup.test.ts`, the stub shim — do not assert the full record
  and need no change; fix any that do).
- [ ] **Step 5: Commit** `feat(shim): every PR record carries ref`.

### Task 6: One contract suite over both backends — the reading verbs

The spec asks for the same contract cases over both backends. `pr-shim.test.ts` keeps its
GitHub-specific cases (what `gh` was called with) and `pr-shim-gitlab.test.ts` its
GitLab-specific ones (pagination, label, redirect, refusals). The contract itself is proven
once, by one suite run against each backend.

**Files:**
- Create: `scripts/__tests__/pr-shim-contract.test.ts`
- Modify: `scripts/__tests__/helpers/gitlab.ts` (export a world), create `scripts/__tests__/helpers/github.ts`

**Interfaces:**
- Produces: a `World` per backend, used by `describe.each([githubWorld, gitlabWorld])`:
  `{ name: string, setup(prs: SeedPr[]): Promise<void>, run(args: string[]): { status, stdout, stderr, json }, backendCalls(): number, teardown(): void }`
  where `SeedPr = { number, head, base, state: "open"|"merged"|"closed", draft, title, body, head_sha }`.
  The GitHub world seeds the fake `gh` in `store` mode and counts its log lines; the GitLab
  world seeds the fake GitLab (labelled `hitl`) and counts its logged requests. Both run the
  shim assembled from the templates (`pr.sh` + that backend), not a rendered copy.
  `githubShimDir()` in `helpers/github.ts` mirrors `gitlabShimDir()`: `pr.sh` plus
  `backends/github.sh` as `backend.sh`.

- [ ] **Step 1: Write the suite** with these cases, each asserted identically for both worlds:
  - `view <n>` → exit 0, a record with exactly the keys
    `number, ref, url, head, base, state, draft, title, body, head_sha, reviews, comments`,
    whose values equal the seed (`ref` aside, which is `#<n>` or `!<n>`);
  - `list --head-prefix feat/x-slice-` → only the seeded PRs with that prefix, in every
    state (the default is `all`); `--state merged` → only the merged one; a seeded head that
    contains the prefix but does not start with it is excluded; a prefix containing `"` is
    matched literally;
  - `list` with no `--head-prefix`, `view` with a non-number, and an unknown verb → exit 1,
    usage on stderr, and `backendCalls()` is 0;
  - `view` of a number that does not exist → exit 2, a non-empty stderr, empty stdout.
- [ ] **Step 2: Run** `pnpm test scripts/__tests__/pr-shim-contract.test.ts` — a case that
  fails on either backend is a contract bug in that backend: fix the backend, not the case.
  (Write the suite before Task 3's implementation is final if working strictly test-first;
  it must be red for GitLab until `list` and `view` exist.)
- [ ] **Step 3: Run** `pnpm test` and `pnpm format:check` — PASS.
- [ ] **Step 4: Commit** `test(shim): one contract suite over the GitHub and GitLab backends`.
