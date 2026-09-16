# hitl v1 — slice 2: pr shim

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Owns:** `scripts/hitl/pr.sh`, the GitHub backend, and the three call sites (`/implement-stack`, `/umbrella-pr`, the handover agent) rewritten to use the shim.

**Reviewed:** round 1 (2026-09-16) · round 2 (2026-09-16).

**Goal:** Every PR operation in the installed workflow goes through one bash shim with a normalised JSON contract, so a later host backend is a file swap and no command or agent calls `gh` directly.

**Architecture:** `scripts/hitl/pr.sh` parses one of five verbs, validates flags, and calls a `backend_<verb>` function that `scripts/hitl/backend.sh` defines; init installs the one backend the provider selects (`templates/scripts/backends/github.sh` → `scripts/hitl/backend.sh`). The GitHub backend calls `gh` with `--json` and `gh`'s built-in `--jq`, so normalisation happens without a `jq` prerequisite. Exit codes carry the contract: 0 ok, 1 usage, 2 backend error with the host tool's stderr passed through, 3 "already exists" on `create` with the existing record on stdout. Tests run the shim against a fake `gh` on `PATH`.

**Tech Stack:** bash for the shim and backend, `gh` (GitHub CLI) as the only host tool, Node ESM for the installer list, vitest for tests.

**Spec:** `docs/superpowers/specs/2026-09-16-hitl-v1-design.md`

## Global Constraints

- Every behaviour change is test-first: failing test, run red, minimal code, run green, commit. Gates before the PR: `pnpm test` and `pnpm format:check`.
- Installed scripts are bash; the installed workflow needs bash, `git` and `gh` only. `jq` is not a prerequisite: normalisation uses `gh --jq`.
- The shim's stdout is exactly one JSON document per invocation (`list` an array, every other verb a record); everything else goes to stderr. No verb retries.
- Record shape: `{ number, url, head, base, state: "open"|"merged"|"closed", draft, title, body }`; `view` adds `reviews: [{ author, state: "approved"|"changes_requested"|"commented", body }]` and `comments: [{ author, body, created_at }]`; `comment` and `edit` return the record of the PR they touched.
- No template outside `templates/scripts/backends/github.sh` mentions `gh pr`; a test enforces it.
- The word stays "PR" everywhere; the one line "a merge request on GitLab" lives in the `pr.sh` contract header only.
- Templates and this repository's copies are identical bytes; the drift test (slice 1) enforces it for every owned file, including the two the shim adds. Any edit to a `.claude/` file is mirrored into `templates/claude/` in the same commit.
- Owned-file list stays defined once in `installer/lib.mjs`; this slice adds two entries and updates the counts slice 1's tests assert.
- Markdown is never formatted; `.sh` files keep their bytes.
- Tests that read the disk use temp directories or `scripts/__fixtures__/`, never `docs/superpowers/`.

---

## File structure

| Path | Responsibility |
|---|---|
| `templates/scripts/pr.sh` | dispatcher: contract header, verb and flag parsing, exit-code contract; sources `backend.sh` beside it |
| `templates/scripts/backends/github.sh` | `backend_create/list/view/edit/comment` over `gh` with `--json`/`--jq` normalisation |
| `scripts/hitl/pr.sh`, `scripts/hitl/backend.sh` | this repository's installed copies (byte-identical to the templates) |
| `scripts/__fixtures__/fake-gh/gh` | fake `gh`: logs argv to `$FAKE_GH_LOG`, canned output by `$FAKE_GH_MODE` |
| `scripts/__tests__/pr-shim.test.ts` | one test per verb, exit 3, exit 2, exit 1, and the "no `gh pr` outside the backend" grep |
| `installer/lib.mjs` | `ownedFiles` gains `scripts/hitl/pr.sh` and `scripts/hitl/backend.sh` |
| `scripts/__tests__/lib.test.ts`, `scripts/__tests__/render.test.ts` | counts updated for the two new owned files |
| `templates/claude/commands/implement-stack.md`, `.claude/commands/implement-stack.md` | `create` with exit-3 fallthrough to `edit`; `comment` in fix-up |
| `templates/claude/commands/umbrella-pr.md`, `.claude/commands/umbrella-pr.md` | `list`, `create --draft`, `view`, `edit` |
| `templates/claude/agents/handover.md`, `.claude/agents/handover.md` | `list --head-prefix`, `view` for reviews and comments |

Every task below runs from the repository root on branch `feat/hitl-v1-slice-2-pr-shim`, cut from `feat/hitl-v1-slice-1-plugin-skeleton-and-init-core`.

---

