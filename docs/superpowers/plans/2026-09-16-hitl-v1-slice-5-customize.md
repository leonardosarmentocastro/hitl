# hitl v1 — slice 5: customize

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Owns:** the knob anchors in every template and in this repository's copies; the knob table and the `## Load-bearing invariants` section in `HITL.md`; `commands/customize.md` and the `customize-testing.mjs` script behind its `testing-rules` knob; `--adopt` run on this repository and its manifest committed.

**Reviewed:** round 1 (2026-09-16) · round 2 (2026-09-16).

**Goal:** `/hitl:customize` can tune every knob in the spec's table by editing anchored paragraphs, refuses every load-bearing invariant, and this repository ends the stack adopted, with a manifest whose diff is clean.

**Architecture:** Each knob is an id with one or more anchors, HTML comments `<!-- hitl:knob <id> -->` on the line above the paragraph that states the rule, in the templates and therefore in this repository's copies (the drift test keeps them identical). The customize prompt edits only the block below an anchor and every anchor of the knob together. `testing-rules` is the one knob that works by whole files: a small script re-composes `HITL.md`, adds or removes the wipe workflow and updates the manifest, refusing when the manifest is behind or `HITL.md` was edited by hand. A vitest test cross-checks the knob list against the anchors found. The last task runs `adopt.mjs` on this repository and commits the manifest, the final exercise of the stack.

**Tech Stack:** Node 24 ESM with zero dependencies (targets Node 20+), vitest, Markdown prompts.

**Spec:** `docs/superpowers/specs/2026-09-16-hitl-v1-design.md`

## Global Constraints

- Every behaviour change is test-first: failing test, run red, minimal code, run green, commit. Gates before the PR: `pnpm test` and `pnpm format:check`.
- Installer scripts are Node ESM under `installer/`, no dependencies, target Node 20 or newer; they never run `git` to change state and never call the PR shim.
- Anchors are HTML comments, invisible when the Markdown is rendered, and sit on the line immediately above the paragraph, bullet or heading they govern; the next line is never blank.
- Every anchor added to a template is added byte-for-byte to this repository's copy; the drift test enforces it. `.claude/review-context.md` is the drift exception but still carries its anchor.
- The seven finding-type names are invariants; severity definitions and the reporting cap are knobs.
- `/hitl:customize` writes to the working tree and never commits. The only manifest write it makes is through `customize-testing.mjs`.
- Owned-file count is unchanged by this slice; no new template file.
- **Tripwire:** this slice touches about twenty-five files because every anchor lands in a template and in this repository's copy in the same commit; the drift test forbids splitting them, and an anchor set is one capability (customize can find every knob). Crossed knowingly.
- The knob id list lives once, as `KNOBS` in `installer/lib.mjs`; the human-readable table lives in `commands/customize.md`.
- Interfaces assumed from earlier slices: `renderAll`, `composeHitl`, `THIS_REPO_CHOICES`, `manifestFor`, `readManifest`, `pluginVersion`, `sha256`, `TESTING_ORDER`, `MANIFEST_PATH`, `ownedFiles` (slice 1); `agentsBlock(gates: string[], testing: string[] = []): string` (slice 3, emits the `## Local gates` block passed to `withMarkerBlock`, plus `## Effective-date pilots` only when `testing` includes `effective-date`); `parseArgs(argv)` in `lib.mjs` (slice 3); `node installer/adopt.mjs --repo <dir> --plugin-root <dir> --answers <file>` writing `.claude/hitl.json` with template hashes (slice 4); `node installer/diff.mjs --repo <dir> --plugin-root <dir> --marketplace <dir>` printing `{ "files": [{ "path", "state" }] }` (slice 4).

---

## File structure

| Path | Responsibility |
|---|---|
| `templates/HITL.md`, `HITL.md` | anchors for `small-lane`, `review-rounds` (×4), `reporting-cap`, `pr-body-sections` (×2), `file-tripwire`; the `## Load-bearing invariants` section |
| `templates/claude/commands/review-spec.md`, `review-plan.md` and this repository's copies | `review-rounds` anchors at step 0 and step 5; "At most two rounds." dropped from the front-matter description |
| `templates/claude/agents/plan-reviewer.md` and copy | "~20-file tripwire" reworded to "the standards' file-count tripwire" |
| `templates/claude/agents/{spec,plan,slice}-reviewer.md` and copies | `severities` and `reporting-cap` anchors |
| `templates/claude/commands/implement-stack.md` and copy | `pr-body-sections` anchor |
| `templates/claude/review-context.md` and `.claude/review-context.md` | `scare-anchors` anchor |
| `installer/lib.mjs` | `KNOBS`; `agentsBlock` emits `local-gates` and `effective-date-pilots` anchors; `composeHitl` emits the `testing-rules` anchor |
| `installer/customize-testing.mjs` | CLI behind the `testing-rules` knob |
| `commands/customize.md` | the `/hitl:customize` prompt with the knob table |
| `AGENTS.md` (this repository) | its hitl block re-rendered with the two anchors and the pilots heading |
| `.claude/hitl.json` (this repository) | written by `adopt.mjs`, committed |
| `scripts/__tests__/knob-anchors.test.ts` | knob list ↔ anchors cross-check |
| `scripts/__tests__/customize-testing.test.ts` | the script's four behaviours |
| `scripts/__tests__/self-manifest.test.ts` | this repository's manifest equals its render |

