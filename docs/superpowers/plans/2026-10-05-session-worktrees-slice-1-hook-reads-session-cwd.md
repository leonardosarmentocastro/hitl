# Session worktrees — slice 1: the Stop hook reads the session's folder

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Owns:** the Stop hook gates the git root of the folder the session is currently in (the payload's `cwd`), falling back to `CLAUDE_PROJECT_DIR` and then `$PWD`.

**Reviewed:** round 1 (2026-10-05).

**Goal:** A session that moved into a worktree is gated on its own specs and plans, never on a sibling session's.

**Architecture:** `unreviewed-artifact.sh` gains a small resolver in front of its existing `cd`: read stdin (only when it is not a terminal), pull `cwd` out with `node -e`, resolve it with `git -C "$cwd" rev-parse --show-toplevel`; any failure falls through to `CLAUDE_PROJECT_DIR`, then `$PWD`. The scan itself is unchanged. Template and this repository's copy change together; the manifest is regenerated.

**Tech Stack:** bash, Node (`node -e`, already required by the installer), git, vitest.

**Spec:** `docs/superpowers/specs/2026-10-05-session-worktrees-design.md` (§ Design 1, § Testing "Hook").

## Global Constraints

- Every behaviour change is test-first: failing test, run red, minimal code, run green, commit. Gates before the PR: `pnpm test` and `pnpm format:check`.
- `templates/claude/hooks/unreviewed-artifact.sh` and `.claude/hooks/unreviewed-artifact.sh` are byte-identical (the drift test enforces it). Edit the template, copy it over, in the same commit.
- A change under `templates/` changes the render: regenerate `.claude/hitl.json` in the same commit (AGENTS.md § Refreshing this repository's manifest) — `rm .claude/hitl.json`, write the answers with `THIS_REPO_CHOICES`, run `installer/adopt.mjs`.
- Fallback order is exactly: payload `cwd` resolved to its git root → `CLAUDE_PROJECT_DIR` → `$PWD`. A parse failure must never disable the gate; the worst case is today's behaviour.
- jq is not a prerequisite. JSON is parsed with `node -e`.
- `.claude/settings.json` (and `templates/claude/settings.hook.json`) keep launching the hook through `${CLAUDE_PROJECT_DIR}`; not changed.
- Tests use temp directories, never `docs/superpowers/`.
- `.sh` files keep their bytes under Prettier (Markdown is never formatted). Run `pnpm prettier --write` on any `.ts` file you touch before `pnpm format:check`.
- The slice PR body carries a `## Harness observation` section with the manual check in Task 3 (every automated test feeds a synthetic payload). **The human** runs it, ticks the boxes, and only then merges the slice PR; the implementer and the orchestrator cannot run it, because it needs two interactive sessions.

## Review Focus

- A `cwd` containing spaces (`/home/dev/my repos/x`) — the hook must quote it everywhere; covered by a test in Task 1.
- A payload whose `cwd` is a folder that no longer exists (a worktree removed mid-session) — falls back, never exits 0 by accident; test in Task 2.
- A payload that is valid JSON but not an object (`[]`, `"x"`, `null`) — falls back; test in Task 2.
- Stdin left open by a caller that never writes (a hand run in a terminal) — the hook must not hang; the `-t 0` guard plus the existing "is executable" test (no stdin) cover it.
- `cwd` inside `.git/` of a repository (`git rev-parse --show-toplevel` fails there) — falls back; covered by the "outside any git repository" class of test in Task 2.

---

## File structure

| Path | Responsibility |
|---|---|
| `templates/claude/hooks/unreviewed-artifact.sh` | resolver in front of the existing scan |
| `.claude/hooks/unreviewed-artifact.sh` | this repository's copy, byte-identical |
| `scripts/__tests__/unreviewed-artifact.test.ts` | reversed pin, git-repo helpers, new cases |
| `.claude/hitl.json` | regenerated manifest |

---

### Task 1: the payload's `cwd` decides the tree (git root, subfolder, worktree)

**Files:**
- Modify: `templates/claude/hooks/unreviewed-artifact.sh:1-7`
- Modify: `.claude/hooks/unreviewed-artifact.sh` (copy of the template)
- Modify: `.claude/hitl.json` (regenerated)
- Test: `scripts/__tests__/unreviewed-artifact.test.ts`

**Interfaces:**
- Consumes: the existing helpers `repoWith(files)` and `runHook(root, stdin, cwd)` in the test file; `runHook` sets `CLAUDE_PROJECT_DIR` to `root`.
- Produces: test helpers `gitRepoWith(files)` (a `repoWith` that is also `git init`ed with one commit) and `payload(cwd)` (`JSON.stringify({ hook_event_name: "Stop", cwd })`), used again in Task 2.

- [ ] **Step 1: Write the failing tests**

In `scripts/__tests__/unreviewed-artifact.test.ts`, add after `runHook`:

```ts
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
};

function git(cwd: string, ...args: string[]) {
  execFileSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" });
}

/** A repoWith that is also a git repository with one commit (files committed). */
function gitRepoWith(files: Record<string, string>): string {
  const root = repoWith(files);
  git(root, "init", "-q", "-b", "main");
  git(root, "add", "-A");
  git(root, "commit", "-q", "--allow-empty", "-m", "init");
  return root;
}

const payload = (cwd: string) => JSON.stringify({ hook_event_name: "Stop", cwd });
```

Replace the test `"reads CLAUDE_PROJECT_DIR, not the cwd it was invoked from"` with:

```ts
  it("gates the payload's cwd, not CLAUDE_PROJECT_DIR", () => {
    const dirty = gitRepoWith({ "docs/superpowers/plans/2026-09-06-x-slice-1-a.md": UNREVIEWED });
    const clean = gitRepoWith({ "README.md": "hi\n" });
    expect(runHook(clean, payload(dirty)).status).toBe(2);
    expect(runHook(dirty, payload(clean)).status).toBe(0);
  });

  it("resolves a cwd below the repository root to the root", () => {
    const repo = gitRepoWith({
      "docs/superpowers/specs/2026-09-06-x-design.md": UNREVIEWED,
      "apps/web/README.md": "hi\n",
    });
    const clean = gitRepoWith({ "README.md": "hi\n" });
    const r = runHook(clean, payload(join(repo, "apps/web")));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("docs/superpowers/specs/2026-09-06-x-design.md");
  });

  it("gates a linked worktree on its own files, not the main checkout's", () => {
    const main = gitRepoWith({ "README.md": "hi\n" });
    const wt = join(main, ".claude/worktrees/topic");
    git(main, "worktree", "add", "-q", wt, "-b", "feat/topic");
    mkdirSync(join(main, "docs/superpowers/plans"), { recursive: true });
    writeFileSync(join(main, "docs/superpowers/plans/2026-09-06-y-slice-1-a.md"), UNREVIEWED);
    expect(runHook(main, payload(wt)).status).toBe(0);
    expect(runHook(main, payload(main)).status).toBe(2);
  });

  it("quotes a cwd with spaces", () => {
    const parent = mkdtempSync(join(tmpdir(), "hook sp-"));
    const repo = join(parent, "my repo");
    mkdirSync(join(repo, "docs/superpowers/specs"), { recursive: true });
    writeFileSync(join(repo, "docs/superpowers/specs/2026-09-06-x-design.md"), UNREVIEWED);
    git(repo, "init", "-q", "-b", "main");
    const clean = gitRepoWith({ "README.md": "hi\n" });
    expect(runHook(clean, payload(repo)).status).toBe(2);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run --config scripts/vitest.config.ts scripts/__tests__/unreviewed-artifact.test.ts`
Expected: FAIL — "gates the payload's cwd" gets 0 where 2 is expected (the hook still reads `CLAUDE_PROJECT_DIR`); the subfolder, worktree and spaces tests fail the same way.

- [ ] **Step 3: Write the minimal implementation**

In `templates/claude/hooks/unreviewed-artifact.sh`, replace lines 1–7 (the header comment through `cd …`) with:

```bash
#!/usr/bin/env bash
# Stop hook: refuse to end the turn while any spec or plan in the working tree has no
# "**Reviewed:**" header line. Exit 2 + stderr makes the agent keep working with the
# reason; the harness caps consecutive refusals at 8.
#
# The tree is the git root of the session's current folder — the payload's `cwd`, which
# follows EnterWorktree — so a session in a worktree is never gated on a sibling session's
# files. Any failure (no payload, not JSON, no cwd, no node, not a git folder) falls back to
# CLAUDE_PROJECT_DIR, then $PWD: the worst case is the launch folder, never no gate.
set -u

payload_cwd() {
  [ -t 0 ] && return 1
  command -v node >/dev/null 2>&1 || return 1
  node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try {
        const c = JSON.parse(s)?.cwd;
        if (typeof c === "string" && c !== "") process.stdout.write(c);
        else process.exit(1);
      } catch {
        process.exit(1);
      }
    });'
}

root=""
if cwd=$(payload_cwd); then
  root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || root=""
fi
cd "${root:-${CLAUDE_PROJECT_DIR:-$PWD}}" 2>/dev/null || exit 0
```

Leave the rest of the file (from `# The header block is everything…` down) unchanged. Then:

```bash
cp templates/claude/hooks/unreviewed-artifact.sh .claude/hooks/unreviewed-artifact.sh
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run --config scripts/vitest.config.ts scripts/__tests__/unreviewed-artifact.test.ts`
Expected: PASS, including the unchanged tests (they send `{}` or a payload without `cwd`, so they fall back to `CLAUDE_PROJECT_DIR`).

- [ ] **Step 5: Regenerate the manifest and run the gates**

```bash
rm .claude/hitl.json
node --input-type=module -e 'import { THIS_REPO_CHOICES as c } from "./installer/lib.mjs"; console.log(JSON.stringify(c))' > /tmp/hitl-answers.json
node installer/adopt.mjs --repo . --plugin-root . --answers /tmp/hitl-answers.json
pnpm test && pnpm format:check
```

Expected: all green (drift and self-manifest tests included).

- [ ] **Step 6: Commit**

```bash
git add templates/claude/hooks/unreviewed-artifact.sh .claude/hooks/unreviewed-artifact.sh .claude/hitl.json scripts/__tests__/unreviewed-artifact.test.ts
git commit -m "fix(hook): gate the git root of the session's cwd, not the launch folder"
```

---

### Task 2: every failure falls back to `CLAUDE_PROJECT_DIR`

**Files:**
- Test: `scripts/__tests__/unreviewed-artifact.test.ts`
- Modify (only if a test is red): `templates/claude/hooks/unreviewed-artifact.sh`, `.claude/hooks/unreviewed-artifact.sh`, `.claude/hitl.json`

**Interfaces:**
- Consumes: `gitRepoWith`, `payload`, `runHook`, `UNREVIEWED` from Task 1.
- Produces: helper `pathWithoutNode()` — a `PATH` directory of symlinks to `git`, `awk`, `cat`, `dirname` only (no `node`).

- [ ] **Step 1: Write the tests**

```ts
/** A PATH holding only the tools the hook needs besides node. */
function pathWithoutNode(): string {
  const bin = mkdtempSync(join(tmpdir(), "bin-"));
  for (const tool of ["git", "awk", "cat", "dirname"]) {
    const where = execFileSync("bash", ["-c", `command -v ${tool}`], { encoding: "utf8" }).trim();
    symlinkSync(where, join(bin, tool));
  }
  return bin;
}

describe("fallback to CLAUDE_PROJECT_DIR", () => {
  const dirty = () =>
    gitRepoWith({ "docs/superpowers/plans/2026-09-06-x-slice-1-a.md": UNREVIEWED });
  const cleanRepo = () => gitRepoWith({ "README.md": "hi\n" });

  for (const [name, input] of [
    ["no payload", ""],
    ["a payload that is not JSON", "not json"],
    ["JSON that is not an object", "[]"],
    ["JSON null", "null"],
    ["a payload without cwd", JSON.stringify({ hook_event_name: "Stop" })],
    ["a cwd that is not a string", JSON.stringify({ cwd: 42 })],
  ] as const) {
    it(`falls back on ${name}`, () => {
      expect(runHook(dirty(), input).status).toBe(2);
    });
  }

  it("falls back when the cwd is not in a git repository", () => {
    const loose = repoWith({ "README.md": "hi\n" });
    expect(runHook(dirty(), payload(loose)).status).toBe(2);
  });

  it("falls back when the cwd no longer exists", () => {
    expect(runHook(dirty(), payload(join(tmpdir(), "gone-" + Date.now()))).status).toBe(2);
  });

  it("falls back when node is not on PATH", () => {
    const root = dirty();
    const r = spawnSync(execFileSync("bash", ["-c", "command -v bash"], { encoding: "utf8" }).trim(), [HOOK], {
      cwd: root,
      env: { ...process.env, PATH: pathWithoutNode(), CLAUDE_PROJECT_DIR: root },
      input: payload(cleanRepo()),
      encoding: "utf8",
    });
    expect(r.status).toBe(2);
  });
});
```

Add `symlinkSync` to the `node:fs` import.

- [ ] **Step 2: Run the tests**

Run: `pnpm vitest run --config scripts/vitest.config.ts scripts/__tests__/unreviewed-artifact.test.ts`
Expected: PASS if Task 1's resolver is right. These pin the fallback contract; if any is red, fix the resolver in the template (not the test), copy it to `.claude/hooks/`, regenerate the manifest, and rerun.

- [ ] **Step 3: Gates and commit**

```bash
pnpm test && pnpm format:check
git add scripts/__tests__/unreviewed-artifact.test.ts
git commit -m "test(hook): every unreadable payload falls back to CLAUDE_PROJECT_DIR"
```

(Add the hook copies and `.claude/hitl.json` to the commit only if Step 2 required a fix.)

---

### Task 3: the harness observation (human, recorded in the PR)

No code. The automated tests prove the resolver; only the real harness proves the payload's `cwd` follows `EnterWorktree`. The slice PR body carries this section verbatim, for the human to run before merging (the hook script is launched from the main checkout, so install this slice's hook there first — e.g. check out the slice branch in the main checkout):

```markdown
## Harness observation

- [ ] In the main checkout, add `docs/superpowers/specs/2026-01-01-probe-design.md` with no
      `**Reviewed:**` line (do not commit it).
- [ ] Session A, launched in the main checkout: ask it to end a turn — it is refused and names
      the probe spec.
- [ ] Session B, launched in the main checkout, then `EnterWorktree` into any linked worktree
      under `.claude/worktrees/`: it ends its turn without being refused.
- [ ] Delete the probe spec.
```

- [ ] **Step 1:** Confirm the section is in the PR body (the orchestrator writes PR bodies; this plan is its source). The boxes stay unticked: the human runs the check before merging this slice PR.