### Task 1: the fake `gh`, the dispatcher, and the read verbs (`view`, `list`)

**Files:**
- Create: `scripts/__fixtures__/fake-gh/gh` (executable)
- Create: `templates/scripts/pr.sh` (executable)
- Create: `templates/scripts/backends/github.sh` (executable)
- Test: `scripts/__tests__/pr-shim.test.ts`

**Interfaces:**
- Produces: `pr.sh view <number>` and `pr.sh list --head-prefix <text> [--state open|merged|closed|all]`; backend functions `backend_view N` and `backend_list PREFIX STATE`; test helpers `installShim()` (copies the two templates into a temp dir as `pr.sh` + `backend.sh`) and `shim(args, mode)` (spawns with the fake `gh` first on `PATH`).
- The fake `gh` prints already-normalised JSON for `pr view` and `pr list`, so these tests prove the shim's argument passing, exit codes and stdout discipline. The `--jq` expressions themselves are exercised against real `gh` in the v1 proof (spec § Delivery slices, acceptance step), not here; the argv log lets the tests assert the `--json` fields and that `--jq` is passed.

- [ ] **Step 1: Write the fake `gh`**

```bash
#!/usr/bin/env bash
# Fake gh for the PR-shim tests. Appends its argv to $FAKE_GH_LOG and prints canned output.
# $FAKE_GH_MODE: ok (default) · exists (pr create says the PR already exists) · fail (any
# call fails with a message on stderr and exit 1).
set -u
printf '%s\n' "$*" >> "${FAKE_GH_LOG:?FAKE_GH_LOG must be set}"
mode=${FAKE_GH_MODE:-ok}
sub="${1:-} ${2:-}"

if [ "$mode" = fail ]; then
  echo "gh: fake failure for '$sub'" >&2
  exit 1
fi

record='{"number":12,"url":"https://github.com/o/r/pull/12","head":"feat/x-slice-1-api","base":"feat/x","state":"open","draft":true,"title":"Slice 1: api","body":"Plan: docs/superpowers/plans/p.md"}'

case "$sub" in
  "pr create")
    if [ "$mode" = exists ]; then
      echo 'a pull request for branch "feat/x-slice-1-api" into branch "feat/x" already exists:' >&2
      echo 'https://github.com/o/r/pull/12' >&2
      exit 1
    fi
    echo "https://github.com/o/r/pull/12"
    ;;
  "pr view")
    if [[ "$*" == *reviews* ]]; then
      echo '{"number":12,"url":"https://github.com/o/r/pull/12","head":"feat/x-slice-1-api","base":"feat/x","state":"open","draft":true,"title":"Slice 1: api","body":"Plan: docs/superpowers/plans/p.md","reviews":[{"author":"ana","state":"changes_requested","body":"rename it"}],"comments":[{"author":"bo","body":"+1","created_at":"2026-09-16T10:00:00Z"}]}'
    else
      echo "$record"
    fi
    ;;
  "pr list")
    echo '[{"number":12,"url":"https://github.com/o/r/pull/12","head":"feat/x-slice-1-api","base":"feat/x","state":"open","draft":true,"title":"Slice 1: api","body":""},{"number":13,"url":"https://github.com/o/r/pull/13","head":"feat/x-slice-2-web","base":"feat/x-slice-1-api","state":"merged","draft":false,"title":"Slice 2: web","body":""}]'
    ;;
  "pr edit" | "pr comment")
    ;;
  *)
    echo "fake gh: unhandled '$sub'" >&2
    exit 1
    ;;
esac
exit 0
```

```bash
chmod +x scripts/__fixtures__/fake-gh/gh
```

- [ ] **Step 2: Write the failing tests for `view` and `list`**

