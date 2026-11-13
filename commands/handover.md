---
description: Write the handover document for the current feature. Usage: /hitl:handover start | resume | fix-up
argument-hint: start | resume | fix-up
---

Mode: `$ARGUMENTS` (one of `start`, `resume`, `fix-up`; if empty or not one of the three, ask).

## Before anything: the hitl context

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/context.mjs" --repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}" --require no-install,gates --format brief
```

- Exit 3 with `refused: "installed"` → print exactly the line below and stop:

  ```
  hitl is installed in this repository — run this repository's own handover command (no hitl: prefix) instead.
  ```

- Exit 3 with `refused: "no-gates"` → print `This project has no confirmed gates on this machine — confirm them now.`,
  read the doctrine (`${CLAUDE_PLUGIN_ROOT}/doctrine/HITL.md`), run its § Project memory,
  *Confirming gates*, then run this step again.
- Exit 2 → print its `error` and stop.
- Exit 0 → keep the printed `## hitl context (no-install)` block: it is appended, verbatim,
  to every agent brief in this command. Read the file on the "Doctrine:" line in full unless this session already has; it governs this command.

1. Feature branch = the current branch if it is not a `*-slice-*` branch; otherwise strip the
   `-slice-<N>-<label>` suffix. Feature key = the `<feature>` segment shared by the plan
   filenames on this branch. If either is ambiguous, ask.
2. If the hitl context block says `Worktree: none`, print exactly
   `No hitl session is registered for this worktree — start with /hitl:brainstorming.` and stop.
   Otherwise spawn the `hitl:handover` agent with the brief: mode, feature branch, feature key,
   the launch line, and the hitl context block, verbatim. The session is in the topic's
   worktree, so the line is — exactly, with `<topic>` the worktree's folder name:
   ``Launch: `cd .claude/worktrees/<topic> && claude --model opus` then `/hitl:implement-stack docs/superpowers/handover/<feature>.md` ``.
   Nothing else. (The model tier lives here, in the command, never in the agent body.)
3. Relay its reply verbatim. If it begins `refused:`, stop — do not retry with another mode;
   the human decides.
4. If it wrote the document, print the launch line on its own line and stop — with the
   relative `cd .claude/worktrees/<topic>` replaced by `cd <absolute path>`, the output of
   `git rev-parse --show-toplevel`, so it can be pasted from any folder. The document keeps the
   relative line. Do not push; the human decides when the feature branch goes to the remote.
   When the block's `Host:` is not `github`, print after the launch line, exactly:
   `This repository is not on GitHub: /hitl:implement-stack will refuse until issue #19 lands. Implement from the handover by hand.`
