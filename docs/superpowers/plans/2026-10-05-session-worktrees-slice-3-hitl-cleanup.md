# Session worktrees — slice 3: `/hitl:cleanup`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Owns:** `/hitl:cleanup` — finding the hitl design-session worktrees, classifying each (merged · abandoned · has unsaved work · in progress), and removing the ones the human picks — plus `head_sha` in the PR shim's record and `/implement-stack`'s end-of-stack cleanup hint.

**Reviewed:** round 1 (2026-10-05) · round 2 (2026-10-05).

**Goal:** After an umbrella PR merges (or a design is abandoned), one command shows which design worktrees are provably safe to remove, why, how much space they hold, and removes the chosen ones with their local branches — never a remote branch.

**Architecture:** `installer/cleanup.mjs` (the engine, like `installer/help.mjs`: plain Node, prints one JSON document, never prompts) is driven by the plugin command `commands/cleanup.md`, which does the asking. The engine reads `git worktree list --porcelain`, keeps worktrees whose lock reason is `hitl design session: <topic> on <branch>`, fetches with `--prune`, asks the installed PR shim (`<main>/scripts/hitl/pr.sh list`) about the feature branch's PRs, and classifies. The shim's record gains `head_sha`, which keeps a squash-merged branch provably saved after the host deleted it.

**Tech Stack:** Node ESM, git, bash (shim), vitest.

**Spec:** `docs/superpowers/specs/2026-10-05-session-worktrees-design.md` (§ Design 3; § Design 2 "End of the implementation session"; § Testing "`/hitl:cleanup`", "PR shim", "`/implement-stack`'s cleanup block").

## Global Constraints

- Every behaviour change is test-first: failing test, run red, minimal code, run green, commit. Gates before the PR: `pnpm test` and `pnpm format:check`. Run `pnpm prettier --write` on `.ts`/`.mjs` files you touch.
- Templates and this repository's copies are byte-identical (`templates/scripts/pr.sh` → `scripts/hitl/pr.sh`, `templates/scripts/backends/github.sh` → `scripts/hitl/backend.sh`, `templates/claude/commands/implement-stack.md` → `.claude/commands/implement-stack.md`); mirror in the same commit and regenerate `.claude/hitl.json` (AGENTS.md § Refreshing this repository's manifest):
  ```bash
  rm .claude/hitl.json
  node --input-type=module -e 'import { THIS_REPO_CHOICES as c } from "./installer/lib.mjs"; console.log(JSON.stringify(c))' > /tmp/hitl-answers.json
  node installer/adopt.mjs --repo . --plugin-root . --answers /tmp/hitl-answers.json
  ```
- `commands/cleanup.md` and `installer/cleanup.mjs` are plugin files, not installed into target repositories; the drift test does not cover them.
- Lock reason format (from slice 2): `hitl design session: <topic> on <branch>`. `B` is the `<branch>` in the lock reason, **never** the checked-out branch (`/implement-stack` leaves the worktree on a slice branch). Slice branches are the local `B-slice-*`.
- Saved: `git rev-list <b> --not --remotes` is empty, **or** a merged PR whose head is exactly `<b>` has a `head_sha` that the tip is an ancestor of (`git merge-base --is-ancestor <tip> <head_sha>`; a `head_sha` not present locally proves nothing).
- Classes, exactly as the spec's table: **merged** (merged PR with head exactly `B`; clean; every branch to delete saved) · **abandoned** (no PR in any state with head `B`; `origin/main..B` empty; every slice branch saved or with no commit beyond `origin/main`; clean) · **has unsaved work** (merged or abandoned by the PR test but a "nothing lost" check fails) · **in progress** (anything else). Clean = `git status --porcelain` empty (ignored files do not count; they are reported).
- Before classifying, and again on `--remove`, the engine runs `git fetch --prune origin`. Fetch or shim failure → offer nothing, exit 2.
- Removal: `git worktree unlock`, `git worktree remove` without `--force` (a refusal is reported, the lock restored), then `git branch -D` on `B` and its local slice branches. Never a remote branch. A worktree is named by its absolute path, never a topic.
- The worktree the command runs in is never offered.
- The cleanup tests stand in for the installed shim with a stub at `scripts/__fixtures__/stub-pr-shim/pr.sh` copied to `<repo>/scripts/hitl/pr.sh` — the engine depends on the shim's documented contract, not on `gh`; the shim's own `gh` mapping is tested in `pr-shim.test.ts` with `fake-gh`.
- Tests use temp directories, never `docs/superpowers/`. Markdown is never formatted.

## Review Focus

- A worktree whose folder was deleted by hand (`rm -rf`) but is still registered — `git status` fails there; the engine must not crash or offer it, and lists it with `unsaved` containing "the worktree folder is missing". Test in Task 2 ("does not crash on a registered worktree whose folder was deleted").
- A worktree left on a detached HEAD with commits on no branch — removing it would discard them; Task 2 Cycle 10.
- Two hitl worktrees, one removable, one not — one question removes only the offered one; Task 3's mixed test.
- A `fix/` feature branch (bugfixes use `fix/<topic>`) — its slices must be found from `B` verbatim, not from a hard-coded `feat/`; Task 2 Cycle 6 ("finds slice branches of a fix/ branch").
- A repository with no `origin` remote — `fetch` fails → exit 2 with a plain message; Task 2's fetch-failure test.
- `--remove` given a path that is a hitl worktree but now classified "in progress" (a commit landed since the listing) — refused, worktree untouched; Task 3.

---

## File structure

