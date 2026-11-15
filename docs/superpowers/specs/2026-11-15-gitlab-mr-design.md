# GitLab merge requests, and the wipe as the last PR everywhere

Tracks: https://github.com/leonardosarmentocastro/hitl/issues/19

**Review mode:** simple
**Reviewed:** round 1 (2026-11-15) · round 2 (2026-11-15).

## Goal

On a GitLab project, `/implement-stack` runs a stack unattended exactly as it does on GitHub:
Draft merge requests that target their parent, a Draft umbrella merge request, status read
back from the host — in an installed repository and in no-install mode — needing nothing but
a `GITLAB_TOKEN` in the environment.

Why: a real 13-slice run on a GitLab project only worked because a hand-written handover
replaced `/implement-stack`, `/review-slice`, `/umbrella-pr` and the PR shim with REST calls.
That machine had no `glab`.

GitLab has no CI wipe job (GitLab CI templates are out of scope), which exposes that the
installed mode removes `docs/superpowers/` through a GitHub-only mechanism. So this feature
also makes one rule hold everywhere: **the last PR of every stack is the generated wipe PR.**

## Goals, non-goals, anti-goals

Goals

- `/implement-stack` and `/umbrella-pr`, installed and no-install, open Draft stacked MRs and
  a Draft umbrella MR on GitLab (gitlab.com or a self-hosted instance).
- It works with only `GITLAB_TOKEN` (plus `GITLAB_URL` for a self-hosted instance). No `glab`,
  no `jq`, no new dependency: Node 20+ is already a prerequisite.
- `/hitl:help` and `/hitl:init` name the token as the prerequisite on a GitLab repository.
- The shim tests hold the GitLab backend to the same contract as the GitHub one, against a
  fake API.
- In installed mode, on every host, a feature's documents leave through the generated
  `<feature-branch>-wipe` PR — the mechanism no-install mode already has. The GitHub Actions
  wipe job is removed.

Non-goals

- Merging a stack, and restacking slices after a squash-merge. That only arises while a stack
  is being merged, which hitl does not do; it is tracked as `/merge-stack` in issue #35. The
  existing fix-up `### Restack order` step is untouched and is host-independent.
- `glab` support, even as an optional path.
- Moving the GitHub backend from `gh` to REST. The two backends are built differently and
  held to one contract by the tests.
- Uploading screenshots or any file to the host. hitl has no upload step today; a section
  that cannot be produced is already written `_not captured_ — <why>`.
- GitLab CI templates; GitLab auth beyond a base URL and a token; Bitbucket.

Anti-goals

- Sending the token to a host that was not confirmed to be the repository's GitLab.
- Marking an MR ready, requesting reviewers, or merging.
- A partial PR list presented as complete.

## Approaches considered

**How the GitLab backend talks to the host**

1. *REST from Node (chosen).* `fetch` against the GitLab REST API. Needs only the token; one
   code path; tested against a fake local HTTP server. Cost: hitl owns pagination and error
   mapping, and the GitLab backend is built differently from the GitHub one (`gh` + `gh --jq`).
2. *`glab` + `jq`* (the earlier, unpushed design). Mirrors GitHub in shape, but needs two
   installs where GitHub needs one, and the real run had neither.
3. *REST, using `glab` when present.* Two paths to test and keep in step for no user gain.

**How `list` finds a feature's merge requests** (GitLab has no source-branch prefix filter)

1. *A `hitl` label on every MR hitl opens, filtered on the server (chosen).* Fast on a project
   of any size. Cost: a visible label, and an MR opened by hand without it is not seen.
2. *Page through every MR of the project.* Always complete, but one request per 100 MRs on
   every listing.
3. *Error past 1000 MRs in the project* (the earlier design). hitl could not run at all on a
   project with a long history.

**How hitl knows a self-hosted host is GitLab**

1. *`GITLAB_URL` matched against the `origin` remote (chosen).* Nothing stored, same rule in
   both modes, nothing to set for gitlab.com.
2. *Ask once and remember* (manifest when installed, project memory otherwise). Two storage
   places and one more question.
3. *Probe `<host>/api/v4/version`.* Sends the token to an unconfirmed host.

**Where the docs wipe runs**

1. *The generated wipe PR, in both modes, on every host (chosen).* One mechanism; the doctrine
   can say "always". Cost: existing installs lose the CI job on their next `/hitl:diff --apply`.
2. *Wipe PR only where there is no CI job.* Less change; two mechanisms stay.
3. *A `wipe: ci | slice` manifest key* (the earlier design). A knob for a choice nobody needs.

