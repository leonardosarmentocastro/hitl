# Review context (repo-owned)

Reviewers read this file after `HITL.md`, `AGENTS.md` and `CONTEXT.md` (if present). It
holds what those do not say and a reviewer needs. Keep it short; if a rule belongs in
`AGENTS.md`, put it there.

## Scare score anchors

- 1–2 — config, docs, copy.
- 3–4 — a standard feature or fix with tests and a small blast radius.
- 5–6 — changes a template a consuming repository will install, or the shape of an
  artefact a command parses.
- 7–8 — changes a load-bearing invariant (`Reviewed:`, `Owns:`, `Plan:`, filename
  patterns, stack-table columns, finding-type names) together with its parser.
- 9–10 — changes the chain itself: a gate, the round rule, or what a terminal state is.

## Anchors reviewers most often get wrong here

- A template under the plugin and this repository's own `.claude/` copy of it are two
  files. A slice that changes one and not the other is MISSING, unless the plan says why.
- "It's tooling" is not a reason to skip the chain. `HITL.md` § Rationalizations applies to
  this repository exactly as to any consumer.
