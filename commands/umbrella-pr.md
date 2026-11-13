---
description: Open or refresh the draft umbrella PR (feature branch → the repository's default branch) from the handover document. Usage: /hitl:umbrella-pr [--dry-run]
argument-hint: [--dry-run]
---

## Before anything: the hitl context

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/context.mjs" --repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}" --require no-install,github,gates --format brief
```

- Exit 3 with `refused: "installed"` → print exactly the line below and stop:

  ```
  hitl is installed in this repository — run this repository's own umbrella-pr command (no hitl: prefix) instead.
  ```

- Exit 3 with `refused: "not-github"` → print exactly the line below and stop, before any
  fetch, checkout or branch:

  ```
  This repository is not on GitHub: opening PRs needs https://github.com/leonardosarmentocastro/hitl/issues/19. Implement from the handover by hand until then.
  ```

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
   `<parent>` is the branch of the last stack-table row whose PR is not merged (read the
   states from the step 2 list, run now), or the feature branch when every slice has merged. If `$ARGUMENTS` contains
   `--dry-run`, add `--no-push` to the same call: nothing is archived, pushed or opened. A
   `refused` or `error` in the output → stop and report it verbatim. Keep its `status` and
   `pr` for the stack block in step 2. The wipe branch is never a stack-table row.
2. Build the body: everything from `Plan:` under `## Umbrella PR body` through the `## Notes`
   section, with the `<!-- stack -->` table's PR column refreshed from
   `"${CLAUDE_PLUGIN_ROOT}/runtime/pr/pr.sh" list --head-prefix "<feature-branch>-slice-"` (every state; read
   `number`, `head` and `state` from each record).
   Inside the `<!-- stack -->` markers, after the table, one line by the wipe's `status`:
   - `built`: `Required before merge: #<pr> removes the transient docs — merge it last. Fix-ups happen before it merges.`
   - `merged`: `Transient docs removed by #<pr>.`
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
     Report `created: #N (draft)` with `N` from the returned record.
   - PR exists: fetch its body (`"${CLAUDE_PLUGIN_ROOT}/runtime/pr/pr.sh" view N`, the `body` field). Replace ONLY
     the text between `<!-- stack -->` and `<!-- /stack -->` with the refreshed table and its wipe line; leave
     every other byte untouched. If the markers are absent, report
     `refused: #N has a hand-written body without stack markers` and stop. Otherwise
     `"${CLAUDE_PLUGIN_ROOT}/runtime/pr/pr.sh" edit N --body-file <tmp>` and report `updated: #N`.
5. Never mark the PR ready for review; never merge.