## Design

### 1. Host detection — one rule

One rule decides the host, and it has one source. Today it is `hostOf` in
`installer/discover.mjs`, which returns a string. It becomes a self-contained module (no
imports beyond Node's own) that takes the remote URL and the environment and returns the
host, and for GitLab the API base and the project id. That one file reaches its three
consumers without being rewritten: the installer and `runtime/context.mjs` import it, the
plugin's shim imports it, and the installer copies it verbatim into `scripts/hitl/` for an
installed GitLab repository, where the backend imports the copy. An installed repository
cannot import from the plugin, so a copy is unavoidable; the drift test keeps the copy equal
to the source, and one table of cases in the tests runs against the rule.

The rule:

- hostname `github.com` → `github`; `bitbucket.org` → `bitbucket` (unchanged);
- hostname `gitlab.com` → `gitlab`;
- `GITLAB_URL` is set and the remote's hostname equals `GITLAB_URL`'s hostname → `gitlab`;
- anything else → `unknown`. A `GITLAB_URL` that does not parse as a URL (no scheme, empty)
  counts as unset here, and the GitLab backend refuses with a message naming the variable.

Hostnames compare case-insensitively; the port is ignored (an ssh remote carries none).

**The API base** follows the remote, never the variable alone: a `gitlab.com` remote always
uses `https://gitlab.com`, even when `GITLAB_URL` is exported for a company instance; a remote
whose hostname equals `GITLAB_URL`'s uses `GITLAB_URL`. Requests go to `<base>/api/v4`.
`http://` is accepted (an internal instance, the tests).

*(My call:)* an instance whose ssh hostname differs from its web hostname
(`git@ssh.gitlab.corp:…` with the API at `https://gitlab.corp`) is not supported: the remote
does not match, and the refusal says so. Using an https remote is the way around it.

**The project** is the remote's path without a trailing `.git`, URL-encoded as the API's
project id (`group/sub/repo` → `group%2Fsub%2Frepo`), for https, `ssh://` and scp-style
remotes. *(My call:)* when `GITLAB_URL` has a path (`https://host/gitlab`) and an https
remote's path starts with it, that prefix is stripped.

### 2. The GitLab backend

The shim's contract (`pr.sh`: six verbs, one JSON document on stdout, exit 0/1/2/3) does not
change. `pr.sh` stays the argument parser and still sources `backend.sh`. The GitLab
`backend.sh` is a thin wrapper: each `backend_<verb>` runs a Node module shipped beside it
(zero dependencies, Node 20+, built-in `fetch`). File names are the builder's.

Before any request the backend refuses, exit 2, with a message naming the variable:

- `GITLAB_TOKEN` unset or empty;
- the `origin` remote is neither `gitlab.com` nor a match for `GITLAB_URL` — the case of an
  installed `provider: gitlab` repository on a self-hosted instance with the variable unset or
  pointing elsewhere (names `GITLAB_URL`).

  The token is never sent to a host the remote does not match, and is never printed.

The backend never follows a redirect. Node's `fetch` would turn a redirected `POST` into a
`GET` (a `create` that silently becomes a listing) and would carry the `PRIVATE-TOKEN` header
to another hostname. So a 3xx answer is exit 2, naming `GITLAB_URL` and the `Location` it was
given. Pages are requested by page number against the same base, never by following a URL
the server returned.

Auth is the `PRIVATE-TOKEN` header. The token needs the `api` scope; the messages and
`/hitl:help` say so.

**Record.** Both backends return the same record, which gains one field, `ref`:

| field | GitLab source |
|---|---|
| `number` | `iid` |
| `ref` | `!<iid>` (GitHub: `#<number>`) |
| `url` | `web_url` |
| `head` / `base` | `source_branch` / `target_branch` |
| `state` | `opened`, `locked` → `open`; `merged`; `closed` |
| `draft` | `draft` |
| `title` | `title` without its `Draft:` prefix *(my call: so a title round-trips)* |
| `body` | `description` (null → `""`) |
| `head_sha` | `sha` |

**Verbs.**

- `create` — `POST /projects/:id/merge_requests`. `--draft` prefixes the title with
  `Draft: `. Every MR hitl opens carries the label `hitl` (GitLab creates the label on first
  use). No reviewers, no assignees. When GitLab answers 409 because an open MR already
  exists, the backend finds it by source **and** target branch
  (`source_branch=<head>&target_branch=<base>&state=opened`, without the label filter —
  GitLab allows one open MR per pair, so a branch can have a second one to another target), adds the `hitl` label if it lacks it — so later listings see an
  MR that was opened by hand — prints its record and exits 3.
- `list` — `GET /projects/:id/merge_requests`, `per_page=100`, following pages. `--state`
  maps `open` → `opened`; `merged`, `closed`, `all` pass through. GitLab cannot filter by a
  source-branch prefix, so the server narrows by `labels=hitl` and the prefix filter is
  client-side (`head` starts with the prefix, matched literally). It follows pages to the
  end, with no cut-off: the label keeps the count to the MRs hitl ever opened in the project
  (a 15-slice feature is 16 of them), and a cut-off there would be a wall the project hits
  for good after enough features. A page that fails is exit 2 — never a partial list.
  Consequence, stated in `/hitl:help` on a GitLab repository: an MR opened by hand without
  the `hitl` label is invisible to hitl until the label is added. That holds for
  `/hitl:cleanup` too, which lists through the shim: it never counts an unlabelled MR as
  evidence that a feature merged.
- `view` — the record plus `reviews` and `comments`, from the MR's approvals and discussions.
  Discussions are paginated like any GitLab list: `view` follows every page (`per_page=100`)
  to the end, so a long review never reads back with threads missing:
  - each approver → a review `approved`, empty body;
  - each **unresolved** resolvable thread → a review `changes_requested`;
  - each **resolved** thread → a review `commented` *(my reading of "rest → commented")*;
  - a thread's review carries the author of its first note, and as body **all** of the
    thread's non-system notes in order, each prefixed with its author — a reply that changes
    or withdraws the request must reach the fix-up;
  - only non-system notes outside any resolvable thread → `comments` (`author`, `body`,
    `created_at`).
- `edit` — `PUT` with `description` only. The title is never sent, so Draft status stands.
- `comment` — `POST …/notes`.
- `retarget` — `PUT` with `target_branch`.

Every verb but `list` prints the record it touched. A non-2xx answer → exit 2, with the HTTP
status and GitLab's `message`/`error` text on stderr.

**`ref` in prose.** Any text hitl posts to the host or reports to the human (PR bodies, the
umbrella's stack block, comments, final reports) names a PR by its record's `ref`, because
`#12` inside a GitLab description links to issue 12. That includes pushed commit subjects
(`docs(handover): slice <N> open <ref>`): on GitLab a `#12` in a pushed commit leaves a
"mentioned in commit" note on issue 12. The handover's stack table keeps
`open #<number>` / `merged #<number>`: it is parsed, it is an internal document, and
`<number>` is what the shim's verbs take. The word stays "PR" throughout.

### 3. Installing on GitLab

- `/hitl:init` (and `--adopt`) accepts `host: gitlab` and writes `provider: gitlab`. Its
  prerequisite check asks for `gh auth status` only on a GitHub host; on GitLab it asks for a
  non-empty `GITLAB_TOKEN`. Other hosts are still refused ("no backend for <host>"); for
  `unknown` with a readable remote the refusal adds that a self-hosted GitLab needs
  `GITLAB_URL`.
- The installer renders the GitLab backend (the wrapper and its Node module) into
  `scripts/hitl/` for `provider: gitlab`, and the GitHub one for `provider: github`. Both are
  owned files, hashed in the manifest like any other.
- `/hitl:help` reports the prerequisite of the repository's host: `gh` signed in on GitHub;
  on GitLab, whether `GITLAB_TOKEN` is set, and `GITLAB_URL` when the host is self-hosted. It
  reads the provider from the manifest when there is one, else from the remote.
- From this feature on, **every** installed repository needs Node 20+ at run time, not only
  at install time: the wipe builder (§ 5) is a Node program on both hosts, and so is the
  GitLab backend. `/hitl:init` and `/hitl:help` already check Node; the doctrine's
  prerequisites say so.

### 4. No-install mode on GitLab

- `runtime/context.mjs`: the `github` requirement becomes `host` — met by any host that has a
  backend (`github`, `gitlab`). The refusal is `no-backend` with the host.
- `/hitl:implement-stack` and `/hitl:umbrella-pr` require `host`; their refusal line no
  longer points at issue #19 and names the host instead, with the `GITLAB_URL` hint.
- The same goes for every other template that gates on the host being `github` or prints the
  issue #19 line: the handover agent, `/handover` and `/review-plan`.
- `/hitl:brainstorming`: on `gitlab` it requires a non-empty `GITLAB_TOKEN` (as it requires
  `gh auth status` on GitHub); on a host with no backend it still runs the design session and
  says once that opening PRs has no backend for that host.
- The plugin's shim (`runtime/pr/`) ships both backends and picks one per call from the
  `origin` remote, by the rule in § 1. How it dispatches is the builder's; the constraint is
  that the rule lives in one place.
- `runtime/wipe.mjs` already goes through the shim, so the no-install wipe PR works on GitLab
  with no change.

### 5. The wipe PR in installed mode; the CI job goes

No-install mode already ends a stack with a generated PR: `/hitl:umbrella-pr` runs
`wipe.mjs build`, which rebuilds `<feature-branch>-wipe` as exactly one commit over the last
slice that deletes the feature's `docs/superpowers/` files, force-pushes that one branch and
creates or retargets its Draft PR. Installed mode gets the same:

- The installed `/umbrella-pr` gains the wipe step and the stack block's wipe line, and the
  installed `/implement-stack` its "merge it last" report line and the force-push exception
  for the generated wipe branch — the text no-install mode has today, no longer mode-gated.
- The wipe builder is installed into `scripts/hitl/` as an owned file. `runtime/wipe.mjs`
  cannot be that file: it imports the installer's library, the project memory and the session
  record, none of which exist in a target repository. So the builder is split along that line.
  The core — find the feature's documents against an explicit base, build the one-commit wipe
  branch, push it, create or retarget its Draft PR through the shim — becomes one
  self-contained file with its own command line. The installer copies it verbatim into
  `scripts/hitl/`; `runtime/wipe.mjs` imports the same file and adds what only no-install
  mode has: the base from the active-feature record, and the archive to the memory folder.
  One source, so the two modes cannot drift; the drift test covers the installed copy.
- In installed mode, then: the base branch is passed explicitly and nothing is archived. The
  PR descriptions are the record, as the doctrine already says. The no-install behaviour
  (record, archive) is unchanged.
- Removed: `templates/ci/github-actions/wipe-superpowers-docs.yml`, the
  `wipe-superpowers-docs.sh` script, their tests, the init question about the wipe job, and
  the wipe half of the `testing-rules` customize knob.
- *(My call:)* the `ci` choice then decides nothing, so it leaves the answers file and the
  manifest. A manifest that still carries `ci` is read without complaint and written back
  without it; an answers file is accepted with or without a `ci` key, which is ignored (today
  `adopt.mjs` and `render.mjs` refuse an unknown or missing one). The `ci` *testing fragment* (`testing: ["ci"]`) is a different thing and stays.
- Upgrade: `/hitl:diff --apply` already deletes files "removed upstream", so an existing
  install loses the workflow and the script on its next upgrade, and gains the wipe builder.
  Two cases the upgrade report must spell out:
  - *A workflow or script the repository edited.* `/hitl:diff` keeps a "removed upstream"
    file whose content differs from the manifest, so the pair can be half-removed (an edited
    workflow left calling a deleted script). The report names every kept file and tells the
    human to delete the workflow and the script together, by hand.
  - *A stack in flight during the upgrade* (umbrella PR already open). Its branches were cut
    before the upgrade and still carry the old `/umbrella-pr` and no wipe builder, so
    re-running the command there builds nothing. The report says: bring the upgraded base
    branch into the feature branch first, then re-run `/umbrella-pr`, which builds the wipe
    PR.
- The fallback stays in both doctrines, as one sentence: documents that reached the base
  branch because the wipe PR did not merge before the umbrella PR are deleted by hand, in one
  commit. Nothing else removes them: the builder only counts documents a feature added.
  `/hitl:cleanup` already tells the human when that happened; it does so in installed mode
  too.
- Doctrine (`templates/HITL.md`, both modes): specs and plans leave through the generated
  wipe PR, merged last — after every slice, before the umbrella PR. The sentences about a
  workflow deleting them after merge, "deleted by hand", "the wipe script" in § Where things
  live and in the load-bearing invariants are rewritten to match (the no-install doctrine
  already has that wording). In both doctrines, the sentence that a one-slice feature's
  umbrella PR "is never empty because the feature branch carries the spec, the plan and the
  handover document" is replaced: the umbrella PR carries the feature's code; the documents
  have left through the wipe PR before it merges.
- This repository is its own first consumer: its `.github/workflows/wipe-superpowers-docs.yml`
  and `scripts/hitl/wipe-superpowers-docs.sh` go, and `.claude/hitl.json` and the plugin's
  no-install files are regenerated (`AGENTS.md` describes both refreshes). `AGENTS.md`'s
  own mentions of the wipe script and the wipe workflow, and `README.md`'s issue #19 line, are
  rewritten with them.

## Testing

- **Shim tests** run the same contract cases over both backends: GitHub against the fake
  `gh` they use today, GitLab against a fake API — a local HTTP server the test starts, with
  `GITLAB_URL` and a temp repository's `origin` pointing at it. (A synchronous child process
  blocks the event loop the fake server runs on; the test must spawn asynchronously or run
  the server out of process.) GitLab-only cases: pagination, a 3xx answer (exit 2, no second request), a thread with
  replies, the 409 →
  exit 3 path, the `hitl` label on create and in the list query, the reviews mapping, the missing-token and host-mismatch refusals, that no
  request is made in either refusal, and the three remote URL forms.
- **The plugin's shim picks the right backend** (slice 6 owns these), run through
  `runtime/pr/pr.sh` itself: a GitHub remote reaches the fake `gh` and makes no HTTP request;
  a `gitlab.com` or `GITLAB_URL`-matching remote reaches the fake API and never calls `gh`;
  an unknown remote exits 2 having called neither.
- `view` across more than one page of discussions; `list` across more than one page.
- The host rule's case table, with and without `GITLAB_URL` (including one that does not
  parse); `context.mjs` `--require host`; `help.mjs`
  prerequisites per host; render, adopt, diff and drift tests for `provider: gitlab`, for the
  removed files, for a manifest with a leftover `ci`, and for an upgrade where the workflow
  or the script was edited (kept, and named in the report).
