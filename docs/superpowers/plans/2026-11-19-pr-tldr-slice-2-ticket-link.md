# pr-tldr — slice 2: the ticket link

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Reviewed:** round 1 (2026-11-19).

**Owns:** the ticket link — the `**Ticket:**` spec header line, the question that records it, the script that reads it, and the clickable title above the TL;DR in slice and umbrella PR bodies.

**Goal:** A feature that has a ticket shows it as a clickable title, first line of every PR body; a feature without one shows nothing and is asked once.

**Architecture:** The ticket is one header line in the spec, read by a small POSIX shell script built like `review-mode.sh` and installed beside it. `/review-spec` writes the line; `/implement-stack` and the handover agent run the script when they write a body. A refusal never stops an implementation run.

**Tech Stack:** POSIX `sh` + `awk`, Markdown templates, Node 24, vitest (`pnpm test`), Prettier (`pnpm format:check`).

**Spec:** `docs/superpowers/specs/2026-11-19-pr-tldr-design.md` (§ The ticket link)

## Global Constraints

- Builds on slice 1's body shape: the ticket line goes above `## TL;DR`; nothing else in the bodies changes.
- Edit only under `templates/`, `installer/lib.mjs`, `commands/customize.md` and `scripts/__tests__/`. Everything under `.claude/`, `.hitl/HITL.md`, `scripts/hitl/`, `runtime/`, `commands/` (other than `customize.md`), `agents/` and `doctrine/` is a render.
- After every template or installer change, re-render both ways, exactly as `AGENTS.md` gives it:
  ```bash
  rm .hitl/manifest.json
  node --input-type=module -e 'import { THIS_REPO_CHOICES as c } from "./installer/lib.mjs"; console.log(JSON.stringify(c))' > /tmp/hitl-answers.json
  node installer/adopt.mjs --repo . --plugin-root . --answers /tmp/hitl-answers.json
  node installer/render-plugin.mjs --plugin-root .
  ```
  and commit the renders with the change.
- Keep every `<!-- hitl:mode … -->` marker pair intact. The script path is `scripts/hitl/ticket.sh` in installed mode and `"${CLAUDE_PLUGIN_ROOT}/runtime/ticket.sh"` in no-install mode, as `review-mode.sh` is written in each prompt.
- hitl never fetches from a tracker.
- The question, exactly: `Is there a ticket for this? Paste its link — and its title, if you want it shown — or say none.`
- The commit that records the line, exactly: `docs(spec): record ticket`.
- The PR line, exactly: `### [<label>](<url>)`, first line of the body, followed by a blank line.
- Tests that read the disk use a temp directory, never `docs/superpowers/`.
- Local gates before the slice is done: `pnpm test` and `pnpm format:check`.
- Task 5 is a rehearsal by the implementer, reported in its reply. A failed check means the slice is `blocked`, not done. Nothing about it is written into the PR body.
- Tripwire: with the renders this slice touches about 25 files. Justified: one new script, six sources and up to six test files (file-list expectations); the rest are the script's two installed copies and mechanical re-renders the drift tests demand.

## Review Focus

- A title pasted with brackets, `@name` or backticks (`[Backend] Fix login for @sam`): written as `(Backend) Fix login for sam`; the script refuses a hand-written line that still holds them. Pinned in Task 1 (script) and Task 2 (prompt text).
- A URL with `)` or a space, or `ftp://`/`javascript:`: refused. Task 1.
- Two specs, one malformed: the good ticket still prints, exit is 2, the bad spec is named. Task 1.
- Two specs pointing at the same URL with different labels: one line, the first label. Task 1.
- `**Ticket:** None.` (capital, trailing period) and a `**Ticket:**` line quoted below the first `##`: read as `none` / ignored. Task 1.

---

### Task 1: `ticket.sh`

**Files:**
- Create: `templates/scripts/ticket.sh` (executable)
- Modify: `installer/lib.mjs` (two registrations, each next to its `review-mode.sh` twin)
- Test: `scripts/__tests__/ticket.test.ts`

**Interfaces:**
- Produces: `ticket.sh <spec>...`
  - stdout: one line per accepted ticket, `[<label>](<url>)`, in argument order, one per distinct URL (first label wins); or the single word `none` when no spec has a ticket.
  - exit 0 when nothing was refused. Exit 2 when any spec was refused: stdout still carries the accepted tickets (and nothing, not `none`, if there are none), stderr one line per refusal.
  - stderr lines: `ticket: <path>: no such file` · `ticket: <path>: invalid value '<value>' — use none or [label](http(s) url)` · `ticket: usage: ticket.sh <spec>...` (no arguments: exit 2, nothing on stdout).
  - Reads the first `**Ticket:**` line before the first line starting `## `. Value trimmed of surrounding whitespace. `none` is matched ignoring case and one trailing period. No line → that spec has no ticket.
  - A link is accepted when the whole value is `[label](url)` with: label non-empty, holding no `]`, `@` or backtick; url starting `http://` or `https://` and holding no space and no `)`.