Every task runs from the repository root on branch `feat/hitl-v1-slice-5-customize`, cut from `feat/hitl-v1-slice-4-adopt-diff-help`.

---

### Task 1: `KNOBS`, the template anchors, the invariants section, and the anchors test

**Files:**
- Modify: `installer/lib.mjs` (add `KNOBS`, `GENERATED_KNOBS`)
- Modify: `HITL.md`, `templates/HITL.md`
- Modify: `.claude/commands/review-spec.md`, `.claude/commands/review-plan.md`, `.claude/commands/implement-stack.md`, `.claude/agents/spec-reviewer.md`, `.claude/agents/plan-reviewer.md`, `.claude/agents/slice-reviewer.md`, `.claude/review-context.md`, and each one's twin under `templates/claude/`
- Test: `scripts/__tests__/knob-anchors.test.ts`

**Interfaces:**
- Produces: `KNOBS = ["review-rounds", "severities", "reporting-cap", "file-tripwire", "small-lane", "effective-date-pilots", "local-gates", "pr-body-sections", "scare-anchors", "testing-rules"]`; `GENERATED_KNOBS = ["local-gates", "effective-date-pilots", "testing-rules"]` (anchors emitted by code, not present in a template file); the anchor syntax `<!-- hitl:knob <id> -->`.

- [ ] **Step 1: Write the failing test**

```ts
// scripts/__tests__/knob-anchors.test.ts
// Every knob /hitl:customize offers has an anchor, and every anchor names a knob.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GENERATED_KNOBS, KNOBS } from "../../installer/lib.mjs";

const ROOT = process.cwd();
const ANCHOR = /^<!-- hitl:knob ([a-z-]+) -->$/;

function templateFiles(): string[] {
  return readdirSync(join(ROOT, "templates"), { recursive: true, encoding: "utf8" })
    .filter((p) => p.endsWith(".md"))
    .map((p) => join("templates", p));
}

function anchorsIn(text: string): { id: string; next: string }[] {
  const lines = text.split("\n");
  const out: { id: string; next: string }[] = [];
  lines.forEach((line, i) => {
    const m = line.match(ANCHOR);
    if (m) out.push({ id: m[1], next: lines[i + 1] ?? "" });
  });
  return out;
}

describe("knob anchors", () => {
  const found = templateFiles().flatMap((p) =>
    anchorsIn(readFileSync(join(ROOT, p), "utf8")).map((a) => ({ ...a, file: p })),
  );

  it("has ten knobs, three of them generated by code", () => {
    expect(KNOBS).toHaveLength(10);
    expect(GENERATED_KNOBS.every((k) => KNOBS.includes(k))).toBe(true);
  });

  for (const id of KNOBS.filter((k) => !GENERATED_KNOBS.includes(k))) {
    it(`knob ${id} is anchored in at least one template`, () => {
      expect(found.filter((a) => a.id === id).length).toBeGreaterThan(0);
    });
  }

  it("review-rounds is anchored at every restatement", () => {
    const files = found.filter((a) => a.id === "review-rounds").map((a) => a.file);
    expect(files.filter((f) => f === "templates/HITL.md")).toHaveLength(4);
    expect(files.filter((f) => f.endsWith("review-spec.md"))).toHaveLength(2);
    expect(files.filter((f) => f.endsWith("review-plan.md"))).toHaveLength(2);
  });

  it("severities and reporting-cap are anchored in all three reviewers", () => {
    for (const id of ["severities", "reporting-cap"]) {
      const files = found.filter((a) => a.id === id).map((a) => a.file);
      for (const r of ["spec-reviewer", "plan-reviewer", "slice-reviewer"]) {
        expect(files.some((f) => f.endsWith(`${r}.md`)), `${id} in ${r}`).toBe(true);
      }
    }
  });

  it("every anchor in the templates names a listed knob", () => {
    for (const a of found) expect(KNOBS, `${a.file}: ${a.id}`).toContain(a.id);
  });

  it("every anchor is immediately followed by a non-empty line", () => {
    for (const a of found) expect(a.next.trim(), `${a.file}: ${a.id}`).not.toBe("");
  });

  it("this repository's HITL.md carries the invariants section", () => {
    const text = readFileSync(join(ROOT, "HITL.md"), "utf8");
    expect(text).toContain("## Load-bearing invariants");
    expect(text).toContain("MISSING · UNCLEAR · CONFLICTS · BREAKS · UNPROVEN · MIS-SLICED · DEFERRED");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test -- scripts/__tests__/knob-anchors.test.ts`
Expected: FAIL — `KNOBS` is not exported from `installer/lib.mjs`.

- [ ] **Step 3: Export the knob list**

Append to `installer/lib.mjs`:

```js
/** The knobs /hitl:customize offers. Each has one or more `<!-- hitl:knob <id> -->` anchors. */
export const KNOBS = [
  "review-rounds",
  "severities",
  "reporting-cap",
  "file-tripwire",
  "small-lane",
  "effective-date-pilots",
  "local-gates",
  "pr-body-sections",
  "scare-anchors",
  "testing-rules",
];
/** Anchors emitted by code (agentsBlock, composeHitl) rather than present in a template file. */
export const GENERATED_KNOBS = ["local-gates", "effective-date-pilots", "testing-rules"];
```

- [ ] **Step 4: Add the anchors to this repository's copies**

Each anchor is one line inserted immediately above the quoted line. Make the edit in the file under `.claude/` or `HITL.md`; Step 6 copies to the templates.

`HITL.md`:

| insert above the line beginning | anchor |
|---|---|
| `Every feature and behaviour change in this repository runs the chain below.` | `<!-- hitl:knob small-lane -->` |
| the ```` ```dot ```` fence that opens the chain graph (its labels say `≤2 rounds`) | `<!-- hitl:knob review-rounds -->` |
| `- **Rounds.** One is too few, two is good, three is too many.` | `<!-- hitl:knob review-rounds -->` |
| `Three cold reviewers, all Claude subagents under` | `<!-- hitl:knob reporting-cap -->` |
| ``- `/review-spec` — the umbrella spec, at most two rounds`` (the first `## Review gates` bullet; the block runs to the next blank line and covers the `/review-plan` bullet's "at most two rounds" too) | `<!-- hitl:knob review-rounds -->` |
| `Round 2 runs only if triage changed the artefact. Never a third round:` | `<!-- hitl:knob review-rounds -->` |
| `- Every PR body answers, briefly and in plain words` | `<!-- hitl:knob pr-body-sections -->` |
| ``- A PR opened by `/implement-stack` also carries `## Review decisions` `` | `<!-- hitl:knob pr-body-sections -->` |
| `- Each slice is one PR, sized by **capability**, not by file count.` | `<!-- hitl:knob file-tripwire -->` |

Two restatements cannot carry an anchor because they sit inside YAML front matter: the
`description:` lines of `review-spec.md` and `review-plan.md` end with "At most two rounds."
Delete that sentence from both descriptions (template and copy) so the count is stated only
in anchored places. In `.claude/agents/plan-reviewer.md` (and its template) the phrase
"~20-file tripwire" restates the `file-tripwire` number; reword it to "the standards'
file-count tripwire", as `slice-reviewer.md` already says, so the knob has one home.

`.claude/commands/review-spec.md`:

| insert above | anchor |
|---|---|
| ``Count existing `**Reviewed:** round N` entries in the spec header`` | `<!-- hitl:knob review-rounds -->` |
| `- If this was round 1 AND the spec changed in step 4 → go to step 1 for round 2.` | `<!-- hitl:knob review-rounds -->` |

`.claude/commands/review-plan.md`:

| insert above | anchor |
|---|---|
| ``Count `**Reviewed:** round N` entries in the FIRST plan's header`` | `<!-- hitl:knob review-rounds -->` |
| the first bullet under `## 5. Round rule — one is too few, two is good, three is too many` | `<!-- hitl:knob review-rounds -->` |

`.claude/agents/spec-reviewer.md`, `plan-reviewer.md`, `slice-reviewer.md` (all three):

| insert above | anchor |
|---|---|
| the line beginning `Severity: 🔴 blocker` | `<!-- hitl:knob severities -->` |
| the line beginning `**Reporting cap.**` | `<!-- hitl:knob reporting-cap -->` |

`.claude/commands/implement-stack.md`:

| insert above | anchor |
|---|---|
| `Body (write it in the register of explaining to a newcomer;` | `<!-- hitl:knob pr-body-sections -->` |

`.claude/review-context.md` **and** `templates/claude/review-context.md` (the two differ in content, so edit both by hand):

| insert above | anchor |
|---|---|
| `## Scare score anchors` | `<!-- hitl:knob scare-anchors -->` |

- [ ] **Step 5: Append the invariants section to `HITL.md`**

At the end of `HITL.md` (after the last bullet of `## Delivery slices (small PRs)`), add:

```markdown

## Load-bearing invariants

A script or a command parses each of these by name. `/hitl:customize` refuses them; change
one together with its parser, by PR.

- The `**Reviewed:**` header line of a spec or plan — the Stop hook and the review commands.
- The `**Owns:**` header line of a slice plan — the handover agent and the slice reviewer.
- The `Plan:` line of a PR body — the slice reviewer.
- The spec and plan filename patterns `<YYYY-MM-DD>-<topic>-design.md` and
  `<YYYY-MM-DD>-<feature>-slice-<N>-<label>.md` — the review commands, the handover agent.
- The stack-table columns `slice | plan | branch | parent | status | owns` —
  `/implement-stack` and the slice reviewer.
- The seven finding-type names MISSING · UNCLEAR · CONFLICTS · BREAKS · UNPROVEN · MIS-SLICED · DEFERRED —
  every review command's triage.
- The `docs/superpowers/` path — the Stop hook, the wipe script, every command.
```

`composeHitl` appends `## Testing and gates` after this section, so the invariants stay the last core section.

- [ ] **Step 6: Copy every edited file onto its template twin**

```bash
cp HITL.md templates/HITL.md
cp .claude/commands/review-spec.md .claude/commands/review-plan.md .claude/commands/implement-stack.md templates/claude/commands/
cp .claude/agents/spec-reviewer.md .claude/agents/plan-reviewer.md .claude/agents/slice-reviewer.md templates/claude/agents/
```

(`review-context.md` was edited in both places in Step 4.)

- [ ] **Step 7: Run the anchors test and the drift test**

Run: `pnpm test -- scripts/__tests__/knob-anchors.test.ts scripts/__tests__/drift.test.ts`
Expected: PASS. If a drift test fails, a copy was missed in Step 6.

- [ ] **Step 8: Commit**

```bash
git add installer/lib.mjs HITL.md templates .claude scripts/__tests__/knob-anchors.test.ts
git commit -m "feat(customize): knob anchors in every template and the invariants section"
```

---

### Task 2: the generated anchors — `agentsBlock` and `composeHitl`