```ts
// scripts/__tests__/pr-shim.test.ts
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const FAKE_GH_DIR = join(ROOT, "scripts/__fixtures__/fake-gh");

/** Install the shim as init would: pr.sh + the github backend as backend.sh, side by side. */
function installShim() {
  const dir = mkdtempSync(join(tmpdir(), "hitl-shim-"));
  copyFileSync(join(ROOT, "templates/scripts/pr.sh"), join(dir, "pr.sh"));
  copyFileSync(join(ROOT, "templates/scripts/backends/github.sh"), join(dir, "backend.sh"));
  chmodSync(join(dir, "pr.sh"), 0o755);
  chmodSync(join(dir, "backend.sh"), 0o755);
  return dir;
}

function shim(args: string[], mode = "ok") {
  const dir = installShim();
  const log = join(dir, "gh.log");
  writeFileSync(log, "");
  const r = spawnSync(join(dir, "pr.sh"), args, {
    encoding: "utf8",
    env: { ...process.env, PATH: `${FAKE_GH_DIR}:${process.env.PATH}`, FAKE_GH_LOG: log, FAKE_GH_MODE: mode },
  });
  const calls = readFileSync(log, "utf8").trim().split("\n").filter(Boolean);
  let json: unknown = null;
  try {
    json = r.stdout.trim() === "" ? null : JSON.parse(r.stdout);
  } catch {
    json = { unparsable: r.stdout };
  }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json, calls };
}

const RECORD = {
  number: 12,
  url: "https://github.com/o/r/pull/12",
  head: "feat/x-slice-1-api",
  base: "feat/x",
  state: "open",
  draft: true,
  title: "Slice 1: api",
  body: "Plan: docs/superpowers/plans/p.md",
};

describe("pr.sh view", () => {
  it("returns the record with reviews and comments and exit 0", () => {
    const r = shim(["view", "12"]);
    expect(r.status).toBe(0);
    expect(r.json).toEqual({
      ...RECORD,
      reviews: [{ author: "ana", state: "changes_requested", body: "rename it" }],
      comments: [{ author: "bo", body: "+1", created_at: "2026-09-16T10:00:00Z" }],
    });
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0]).toMatch(/^pr view 12 --json .*reviews.*comments.* --jq /);
  });
});

describe("pr.sh list", () => {
  it("returns an array of records for the head prefix, state all by default", () => {
    const r = shim(["list", "--head-prefix", "feat/x-slice-"]);
    expect(r.status).toBe(0);
    expect(Array.isArray(r.json)).toBe(true);
    expect((r.json as unknown[]).length).toBe(2);
    expect((r.json as { state: string }[])[1].state).toBe("merged");
    expect(r.calls[0]).toMatch(/^pr list --state all --limit \d+ --json .* --jq /);
    expect(r.calls[0]).toContain("feat/x-slice-");
  });

  it("passes --state through", () => {
    const r = shim(["list", "--head-prefix", "feat/x", "--state", "open"]);
    expect(r.status).toBe(0);
    expect(r.calls[0]).toContain("--state open");
  });
});

describe("pr.sh exit contract", () => {
  it("exits 2 and passes gh's stderr through on a backend failure", () => {
    const r = shim(["view", "12"], "fail");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("fake failure");
    expect(r.stdout).toBe("");
  });

  it("exits 1 on a usage error without calling gh", () => {
    for (const args of [[], ["view"], ["view", "abc"], ["list"], ["edit", "12"], ["create", "--base", "x"], ["nope"]]) {
      const r = shim(args);
      expect(r.status, args.join(" ")).toBe(1);
      expect(r.stdout, args.join(" ")).toBe("");
      expect(r.calls, args.join(" ")).toHaveLength(0);
    }
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test -- scripts/__tests__/pr-shim.test.ts`
Expected: FAIL — every test, with `ENOENT` copying `templates/scripts/pr.sh`; the exit-contract tests go red here too, before the dispatcher's usage and error paths exist.

- [ ] **Step 4: Write the dispatcher**