| Path | Responsibility |
|---|---|
| `templates/scripts/backends/github.sh`, `scripts/hitl/backend.sh` | record gains `head_sha` (`headRefOid`) |
| `templates/scripts/pr.sh`, `scripts/hitl/pr.sh` | header comment documents `head_sha` |
| `scripts/__fixtures__/fake-gh/gh` | canned records and raw records carry the head commit |
| `scripts/__tests__/pr-shim.test.ts` | expectations include `head_sha` |
| `installer/cleanup.mjs` | the engine: list, classify, remove |
| `scripts/__fixtures__/stub-pr-shim/pr.sh` | stub shim: `list` prints `$FAKE_PRS` |
| `scripts/__tests__/cleanup.test.ts` | engine tests on real temp repos with a bare remote |
| `commands/cleanup.md` | the plugin command: present, ask once, remove |
| `commands/help.md` | lists `/hitl:cleanup` among the plugin commands |
| `templates/claude/commands/implement-stack.md`, `.claude/commands/implement-stack.md` | end-of-stack cleanup hint |
| `.claude/hitl.json` | regenerated |

---

### Task 1: the PR shim's record carries `head_sha`

**Files:**
- Modify: `templates/scripts/backends/github.sh:5-7`, `templates/scripts/pr.sh` (header comment), copies under `scripts/hitl/`
- Modify: `scripts/__fixtures__/fake-gh/gh`
- Modify: `.claude/hitl.json` (regenerated)
- Test: `scripts/__tests__/pr-shim.test.ts`

**Interfaces:**
- Produces: every shim record has `head_sha: string | null` (the PR's head commit). Task 2 reads it.

- [ ] **Step 1: Write the failing test**

In `scripts/__tests__/pr-shim.test.ts`, in `"narrows on the server by head and keeps only exact prefix matches"`, add `head_sha: "sha12",` to the expected record (after `body: ""`). That test runs the real `--jq` against `gh`-shaped input, so it proves the mapping.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run --config scripts/vitest.config.ts scripts/__tests__/pr-shim.test.ts`
Expected: FAIL — the record has no `head_sha`.

- [ ] **Step 3: Implementation**

`templates/scripts/backends/github.sh`:

```bash
RECORD_FIELDS='number,url,headRefName,baseRefName,state,isDraft,title,body,headRefOid'
RECORD_JQ='{number: .number, url: .url, head: .headRefName, base: .baseRefName,
            state: (.state | ascii_downcase), draft: .isDraft, title: .title, body: .body,
            head_sha: .headRefOid}'
```

`templates/scripts/pr.sh` header: change the record line to

```bash
#   { number, url, head, base, state: open|merged|closed, draft, title, body, head_sha }
```

and add under it:

```bash
# head_sha is the PR's head commit (what the host merged, for a merged PR); /hitl:cleanup uses
# it to prove a squash-merged branch saved after the host deleted it. A backend must supply it.
```

`scripts/__fixtures__/fake-gh/gh`: in `rec()`, add `"headRefOid":"sha%s"` to the printf format and pass `"$1"` once more:

```bash
      rec() { # number head state
        printf '{"number":%s,"url":"https://github.com/o/r/pull/%s","headRefName":%s,"baseRefName":"feat/x","state":"%s","isDraft":false,"title":"t","body":"","headRefOid":"sha%s"}' \
          "$1" "$1" "$2" "$3" "$1"
      }
```

and add `"head_sha":"abc1234"` to each canned normalised record (`record=…`, the `pr view … reviews` line, and both entries of the ok-mode `pr list` array). In the test file, add `head_sha: "abc1234",` to the `RECORD` constant.

```bash
cp templates/scripts/backends/github.sh scripts/hitl/backend.sh
cp templates/scripts/pr.sh scripts/hitl/pr.sh
# regenerate .claude/hitl.json (Global Constraints)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS (pr-shim, drift and self-manifest included).

- [ ] **Step 5: Commit**

```bash
git add templates/scripts scripts/hitl scripts/__fixtures__/fake-gh/gh scripts/__tests__/pr-shim.test.ts .claude/hitl.json
git commit -m "feat(pr-shim): records carry the PR's head commit as head_sha"
```

---

### Task 2: the engine lists and classifies — one red/green cycle per behaviour

**Files:**
- Create: `installer/cleanup.mjs`
- Create: `scripts/__fixtures__/stub-pr-shim/pr.sh` (executable)
- Test: `scripts/__tests__/cleanup.test.ts`

**Interfaces:**
- Consumes: `parseArgs`, `emit` from `installer/lib.mjs`; the shim contract `pr.sh list --head-prefix <p> --state all` → JSON array of records with `head`, `state`, `number`, `url`, `head_sha`.
- Produces: `node installer/cleanup.mjs --repo <dir>` → exit 0 and
  `{ main, pruned: true, worktrees: [{ path, topic, branch, checkedOut, class, offered, here, umbrella: {number,url}|null, branches: string[], unsaved: string[], sizeKb: number|null, ignored: [{entry, sizeKb}] }] }`;
  exit 1 `{ error }` on usage; exit 2 `{ error }` when the fetch or the shim fails. `class` is one of `"merged" | "abandoned" | "has unsaved work" | "in progress"`.

Each cycle: add the test(s), run `pnpm vitest run --config scripts/vitest.config.ts scripts/__tests__/cleanup.test.ts`, see the stated failure, apply the code change, run again to green, commit. Never add a later cycle's code early: each test must be seen failing for its own reason.

- [ ] **Step 1: The stub shim**

`scripts/__fixtures__/stub-pr-shim/pr.sh` (then `chmod +x`):

