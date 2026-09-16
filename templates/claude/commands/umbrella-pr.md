---
description: Open or refresh the draft umbrella PR (feature branch → main) from the handover document. Usage: /umbrella-pr [--dry-run]
argument-hint: [--dry-run]
---

1. Feature branch and handover document as in `/handover` (step 1). Read the document.
2. Build the body: everything from `Plan:` under `## Umbrella PR body` through the `## Notes`
   section, with the `<!-- stack -->` table's PR column refreshed from
   `gh pr list --state all --search "head:<feature-branch>-slice-" --json number,headRefName,state`.
3. If `$ARGUMENTS` contains `--dry-run`: print the body in a fenced block and stop.
4. Otherwise:
   ```bash
   git fetch -q origin
   git rev-parse --verify -q origin/<feature-branch> >/dev/null || { echo "refused: <feature-branch> is not pushed"; exit 1; }
   N=$(gh pr list --state open --head <feature-branch> --base main --json number --jq '.[0].number')
   ```
   - No PR: write the body to a temp file and
     `gh pr create --draft --base main --head <feature-branch> --title "<feature title from the spec's H1>" --body-file <tmp>`.
     Report `created: #N (draft)`.
   - PR exists: fetch its body (`gh pr view N --json body --jq .body`). Replace ONLY the text
     between `<!-- stack -->` and `<!-- /stack -->` with the refreshed table; leave every
     other byte untouched. If the markers are absent, report
     `refused: #N has a hand-written body without stack markers` and stop. Otherwise
     `gh pr edit N --body-file <tmp>` and report `updated: #N`.
5. Never mark the PR ready for review; never merge.
