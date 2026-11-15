# Slice 4 — GitLab backend, writing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Reviewed:** round 1 (2026-11-15).

**Owns:** the PR shim's `create` (Draft, labelled, exit 3 when one exists), `edit`, `comment` and `retarget` work on GitLab; every text hitl posts or reports names a PR by its `ref`.

**Goal:** The GitLab backend passes the whole shim contract, and prompts stop writing `#<number>` where GitLab would read it as an issue.

**Architecture:** Four more verbs in `templates/scripts/backends/gitlab.mjs` over slice 3's `api`, `paged` and `toRecord`. The wipe core reports `ref` next to `pr`. Prompt templates switch from `#<number>` to the record's `ref` wherever the text is posted to the host or reported to the human; the handover's stack table keeps `#<number>`.

**Tech Stack:** Node 20+ ES modules, zero dependencies; bash; vitest; Markdown prompt templates.

**Spec:** `docs/superpowers/specs/2026-11-15-gitlab-mr-design.md` (§ 2)

## Global Constraints

- Everything in slice 3's Global Constraints holds (zero dependencies; token only in the
  `PRIVATE-TOKEN` header to the resolved base and never printed; `redirect: "manual"`; exit
  codes 0/1/2/3; the word is "PR").
- hitl never marks a PR ready, never requests reviewers or assignees, never merges: `create`
  sends none of `reviewer_ids`, `assignee_ids`, `assignee_id`; `edit` sends `description` only.
- The handover document's stack table keeps `open #<number>` / `merged #<number>`: it is
  parsed, and `<number>` is what the shim's verbs take. Do not change it or its parser text.
- After any `templates/` change run both refreshes from `AGENTS.md` and re-render this
  repository's owned files. Local gates: `pnpm test`, `pnpm format:check`.