- [ ] **Step 1: Write the failing tests** in `scripts/__tests__/ticket.test.ts`, with the same `spec()` / `run()` helpers as `review-mode.test.ts` (`SCRIPT = templates/scripts/ticket.sh`, temp dir prefix `ticket-`). `L = "[PROJ-1: Short TL;DR](https://acme.atlassian.net/browse/PROJ-1)"`.

| test | input | status | stdout (trimmed) | stderr contains |
|---|---|---|---|---|
| reads a link | `**Ticket:** ${L}` | 0 | `L` | empty |
| reads none | `**Ticket:** none` | 0 | `none` | empty |
| none ignores case, spaces, one period | `**Ticket:**   None. ` | 0 | `none` | empty |
| no line is none | `**Review mode:** simple` | 0 | `none` | empty |
| a line below the first `##` is ignored | header `**Owns:** x`, body `**Ticket:** ${L}` | 0 | `none` | empty |
| first line in the header wins | two `**Ticket:**` lines, `L` then `none` | 0 | `L` | empty |
| two specs, two tickets, in order | `L`, `[B](https://b.example/2)` | 0 | both lines, `L` first | empty |
| same URL twice, first label wins | `L`, `[other](https://acme.atlassian.net/browse/PROJ-1)` | 0 | `L` only | empty |
| a ticket and a none | `L`, `none` | 0 | `L` | empty |
| refuses free text | `**Ticket:** PROJ-1` | 2 | empty | `invalid value 'PROJ-1'` |
| refuses an empty value | `**Ticket:**` with nothing after it | 2 | empty | `invalid value ''` |
| refuses a non-http URL | `[x](ftp://a/b)`, `[x](javascript:alert(1))` | 2 | empty | `invalid value` |
| refuses a URL with a space or `)` | `[x](https://a/b c)`, `[x](https://a/b)c)` | 2 | empty | `invalid value` |
| refuses `]`, `@`, backtick in the label | `[a]b](https://a/b)`, `[hi @sam](https://a/b)`, ``[a`b](https://a/b)`` | 2 | empty | `invalid value` |
| refuses an empty label, and trailing text | `[](https://a/b)`, `${L} extra` | 2 | empty | `invalid value` |
| one bad spec keeps the good one | `L`, `**Ticket:** nope` | 2 | `L` | names the bad path, one line |
| a missing file | `/nonexistent.md` | 2 | empty | `no such file` |
| no arguments | — | 2 | empty | `usage: ticket.sh <spec>...` |

Each row is one `it`; rows with several inputs loop over them.

- [ ] **Step 2: Run** `pnpm test -- ticket` — Expected: FAIL (script missing; `spawnSync` status is not 0/2 as asserted).

- [ ] **Step 3: Write `templates/scripts/ticket.sh`.** `#!/bin/sh`, `set -eu`, a header comment stating the contract above in `review-mode.sh`'s style, the same `awk` header reader with `Ticket` for `Review mode` (but do not strip a trailing period in `awk`: only the `none` comparison ignores it). Validate the link with a `case` pattern or `awk` match, not `eval`; never pass the value to a shell as code. Collect accepted lines, skip a URL already seen, track `refused=1`; at the end print the accepted lines, or `none` only when there are none and nothing was refused; `exit 2` if `refused`.

- [ ] **Step 4: Register it in `installer/lib.mjs`**, right after each `review-mode.sh` entry:

```js
{ repoPath: "scripts/hitl/ticket.sh", template: "scripts/ticket.sh", executable: true },
```
```js
{ pluginPath: "runtime/ticket.sh", template: "scripts/ticket.sh", executable: true },
```

- [ ] **Step 5: Re-render**, run `pnpm test` — Expected: `ticket` PASSES. Tests that count or list the installed or plugin files (`lib.test.ts`, `render.test.ts`, `adopt.test.ts`, `diff.test.ts`, `plugin-drift.test.ts`) may now fail on the new file: update each expected list or count by adding `ticket.sh` beside `review-mode.sh`, nothing else. Run `pnpm format:check`.

- [ ] **Step 6: Commit**

```bash
git add -A templates installer scripts .claude .hitl commands agents doctrine runtime
git commit -m "feat(ticket): ticket.sh reads a spec's Ticket line"
```

### Task 2: `/review-spec` records the ticket

**Files:**
- Modify: `templates/claude/commands/review-spec.md` (a new `### Ticket` subsection directly after `### Mode`'s last paragraph "No other case sets or changes the line…", before the elaborate-mode paragraph)
- Test: `scripts/__tests__/ticket.test.ts`

**Interfaces:**
- Consumes: `ticket.sh` (Task 1).

- [ ] **Step 1: Add the failing test** (a second `describe` in `ticket.test.ts`; import `renderAll`, `renderPlugin`, `THIS_REPO_CHOICES` from `../../installer/lib.mjs`)

```ts
it("/review-spec asks for the ticket once and checks the answer before writing", () => {
  const installed = renderAll(ROOT, THIS_REPO_CHOICES).get(".claude/commands/review-spec.md")!.content;
  const plugin = renderPlugin(ROOT).get("commands/review-spec.md")!.content;
  for (const t of [installed, plugin]) {
    const s = t.slice(t.indexOf("### Ticket"));
    expect(t.indexOf("### Ticket")).toBeGreaterThan(t.indexOf("### Mode"));
    expect(s).toContain(
      "Is there a ticket for this? Paste its link — and its title, if you want it shown — or say none.",
    );
    expect(s).toContain("already gave a ticket link in this session");
    expect(s).toContain('git commit -m "docs(spec): record ticket" -- "$SPEC"');
    expect(s).toContain("ask again");
    expect(s).toContain("capital letters and digits, a dash, digits");
    expect(s).toContain("`@` and backticks are dropped");
    expect(s).toContain("`[` and `]` are written as `(` and `)`");
    expect(s).toContain("Never fetch anything from the tracker");
    expect(s).toContain("remove the line, commit nothing");
    expect(s).toContain("not a dry run");
  }
  expect(installed).toContain('scripts/hitl/ticket.sh "$SPEC"');
  expect(plugin).toContain('"${CLAUDE_PLUGIN_ROOT}/runtime/ticket.sh" "$SPEC"');
});
```

- [ ] **Step 2: Run** `pnpm test -- ticket` — Expected: the new test FAILS.

- [ ] **Step 3: Add the subsection to `templates/claude/commands/review-spec.md`:**

````
### Ticket

The spec's `**Ticket:**` header line links the feature's ticket: `none`, or one Markdown link
`[<label>](<url>)`. Read it:

<!-- hitl:mode installed -->
```bash
scripts/hitl/ticket.sh "$SPEC"
```
<!-- hitl:mode no-install -->
```bash
"${CLAUDE_PLUGIN_ROOT}/runtime/ticket.sh" "$SPEC"
```
<!-- hitl:mode end -->

- Exit 2 → print its message, review nothing, and stop. The human fixes the line.
- A link, or `none` with a `**Ticket:**` line in the header → nothing to do.
- `none` with no `**Ticket:**` line → nothing is asked, **unless** no `**Reviewed:** round` is
  recorded in the spec header and this is not a dry run. Then, whether or not the spec has a
  `**Review mode:**` line: if the human already gave a ticket link in this session, use it and
  ask nothing; otherwise ask once, "Is there a ticket for this? Paste its link — and its
  title, if you want it shown — or say none."

  Build the line from the answer. Never fetch anything from the tracker.
  - `none` → `**Ticket:** none`.
  - The key is the last part of the URL's path shaped like `PROJ-123`: capital letters and
    digits, a dash, digits; case matters.
  - A URL and a title → the label is `<KEY>: <title>` when there is a key, else the title.
    A bare URL → the label is the key, else the URL itself.
  - In a title, `[` and `]` are written as `(` and `)`; `@` and backticks are dropped.
  - The URL must start `http://` or `https://` and hold no space and no `)`. If it does not,
    or the answer is neither a link nor none, say why and ask again on the spot: it is the
    same question, not a second one. Write nothing until the answer is usable.

  Write `**Ticket:** <value>` in the spec's header block (between the `#` title and the first
  `##`) and run the script again. If it refuses the line, remove the line, commit nothing,
  say why and ask again. Otherwise commit it alone:

  ```bash
  git commit -m "docs(spec): record ticket" -- "$SPEC"
  ```

  No other case sets or changes the line: the human edits it by hand, in a commit.
````

- [ ] **Step 4: Re-render**, run `pnpm test` — Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(ticket): /review-spec asks for the feature's ticket"` (same `git add` as Task 1).

### Task 3: The ticket line in both PR bodies

**Files:**
- Modify: `templates/claude/commands/implement-stack.md` (step e: before the body block)
- Modify: `templates/claude/agents/handover.md` (the `## Umbrella PR body` template and the paragraph after the document template)
- Modify: `templates/claude/commands/umbrella-pr.md` (step 2: the stop-heading list)
- Test: `scripts/__tests__/ticket.test.ts`

**Interfaces:**
- Consumes: `ticket.sh <spec>...` (Task 1) — stdout lines `[label](url)` or `none`; exit 2 with stderr on a refusal, accepted tickets still on stdout.

- [ ] **Step 1: Add the failing test**

```ts
it("both PR bodies start with the ticket line, and a refusal never stops the run", () => {
  const installed = renderAll(ROOT, THIS_REPO_CHOICES);
  const stack = installed.get(".claude/commands/implement-stack.md")!.content;
  const body = stack.slice(stack.indexOf("Body (write it"));
  expect(body.indexOf("### <ticket line>")).toBeGreaterThan(-1);
  expect(body.indexOf("### <ticket line>")).toBeLessThan(body.indexOf("## TL;DR"));
  expect(stack).toContain("scripts/hitl/ticket.sh <every Spec(s): path>");
  expect(stack).toContain("is never a STOP");
  const agent = installed.get(".claude/agents/handover.md")!.content;
  const umbrella = agent.slice(agent.indexOf("\n## Umbrella PR body\n"));
  expect(umbrella.indexOf("### <ticket line>")).toBeGreaterThan(-1);
  expect(umbrella.indexOf("### <ticket line>")).toBeLessThan(umbrella.indexOf("## TL;DR"));
  expect(agent).toContain("the body starts at `## TL;DR`");
  expect(agent).toContain("scripts/hitl/ticket.sh <every Spec(s): path>");
  expect(agent).toContain("report the refusal in your reply");
  const plugin = renderPlugin(ROOT);
  for (const f of ["commands/implement-stack.md", "agents/handover.md"])
    expect(plugin.get(f)!.content).toContain(
      '"${CLAUDE_PLUGIN_ROOT}/runtime/ticket.sh" <every Spec(s): path>',
    );
});
```

- [ ] **Step 2: Run** `pnpm test -- ticket` — Expected: the new test FAILS.

- [ ] **Step 3: Edit `templates/claude/commands/implement-stack.md`.** In step e, before the `<!-- hitl:knob pr-body-sections -->` anchor of the body block, add (outside the anchor):

````
Read the feature's ticket once per slice, when its PR body is written. Pass every path listed
under `Spec(s):` to the script in one call.

<!-- hitl:mode installed -->
```bash
scripts/hitl/ticket.sh <every Spec(s): path>
```
<!-- hitl:mode no-install -->
```bash
"${CLAUDE_PLUGIN_ROOT}/runtime/ticket.sh" <every Spec(s): path>
```
<!-- hitl:mode end -->

Each line it prints is a ticket, `[<label>](<url>)`; the word `none` means there is none.
Exit 2 is never a STOP: a ticket is a link, not a rule about how the feature is reviewed. Use
the tickets it still printed, and say in your report which spec's line was refused and why.
````

The body block's first lines become:

```
### <ticket line>

