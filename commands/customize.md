---
description: Tune one workflow knob at a time, grill-style, by editing its anchored paragraphs in HITL.md and .claude/. Refuses load-bearing invariants. Usage: /hitl:customize [<knob-id>]
argument-hint: [<knob-id>]
---

You help the human tune the hitl workflow this repository owns. You edit files in the
working tree and never commit: the change lands by pull request like any other change to
`.claude/` or `HITL.md`.

## 0. Ground yourself

Read `.claude/hitl.json` (stop with "hitl is not installed or not adopted; run `/hitl:help`"
if absent), `HITL.md` and its `## Load-bearing invariants` section, and this table. A
**knob** is a rule a repository may tune. Each knob has one or more **anchors**: the line
`<!-- hitl:knob <id> -->` immediately above the paragraph, bullet or heading that states the
rule. `grep -rn "hitl:knob <id>" HITL.md AGENTS.md .claude/` finds every anchor of a knob.

| id | what it tunes | where | treasury default — and why |
|---|---|---|---|
| `review-rounds` | how many cold review rounds a spec or plan gets | `HITL.md` § Gates and § Review gates; `review-spec.md` and `review-plan.md`, step 0 and step 5 | 2 — one is too few; three chases findings that are non-deterministic across runs |
| `severities` | what blocker / major / minor mean | the three reviewer agents | blocker stops the merge or ships a wrong design; major is fixed before the next gate; minor is polish |
| `reporting-cap` | how many findings a review lists | the three reviewer agents; `HITL.md` § Review gates | every blocker, at most five majors, minors one line each — a longer list is not read |
| `file-tripwire` | the file count that triggers a justification | `HITL.md` § Delivery slices | ~20 files, a tripwire not a cap; never split horizontally to get under it |
| `small-lane` | whether any change may skip the chain | `HITL.md` § Delivery chain | none — size shrinks the artefact, never the gate |
| `effective-date-pilots` | the areas a new rule applies to first | `AGENTS.md` hitl block, `## Effective-date pilots` | none until the humans name one; grandfathered code is never a finding |
| `local-gates` | the commands the implementer and fixer run before "done" | `AGENTS.md` hitl block, `## Local gates` | discovered at init from the repository's scripts |
| `pr-body-sections` | what every PR body must answer | `HITL.md` § Pull requests (the What/Why/How bullet and the Review decisions bullet, both anchored); `implement-stack.md`, the body block | What / Why / How plus Review decisions — a newcomer can follow it |
| `scare-anchors` | the scare-score ladder reviewers calibrate on | `.claude/review-context.md` | treasury's ladder with 5–8 left as placeholders for this repository's own risky change classes |
| `testing-rules` | which testing principles `HITL.md` carries and whether the wipe job is installed | `HITL.md` § Testing and gates; the wipe workflow | the choices made at init |

## 1. Refuse an invariant

If the human asks to change anything in `## Load-bearing invariants` — the `**Reviewed:**`
line, the `**Owns:**` line, the `Plan:` line, the spec and plan filename patterns, the
stack-table columns, the seven finding-type names, the `docs/superpowers/` path — reply
exactly: "that is a load-bearing invariant; change it together with its parser, by PR" and
change nothing. Renaming a finding type is such a request; redefining a severity is not.

## 2. Pick the knob

If `$ARGUMENTS` names a knob id, start there. Otherwise ask which knob, offering the table's
ids in one line. One knob per turn; finish it before offering another.

## 3. Grill, then edit — for every knob except `testing-rules`

Ask what the human wants the rule to say, one question at a time, and recommend the treasury
default with its reason from the table before accepting a change. When the wording is
agreed:

1. `grep -rn "hitl:knob <id>" HITL.md AGENTS.md .claude/` — every hit is an anchor of this
   knob.
2. For each anchor, edit only the block below it: from the line after the anchor to the next
   blank line (for a heading such as `## Local gates`, the heading's section up to the next
   heading or the block's end marker). Restate the same rule at every anchor; the copies
   must not disagree.
3. Never touch an anchor line itself, and never move a rule out from under its anchor.
4. Show the diff (`git diff --stat` and the hunks) and stop. Do not commit.

## 4. `testing-rules`

Read the manifest's `testing` and `ci`. Ask, one at a time, which of `e2e`, `tiers`, `ci`,
`hooks`, `effective-date` the repository should carry (say what each one states, from
`${CLAUDE_PLUGIN_ROOT}/templates/testing/<id>.md`) and whether the wipe job should be
installed (`ci: github-actions`) or not (`ci: none`). Then:

```bash
node "${CLAUDE_PLUGIN_ROOT}/installer/customize-testing.mjs" --repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}" --testing "<comma list, or empty>" --ci <github-actions|none>
```

- exit `3`, `refused: "behind"` → "the install is at <recorded> and the plugin at <plugin>;
  run `/hitl:diff --apply` first". Stop.
- exit `3`, `refused: "ahead"` → "the install is at <recorded>, newer than the plugin at
  <plugin>; update the plugin (`claude plugin marketplace update hitl`, then reinstall)". Stop.
- exit `3`, `refused: "hitl-locally-edited"` → "`HITL.md` differs from its recorded render;
  this knob re-composes the whole file, so merge the fragments by hand: append or remove the
  fragment text from `${CLAUDE_PLUGIN_ROOT}/templates/testing/`, keep `## Testing and gates`
  under its anchor, then update `testing` in `.claude/hitl.json`". Stop.
- exit `3`, `refused: "no-manifest"` → "run `/hitl:init --adopt` first". Stop.
- exit `0` → report `wrote`, `removed`, `kept` (a kept workflow was edited locally and is
  left for the human) and the new `testing` and `ci`. Do not commit.

## Never

Commit. Edit text that is not under an anchor of the chosen knob. Change an invariant.
Change a finding-type name. Touch `.claude/hitl.json` except through `customize-testing.mjs`.
