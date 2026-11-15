---
description: Review the current feature's design spec with a cold spec-reviewer subagent — and, in elaborate mode, an adversarial and a security reviewer — then triage the findings with the human.
---

Run the spec review loop for the current feature's umbrella spec.

<!-- hitl:mode no-install -->
## Before anything: the hitl context

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/context.mjs" --repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}" --require no-install,gates --format brief
```

- Exit 3 with `refused: "installed"` → print exactly the line below and stop:

  ```
  hitl is installed in this repository — run this repository's own review-spec command (no hitl: prefix) instead.
  ```

- Exit 3 with `refused: "no-gates"` → print `This project has no confirmed gates on this machine — confirm them now.`,
  read the doctrine (`${CLAUDE_PLUGIN_ROOT}/doctrine/HITL.md`), run its § Project memory,
  *Confirming gates*, then run this step again.
- Exit 2 → print its `error` and stop.
- Exit 0 → keep the printed `## hitl context (no-install)` block: it is appended, verbatim,
  to every agent brief in this command. Read the file on the "Doctrine:" line in full unless this session already has; it governs this command.

<!-- hitl:mode end -->
## 0. Resolve the spec

The spec is the newest `docs/superpowers/specs/*-design.md` on this branch. If the human
<!-- hitl:mode installed -->
named a path in the invocation, use that path instead. **A path under `.claude/fixtures/`
is a dry run: copy the file to `.claude/fixtures/scratch/` and review the copy — fold into
the copy, commit nothing (skip step 4's commit), and delete the copy when the loop ends. The
committed fixture is never modified.** If more than one spec is plausible, ask which. Set:
<!-- hitl:mode no-install -->
named a path in the invocation, use that path instead. If more than one spec is plausible,
ask which. Set:
<!-- hitl:mode end -->

```bash
SPEC=docs/superpowers/specs/<file>.md
TOPIC=$(basename "$SPEC" .md | sed -E 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}-//; s/-design$//')
```

### Mode

The spec's `**Review mode:**` header line says how it is reviewed: `simple` (the cold rounds
below) or `elaborate` (one cold round, then an adversarial and security round). Read it:

<!-- hitl:mode installed -->
```bash
scripts/hitl/review-mode.sh "$SPEC"
```
<!-- hitl:mode no-install -->
```bash
"${CLAUDE_PLUGIN_ROOT}/runtime/review-mode.sh" "$SPEC"
```
<!-- hitl:mode end -->

- Exit 2 → print its message, review nothing, and stop. The human fixes the line.
- `elaborate` or `simple` → that is the mode.
- `absent` → the mode is `simple` and nothing is asked, **unless** no `**Reviewed:** round`
  is recorded in the spec header and this is not a dry run. Then ask the human once,
  "simple or elaborate?", with these two lines:
  - simple: two cold rounds, as always;
  - elaborate: one cold round, then an adversarial and a security review of the spec, and
    the same again on every slice's code — about three more reviewer runs per gate.

  Write `**Review mode:** <answer>` in the spec's header block (between the `#` title and
  the first `##`) and commit it alone:

  ```bash
  git commit -m "docs(spec): record review mode" -- "$SPEC"
  ```

  No other case sets or changes the line: the human edits it by hand, in a commit.

In elaborate mode, before applying the count below: the limit is two recorded rounds, whatever that count has been tuned to. Count the recorded rounds as the next paragraph describes, ignoring its limit. If two are recorded, stop, and add to the stop message: "this command cannot tell whether the adversarial and security round ran; if the mode was changed to elaborate after two cold rounds, it did not, and nothing is rerun."

<!-- hitl:knob review-rounds -->
Count existing `**Reviewed:** round N` entries in the spec header, ignoring any marked
`failed` — a failed attempt does not consume a round. The next round is N+1. If N is
already 2, stop: "two rounds have run; no third round", and hand back per step 6.

The round that runs follows the mode line as it reads now: with no round recorded, § 1 in
either mode; with round 1 recorded, elaborate → § 1E; simple → § 1.

## 1. Run the reviewer (cold)

```bash
mkdir -p .claude/reviews
OUT=.claude/reviews/$(date +%Y-%m-%d-%H%M%S)-$TOPIC-spec.md
```

<!-- hitl:mode installed -->
Spawn the `spec-reviewer` agent with this brief and nothing else — no summary of the spec,
no hints, no mention of earlier rounds:

> Review the spec at `<SPEC>`. Write your review to `<OUT>`. Reply with at most three lines.
<!-- hitl:mode no-install -->
Spawn the `spec-reviewer` agent with this brief, the hitl context block, and nothing else —
no summary of the spec, no hints, no mention of earlier rounds:

