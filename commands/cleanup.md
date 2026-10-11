---
description: Offer to remove the worktrees hitl design sessions left behind, once each is provably safe — merged or abandoned, nothing unsaved. Never touches remote branches. Usage: /hitl:cleanup
---

```bash
node "${CLAUDE_PLUGIN_ROOT}/installer/cleanup.mjs" --repo "$PWD"
```

- Exit 2 → "Nothing can be offered: <error>." Stop. Exit 1 → print the error. Stop.
- Say first, once: "Fetched origin with --prune (remote-tracking refs of branches the host
  deleted were removed)."
- No entries at all → "No hitl design-session worktrees here." Stop.

For each entry with `offered: true`, one block in plain words (sizes as MB or GB):

```
<path>  —  <branch>, <size>
  Safe to remove because: <merged: "its umbrella PR #<umbrella.number> is merged and nothing in it is unsaved"; abandoned: "nothing was ever committed or saved in it">
  Also deleted (gitignored): <each ignored entry with its size, or "nothing">
  Local branches deleted with it: <branches>
```

Then the total size, and "Remote branches are left alone — delete them on the host if it does
not do so on merge."

Then, not offered, one line each: `has unsaved work` entries with their `unsaved` lines;
`in progress` entries ("<path> — <branch>, in progress"); an entry with `here: true` gets
"run /hitl:cleanup from the main checkout to remove it".

No `offered: true` entry → say so after that list. Stop.

Otherwise ask once: **"Remove all N? (yes / pick some / no)"**. "pick some" → ask which, by
path. "no" → stop. Then:

```bash
node "${CLAUDE_PLUGIN_ROOT}/installer/cleanup.mjs" --repo "$PWD" --remove "<abs path>,<abs path>"
```

Report each `removed` entry (path, branches deleted) and each `refused` entry with its `why`
in plain words. End with the remote-branches sentence.