**Files:**
- Modify: `installer/lib.mjs` (`agentsBlock`, `composeHitl`)
- Modify: `scripts/__tests__/lib.test.ts` (the `agentsBlock` and `composeHitl` expectations written in slices 1 and 3)
- Modify: `AGENTS.md` (this repository's hitl block)
- Test: `scripts/__tests__/knob-anchors.test.ts` (extend)

**Interfaces:**
- Consumes: `agentsBlock(gates, testing = [])` and `NO_GATES_LINE` (slice 3), `composeHitl(pluginRoot, testing)` (slice 1).
- Produces: `agentsBlock(gates, testing)` output begins `<!-- hitl:knob local-gates -->\n## Local gates\n`; when `testing` includes `effective-date` it ends with `<!-- hitl:knob effective-date-pilots -->\n## Effective-date pilots\n\n- (none yet — name the area a new rule applies to first, one per line)` and otherwise carries no pilots section (slice 3's behaviour, kept); `composeHitl` emits `<!-- hitl:knob testing-rules -->` on the line before `## Testing and gates`.

- [ ] **Step 1: Extend the failing test**

Append to the `describe` in `scripts/__tests__/knob-anchors.test.ts`:

```ts
  it("agentsBlock carries the local-gates and effective-date-pilots anchors", async () => {
    const { agentsBlock } = await import("../../installer/lib.mjs");
    const block = agentsBlock(["pnpm test"]);
    expect(block).toMatch(/^<!-- hitl:knob local-gates -->\n## Local gates\n/);
    expect(block).not.toContain("hitl:knob effective-date-pilots");
    const withPilots = agentsBlock(["pnpm test"], ["effective-date"]);
    expect(withPilots).toContain(
      "<!-- hitl:knob effective-date-pilots -->\n## Effective-date pilots\n\n- (none yet",
    );
  });

  it("composeHitl carries the testing-rules anchor above the Testing and gates heading", async () => {
    const { composeHitl } = await import("../../installer/lib.mjs");
    const text = composeHitl(ROOT, ["e2e"]);
    expect(text).toContain("<!-- hitl:knob testing-rules -->\n## Testing and gates\n");
    expect(composeHitl(ROOT, [])).not.toContain("hitl:knob testing-rules");
  });

  it("this repository's AGENTS.md carries the local-gates anchor (no pilots: testing is empty here)", () => {
    const text = readFileSync(join(ROOT, "AGENTS.md"), "utf8");
    expect(text).toContain("<!-- hitl:knob local-gates -->\n## Local gates");
    expect(text).not.toContain("hitl:knob effective-date-pilots");
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test -- scripts/__tests__/knob-anchors.test.ts`
Expected: FAIL on the three new tests (no anchors in the generated text).

- [ ] **Step 3: Change `agentsBlock` and `composeHitl`**

In `installer/lib.mjs`, `agentsBlock` becomes (keep the gate-line rendering slice 3 wrote; only the wrapping changes):

```js
/** The AGENTS.md block: local gates, plus the pilots list when effective-date is chosen. */
export function agentsBlock(gates, testing = []) {
  const lines = ["<!-- hitl:knob local-gates -->", "## Local gates", ""];
  if (gates.length === 0) lines.push(NO_GATES_LINE);
  else for (const g of gates) lines.push(`- \`${g}\``);
  if (testing.includes("effective-date")) {
    lines.push(
      "",
      "<!-- hitl:knob effective-date-pilots -->",
      "## Effective-date pilots",
      "",
      "- (none yet — name the area a new rule applies to first, one per line)",
    );
  }
  return lines.join("\n");
}
```

and in `composeHitl` replace the return line for the chosen case with:

```js
  return `${core.trimEnd()}\n\n<!-- hitl:knob testing-rules -->\n## Testing and gates\n\n${fragments.join("\n\n")}\n`;
```

- [ ] **Step 4: Update the earlier expectations**

In `scripts/__tests__/lib.test.ts`, find the assertions on `agentsBlock(...)` and `composeHitl(...)` written in slices 1 and 3 and make them expect the new text (the anchor line before `## Local gates`, the pilots heading at the end, the anchor before `## Testing and gates`). Do not delete an assertion; change its expected string.

- [ ] **Step 5: Re-render this repository's `AGENTS.md` block**

Replace the text between `<!-- hitl:start -->` and `<!-- hitl:end -->` in `AGENTS.md` with the output of:

```bash
node -e 'import("./installer/lib.mjs").then(m => process.stdout.write(m.agentsBlock(m.THIS_REPO_CHOICES.gates, m.THIS_REPO_CHOICES.testing) + "\n"))'
```

- [ ] **Step 6: Run the suite**

Run: `pnpm test`
Expected: PASS, including the slice-3 render tests that read the `AGENTS.md` block (they compare against `agentsBlock`, so they follow the change).

- [ ] **Step 7: Commit**

```bash
git add installer/lib.mjs scripts/__tests__ AGENTS.md
git commit -m "feat(customize): generated anchors for local gates, pilots and testing rules"
```

---

### Task 3: `customize-testing.mjs` — the whole-file knob

**Files:**
- Create: `installer/customize-testing.mjs`
- Test: `scripts/__tests__/customize-testing.test.ts`