```bash
#!/usr/bin/env bash
# Stub of the installed PR shim for the cleanup tests. `list` prints the JSON array in
# $FAKE_PRS (the engine filters by head itself); FAKE_PRS_FAIL=1 fails like a host error.
set -u
if [ "${FAKE_PRS_FAIL:-}" = 1 ]; then
  echo "stub: host unreachable" >&2
  exit 2
fi
[ "${1:-}" = list ] || { echo "stub: only list is supported" >&2; exit 1; }
cat "${FAKE_PRS:?FAKE_PRS must be set}"
```

- [ ] **Step 2: Cycle 1 — tracer: listing, abandoned, in progress, failures**

Create `scripts/__tests__/cleanup.test.ts` with the helpers and the first tests:

```ts
// scripts/__tests__/cleanup.test.ts
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const CLEANUP = join(ROOT, "installer/cleanup.mjs");
const STUB = join(ROOT, "scripts/__fixtures__/stub-pr-shim/pr.sh");
const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, env: ENV, encoding: "utf8" }).trim();
}

type Pr = { number: number; head: string; state: "open" | "merged" | "closed"; head_sha?: string };

/** A bare remote, a clone of it with one pushed commit on main, and the stub shim installed. */
function world() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "hitl-cleanup-")));
  const remote = join(base, "remote.git");
  git(base, "init", "-q", "--bare", "-b", "main", remote);
  const main = join(base, "main");
  git(base, "clone", "-q", remote, main);
  writeFileSync(join(main, ".gitignore"), ".claude/worktrees/\nnode_modules/\nscripts/hitl/\n");
  git(main, "add", ".gitignore");
  git(main, "commit", "-q", "-m", "init");
  git(main, "push", "-q", "origin", "HEAD:main");
  git(main, "fetch", "-q", "origin");
  mkdirSync(join(main, "scripts/hitl"), { recursive: true });
  copyFileSync(STUB, join(main, "scripts/hitl/pr.sh"));
  chmodSync(join(main, "scripts/hitl/pr.sh"), 0o755);
  const prsFile = join(base, "prs.json");
  const setPrs = (prs: Pr[]) =>
    writeFileSync(
      prsFile,
      JSON.stringify(
        prs.map((p) => ({
          url: `https://host/pr/${p.number}`,
          base: "main",
          draft: false,
          title: "t",
          body: "",
          head_sha: null,
          ...p,
        })),
      ),
    );
  setPrs([]);
  return { base, main, prsFile, setPrs };
}
type World = ReturnType<typeof world>;

function designWorktree(w: World, topic: string, prefix = "feat") {
  const path = join(w.main, ".claude/worktrees", topic);
  const branch = `${prefix}/${topic}`;
  git(w.main, "worktree", "add", "-q", path, "-b", branch, "origin/main");
  git(w.main, "worktree", "lock", "--reason", `hitl design session: ${topic} on ${branch}`, path);
  return { path, branch };
}

function commit(cwd: string, file: string): string {
  writeFileSync(join(cwd, file), file);
  git(cwd, "add", file);
  git(cwd, "commit", "-q", "-m", file);
  return git(cwd, "rev-parse", "HEAD");
}

