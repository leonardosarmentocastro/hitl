---
description: Show what changed upstream in hitl since this repository's recorded version, per owned file; --apply writes it and opens the upgrade PR. Usage: /hitl:diff [--apply]
argument-hint: [--apply]
---

You compare this repository's hitl install with the plugin's current templates. `diff.mjs`
does every comparison and, with `--apply`, every file write; you do the git steps.

## 1. Run the report

```bash
MK="$HOME/.claude/plugins/marketplaces/hitl"
node "${CLAUDE_PLUGIN_ROOT}/installer/diff.mjs" --repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}" --marketplace "$MK"
```

- exit `3`, `refused: "no-manifest"` → "no `.hitl/manifest.json`; run `/hitl:init` or
  `/hitl:init --adopt`." Stop.
- exit `3`, `refused: "tag-missing"` → "the marketplace clone has no tag <tag>; run
  `claude plugin marketplace update hitl` and retry." Stop.
- exit `3`, `refused: "manifest-mismatch"` → "the manifest and the templates disagree for
  <paths>; delete `<manifestPath>` and re-run `/hitl:init --adopt`." Stop.
- exit `3`, `refused: "unowned-path"` → "the manifest lists <paths>, which hitl <recorded>
  never installed; nothing was deleted. Remove those keys from `<manifestPath>` (or delete
  it and re-run `/hitl:init --adopt`) and retry." Stop.
- exit `3`, `refused: "move-collision"` → "both <from> and <to> exist and differ; hitl will
  not choose. Keep the one you want at <to>, delete the other, and retry." (`paths` holds
  `[<from>, <to>]`.) Stop.
- exit `3`, `refused: "ahead"` → "the install is at <recorded>, newer than the plugin at
  <plugin>; update the plugin: `claude plugin marketplace update hitl` then
  `claude plugin update hitl`."
  Stop.
- exit `0` → print one table, `path · state · note`, where the note is `merged: clean`,
  `merged: conflict`, or `local: same|edited|absent` when present, and also `moved from <from>`
  when the entry has `movedFrom`. Then one line:
  "recorded <recorded> · latest <latest> · <n> to apply", counting every file whose state is
  `upstream changed`, `both`, `missing locally`, `new upstream`, or `removed upstream` with
  `local: same`; every entry with `movedFrom`, whatever its state (the move itself is a
  change); and each path in `leftovers` (an earlier install record an apply that stopped
  part-way left behind, which `--apply` removes).

  After that line, and again after an `--apply` run's report, add these in plain words:
  - when any entry has `movedFrom`: "hitl's files now live in `.hitl/`. Everyone working on this repository must update the hitl plugin to 0.3.0 or newer; an older plugin no longer recognises this repository as installed."
  - after an `--apply` run, when `claudeLine` is `absent`: "`CLAUDE.md` has no `@HITL.md` line, so nothing there was changed; if the doctrine should load, add `@.hitl/HITL.md`."
  - when `.github/workflows/wipe-superpowers-docs.yml` or
    `scripts/hitl/wipe-superpowers-docs.sh` is `removed upstream`: begin with "The CI wipe
    job is gone: " only if the workflow path is among them (a repository that never had the
    job loses only the script), then, in both cases: "A feature's documents now leave through
    a generated wipe PR, merged last. If a stack is in flight, bring the upgraded base branch
    into its feature branch first, then re-run `/umbrella-pr` there — it builds the wipe PR.
    Branches cut before this upgrade still carry the old command and would build nothing."
  - when `keptRemoved` is not empty: name each kept file, and say "hitl no longer ships
    these. You edited them, so they were kept; delete them by hand once you no longer need
    them." Only if `.github/workflows/wipe-superpowers-docs.yml` or
    `scripts/hitl/wipe-superpowers-docs.sh` is among them, add: "Delete the wipe workflow and
    its script together: one without the other is a job that fails on every push."

Without `--apply` in `$ARGUMENTS`, stop here.

## 2. `--apply`