> Review the spec at `<SPEC>`. Write your review to `<OUT>`. Reply with at most three lines.

followed by the hitl context block, verbatim.
<!-- hitl:mode end -->

## 1E. Elaborate round 2 — adversarial and security

Only in elaborate mode, with round 1 recorded. Three output paths sharing one stamp:

```bash
mkdir -p .claude/reviews
STAMP=$(date +%Y-%m-%d-%H%M%S)
ADV=.claude/reviews/$STAMP-$TOPIC-spec-adversarial.md
SEC=.claude/reviews/$STAMP-$TOPIC-spec-security.md
FUP=.claude/reviews/$STAMP-$TOPIC-spec-security-followup.md
```

<!-- hitl:mode installed -->
In ONE message, spawn the `adversarial-reviewer` agent and the `security-reviewer` agent,
each with its brief and nothing else — nothing about round 1, nothing about each other, no
summary of the spec:

> Adversarial review of the spec at `<SPEC>`. Write your review to `<ADV>`. Reply with at most three lines.

> Security review of the spec at `<SPEC>`. Write your review to `<SEC>`. Reply with at most three lines.

When both have returned, spawn the `security-reviewer` agent again with this brief and
nothing else:

> Security follow-up on the spec at `<SPEC>`. Adversarial review: `<ADV>`. Write your review to `<FUP>`. Reply with at most three lines.
<!-- hitl:mode no-install -->
In ONE message, spawn the `adversarial-reviewer` agent and the `security-reviewer` agent,
each with its brief, the hitl context block, and nothing else — nothing about round 1,
nothing about each other, no summary of the spec:

> Adversarial review of the spec at `<SPEC>`. Write your review to `<ADV>`. Reply with at most three lines.

> Security review of the spec at `<SPEC>`. Write your review to `<SEC>`. Reply with at most three lines.

each followed by the hitl context block, verbatim. When both have returned, spawn the
`security-reviewer` agent again with this brief, followed by the hitl context block,
verbatim, and nothing else:

> Security follow-up on the spec at `<SPEC>`. Adversarial review: `<ADV>`. Write your review to `<FUP>`. Reply with at most three lines.
<!-- hitl:mode end -->

## 2. Record the round in the spec header — before triage

After § 1, if `<OUT>` exists and contains a `| Verdict |` row, add to the spec's header
block (the lines between the `#` title and the first `##`), creating the line if absent:

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

After § 1E, append ` · round 2 (<YYYY-MM-DD>)` only if `<ADV>` and `<SEC>` each exist and
contain a `| Verdict |` row. Otherwise write `round 2 failed (<YYYY-MM-DD>) — <which
reviewer, why>`, tell the human, and do not continue to triage; a rerun runs all of § 1E
again. A follow-up file `<FUP>` that is missing or has no verdict row does not fail the
round: carry on, and say "the security follow-up did not run" in step 6. A follow-up that
says `_No findings._` is a success.

Why before triage: the Stop hook refuses to end the turn while a spec has no Reviewed line,
and triage may need to stop and ask the human.

## 3. Triage — you decide the verdict, the reviewer never does

After § 1, read `<OUT>`. For every table finding and every "Also noticed" line, assign ONE verdict:

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

After § 1E, triage `<ADV>`, `<SEC>` and `<FUP>` as one list. The table gains a `Lens`
column (`# · Sev · Type · Lens · Finding · Verdict`), whose value is `adversarial`,
`security` or `chained` (the follow-up). The same problem raised from two lenses is one row
naming both.

## 4. Fold in and record

Apply every APPLY and every YOUR CALL answered with a change. Write every decline into the
spec's `## Decisions and declined alternatives` section (create it if absent), one line
each, so a re-raise is a fast no. Commit:

```bash
git add "$SPEC" && git commit -m "docs(spec): fold in spec review round <N+1>"
```

## 5. Round rule

<!-- hitl:knob review-rounds -->
One is too few, two is good, three is too many:
- If this was round 1 AND the spec changed in step 4 → go to step 1 for round 2.
- If this was round 1 and nothing changed → stop.
- If this was round 2 → stop. Never a third round: findings are non-deterministic across
  runs, so the reviewer's verdict and recommendation are not convergence signals; triage is.
- If round 2 ended with a blocker you accepted and could not resolve → stop and say so.
  Nothing downstream runs until the human resolves it.

Elaborate mode replaces the rule above. Round 2 always runs in elaborate mode, whether or not round 1 changed the spec. After round 1 → § 1E. After round 2 → stop; never a third round. A round-2 blocker you accepted and could not resolve stops everything downstream, as above.

## 6. Hand back

End with: the rounds run, the counts folded in and declined, any forwarded items, and
"Spec ready for your approval — say go and I will invoke the writing-plans skill." Then stop.
