---
description: Install the hitl workflow into this repository — discover what the tree has, ask one question per finding, render from the plugin's templates. Usage: /hitl:init
---

You are installing the hitl delivery workflow into the repository at the current working
directory. The plugin ships no runtime: after this command the repository owns every file
written and changes it by pull request. You orchestrate and ask; the scripts read and write.

## 1. Prerequisites — stop on the first one missing

Check, in one batch:

```bash
node --version            # 20 or newer
git --version
gh auth status            # authenticated
```

and that superpowers is enabled: `enabledPlugins` in `~/.claude/settings.json` or in this
repository's `.claude/settings.json` contains a key starting with `superpowers@`. If it does
not, stop and print exactly:

```
hitl needs the superpowers plugin (its brainstorming and writing-plans skills shape the
artefacts this workflow reviews). Install it, then re-run /hitl:init:
  claude plugin marketplace add obra/superpowers-marketplace
  claude plugin install superpowers@superpowers-marketplace
```

For `node`, `git` or `gh` missing, stop and name the one to install.

## 2. Refuse early, then discover

```bash
node "${CLAUDE_PLUGIN_ROOT}/installer/render.mjs" --repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}" --mode check
```

- exit `3`, `refused: "unknown-ci"` → "the answers named ci `<ci>`, which must be one of
  <allowed>; this is an init error, not the repository's. Nothing was written." Stop. (Only
  step 4 can hit this: the check runs without answers.)
- exit `3`, `refused: "manifest-present"` → "hitl is already initialised at <version>; run
  `/hitl:diff` to see what changed upstream." Stop.
- exit `3`, `refused: "collision"` → list every path, then: "These files are owned by hitl and
  already exist. If this repository was ejected from an earlier hitl or from treasury-2, run
  `/hitl:init --adopt` (available in a later version). Otherwise remove them and re-run.
  Nothing was written." Stop.
- exit `3`, `refused: "settings-unparsable"` → print the error and "fix
  `.claude/settings.json` and re-run; nothing was written." Stop.
- exit `0` → continue.

```bash
node "${CLAUDE_PLUGIN_ROOT}/installer/discover.mjs" --repo "$PWD"
```

Read the report. If `host` is not `github`: stop with "no backend for <host> in v1" — and,
when `host` is `unknown`, add "the origin remote could not be read" (or, when `remote` is
non-null, name the host in the url). Nothing else is written or asked.

## 3. Interview — one question per finding, one message each, with a recommendation

Ask in this order. A finding with nothing behind it is reported in one line and skipped;
say so before moving on. Collect the answers as you go.

| finding in the report | ask | on yes |
|---|---|---|
| `ci` contains `github-actions` | "I found GitHub Actions under `.github/workflows/`. Install the wipe job that removes `docs/superpowers/` from `main` after a feature merges? (recommended: yes — specs and plans are transient)" | `ci = "github-actions"` |
| `ci` is non-empty | "Adopt the CI rule — one terminal check, a red run is read not re-run, a flaky test is a red job? (recommended: yes)" | `testing += "ci"` |
| `ci` is non-empty and lacks `github-actions` | say: "skipped: no wipe wrapper for <ci> in v1; specs are deleted by hand after merge" | `ci = "none"` |
| `ci` is empty | say: "skipped: no CI system found; specs are deleted by hand after merge" | `ci = "none"` |
| `e2e` is non-empty | "I found <playwright / cypress / an `e2e/` directory>. Adopt the e2e rule — a user-visible bug ships a reproduces-then-proves-fixed e2e, a feature's critical path gets one, in the slice that first makes it exercisable? (recommended: yes)" | `testing += "e2e"` |
| `e2e` is empty | say: "skipped: no e2e harness found" | — |
| `testRunner` is true | "Adopt test tiers — `unit > component > e2e`, the plan names the tests before implementation? (recommended: yes)" | `testing += "tiers"` |
| `hooks` is non-empty | "I found <lefthook / husky / pre-commit>. Adopt the commit-hook rule — never `--no-verify`, formatting is never a review turn? (recommended: yes)" | `testing += "hooks"` |
| `hooks` is empty | say: "skipped: no commit-hook config found" | — |
| always | "Does this repository have code that new rules must not apply to retroactively? If yes, hitl adds an effective-date regime: a new rule applies to a pilot area and to what a slice touches, grandfathered code is never a finding. (recommended: yes for a repository older than a few months)" | `testing += "effective-date"` |
| `scripts` is non-empty | "Local gates — the commands the implementer and fixer run before reporting done. I found these scripts: <list>. Recommended: <the ones named `test`, `lint`, `typecheck`, `format:check` or `check`, as `<pkg manager> <name>`>. Confirm, or give the list." | `gates = [...]` |
| `scripts` is empty | "No package scripts found. Type the local gate commands, one per line, or say 'none yet'." | `gates = [...]` or `[]` |
| `testRunner` is false | say: "skipped: no test runner found; the TDD rule's first-task harness applies" | — |

Pilot areas are asked (the effective-date question), never discovered. Nothing else is
asked. The package manager for the recommendation is `pnpm` when `pnpm-lock.yaml` exists,
`yarn` when `yarn.lock` exists, otherwise `npm run`.

A "no" to the wipe-job question sets `ci = "none"`.

When `existing["AGENTS.md"]` is true, read `AGENTS.md` before the local-gates question. If it
has a `## Local gates` heading outside `<!-- hitl:start -->`…`<!-- hitl:end -->`, say with that
question: "`AGENTS.md` already has its own `## Local gates`: <its commands>. hitl appends its
block below it and does not touch yours, so the file will hold two lists the implementer and
fixer may read differently. Reconcile them after init — keep the list inside the hitl block
and delete the other." Never edit the repository's section yourself.

## 4. Render

```bash
ANSWERS=$(mktemp)
cat > "$ANSWERS" <<EOF
{ "provider": "github", "ci": "<github-actions|none>", "testing": [<chosen ids, quoted>], "gates": [<commands, quoted>] }
EOF
node "${CLAUDE_PLUGIN_ROOT}/installer/render.mjs" --repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}" --answers "$ANSWERS"
```

Exit `3` is relayed exactly as in step 2 (a collision can appear between the check and the
write if the human created a file meanwhile). Exit `2` with a `wrote` list means a write
failed midway. Print the error, then say "init is not transactional", and:

- list the files in `wrote` and say "remove these files, and `.claude/hitl.json` if it
  exists, then re-run" — these are the only files to remove;
- list the files in `appended` (if any) and say "a hitl block was added to these files;
  leave them as they are — a re-run sees the block and skips them";
- if `settings` is `"added"`, say "the Stop hook was added to `.claude/settings.json`;
  leave it — a re-run sees it and skips it".

Stop. Exit `1` or `2` otherwise: print the output verbatim and stop. Exit `0`: continue.

## 5. Report

In plain words: the count and list of files written; the appended files (`CLAUDE.md`,
`README.md`, `.gitignore`, `AGENTS.md`; say "created" for one that did not exist) and the
ones left alone because their block was already there; the repository's own files found
beside hitl's under `.claude/` and left alone (`foreign`), if any; whether the Stop hook was
added to `.claude/settings.json` or already present; the `## Testing and gates` rules adopted
and the ones skipped, one line each; the local gates written to `AGENTS.md`; the manifest
path `.claude/hitl.json`; and, when step 3 found a `## Local gates` of the repository's own in
`AGENTS.md`, the reminder to reconcile the two lists. End with:

> Review the changes and open a pull request. From now on `.claude/` and `HITL.md` are
> reviewed like code. Nothing was committed.

Never commit. Never open a PR.