- The wipe core on its own (explicit base, no record, nothing archived), and
  `runtime/wipe.mjs` over it unchanged in behaviour — its existing tests still pass.
- Prompts are validated by dry run on fixtures, as `AGENTS.md` says. The first real run on a
  GitLab project is watched by a human.

## Delivery slices

1. **Installed wipe PR** — an installed repository's feature documents leave through the
   generated wipe PR built by `/umbrella-pr`.
2. **CI wipe job removed** — the workflow, its script, the init question and the `ci` choice
   go; an upgrade deletes them; the doctrine states the one rule.
3. **GitLab backend, reading** — `list` and `view` against GitLab, host detection with
   `GITLAB_URL`, the token and host refusals, `ref` on both backends.
4. **GitLab backend, writing** — `create` (Draft, exit 3), `edit`, `comment`, `retarget`;
   prose names PRs by `ref`.
5. **Install on GitLab** — `/hitl:init`, `--adopt` and `/hitl:help` accept and describe a
   GitLab repository.
6. **No-install on GitLab** — `context.mjs`, the plugin's shim and the plugin commands run a
   stack on GitLab without an install.

Slices 1–2 do not depend on 3–6. Slices 3 and 4 follow the read-before-write axis; each is
proven by the shim tests alone.

## Acceptance

