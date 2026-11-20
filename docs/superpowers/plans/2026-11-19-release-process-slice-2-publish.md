# Automatic releases, slice 2: publish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Reviewed:** round 1 (2026-11-19) · round 2 (2026-11-19).

**Owns:** a released version on `main` gets its tag `v<version>` and its GitHub Release, retryable on its own, and users are told how to receive it.

**Goal:** `scripts/release.mjs target` and `notes` answer "which commit gets the tag" and "what are this version's notes"; `release-publish.yml` uses them to create the tag and the GitHub Release after every `release-prepare` run, then restarts `release-prepare` once when it created a tag.

**Architecture:** Two more commands in slice 1's `scripts/release.mjs`, same CLI shape. The workflow holds no decision logic beyond "is the tag missing" and "is the Release missing".

**Tech Stack:** Node 24 (ES modules, no new dependencies), vitest, GitHub Actions, `gh`.

**Spec:** `docs/superpowers/specs/2026-11-19-release-process-design.md`

## Global Constraints

- TDD per `.hitl/HITL.md`: one failing test → minimal code → pass → commit. Tests live in `scripts/__tests__/`, use temporary directories, never `docs/superpowers/`.
- Local gates before the PR opens: `pnpm test` and `pnpm format:check`.
- Workflow YAML is validated by a human watching it run; write no test for it.
- No new dependency. Reuse `parseArgs`, `emit`, `changelogSections` from `installer/lib.mjs`.
- Exit codes as in `installer/`: `0` ok · `1` usage · `2` error · `3` refused.
- The workflow uses only `GITHUB_TOKEN`; no other secret.
- `release-publish` never tags a version other than the one `.claude-plugin/plugin.json` holds on `main`.
- Commit messages follow the repository's style and end with the attribution line the session gives.

## Review Focus

- A version that was set, moved away from and set again (a revert): `target` prints the oldest commit holding it, so a tag never moves forward (Task 1 test).
- A version raised by hand with no `## <version>` section (the by-hand major done wrong): `notes` refuses, the Release step fails red, the tag is still created — the red run is the signal (Task 2 test for the refusal; the workflow order is in Task 3).
- A `## <version>` section with an empty body: `notes` refuses rather than creating a Release with no notes (Task 2 test).
- A commit in history where `plugin.json` does not exist or is not JSON (before the plugin existed): `target` skips it instead of failing (Task 1 test).
- A tag that exists on the remote but not in the checkout, or the reverse: the workflow asks the remote (`git ls-remote`), never the local clone (Task 3, no test — YAML).

---

### Task 1: `target` — the commit a version's tag belongs on

**Files:**
- Modify: `scripts/release.mjs`
- Test: `scripts/__tests__/release-publish.test.ts`

**Interfaces:**
- Consumes: slice 1's `scripts/__tests__/helpers/release-repo.ts` — `releaseRepo(opts?)`, `commit(repo, message, files?)`, `release(args)`, `git(repo, ...args)`; slice 1's `run(command, args)` dispatch in `scripts/release.mjs`.
- Produces: `node scripts/release.mjs target --repo <dir> --version <x.y.z>` → code `0`, `{ version, commit: <full sha> }`; code `3`, `{ refused: "version-not-on-main", version }` when no first-parent commit holds it.

- [ ] **Step 1: Write the failing tests**

```ts
const plugin = (v: string) => ({ ".claude-plugin/plugin.json": `{\n  "name": "hitl",\n  "version": "${v}"\n}\n` });

describe("release.mjs target", () => {
  it("prints the commit that set the version, not a later one", () => {
    const repo = releaseRepo();
    commit(repo, "unrelated");
    const set = commit(repo, "chore(release): 0.4.0", plugin("0.4.0"));
    commit(repo, "later", { "README.md": "x\n" });
    commit(repo, "edits plugin.json without changing the version", {
      ".claude-plugin/plugin.json": '{\n  "name": "hitl",\n  "description": "d",\n  "version": "0.4.0"\n}\n',
    });
    expect(release(["target", "--repo", repo, "--version", "0.4.0"])).toEqual({
      status: 0,
      out: { version: "0.4.0", commit: set },
    });
  });
  it("prints the merge commit when the version arrived through a merged branch", () => {
    const repo = releaseRepo();
    git(repo, "checkout", "-q", "-b", "chore/release");
    commit(repo, "raise", plugin("1.0.0"));
    git(repo, "checkout", "-q", "main");
    git(repo, "merge", "-q", "--no-ff", "-m", "Merge chore/release", "chore/release");
    const merge = git(repo, "rev-parse", "HEAD");
    expect(release(["target", "--repo", repo, "--version", "1.0.0"]).out.commit).toBe(merge);
  });
  it("prints the oldest commit when a version was set twice", () => {
    const repo = releaseRepo();
    const first = commit(repo, "set", plugin("0.4.0"));
    commit(repo, "revert", plugin("0.3.0"));
    commit(repo, "set again", plugin("0.4.0"));
    expect(release(["target", "--repo", repo, "--version", "0.4.0"]).out.commit).toBe(first);
  });
  it("skips commits where plugin.json is missing or not JSON", () => {
    const repo = releaseRepo();
    commit(repo, "broken", { ".claude-plugin/plugin.json": "not json" });
    const set = commit(repo, "set", plugin("0.4.0"));
    expect(release(["target", "--repo", repo, "--version", "0.4.0"]).out.commit).toBe(set);
  });
  it("refuses a version no commit on main holds", () => {
    const repo = releaseRepo();
    expect(release(["target", "--repo", repo, "--version", "9.9.9"])).toEqual({
      status: 3,
      out: { refused: "version-not-on-main", version: "9.9.9" },
    });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test release-publish`
