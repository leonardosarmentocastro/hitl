---
description: Review the current slice branch's diff against its parent, plan and stack table with a cold slice-reviewer subagent — and a second step: in elaborate mode with an adversarial reviewer, in complete mode with an adversarial and a security reviewer; print the triage table (APPLY / DECLINE). Usage: /review-slice [<handover path>] [--parent <ref>] [--step cold|second] [--pr <number>]
argument-hint: [docs/superpowers/handover/<feature>.md] [--parent <ref>] [--step cold|second] [--pr <number>]
---

## 0. Resolve

- Handover document: the first path in `$ARGUMENTS` if given, else the single file under
  `docs/superpowers/handover/`. If none exists, ask for the parent ref and plan path directly.
- Current branch = the slice branch. Its row in the stack table gives `parent`, `plan` and
  `slice` N; feature key from the document title. If the document has no row for this branch,
  ask for the parent ref and plan path rather than guessing a row.
- `--parent <ref>` in `$ARGUMENTS` overrides the row's parent (used by fix-up mode to review
  only the new commits, and by the fail-fast checks).
- `--step cold|second` in `$ARGUMENTS` picks the step; the default is `cold`, the one review
  this command has always run. `--pr <number>` names the slice's existing PR, for the
  repeat-decline rule of § 2; it is read only with `--step second` and ignored otherwise.
- Collect forwarded items: lines in the slice plan's `## Review decisions` beginning
  `- **Forwarded to the code gate**` or containing `forwarded to the code gate`. This is the
  last gate, so an item dropped here is dropped for good.

### Mode

The feature's review mode is read from its spec(s): every path listed under `Spec(s):` in
the handover document. Pass every path listed under `Spec(s):` to the script in one call.

```bash
scripts/hitl/review-mode.sh <every Spec(s): path>
```

- Exit 2 → print its message and stop. An invalid value or a missing spec file is a refusal, never simple.
- `complete`, `elaborate` or `simple` → that is the mode. `absent` → `simple`.
- With no handover document, after asking for the parent and the plan, also ask
  "simple, elaborate or complete?" — unless `--step second` was given: then ask only "elaborate or complete?" and nothing else.
- `--step second` in simple mode → print
  `refused: this feature is in simple mode — there is no second step` and stop.

The mode line, one per mode, exactly:

- `Review mode: simple — cold review only.`
- `Review mode: elaborate — cold review, then an adversarial review. No security review.`
- `Review mode: complete — cold review, then an adversarial and a security review.`

Print the mode line once per run, as soon as the mode is known. On the script's exit 2,
print its message instead.

### The diff

The block below is shared by both steps. For the cold step `OUT` is one path; for the second
step it is the paths below it.

```bash
PARENT=<parent from the row, or the --parent override>
FROM_ROW=<yes if PARENT came from the stack table row, no if it came from --parent>
git fetch -q origin
# The row's parent is a branch name, preferred in its pushed form. A --parent override is
# resolved verbatim: revision syntax (`HEAD`, `HEAD~2`, `@~1`) also resolves under `origin/`,
# which would silently review against the default branch instead of the range asked for.
[ "$FROM_ROW" = yes ] && REMOTE=origin/$PARENT || REMOTE=
BASE=$( { [ -n "$REMOTE" ] && git rev-parse --verify -q "$REMOTE"; } || git rev-parse --verify -q "$PARENT" ) || { echo "refused: parent '$PARENT' does not resolve"; exit 1; }
mkdir -p .claude/reviews
STAMP=$(date +%Y-%m-%d-%H%M%S)
DIFF=.claude/reviews/$STAMP-<feature>-slice-<N>-diff.patch
OUT=.claude/reviews/$STAMP-<feature>-slice-<N>-code.md
git diff "$BASE...HEAD" -- . ':(exclude)pnpm-lock.yaml' > "$DIFF"
[ -s "$DIFF" ] || { echo "refused: empty diff against $PARENT"; rm -f "$DIFF"; exit 1; }
CHANGED=$(git diff --name-only "$BASE...HEAD" -- . ':(exclude)pnpm-lock.yaml')
```

With `--step second`, in place of `OUT` — `ADV` in both modes, `SEC` and `FOL` only in
complete mode:

```bash
ADV=.claude/reviews/$STAMP-<feature>-slice-<N>-code-adversarial.md
# complete mode only:
SEC=.claude/reviews/$STAMP-<feature>-slice-<N>-code-security.md
FOL=.claude/reviews/$STAMP-<feature>-slice-<N>-code-security-followup.md
```

Fail fast here, before any subagent is spawned.

## 1. Run the reviewer (cold)

With `--step second`, run § 1S instead.

Spawn `slice-reviewer` with this brief:

> Review the slice on branch `<branch>` against parent `<PARENT>`. Diff: `<DIFF>`. Plan:
> `<plan path>`. Changed files (read each in full): <CHANGED, one per line>. Write your review
> to `<OUT>`. Forwarded from the plan gate: <the items, or `none`>. Reply with at most three
> lines.
>
> STACK TABLE (this slice is <N>):
> <the `## Stack` table copied verbatim from the handover document>

