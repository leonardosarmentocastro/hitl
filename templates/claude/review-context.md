# Review context (repo-owned)

Reviewers read this file after `HITL.md`, `AGENTS.md` and `CONTEXT.md` (if present). It
holds what those do not say and a reviewer needs. Keep it short; if a rule belongs in
`AGENTS.md`, put it there.

<!-- hitl:knob scare-anchors -->
## Scare score anchors

- 1–2 — config, docs, copy.
- 3–4 — a standard feature or fix with tests and a small blast radius.
- 5–6 — (name the change class that is risky in this repository, e.g. a schema migration
  or a shared component; leave this line until you know)
- 7–8 — (name the change class that needs a second human, e.g. auth, money, deletion)
- 9–10 — changes the chain itself: a gate, the round rule, or what a terminal state is.

## Anchors reviewers most often get wrong here

- (one line per recurring mis-call, added as they happen; delete this line when the first
  real one lands)