```bash
#!/usr/bin/env bash
# hitl PR shim — the only thing in the installed workflow that talks to a code host.
#
#   pr.sh create  --base <branch> --head <branch> --title <text> --body-file <path> [--draft]
#   pr.sh list    --head-prefix <text> [--state open|merged|closed|all]     (default: all)
#   pr.sh view    <number>
#   pr.sh edit    <number> --body-file <path>
#   pr.sh comment <number> --body-file <path>
#
# stdout is exactly one JSON document: `list` prints an array, every other verb a record:
#   { number, url, head, base, state: open|merged|closed, draft, title, body }
# `view` adds reviews: [{ author, state: approved|changes_requested|commented, body }] and
# comments: [{ author, body, created_at }]. `edit` and `comment` return the record they touched.
#
# Exit codes: 0 ok · 1 usage (message on stderr) · 2 backend error (the host tool's stderr is
# passed through) · 3 on `create` only: a PR for that head already exists, and its record is
# on stdout so the caller can fall through to `edit`.
#
# The backend is `backend.sh` in this directory, installed by /hitl:init for the host the
# repository uses; it defines backend_create, backend_list, backend_view, backend_edit and
# backend_comment. The word is "PR" throughout; it is a merge request on GitLab.
#
# Best-effort per host, documented here so a backend author knows what may not map 1:1:
#   - draft PRs: GitHub and GitLab have them; Bitbucket has none (create ignores --draft).
#   - review vs comment: `reviews` is the host's formal review state; where a host has only
#     comments, `reviews` is [] and everything lands in `comments`.
#   - `[skip ci]` in the wipe commit: honoured by GitHub Actions and GitLab CI; not universal.
#   - a CI job's right to push to a protected main: GitHub Actions' token can with the right
#     permission; GitLab's CI_JOB_TOKEN cannot (needs a project access token).
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=backend.sh
. "$HERE/backend.sh"

usage() {
  echo "pr.sh: $1" >&2
  echo "usage: pr.sh create --base <b> --head <h> --title <t> --body-file <f> [--draft]" >&2
  echo "       pr.sh list --head-prefix <p> [--state open|merged|closed|all]" >&2
  echo "       pr.sh view <number> | edit <number> --body-file <f> | comment <number> --body-file <f>" >&2
  exit 1
}

need_number() {
  [[ "${1:-}" =~ ^[0-9]+$ ]] || usage "$2 needs a PR number"
}

verb=${1:-}
[ -n "$verb" ] || usage "verb missing"
shift

case "$verb" in
  create)
    base= head= title= body= draft=0
    while [ $# -gt 0 ]; do
      case "$1" in
        --base) base=${2:-}; shift 2 ;;
        --head) head=${2:-}; shift 2 ;;
        --title) title=${2:-}; shift 2 ;;
        --body-file) body=${2:-}; shift 2 ;;
        --draft) draft=1; shift ;;
        *) usage "unknown flag for create: $1" ;;
      esac
    done
    [ -n "$base" ] && [ -n "$head" ] && [ -n "$title" ] && [ -n "$body" ] \
      || usage "create needs --base, --head, --title and --body-file"
    [ -f "$body" ] || usage "body file not found: $body"
    backend_create "$base" "$head" "$title" "$body" "$draft"
    ;;
  list)
    prefix= state=all
    while [ $# -gt 0 ]; do
      case "$1" in
        --head-prefix) prefix=${2:-}; shift 2 ;;
        --state) state=${2:-}; shift 2 ;;
        *) usage "unknown flag for list: $1" ;;
      esac
    done
    [ -n "$prefix" ] || usage "list needs --head-prefix"
    case "$state" in open | merged | closed | all) ;; *) usage "bad --state: $state" ;; esac
    backend_list "$prefix" "$state"
    ;;
  view)
    need_number "${1:-}" view
    [ $# -eq 1 ] || usage "view takes only a number"
    backend_view "$1"
    ;;
  edit | comment)
    need_number "${1:-}" "$verb"
    number=$1
    shift
    body=
    while [ $# -gt 0 ]; do
      case "$1" in
        --body-file) body=${2:-}; shift 2 ;;
        *) usage "unknown flag for $verb: $1" ;;
      esac
    done
    [ -n "$body" ] || usage "$verb needs --body-file"
    [ -f "$body" ] || usage "body file not found: $body"
    "backend_$verb" "$number" "$body"
    ;;
  *)
    usage "unknown verb: $verb"
    ;;
esac
```

- [ ] **Step 5: Write the GitHub backend with `view` and `list`**

```bash
#!/usr/bin/env bash
# hitl PR shim — GitHub backend. Sourced by pr.sh; never run directly. Talks to `gh` and
# normalises with gh's built-in --jq, so jq is not a prerequisite.

RECORD_FIELDS='number,url,headRefName,baseRefName,state,isDraft,title,body'
RECORD_JQ='{number: .number, url: .url, head: .headRefName, base: .baseRefName,
            state: (.state | ascii_downcase), draft: .isDraft, title: .title, body: .body}'
REVIEW_STATE_JQ='(if . == "APPROVED" then "approved"
                  elif . == "CHANGES_REQUESTED" then "changes_requested"
                  else "commented" end)'
VIEW_JQ="$RECORD_JQ + {
  reviews:  [.reviews[]  | {author: .author.login, state: (.state | $REVIEW_STATE_JQ), body: .body}],
  comments: [.comments[] | {author: .author.login, body: .body, created_at: .createdAt}]}"

# Run gh; on failure pass its stderr through and exit 2.
gh_or_2() {
  local err
  err=$(mktemp)
  if ! gh "$@" 2>"$err"; then
    cat "$err" >&2
    rm -f "$err"
    exit 2
  fi
  rm -f "$err"
}

backend_view() {
  gh_or_2 pr view "$1" --json "$RECORD_FIELDS,reviews,comments" --jq "$VIEW_JQ"
}

# gh's search qualifiers do not prefix-match branch names reliably, so fetch and filter.
backend_list() {
  local prefix=$1 state=$2
  gh_or_2 pr list --state "$state" --limit 200 --json "$RECORD_FIELDS" \
    --jq "[.[] | select(.headRefName | startswith(\"$prefix\")) | $RECORD_JQ]"
}
```