- [ ] `/implement-stack` (installed and no-install) opens Draft stacked MRs and a Draft
      umbrella MR on a GitLab project.
- [ ] It works with only `GITLAB_TOKEN` (and `GITLAB_URL` when self-hosted); `/hitl:help`
      states the requirement.
- [ ] Shim tests cover the GitLab backend with a fake API.
- [ ] In installed mode on either host, the stack ends with a generated Draft wipe PR and no
      CI job is installed.

## Left to the builder

File names and module layout of the GitLab backend; how the plugin's shim dispatches; how the
fake API server is run in tests; exact wording of refusals and help lines; whether slices 5
and 6 share helper code for the prerequisite checks.

## Decisions and declined alternatives

- *Forwarded to the plan gate:* GitLab also reads `[Draft]`, `(Draft)` and `Draft ` as draft
  markers; the record's `title` should strip whichever marker is present, not only `Draft:`.
- *Forwarded to the plan gate:* a `GITLAB_URL` that already ends in `/api/v4` should be
  refused by name, not turned into `/api/v4/api/v4`.
- *Forwarded to the plan gate:* stripping `GITLAB_URL`'s path from a remote must match on a
  path-segment boundary (`https://host/git` must not eat the start of `/gitops/repo`).
- An archive of the documents in installed mode, for a fix-up after the wipe PR merged —
  declined: the wipe PR's body already says fix-up rounds happen before it merges, and the
  documents stay in the feature branch's history.
- Filtering out threads opened by the MR's own author or by a bot in `view` — declined: an
  unresolved thread is open work whoever started it, and reading it as `changes_requested` is
  the cautious side.
- A cut-off on `list` (1000 MRs, then 1000 labelled MRs) — declined: with the label narrowing
  the server it counts the project's whole hitl history and becomes a permanent wall.
- The review of this spec is an experiment tracked in issue #36: round 1 cold, round 2 by the
  adversarial reviewer alone, under `**Review mode:** simple`.
