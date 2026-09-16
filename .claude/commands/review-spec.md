---
description: Review the current feature's design spec with a cold spec-reviewer subagent, then triage the findings with the human.
---

Run the spec review loop for the current feature's umbrella spec.

## 0. Resolve the spec

The spec is the newest `docs/superpowers/specs/*-design.md` on this branch. If the human
named a path in the invocation, use that path instead. **A path under `.claude/fixtures/`
is a dry run: copy the file to `.claude/fixtures/scratch/` and review the copy — fold into
the copy, commit nothing (skip step 4's commit), and delete the copy when the loop ends. The
committed fixture is never modified.** If more than one spec is plausible, ask which. Set:

```bash
SPEC=docs/superpowers/specs/<file>.md
TOPIC=$(basename "$SPEC" .md | sed -E 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}-//; s/-design$//')
```

<!-- hitl:knob review-rounds -->
Count existing `**Reviewed:** round N` entries in the spec header, ignoring any marked
`failed` — a failed attempt does not consume a round. The next round is N+1. If N is
already 2, stop: "two rounds have run; no third round", and hand back per step 6.

## 1. Run the reviewer (cold)

```bash
mkdir -p .claude/reviews
OUT=.claude/reviews/$(date +%Y-%m-%d-%H%M%S)-$TOPIC-spec.md
```

Spawn the `spec-reviewer` agent with this brief and nothing else — no summary of the spec,
no hints, no mention of earlier rounds:

> Review the spec at `<SPEC>`. Write your review to `<OUT>`. Reply with at most three lines.

## 2. Record the round in the spec header — before triage

If `<OUT>` exists and contains a `| Verdict |` row, add to the spec's header block (the
lines between the `#` title and the first `##`), creating the line if absent:

```
**Reviewed:** round <N+1> (<YYYY-MM-DD>).
```

(Append ` · round 2 (<date>)` to an existing line for the second round.)

If the agent failed or the file is missing or has no verdict row, write instead:

```
**Reviewed:** round <N+1> failed (<YYYY-MM-DD>) — <one-line reason>.
```

and tell the human; they decide whether to rerun. A failed attempt does not consume a round:
step 0 ignores a `failed` entry when counting, so a rerun carries the same round number.
Do not continue to triage.

Why before triage: the Stop hook refuses to end the turn while a spec has no Reviewed line,
and triage may need to stop and ask the human.

## 3. Triage — you decide the verdict, the reviewer never does

Read `<OUT>`. For every table finding and every "Also noticed" line, assign ONE verdict:

- **YOUR CALL** — a design decision. Ask the human, ONE finding at a time, with your
  recommendation. Never fold a design decision in without the answer.
- **APPLY** — one sensible edit. Make it.
- **DECLINE: wrong** — the claim did not survive verification. Verify against the code
  before saying so.
- **DECLINE: out of scope** — real, but not this spec's goal. Capture it as a ticket line
  in your report; do not grow the spec.
- **DECLINE: wrong gate** — plan- or code-level. Record it in the spec's Decisions section
  as *forwarded to the plan gate: <item>*; `/review-plan` passes forwarded items to its
  reviewer's brief.
- **DECLINE: not worth it** — accurate but heavier than the whole change deserves.

Present the triage as one table (`# · Sev · Type · Finding · Verdict`) first, then walk the
YOUR CALL items one at a time. Judge each finding on accuracy, scope, altitude and
proportionality; the reviewer is built to return findings and will wander.

## 4. Fold in and record

Apply every APPLY and every YOUR CALL answered with a change. Write every decline into the
spec's `## Decisions and declined alternatives` section (create it if absent), one line
each, so a re-raise is a fast no. Commit:

```bash
git add "$SPEC" && git commit -m "docs(spec): fold in spec review round <N+1>"
```

## 5. Round rule — one is too few, two is good, three is too many

<!-- hitl:knob review-rounds -->
- If this was round 1 AND the spec changed in step 4 → go to step 1 for round 2.
- If this was round 1 and nothing changed → stop.
- If this was round 2 → stop. Never a third round: findings are non-deterministic across
  runs, so the reviewer's verdict and recommendation are not convergence signals; triage is.
- If round 2 ended with a blocker you accepted and could not resolve → stop and say so.
  Nothing downstream runs until the human resolves it.

## 6. Hand back

End with: the rounds run, the counts folded in and declined, any forwarded items, and
"Spec ready for your approval — say go and I will invoke the writing-plans skill." Then stop.