- File count: this slice crosses the ~20-file tripwire because every template change is
  committed with its rendered copies (this repository's `.claude/` and `scripts/hitl/`, the
  plugin's `commands/`, `agents/`, `runtime/`, the manifest). The capability is one; it is not split.

## Review Focus

- `create` when the branch already has an open MR to a **different** target: that is not the
  same PR; the lookup is by source and target.
- `create` exit 3 on an MR opened by hand without the `hitl` label: the label must be added,
  and the MR's other labels kept.
- A title that already starts with `Draft:` passed with `--draft`: one prefix, not two.
- A body file with non-ASCII text, quotes and newlines: sent as JSON, byte-exact.
- A redirect on a `POST`: exit 2 and no MR created (Node would otherwise turn it into a `GET`).

---

### Task 1: The fake GitLab accepts writes

**Files:**
- Modify: `scripts/__fixtures__/fake-gitlab/server.mjs`
- Test: `scripts/__tests__/pr-shim-gitlab.test.ts` (exercised by Tasks 2–3; no test of its own)

**Interfaces:**
- Produces, on the fake (state file is rewritten after each write):
  - `POST merge_requests` with JSON `{ source_branch, target_branch, title, description, labels }`
    → 201 and the new MR (`iid` = max + 1, `state: "opened"`, `draft` true when the title
    matches the draft-marker regex, `labels` split on commas, `sha: "sha-<iid>"`,
    `web_url: "<base>/g/r/-/merge_requests/<iid>"`). When an `opened` MR with the same
    `source_branch` **and** `target_branch` exists → 409
    `{"message":["Another open merge request already exists for this source branch: !<iid>"]}`.
  - `PUT merge_requests/:iid` with any of `description`, `target_branch`, `add_labels` → 200
    and the updated MR.
  - `POST merge_requests/:iid/notes` with `{ body }` → 201; appends a one-note, non-resolvable
    discussion.
  - Requests with a body are logged with it parsed.

- [ ] **Step 1: Implement** the routes. **Step 2: Run** `pnpm test` — still PASS.
- [ ] **Step 3: Commit** `test(gitlab): the fake GitLab accepts creates, edits and notes`.

### Task 2: `create`

**Files:**
- Modify: `templates/scripts/backends/gitlab.mjs`
- Test: `scripts/__tests__/pr-shim-gitlab.test.ts`

**Interfaces:**
- Consumes: `api` (with `{ allow: [409] }`), `paged`, `toRecord` from slice 3.
- `create <base> <head> <title> <body-file> <draft 0|1>`:
  `POST /merge_requests` with `source_branch`, `target_branch`, `description` (the file's
  text), `labels: "hitl"`, and `title` — prefixed with `Draft: ` when `draft` is `1` and the
  title has no draft marker already. 201 → print `toRecord`, exit 0. 409 → look up
  `GET /merge_requests?source_branch=<head>&target_branch=<base>&state=opened` (no label
  filter); if it has no `hitl` label, `PUT` it with `add_labels: "hitl"`; print its record and
  exit **3**. A 409 whose lookup finds nothing → exit 2 with GitLab's 409 message.

- [ ] **Step 1: Write the failing tests:**
  - `--draft` creates: the logged `POST` body has `title: "Draft: Slice 1: api"`,
    `labels: "hitl"`, the body file's text as `description`, and none of `reviewer_ids`,
    `assignee_ids`, `assignee_id`; stdout is the record with `draft: true`, `ref: "!1"`,
    `title: "Slice 1: api"`; exit 0;
  - without `--draft` the title is sent as given and `draft` is `false`;
  - `--draft` with a title `Draft: x` sends `Draft: x`;
  - a body file containing `"é"\n— end` arrives byte-exact;
  - an open MR for the same head and base exists, unlabelled, with label `team` → exit 3,
    stdout is exactly one JSON line (its record), and afterwards the fake's MR has labels
    `team` and `hitl`;
  - an open MR for the same head to **another** base exists → a new MR is created (exit 0);
  - `mode: "redirect"` → exit 2, one logged request, no MR in the state;
  - `mode: "fail"` → exit 2, `GitLab 500: boom`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(gitlab): create Draft merge requests labelled hitl`.

### Task 3: `edit`, `comment`, `retarget`

**Files:**
- Modify: `templates/scripts/backends/gitlab.mjs`
- Test: `scripts/__tests__/pr-shim-gitlab.test.ts`

**Interfaces:**
- `edit <number> <body-file>` → `PUT /merge_requests/<n>` with `{ description }` only; print the
  record from the response.
- `comment <number> <body-file>` → `POST /merge_requests/<n>/notes` with `{ body }`; then
  `GET /merge_requests/<n>`; print the record.
- `retarget <number> <base>` → `PUT /merge_requests/<n>` with `{ target_branch }`; print the
  record.
- After this task `gitlab.mjs` has no "not available on GitLab yet" branch left.

- [ ] **Step 1: Write the failing tests:**
  - `edit` sends a body with exactly one key, `description`; the record's `body` is the new
    text and `draft`/`title` are unchanged for an MR created as Draft;
  - `comment` logs a `POST …/notes` with the file's text and returns the MR's record;
  - `retarget` sends exactly `target_branch`; the record's `base` is the new branch;
  - each of the three exits 2 on `mode: "fail"` and on an unknown number.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(gitlab): edit, comment on and retarget merge requests`.

### Task 4: The wipe core reports `ref`

**Files:**
- Modify: `templates/scripts/wipe-core.mjs`
- Modify (rendered): `scripts/hitl/wipe.mjs`, `runtime/wipe-core.mjs`, `.claude/hitl.json`
- Test: `scripts/__tests__/wipe-core.test.ts`

**Interfaces:**
- Produces: `buildWipe`'s `built` and `merged` outputs gain `ref` — the PR record's `ref`
  (`{ status: "built", branch, pr, ref, files }`, `{ status: "merged", pr, ref }`).

- [ ] **Step 1: Write the failing test:** a `built` run and a `merged` run both report
  `ref: "#<pr>"` (the tests run against the fake `gh`).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement**; refresh and re-render.
- [ ] **Step 4: Run** `pnpm test` — PASS. **Step 5: Commit** `feat(wipe): report the wipe PR's ref`.

### Task 5: Prose names PRs by `ref`

**Files:**
- Modify: `templates/claude/commands/implement-stack.md`, `templates/claude/commands/umbrella-pr.md`, `templates/claude/agents/handover.md`
- Modify: `installer/cleanup.mjs`, `commands/cleanup.md`
- Modify (rendered): the same templates under `.claude/` and under `commands/`, `agents/`; `.claude/hitl.json`
- Test: `scripts/__tests__/render.test.ts`, `scripts/__tests__/plugin-prompts.test.ts`, `scripts/__tests__/cleanup.test.ts`

The rule to apply, file by file: text that is **posted to the host** (PR bodies, the umbrella
PR's `<!-- stack -->` block, PR comments, pushed commit subjects) or **reported to the human**
names a PR by the `ref` field of its shim record. Text that is the **handover's stack table**
(`open #<number>`, `merged #<number>`) and every place a number is passed to a shim verb
stay as they are.

- [ ] **Step 1: Write the failing test** in `render.test.ts`, on the installed renders:
  - `implement-stack.md` contains `docs(handover): slice <N> open <ref>`, `PR <ref>` in the
    final-report line, and `The wipe PR <ref> is generated; merge it last.`; it still
    contains `` status `open #<number>` ``;
  - `umbrella-pr.md` contains `created: <ref> (draft)`, `updated: <ref>`,
    `Required before merge: <ref> removes the transient docs`, `Transient docs removed by <ref>.`
    and `refused: <ref> has a hand-written body`;
  - none of the three templates contains the phrase `PR #<` or `PR #K` outside the
    stack-table status sentence.
  Existing assertions that pin the old strings are rewritten to `<ref>` in the same step:
  slice 1's `render.test.ts` cases (`Required before merge: #<pr>`, `The wipe PR #<pr>`) and
  `plugin-prompts.test.ts` (the `Required before merge: #<pr>` assertion near line 159).
  And in `cleanup.test.ts`: every PR that `cleanup.mjs` reports carries the shim record's
  `ref` next to its `number`.
- [ ] **Step 2: Run** it — FAIL.
- [ ] **Step 3: Edit `templates/claude/commands/implement-stack.md`.** One sentence near the
  top of § 1e (where the PR is created): "Every record the shim returns carries `ref` — how
  this host writes a reference to the PR (`#12` on GitHub, `!12` on GitLab). Use `<ref>` in
  anything you post or report; `<number>` only goes to the shim and into the stack table."
  Then: the commit subject becomes `docs(handover): slice <N> open <ref>` (the row's status
  stays `open #<number>`); the final report line becomes `slice N — <branch> — PR <ref>`;
  the wipe sentence uses `<ref>` (from the wipe output's `ref`).
- [ ] **Step 4: Edit `templates/claude/commands/umbrella-pr.md`.** The stack table's PR column
  is refreshed with each record's `ref` (read `number`, `ref`, `head` and `state`); the four
  report strings in Step 1 above; the wipe lines use the wipe output's `ref`.
- [ ] **Step 5: Edit `templates/claude/agents/handover.md` and the cleanup report.** In the
  handover agent's `## Umbrella PR body` template, the stack table's PR column is the record's
  `ref` (add `ref` to the fields it reads from `list`); the `### Slice <N> — <branch> — PR #<K>`
  heading of the Fix-up section becomes `PR <ref>`. `review-slice.md` reports no PR number
  today and is not edited. In `installer/cleanup.mjs`, the PR it reports per entry gains
  `ref` (copied from the shim record); `commands/cleanup.md` prints
  `umbrella PR <umbrella.ref>` where it prints `umbrella PR #<umbrella.number>`.
- [ ] **Step 6: Re-render** (both refreshes); run `pnpm test` and `pnpm format:check` — PASS.
- [ ] **Step 7: Dry-run the prompt** as `AGENTS.md` prescribes: run `/umbrella-pr --dry-run`
  on the fixture stack (or a scratch branch) and confirm the printed body's stack table shows
  `#<n>` refs on this GitHub repository. Note the result in the commit body.
- [ ] **Step 8: Commit** `feat(commands): name PRs by ref in everything posted or reported`.
