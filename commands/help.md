---
description: Where this repository's hitl install stands, what to run next, and which prerequisites are missing. Usage: /hitl:help
---

```bash
node "${CLAUDE_PLUGIN_ROOT}/installer/help.mjs" --repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}"
```

Say the matching thing for `state`, then always end with the prerequisites.

- `old layout` → "Installed hitl <manifestVersion> on the layout from before 0.3.0." then,
  exactly:

  ```
  This repository uses an older hitl layout. Run /hitl:diff --apply to upgrade it.
  ```

- `not installed` → "hitl is not installed here. Run `/hitl:init`."
- `ejected` → "This repository carries the workflow but no manifest (ejected by hand or from
  treasury-2). Run `/hitl:init --adopt` to record it; the first `/hitl:diff` then shows the
  drift."
- `partially installed` → "Some hitl-owned files exist but not the workflow. Run
  `/hitl:init`; it lists what collides."
- `behind` → "Installed hitl <manifestVersion>; the plugin is <pluginVersion>. Run
  `/hitl:diff` to see what changed, `/hitl:diff --apply` to open the upgrade PR."
  Add "<locallyEdited> owned file(s) differ from the record" when the count is not 0, and
  "<missing> owned file(s) are missing" when that count is not 0.
- `ahead` → "The manifest records hitl <manifestVersion>, newer than the plugin
  (<pluginVersion>). Update the plugin: `claude plugin marketplace update hitl` then
  `claude plugin update hitl`."
- `up to date` → print, in this order:

  ```
  hitl <pluginVersion> — up to date. <locallyEdited> owned file(s) locally edited, <missing> missing.

  The chain:
    1. brainstorm → spec committed → /review-spec (≤2 rounds; simple, elaborate or complete) → human approves
    2. plans committed → /review-plan (≤2 rounds) → handover document
    3. new session: /implement-stack <handover>
    4. per slice: implementer → /review-slice → fixer (twice in elaborate and complete mode) → PR onto the parent
    5. draft umbrella PR; nothing merges — the human reviews the stack

  Plugin commands:   /hitl:init [--adopt] · /hitl:diff [--apply] · /hitl:help · /hitl:customize · /hitl:cleanup
  Workflow commands: /review-spec · /review-plan · /review-slice · /handover · /implement-stack · /umbrella-pr

  To change a rule: edit .hitl/HITL.md or .claude/ by pull request, or run /hitl:customize.
  ```

Prerequisites, always, as a table `prerequisite · needed by · present`: `node` (the
installer **and the scripts under `scripts/hitl/`**), `git`, the superpowers plugin enabled
(the brainstorming and writing-plans skills shape the artefacts this workflow reviews), and
the code host's line by `provider`:

- `github` (or any provider without a backend): `gh` authenticated (the PR shim), from
  `prerequisites.gh`.
- `gitlab`: `GITLAB_TOKEN` set (the PR shim), from `prerequisites.gitlabToken` — "a GitLab
  access token with the `api` scope, exported in the shell that runs Claude Code". Never
  print the token's value; `help.mjs` reports only whether it is set. Then, by
  `prerequisites.gitlabUrl`:
  - `not-needed` — no row (the remote is gitlab.com);
  - `set` — a row `GITLAB_URL` · the PR shim · present;
  - `missing` — "`GITLAB_URL` set to the address of this self-hosted GitLab (e.g.
    `https://gitlab.example.com`)";
  - `mismatch` — the variable is set, not absent: "`GITLAB_URL` does not match this
    repository's `origin` remote; point it at the GitLab the remote names" (never tell the
    human to export a variable they already have);
  - `no-remote` — the repository has no `origin` remote: "add the `origin` remote of this
    GitLab repository (`git remote add origin <url>`)", and nothing about `GITLAB_URL`;
  - `invalid` — the variable is set but wrong, not absent: "`GITLAB_URL` needs a scheme
    (`https://…`)" when `gitlabUrlProblem` is `bad-gitlab-url`, "`GITLAB_URL` must be the
    instance's address, without `/api/v4`" when it is `gitlab-url-has-api-path`.

  Then one note, GitLab only: "hitl finds its merge requests by the `hitl` label it puts on
  them. A merge request opened by hand is invisible to hitl until that label is added."

A missing one gets its install line (superpowers: `claude plugin marketplace add
obra/superpowers-marketplace` then `claude plugin install superpowers@superpowers-marketplace`).
End with: "Recommended: `/hitl:grill-me` to start a feature whose shape is unclear — it needs
Matt Pocock's skills (`npx skills add mattpocock/skills`)."
