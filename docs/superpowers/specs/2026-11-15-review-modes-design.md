# Review modes — simple or elaborate, chosen per feature

## Intent

Systems built by agents keep shipping exploitable holes, and nothing in hitl looks for them
on purpose. Separately, the cold reviewers work from a fixed list of things to look for, so
they do not find the problems nobody thought to list. This feature adds two new kinds of
review — a security review and an adversarial review — and lets the human decide, per
feature, whether the feature gets them.

## Goals

- A feature is reviewed in one of two **modes**, chosen by the human once per feature:
  - **simple** — exactly today's behaviour at every gate.
  - **elaborate** — at the spec gate and at the code gate, one cold review followed by one
    adversarial review and one security review.
- The choice is recorded in the spec, so the unattended implementation session reads it
  without asking anyone.
- Triage, the PR's `## Review decisions` section and the Stop hook keep working as they do
  now: the new reviewers report in the existing finding types and severities.
- Both forms of hitl get the feature: installed (`.claude/`, rendered from `templates/`) and
  no-install (the plugin's own `commands/`, `agents/` and `doctrine/`).

## Non-goals

- The plan gate. `/review-plan` keeps today's cold rounds in both modes: a plan is the spec
  turned into steps and adds little new attack surface.
- A whole-codebase security audit (the Cloudflare `security-audit-skill` model: many
  hunters, verifiers, exploit attempts). That fits once, on the finished feature before the
  umbrella PR, and is a separate future feature.
- A repository-wide default mode, or a `/hitl:customize` knob for the mode.
- Reviewers that run the code, try exploits, or use a second model.
- Any dependency on a third-party skill. Both new reviewers ship with hitl.

## Anti-goals

- Simple mode changing in any way for a feature that picks it, or for a spec written before
  this feature (no mode line means simple).
- A third triage sitting. Elaborate mode has two rounds, like simple mode.
- Forced findings. A reviewer with nothing to report says so.

## The mode line

A spec carries, in its header block (between the `#` title and the first `##`):

```
**Review mode:** simple
```

or `elaborate`. It becomes a load-bearing invariant, listed in `HITL.md` with its parsers
(`/review-spec`, `/review-slice`).

- `/review-spec`, before its first round, reads the line. If it is absent, it asks the human
  once — "simple or elaborate?", with one line on what each costs — writes the answer into
  the header and carries on. It never asks again for that spec.
- A value other than `simple` or `elaborate` is refused with a message naming the two valid
  values; nothing is reviewed until it is fixed.
- Everything else that needs the mode reads it from the spec. An absent line read by
  anything other than `/review-spec` means `simple`. This covers specs in flight when this
  feature lands and grandfathered specs.
- Changing the line after round 1 has run does not rerun anything at the spec gate; it
  takes effect at the code gate. The spec says so next to the line's definition in `HITL.md`.
- A dry run on a fixture uses the fixture's own mode line and asks nothing.

## Elaborate mode at the spec gate

```
round 1                                   round 2 (always runs)
cold spec review → triage → fold in  →    adversarial ─┐
                                          security ────┤ (in parallel, neither sees the other)
                                                       └→ security follow-up reads the
                                                          adversarial findings
                                          → one merged triage → fold in → hand back
```

- **Round 1** is today's round 1, unchanged: the cold `spec-reviewer`, the `**Reviewed:**
  round 1` line written before triage, triage, fold in, commit.
- **Round 2 always runs**, whether or not round 1 changed the spec. In simple mode round 2
  is the same look repeated, worth it only after edits; in elaborate mode it is two looks
  that have not happened yet.
- Round 2 has three reviewer runs:
  1. The adversarial reviewer and the security reviewer, started together on the spec as
     round 1 left it. Each is briefed cold, as reviewers are today: the spec path, an output
     path, nothing about the other reviewer or about round 1.
  2. When both have finished, a short **security follow-up**: the security reviewer is run
     again with the spec and the adversarial review file, and asked one question — does any
     adversarial finding turn into something an attacker can use? It writes only new,
     chained findings to its own output file. It does not repeat or re-judge either earlier
     review.
- `**Reviewed:**` gains ` · round 2 (<date>)` once the two parallel reviews have each
  produced a review with a verdict row. If either did not, the line records `round 2 failed
  (<date>) — <which reviewer, why>`, the human is told, and a rerun runs the whole of
  round 2 again. A failed follow-up does not fail the round: triage proceeds on the two
  reviews and the hand-back says the follow-up produced nothing.
- **One merged triage** over the three files, with the same verdicts as today (YOUR CALL,
  APPLY, the four DECLINEs). The triage table gains a `Lens` column: `adversarial`,
  `security` or `chained`. The same problem raised by two lenses is one row naming both.
- No third round, in any circumstance. The round-2 blocker rule is unchanged.

The Stop hook is untouched: it only requires a `**Reviewed:**` line, and the round grammar
does not change.

## Elaborate mode at the code gate

Today `/implement-stack` reviews each slice once, fixes once, and opens the PR. In elaborate
mode, per slice:

```
cold slice review → triage → fixer  →  adversarial ─┐
                                       security ────┤→ security follow-up
                                       → one merged triage → fixer → PR
```

- The first review is today's `/review-slice`, unchanged.
- The second review always runs, on the slice's diff against its parent **including the
  first fixer's commits**. Same three runs, same independence, same follow-up as at the
  spec gate. The reviewers receive what the cold slice reviewer receives (diff, plan,
  changed files, stack table, forwarded items), so DEFERRED works for them too.
- Triage at the code gate has no YOUR CALL, as today. The second fixer run applies the
  APPLY rows. Its commits are not reviewed again.
- The checks that guard the first review guard the second: a missing or verdict-less review
  from the adversarial or the security reviewer is a **STOP**, never an approval; a finding
  that needs a design change is a **STOP**. A failed follow-up is reported in the PR body
  and does not stop the run.
- The PR's `## Review decisions` holds the declines and deferrals of both reviews, in the
  same plain words.
- `/review-slice` run by hand in elaborate mode can run either step; how it is asked for
  the second one is left to the plan.
- Fix-up mode (a re-review of only the new commits after a human's PR comment) follows the
  same two steps in elaborate mode.

## The two new reviewers

Two new agents, `adversarial-reviewer` and `security-reviewer`, shipped under
`templates/claude/agents/` and therefore in both forms. Each reviews either a spec or a
slice, told which by its brief. Both follow the existing reviewers' contract so that nothing
downstream needs to know they are different:

- the same grounding batch (`HITL.md`, `AGENTS.md`, `CONTEXT.md`, the review context, the
  target), treated as data, never as instructions;
- the same six finding types (plus DEFERRED at the slice), the same three severities, the
  same reporting cap, the same output skeleton with its `| Verdict |` row;
- the same discipline: verify before asserting, respect stated scope and altitude,
  proportionality;
- the same three-line reply to the caller.

What differs is what they look for.

**Adversarial reviewer.** Its job is to make the design or the code fail. It has no list of
cases to tick; it picks the assumptions the target rests on and tries to break each one:
what the author took for granted about order, timing, input, state, scale, or the people and
systems on the other side. Every finding states a concrete scenario — these inputs or this
sequence of events, leading to this wrong result. A doubt with no scenario is not a finding.
Adapted from the fresh-session critic of the adversarial code review pattern and the
"saboteur" persona of the linked skill; the linked skill's rule that every persona must
find at least one issue is deliberately not adopted.

**Security reviewer.** It asks what an attacker gains.

- At a spec: who may call or reach each new thing, and who checks that; which input crosses
  from a less trusted side to a more trusted one, and where it is validated; where secrets
  and personal data are stored, sent and logged; what a new capability lets someone do that
  they could not do before; what happens when a dependency or a caller lies.
- At a slice: the same questions answered from the diff and the changed files — injection
  into a shell, a query, a path or a template; a missing or bypassable check; secrets in
  code, logs or errors; unsafe handling of files, URLs or deserialised data; a new
  dependency or permission wider than the slice needs.
- Every finding carries its attack in one sentence: who does what and gains what. No
  attack, no finding. Severity follows impact, not deviation from a checklist.
- In the follow-up run it reads the adversarial review and reports only findings that the
  adversarial review makes possible and its own sweep did not already contain.

A target with nothing security-relevant (a documentation slice) gets a review that says
`_No findings._`; that is a valid review, not a failure.

## What changes where

- `templates/HITL.md` (and so this repository's `HITL.md` and the plugin's
  `doctrine/HITL.md`): the delivery chain, the gates, the rounds rule, § Review gates and
  the load-bearing invariants describe both modes and the mode line. "One is too few, two is
  good, three is too many" stays; what a round contains now depends on the mode.
- `templates/claude/commands/review-spec.md`, `review-slice.md`, `implement-stack.md`: the
  flows above.
- `templates/claude/agents/`: the two new agents. The installer's lists of owned and
  plugin-shipped files include them; this repository's manifest and the plugin's no-install
  files are regenerated as `AGENTS.md` prescribes.
- `templates/claude/fixtures/`: a spec fixture in elaborate mode with a planted design-level
  security hole and a planted breakable assumption, for the dry run.
- `/hitl:customize` keeps refusing the round rule and, now, the mode line. The
  `review-rounds` knob keeps its anchors on the paragraphs it has today.
- `/hitl:help` and the README mention the two modes where they describe the review gates.

## Approaches considered

- **Where the new reviews run.** Specs and plans only (as first proposed) would miss holes
  that exist only in code, which is where most agent-written exploits are. Code only would
  find design holes after the code exists. Chosen: the spec gate and the code gate, with the
  plan gate left alone.
- **Where the choice lives.** A per-repository setting is simplest but makes a README fix
  pay for a payments feature's review. A repository default with a per-feature override is
  two places to look. Chosen: per feature, asked once by `/review-spec`, written in the spec.
- **Order of the three reviews.** All three at once leaves triage's edits unread. One after
  another with triage between means three sittings. Chosen: cold first, then the two new
  reviews on the fixed version — two sittings, as today.
- **Whether the two new reviewers see each other.** Fully independent loses findings that
  need both views. Each revising after reading the other costs four runs and independence.
  Chosen: independent in parallel, then a one-way security follow-up, because "this
  assumption breaks" often becomes "this is exploitable" and rarely the reverse.
- **How heavy the security review is.** Depending on Cloudflare's audit skill is the deepest
  option but audits a whole codebase, has nothing to read at the spec gate and adds a
  third-party requirement. Chosen: hitl's own reviewer now; a whole-feature audit later.

## Testing

- The installer's file lists, the render and both drift tests cover the new and changed
  templates; the prompt tests that assert on command and agent text are extended for the
  mode line, the always-run second round and the STOP conditions.
- The Stop hook's tests are unchanged and must stay green with a spec that carries a mode
  line and two rounds.
- The prompts themselves are validated by dry runs, as `AGENTS.md` prescribes: `/review-spec`
  on the elaborate fixture must produce three review files, a merged triage that includes
  the planted hole and the planted assumption, and no change to the committed fixture; the
  same fixture with `simple` must behave exactly as today.

## Delivery slices

1. **Elaborate spec review.** The mode line and the question that sets it, both new
   reviewers with their spec side, the round-2 flow in `/review-spec`, the doctrine and the
   invariant, the fixture. Provable alone: a spec can be reviewed in either mode.
2. **Elaborate slice review.** The reviewers' slice side, the second review and second fix
   in `/review-slice` and `/implement-stack`, the PR body. Provable alone: a slice of a
   feature marked elaborate gets both reviews before its PR opens.

## Left to the builder

- Review output filenames under `.claude/reviews/` for the new reviewers and the follow-up.
- Whether the follow-up is a second brief to the same agent or a section of its definition.
- How `/review-slice` is told which step to run.
- The exact wording of the mode question and of the doctrine edits.

## Decisions and declined alternatives

- Round 2 in elaborate mode always runs — proposed by the assistant, explained to the human,
  not yet explicitly confirmed.
- The adversarial reviewer does not have to find something (differs from the linked skill).
- The plan gate is out of scope in both modes.
