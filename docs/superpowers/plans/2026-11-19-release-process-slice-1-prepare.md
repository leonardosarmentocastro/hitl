# Automatic releases, slice 1: prepare — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Owns:** a merged `feat/` or `fix/` pull request becomes a release commit on `main` — version raised in the three files, a new changelog section from the pull request titles.

**Goal:** `scripts/release.mjs prepare` decides from the merged pull requests whether to release and writes the four files; `release-prepare.yml` runs it on every push to `main` and commits the result.

**Architecture:** One repo-specific Node script beside `scripts/hitl/` (never rendered into a target repository), following the `installer/` CLI shape: `run(args)` returns `{ code, out }`, `emit` prints one JSON document. It reads git ancestry by spawning `git`. The workflow only fetches the pull request list, calls the script, runs the gates and commits.

**Tech Stack:** Node 24 (ES modules, no new dependencies), vitest, GitHub Actions, `gh`.

**Spec:** `docs/superpowers/specs/2026-11-19-release-process-design.md`

## Global Constraints

- TDD per `.hitl/HITL.md`: one failing test → minimal code → pass → commit. Tests live in `scripts/__tests__/`, use temporary directories, never `docs/superpowers/`.
- Local gates before the PR opens: `pnpm test` and `pnpm format:check`.
- Workflow YAML is validated by a human watching it run; write no test for it.
- No new dependency. Reuse `parseArgs`, `emit`, `pluginVersion`, `compareVersions`, `changelogSections` from `installer/lib.mjs`.
- Exit codes as in `installer/`: `0` ok · `1` usage · `2` error · `3` refused. A refusal writes nothing.
- The two `.claude-plugin/*.json` files and `.hitl/manifest.json` are edited as text — the one `"version": "<current>"` occurrence is replaced — never re-serialized.
- The workflow uses only `GITHUB_TOKEN`; no other secret.
- Commit messages follow the repository's style (`feat(release): …`, `docs(agents): …`) and end with the attribution line the session gives.

## Review Focus

