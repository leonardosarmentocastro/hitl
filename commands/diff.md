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

- exit `3`, `refused: "no-manifest"` → "no `.claude/hitl.json`; run `/hitl:init` or
  `/hitl:init --adopt`." Stop.
- exit `3`, `refused: "tag-missing"` → "the marketplace clone has no tag <tag>; run
  `claude plugin marketplace update hitl` and retry." Stop.
- exit `3`, `refused: "manifest-mismatch"` → "the manifest and the templates disagree for
  <paths>; delete `.claude/hitl.json` and re-run `/hitl:init --adopt`." Stop.
- exit `3`, `refused: "ahead"` → "the install is at <recorded>, newer than the plugin at
  <plugin>; update the plugin: `claude plugin marketplace update hitl` then
  `claude plugin update hitl`."
  Stop.
- exit `0` → print one table, `path · state · note`, where the note is `merged: clean`,
  `merged: conflict`, or `local: same|edited|absent` when present. Then one line:
  "recorded <recorded> · latest <latest> · <n> to apply", counting every file whose state is
  `upstream changed`, `both`, `missing locally`, `new upstream`, or `removed upstream` with
  `local: same`.

Without `--apply` in `$ARGUMENTS`, stop here.

## 2. `--apply`

If every file is `unchanged` or `locally edited` (or `already applied`, `removed upstream`
with `local` other than `same`) and the versions are equal, say "nothing to apply" and stop.

Otherwise, in this order — every file is written before the shim is called, because
`scripts/hitl/pr.sh` may itself be among the files applied:

```bash
FROM=$(git branch --show-current)
git checkout -q -b "chore/hitl-<recorded>-to-<latest>"
node "${CLAUDE_PLUGIN_ROOT}/installer/diff.mjs" --repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}" --marketplace "$MK" --apply
# Stage only what the upgrade touched: every path in the report's `files`, the manifest and
# the README block. Never `git add -A`: an unrelated dirty file must not ride in.
git add .claude/hitl.json README.md <every path listed in the report's files, deleted ones with `git rm`>
git commit -q -m "chore(hitl): <recorded> → <latest>"
git push -u origin "chore/hitl-<recorded>-to-<latest>"
scripts/hitl/pr.sh create --base "$FROM" --head "chore/hitl-<recorded>-to-<latest>" --title "hitl <recorded> → <latest>" --body-file <tmp>
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

| file | state |
|---|---|
<one row per file whose state is not unchanged>

<if any file has merged: conflict:> **Conflicts to resolve by hand:** <paths>. They carry
`<<<<<<<` / `>>>>>>>` hunks as committed.
```

Report `created: #N <url>`; the shim's exit `3` means the PR already exists — report its
number instead. Never merge, never mark ready for review.
