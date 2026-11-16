---
description: Install the hitl workflow into this repository — discover what the tree has, ask one question per finding, render from the plugin's templates; --adopt records a manifest for a repository that already carries the files. Usage: /hitl:init [--adopt]
argument-hint: [--adopt]
---

You are installing the hitl delivery workflow into the repository at the current working
directory. The plugin ships no runtime: after this command the repository owns every file
written and changes it by pull request. You orchestrate and ask; the scripts read and write.

## 1. Prerequisites — stop on the first one missing

Check Node first, then read the host, then check by host:

```bash
node --version            # 20 or newer — the installer, and the scripts hitl installs are run with it
node "${CLAUDE_PLUGIN_ROOT}/installer/discover.mjs" --repo "$PWD"   # read `host` and `remote`
git --version
gh auth status            # only when host is github: authenticated
[ -n "$GITLAB_TOKEN" ]    # only when host is gitlab: the token is set (never print its value)
```

A host other than `github` or `gitlab` is not checked here; steps 2 and 3 of `--adopt` and
§ 2 refuse it.

and that superpowers is enabled: `enabledPlugins` in `~/.claude/settings.json` or in this
repository's `.claude/settings.json` contains a key starting with `superpowers@`. If it does
not, stop and print exactly:

```
hitl needs the superpowers plugin (its brainstorming and writing-plans skills shape the
artefacts this workflow reviews). Install it, then re-run /hitl:init:
  claude plugin marketplace add obra/superpowers-marketplace
  claude plugin install superpowers@superpowers-marketplace
```

For `node`, `git` or (on GitHub) `gh` missing, stop and name the one to install. On GitLab,
when `GITLAB_TOKEN` is empty, stop and print exactly:

```
hitl needs a GitLab access token with the `api` scope in `GITLAB_TOKEN`. Export it in the
shell that runs Claude Code, then re-run /hitl:init.
```

### Refusing a host without a backend

Used by `--adopt` step 3 and § 2. `host` `github` or `gitlab` → continue with
`provider = <host>`. Any other host → stop with "no backend for <host>: hitl opens PRs on
GitHub and GitLab.", then add one line:

- `host` is `unknown` and `remote` is null → "the origin remote could not be read".
- `host` is `unknown`, `remote` is non-null and `GITLAB_URL` is unset in the environment →
  "If `<hostname of the remote>` is a self-hosted GitLab, export
  `GITLAB_URL=https://<hostname>` and re-run."
- `host` is `unknown`, `remote` is non-null and `GITLAB_URL` is set → say that `GITLAB_URL`
  is set but does not match this remote or is not usable (it needs a scheme such as
  `https://`, and must not end in `/api/v4`), and show its value's hostname next to the
  remote's. Never tell the human to export a variable they already have.

Nothing else is written or asked.

## `--adopt` — stamp a repository that was ejected by hand

If `$ARGUMENTS` contains `--adopt`, this path replaces steps 2 onward:

1. Run the prerequisite check above.
2. `.hitl/manifest.json` present → "hitl is already initialised at <version>; run `/hitl:diff`."
   Stop. (A manifest from the earlier layout is step 4's `old layout` state.)
3. Host only: `node "${CLAUDE_PLUGIN_ROOT}/installer/discover.mjs" --repo "$PWD"`. Apply
   "Refusing a host without a backend" above: `github` or `gitlab` → continue with
   `provider = <host>`; any other host → stop with its message.
4. Before asking anything, run `help.mjs` (`--repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}"`).
   State `not installed` → "nothing to adopt: no hitl-owned file exists. Run `/hitl:init`."
   Stop. State `old layout` → print exactly, and stop:

   ```
   This repository uses an older hitl layout. Run /hitl:diff --apply to upgrade it.
   ```

   Any other state without a manifest → continue. Then ask exactly one thing, with a
   recommendation:
   - `testing`: "Which of the testing rules does this repository's `.hitl/HITL.md` carry under
     `## Testing and gates`: e2e, tiers, ci, hooks, effective-date?" → a list, possibly empty
     (recommend what `.hitl/HITL.md` shows).
5. Write the answers file `{ "provider": "<github|gitlab>", "testing": [...], "gates": [...] }`
   (`provider` from step 3) and run:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/installer/adopt.mjs" --repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}" --answers "$ANSWERS"
   ```

   - exit `3`, `refused: "nothing-to-adopt"` → "nothing to adopt: no hitl-owned file exists.
     Run `/hitl:init`." Stop. (Unreachable after step 4's check; kept as the script's own
     guard.)
   - exit `3`, `refused: "manifest-present"` → with `layout: "old"`, the upgrade message as in
     § 2; otherwise as step 2. Stop.
   - exit `3`, `refused: "unknown-provider"` → "no backend for <provider>". Stop.
   - exit `0` → report: "manifest written to `.hitl/manifest.json` at hitl <version>. It records
     the templates, not this repository's files: run `/hitl:diff` to see the drift." Nothing
     else was touched. Never commit.

## 2. Refuse early, then discover

```bash
node "${CLAUDE_PLUGIN_ROOT}/installer/render.mjs" --repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}" --mode check
```

- exit `3`, `refused: "manifest-present"` → with `layout: "old"`, print exactly, in place of
  the sentence below:

  ```
  This repository uses an older hitl layout. Run /hitl:diff --apply to upgrade it.
  ```

  Otherwise: "hitl is already initialised at <version>; run `/hitl:diff` to see what changed
  upstream." Stop.
- exit `3`, `refused: "collision"` → list every path, then: "These files are owned by hitl and
  already exist. If this repository was ejected from an earlier hitl or from treasury-2, run
  `/hitl:init --adopt`. Otherwise remove them and re-run.
  Nothing was written." When `paths` holds the doctrine at the repository root or the
  reviewer context directly in `.claude/` (the two files' places before 0.3.0), add: "A doctrine or reviewer context from the earlier layout is in the way: `/hitl:init --adopt` moves it." Stop.
- exit `3`, `refused: "settings-unparsable"` → print the error and "fix
  `.claude/settings.json` and re-run; nothing was written." Stop.
- exit `0` → continue.

```bash
node "${CLAUDE_PLUGIN_ROOT}/installer/discover.mjs" --repo "$PWD"
```

Read the report. Apply "Refusing a host without a backend" (§ 1): `host` `github` or
`gitlab` → continue with `provider = <host>`; any other host → stop with its message.
Nothing else is written or asked.

## 3. Interview — one question per finding, one message each, with a recommendation

Ask in this order. A finding with nothing behind it is reported in one line and skipped;
say so before moving on. Collect the answers as you go.

| finding in the report | ask | on yes |
|---|---|---|
| `ci` is non-empty | "Adopt the CI rule — one terminal check, a red run is read not re-run, a flaky test is a red job? (recommended: yes)" | `testing += "ci"` |
| `ci` is empty | say: "skipped: no CI system found" | — |
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
{ "provider": "<github|gitlab>", "testing": [<chosen ids, quoted>], "gates": [<commands, quoted>] }
EOF
node "${CLAUDE_PLUGIN_ROOT}/installer/render.mjs" --repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}" --answers "$ANSWERS"
```

Exit `3`, `refused: "unknown-provider"` → "no backend for <provider>". Stop. Any other exit
`3` is relayed exactly as in step 2 (a collision can appear between the check and the
write if the human created a file meanwhile). Exit `2` with a `wrote` list means a write
failed midway. Print the error, then say "init is not transactional", and:

- list the files in `wrote` and say "remove these files, and `.hitl/manifest.json` if it
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
path `.hitl/manifest.json`; and, when step 3 found a `## Local gates` of the repository's own in
`AGENTS.md`, the reminder to reconcile the two lists; and, after a GitLab render
(`provider` is `gitlab`): "Opening PRs needs `GITLAB_TOKEN` (and `GITLAB_URL` for a
self-hosted GitLab) in every shell that runs the workflow — `/hitl:help` checks them." End
with:

> Review the changes and open a pull request. From now on `.claude/` and `.hitl/` are
> reviewed like code. Nothing was committed.

Never commit. Never open a PR.