**Interfaces:**
- Consumes: `readManifest`, `pluginVersion`, `composeHitl`, `renderAll`, `manifestFor`, `sha256`, `MANIFEST_PATH`, `TESTING_ORDER`, `parseArgs` from `lib.mjs`.
- Produces: CLI `node installer/customize-testing.mjs --repo <dir> --plugin-root <dir> --testing <comma list or empty> --ci github-actions|none`; stdout JSON `{ "wrote": string[], "removed": string[], "kept": string[], "manifest": Manifest }` exit 0; refusals exit 3: `{ "refused": "no-manifest" }`, `{ "refused": "behind", "recorded", "plugin" }`, `{ "refused": "hitl-locally-edited" }`, `{ "refused": "unknown-fragment", "id" }`.

- [ ] **Step 1: Write the failing test**

```ts
// scripts/__tests__/customize-testing.test.ts
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PLUGIN_ROOT = process.cwd();
const RENDER = join(PLUGIN_ROOT, "installer/render.mjs");
const SCRIPT = join(PLUGIN_ROOT, "installer/customize-testing.mjs");
const WORKFLOW = ".github/workflows/wipe-superpowers-docs.yml";

function installedRepo(ci: "github-actions" | "none" = "none", testing: string[] = []) {
  const dir = mkdtempSync(join(tmpdir(), "hitl-custom-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  const answers = join(dir, "..", `answers-${Date.now()}-${Math.random()}.json`);
  writeFileSync(answers, JSON.stringify({ provider: "github", ci, testing, gates: ["pnpm test"] }));
  execFileSync("node", [RENDER, "--repo", dir, "--plugin-root", PLUGIN_ROOT, "--answers", answers]);
  return dir;
}

function customize(repo: string, testing: string, ci: string) {
  const r = spawnSync(
    "node",
    [SCRIPT, "--repo", repo, "--plugin-root", PLUGIN_ROOT, "--testing", testing, "--ci", ci],
    { encoding: "utf8" },
  );
  return { ...r, json: r.stdout ? JSON.parse(r.stdout) : null };
}

const manifestOf = (repo: string) => JSON.parse(readFileSync(join(repo, ".claude/hitl.json"), "utf8"));
const hitlOf = (repo: string) => readFileSync(join(repo, "HITL.md"), "utf8");

describe("customize-testing.mjs", () => {
  it("adds fragments and the workflow, and updates the manifest", () => {
    const repo = installedRepo("none", []);
    const r = customize(repo, "tiers,e2e", "github-actions");
    expect(r.status).toBe(0);
    const hitl = hitlOf(repo);
    expect(hitl).toContain("<!-- hitl:knob testing-rules -->\n## Testing and gates\n");
    expect(hitl.indexOf("critical happy path")).toBeLessThan(hitl.indexOf("unit > component > e2e"));
    expect(existsSync(join(repo, WORKFLOW))).toBe(true);
    const m = manifestOf(repo);
    expect(m.testing).toEqual(["e2e", "tiers"]);
    expect(m.ci).toBe("github-actions");
    expect(m.files["HITL.md"]).toBeDefined();
    expect(m.files[WORKFLOW]).toBeDefined();
    expect(r.json.wrote).toEqual(expect.arrayContaining(["HITL.md", WORKFLOW]));
  });

  it("removes every fragment and the workflow when asked for none", () => {
    const repo = installedRepo("github-actions", ["e2e"]);
    const r = customize(repo, "", "none");
    expect(r.status).toBe(0);
    expect(hitlOf(repo)).not.toContain("## Testing and gates");
    expect(existsSync(join(repo, WORKFLOW))).toBe(false);
    const m = manifestOf(repo);
    expect(m.testing).toEqual([]);
    expect(m.ci).toBe("none");
    expect(m.files).not.toHaveProperty(WORKFLOW);
    expect(r.json.removed).toEqual([WORKFLOW]);
  });

  it("refuses when HITL.md was edited by hand", () => {
    const repo = installedRepo();
    writeFileSync(join(repo, "HITL.md"), hitlOf(repo) + "\nlocal rule\n");
    const before = hitlOf(repo);
    const r = customize(repo, "e2e", "none");
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "hitl-locally-edited" });
    expect(hitlOf(repo)).toBe(before);
  });

  it("refuses when the manifest is behind the plugin", () => {
    const repo = installedRepo();
    const m = manifestOf(repo);
    writeFileSync(join(repo, ".claude/hitl.json"), JSON.stringify({ ...m, version: "0.0.1" }));
    const r = customize(repo, "e2e", "none");
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "behind", recorded: "0.0.1", plugin: "0.1.0" });
  });

  it("refuses when the manifest is ahead of the plugin (stale plugin cache)", () => {
    const repo = installedRepo();
    const m = manifestOf(repo);
    writeFileSync(join(repo, ".claude/hitl.json"), JSON.stringify({ ...m, version: "9.9.9" }));
    const r = customize(repo, "e2e", "none");
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "ahead", recorded: "9.9.9", plugin: "0.1.0" });
  });

  it("keeps a locally edited workflow instead of deleting it", () => {
    const repo = installedRepo("github-actions", []);
    writeFileSync(join(repo, WORKFLOW), "name: mine\n");
    const r = customize(repo, "", "none");
    expect(r.status).toBe(0);
    expect(existsSync(join(repo, WORKFLOW))).toBe(true);
    expect(r.json.kept).toEqual([WORKFLOW]);
    expect(manifestOf(repo).ci).toBe("none");
  });

  it("refuses an unknown fragment id", () => {
    const repo = installedRepo();
    const r = customize(repo, "stories", "none");
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "unknown-fragment", id: "stories" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test -- scripts/__tests__/customize-testing.test.ts`
Expected: FAIL — `installer/customize-testing.mjs` not found (spawn status 1, `json` null).