## TL;DR
```

and the paragraph after the block gains: ``The body's first line is `### ` followed by a ticket the script printed — one such line per ticket, in the order printed, then a blank line. With `none`, or nothing printed, the body starts at `## TL;DR`.``

- [ ] **Step 4: Edit `templates/claude/agents/handover.md`.** The `## Umbrella PR body` template gains `### <ticket line>` and a blank line above `## TL;DR`. After the "Write the TL;DR and the Why…" paragraph add the same script call (both mode variants, `<every Spec(s): path>`), followed by: ``Each line it prints is a ticket: write `### ` followed by it as the body's first line, one per ticket, then a blank line. With `none`, or nothing printed, the body starts at `## TL;DR`. On exit 2, use the tickets it still printed, write no line for the refused spec, and report the refusal in your reply; it never fails the handover.``

- [ ] **Step 5: Edit `templates/claude/commands/umbrella-pr.md` step 2**: nothing in the stop-heading list changes (`###` is not a `##` heading); add one clause to its first sentence so the reader knows the ticket line is part of the body: "…everything under the handover document's `## Umbrella PR body` heading, a `###` ticket line included, stopping at…". Update Task-2-of-slice-1's assertion on that sentence in `pr-body.test.ts` if it no longer matches.

- [ ] **Step 6: Re-render**, run `pnpm test` — Expected: PASS.

