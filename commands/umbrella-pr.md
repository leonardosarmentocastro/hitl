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
2. Build the body: everything from `Plan:` under `## Umbrella PR body` through the `## Notes`
   section, with the `<!-- stack -->` table's PR column refreshed from
   `"${CLAUDE_PLUGIN_ROOT}/runtime/pr/pr.sh" list --head-prefix "<feature-branch>-slice-"` (every state; read
   `number`, `head` and `state` from each record).
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
     the text between `<!-- stack -->` and `<!-- /stack -->` with the refreshed table; leave
     every other byte untouched. If the markers are absent, report
     `refused: #N has a hand-written body without stack markers` and stop. Otherwise
     `"${CLAUDE_PLUGIN_ROOT}/runtime/pr/pr.sh" edit N --body-file <tmp>` and report `updated: #N`.
5. Never mark the PR ready for review; never merge.