- [ ] **Step 3: Write the script**

```js
#!/usr/bin/env node
// The `testing-rules` knob of /hitl:customize: re-compose HITL.md with a new fragment set,
// add or remove the wipe workflow, and record the new choices in the manifest so /hitl:diff
// stays exact. Refuses when the manifest is behind the plugin or HITL.md was edited by
// hand. Exit: 0 ok · 1 usage · 3 refused.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  MANIFEST_PATH,
  TESTING_ORDER,
  compareVersions,
  composeHitl,
  manifestFor,
  parseArgs,
  pluginVersion,
  readManifest,
  renderAll,
  sha256,
} from "./lib.mjs";

const WORKFLOW = ".github/workflows/wipe-superpowers-docs.yml";
const USAGE = "usage: --repo <dir> --plugin-root <dir> --testing <a,b|''> --ci github-actions|none";

export function run(args) {
  const { repo, "plugin-root": pluginRoot, ci } = args;
  const testingArg = args.testing;
  if (!repo || !pluginRoot || testingArg === undefined || !["github-actions", "none"].includes(ci)) {
    return { code: 1, out: { error: USAGE } };
  }
  const testing = testingArg === "" ? [] : testingArg.split(",").map((s) => s.trim());
  for (const id of testing) if (!TESTING_ORDER.includes(id)) return { code: 3, out: { refused: "unknown-fragment", id } };

  const manifest = readManifest(repo);
  if (!manifest) return { code: 3, out: { refused: "no-manifest" } };
  const plugin = pluginVersion(pluginRoot);
  if (manifest.version !== plugin) {
    const refused = compareVersions(manifest.version, plugin) < 0 ? "behind" : "ahead";
    return { code: 3, out: { refused, recorded: manifest.version, plugin } };
  }

  const hitlPath = join(repo, "HITL.md");
  const current = existsSync(hitlPath) ? readFileSync(hitlPath, "utf8") : null;
  if (current !== composeHitl(pluginRoot, manifest.testing)) return { code: 3, out: { refused: "hitl-locally-edited" } };

  const choices = { provider: manifest.provider, ci, testing: TESTING_ORDER.filter((t) => testing.includes(t)), gates: [] };
  const rendered = renderAll(pluginRoot, choices);
  const wrote = [];
  const removed = [];
  const kept = [];

  writeFileSync(hitlPath, rendered.get("HITL.md").content);
  wrote.push("HITL.md");

  const workflowPath = join(repo, WORKFLOW);
  if (ci === "github-actions") {
    if (!existsSync(workflowPath)) {
      mkdirSync(dirname(workflowPath), { recursive: true });
      writeFileSync(workflowPath, rendered.get(WORKFLOW).content);
      wrote.push(WORKFLOW);
    } else kept.push(WORKFLOW);
  } else if (existsSync(workflowPath)) {
    const recordedHash = manifest.files[WORKFLOW];
    if (recordedHash && sha256(readFileSync(workflowPath, "utf8")) === recordedHash) {
      rmSync(workflowPath);
      removed.push(WORKFLOW);
    } else kept.push(WORKFLOW);
  }

  const next = manifestFor(plugin, choices, rendered);
  writeFileSync(join(repo, MANIFEST_PATH), `${JSON.stringify(next, null, 2)}\n`);
  return { code: 0, out: { wrote, removed, kept, manifest: next } };
}

const args = parseArgs(process.argv.slice(2));
const result = args ? run(args) : { code: 1, out: { error: USAGE } };
process.stdout.write(`${JSON.stringify(result.out, null, 2)}\n`);
process.exit(result.code);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- scripts/__tests__/customize-testing.test.ts`
Expected: PASS, 7 tests (adds, removes, locally edited, behind, ahead, kept workflow, unknown fragment). The first test's fragment-order assertion relies on the `e2e` fragment containing "critical happy path" and the `tiers` fragment containing "unit > component > e2e", both written in slice 3; if slice 3 worded them differently, change the two search strings to a phrase each fragment actually contains, not the order they assert.

- [ ] **Step 5: Commit**

```bash
git add installer/customize-testing.mjs scripts/__tests__/customize-testing.test.ts
git commit -m "feat(customize): customize-testing.mjs re-composes HITL.md and records the choice"
```

---

### Task 4: the `/hitl:customize` prompt

**Files:**
- Create: `commands/customize.md`

**Interfaces:**
- Consumes: `KNOBS` (by name, in the table), the anchor syntax, `customize-testing.mjs`, the manifest, the invariants section of `HITL.md`.
- Produces: `/hitl:customize [<knob-id>]`.

- [ ] **Step 1: Write the prompt**

```markdown
---
description: Tune one workflow knob at a time, grill-style, by editing its anchored paragraphs in HITL.md and .claude/. Refuses load-bearing invariants. Usage: /hitl:customize [<knob-id>]
argument-hint: [<knob-id>]
---

You help the human tune the hitl workflow this repository owns. You edit files in the
working tree and never commit: the change lands by pull request like any other change to
`.claude/` or `HITL.md`.

## 0. Ground yourself

Read `.claude/hitl.json` (stop with "hitl is not installed or not adopted; run `/hitl:help`"
if absent), `HITL.md` and its `## Load-bearing invariants` section, and this table. A
**knob** is a rule a repository may tune. Each knob has one or more **anchors**: the line
`<!-- hitl:knob <id> -->` immediately above the paragraph, bullet or heading that states the
rule. `grep -rn "hitl:knob <id>" HITL.md AGENTS.md .claude/` finds every anchor of a knob.

