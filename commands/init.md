---
description: Install the hitl workflow into this repository from the plugin's templates. Usage: /hitl:init [--ci github-actions|none]
argument-hint: [--ci github-actions|none]
---

You are installing the hitl delivery workflow into the repository at the current working
directory. The plugin ships no runtime: after this command the repository owns every file
written and changes it by pull request. You orchestrate; `render.mjs` does every write.

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

## 2. Build the answers

This version takes its answers from flags; discovery and the interview arrive in a later
version. `--ci` defaults to `none`.

```bash
ANSWERS=$(mktemp)
cat > "$ANSWERS" <<EOF
{ "provider": "github", "ci": "<github-actions|none from --ci>", "testing": [], "gates": [] }
EOF
```

## 3. Render

```bash
node "${CLAUDE_PLUGIN_ROOT}/installer/render.mjs" --repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}" --answers "$ANSWERS"
```

Read the JSON it prints and act on the exit code:

- `3` with `refused: "manifest-present"` → say "hitl is already initialised at <version>;
  run `/hitl:diff` to see what changed upstream." Stop.
- `3` with `refused: "collision"` → list every path, then: "These files are owned by hitl and
  already exist. If this repository was ejected from an earlier hitl or from treasury-2, run
  `/hitl:init --adopt` (available in a later version). Otherwise remove them and re-run.
  Nothing was written." Stop.
- `3` with `refused: "settings-unparsable"` → print the error and "fix `.claude/settings.json`
  and re-run; nothing was written." Stop.
- `2` with a `wrote` list → a write failed midway. Print the error, then say "init is not
  transactional", and:
  - list the files in `wrote` and say "remove these files, and `.claude/hitl.json` if it
    exists, then re-run" — these are the only files to remove;
  - list the files in `appended` (if any) and say "a hitl block was added to these files;
    leave them as they are — a re-run sees the block and skips them";
  - if `settings` is `"added"`, say "the Stop hook was added to `.claude/settings.json`;
    leave it — a re-run sees it and skips it".
  Stop.
- `1` or `2` otherwise → print the output verbatim and stop.
- `0` → continue.

## 4. Report

In plain words: the count and list of files written; the files appended (`CLAUDE.md`,
`README.md`, `.gitignore`; say "created" for one that did not exist) and the ones left alone
because the block was already there; the repository's own files found beside hitl's under
`.claude/` and left alone (`foreign`), if any; whether the Stop hook was added to
`.claude/settings.json` or already present; and the manifest path `.claude/hitl.json`. End
with:

> Review the changes and open a pull request. From now on `.claude/` and `HITL.md` are
> reviewed like code. Nothing was committed.

Never commit. Never open a PR.