## 1S. Second step — adversarial, and security in complete mode

Only in elaborate or complete mode, with `--step second`, on the branch as the first fixer
left it.

In elaborate mode, spawn the `adversarial-reviewer` agent alone, with the brief below and nothing else — nothing about the cold review or its triage:

> Adversarial review of the slice on branch `<branch>` against parent `<PARENT>`. Diff:
> `<DIFF>`. Plan: `<plan path>`. Changed files (read each in full): <CHANGED, one per line>.
> Write your review to `<ADV>`. Forwarded from the plan gate: <the items, or `none`>. Reply
> with at most three lines.
>
> STACK TABLE (this slice is <N>):
> <the `## Stack` table copied verbatim from the handover document>

In complete mode, in ONE message, spawn the `adversarial-reviewer` agent with its brief above
and the `security-reviewer` agent with the brief below, each with nothing else — nothing
about the cold review, its triage or each other:

> Security review of the slice on branch `<branch>` against parent `<PARENT>`. <the rest as
> the adversarial brief above, with `<SEC>` as the output path>

When both have returned, spawn the `security-reviewer` agent again with this brief and
nothing else:

> Security follow-up on the slice on branch `<branch>` against parent `<PARENT>`.
> Adversarial review: `<ADV>`. <the rest as the adversarial brief above, with `<FOL>` as the
> output path>

Then check each review. In elaborate mode, check `<ADV>` only:

```bash
[ -s "<ADV>" ] && grep -q '| Verdict |' "<ADV>" || echo "no review: <ADV>"
```

In complete mode, as follows:

```bash
for f in "<ADV>" "<SEC>"; do
  [ -s "$f" ] && grep -q '| Verdict |' "$f" || echo "no review: $f"
done
[ -s "<FOL>" ] && grep -q '| Verdict |' "<FOL>" || echo "the security follow-up did not run"
```

- `no review: <which>` — a checked file is missing, empty, or has no verdict row → print
  that line, then the three path lines below, and stop without a triage table.
- `the security follow-up did not run` (complete mode only) → print it and carry on; triage
  the two reviews.

Whatever happens in this step, its output ends with these three lines, which
`/implement-stack` reads. In complete mode:

```
ADV: <ADV>
SEC: <SEC>
FOL: <FOL>
```

In elaborate mode, with no security review and no follow-up:

```
ADV: <ADV>
SEC: none
FOL: none
```

## 2. Triage — no YOUR CALL at code level

Read `<OUT>`. For each finding (table and Also noticed), decide:

- **APPLY** — verified, in this slice's scope, worth its weight.
- **DECLINE: wrong** · **DECLINE: out of scope** · **DECLINE: wrong gate** (design-level →
  stop the session per `/implement-stack`; by hand → tell the human) ·
  **DECLINE: not worth it**.
- A **DEFERRED** finding is never applied in this slice. It is recorded as a scheduling
  note: "slice <M> owns this; executable meanwhile because <reason>". If the reviewer marked
  it 🟠, tell the human under the PR body's `## Needs you` — it is a resequencing question.

Verify each claim against the code before deciding. Print the triage table
(`# · Sev · Type · Finding · Verdict · one-line reason`). Then print, as a ready-to-paste
block, the `## Review decisions` section for the PR body: every DECLINE and DEFERRED in
plain words — the concern as a user or the data would experience it, the decision, the
reason. No file, function or test names. Then, only if a 🟠 DEFERRED exists, a
`## Needs you` block with one line for each; those lines are left out of the Review
decisions block.

**The second step.** In complete mode, triage `<ADV>`, `<SEC>` and `<FOL>` as one list. The
table gains a `Lens` column (`# · Sev · Type · Lens · Finding · Verdict · one-line reason`),
whose value is `adversarial`, `security` or `chained` (the follow-up). The same problem
raised from two lenses is one row naming both. In elaborate mode, triage `<ADV>` alone. In elaborate mode the table has no `Lens` column. In both modes, a finding that repeats something already declined for this
slice is declined again for the same reason and adds no new line to the block. The earlier
declines are this session's earlier Review decisions block and, when `--pr <number>` is
given, that PR's body `## Review decisions` and `## Needs you` and every Review decisions
comment on it — a fix-up posts its decisions as a comment, and the shim's `view` returns the
body and the comments. A line beginning "Review mode:" is not a decline and is skipped.

```bash
scripts/hitl/pr.sh view <number>
```

Without `--pr`, only this session's block is used. Print the triage table, the
`## Review decisions` block and, when there is one, the `## Needs you` block as above, then
the three path lines of § 1S.

## 3. Stop

Do not fix anything. The fixer (via `/implement-stack`) or the human acts on the table.

After the cold step in elaborate or complete mode, always print, with `<mode>` the mode word: "`<mode>` mode: after the fixes, run `/review-slice --step second`".