```bash
chmod +x templates/scripts/pr.sh templates/scripts/backends/github.sh
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test -- scripts/__tests__/pr-shim.test.ts`
Expected: PASS, 5 tests (three read-verb tests and the two exit-contract tests).

- [ ] **Step 7: Commit**

```bash
git add scripts/__fixtures__/fake-gh/gh templates/scripts scripts/__tests__/pr-shim.test.ts
git commit -m "feat(shim): pr.sh dispatcher with view and list over a gh backend"
```

---

### Task 2: the write verbs (`create`, `edit`, `comment`) and the exit-code contract

**Files:**
- Modify: `templates/scripts/backends/github.sh` (add `backend_create`, `backend_edit`, `backend_comment`)
- Test: `scripts/__tests__/pr-shim.test.ts` (append)

**Interfaces:**
- Consumes: the dispatcher and helpers from Task 1.
- Produces: `pr.sh create ...` (exit 0 with the new record; exit 3 with the existing record when the head already has a PR), `pr.sh edit <n> --body-file <f>`, `pr.sh comment <n> --body-file <f>`; exit 2 with stderr passthrough on any `gh` failure; exit 1 on usage errors. `/implement-stack` (Task 4) relies on exit 3 carrying `number`.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/__tests__/pr-shim.test.ts`:

```ts
function bodyFile(text = "What — x\n") {
  const p = join(mkdtempSync(join(tmpdir(), "hitl-body-")), "body.md");
  writeFileSync(p, text);
  return p;
}

describe("pr.sh create", () => {
  it("creates and returns the record", () => {
    const body = bodyFile();
    const r = shim(["create", "--base", "feat/x", "--head", "feat/x-slice-1-api", "--title", "Slice 1: api", "--body-file", body, "--draft"]);
    expect(r.status).toBe(0);
    expect(r.json).toEqual(RECORD);
    expect(r.calls[0]).toBe(`pr create --base feat/x --head feat/x-slice-1-api --title Slice 1: api --body-file ${body} --draft`);
    expect(r.calls[1]).toMatch(/^pr view feat\/x-slice-1-api --json /);
  });

  it("omits --draft unless asked", () => {
    const r = shim(["create", "--base", "feat/x", "--head", "feat/x-slice-1-api", "--title", "t", "--body-file", bodyFile()]);
    expect(r.status).toBe(0);
    expect(r.calls[0]).not.toContain("--draft");
  });

  it("exits 3 with the existing record when the head already has a PR", () => {
    const r = shim(["create", "--base", "feat/x", "--head", "feat/x-slice-1-api", "--title", "t", "--body-file", bodyFile()], "exists");
    expect(r.status).toBe(3);
    expect(r.json).toEqual(RECORD);
  });
});

describe("pr.sh edit and comment", () => {
  it("edit replaces the body and returns the record", () => {
    const body = bodyFile();
    const r = shim(["edit", "12", "--body-file", body]);
    expect(r.status).toBe(0);
    expect(r.json).toEqual(RECORD);
    expect(r.calls[0]).toBe(`pr edit 12 --body-file ${body}`);
  });

  it("comment appends and returns the record", () => {
    const body = bodyFile("## Review decisions\n");
    const r = shim(["comment", "12", "--body-file", body]);
    expect(r.status).toBe(0);
    expect(r.json).toEqual(RECORD);
    expect(r.calls[0]).toBe(`pr comment 12 --body-file ${body}`);
  });
});
```

(The exit-contract tests were written red in Task 1 and stay green here.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- scripts/__tests__/pr-shim.test.ts`
Expected: the `create`, `edit` and `comment` tests FAIL with `backend_create: command not found` (exit 127); Task 1's five tests still pass.

- [ ] **Step 3: Add the write verbs to the backend**

Append to `templates/scripts/backends/github.sh`:

