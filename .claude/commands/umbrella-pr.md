---
description: Open or refresh the draft umbrella PR (feature branch → main) from the handover document. Usage: /umbrella-pr [--dry-run]
argument-hint: [--dry-run]
---

1. Feature branch and handover document as in `/handover` (step 1). Read the document.
2. Build the body: everything from `Plan:` under `## Umbrella PR body` through the `## Notes`
   section, with the `<!-- stack -->` table's PR column refreshed from
   `scripts/hitl/pr.sh list --head-prefix "<feature-branch>-slice-"` (every state; read
   `number`, `head` and `state` from each record).
3. If `$ARGUMENTS` contains `--dry-run`: print the body in a fenced block and stop.
4. Otherwise:
   ```bash
   git fetch -q origin
   git rev-parse --verify -q origin/<feature-branch> >/dev/null || { echo "refused: <feature-branch> is not pushed"; exit 1; }
   scripts/hitl/pr.sh list --head-prefix "<feature-branch>" --state open
   ```
   `N` is the `number` of the record whose `head` is exactly `<feature-branch>` and whose
   `base` is `main`; there is none if no such record.
   - No PR: write the body to a temp file and
     `scripts/hitl/pr.sh create --draft --base main --head <feature-branch> --title "<feature title from the spec's H1>" --body-file <tmp>`.
     Report `created: #N (draft)` with `N` from the returned record.
   - PR exists: fetch its body (`scripts/hitl/pr.sh view N`, the `body` field). Replace ONLY
     the text between `<!-- stack -->` and `<!-- /stack -->` with the refreshed table; leave
     every other byte untouched. If the markers are absent, report
     `refused: #N has a hand-written body without stack markers` and stop. Otherwise
     `scripts/hitl/pr.sh edit N --body-file <tmp>` and report `updated: #N`.
5. Never mark the PR ready for review; never merge.