Expected: FAIL — `target` is an unknown command (status `1`).

- [ ] **Step 3: Implement `target`**

Walk `git -C <repo> log --first-parent --reverse --format=%H -- .claude-plugin/plugin.json` (the first-parent commits of `HEAD` that changed the file, oldest first; a merge is compared with its first parent, so a merged branch shows as its merge commit). Print the first commit whose `git show <sha>:.claude-plugin/plugin.json` parses and has `version` equal to the argument.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test release-publish`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/release.mjs scripts/__tests__/release-publish.test.ts
git commit -m "feat(release): target names the commit a version's tag belongs on"
```

### Task 2: `notes` — a version's release notes

**Files:**
- Modify: `scripts/release.mjs`
- Test: `scripts/__tests__/release-publish.test.ts`

**Interfaces:**
- Produces: `node scripts/release.mjs notes --repo <dir> --version <x.y.z>` → code `0`, `{ version, notes: <section body, trimmed> }`; code `3`, `{ refused: "no-notes", version }` when `CHANGELOG.md` is missing, has no `## <version>` section, or the section body is empty.

- [ ] **Step 1: Write the failing tests**

```ts
describe("release.mjs notes", () => {
  const changelog = "# Changelog\n\n## Unreleased\n\n- later\n\n## 0.4.0\n\n- by hand\n\n- Add (#5)\n\n## 0.3.5\n\n## 0.3.0\n\n- three\n";
  it("prints the section body of the version", () => {
    const repo = releaseRepo({ changelog });
    expect(release(["notes", "--repo", repo, "--version", "0.4.0"])).toEqual({
      status: 0,
      out: { version: "0.4.0", notes: "- by hand\n\n- Add (#5)" },
    });
  });
  it("refuses a version with no section, an empty section, or no changelog", () => {
    const repo = releaseRepo({ changelog });
    for (const v of ["0.5.0", "0.3.5", "Unreleased"]) {
      const r = release(["notes", "--repo", repo, "--version", v]);
      expect(r.status, v).toBe(3);
      expect(r.out.refused, v).toBe("no-notes");
    }
    rmSync(join(repo, "CHANGELOG.md"));
    expect(release(["notes", "--repo", repo, "--version", "0.4.0"]).status).toBe(3);
  });
});
```

`Unreleased` is refused because `--version` must match `^\d+\.\d+\.\d+$`; treat any other value as `no-notes`.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test release-publish`
Expected: FAIL — `notes` is an unknown command.

- [ ] **Step 3: Implement `notes` with `changelogSections`**

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test release-publish`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/release.mjs scripts/__tests__/release-publish.test.ts
git commit -m "feat(release): notes prints a version's changelog section"
```

### Task 3: The `release-publish` workflow and the documentation

**Files:**
- Create: `.github/workflows/release-publish.yml`
- Modify: `AGENTS.md` (the **Releasing.** section slice 1 wrote — append)
- Modify: `README.md` (the existing "## Make it yours, keep it current" section)

No test: workflow YAML is validated by the human watching it run; the rest is prose.

- [ ] **Step 1: Write the workflow**

Pin each action to its newest major, as slice 1 did.

```yaml
name: release-publish

# The release itself. After every release-prepare run (and on demand, as the retry): if the
# version on main has no tag, tag the commit that set it; if it has no GitHub Release,
# create one from its changelog section. Does nothing when both exist.

on:
  workflow_run:
    workflows: [release-prepare]
    types: [completed]
  workflow_dispatch:

concurrency:
  group: release-publish
  cancel-in-progress: false

