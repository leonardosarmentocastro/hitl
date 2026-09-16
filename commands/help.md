---
description: Where this repository's hitl install stands, what to run next, and which prerequisites are missing. Usage: /hitl:help
---

```bash
node "${CLAUDE_PLUGIN_ROOT}/installer/help.mjs" --repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}"
```

Say the matching thing for `state`, then always end with the prerequisites.

- `not installed` → "hitl is not installed here. Run `/hitl:init`."
- `ejected` → "This repository carries the workflow but no manifest (ejected by hand or from
  treasury-2). Run `/hitl:init --adopt` to record it; the first `/hitl:diff` then shows the
  drift."
- `partially installed` → "Some hitl-owned files exist but not the workflow. Run
  `/hitl:init`; it lists what collides."
- `behind` → "Installed hitl <manifestVersion>; the plugin is <pluginVersion>. Run
  `/hitl:diff` to see what changed, `/hitl:diff --apply` to open the upgrade PR."
  Add "<locallyEdited> owned file(s) differ from the record" when the count is not 0.
- `ahead` → "The manifest records hitl <manifestVersion>, newer than the plugin
  (<pluginVersion>). Update the plugin: `claude plugin marketplace update hitl` then
  `claude plugin update hitl`."
- `up to date` → print, in this order:

  ```
  hitl <pluginVersion> — up to date. <locallyEdited> owned file(s) locally edited.

  The chain:
    1. brainstorm → spec committed → /review-spec (≤2 rounds) → human approves
    2. plans committed → /review-plan (≤2 rounds) → handover document
    3. new session: /implement-stack <handover>
    4. per slice: implementer → /review-slice → fixer → PR onto the parent
    5. draft umbrella PR; nothing merges — the human reviews the stack

  Plugin commands:   /hitl:init [--adopt] · /hitl:diff [--apply] · /hitl:help · /hitl:customize
  Workflow commands: /review-spec · /review-plan · /review-slice · /handover · /implement-stack · /umbrella-pr

  To change a rule: edit HITL.md or .claude/ by pull request, or run /hitl:customize.
  ```

Prerequisites, always, as a table `prerequisite · needed by · present`: `node` (the
installer), `git`, `gh` authenticated (the PR shim), the superpowers plugin enabled (the
brainstorming and writing-plans skills shape the artefacts this workflow reviews). A missing
one gets its install line (superpowers: `claude plugin marketplace add
obra/superpowers-marketplace` then `claude plugin install superpowers@superpowers-marketplace`).
End with: "Recommended: `/grill-me` (Matt Pocock's skills, `npx skills add mattpocock/skills`)
to start a feature whose shape is unclear."