```bash
backend_create() {
  local base=$1 head=$2 title=$3 body_file=$4 draft=$5
  local args=(pr create --base "$base" --head "$head" --title "$title" --body-file "$body_file")
  [ "$draft" = 1 ] && args+=(--draft)
  local err
  err=$(mktemp)
  if ! gh "${args[@]}" >/dev/null 2>"$err"; then
    if grep -qi "already exists" "$err"; then
      rm -f "$err"
      gh_or_2 pr view "$head" --json "$RECORD_FIELDS" --jq "$RECORD_JQ"
      exit 3
    fi
    cat "$err" >&2
    rm -f "$err"
    exit 2
  fi
  rm -f "$err"
  gh_or_2 pr view "$head" --json "$RECORD_FIELDS" --jq "$RECORD_JQ"
}

backend_edit() {
  gh_or_2 pr edit "$1" --body-file "$2" >/dev/null
  gh_or_2 pr view "$1" --json "$RECORD_FIELDS" --jq "$RECORD_JQ"
}

backend_comment() {
  gh_or_2 pr comment "$1" --body-file "$2" >/dev/null
  gh_or_2 pr view "$1" --json "$RECORD_FIELDS" --jq "$RECORD_JQ"
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- scripts/__tests__/pr-shim.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add templates/scripts/backends/github.sh scripts/__tests__/pr-shim.test.ts
git commit -m "feat(shim): create, edit, comment and the exit-code contract"
```

---

### Task 3: the shim becomes owned; this repository installs its own copy

**Files:**
- Modify: `installer/lib.mjs` (`ownedFiles`)
- Modify: `scripts/__tests__/lib.test.ts` (counts and list)
- Modify: `scripts/__tests__/render.test.ts` (counts and list)
- Create: `scripts/hitl/pr.sh`, `scripts/hitl/backend.sh` (copies)

**Interfaces:**
- Consumes: `ownedFiles(choices)` from slice 1.
- Produces: two new owned entries — `{ repoPath: "scripts/hitl/pr.sh", template: "scripts/pr.sh", executable: true }` and `{ repoPath: "scripts/hitl/backend.sh", template: \`scripts/backends/${choices.provider}.sh\`, executable: true }`. Counts: 21 owned files with `ci: none`, 22 with `ci: github-actions`. Slices 3 to 5 rely on these counts.

- [ ] **Step 1: Update the slice-1 tests first and watch them fail**

In `scripts/__tests__/lib.test.ts`, test "lists every agent, command, …": add to the `arrayContaining` list

```ts
        "scripts/hitl/pr.sh",
        "scripts/hitl/backend.sh",
```

and change `expect(paths).toHaveLength(19);` to `expect(paths).toHaveLength(21);`. In test "marks the shell scripts executable…" add

```ts
    expect(byPath["scripts/hitl/pr.sh"].executable).toBe(true);
    expect(byPath["scripts/hitl/backend.sh"].template).toBe("scripts/backends/github.sh");
```

In `scripts/__tests__/render.test.ts`: in "writes every owned file…" add `"scripts/hitl/pr.sh"` and `"scripts/hitl/backend.sh"` to the path list; in "writes the manifest…" change `toHaveLength(20)` to `toHaveLength(22)`; in "omits the workflow when ci is none" change `toHaveLength(19)` to `toHaveLength(21)`.

Run: `pnpm test -- scripts/__tests__/lib.test.ts scripts/__tests__/render.test.ts`
Expected: FAIL — length 19 received where 21 expected, and the two new paths absent.

- [ ] **Step 2: Add the entries to `ownedFiles`**

In `installer/lib.mjs`, inside `ownedFiles`, after the wipe-script entry and before the `if (choices.ci === "github-actions")` block, add:

```js
    { repoPath: "scripts/hitl/pr.sh", template: "scripts/pr.sh", executable: true },
    {
      repoPath: "scripts/hitl/backend.sh",
      template: `scripts/backends/${choices.provider}.sh`,
      executable: true,
    },
```

- [ ] **Step 3: Install this repository's copies**

```bash
cp templates/scripts/pr.sh scripts/hitl/pr.sh
cp templates/scripts/backends/github.sh scripts/hitl/backend.sh
chmod +x scripts/hitl/pr.sh scripts/hitl/backend.sh
```

- [ ] **Step 4: Run the whole suite**

Run: `pnpm test`
Expected: PASS. The drift test now lists `scripts/hitl/pr.sh matches its template`, `scripts/hitl/backend.sh matches its template` and their executable checks.

- [ ] **Step 5: Commit**

```bash
git add installer/lib.mjs scripts/__tests__/lib.test.ts scripts/__tests__/render.test.ts scripts/hitl/pr.sh scripts/hitl/backend.sh
git commit -m "feat(installer): the PR shim and its backend are owned files"
```

---

### Task 4: the three call sites use the shim; nothing else says `gh pr`

**Files:**
- Modify: `.claude/commands/implement-stack.md` and `templates/claude/commands/implement-stack.md` (identical)
- Modify: `.claude/commands/umbrella-pr.md` and `templates/claude/commands/umbrella-pr.md` (identical)
- Modify: `.claude/agents/handover.md` and `templates/claude/agents/handover.md` (identical)
- Test: `scripts/__tests__/pr-shim.test.ts` (append)