- [ ] **Step 7: Commit** — `git commit -m "feat(ticket): PR bodies open with the ticket as a clickable title"`.

### Task 4: The doctrine

**Files:**
- Modify: `templates/HITL.md` (§ Specs and plans, § Pull requests, § Load-bearing invariants)
- Modify: `commands/customize.md` (§ 1 "Refuse an invariant": the list of invariants)
- Test: `scripts/__tests__/ticket.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
it("the doctrine defines the Ticket line and names it load-bearing", () => {
  const doc = renderAll(ROOT, THIS_REPO_CHOICES).get(".hitl/HITL.md")!.content;
  const specs = doc.slice(doc.indexOf("## Specs and plans"), doc.indexOf("## Review gates"));
  expect(specs).toContain("`**Ticket:**`");
  const pr = doc.slice(doc.indexOf("## Pull requests"), doc.indexOf("## Delivery slices"));
  expect(pr).toContain("`### [<label>](<url>)`");
  const inv = doc.slice(doc.indexOf("## Load-bearing invariants"));
  expect(inv).toContain("The `**Ticket:**` header line of a spec");
  expect(readFileSync(join(ROOT, "commands/customize.md"), "utf8")).toContain(
    "the `**Ticket:**` line",
  );
});
```

- [ ] **Step 2: Run** `pnpm test -- ticket` — Expected: FAIL.

- [ ] **Step 3: Edit `templates/HITL.md`.**
  - § Specs and plans, after the `**Review mode:**` bullet:
    ```
    - A spec may carry a **`**Ticket:**`** line in its header block — `none`, or one Markdown
      link `[<label>](<url>)` to the feature's ticket in any tracker. `/review-spec` asks for it
      once, when a spec has no line and no review recorded yet; otherwise only the human changes
      it. hitl never fetches from the tracker. A malformed line is refused at the spec gate and
      skipped, with a report, when a PR body is written — it never stops an implementation run.
    ```
  - § Pull requests: in slice 1's anchored bullet, "Every PR body has a `## TL;DR`" stays as it is (it does not say the TL;DR is first). Add, outside every anchor block, right after the exemptions bullet:
    ```
    - When the feature's spec has a ticket, every slice PR and the umbrella PR open with it as a
      clickable title above `## TL;DR`: `### [<label>](<url>)`. No ticket, no line.
    ```
  - § Load-bearing invariants, after the `**Review mode:**` line:
    ```
    - The `**Ticket:**` header line of a spec — `/review-spec`, `/implement-stack` and the handover agent.
    ```

- [ ] **Step 4: Edit `commands/customize.md` § 1**: in the list of invariants, after "the `**Review mode:**` line," add "the `**Ticket:**` line,".

- [ ] **Step 5: Re-render**, run `pnpm test` — Expected: PASS, slice 1's anchor test included (the new bullet is in no anchor block).

- [ ] **Step 6: Commit** — `git commit -m "docs(doctrine): the Ticket line of a spec"`.

### Task 5: Rehearsal and gates

**Files:** none committed.

This is a rehearsal: the implementer follows the re-rendered prompts by hand, because it cannot spawn the handover agent or run a slash command. Any check that fails → reply `blocked` with what was produced instead.

- [ ] **Step 1: With a ticket.** Copy `.claude/fixtures/spec-fixture-design.md` to a scratch directory outside the repository and add `**Ticket:** [PROJ-123: Short TL;DR](https://acme.atlassian.net/browse/PROJ-123)` to its header. Run the rendered `scripts/hitl/ticket.sh` on it: it prints that link. Following the re-rendered `.claude/agents/handover.md`, write the umbrella body for it: the first line is `### [PROJ-123: Short TL;DR](https://acme.atlassian.net/browse/PROJ-123)`, then a blank line, then `## TL;DR`. Following the re-rendered `implement-stack.md` body block, the slice body starts the same way.

- [ ] **Step 2: With none.** Change the line to `**Ticket:** none`: the script prints `none`; both bodies start at `## TL;DR`.

- [ ] **Step 3: Refused.** Change the line to `**Ticket:** PROJ-123`: the script exits 2 with the invalid-value message; both bodies start at `## TL;DR` and the refusal is in the report.

- [ ] **Step 4: Run the gates** — `pnpm test` and `pnpm format:check`, both PASS.

- [ ] **Step 5: Report.** In the reply, one line per check above: passed, or what was seen instead. The label rules in `/review-spec` are prompt text no rehearsal exercises (the question is skipped in a dry run): say so in one line.

## Review decisions

- Round 1 — the acceptance dry run cannot be run by the implementer as the spec first described it: applied as a rehearsal with a `blocked` outcome, and bubbled up to the spec's Acceptance section.