| id | what it tunes | where | treasury default — and why |
|---|---|---|---|
| `review-rounds` | how many cold review rounds a spec or plan gets | `HITL.md` § Gates and § Review gates; `review-spec.md` and `review-plan.md`, step 0 and step 5 | 2 — one is too few; three chases findings that are non-deterministic across runs |
| `severities` | what blocker / major / minor mean | the three reviewer agents | blocker stops the merge or ships a wrong design; major is fixed before the next gate; minor is polish |
| `reporting-cap` | how many findings a review lists | the three reviewer agents; `HITL.md` § Review gates | every blocker, at most five majors, minors one line each — a longer list is not read |
| `file-tripwire` | the file count that triggers a justification | `HITL.md` § Delivery slices | ~20 files, a tripwire not a cap; never split horizontally to get under it |
| `small-lane` | whether any change may skip the chain | `HITL.md` § Delivery chain | none — size shrinks the artefact, never the gate |
| `effective-date-pilots` | the areas a new rule applies to first | `AGENTS.md` hitl block, `## Effective-date pilots` | none until the humans name one; grandfathered code is never a finding |
| `local-gates` | the commands the implementer and fixer run before "done" | `AGENTS.md` hitl block, `## Local gates` | discovered at init from the repository's scripts |
| `pr-body-sections` | what every PR body must answer | `HITL.md` § Pull requests (the What/Why/How bullet and the Review decisions bullet, both anchored); `implement-stack.md`, the body block | What / Why / How plus Review decisions — a newcomer can follow it |
| `scare-anchors` | the scare-score ladder reviewers calibrate on | `.claude/review-context.md` | treasury's ladder with 5–8 left as placeholders for this repository's own risky change classes |
| `testing-rules` | which testing principles `HITL.md` carries and whether the wipe job is installed | `HITL.md` § Testing and gates; the wipe workflow | the choices made at init |

## 1. Refuse an invariant

If the human asks to change anything in `## Load-bearing invariants` — the `**Reviewed:**`
line, the `**Owns:**` line, the `Plan:` line, the spec and plan filename patterns, the
stack-table columns, the seven finding-type names, the `docs/superpowers/` path — reply
exactly: "that is a load-bearing invariant; change it together with its parser, by PR" and
change nothing. Renaming a finding type is such a request; redefining a severity is not.

## 2. Pick the knob

If `$ARGUMENTS` names a knob id, start there. Otherwise ask which knob, offering the table's
ids in one line. One knob per turn; finish it before offering another.

## 3. Grill, then edit — for every knob except `testing-rules`

Ask what the human wants the rule to say, one question at a time, and recommend the treasury
default with its reason from the table before accepting a change. When the wording is
agreed:

1. `grep -rn "hitl:knob <id>" HITL.md AGENTS.md .claude/` — every hit is an anchor of this
   knob.
