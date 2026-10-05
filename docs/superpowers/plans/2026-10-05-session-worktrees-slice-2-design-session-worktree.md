# Session worktrees — slice 2: design sessions start in a worktree

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Owns:** design sessions start in their own locked worktree on the feature branch — the HITL.md rule, the `.claude/worktrees/` ignore entry, recursive scans that skip sibling worktrees, and the launch line that `cd`s into the worktree.

**Reviewed:** round 1 (2026-10-05).

**Goal:** Every session that begins the chain puts itself in `<main checkout>/.claude/worktrees/<topic>` on `feat/<topic>` before reading code, and the design session ends with a launch line that starts the implementation session in that same worktree.

**Architecture:** One tested behaviour (`gitignoreBlock()` gains `.claude/worktrees/`) plus prompt and doctrine edits mirrored between `templates/` and this repository's copies, which the drift test keeps equal. Prompt behaviour is shown by dry runs recorded in the PR body, as AGENTS.md prescribes for prompts.

**Tech Stack:** Markdown prompts, Node ESM (`installer/lib.mjs`), vitest.

**Spec:** `docs/superpowers/specs/2026-10-05-session-worktrees-design.md` (§ Design 2, except "End of the implementation session", which is slice 3; § Testing "`.gitignore`" and "Doctrine and prompts").

## Global Constraints

- Every behaviour change is test-first: failing test, run red, minimal code, run green, commit. Gates before the PR: `pnpm test` and `pnpm format:check`.
- Every edit to a file under `templates/` is mirrored byte-for-byte into this repository's copy (`templates/HITL.md` → `HITL.md`, `templates/claude/X` → `.claude/X`) in the same commit, and `.claude/hitl.json` is regenerated in that commit (AGENTS.md § Refreshing this repository's manifest):
  ```bash
  rm .claude/hitl.json
  node --input-type=module -e 'import { THIS_REPO_CHOICES as c } from "./installer/lib.mjs"; console.log(JSON.stringify(c))' > /tmp/hitl-answers.json
  node installer/adopt.mjs --repo . --plugin-root . --answers /tmp/hitl-answers.json
  ```
- The worktree path is always `$MAIN/.claude/worktrees/<topic>` with `MAIN=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")`; the lock reason is exactly `hitl design session: <topic> on <branch>` (slice 3 parses it).
- The chain diagram in HITL.md is **not** edited: it sits under the `review-rounds` knob anchor. The rule lives in § Feature branches, which is not anchored. Do not add or move any `<!-- hitl:knob … -->` anchor.
- The handover document's `Launch:` line uses the relative path `.claude/worktrees/<topic>`; the line printed on screen uses the absolute path from `git rev-parse --show-toplevel`. Outside a linked worktree both omit the `cd`, exactly as today.
- `/implement-stack`'s cleanup hint is **not** in this slice (slice 3 owns it, with `/hitl:cleanup`).
- Markdown is never formatted. Load-bearing invariants (HITL.md § Load-bearing invariants) are untouched.
- The slice PR body carries a `## Dry runs` section with the four dry runs of Task 6. Dry run (d) is a shell command the implementer runs and records. (a)–(c) need fresh sessions: the human fills them in, and the slice PR does not merge until they are filled in — (c) is the only proof of what this slice owns.
- `/hitl:diff --apply` replaces the contents of an existing hitl marker block in `.gitignore` with the current `gitignoreBlock()`, and `/hitl:diff` stages `.gitignore` when it did — otherwise an already-installed repository never gets the new line (Task 2; bubbled up to the spec).
- **File tripwire.** About 26 files, the spec and plan included, crosses the ~20-file tripwire. Justification: 13 of them are template/copy pairs the drift test requires to move together (HITL.md, five agents, two commands), plus the regenerated manifest. Splitting along them would be horizontal: the rule, the scan exclusions and the launch line are one capability, "a design session lives in its worktree".

## Review Focus