If every file is `unchanged` or `locally edited` (or `already applied`, `removed upstream`
with `local` other than `same`), no entry has `movedFrom`, `leftovers` is empty and the
versions are equal, say "nothing to apply" and stop.

Otherwise, in this order — every file is written before the shim is called, because
`scripts/hitl/pr.sh` may itself be among the files applied:

```bash
FROM=$(git branch --show-current)
BRANCH="chore/hitl-<recorded>-to-<latest>"
git checkout -q -b "$BRANCH"
node "${CLAUDE_PLUGIN_ROOT}/installer/diff.mjs" --repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}" --marketplace "$MK" --apply
```

- exit `2` → the upgrade stopped part-way on `$BRANCH`. Do not stage, commit, push or call the
  shim. Print `error`, `written`, `deleted` and `manifest` (`written` or `untouched`), then
  tell the human, without running any of it yourself: "Every path under `written` was
  overwritten and every path under `deleted` removed; nothing is committed. To undo: save any of those files that held uncommitted edits of yours, then `git restore --source=HEAD --worktree -- <the tracked paths among written and deleted, plus whichever of .hitl/manifest.json, .claude/hitl.json, CLAUDE.md, README.md and .gitignore git tracks>`, delete the paths under `written` and `.hitl/manifest.json` that git does not track, `git checkout <FROM>` and `git branch -D <BRANCH>`. Fix the error and re-run
  `/hitl:diff --apply` — or simply re-run `/hitl:diff --apply`: the move resumes." Stop.
- exit `0` → stage exactly what this apply run reported touching — never the step-1 report's
  whole file list, never `git add -A`: a path the apply did not write (a `locally edited`
  file with the human's uncommitted edits, an absent `removed upstream` file) must not be
  staged, and a pathspec that matches nothing aborts `git add` as a whole.

```bash
git add -- .hitl/manifest.json <every path in the apply output's `written`>
# only when `claudeLine` is `rewritten`:
git add -- CLAUDE.md
# only when `deleted` is non-empty (the files are already gone from the tree; it holds the
# old paths of moved files and the earlier install record too):
git rm -q --cached --ignore-unmatch -- <every path in `deleted`>
# only when `readmeBumped` is true:
git add -- README.md
# only when `gitignoreRefreshed` is true:
git add -- .gitignore
git commit -q -m "chore(hitl): <recorded> → <latest>"
git push -u origin "$BRANCH"
scripts/hitl/pr.sh create --base "$FROM" --head "$BRANCH" --title "hitl <recorded> → <latest>" --body-file <tmp>
```

If the report lists `scripts/hitl/pr.sh` or `scripts/hitl/backend.sh` with
`merged: conflict`, the freshly written shim is not runnable bash: stop after the push, print
the branch name and the PR title and body, and tell the human to resolve the hunks and open
the PR by hand. Do not call the shim.

The PR body (no `Plan:` line — an upgrade has no plan):

```
**What** — hitl <recorded> → <latest>: the workflow files this repository installed from
hitl, brought up to the plugin's current templates.

**Why** — <one or two sentences from the plugin's release notes if present, else "upstream
changed these files since this repository recorded hitl <recorded>".>

**How** — Each owned file was compared three ways (recorded template, this repository,
latest template). Files this repository edited were kept; files both changed were merged.
<when any entry has `movedFrom`:> <step 1's sentence beginning "hitl's files now live in `.hitl/`", verbatim>
<when `claudeLine` is `absent`:> <step 1's sentence about `CLAUDE.md`, verbatim>

| file | state |
|---|---|
<one row per file whose state is not unchanged, and per moved file whatever its state; a moved file's row reads `<to> | <state>, moved from <from>`>
<only when `gitignoreRefreshed` is true:> | .gitignore | hitl block replaced wholesale — lines added inside the hitl markers were dropped |

<if any file has merged: conflict:> **Conflicts to resolve by hand:** <paths>. They carry
`<<<<<<<` / `>>>>>>>` hunks as committed.
```

Report `created: <ref> <url>`, with `<ref>` and `<url>` from the shim's record; the shim's exit
`3` means the PR already exists — report its `ref` instead. Never merge, never mark ready for review.