permissions:
  contents: write
  actions: write

defaults:
  run:
    shell: bash

jobs:
  publish:
    runs-on: ubuntu-latest
    env:
      GH_TOKEN: ${{ github.token }}
    steps:
      - uses: actions/checkout@<major>
        with:
          ref: main
          fetch-depth: 0
      - uses: actions/setup-node@<major>
        with:
          node-version-file: .nvmrc
      - name: Read the version on main
        id: version
        run: echo "version=$(jq -r .version .claude-plugin/plugin.json)" >> "$GITHUB_OUTPUT"
      - name: Tag the version if it has no tag
        id: tag
        env:
          VERSION: ${{ steps.version.outputs.version }}
        run: |
          if git ls-remote --exit-code --tags origin "refs/tags/v$VERSION" >/dev/null; then
            echo "created=false" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          commit=$(node scripts/release.mjs target --repo . --version "$VERSION" | jq -r .commit)
          git tag "v$VERSION" "$commit"
          git push origin "refs/tags/v$VERSION"
          echo "created=true" >> "$GITHUB_OUTPUT"
      - name: Create the GitHub Release if it is missing
        env:
          VERSION: ${{ steps.version.outputs.version }}
        run: |
          if gh release view "v$VERSION" >/dev/null 2>&1; then exit 0; fi
          node scripts/release.mjs notes --repo . --version "$VERSION" | jq -r .notes > "$RUNNER_TEMP/notes.md"
          gh release create "v$VERSION" --title "v$VERSION" --notes-file "$RUNNER_TEMP/notes.md" --verify-tag
      - name: Catch up pull requests merged while this version had no tag
        if: ${{ !cancelled() && steps.tag.outputs.created == 'true' }}
        run: gh workflow run release-prepare.yml --ref main
```

`target` and `notes` exit non-zero on a refusal; with `shell: bash` the step runs under `set -eo pipefail`, so the pipe into `jq` fails the step and nothing is tagged or released from a refusal. The catch-up runs whenever this run created the tag — also when the Release step after it failed (`!cancelled()`), because a retry would find the tag present and never catch up — and only then, so the two workflows cannot loop: a `release-prepare` that releases nothing leads to a `release-publish` that creates nothing.

- [ ] **Step 2: Append to the Releasing section of `AGENTS.md`**

```markdown
- `release-publish` runs after every `release-prepare`: it tags `v<version>` on the commit
  that set the version (`scripts/release.mjs target`) and creates the GitHub Release from
  that version's changelog section (`scripts/release.mjs notes`). `/hitl:diff` needs the
  tag: it reads the marketplace at `v<recorded version>` and refuses without it.
- **A failed publish:** start `release-publish` from the Actions tab. It creates whichever
  of the tag and the Release is missing and, if it created the tag, starts `release-prepare`
  itself. Until the
  version is tagged, `release-prepare` refuses (`tag-missing`) and its runs are red.
- **A major version** is raised by hand, in a pull request that changes the three version
  files and adds the `## <version>` section; `release-publish` tags it when it merges.
```

- [ ] **Step 3: Say in `README.md` how a new version arrives**

Read `commands/help.md` for the update commands it prints and re-check the Claude Code documentation (`code.claude.com/docs/en/plugins/install.md`, "Keep plugins updated") before writing; use the same commands `/hitl:help` prints. The README already has "## Make it yours, keep it current", which covers `/hitl:diff` and `/hitl:help`: add to that section, before its `/hitl:diff` part, rather than opening a second one. Content, in the README's own voice:

- Every feature or fix merged here is released automatically; a new version exists within minutes of the merge.
- Claude Code does not update plugins from this marketplace by itself by default. To turn that on once: `/plugin` → **Marketplaces** → `hitl` → enable auto-update. Claude Code then updates shortly after a session starts.
- By hand: the commands `/hitl:help` prints, then a new session or `/reload-plugins`.
- In a repository where hitl is installed, `/hitl:diff` then shows what changed, with each version's notes.

- [ ] **Step 4: Run both gates**

Run: `pnpm test && pnpm format:check`
Expected: both pass (`pnpm format` if Prettier reports the YAML).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release-publish.yml AGENTS.md README.md
git commit -m "feat(release): release-publish tags a released version and creates its GitHub Release"
```

## After the stack merges (for the human, not a task)

From the spec's Rollout, in order:

1. Before the pull request into `main` merges: tag `v0.3.0` at `94c5a4f` and push the tag.
2. Merge the wipe pull request and the pull request into `main` with merge commits.
3. Watch `release-prepare` release 0.4.0 and `release-publish` tag it.
4. Start `release-publish` once from the Actions tab and watch it do nothing.
