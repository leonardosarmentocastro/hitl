---
description: Review ALL slice plans of the current feature as one batch with a cold plan-reviewer subagent, then triage with the human. Bubble-up spec gaps to the spec. At most two rounds.
---

Run the plan review loop for the current feature's slice plans.

## 0. Resolve the set

The feature key is the `<feature>` segment of the plan filenames
`docs/superpowers/plans/<YYYY-MM-DD>-<feature>-slice-<N>-<label>.md` on this branch. If two
keys are present, ask which. If the human named an explicit set (a spec path and a plan
glob), use that set instead. **A set under `.claude/fixtures/` is a dry run: copy the plans
and the spec to `.claude/fixtures/scratch/` and review the copy — fold into the copy, commit
nothing, and delete the copy when the loop ends. The committed fixtures are never
modified.** Then:

```bash
FEATURE=<feature>
# order by <N>: hyphenated feature keys make field-based sort unreliable
PLANS=$(ls docs/superpowers/plans/*-"$FEATURE"-slice-*.md | sed -E 's/.*-slice-([0-9]+)-.*/\1 &/' | sort -n | cut -d' ' -f2)
SPECS=$(ls docs/superpowers/specs/*-design.md)   # every spec on the branch is the umbrella set: a resume round adds its own
```

Count `**Reviewed:** round N` entries in the FIRST plan's header, ignoring any marked
`failed` — a failed attempt does not consume a round, so a rerun carries the same round
number. The next round is N+1. If N is 2, stop: "two rounds have run; no third round" →
step 5.

Collect forwarded items: lines in the spec's `## Decisions and declined alternatives`
beginning `- **Forwarded to the plan gate**` or containing `forwarded to the plan gate`.

## 1. Run the reviewer (cold)

```bash
mkdir -p .claude/reviews
OUT=.claude/reviews/$(date +%Y-%m-%d-%H%M%S)-$FEATURE-plan.md
```

Spawn `plan-reviewer` with this brief and nothing else:

> Review the plans of feature `<FEATURE>`: <one plan path per line>. Umbrella spec(s):
> <paths>. Write your review to `<OUT>`. Forwarded from the spec gate: <the items, or
> "none">. Reply with at most three lines.

## 2. Record the round in every plan — before triage

If `<OUT>` has a `| Verdict |` row, add `**Reviewed:** round <N+1> (<date>).` to the header
block of EVERY plan in the set — the lines between the `#` title and the first `##` heading,
which is the only place the Stop hook reads — appending ` · round 2 (<date>)` on the second
round. If the
reviewer failed, write `**Reviewed:** round <N+1> failed (<date>) — <reason>.` in each,
tell the human, and stop.

## 3. Triage

Same six verdicts as `/review-spec` (YOUR CALL · APPLY · DECLINE: wrong / out of scope /
wrong gate / not worth it), one table first, YOUR CALL items one at a time.

**Bubble-up.** A finding whose block starts "SPEC GAP:", or that you judge to be a spec gap,
is fixed in the SPEC, not only in the plan: apply the edit to the spec, add a line to the
spec's Decisions section — `- **Bubbled up from plan review (round <N+1>)** — <what changed
and why>` — and do NOT reopen `/review-spec`. If it is a design decision it is YOUR CALL and
the human answers it here.

**Wrong gate** items are recorded in the plan's `## Review decisions` section (create at the
end of the plan) as *forwarded to the code gate: <item>*.

**A plan created during triage** (a YOUR CALL answered "add a slice") gets
`**Reviewed:** round <N+1> (<date>).` in its header the moment it is written, so the Stop hook
does not refuse the next turn-end; round 2 reviews it with the rest.

## 4. Fold in and record

Apply every APPLY and answered YOUR CALL. Record declines in each affected plan's
`## Review decisions`. Commit:

```bash
git add docs/superpowers && git commit -m "docs(plan): fold in plan review round <N+1>"
```

## 5. Round rule — one is too few, two is good, three is too many

- Round 1 AND at least one PLAN file changed in step 4 → step 1 for round 2. A round that
  changed only the spec (bubble-up) does not count as a plan change.
- Round 1 and no plan changed → stop.
- Round 2 → stop. Never a third round.
- Round 2 ended with an accepted, unresolved blocker → stop and say so; nothing downstream
  runs until the human resolves it.

## 6. Hand back

Report rounds, counts, bubbled-up items and forwarded items. If the loop converged with no
accepted, unresolved blocker, run the handover now: mode `start` only if no `*-slice-*` branch
of this feature exists locally or on the remote AND no pull request exists for any such
branch (the agent decides `start` from slice status, and a merged slice whose branch was
deleted still forbids it), otherwise `resume`; spawn the `handover` agent
exactly as `/handover` does (same brief, same launch line) and relay its reply. Print the launch line on its own line. The session's
work is done — say so and stop. Starting the implementation session is the human's approval
of the plans.