**Interfaces:**
- Consumes: the five verbs and the exit-3 contract.
- Produces: no template outside `templates/scripts/backends/github.sh` contains `gh pr`; the commands read the shim's JSON (`number`, `head`, `base`, `state`, `body`, `reviews`, `comments`) instead of `gh --json` fields.

- [ ] **Step 1: Write the failing test**

Append to `scripts/__tests__/pr-shim.test.ts`:

```ts
import { readdirSync, statSync } from "node:fs";

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map((p) => join(dir, p))
    .filter((p) => statSync(p).isFile());
}

describe("no template calls gh directly", () => {
  it("mentions `gh pr` only in the GitHub backend", () => {
    const offenders = filesUnder(join(ROOT, "templates"))
      .filter((p) => !p.endsWith("templates/scripts/backends/github.sh"))
      .filter((p) => readFileSync(p, "utf8").includes("gh pr"));
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test -- scripts/__tests__/pr-shim.test.ts`
Expected: FAIL — offenders lists `templates/claude/commands/implement-stack.md`, `templates/claude/commands/umbrella-pr.md`, `templates/claude/agents/handover.md`.

- [ ] **Step 3: Rewrite `/implement-stack` (edit `.claude/commands/implement-stack.md`, then copy to the template)**

In § 1e, replace

````
```bash
git push -u origin "<branch>"
gh pr create --base "<parent>" --head "<branch>" --title "Slice <N>: <plan title>" --body-file <tmp>
```

If that refuses because a pull request for this branch already exists — the state a resumed
`branched` slice is left in by a run that crashed after pushing — take the existing number,
put the body on it with `gh pr edit --body-file <tmp>`, and carry on. Any other failure is a
**STOP**.
````

with

````
```bash
git push -u origin "<branch>"
scripts/hitl/pr.sh create --base "<parent>" --head "<branch>" --title "Slice <N>: <plan title>" --body-file <tmp>
```

The shim prints the PR's record as JSON; `<number>` is its `number`. Exit `3` means a pull
request for this branch already exists — the state a resumed `branched` slice is left in by a
run that crashed after pushing — and the record on stdout is that PR's: take its `number`,
put the body on it with `scripts/hitl/pr.sh edit <number> --body-file <tmp>`, and carry on.
Any other non-zero exit is a **STOP**.
````

In § Fix-up, step 3, replace

```
3. Push (fast-forward). Append the Review decisions to the PR with `gh pr comment`.
```

with

```
3. Push (fast-forward). Append the Review decisions to the PR with
   `scripts/hitl/pr.sh comment <number> --body-file <tmp>`.
```

Then `cp .claude/commands/implement-stack.md templates/claude/commands/implement-stack.md`.

- [ ] **Step 4: Rewrite `/umbrella-pr` (edit `.claude/commands/umbrella-pr.md`, then copy)**

Replace step 2's last line

```
   `gh pr list --state all --search "head:<feature-branch>-slice-" --json number,headRefName,state`.
```

with

```
   `scripts/hitl/pr.sh list --head-prefix "<feature-branch>-slice-"` (every state; read
   `number`, `head` and `state` from each record).
```

Replace step 4's code block and bullets

````
   ```bash
   git fetch -q origin
   git rev-parse --verify -q origin/<feature-branch> >/dev/null || { echo "refused: <feature-branch> is not pushed"; exit 1; }
   N=$(gh pr list --state open --head <feature-branch> --base main --json number --jq '.[0].number')
   ```
   - No PR: write the body to a temp file and
     `gh pr create --draft --base main --head <feature-branch> --title "<feature title from the spec's H1>" --body-file <tmp>`.
     Report `created: #N (draft)`.
   - PR exists: fetch its body (`gh pr view N --json body --jq .body`). Replace ONLY the text
     between `<!-- stack -->` and `<!-- /stack -->` with the refreshed table; leave every
     other byte untouched. If the markers are absent, report
     `refused: #N has a hand-written body without stack markers` and stop. Otherwise
     `gh pr edit N --body-file <tmp>` and report `updated: #N`.
````

with