function cleanup(w: World, args: string[] = [], env: Record<string, string> = {}, repo = w.main) {
  const r = spawnSync(process.execPath, [CLEANUP, "--repo", repo, ...args], {
    encoding: "utf8",
    env: { ...ENV, FAKE_PRS: w.prsFile, ...env },
  });
  return { status: r.status, json: JSON.parse(r.stdout), stderr: r.stderr };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const at = (out: any, path: string) => out.worktrees.find((x: { path: string }) => x.path === path);

describe("cleanup.mjs — which worktrees", () => {
  it("lists only worktrees locked by a hitl design session", () => {
    const w = world();
    git(w.main, "worktree", "add", "-q", join(w.main, ".claude/worktrees/plain"), "-b", "plain");
    const other = join(w.main, ".claude/worktrees/other");
    git(w.main, "worktree", "add", "-q", other, "-b", "other");
    git(w.main, "worktree", "lock", "--reason", "something else", other);
    const { path } = designWorktree(w, "a");
    const r = cleanup(w);
    expect(r.status).toBe(0);
    expect(r.json.worktrees.map((x: { path: string }) => x.path)).toEqual([path]);
  });

  it("exits 1 without --repo", () => {
    const r = spawnSync(process.execPath, [CLEANUP], { encoding: "utf8" });
    expect(r.status).toBe(1);
  });
});

describe("cleanup.mjs — classes", () => {
  it("abandoned: no PR, no commits beyond origin/main, clean", () => {
    const w = world();
    const { path, branch } = designWorktree(w, "a");
    const e = at(cleanup(w).json, path);
    expect(e).toMatchObject({ topic: "a", branch, class: "abandoned", offered: true, here: false });
    expect(e.branches).toEqual([branch]);
    expect(e.sizeKb).toBeGreaterThan(0);
  });

  it("in progress: commits but no PR — listed, not offered", () => {
    const w = world();
    const { path } = designWorktree(w, "p");
    commit(path, "spec.md");
    expect(at(cleanup(w).json, path)).toMatchObject({ class: "in progress", offered: false });
  });
});

describe("cleanup.mjs — failures offer nothing", () => {
  it("exits 2 when the PR shim fails", () => {
    const w = world();
    designWorktree(w, "a");
    const r = cleanup(w, [], { FAKE_PRS_FAIL: "1" });
    expect(r.status).toBe(2);
    expect(r.json.error).toMatch(/PR shim/);
  });

  it("exits 2 when the fetch fails", () => {
    const w = world();
    designWorktree(w, "a");
    git(w.main, "remote", "set-url", "origin", join(w.base, "nowhere.git"));
    const r = cleanup(w);
    expect(r.status).toBe(2);
    expect(r.json.error).toMatch(/fetch/);
  });
});
```

Expected red: every test fails — `installer/cleanup.mjs` does not exist (`JSON.parse` of empty stdout). This is the tracer cycle; the module's absence is the right failure here.

Green — create `installer/cleanup.mjs`:

```js
#!/usr/bin/env node
// /hitl:cleanup's engine. Finds the worktrees hitl design sessions created — locked with
// "hitl design session: <topic> on <branch>" — and classifies each: merged · abandoned ·
// has unsaved work · in progress. With --remove it deletes exactly the named ones after
// re-checking them. Never prompts and never touches a remote branch.
// Exit: 0 ok · 1 usage · 2 the fetch or the PR shim failed.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { emit, parseArgs } from "./lib.mjs";

const USAGE = "usage: --repo <dir> [--remove <abs worktree path>[,<abs worktree path>…]]";
const REASON = /^hitl design session: (\S+) on (\S+)$/;
const BASE = "origin/main";

class Failure extends Error {}

function git(cwd, ...args) {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}

const lines = (text) => text.split("\n").filter(Boolean);

/** Worktrees locked by a hitl design session: { path, topic, branch, checkedOut }. */
function hitlWorktrees(main) {
  return git(main, "worktree", "list", "--porcelain")
    .out.split("\n\n")
    .map((block) => {
      const get = (key) =>
        lines(block)
          .find((l) => l.startsWith(`${key} `))
          ?.slice(key.length + 1);
      const m = (get("locked") ?? "").match(REASON);
      if (!m) return null;
      const head = (get("branch") ?? "").replace(/^refs\/heads\//, "");
      return { path: get("worktree"), topic: m[1], branch: m[2], checkedOut: head || null };
    })
    .filter(Boolean);
}

function listPrs(main, branch) {
  const r = spawnSync(
    join(main, "scripts/hitl/pr.sh"),
    ["list", "--head-prefix", branch, "--state", "all"],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    const why = (r.stderr || r.error?.message || `exit ${r.status}`).trim();
    throw new Failure(`the PR shim failed: ${why}`);
  }
  return JSON.parse(r.stdout);
}

const exists = (main, b) => git(main, "rev-parse", "--verify", "--quiet", `refs/heads/${b}`).ok;
const beyondBase = (main, b) => lines(git(main, "rev-list", `${BASE}..${b}`).out).length;

function sizeKb(path) {
  const r = spawnSync("du", ["-sk", path], { encoding: "utf8" });
  return r.status === 0 ? Number(r.stdout.split(/\s/)[0]) : null;
}

function classify(main, here, wt) {
  const prs = listPrs(main, wt.branch);
  const branches = [wt.branch].filter((b) => exists(main, b));
  const umbrella = prs.filter((p) => p.head === wt.branch);
  const unsaved = [];

  let cls = "in progress";
  if (umbrella.length === 0 && exists(main, wt.branch) && beyondBase(main, wt.branch) === 0)
    cls = "abandoned";
  return {
    ...wt,
    class: cls,
    offered: cls === "merged" || cls === "abandoned",
    here: false,
    umbrella: null,
    branches,
    unsaved,
    sizeKb: sizeKb(wt.path),
    ignored: [],
  };
}

function run(args) {
  if (!args?.repo) return { code: 1, out: { error: USAGE } };
  const common = git(args.repo, "rev-parse", "--path-format=absolute", "--git-common-dir");
  if (!common.ok) return { code: 1, out: { error: `${args.repo} is not in a git repository` } };
  const main = dirname(common.out);
  const here = git(args.repo, "rev-parse", "--show-toplevel").out;
  const fetch = git(main, "fetch", "--prune", "origin");
  if (!fetch.ok) return { code: 2, out: { error: `git fetch --prune origin failed: ${fetch.err}` } };
  try {
    const worktrees = hitlWorktrees(main).map((wt) => classify(main, here, wt));
    if (!args.remove) return { code: 0, out: { main, pruned: true, worktrees } };
    return { code: 0, out: { main, pruned: true, ...removeAll(main, worktrees, args.remove) } };
  } catch (e) {
    if (e instanceof Failure) return { code: 2, out: { error: e.message } };
    throw e;
  }
}

function removeAll() {
  throw new Failure("--remove is not implemented yet");
}

emit(run(parseArgs(process.argv.slice(2))));
```

Green: all six pass. Commit: `feat(cleanup): list hitl design-session worktrees; abandoned and in progress`.

- [ ] **Step 3: Cycle 2 — merged (squash-merged umbrella, branch on the remote)**

```ts
  it("merged: squash-merged umbrella PR, pushed branch, clean", () => {
    const w = world();
    const { path, branch } = designWorktree(w, "m");
    const tip = commit(path, "spec.md");
    git(path, "push", "-q", "origin", branch);
    w.setPrs([{ number: 7, head: branch, state: "merged", head_sha: tip }]);
    const e = at(cleanup(w).json, path);
    expect(e).toMatchObject({ class: "merged", offered: true, umbrella: { number: 7 } });
  });
```

Expected red: `class` is `"in progress"`, expected `"merged"`.

Green — in `classify`, after `const umbrella = …`:

```js
  const merged = umbrella.find((p) => p.state === "merged") ?? null;
```

replace the classification and the `umbrella` field:

```js
  let cls = "in progress";
  if (merged) cls = "merged";
  else if (umbrella.length === 0 && exists(main, wt.branch) && beyondBase(main, wt.branch) === 0)
    cls = "abandoned";
  const shown = merged ?? umbrella[0] ?? null;
```

and in the returned object `umbrella: shown ? { number: shown.number, url: shown.url } : null,`. Commit: `feat(cleanup): a merged umbrella PR classifies as merged`.

- [ ] **Step 4: Cycle 3 — a local commit on no remote is unsaved work**

```ts
  it("has unsaved work: a local commit on no remote and in no merged PR", () => {
    const w = world();
    const { path, branch } = designWorktree(w, "m");
    const tip = commit(path, "spec.md");
    git(path, "push", "-q", "origin", branch);
    w.setPrs([{ number: 7, head: branch, state: "merged", head_sha: tip }]);
    commit(path, "later.md");
    const e = at(cleanup(w).json, path);
    expect(e).toMatchObject({ class: "has unsaved work", offered: false });
    expect(e.unsaved.join(" ")).toContain(branch);
  });
```

Expected red: `class` is `"merged"`.

Green — add the remotes-only saved test:

```js
/** On a remote-tracking ref. (Cycle 5 adds: or at/behind a merged PR's head commit.) */
function isSaved(main, b) {
  const r = git(main, "rev-list", b, "--not", "--remotes");
  return r.ok && r.out === "";
}
```

in `classify`, after `if (merged) cls = "merged";` make it a block:

```js
  if (merged) {
    cls = "merged";
    for (const b of branches)
      if (!isSaved(main, b, prs))
        unsaved.push(`${b} has commits that are on no remote branch and in no merged PR`);
  } else if (…unchanged…)
```

and before the `return`:

```js
  if (cls !== "in progress" && unsaved.length > 0) cls = "has unsaved work";
```

Commit: `feat(cleanup): a branch with commits on no remote is unsaved work`.

- [ ] **Step 5: Cycle 4 — an untracked file is unsaved work**

```ts
  it("has unsaved work: an untracked file", () => {
    const w = world();
    const { path } = designWorktree(w, "a");
    writeFileSync(join(path, "notes.txt"), "x");
    const e = at(cleanup(w).json, path);
    expect(e.class).toBe("has unsaved work");
    expect(e.unsaved.join(" ")).toContain("notes.txt");
  });
```

Expected red: `class` is `"abandoned"`.

Green — replace `const unsaved = [];` with:

```js
  const unsaved = lines(git(wt.path, "status", "--porcelain").out).map(
    (l) => `not committed: ${l.slice(3)}`,
  );
```

Commit: `feat(cleanup): uncommitted or untracked files are unsaved work`.

- [ ] **Step 6: Cycle 5 — a host-deleted, pruned branch is saved through `head_sha`**

```ts
  it("merged: a branch the host deleted and the fetch pruned is saved through head_sha", () => {
    const w = world();
    const { path, branch } = designWorktree(w, "d");
    const tip = commit(path, "spec.md");
    git(path, "push", "-q", "origin", branch);
    git(w.main, "push", "-q", "origin", "--delete", branch);
    w.setPrs([{ number: 8, head: branch, state: "merged", head_sha: tip }]);
    expect(at(cleanup(w).json, path).class).toBe("merged");
    commit(path, "beyond.md");
    expect(at(cleanup(w).json, path).class).toBe("has unsaved work");
  });
```

Expected red: the first expectation gets `"has unsaved work"` — after `fetch --prune` the branch is on no remote-tracking ref, and the remotes-only `isSaved` cannot see the merged PR.

Green — replace `isSaved`:

```js
/** On a remote-tracking ref, or at/behind the head commit of a merged PR for that branch. */
function isSaved(main, b, prs) {
  const r = git(main, "rev-list", b, "--not", "--remotes");
  if (r.ok && r.out === "") return true;
  const tip = git(main, "rev-parse", b).out;
  return prs.some(
    (p) =>
      p.head === b &&
      p.state === "merged" &&
      p.head_sha &&
      git(main, "merge-base", "--is-ancestor", tip, p.head_sha).ok,
  );
}
```

Commit: `feat(cleanup): a squash-merged branch the host deleted is saved through the PR's head commit`.

- [ ] **Step 7: Cycle 6 — slice branches**

```ts
  it("in progress while the worktree sits on a merged slice and the umbrella is open; merged after", () => {
    const w = world();
    const { path, branch } = designWorktree(w, "s");
    const feat = commit(path, "spec.md");
    git(path, "push", "-q", "origin", branch);
    const slice = `${branch}-slice-1-api`;
    git(path, "checkout", "-q", "-b", slice);
    const sliceTip = commit(path, "api.ts");
    git(path, "push", "-q", "origin", slice);
    w.setPrs([
      { number: 1, head: slice, state: "merged", head_sha: sliceTip },
      { number: 2, head: branch, state: "open", head_sha: feat },
    ]);
    expect(at(cleanup(w).json, path)).toMatchObject({
      class: "in progress",
      offered: false,
      branch,
      checkedOut: slice,
    });
    w.setPrs([
      { number: 1, head: slice, state: "merged", head_sha: sliceTip },
      { number: 2, head: branch, state: "merged", head_sha: feat },
    ]);
    const e = at(cleanup(w).json, path);
    expect(e.class).toBe("merged");
    expect(e.branches.sort()).toEqual([branch, slice].sort());
  });

  it("has unsaved work: abandoned, but a local slice branch carries an unpushed commit", () => {
    const w = world();
    const { path, branch } = designWorktree(w, "u");
    git(path, "checkout", "-q", "-b", `${branch}-slice-1-a`);
    commit(path, "wip.ts");
    expect(at(cleanup(w).json, path).class).toBe("has unsaved work");
  });

  it("finds slice branches of a fix/ branch", () => {
    const w = world();
    const { path, branch } = designWorktree(w, "api-v2", "fix");
    git(w.main, "branch", `${branch}-slice-1-a`, branch);
    expect(at(cleanup(w).json, path).branches.sort()).toEqual(
      [branch, `${branch}-slice-1-a`].sort(),
    );
  });
```

Expected red: the first test's last expectation gets `[branch]` (slices not collected); the second gets `"abandoned"`; the third gets `[branch]`.

Green — in `classify`, replace `const branches = …` with:

```js
  const slices = lines(
    git(main, "for-each-ref", "--format=%(refname:short)", `refs/heads/${wt.branch}-slice-*`).out,
  );
  const branches = [wt.branch, ...slices].filter((b) => exists(main, b));
```

and make the abandoned branch a block:

```js
  } else if (umbrella.length === 0 && exists(main, wt.branch) && beyondBase(main, wt.branch) === 0) {
    cls = "abandoned";
    for (const b of slices)
      if (!isSaved(main, b, prs) && beyondBase(main, b) > 0)
        unsaved.push(`${b} has commits that are on no remote branch`);
  }
```

Commit: `feat(cleanup): slice branches are found from the lock's branch and checked before removal`.

- [ ] **Step 8: Cycle 7 — gitignored entries are reported**

```ts
  it("reports gitignored entries with their size", () => {
    const w = world();
    const { path } = designWorktree(w, "a");
    mkdirSync(join(path, "node_modules/x"), { recursive: true });
    writeFileSync(join(path, "node_modules/x/index.js"), "x".repeat(10_000));
    const e = at(cleanup(w).json, path);
    expect(e.class).toBe("abandoned");
    expect(e.ignored).toEqual([{ entry: "node_modules/", sizeKb: expect.any(Number) }]);
  });
```

Expected red: `ignored` is `[]`.

Green — add:

```js
function ignoredEntries(path) {
  return lines(git(path, "status", "--porcelain", "--ignored=matching").out)
    .filter((l) => l.startsWith("!! "))
    .map((l) => l.slice(3))
    .map((entry) => ({ entry, sizeKb: sizeKb(join(path, entry)) }));
}
```

and in the returned object `ignored: ignoredEntries(wt.path),`. Commit: `feat(cleanup): report the gitignored files a removal also deletes`.

- [ ] **Step 9: Cycle 8 — never offer the worktree it runs in**

```ts
  it("never offers the worktree it runs in", () => {
    const w = world();
    const { path } = designWorktree(w, "a");
    expect(at(cleanup(w, [], {}, path).json, path)).toMatchObject({
      class: "abandoned",
      offered: false,
      here: true,
    });
  });
```

Expected red: `offered` is `true`, `here` is `false`.

Green — before the `return` in `classify`:

```js
  const isHere = resolve(wt.path) === resolve(here);
```

and `offered: (cls === "merged" || cls === "abandoned") && !isHere,` · `here: isHere,`. Commit: `feat(cleanup): never offer the worktree the command runs in`.

- [ ] **Step 10: Cycle 9 — a registered worktree whose folder was deleted**

```ts
  it("does not crash on a registered worktree whose folder was deleted", () => {
    const w = world();
    const { path } = designWorktree(w, "gone");
    rmSync(path, { recursive: true, force: true });
    const r = cleanup(w);
    expect(r.status).toBe(0);
    expect(at(r.json, path)).toMatchObject({ offered: false });
    expect(at(r.json, path).unsaved).toContain("the worktree folder is missing");
  });
```

Expected red: `offered` is `true` (an empty `git status` in a missing folder reads as clean) and `unsaved` lacks the message.

Green — in `classify`:

```js
  const present = existsSync(wt.path);
  const unsaved = present
    ? lines(git(wt.path, "status", "--porcelain").out).map((l) => `not committed: ${l.slice(3)}`)
    : ["the worktree folder is missing"];
```

and `offered: (cls === "merged" || cls === "abandoned") && !isHere && present,` · `sizeKb: present ? sizeKb(wt.path) : null,` · `ignored: present ? ignoredEntries(wt.path) : [],`. Commit: `fix(cleanup): a worktree whose folder is gone is listed, never offered`.

- [ ] **Step 11: Cycle 10 — commits on a detached HEAD are unsaved work**

```ts
  it("has unsaved work: a detached HEAD with commits on no branch", () => {
    const w = world();
    const { path } = designWorktree(w, "h");
    git(path, "checkout", "-q", "--detach");
    commit(path, "loose.md");
    git(path, "checkout", "-q", "--detach", "origin/main");
    commit(path, "loose2.md");
    const e = at(cleanup(w).json, path);
    expect(e.class).toBe("has unsaved work");
    expect(e.unsaved.join(" ")).toContain("detached HEAD");
  });
```

Expected red: `class` is `"abandoned"` — `B` has no commits beyond `origin/main`, the tree is clean, and the loose commit is on no branch the classification looks at.

Green — in `classify`, after the `unsaved` initialisation:

```js
  if (present && !wt.checkedOut) {
    const loose = git(wt.path, "rev-list", "HEAD", "--not", "--branches", "--remotes");
    if (!loose.ok || loose.out !== "")
      unsaved.push("detached HEAD has commits that are on no branch and no remote");
  }
```

Commit: `fix(cleanup): commits on a detached HEAD count as unsaved work`.

- [ ] **Step 12: Gates**

```bash
pnpm prettier --write installer/cleanup.mjs scripts/__tests__/cleanup.test.ts
pnpm test && pnpm format:check
```

Commit any formatting change: `style(cleanup): prettier`.

---

### Task 3: `--remove` re-checks, then removes worktree and local branches

**Files:**
- Modify: `installer/cleanup.mjs` (`removeAll`)
- Test: `scripts/__tests__/cleanup.test.ts`

**Interfaces:**
- Consumes: `classify` output from Task 2 (`offered`, `here`, `class`, `branches`, `topic`, `branch`).
- Produces: `--remove <p>[,<p>…]` → exit 0 and `{ main, pruned: true, removed: [{ path, branches }], refused: [{ path, why }] }`.

Same cycle discipline as Task 2.

- [ ] **Step 1: Cycle 1 — remove a merged worktree and its local branches, keep the remote**

```ts
describe("cleanup.mjs --remove", () => {
  it("removes the worktree and its local branches, leaves the remote branch", () => {
    const w = world();
    const { path, branch } = designWorktree(w, "m");
    const tip = commit(path, "spec.md");
    git(path, "push", "-q", "origin", branch);
    w.setPrs([{ number: 7, head: branch, state: "merged", head_sha: tip }]);
    const r = cleanup(w, ["--remove", path]);
    expect(r.status).toBe(0);
    expect(r.json.removed).toEqual([{ path, branches: [branch] }]);
    expect(existsSync(path)).toBe(false);
    expect(git(w.main, "branch", "--list", branch)).toBe("");
    expect(git(w.main, "ls-remote", "--heads", "origin", branch)).not.toBe("");
  });

  it("removes a worktree holding gitignored files", () => {
    const w = world();
    const { path } = designWorktree(w, "a");
    mkdirSync(join(path, "node_modules"), { recursive: true });
    writeFileSync(join(path, "node_modules/x.js"), "x");
    expect(cleanup(w, ["--remove", path]).json.removed).toHaveLength(1);
    expect(existsSync(path)).toBe(false);
  });
});
```

Expected red: exit 2, "--remove is not implemented yet".

Green — replace `removeAll`:

```js
function removeAll(main, worktrees, list) {
  const removed = [];
  const refused = [];
  for (const path of list.split(",").map((p) => resolve(p))) {
    const wt = worktrees.find((w) => resolve(w.path) === path);
    git(main, "worktree", "unlock", path);
    const rm = git(main, "worktree", "remove", path);
    if (!rm.ok) {
      git(main, "worktree", "lock", "--reason", `hitl design session: ${wt.topic} on ${wt.branch}`, path);
      refused.push({ path, why: rm.err });
      continue;
    }
    removed.push({ path, branches: wt.branches.filter((b) => git(main, "branch", "-D", b).ok) });
  }
  return { removed, refused };
}
```

Commit: `feat(cleanup): --remove deletes the worktree and its local branches`.

- [ ] **Step 2: Cycle 2 — a worktree on a slice branch: `B` and every `B-slice-*` go, remotes stay**

```ts
  it("removes B and its slice branches when the worktree sits on a slice branch", () => {
    const w = world();
    const { path, branch } = designWorktree(w, "s");
    const feat = commit(path, "spec.md");
    git(path, "push", "-q", "origin", branch);
    const slice = `${branch}-slice-1-api`;
    git(path, "checkout", "-q", "-b", slice);
    const sliceTip = commit(path, "api.ts");
    git(path, "push", "-q", "origin", slice);
    w.setPrs([
      { number: 1, head: slice, state: "merged", head_sha: sliceTip },
      { number: 2, head: branch, state: "merged", head_sha: feat },
    ]);
    const r = cleanup(w, ["--remove", path]);
    expect(r.json.removed).toHaveLength(1);
    expect(r.json.removed[0].branches.sort()).toEqual([branch, slice].sort());
    expect(git(w.main, "branch", "--list", branch, slice)).toBe("");
    expect(git(w.main, "ls-remote", "--heads", "origin", branch)).not.toBe("");
    expect(git(w.main, "ls-remote", "--heads", "origin", slice)).not.toBe("");
  });
```

Expected: green on arrival if Cycle 1 deletes `wt.branches` — this pins the path `/implement-stack` leaves behind (worktree on a slice branch). If it is red, the failure names which branch survived; fix `removeAll` so it deletes every entry of `wt.branches` after the worktree is gone.

Commit: `test(cleanup): --remove deletes the feature and slice branches of a worktree on a slice`.

- [ ] **Step 3: Cycle 3 — re-check: refuse what is no longer offered**

```ts
  it("re-checks: refuses a worktree that gained a commit since the listing", () => {
    const w = world();
    const { path } = designWorktree(w, "a");
    expect(at(cleanup(w).json, path).offered).toBe(true);
    commit(path, "spec.md");
    const r = cleanup(w, ["--remove", path]);
    expect(r.json.removed).toEqual([]);
    expect(r.json.refused).toEqual([{ path, why: "it is in progress" }]);
    expect(existsSync(path)).toBe(true);
  });

  it("removes only the offered one of two", () => {
    const w = world();
    const a = designWorktree(w, "a");
    const p = designWorktree(w, "p");
    commit(p.path, "spec.md");
    const r = cleanup(w, ["--remove", `${a.path},${p.path}`]);
    expect(r.json.removed.map((x: { path: string }) => x.path)).toEqual([a.path]);
    expect(r.json.refused.map((x: { path: string }) => x.path)).toEqual([p.path]);
  });
```

Expected red: the in-progress worktree is removed (`removed` has it; `existsSync` is false).

Green — at the top of the loop body, after `const wt = …`:

```js
    if (!wt.offered) {
      const why = wt.here ? "this command is running inside it" : `it is ${wt.class}`;
      refused.push({ path, why });
      continue;
    }
```

Commit: `fix(cleanup): --remove refuses a worktree that is no longer safe`.

- [ ] **Step 4: Cycle 4 — a path that is not a hitl worktree**

```ts
  it("refuses a path that is not a hitl worktree", () => {
    const w = world();
    const r = cleanup(w, ["--remove", join(w.base, "elsewhere")]);
    expect(r.status).toBe(0);
    expect(r.json.refused[0].why).toBe("not a hitl design-session worktree");
  });
```

Expected red: the engine throws on `wt.offered` of `undefined` (non-zero exit, unparsable stdout).

Green — right after `const wt = …`:

```js
    if (!wt) {
      refused.push({ path, why: "not a hitl design-session worktree" });
      continue;
    }
```

Commit: `fix(cleanup): --remove refuses a path that is not a hitl worktree`.

- [ ] **Step 5: Gates**

```bash
pnpm prettier --write installer/cleanup.mjs scripts/__tests__/cleanup.test.ts
pnpm test && pnpm format:check
```

The `git worktree remove` refusal branch (lock restored, refusal reported) has no test: it is reachable only through a race between classification and removal — see `## Review decisions`.

---

### Task 4: the `/hitl:cleanup` command, `/hitl:help`, and the end-of-stack hint

**Files:**
- Create: `commands/cleanup.md`
- Modify: `commands/help.md:36`
- Modify: `templates/claude/commands/implement-stack.md` (§ 2), `.claude/commands/implement-stack.md`
- Modify: `.claude/hitl.json` (regenerated)

- [ ] **Step 1: `commands/cleanup.md`**

````markdown
---
description: Offer to remove the worktrees hitl design sessions left behind, once each is provably safe — merged or abandoned, nothing unsaved. Never touches remote branches. Usage: /hitl:cleanup
---

```bash
node "${CLAUDE_PLUGIN_ROOT}/installer/cleanup.mjs" --repo "$PWD"
```

- Exit 2 → "Nothing can be offered: <error>." Stop. Exit 1 → print the error. Stop.
- Say first, once: "Fetched origin with --prune (remote-tracking refs of branches the host
  deleted were removed)."
- No entries at all → "No hitl design-session worktrees here." Stop.

For each entry with `offered: true`, one block in plain words (sizes as MB or GB):

```
<path>  —  <branch>, <size>
  Safe to remove because: <merged: "its umbrella PR #<umbrella.number> is merged and nothing in it is unsaved"; abandoned: "nothing was ever committed or saved in it">
  Also deleted (gitignored): <each ignored entry with its size, or "nothing">
  Local branches deleted with it: <branches>
```

Then the total size, and "Remote branches are left alone — delete them on the host if it does
not do so on merge."

Then, not offered, one line each: `has unsaved work` entries with their `unsaved` lines;
`in progress` entries ("<path> — <branch>, in progress"); an entry with `here: true` gets
"run /hitl:cleanup from the main checkout to remove it".

No `offered: true` entry → say so after that list. Stop.

Otherwise ask once: **"Remove all N? (yes / pick some / no)"**. "pick some" → ask which, by
path. "no" → stop. Then:

```bash
node "${CLAUDE_PLUGIN_ROOT}/installer/cleanup.mjs" --repo "$PWD" --remove "<abs path>,<abs path>"
```

Report each `removed` entry (path, branches deleted) and each `refused` entry with its `why`
in plain words. End with the remote-branches sentence.
````

- [ ] **Step 2: `/hitl:help`**

`commands/help.md` line 36:
`  Plugin commands:   /hitl:init [--adopt] · /hitl:diff [--apply] · /hitl:help · /hitl:customize · /hitl:cleanup`

- [ ] **Step 3: `/implement-stack`'s end-of-stack hint**

In `templates/claude/commands/implement-stack.md` § 2, after the sentence ending `Do not mark anything ready for review. Do not merge.`, add:

````markdown

End the report with this block, in plain words, `<abs path>` being `git rev-parse
--show-toplevel` and the branches the feature branch and its local slice branches:

> When the umbrella PR merges, clean up from the **main checkout** — not from this session,
> which is running inside the worktree: run `/hitl:cleanup`, or
> `git worktree unlock <abs path>` (only if `git worktree list` shows it locked) ·
> `git worktree remove <abs path>` · `git branch -D <feature branch> <slice branches>`.
> Until then the worktree stays: a fix-up round runs in it.

Omit the block when this session is not in a linked worktree (`git rev-parse --git-dir` equals
`--git-common-dir`). Never remove the worktree yourself.
````

```bash
cp templates/claude/commands/implement-stack.md .claude/commands/implement-stack.md
# regenerate .claude/hitl.json (Global Constraints)
pnpm test && pnpm format:check
```

- [ ] **Step 4: Dry run (recorded in the PR body)**

In a scratch clone with one merged and one abandoned hitl worktree, run `/hitl:cleanup`, answer "pick some" with the abandoned one, and paste the transcript summary under `## Dry run` in the PR body. If the orchestrator cannot run a plugin command, leave the section as a checklist for the human.

- [ ] **Step 5: Commit**

```bash
git add commands/cleanup.md commands/help.md templates/claude/commands/implement-stack.md .claude/commands/implement-stack.md .claude/hitl.json
git commit -m "feat(cleanup): /hitl:cleanup command; /implement-stack ends with the cleanup hint"
```

## Review decisions

- Plan review round 1 — *ignored files are listed as nested paths, not top-level entries*: declined, not worth it. A nested path such as `src/.env` tells the human more than the size of all of `src/`; the spec's "top-level" was illustrative.
- Plan review round 1 — *no test for a refused `git worktree remove` (refusal reported, lock restored)*: declined, not worth it. Only a worktree with untracked or modified files or submodules is refused up front, and the engine never offers one; the branch is reachable only through a race between the listing and the removal. A test would need to fake git itself.