- A pull request title with leading or trailing spaces: the changelog line carries it trimmed (Task 2 test).
- `--prs` naming a file that is missing or not JSON: exit `2` with an `error`, nothing written (Task 3 test).
- A `"version": "<current>"` string that occurs zero or two times in one of the three files: refusal `version-not-found`, nothing written (Task 3 test).
- A `CHANGELOG.md` without a final newline: the result still ends with exactly one newline and the released sections keep their text (Task 2 test).
- A clone without tags (a shallow checkout): the `tag-missing` refusal, not a release (covered by Task 3's `tag-missing` test; the workflow checks out with full history).

---

### Task 1: The test repository helper and the "nothing to release" path

**Files:**
- Create: `scripts/release.mjs`
- Create: `scripts/__tests__/helpers/release-repo.ts`
- Test: `scripts/__tests__/release-prepare.test.ts`

**Interfaces:**
- Produces (helper, used by every later task and by slice 2):
  - `releaseRepo(opts?: { version?: string; changelog?: string; tag?: boolean }): string` — a temporary git repository on branch `main` with the four files committed and, unless `tag: false`, the tag `v<version>` on that commit. Defaults: `version` `"0.3.0"`; `changelog` `"# Changelog\n\nintro\n\n## Unreleased\n\n## 0.3.0\n\n- three\n"`. Files: `.claude-plugin/plugin.json` = `{\n  "name": "hitl",\n  "version": "<v>"\n}\n`; `.claude-plugin/marketplace.json` = `{\n  "name": "hitl",\n  "plugins": [{ "name": "hitl", "version": "<v>", "source": "./" }]\n}\n`; `.hitl/manifest.json` = `{\n  "version": "<v>",\n  "provider": "github",\n  "testing": [],\n  "files": {}\n}\n`. Sets `user.name`/`user.email` in the repository's own config.
  - `commit(repo: string, message: string, files?: Record<string, string>): string` — writes the files (or an empty commit), commits, returns the full sha.
  - `prsFile(prs: Pr[]): string` where `type Pr = { number: number; title: string; headRefName: string; mergeCommit: { oid: string } | null }` — writes the JSON to a temporary file, returns its path.
  - `release(args: string[]): { status: number; out: any }` — spawns `node scripts/release.mjs …`, parses stdout as JSON.
- Produces (script): `export function run(command: string, args: object): { code: number; out: object }`; the CLI is `node scripts/release.mjs <command> --name value …`, usage error (code `1`, `{ error: "usage: …" }`) for an unknown command or a missing argument.

- [ ] **Step 1: Write the failing tests**

```ts
describe("release.mjs prepare — nothing to release", () => {
  it("releases nothing when no pull request is unreleased", () => {
    const repo = releaseRepo();
    const r = release(["prepare", "--repo", repo, "--prs", prsFile([])]);
    expect(r.status).toBe(0);
    expect(r.out).toEqual({ released: false });
    expect(git(repo, "status", "--porcelain")).toBe("");
  });
  it("ignores a pull request already contained in the current version's tag", () => {
    const repo = releaseRepo({ tag: false });
    const old = commit(repo, "old feature");
    git(repo, "tag", "v0.3.0");
    const r = release(["prepare", "--repo", repo, "--prs", prsFile([pr(1, "Old", "feat/old", old)])]);
    expect(r.out).toEqual({ released: false });
  });
  it("ignores a pull request whose merge commit is null or not in this checkout", () => {
    const repo = releaseRepo();
    const prs = [pr(2, "Unknown", "feat/a", "0".repeat(40)), { number: 3, title: "Null", headRefName: "feat/b", mergeCommit: null }];
    expect(release(["prepare", "--repo", repo, "--prs", prsFile(prs)]).out).toEqual({ released: false });
  });
  it("ignores unreleased pull requests that are neither feat/ nor fix/", () => {
    const repo = releaseRepo();
    const sha = commit(repo, "docs");
    const prs = [pr(4, "Docs", "docs/readme", sha), pr(5, "Chore", "chore/x", sha), pr(6, "No slash", "feat", sha)];
    expect(release(["prepare", "--repo", repo, "--prs", prsFile(prs)]).out).toEqual({ released: false });
  });
  it("prints usage for an unknown command or a missing argument", () => {
    expect(release(["nope"]).status).toBe(1);
    expect(release(["prepare", "--repo", releaseRepo()]).status).toBe(1);
  });
});
```

`pr(number, title, headRefName, oid)` and `git(repo, ...args)` are local helpers of the test file.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test release-prepare`
Expected: FAIL — `scripts/release.mjs` does not exist.

- [ ] **Step 3: Implement the helper, the CLI shell and the unreleased filter**

In `scripts/release.mjs`: `unreleasedPrs(repo, prs, version)` keeps a pull request when `mergeCommit?.oid` is an ancestor of `HEAD` and not an ancestor of `v<version>` (`git -C <repo> merge-base --is-ancestor <oid> <ref>`: exit `0` ancestor, `1` not; any other exit — an unknown commit — counts as "not in this checkout"). The prefix is the text of `headRefName` before the first `/`; a name without `/` has no prefix. `prepare` returns `{ released: false }` when no kept pull request has prefix `feat` or `fix`.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test release-prepare`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/release.mjs scripts/__tests__/helpers/release-repo.ts scripts/__tests__/release-prepare.test.ts
git commit -m "feat(release): prepare releases nothing without an unreleased feat or fix pull request"
```

### Task 2: A release — next version and the four files

**Files:**
- Modify: `scripts/release.mjs`
- Test: `scripts/__tests__/release-prepare.test.ts`

**Interfaces:**
- Consumes: Task 1's helper and `unreleasedPrs`.
- Produces: `export function nextVersion(current: string, prefixes: string[]): { version: string; bump: "minor" | "patch" } | null` — any `"feat"` → minor (`0.3.0` → `0.4.0`, patch reset to 0); otherwise any `"fix"` → patch (`0.3.0` → `0.3.1`); otherwise `null`. `prepare` output on release: `{ released: true, version, bump, prs: number[] }` (`prs` = the listed numbers, ascending).

- [ ] **Step 1: Write the failing tests**

```ts
describe("release.mjs prepare — a release", () => {
  it("computes the next version from the prefixes", () => {
    expect(nextVersion("0.3.0", ["docs", "feat", "fix"])).toEqual({ version: "0.4.0", bump: "minor" });
    expect(nextVersion("0.3.2", ["feat"])).toEqual({ version: "0.4.0", bump: "minor" });
    expect(nextVersion("0.3.0", ["fix", "chore"])).toEqual({ version: "0.3.1", bump: "patch" });
    expect(nextVersion("1.2.3", ["fix"])).toEqual({ version: "1.2.4", bump: "patch" });
    expect(nextVersion("0.3.0", ["docs"])).toBeNull();
  });
  it("writes the four files for a feat pull request", () => {
    const repo = releaseRepo();
    const a = commit(repo, "a"); const b = commit(repo, "b"); const c = commit(repo, "c");
    const prs = [pr(7, "Fix a thing", "fix/thing", b), pr(5, "  Add a thing ", "feat/thing", a), pr(8, "Docs", "docs/x", c)];
    const r = release(["prepare", "--repo", repo, "--prs", prsFile(prs)]);
    expect(r.status).toBe(0);
    expect(r.out).toEqual({ released: true, version: "0.4.0", bump: "minor", prs: [5, 7] });
    expect(read(repo, "CHANGELOG.md")).toBe(
      "# Changelog\n\nintro\n\n## Unreleased\n\n## 0.4.0\n\n- Add a thing (#5)\n- Fix a thing (#7)\n\n## 0.3.0\n\n- three\n",
    );
    for (const f of [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", ".hitl/manifest.json"]) {
      expect(read(repo, f)).toBe(readAt(repo, "HEAD", f).replace('"version": "0.3.0"', '"version": "0.4.0"'));
    }
  });
  it("cuts a patch when only fix pull requests are unreleased", () => {
    const repo = releaseRepo();
    const r = release(["prepare", "--repo", repo, "--prs", prsFile([pr(9, "Fix", "fix/x", commit(repo, "x"))])]);
    expect(r.out).toMatchObject({ released: true, version: "0.3.1", bump: "patch" });
  });
  it("carries the text under Unreleased into the new section and empties Unreleased", () => {
    const repo = releaseRepo({ changelog: "# Changelog\n\n## Unreleased\n\n- by hand\n\n## 0.3.0\n\n- three" });
    release(["prepare", "--repo", repo, "--prs", prsFile([pr(5, "Add", "feat/x", commit(repo, "x"))])]);
    expect(read(repo, "CHANGELOG.md")).toBe(
      "# Changelog\n\n## Unreleased\n\n## 0.4.0\n\n- by hand\n\n- Add (#5)\n\n## 0.3.0\n\n- three\n",
    );
  });
});
```

`read(repo, path)` reads the working file; `readAt(repo, ref, path)` is `git show <ref>:<path>`. Both are local helpers.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test release-prepare`
Expected: FAIL — `nextVersion` is not exported; `released` is `false`.

- [ ] **Step 3: Implement `nextVersion` and the writes**

`CHANGELOG.md`: everything up to and including the `## Unreleased` heading line is kept; then a blank line, `## <next>`, a blank line, the old Unreleased body trimmed (followed by a blank line when not empty), one `- <title trimmed> (#<number>)` line per unreleased `feat`/`fix` pull request in ascending number order, a blank line, then the rest of the file from the first released heading on, unchanged, ending with exactly one newline. The three JSON files: replace the single `"version": "<current>"` occurrence.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test release-prepare`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/release.mjs scripts/__tests__/release-prepare.test.ts
git commit -m "feat(release): prepare raises the version and writes the changelog section from pull request titles"
```

### Task 3: Refusals and errors

**Files:**
- Modify: `scripts/release.mjs`
- Test: `scripts/__tests__/release-prepare.test.ts`

**Interfaces:**
- Produces: on refusal, code `3` and `{ refused: <reason>, … }` with reason one of `versions-disagree` (plus `versions: { plugin, marketplace, manifest }`), `bad-version` (current is not `^\d+\.\d+\.\d+$`), `tag-missing` (plus `tag`), `no-unreleased-section`, `section-exists` (plus `version`), `version-not-found` (plus `file`). On an unreadable or non-JSON `--prs` file: code `2`, `{ error }`.

- [ ] **Step 1: Write the failing tests**

One `it` per reason. Each builds `releaseRepo(...)` with one unreleased `feat/` pull request, breaks one thing, and asserts `status`, `out.refused` and `git status --porcelain` showing only the breakage it made itself (commit the breakage first so the tree is clean, then assert `""`):

```ts
const cases: [string, (repo: string) => void][] = [
  ["versions-disagree", (repo) => commit(repo, "x", { ".hitl/manifest.json": '{\n  "version": "0.2.0"\n}\n' })],
  ["bad-version", (repo) => { /* all three files at "0.3.0-rc.1", tag v0.3.0-rc.1 */ }],
  ["no-unreleased-section", (repo) => commit(repo, "x", { "CHANGELOG.md": "# Changelog\n\n## 0.3.0\n\n- three\n" })],
  ["section-exists", (repo) => commit(repo, "x", { "CHANGELOG.md": "# Changelog\n\n## Unreleased\n\n## 0.4.0\n\n- early\n\n## 0.3.0\n\n- three\n" })],
  ["version-not-found", (repo) => commit(repo, "x", { ".claude-plugin/plugin.json": '{\n  "version": "0.3.0",\n  "x": { "version": "0.3.0" }\n}\n' })],
];
```

plus:

```ts
it("refuses while the current version has no tag", () => {
  const repo = releaseRepo({ tag: false });
  const r = release(["prepare", "--repo", repo, "--prs", prsFile([pr(5, "Add", "feat/x", commit(repo, "x"))])]);
  expect(r.status).toBe(3);
  expect(r.out).toEqual({ refused: "tag-missing", tag: "v0.3.0" });
  expect(git(repo, "status", "--porcelain")).toBe("");
});
it("exits 2 when the pull request file is missing or not JSON", () => {
  const repo = releaseRepo();
  expect(release(["prepare", "--repo", repo, "--prs", "/nonexistent.json"]).status).toBe(2);
  const bad = join(mkdtempSync(join(tmpdir(), "hitl-prs-")), "prs.json");
  writeFileSync(bad, "not json");
  expect(release(["prepare", "--repo", repo, "--prs", bad]).status).toBe(2);
});
```

The `tag-missing`, `versions-disagree` and `bad-version` checks run before the pull requests are read, so they refuse even when nothing would be released; `section-exists` and `version-not-found` only when a release is due.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test release-prepare`
Expected: FAIL — the script releases or throws instead of refusing.

- [ ] **Step 3: Implement the checks, all before the first write**

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test release-prepare`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/release.mjs scripts/__tests__/release-prepare.test.ts
git commit -m "feat(release): prepare refuses an untagged, inconsistent or already-written release"
```

### Task 4: `prepare` keeps this repository's own invariants

**Files:**
- Test: `scripts/__tests__/release-prepare.test.ts`
- Modify: `scripts/release.mjs` only if the test finds a defect

**Interfaces:**
- Consumes: `changelogSections`, `compareVersions`, `pluginVersion` from `installer/lib.mjs`; `prettier` (already a dev dependency).

- [ ] **Step 1: Write the test**

```ts
it("on a copy of this repository's own four files, keeps what the changelog and manifest tests assert", async () => {
  const repo = mkdtempSync(join(tmpdir(), "hitl-self-"));
  // copy CHANGELOG.md, .claude-plugin/plugin.json, .claude-plugin/marketplace.json, .hitl/manifest.json
  // from process.cwd(); git init -b main; commit; tag v<pluginVersion(process.cwd())>
  const sha = commit(repo, "feature");
  const before = pluginVersion(repo);
  const r = release(["prepare", "--repo", repo, "--prs", prsFile([pr(1, "A feature", "feat/x", sha)])]);
  expect(r.out.released).toBe(true);
  const sections = changelogSections(read(repo, "CHANGELOG.md"));
  expect(sections[0]).toEqual({ version: "Unreleased", text: "" });
  const versions = sections.slice(1).map((s) => s.version);
  for (let i = 1; i < versions.length; i++) expect(compareVersions(versions[i - 1], versions[i])).toBe(1);
  expect(versions[0]).toBe(r.out.version);
  expect(compareVersions(r.out.version, before)).toBe(1);
  expect(pluginVersion(repo)).toBe(r.out.version);
  expect(JSON.parse(read(repo, ".claude-plugin/marketplace.json")).plugins[0].version).toBe(r.out.version);
  expect(JSON.parse(read(repo, ".hitl/manifest.json")).version).toBe(r.out.version);
  // every section released before keeps its exact text
  const old = changelogSections(readFileSync(join(process.cwd(), "CHANGELOG.md"), "utf8")).slice(1);
  for (const s of old) expect(sections.find((x) => x.version === s.version)?.text).toBe(s.text);
  for (const f of [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", ".hitl/manifest.json"]) {
    const options = await prettier.resolveConfig(join(process.cwd(), f));
    expect(await prettier.check(read(repo, f), { ...options, filepath: f }), f).toBe(true);
  }
});
```

- [ ] **Step 2: Run it**

Run: `pnpm test release-prepare`
Expected: PASS. If it fails, the defect is in `scripts/release.mjs`: fix it there, never in this repository's four files.

- [ ] **Step 3: Run both gates**

Run: `pnpm test && pnpm format:check`
Expected: both pass. Run `pnpm format` first if Prettier reports the new files.

- [ ] **Step 4: Commit**

```bash
git add scripts/release.mjs scripts/__tests__/release-prepare.test.ts
git commit -m "test(release): prepare keeps this repository's changelog, version and formatting invariants"
```

### Task 5: The `release-prepare` workflow and the Releasing section

**Files:**
- Create: `.github/workflows/release-prepare.yml`
- Modify: `AGENTS.md` (the **Releasing.** paragraph, lines 50–54)

No test: workflow YAML is validated by the human watching the first run; `AGENTS.md` is prose.

- [ ] **Step 1: Write the workflow**

Pin each action to its newest major (`gh api repos/<owner>/<action>/releases/latest --jq .tag_name` for `actions/checkout`, `actions/setup-node`, `pnpm/action-setup`).

```yaml
name: release-prepare

# The chores of a release. On every push to main: decide from the merged pull requests
# whether a release is due (scripts/release.mjs prepare) and, if so, run the gates and
# commit the version bump and the changelog section. release-publish tags it afterwards.

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: release-prepare
  cancel-in-progress: false

permissions:
  contents: write
  pull-requests: read

defaults:
  run:
    shell: bash

jobs:
  prepare:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<major>
        with:
          ref: main
          fetch-depth: 0
      - uses: actions/setup-node@<major>
        with:
          node-version-file: .nvmrc
      - name: Identify as the Actions bot
        run: |
          git config --global user.name "github-actions[bot]"
          git config --global user.email "41898282+github-actions[bot]@users.noreply.github.com"
      - name: List merged pull requests
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh pr list --state merged --base main --limit 100 --search "sort:updated-desc" \
            --json number,title,headRefName,mergeCommit > "$RUNNER_TEMP/prs.json"
      - name: Prepare the release
        id: prepare
        run: |
          node scripts/release.mjs prepare --repo . --prs "$RUNNER_TEMP/prs.json" | tee "$RUNNER_TEMP/prepare.json"
          echo "released=$(jq -r .released "$RUNNER_TEMP/prepare.json")" >> "$GITHUB_OUTPUT"
          echo "version=$(jq -r '.version // empty' "$RUNNER_TEMP/prepare.json")" >> "$GITHUB_OUTPUT"
      - uses: pnpm/action-setup@<major>
        if: steps.prepare.outputs.released == 'true'
      - name: Run the gates
        if: steps.prepare.outputs.released == 'true'
        run: |
          pnpm install --frozen-lockfile
          pnpm test
          pnpm format:check
      - name: Commit and push the release
        if: steps.prepare.outputs.released == 'true'
        env:
          VERSION: ${{ steps.prepare.outputs.version }}
        run: |
          git add CHANGELOG.md .claude-plugin/plugin.json .claude-plugin/marketplace.json .hitl/manifest.json
          git commit -m "chore(release): $VERSION"
          git push origin HEAD:main
```

`--search "sort:updated-desc"` lists the most recently updated pull requests first, so the window holds the most recently *merged* ones, not the most recently created (forwarded from the spec review).

- [ ] **Step 2: Replace the Releasing paragraph in `AGENTS.md`**

```markdown
**Releasing.** Releases are automatic; never raise a version by hand below 1.0. On every push
to `main`, `release-prepare` (`.github/workflows/`, `scripts/release.mjs prepare`) looks at the
pull requests merged into `main` since the tag of the current version. The head branch prefix
decides: any `feat/` branch → a minor release, only `fix/` branches → a patch, anything else
(`docs/`, `chore/`) → no release. It then raises `version` in `.claude-plugin/plugin.json`,
`.claude-plugin/marketplace.json` and `.hitl/manifest.json`, writes a `## <version>` section
into `CHANGELOG.md` and commits `chore(release): <version>`.

- **The pull request title is the release note.** `/hitl:diff` prints it to every installed
  repository, so the title of a pull request into `main` says, in plain words, what changes
  for a user.
- `## Unreleased` in `CHANGELOG.md` is optional: text written there by hand (an upgrade
  instruction a title cannot carry) is moved into the next release's section. It never
  causes a release.
- Merge the wipe pull request and the pull request into `main` with a merge commit, never
  squashed or rebased: the wipe commit carries `[skip ci]`, and a push whose head commit
  carries it starts no release run. If a release was skipped, start `release-prepare` from
  the Actions tab.
```

- [ ] **Step 3: Run both gates**

Run: `pnpm test && pnpm format:check`
Expected: both pass (`pnpm format` if Prettier reports the YAML).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release-prepare.yml AGENTS.md
git commit -m "feat(release): release-prepare commits a release on every push to main that carries one"
```
