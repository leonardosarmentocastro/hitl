---
description: Review the current slice branch's diff against its parent, plan and stack table with a cold slice-reviewer subagent; print the triage table (APPLY / DECLINE). Usage: /review-slice [<handover path>] [--parent <ref>]
argument-hint: [docs/superpowers/handover/<feature>.md] [--parent <ref>]
---

## 0. Resolve

- Handover document: the first path in `$ARGUMENTS` if given, else the single file under
  `docs/superpowers/handover/`. If none exists, ask for the parent ref and plan path directly.
- Current branch = the slice branch. Its row in the stack table gives `parent`, `plan` and
  `slice` N; feature key from the document title. If the document has no row for this branch,
  ask for the parent ref and plan path rather than guessing a row.
- `--parent <ref>` in `$ARGUMENTS` overrides the row's parent (used by fix-up mode to review
  only the new commits, and by the fail-fast checks).
- Collect forwarded items: lines in the slice plan's `## Review decisions` beginning
  `- **Forwarded to the code gate**` or containing `forwarded to the code gate`. This is the
  last gate, so an item dropped here is dropped for good.

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

Fail fast here, before any subagent is spawned.

## 1. Run the reviewer (cold)

Spawn `slice-reviewer` with this brief:

> Review the slice on branch `<branch>` against parent `<PARENT>`. Diff: `<DIFF>`. Plan:
> `<plan path>`. Changed files (read each in full): <CHANGED, one per line>. Write your review
> to `<OUT>`. Forwarded from the plan gate: <the items, or `none`>. Reply with at most three
> lines.
>
> STACK TABLE (this slice is <N>):
> <the `## Stack` table copied verbatim from the handover document>

## 2. Triage — no YOUR CALL at code level

Read `<OUT>`. For each finding (table and Also noticed), decide:

- **APPLY** — verified, in this slice's scope, worth its weight.
- **DECLINE: wrong** · **DECLINE: out of scope** · **DECLINE: wrong gate** (design-level →
  stop the session per `/implement-stack`; by hand → tell the human) ·
  **DECLINE: not worth it**.
- A **DEFERRED** finding is never applied in this slice. It is recorded as a scheduling
  note: "slice <M> owns this; executable meanwhile because <reason>". If the reviewer marked
  it 🟠, tell the human in the PR body's Review decisions — it is a resequencing question.

Verify each claim against the code before deciding. Print the triage table
(`# · Sev · Type · Finding · Verdict · one-line reason`). Then print, as a ready-to-paste
block, the `## Review decisions` section for the PR body: every DECLINE and DEFERRED in
plain words — the concern as a user or the data would experience it, the decision, the
reason. No file, function or test names.

## 3. Stop

Do not fix anything. The fixer (via `/implement-stack`) or the human acts on the table.
