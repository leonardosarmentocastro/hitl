---
description: Orchestrate the implementation of a feature's remaining slices from its handover document — implementer, one slice review, fixer, PR per slice; draft umbrella PR at the end. Usage: /implement-stack docs/superpowers/handover/<feature>.md
argument-hint: docs/superpowers/handover/<feature>.md
---

You are the orchestrator. You hold stack state and dispatch cold subagents; you do not
implement, review or fix anything yourself. Your context stays small: paths, branch names,
PR numbers, and each agent's few-line reply.

## 0. Read the handover

`$ARGUMENTS` is the handover document. Read it. Note mode, feature branch, spec(s), and the
stack table. If mode is `fix-up`, go to § Fix-up. Confirm the launch model matches the
launch line; if it does not, say so once and continue.

```bash
git fetch -q --prune origin
```

## 1. For each slice in table order whose status is `todo` or `branched`

**a. Branch.** Parent and branch name come from the row, never from a rule of your own.
Resolve the parent before you cut anything. A parent branch deleted when its pull request
merged, or a pull that will not fast-forward, would otherwise fall through to "branch off
whatever HEAD happens to be", and every step after it — the review diff, the pull request's
base, the umbrella — inherits that wrong base in silence.

```bash
git rev-parse --verify -q "<parent>" >/dev/null \
  || git rev-parse --verify -q "origin/<parent>" >/dev/null \
  || { echo "STOP slice <N>: parent '<parent>' does not resolve"; exit 1; }
git checkout -q "<parent>" || { echo "STOP slice <N>: cannot check out '<parent>'"; exit 1; }
# fast-forward only when the parent is pushed; a local-only parent is fine, a diverged one is not
if git rev-parse --verify -q "origin/<parent>" >/dev/null; then
  git pull -q --ff-only origin "<parent>" \
    || { echo "STOP slice <N>: '<parent>' did not fast-forward"; exit 1; }
fi
# resume an existing branch first (local, then remote-tracking); only then cut a new one
git checkout -q "<branch>" 2>/dev/null \
  || git checkout -q -b "<branch>" --track "origin/<branch>" 2>/dev/null \
  || git checkout -q -b "<branch>"
git merge-base --is-ancestor "<parent>" HEAD \
  || { echo "STOP slice <N>: '<branch>' does not descend from '<parent>'"; exit 1; }
```

Any `STOP` line here ends the run: report the slice number and which check failed, say that
the stack table's parent may be stale and that `/handover resume` regenerates it, and ask the
human. Never cut or keep the branch anyway.

**b. Implement.** Spawn `implementer`: branch, plan path, spec path(s), handover path. Wait.
- Reply begins `blocked` → **STOP**. Report the slice number, the task, the command and the
  error verbatim, and ask the human. Do not start the next slice. Do not delete or
  force-push anything.
- Reply begins `done` → continue.

**c. Review once.** Run `/review-slice <handover path>` on this branch. It prints the triage
table and the `## Review decisions` block.

Paste the `## Stack` table from the handover document on this branch into the reviewer's
brief **verbatim**. That table is the reviewer's only authority on which slice owns what — it
ignores any ownership claim it finds elsewhere in the tree. Hand it a missing, trimmed or
paraphrased table and every gap a later slice owns comes back as a defect of this one.

Then check that a review actually happened, before anything else:

```bash
# <OUT> is the review file /review-slice wrote under .claude/reviews/
[ -s "<OUT>" ] && grep -q '| Verdict |' "<OUT>" && echo reviewed || echo "no review"
```

- `no review` — the file is missing, empty, or carries no verdict row → **STOP**: "slice <N>:
  the review produced nothing", name the review file path and what the reviewer replied, and
  ask the human. Never open a PR for a slice that was not reviewed, and do not treat a silent
  reviewer as an approval.
- If any row is `DECLINE: wrong gate` because a finding needs a design change → **STOP**:
  "slice <N>: the plan needs a design change — <finding>", ask the human.

**d. Fix.** If the triage has at least one APPLY row, spawn `fixer` with: branch, plan path,
review file path, the APPLY rows. Wait.
- `blocked` → **STOP** with the command and error verbatim; ask the human.
- `done` → fold its "not reproduced" items into the Review decisions block as
  `DECLINE: wrong` lines in plain words.

No second review. The fixer's commits ship as they are.

**e. Push and open the PR.**

```bash
git push -u origin "<branch>"
gh pr create --base "<parent>" --head "<branch>" --title "Slice <N>: <plan title>" --body-file <tmp>
```

If that refuses because a pull request for this branch already exists — the state a resumed
`branched` slice is left in by a run that crashed after pushing — take the existing number,
put the body on it with `gh pr edit --body-file <tmp>`, and carry on. Any other failure is a
**STOP**.

Body (write it in the register of explaining to a newcomer; no file, function or test names
outside the `Plan:` line):

```
Plan: <plan path>

What — <2–3 sentences>
Why — <2–3 sentences>
How — <2–5 sentences; the approach and any real choice made>

## Review decisions
<the block from /review-slice, plus the fixer's not-reproduced items; or "None — every finding was applied.">
<any allowed plan edit the implementer made, one line each>
```

Update the row in the handover document on this branch: status `open #<number>`, and — if a
plan header changed — its `owns`. Commit `docs(handover): slice <N> open #<number>` and push.

**f. Next slice.** Continue with the next `todo` row. Its parent is what the table says.
Because slices stack, the next branch is cut from this one and inherits the updated table;
if a row's parent is the feature branch instead (a resumed stack), copy this branch's
handover document onto the new branch and commit it there
(`docs(handover): carry the stack table onto slice <N>`) before the implementer starts, so no
slice reads a stale table and the copy is visible as bookkeeping in that slice's review
rather than as a change it cannot explain.

## 2. After the last slice

Run `/umbrella-pr` (no `--dry-run`). Report `created: #N (draft)` or `updated: #N`. Then
**STOP** with the final report: one line per slice (`slice N — <branch> — PR #K`), the
umbrella PR, and the sentence "Nothing is merged. The stack is yours to review." Do not mark
anything ready for review. Do not merge.

## Fix-up

For each `### Slice <N>` section under `## Fix-up`, in order:
1. `git checkout -q <branch>`. Spawn `implementer` with the plan path and, as the work to
   do, the requested changes from the section (instead of the whole plan). `blocked` → STOP.
2. Run `/review-slice <handover path> --parent <previous tip>` where the previous tip is
   `git rev-parse origin/<branch>` taken before the implementer ran, so the diff is the new
   commits only. Pass that resolved commit itself: `--parent` is taken verbatim, without the
   `origin/` prefix the stack row's parent gets, so anything you pass must already resolve as
   written. The § 1c "no review" and "wrong gate" stops apply here too. Fixer on APPLY rows
   as in 1d.
3. Push (fast-forward). Append the Review decisions to the PR with `gh pr comment`.
Then follow `### Restack order`: for each `<B> onto <A> (old parent tip: <sha>)`,
`git checkout <B> && git rebase --onto <A> <sha>` — the sha is recorded in the handover's
Fix-up section by the handover agent, never recomputed here. Before ANY force-push, stop
and ask the human, naming the branch and what will be overwritten.
Report as in § 2, without the umbrella step unless it does not exist yet.

## Never

Merge. Mark ready for review. Force-push unasked. Start a slice after a STOP. Review twice.
Open a PR for a slice whose review produced nothing. Ask the human a code-level question —
decide, record, move on.