2. For each anchor, edit only the block below it: from the line after the anchor to the next
   blank line (for a heading such as `## Local gates`, the heading's section up to the next
   heading or the block's end marker). Restate the same rule at every anchor; the copies
   must not disagree.
3. Never touch an anchor line itself, and never move a rule out from under its anchor.
4. Show the diff (`git diff --stat` and the hunks) and stop. Do not commit.

## 4. `testing-rules`

Read the manifest's `testing` and `ci`. Ask, one at a time, which of `e2e`, `tiers`, `ci`,
`hooks`, `effective-date` the repository should carry (say what each one states, from
`${CLAUDE_PLUGIN_ROOT}/templates/testing/<id>.md`) and whether the wipe job should be
installed (`ci: github-actions`) or not (`ci: none`). Then:

```bash
node "${CLAUDE_PLUGIN_ROOT}/installer/customize-testing.mjs" --repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}" --testing "<comma list, or empty>" --ci <github-actions|none>
```

- exit `3`, `refused: "behind"` → "the install is at <recorded> and the plugin at <plugin>;
  run `/hitl:diff --apply` first". Stop.
- exit `3`, `refused: "ahead"` → "the install is at <recorded>, newer than the plugin at
  <plugin>; update the plugin (`claude plugin marketplace update hitl`, then reinstall)". Stop.
- exit `3`, `refused: "hitl-locally-edited"` → "`HITL.md` differs from its recorded render;
  this knob re-composes the whole file, so merge the fragments by hand: append or remove the
  fragment text from `${CLAUDE_PLUGIN_ROOT}/templates/testing/`, keep `## Testing and gates`
  under its anchor, then update `testing` in `.claude/hitl.json`". Stop.
- exit `3`, `refused: "no-manifest"` → "run `/hitl:init --adopt` first". Stop.
- exit `0` → report `wrote`, `removed`, `kept` (a kept workflow was edited locally and is
  left for the human) and the new `testing` and `ci`. Do not commit.

## Never

Commit. Edit text that is not under an anchor of the chosen knob. Change an invariant.
Change a finding-type name. Touch `.claude/hitl.json` except through `customize-testing.mjs`.
```

- [ ] **Step 2: Dry-run the prompt on a fixture**

In a temp repository installed by `render.mjs` (as in Task 3's test helper) with this
repository added as a local marketplace, run:

- `/hitl:customize` and ask to rename `MISSING` to `GAP` → expected reply: "that is a
  load-bearing invariant; change it together with its parser, by PR"; `git status` clean.
- `/hitl:customize file-tripwire` and answer 30 files → expected: exactly one hunk in
  `HITL.md`, in the bullet below `<!-- hitl:knob file-tripwire -->`, and the anchor line
  itself unchanged; nothing committed.
- `/hitl:customize review-rounds` and answer 1 round → expected: eight hunks (four in
  `HITL.md` — the graph labels, the Rounds bullet, the two Review gates bullets, the round
  rule — two each in `review-spec.md` and `review-plan.md`), each below an anchor, and no
  other line in either file still says "two rounds".

If the plugin cannot be installed locally, exercise the prompt by pasting it into a session
opened in the temp repository and note in the PR body that it was run by hand.

- [ ] **Step 3: Commit**

```bash
git add commands/customize.md
git commit -m "feat(commands): /hitl:customize — grill one knob, edit its anchors, refuse invariants"
```

---

### Task 5: adopt this repository and prove its manifest

**Files:**
- Create: `.claude/hitl.json` (written by `adopt.mjs`)
- Test: `scripts/__tests__/self-manifest.test.ts`

**Interfaces:**
- Consumes: `node installer/adopt.mjs --repo <dir> --plugin-root <dir> --answers <file>` (slice 4); `node installer/diff.mjs --repo <dir> --plugin-root <dir> --marketplace <dir>` (slice 4); `THIS_REPO_CHOICES`, `renderAll`, `sha256`, `pluginVersion`, `readManifest` (slice 1).
- Produces: this repository's committed manifest; acceptance criterion 6.

- [ ] **Step 1: Write the failing test**

```ts
// scripts/__tests__/self-manifest.test.ts
// This repository is adopted: its manifest records the template hashes for its choices.
// The manifest compares to the render, not to the working tree, so review-context.md's
// local edits do not matter here (the drift test owns that exception).
import { describe, expect, it } from "vitest";
import {
  THIS_REPO_CHOICES,
  pluginVersion,
  readManifest,
  renderAll,
  sha256,
} from "../../installer/lib.mjs";

const ROOT = process.cwd();

describe("this repository's manifest", () => {
  const manifest = readManifest(ROOT);
  const rendered = renderAll(ROOT, THIS_REPO_CHOICES);

  it("exists and records the plugin's own version and choices", () => {
    expect(manifest).not.toBeNull();
    expect(manifest.version).toBe(pluginVersion(ROOT));
    expect(manifest.provider).toBe("github");
    expect(manifest.ci).toBe("github-actions");
    expect(manifest.testing).toEqual([]);
  });

  it("hashes exactly the owned files", () => {
    expect(Object.keys(manifest.files).sort()).toEqual([...rendered.keys()].sort());
  });

  for (const [path, { content }] of renderAll(ROOT, THIS_REPO_CHOICES)) {
    it(`${path} hash equals its render`, () => {
      expect(manifest.files[path]).toBe(sha256(content));
    });
  }

  // Acceptance criterion 6, as a test: diff.mjs on this repository, same version, reports
  // every owned file unchanged except the repo-specific review context.
  it("diff.mjs reports every file unchanged except review-context.md", () => {
    const r = spawnSync(
      "node",
      [join(ROOT, "installer/diff.mjs"), "--repo", ROOT, "--plugin-root", ROOT, "--marketplace", ROOT],
      { encoding: "utf8" },
    );
    expect(r.status, r.stderr).toBe(0);
    const files: { path: string; state: string }[] = JSON.parse(r.stdout).files;
    const byPath = Object.fromEntries(files.map((f) => [f.path, f.state]));
    expect(byPath[".claude/review-context.md"]).toBe("locally edited");
    for (const f of files) {
      if (f.path === ".claude/review-context.md") continue;
      expect(f.state, f.path).toBe("unchanged");
    }
  });
});
```

(add `import { spawnSync } from "node:child_process";` and `import { join } from "node:path";` at the top).

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test -- scripts/__tests__/self-manifest.test.ts`
Expected: FAIL — `manifest` is null (`.claude/hitl.json` does not exist).

- [ ] **Step 3: Adopt this repository**

```bash
ANSWERS=$(mktemp)
node -e 'import("./installer/lib.mjs").then(m => process.stdout.write(JSON.stringify(m.THIS_REPO_CHOICES)))' > "$ANSWERS"
node installer/adopt.mjs --repo . --plugin-root . --answers "$ANSWERS"
```

Expected: exit 0 and a JSON report naming `.claude/hitl.json`. `git status` shows exactly one new file, `.claude/hitl.json`; nothing else changed.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- scripts/__tests__/self-manifest.test.ts`
Expected: PASS: 3 tests plus one per owned file (22, after slice 2 added the shim and its backend).

- [ ] **Step 5: Read this repository's own diff by eye as well**

```bash
node installer/diff.mjs --repo . --plugin-root . --marketplace .
```

Expected: every file `unchanged` except `.claude/review-context.md` → `locally edited`. Any other state is a bug in this slice or an earlier one: a file whose copy and template diverge would already have failed the drift test, so investigate the manifest or the diff script before touching any file.

- [ ] **Step 6: Run the gates**

Run: `pnpm test && pnpm format:check`
Expected: both green.

- [ ] **Step 7: Commit**

```bash
git add .claude/hitl.json scripts/__tests__/self-manifest.test.ts
git commit -m "chore(hitl): adopt this repository — manifest at 0.1.0"
```
