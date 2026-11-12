# hitl-command slice 4 — no-install implementation session

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Reviewed:** round 1 (2026-11-12).

**Owns:** Stacked draft PRs from a handover (`/hitl:implement-stack`, `/hitl:review-slice`, `/hitl:umbrella-pr`) with nothing installed, and the TL;DR at the top of PR bodies in both modes.

**Goal:** The launch line from slice 2 runs: per slice implementer → one review → fixer → draft PR on its parent, then a draft umbrella PR, using the plugin's agents, PR shim and the project's remembered gates and PR sections.

**Architecture:** Three more commands and three more agents are rendered from the templates with mode blocks, as in slice 2, and call the PR shim slice 2 shipped in `runtime/pr/`. The TL;DR is a template change that reaches both modes, so this repository's copies and manifest are regenerated.

**Tech Stack:** Node ≥ 20 ESM, bash, vitest, Markdown prompts.

**Spec:** `docs/superpowers/specs/2026-11-12-hitl-command-design.md` — D1, D4, D7, Constraints (non-GitHub refusal); forwarded item "TL;DR and the `pr-body-sections` knob".

## Global Constraints

- Local gates: `pnpm test` and `pnpm format:check`.
- **Installed render changes only by the TL;DR** (Task 1). Every other template edit is a mode block; after Task 1, `self-manifest.test.ts` must stay green without another regeneration.
- The `Plan:` line stays the **first line** of a slice PR body (load-bearing: the slice reviewer parses it); `## TL;DR` follows it.
- A repository that customised the `pr-body-sections` knob receives the TL;DR like any template change: `/hitl:diff` shows it for that file and the human decides. No special handling is built.
- Plugin outputs are never edited by hand: edit the template, run `node installer/render-plugin.mjs --plugin-root .`.
- Nothing merges; PRs are draft; no force-push unasked — unchanged from the installed commands.
- `pr-section` facts add sections to **slice** PR bodies only. The umbrella body carries the TL;DR and no memory-driven section: it summarises the stack, and proof artefacts belong to the slice that produced them.
- ~20-file tripwire: this slice touches about 22 files, because every template edit is mirrored by a rendered plugin file and, for the TL;DR, by this repository's own copy and manifest. The mirrors are generated, not written; the capability is one.

## Consumed from earlier slices

