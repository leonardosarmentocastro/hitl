---
description: Write the handover document for the current feature. Usage: /handover start | resume | fix-up
argument-hint: start | resume | fix-up
---

Mode: `$ARGUMENTS` (one of `start`, `resume`, `fix-up`; if empty or not one of the three, ask).

1. Feature branch = the current branch if it is not a `*-slice-*` branch; otherwise strip the
   `-slice-<N>-<label>` suffix. Feature key = the `<feature>` segment shared by the plan
   filenames on this branch. If either is ambiguous, ask.
2. Spawn the `handover` agent with the brief: mode, feature branch, feature key, and the
   launch line — exactly:
   ``Launch: `claude --model opus` then `/implement-stack docs/superpowers/handover/<feature>.md` ``.
   Nothing else. (The model tier lives here, in the command, never in the agent body.)
3. Relay its reply verbatim. If it begins `refused:`, stop — do not retry with another mode;
   the human decides.
4. If it wrote the document, print the launch line on its own line and stop. Do not push;
   the human decides when the feature branch goes to the remote.