- A session started inside *another* linked worktree (a `claude -w` worktree, or another topic's) — the rule must create the new worktree under the main checkout's `.claude/worktrees/`, not nested inside the current worktree; the `$MAIN` line in Task 3's rule text pins it, dry run (c) exercises it.
- A topic whose branch exists only on the remote (`origin/feat/<topic>`) — the collision check after the fetch must catch it; Task 3's rule text names `origin/<branch>`.
- `/review-plan`'s handover path (not only `/handover`) — both must split the launch line; Task 5 edits both, dry run (a) runs `/handover`, and Task 5 Step 3 diffs the two commands' launch wording.
- `pnpm format:check` in this repository while a worktree exists — Prettier must skip `.claude/worktrees/`; Task 1 Step 5 checks it with a real worktree present.
- `/hitl:customize`'s anchor grep from the main checkout with a sibling worktree present — must not return the sibling's anchors; dry run (d).

---

## File structure

| Path | Responsibility |
|---|---|
| `installer/lib.mjs` | `gitignoreBlock()` gains `.claude/worktrees/` |
| `scripts/__tests__/render.test.ts` | asserts the rendered `.gitignore` carries it |
| `.gitignore` | this repository's line |
| `templates/HITL.md`, `HITL.md` | the worktree rule under § Feature branches; § Where things live mentions `.claude/worktrees/` |
| `templates/claude/agents/{spec-reviewer,plan-reviewer,slice-reviewer,implementer,fixer}.md` and `.claude/agents/` copies | "every `AGENTS.md` in the tree" excludes `.claude/worktrees/` |
| `commands/customize.md` | anchor grep excludes `worktrees` |
| `templates/claude/commands/handover.md`, `templates/claude/commands/review-plan.md` and `.claude/commands/` copies | split launch line |
| `installer/diff.mjs`, `installer/lib.mjs` | `--apply` refreshes the hitl block in `.gitignore` (`replaceMarkerBlock`) |
| `scripts/__tests__/diff.test.ts` | an install with the old block gains `.claude/worktrees/` after `--apply` |
| `commands/diff.md` | stages `.gitignore` when `gitignoreRefreshed` is true |
| `.claude/hitl.json` | regenerated |

---

### Task 1: `.claude/worktrees/` is gitignored on every install

**Files:**
- Modify: `installer/lib.mjs:241-246` (`gitignoreBlock`)
- Modify: `.gitignore`
- Modify: `.claude/hitl.json` (regenerated, only if the self-manifest test asks)
- Test: `scripts/__tests__/render.test.ts:79-95`

**Interfaces:**
- Produces: `gitignoreBlock()` returns a block containing the line `.claude/worktrees/`.

- [ ] **Step 1: Write the failing test**

In `scripts/__tests__/render.test.ts`, in the test `"appends marked blocks to README.md and .gitignore, creating them if absent"`, after `expect(ignore).toContain(".claude/reviews/");` add:

```ts
    expect(ignore).toContain(".claude/worktrees/");
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run --config scripts/vitest.config.ts scripts/__tests__/render.test.ts`
Expected: FAIL — `expected … to contain ".claude/worktrees/"`.

- [ ] **Step 3: Minimal implementation**

`installer/lib.mjs`:

```js
export function gitignoreBlock() {
  return `# hitl: review output, dry-run scratch space and design-session worktrees are never committed.
.claude/reviews/
.claude/fixtures/scratch/
.claude/settings.local.json
.claude/worktrees/`;
}
```

`.gitignore` (this repository) — replace the comment and add the line:

```
# Review output, dry-run scratch space and design-session worktrees are never committed.
.claude/reviews/
.claude/fixtures/scratch/
.claude/settings.local.json
.claude/worktrees/
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS. If the self-manifest or drift test fails, regenerate `.claude/hitl.json` (Global Constraints) and rerun.

- [ ] **Step 5: Prove Prettier skips a nested worktree**

```bash
git worktree add .claude/worktrees/probe -b probe-format HEAD
printf 'const  x  =  1\n' > .claude/worktrees/probe/ugly.js
pnpm format:check
git worktree remove --force .claude/worktrees/probe && git branch -D probe-format
```

Expected: `pnpm format:check` passes (the ugly file is ignored).

- [ ] **Step 6: Commit**

```bash
git add installer/lib.mjs scripts/__tests__/render.test.ts .gitignore .claude/hitl.json
git commit -m "feat(installer): gitignore .claude/worktrees/"
```

---

### Task 2: `/hitl:diff --apply` refreshes the hitl block in `.gitignore`

**Files:**
- Modify: `installer/lib.mjs` (add `replaceMarkerBlock` next to `withMarkerBlock`)
- Modify: `installer/diff.mjs` (apply path, after the README bump)
- Modify: `commands/diff.md` (stage `.gitignore`; include it in the undo line)
- Test: `scripts/__tests__/diff.test.ts`

**Interfaces:**
- Consumes: `BLOCK_START`, `BLOCK_END`, `gitignoreBlock()` from `installer/lib.mjs` (Task 1's block).
- Produces: `replaceMarkerBlock(existing: string, block: string) → { text, changed }`; the `--apply` output gains `gitignoreRefreshed: boolean`.

- [ ] **Step 1: Write the failing test**

In `scripts/__tests__/diff.test.ts`, in the `describe` that holds the `--apply` tests (next to the merge tests), add:

```ts
  it("--apply refreshes the hitl block in .gitignore and keeps the lines around it", () => {
    const repo = installedRepo(mk);
    const p = join(repo, ".gitignore");
    writeFileSync(
      p,
      "dist/\n\n<!-- hitl:start -->\n# old block\n.claude/reviews/\n<!-- hitl:end -->\nafter/\n",
    );
    const r = diff(repo, plugin, mk, true);
    expect(r.status, r.stderr).toBe(0);
    expect(r.json.gitignoreRefreshed).toBe(true);
    const text = readFileSync(p, "utf8");
    expect(text).toContain(".claude/worktrees/");
    expect(text).not.toContain("# old block");
    expect(text.startsWith("dist/\n\n<!-- hitl:start -->\n")).toBe(true);
    expect(text.endsWith("<!-- hitl:end -->\nafter/\n")).toBe(true);
  });

  it("--apply leaves a .gitignore without the hitl markers alone", () => {
    const repo = installedRepo(mk);
    const p = join(repo, ".gitignore");
    writeFileSync(p, "dist/\n");
    const r = diff(repo, plugin, mk, true);
    expect(r.json.gitignoreRefreshed).toBe(false);
    expect(readFileSync(p, "utf8")).toBe("dist/\n");
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run --config scripts/vitest.config.ts scripts/__tests__/diff.test.ts`
Expected: FAIL — `gitignoreRefreshed` is `undefined`, and the old block is still there.

- [ ] **Step 3: Implementation**

`installer/lib.mjs`, after `withMarkerBlock`:

```js
/** Replace what sits between the markers with the current block; text without them is left alone. */
export function replaceMarkerBlock(existing, block) {
  const start = existing.indexOf(BLOCK_START);
  const end = existing.indexOf(BLOCK_END);
  if (start === -1 || end < start) return { text: existing, changed: false };
  const text = `${existing.slice(0, start)}${BLOCK_START}\n${block.trimEnd()}\n${existing.slice(end)}`;
  return { text, changed: text !== existing };
}
```

`installer/diff.mjs`: add `gitignoreBlock` and `replaceMarkerBlock` to the `./lib.mjs` import; declare `let gitignoreRefreshed = false;` next to `let readmeBumped = false;`; after the README block inside the `try`:

```js
    const ignorePath = join(repo, ".gitignore");
    if (existsSync(ignorePath)) {
      const r = replaceMarkerBlock(readFileSync(ignorePath, "utf8"), gitignoreBlock());
      if (r.changed) {
        writeFileSync(ignorePath, r.text);
        gitignoreRefreshed = true;
      }
    }
```

and return it: `return { code: 0, out: { ...report, applied: true, written, deleted, readmeBumped, gitignoreRefreshed } };`.

`commands/diff.md`: after `git add -- README.md` in the staging block add

```bash
# only when `gitignoreRefreshed` is true:
git add -- .gitignore
```

and in the exit-2 undo sentence change `plus .claude/hitl.json and README.md>` to `plus .claude/hitl.json, README.md and .gitignore>`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm prettier --write installer/lib.mjs installer/diff.mjs scripts/__tests__/diff.test.ts
pnpm format:check
git add installer/lib.mjs installer/diff.mjs commands/diff.md scripts/__tests__/diff.test.ts
git commit -m "feat(diff): --apply refreshes the hitl block in .gitignore"
```

---

### Task 3: the worktree rule in HITL.md

**Files:**
- Modify: `templates/HITL.md` (§ Feature branches, § Where things live)
- Modify: `HITL.md` (copy)
- Modify: `.claude/hitl.json` (regenerated)

**Interfaces:**
- Produces: the lock-reason format `hitl design session: <topic> on <branch>` and the path `$MAIN/.claude/worktrees/<topic>`, which slice 3's `/hitl:cleanup` parses.

- [ ] **Step 1: Edit § Feature branches**

In `templates/HITL.md`, replace the first bullet of § Feature branches:

```markdown
- **Always** create a dedicated feature branch off up-to-date `main` before
  implementation. Do not commit feature work directly on `master` / `main`.
```

with:

````markdown
- **Always** create a dedicated feature branch off up-to-date `main` at the start of design.
  Do not commit feature work directly on `master` / `main`.
- **A design session runs in its own worktree.** The first action of any session that begins
  the chain — a brainstorm, a grill, a design discussion — before it reads any code, is to put
  itself in its own worktree on the feature branch:

  ```bash
  MAIN=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
  git fetch origin
  git worktree add "$MAIN/.claude/worktrees/<topic>" -b feat/<topic> origin/main
  git branch --unset-upstream feat/<topic>
  git worktree lock --reason "hitl design session: <topic> on feat/<topic>" "$MAIN/.claude/worktrees/<topic>"
  ```

  then `EnterWorktree` with `path: $MAIN/.claude/worktrees/<topic>`. `<topic>` is kebab-case,
  chosen from the request; the prefix follows the naming bullet below (`fix/<topic>` for a
  bugfix, in the branch and the lock reason alike). Another session in the same checkout can
  switch its branch at any time; a worktree is the only checkout nobody else moves.
  - *Already in this topic's worktree* — the session's git root is a linked worktree (`git
    rev-parse --git-dir` differs from `--git-common-dir`) on this topic's branch: stay, create
    nothing, and lock it with the reason above if it is not locked. Any other linked worktree
    (another topic, a `claude -w` worktree) does not count.
  - *Collision* — after the fetch, if the path, the local branch or `origin/<branch>` already
    exists, ask the human whether to reuse it or pick another name. Never overwrite or delete.
  - The implementation session runs in the same worktree (the launch line `cd`s into it), and
    the worktree stays until the umbrella PR merges.
````

- [ ] **Step 2: Edit § Where things live**

In the same file, in the paragraph under `### Where things live`, replace
`` `.claude/reviews/` (gitignored review output) · `` with
`` `.claude/reviews/` (gitignored review output) · `.claude/worktrees/` (gitignored design-session worktrees) · ``.

- [ ] **Step 3: Mirror, regenerate, gates**

```bash
cp templates/HITL.md HITL.md
# regenerate .claude/hitl.json (Global Constraints)
pnpm test && pnpm format:check
grep -n "hitl:knob" templates/HITL.md   # same anchors, same line count as before this task
```

Expected: tests green; the anchor list is unchanged apart from line numbers.

- [ ] **Step 4: Commit**

```bash
git add templates/HITL.md HITL.md .claude/hitl.json
git commit -m "docs(hitl): a design session starts in its own locked worktree"
```

---

### Task 4: recursive scans skip sibling worktrees

**Files:**
- Modify: `templates/claude/agents/spec-reviewer.md:21`, `plan-reviewer.md:22`, `slice-reviewer.md:20`, `implementer.md:17`, `fixer.md:17` and their `.claude/agents/` copies
- Modify: `commands/customize.md:16,50`
- Modify: `.claude/hitl.json` (regenerated)

- [ ] **Step 1: Re-check for other recursive walks**

```bash
grep -rn -e "grep -r" -e "in the tree" -e "find \." -e "\*\*/" templates commands installer scripts/hitl
```

Expected: only the five agent lines and the two `customize.md` lines. Any other hit that walks the working tree gets the same exclusion in this task; list it in the commit message.

- [ ] **Step 2: Edit the five agents**

In each of the five templates, replace `` every `AGENTS.md` in the tree (excluding `node_modules/`) `` with `` every `AGENTS.md` in the tree (excluding `node_modules/` and `.claude/worktrees/`) ``:

```bash
for a in spec-reviewer plan-reviewer slice-reviewer implementer fixer; do
  sed -i 's#in the tree (excluding `node_modules/`)#in the tree (excluding `node_modules/` and `.claude/worktrees/`)#' "templates/claude/agents/$a.md"
  cp "templates/claude/agents/$a.md" ".claude/agents/$a.md"
done
grep -c "and \`.claude/worktrees/\`)" templates/claude/agents/*.md
```

Expected: 1 for each of the five, 0 for `handover.md`.

- [ ] **Step 3: Edit `/hitl:customize`**

In `commands/customize.md`, both occurrences: `grep -rn "hitl:knob <id>" HITL.md AGENTS.md .claude/` → `grep -rn --exclude-dir=worktrees "hitl:knob <id>" HITL.md AGENTS.md .claude/`.

- [ ] **Step 4: Regenerate, gates, commit**

```bash
# regenerate .claude/hitl.json (Global Constraints)
pnpm test && pnpm format:check
git add templates/claude/agents .claude/agents commands/customize.md .claude/hitl.json
git commit -m "fix(agents,customize): recursive scans skip .claude/worktrees/"
```

---

### Task 5: the launch line `cd`s into the worktree

**Files:**
- Modify: `templates/claude/commands/handover.md` (steps 2 and 4), `.claude/commands/handover.md`
- Modify: `templates/claude/commands/review-plan.md` (the handover paragraph, ~line 95-102), `.claude/commands/review-plan.md`
- Modify: `.claude/hitl.json` (regenerated)

- [ ] **Step 1: `/handover`**

In `templates/claude/commands/handover.md`, replace step 2's launch-line sentence and step 4 with:

````markdown
2. Spawn the `handover` agent with the brief: mode, feature branch, feature key, and the
   launch line. If this session's git root is a linked worktree (`git rev-parse --git-dir`
   differs from `git rev-parse --git-common-dir`), the line is — exactly, with `<topic>` the
   worktree's folder name:
   ``Launch: `cd .claude/worktrees/<topic> && claude --model opus` then `/implement-stack docs/superpowers/handover/<feature>.md` ``.
   Otherwise it is — exactly:
   ``Launch: `claude --model opus` then `/implement-stack docs/superpowers/handover/<feature>.md` ``.
   Nothing else. (The model tier lives here, in the command, never in the agent body.)
````

and

````markdown
4. If it wrote the document, print the launch line on its own line and stop — with the
   relative `cd .claude/worktrees/<topic>` replaced by `cd <absolute path>`, the output of
   `git rev-parse --show-toplevel`, so it can be pasted from any folder. The document keeps the
   relative line. Do not push; the human decides when the feature branch goes to the remote.
````

- [ ] **Step 2: `/review-plan`**

In `templates/claude/commands/review-plan.md`, in the convergence paragraph, replace
`exactly as `/handover` does (same brief, same launch line) and relay its reply. Print the launch line on its own line.`
with
`exactly as `/handover` does (same brief, same launch line — relative `cd` when this session is in a linked worktree) and relay its reply. Print the launch line on its own line, with the `cd` path made absolute as `/handover` step 4 does.`

- [ ] **Step 3: Mirror, regenerate, gates, consistency**

```bash
cp templates/claude/commands/handover.md .claude/commands/handover.md
cp templates/claude/commands/review-plan.md .claude/commands/review-plan.md
# regenerate .claude/hitl.json (Global Constraints)
pnpm test && pnpm format:check
grep -n "worktrees/<topic>\|absolute" templates/claude/commands/handover.md templates/claude/commands/review-plan.md
```

Expected: tests green; `review-plan.md` defers to `/handover` for the wording, so the two cannot disagree.

- [ ] **Step 4: Commit**

```bash
git add templates/claude/commands .claude/commands .claude/hitl.json
git commit -m "feat(handover): the launch line cds into the design worktree; absolute on screen"
```

---

### Task 6: dry runs (recorded in the PR body)

No code. Prompts are validated by running them (AGENTS.md). The slice PR body carries this section; each line gets its observed result.

```markdown
## Dry runs

- [ ] (a) From a linked worktree under `.claude/worktrees/<t>` on a branch that carries the
      fixture plans (`.claude/fixtures/plans/` copied to `docs/superpowers/plans/` on a scratch
      branch), `/handover start`: the screen line is `cd /abs/…/.claude/worktrees/<t> && …`;
      the document's `Launch:` line is `cd .claude/worktrees/<t> && …`.
- [ ] (b) The same from the main checkout: neither line has a `cd`.
- [ ] (c) A fresh session in a fixture repository, asked to "design a small feature": its first
      action is the fetch / `worktree add` / `unset-upstream` / `lock` / `EnterWorktree` sequence;
      `git worktree list --porcelain` shows `locked hitl design session: <t> on feat/<t>`.
      Repeat from inside a `claude -w` worktree: the new worktree lands under the main
      checkout's `.claude/worktrees/`, not nested.
- [ ] (d) From the main checkout with a sibling worktree present,
      `grep -rn --exclude-dir=worktrees "hitl:knob review-rounds" HITL.md AGENTS.md .claude/`
      returns only main-checkout paths.
```

- [ ] **Step 1:** Run (d) yourself (it is a shell command) and record the output; leave (a)–(c) for the orchestrator or the human.
