---
description: Open or refresh the draft umbrella PR (feature branch → the repository's default branch) from the handover document. Usage: /hitl:umbrella-pr [--dry-run]
argument-hint: [--dry-run]
---

## Before anything: the hitl context

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/context.mjs" --repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}" --require no-install,host,gates --format brief
```

- Exit 3 with `refused: "installed"` → print exactly the line below and stop:

  ```
  hitl is installed in this repository — run this repository's own umbrella-pr command (no hitl: prefix) instead.
  ```

- Exit 3 with `refused: "no-backend"` → print exactly the line below, with `<host>` the
  output's `host`, and stop, before any fetch, checkout or branch:

  ```
  No PR backend for this repository's host (<host>): hitl opens PRs on GitHub and GitLab. A self-hosted GitLab needs GITLAB_URL set to its address. Implement from the handover by hand.
  ```

  If the output also has a `problem`, print it on the next line: it names what is wrong
  with the `GITLAB_URL` that is set.

- Exit 3 with `refused: "no-gates"` → print `This project has no confirmed gates on this machine — confirm them now.`,
  read the doctrine (`${CLAUDE_PLUGIN_ROOT}/doctrine/HITL.md`), run its § Project memory,
  *Confirming gates*, then run this step again.
- Exit 2 → print its `error` and stop.
- Exit 0 → keep the printed `## hitl context (no-install)` block: it is appended, verbatim,
  to every agent brief in this command. Read the file on the "Doctrine:" line in full unless this session already has; it governs this command.

1. Feature branch and handover document as in `/hitl:handover` (step 1). Read the document.
1b. The wipe PR — archive the feature's documents and rebuild `<feature-branch>-wipe`, the one
   generated commit that deletes them, before the body is built. Fetch first: this is the
   command the human re-runs after slices merged on the host, and the parent's tip must be
   current.
   ```bash
   git fetch -q --prune origin
   node "${CLAUDE_PLUGIN_ROOT}/runtime/wipe.mjs" build --repo "$PWD" --feature-branch "<feature-branch>" --parent "<parent>" --shim "${CLAUDE_PLUGIN_ROOT}/runtime/pr/pr.sh"
   ```
   `<parent>` is the branch of the last stack-table row that has a PR not yet merged — a row
   with no PR (a `todo` slice) never counts (read the states from the step 2 list, run now), or the feature branch when no row has one. If `$ARGUMENTS` contains
   `--dry-run`, add `--no-push` to the same call: nothing is archived, pushed or opened. A
   `refused` or `error` in the output → stop and report it verbatim. Keep its `status` and
   `ref` for the stack block in step 2. The wipe branch is never a stack-table row.
2. Build the body: everything under the handover document's `## Umbrella PR body` heading,
   stopping at the first `##` heading that is not `## TL;DR`, `## Why`, `## Slices` or `## Notes`,
   or at the end of the document. Never reshape it: a body written in an earlier shape (a
   `Plan:` line first, a `## Notes` section last) opens as it is, and a heading the feature
   added to its handover document is never copied. The `<!-- stack -->` table's PR column is refreshed from
   `"${CLAUDE_PLUGIN_ROOT}/runtime/pr/pr.sh" list --head-prefix "<feature-branch>-slice-"` (every state; read
   `number`, `ref`, `head` and `state` from each record; a PR cell shows the record's `ref` —
   `#12` on GitHub, `!12` on GitLab).
   Inside the `<!-- stack -->` markers, after the table, one line by the wipe's `status`:
   - `built`: `Required before merge: <ref> removes the transient docs — merge it last. Fix-ups happen before it merges.`
   - `merged`: `Transient docs removed by <ref>.`
   - `would-build` (a dry run): `Required before merge: the wipe PR (not built in a dry run).`
   - `nothing-to-wipe`: no line.
3. If `$ARGUMENTS` contains `--dry-run`: print the body in a fenced block and stop.
4. Otherwise:
   ```bash
   git fetch -q origin
   git rev-parse --verify -q origin/<feature-branch> >/dev/null || { echo "refused: <feature-branch> is not pushed"; exit 1; }
   "${CLAUDE_PLUGIN_ROOT}/runtime/pr/pr.sh" list --head-prefix "<feature-branch>" --state open
   ```
   `N` is the `number` of the record whose `head` is exactly `<feature-branch>` and whose
   `base` is the branch on the hitl context block's `Base:` line (`<Base>`); there is none if no such record.
   - No PR: write the body to a temp file and
     `"${CLAUDE_PLUGIN_ROOT}/runtime/pr/pr.sh" create --draft --base "<Base>" --head <feature-branch> --title "<feature title from the spec's H1>" --body-file <tmp>`.
     Report `created: <ref> (draft)` with `<ref>` from the returned record.
   - PR exists: fetch its body (`"${CLAUDE_PLUGIN_ROOT}/runtime/pr/pr.sh" view N`, the `body` field). Replace ONLY
     the text between `<!-- stack -->` and `<!-- /stack -->` with the refreshed table and its wipe line; leave
     every other byte untouched. If the markers are absent, report
     `refused: <ref> has a hand-written body without stack markers` and stop. Otherwise
     `"${CLAUDE_PLUGIN_ROOT}/runtime/pr/pr.sh" edit N --body-file <tmp>` and report `updated: <ref>`, `<ref>` being that record's `ref`.
5. Never mark the PR ready for review; never merge.