````
   ```bash
   git fetch -q origin
   git rev-parse --verify -q origin/<feature-branch> >/dev/null || { echo "refused: <feature-branch> is not pushed"; exit 1; }
   scripts/hitl/pr.sh list --head-prefix "<feature-branch>" --state open
   ```
   `N` is the `number` of the record whose `head` is exactly `<feature-branch>` and whose
   `base` is `main`; there is none if no such record.
   - No PR: write the body to a temp file and
     `scripts/hitl/pr.sh create --draft --base main --head <feature-branch> --title "<feature title from the spec's H1>" --body-file <tmp>`.
     Report `created: #N (draft)` with `N` from the returned record.
   - PR exists: fetch its body (`scripts/hitl/pr.sh view N`, the `body` field). Replace ONLY
     the text between `<!-- stack -->` and `<!-- /stack -->` with the refreshed table; leave
     every other byte untouched. If the markers are absent, report
     `refused: #N has a hand-written body without stack markers` and stop. Otherwise
     `scripts/hitl/pr.sh edit N --body-file <tmp>` and report `updated: #N`.
````

Then `cp .claude/commands/umbrella-pr.md templates/claude/commands/umbrella-pr.md`.

- [ ] **Step 5: Rewrite the handover agent (edit `.claude/agents/handover.md`, then copy)**

In § Gather, replace

```
- PRs: `gh pr list --state all --limit 100 --search "head:<feature-branch>" --json number,state,headRefName,baseRefName,isDraft,title`
  and `gh pr view` on any that need comments (fix-up mode).
```

with

```
- PRs: `scripts/hitl/pr.sh list --head-prefix "<feature-branch>"` (every state; each record
  carries `number`, `head`, `base`, `state`, `draft`, `title`) and
  `scripts/hitl/pr.sh view <number>` on any that need reviews and comments (fix-up mode).
```

In § Verify the mode, replace

```
  review comments (`gh pr view <n> --json reviews,comments`).
```

with

```
  review comments (`scripts/hitl/pr.sh view <n>`: its `reviews` and `comments` arrays).
```

Then `cp .claude/agents/handover.md templates/claude/agents/handover.md`.

- [ ] **Step 6: Run the whole suite**

Run: `pnpm test`
Expected: PASS — the grep test finds no offenders, and the drift test still reports every `.claude/` file equal to its template.

- [ ] **Step 7: Dry-run the rewritten commands**

With `scripts/__fixtures__/fake-gh` first on `PATH` and `FAKE_GH_LOG` set: copy `.claude/fixtures/` to `.claude/fixtures/scratch/` (the dry-run rule from `/review-spec`), write a throwaway handover document `.claude/fixtures/scratch/handover.md` by hand in the handover agent's template shape — feature `spec-fixture`, feature branch `feat/spec-fixture`, a two-row stack table from the two fixture plans (branches `feat/spec-fixture-slice-1-schema` and `feat/spec-fixture-slice-2-api`, status `todo`), an `## Umbrella PR body` and a `<!-- stack -->` table — then run `/umbrella-pr --dry-run` pointing at it and confirm the stack table's PR column is refreshed from the shim's `list` output (the fake returns #12 and #13). Delete the scratch copy after; `.claude/fixtures/` carries no handover, so nothing committed changes.

- [ ] **Step 8: Run the gates and commit**

Run: `pnpm test && pnpm format:check`
Expected: both green.

```bash
git add .claude/commands/implement-stack.md .claude/commands/umbrella-pr.md .claude/agents/handover.md \
        templates/claude/commands/implement-stack.md templates/claude/commands/umbrella-pr.md templates/claude/agents/handover.md \
        scripts/__tests__/pr-shim.test.ts
git commit -m "feat(commands): implement-stack, umbrella-pr and handover call the PR shim"
```

## Review decisions

- Task 1, Step 1 (implementer, 2026-09-16): the fake `gh` logs each call on one line, turning newlines inside an argument into spaces. The backend's `--jq` expressions span several lines, so logging `$*` verbatim split one `pr view` call across six log lines and failed the "one call" assertion. No acceptance criterion or backend byte changed.
- Task 1, Step 2 / Task 4, Step 1 (implementer, 2026-09-16): the `readdirSync` and `statSync` imports Task 4 appends were merged into the file's top `node:fs` import rather than added as a second import mid-file; the test file is Prettier-formatted so `pnpm format:check` stays green.
- Task 4, Step 7 (implementer, 2026-09-16): the implementer runs as a subagent and cannot invoke `/umbrella-pr`, so the dry run was walked by hand: a scratch copy of the fixtures with a hand-written handover, `scripts/hitl/pr.sh list --head-prefix "feat/spec-fixture-slice-"` against the fake `gh` (exit 0, one JSON array of #12 open and #13 merged, `gh` called once with `--state all --json … --jq`), scratch deleted after. Running the command itself is left to the orchestrator or the human.