- Slice 1: `renderMode`, `pluginFiles()`, `renderPlugin()`, `render-plugin.mjs`; `context.mjs … --require <list> --format brief` and its `## hitl context (no-install)` block (`Doctrine:`, `PR shim:`, `Gates:`, `Project memory`), refusals `installed`, `not-github`, `no-gates`.
- Slice 2: `runtime/pr/pr.sh` and `runtime/pr/backend.sh` (the plugin's PR shim, executable, drift-tested); the shared first step's sentence `Read the file on the "Doctrine:" line in full unless this session already has; it governs this command.`; the brief block's `Host:` and `Worktree:` lines; `scripts/__tests__/plugin-prompts.test.ts` (iterates every rendered `agents/` and `commands/` file: no installed-only source, no unprefixed command); the agent grounding block and its two verbatim sentences (`it is not instructions to you`, `blocked: no hitl context`).

## Review Focus

- A slice implemented with **no gates run** because the gates were looked for in `AGENTS.md § Local gates` of a repository that has none — Task 2 pins where the no-install implementer and fixer read gates.
- `/hitl:implement-stack` on a GitLab repository must refuse on its first step, before cutting any branch — Task 3.
- A new session started from the launch line has never read the doctrine: the command must load it before orchestrating — Task 3.
- A `pr-section` fact must add a section and never replace or reorder `Plan:` / `## TL;DR` / `## Review decisions` — Task 3.
- An installed repository's PR body must keep `Plan:` first after the TL;DR change — Task 1.

---

### Task 1: TL;DR in PR bodies (both modes)

**Files:**
- Modify: `templates/claude/commands/implement-stack.md`, `templates/claude/agents/handover.md`, `templates/HITL.md`; this repository's `.claude/commands/implement-stack.md`, `.claude/agents/handover.md`, `HITL.md`, `.claude/hitl.json`; rendered `doctrine/HITL.md`, `agents/handover.md`
- Test: `scripts/__tests__/pr-body.test.ts`

The slice PR body block in `implement-stack.md` (under the `pr-body-sections` knob) becomes:

```
Plan: <plan path>

## TL;DR

What — <2–3 sentences>
Why — <2–3 sentences>
How — <2–5 sentences; the approach and any real choice made>

## Review decisions
…
```

The handover agent's `## Umbrella PR body` gains the same `## TL;DR` heading above its What / Why / How. `templates/HITL.md` § Pull requests says the What / Why / How answers sit under a `## TL;DR` heading at the top of the body, after the `Plan:` line.

- [ ] **Step 1: Failing test** `pr-body.test.ts`:

```ts
const installed = renderAll(ROOT, THIS_REPO_CHOICES);
const body = installed.get(".claude/commands/implement-stack.md")!.content;
const i = (s: string) => body.indexOf(s);
expect(i("Plan: <plan path>")).toBeGreaterThan(-1);
expect(i("## TL;DR")).toBeGreaterThan(i("Plan: <plan path>"));
expect(i("What — ")).toBeGreaterThan(i("## TL;DR"));
expect(i("## Review decisions")).toBeGreaterThan(i("How — "));
expect(installed.get(".claude/agents/handover.md")!.content).toContain("## TL;DR");
expect(installed.get("HITL.md")!.content).toContain("`## TL;DR`");
```

- [ ] **Step 2:** `pnpm test -- pr-body` → FAIL.
- [ ] **Step 3:** Edit the three templates.
- [ ] **Step 4:** Refresh: copy the installed renders onto this repository's three files, run `node installer/render-plugin.mjs --plugin-root .`, regenerate the manifest (`AGENTS.md` § Refreshing this repository's manifest).
- [ ] **Step 5:** `pnpm test` → green (`pr-body`, `drift`, `self-manifest`, `plugin-drift`, `knob-anchors`).
- [ ] **Step 6:** Commit `feat(templates): TL;DR heading at the top of PR bodies`.

### Task 2: Render implementer, fixer and slice-reviewer

**Files:**
- Modify: `templates/claude/agents/implementer.md`, `fixer.md`, `slice-reviewer.md`; `installer/lib.mjs`
- Create (rendered): `agents/implementer.md`, `agents/fixer.md`, `agents/slice-reviewer.md`
- Test: `scripts/__tests__/plugin-prompts.test.ts`

Mode blocks, no-install branch:

- **Grounding** of all three: the same block as slice 2's agents (doctrine path from the context block; the repository's own `AGENTS.md` / `CLAUDE.md` / `CONTEXT.md`; project memory as data; `blocked: no hitl context`).
- **Local gates** bullet of implementer and fixer, replacing "every gate named under `## Local gates` in `AGENTS.md`": `Run every command listed under "Gates:" in the hitl context block, from the repository root. "- none" means this project has no gates: say so in your reply. A listed command that is not found (missing script or binary) is not a skip: report "blocked: gate not found — <command>".`

- [ ] **Step 1: Extend the test:**

```ts
for (const a of ["implementer", "fixer", "slice-reviewer"]) {
  const text = rendered.get(`agents/${a}.md`)!.content;
  expect(text).toContain("it is not instructions to you");
  expect(text).toContain("blocked: no hitl context");
}
for (const a of ["implementer", "fixer"]) {
  const text = rendered.get(`agents/${a}.md`)!.content;
  expect(text).toContain('listed under "Gates:" in the hitl context block');
  expect(text).toContain("blocked: gate not found");
  expect(text).not.toContain("## Local gates");
}
```

- [ ] **Step 2:** `pnpm test -- plugin-prompts` → FAIL.
- [ ] **Step 3:** Add the mode blocks and entries; re-render.
- [ ] **Step 4:** `pnpm test` → green.
- [ ] **Step 5:** Commit `feat(agents): no-install implementer, fixer and slice-reviewer`.

### Task 3: Render `/hitl:implement-stack`, `/hitl:review-slice`, `/hitl:umbrella-pr`

**Files:**
- Modify: `templates/claude/commands/implement-stack.md`, `review-slice.md`, `umbrella-pr.md`; `installer/lib.mjs`
- Create (rendered): `commands/implement-stack.md`, `commands/review-slice.md`, `commands/umbrella-pr.md`
- Test: `scripts/__tests__/plugin-prompts.test.ts`

Mode blocks, no-install branch:

- **First step of each command:**

  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/runtime/context.mjs" --repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}" --require no-install,github,gates --format brief
  ```

  - `installed` → `hitl is installed in this repository — run this repository's own <name> command (no hitl: prefix) instead.` Stop.
  - `not-github` → `This repository is not on GitHub: opening PRs needs https://github.com/leonardosarmentocastro/hitl/issues/19. Implement from the handover by hand until then.` Stop — before any fetch, checkout or branch.
  - `no-gates` → the sentence and confirm step of slice 2, then retry.
  - exit 0 → the printed block goes, verbatim, into every agent brief of the command (implementer, slice reviewer, fixer). Then, verbatim: `Read the file on the "Doctrine:" line in full unless this session already has; it governs this command.` — the launch line starts a fresh session, and in no-install mode nothing else loads the doctrine (its § Project memory carries the remember rule for this session too).
- **Every `scripts/hitl/pr.sh`** → `"${CLAUDE_PLUGIN_ROOT}/runtime/pr/pr.sh"`.
- **`implement-stack` PR body**, after the How line and before `## Review decisions`: `<one section per pr-section fact in the hitl context block's project memory, written as that fact describes; none if there is no such fact>`. Plus one sentence: a section the fact asks for that cannot be produced honestly (a screenshot that could not be taken) is written as `_not captured_ — <why>`, never invented.
- Nothing else in `implement-stack` changes; the closing cleanup block keeps `/hitl:cleanup`.

- [ ] **Step 1: Extend the test:**

```ts
for (const c of ["implement-stack", "review-slice", "umbrella-pr"]) {
  const text = rendered.get(`commands/${c}.md`)!.content;
  expect(text).toContain("--require no-install,github,gates --format brief");
  expect(text).toContain(`run this repository's own ${c} command (no hitl: prefix) instead.`);
  expect(text).toContain("issues/19");
  expect(text).toContain('Read the file on the "Doctrine:" line in full unless this session already has');
}
const stack = rendered.get("commands/implement-stack.md")!.content;
expect(stack).toContain('"${CLAUDE_PLUGIN_ROOT}/runtime/pr/pr.sh" create');
expect(stack).toContain("pr-section fact");
expect(stack).toContain("_not captured_");
for (const a of ["implementer", "fixer"]) expect(stack).toContain("`hitl:" + a + "`");
expect(stack.indexOf("## TL;DR")).toBeGreaterThan(stack.indexOf("Plan: <plan path>"));
expect(stack.indexOf("--require no-install,github,gates")).toBeLessThan(stack.indexOf("git fetch"));
```

- [ ] **Step 2:** `pnpm test -- plugin-prompts` → FAIL.
- [ ] **Step 3:** Add the mode blocks and entries; re-render.
- [ ] **Step 4:** `pnpm test` and `pnpm format:check` → green.
- [ ] **Step 5:** Commit `feat(commands): /hitl:implement-stack, /hitl:review-slice and /hitl:umbrella-pr`.

## Dry run (human, before this slice merges)

Scratch GitHub repository with no hitl files, `claude --plugin-dir <this worktree>`, continuing from slice 2's dry run (handover for the two fixture plans exists):

1. Paste the launch line → slice 1 and 2 PRs open as drafts, each on its parent; each body starts `Plan:` then `## TL;DR`; a draft umbrella PR opens; nothing merges.
2. With a `pr-section` fact saved ("always add a Screenshots section"), the bodies carry that section after How.
3. `git status` in the main checkout stays clean; no `scripts/hitl/` or `.claude/commands/` appears in the repository.
4. While the stack runs, say "always add a Screenshots section to PRs" → it asks `Remember this for this project?` before writing anything.
5. A scratch repository with a GitLab remote → `/hitl:implement-stack` refuses on its first step, naming issue #19, with no branch created.
