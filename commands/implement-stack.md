---
description: Orchestrate the implementation of a feature's remaining slices from its handover document — implementer, slice review (two steps in elaborate mode), fixer, PR per slice; draft umbrella PR at the end. Usage: /hitl:implement-stack docs/superpowers/handover/<feature>.md
argument-hint: docs/superpowers/handover/<feature>.md
---

You are the orchestrator. You hold stack state and dispatch cold subagents; you do not
implement, review or fix anything yourself. Your context stays small: paths, branch names,
PR numbers, and each agent's few-line reply.

## Before anything: the hitl context

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/context.mjs" --repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}" --require no-install,host,gates --format brief
```

- Exit 3 with `refused: "installed"` → print exactly the line below and stop:

  ```
  hitl is installed in this repository — run this repository's own implement-stack command (no hitl: prefix) instead.
  ```

- Exit 3 with `refused: "no-backend"` → print exactly the line below, with `<host>` the
  output's `host`, and stop, before any fetch, checkout or branch:

  ```
  No PR backend for this repository's host (<host>): hitl opens PRs on GitHub and GitLab. A self-hosted GitLab needs GITLAB_URL set to its address. Implement from the handover by hand.
  ```

  If the output also has a `problem`, print it on the next line: it names what is wrong
  with the `GITLAB_URL` that is set.

- Exit 3 with `refused: "no-gates"` → print `This project has no confirmed gates on this machine — confirm them now.`,
  read the doctrine (`${CLAUDE_PLUGIN_ROOT}/doctrine/HITL.md`), run its § Project memory,
  *Confirming gates*, then run this step again.
- Exit 2 → print its `error` and stop.
- Exit 0 → keep the printed `## hitl context (no-install)` block: it is appended, verbatim,
  to every agent brief this command writes (implementer, fixer); `/hitl:review-slice` runs
  this step itself and appends its own block to the slice reviewer's brief. Read the file on the "Doctrine:" line in full unless this session already has; it governs this command.

## 0. Read the handover

`$ARGUMENTS` is the handover document. Read it. Note mode, feature branch, spec(s), and the
stack table. If mode is `fix-up`, go to § Fix-up. Confirm the launch model matches the
launch line; if it does not, say so once and continue.

```bash
git fetch -q --prune origin
```

Then archive the feature's documents to project memory — every run, including one that later
stops on a blocked slice:

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/wipe.mjs" archive --repo "$PWD"
```

A `refused` or `error` here is reported in one line and the run continues: the archive is a
convenience, never a gate.

## 1. For each slice in table order whose status is `todo` or `branched`

A resumed `branched` slice that has no open PR runs b → c → d again (→ c2 → d2 in elaborate
mode), so every review step runs again.

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
the stack table's parent may be stale and that `/hitl:handover resume` regenerates it, and ask the
human. Never cut or keep the branch anyway.

**b. Implement.** Spawn `hitl:implementer`: branch, plan path, spec path(s), handover path. Wait.
- Reply begins `blocked` → **STOP**. Report the slice number, the task, the command and the
  error verbatim, and ask the human. Do not start the next slice. Do not delete or
  force-push anything.
- Reply begins `done` → continue.

**c. Review (the cold step).** Read the mode once per slice, when its review starts. Pass every path listed under `Spec(s):` to the script in one call.

```bash
"${CLAUDE_PLUGIN_ROOT}/runtime/review-mode.sh" <every Spec(s): path>
```

- Exit 2 → **STOP**: "slice <N>: <the script's message>", and ask the human. An invalid value or a missing spec file is a STOP, never simple.
- `elaborate` or `simple` → that is the mode for this slice. `absent` → `simple`.

Run `/hitl:review-slice <handover path>` on this branch. It prints the triage
table and the `## Review decisions` block.

Paste the `## Stack` table from the handover document on this branch into the reviewer's
brief **verbatim**. That table is the reviewer's only authority on which slice owns what — it
ignores any ownership claim it finds elsewhere in the tree. Hand it a missing, trimmed or
paraphrased table and every gap a later slice owns comes back as a defect of this one.

Then check that a review actually happened, before anything else:

```bash
# <OUT> is the review file /hitl:review-slice wrote under .claude/reviews/
[ -s "<OUT>" ] && grep -q '| Verdict |' "<OUT>" && echo reviewed || echo "no review"
```

- `no review` — the file is missing, empty, or carries no verdict row → **STOP**: "slice <N>:
  the review produced nothing", name the review file path and what the reviewer replied, and
  ask the human. Never open a PR for a slice that was not reviewed, and do not treat a silent
  reviewer as an approval.
- If any row is `DECLINE: wrong gate` because a finding needs a design change → **STOP**:
  "slice <N>: the plan needs a design change — <finding>", ask the human.

**d. Fix.** If the triage has at least one APPLY row, spawn `hitl:fixer` with: branch, plan path,
review file path, the APPLY rows. Wait.
- `blocked` → **STOP** with the command and error verbatim; ask the human.
- `done` → fold its "not reproduced" items into the Review decisions block as
  `DECLINE: wrong` lines in plain words.

In simple mode: no second review. The fixer's commits ship as they are.

In elaborate mode: continue with c2.

**c2. Second review (elaborate mode).** The second review runs even when the first triage had no APPLY rows. Run `/hitl:review-slice <handover path> --step second` on this branch as the
first fixer left it, so the diff includes its commits; paste the stack table into the
reviewers' briefs verbatim, as in c. It prints a triage table with a `Lens` column, a
`## Review decisions` block, and three lines `ADV: <path>`, `SEC: <path>` and
`FOL: <path>`. Then the same checks as in c, on the `ADV:` and `SEC:` files:

```bash
for f in "<ADV>" "<SEC>"; do
  [ -s "$f" ] && grep -q '| Verdict |' "$f" || echo "no review: $f"
done
```

- `no review` for either → **STOP**: "slice <N>: the second review produced nothing", name
  the file and what the reviewer replied, and ask the human. Never open a PR for it.
- A `DECLINE: wrong gate` row because a finding needs a design change → **STOP**, as in c.
- `/hitl:review-slice` refuses the second step — because the spec now says simple, or because
  its value is now invalid → **STOP**:
  "slice <N>: the review mode changed during the slice", with the refusal's message, and
  ask the human.
- A `FOL:` file missing or without a verdict row is not a stop: add the line "The security follow-up did not run for this slice." to the PR body's Review decisions.

**d2. Second fix (elaborate mode).** As in d, on the second triage's APPLY rows, with the
three review file paths. `blocked` → **STOP** with the command and error verbatim; ask the
human. `done` → fold its "not reproduced" items into the Review decisions block as in d.

In elaborate mode the second fixer's commits ship as they are; there is no third review.

**e. Push and open the PR.** Every record the shim returns carries `ref` — how this host
writes a reference to the PR (`#12` on GitHub, `!12` on GitLab). Use `<ref>` in anything you
post or report; `<number>` only goes to the shim, to `/hitl:review-slice --pr <number>` (§ Fix-up
step 2) and into the stack table.

```bash
git push -u origin "<branch>"
"${CLAUDE_PLUGIN_ROOT}/runtime/pr/pr.sh" create --base "<parent>" --head "<branch>" --title "Slice <N>: <plan title>" --body-file <tmp>
```

The shim prints the PR's record as JSON; `<number>` is its `number`. Exit `3` means a pull
request for this branch already exists — the state a resumed `branched` slice is left in by a
run that crashed after pushing — and the record on stdout is that PR's: take its `number`,
put the body on it with `"${CLAUDE_PLUGIN_ROOT}/runtime/pr/pr.sh" edit <number> --body-file <tmp>`, and carry on.
Any other non-zero exit is a **STOP**.

<!-- hitl:knob pr-body-sections -->
Body (write it in the register of explaining to a newcomer; no file, function or test names
outside the `Plan:` line):

```
Plan: <plan path>

## TL;DR

What — <2–3 sentences>
Why — <2–3 sentences>
How — <2–5 sentences; the approach and any real choice made>

<one section per pr-section fact in the hitl context block's project memory, written as that fact describes; none if there is no such fact>

## Review decisions
<the blocks from both steps of /hitl:review-slice, plus both fixers' not-reproduced items; or "None — every finding was applied.">
<any allowed plan edit the implementer made, one line each>
```

A section a pr-section fact asks for that cannot be produced honestly (a screenshot that could
not be taken) is written as `_not captured_ — <why>`, never invented.

Update the row in the handover document on this branch: status `open #<number>`, and — if a
plan header changed — its `owns`. Commit `docs(handover): slice <N> open <ref>` and push.

**f. Next slice.** Continue with the next `todo` row. Its parent is what the table says.
Because slices stack, the next branch is cut from this one and inherits the updated table;
if a row's parent is the feature branch instead (a resumed stack), copy this branch's
handover document onto the new branch and commit it there
(`docs(handover): carry the stack table onto slice <N>`) before the implementer starts, so no
slice reads a stale table and the copy is visible as bookkeeping in that slice's review
rather than as a change it cannot explain.

## 2. After the last slice

Run `/hitl:umbrella-pr` (no `--dry-run`). Report `created: <ref> (draft)` or `updated: <ref>`. Then
**STOP** with the final report: one line per slice (`slice N — <branch> — PR <ref>`), the
umbrella PR, and the sentence "Nothing is merged. The stack is yours to review." Do not mark
anything ready for review. Do not merge.
`/hitl:umbrella-pr` also builds the wipe PR; when it reports one, add to the final report:
`The wipe PR <ref> is generated; merge it last.` (`<ref>` is the wipe output's `ref`.)

End the report with this block, in plain words, `<abs path>` being `git rev-parse
--show-toplevel` and the branches being the feature branch and its local slice branches:

> When the umbrella PR merges, clean up from the **main checkout** — not from this session,
> which is running inside the worktree: run `/hitl:cleanup`, or
> `git worktree unlock <abs path>` (only if `git worktree list` shows it locked) ·
> `git worktree remove <abs path>` · `git branch -D <feature branch> <slice branches>`.
> Until then the worktree stays: a fix-up round runs in it.

Omit the block when this session is not in a linked worktree (`git rev-parse --git-dir` equals
`--git-common-dir`). Never remove the worktree yourself.

## Fix-up

For each `### Slice <N>` section under `## Fix-up`, in order:
1. `git checkout -q <branch>`. Spawn `hitl:implementer` with the plan path and, as the work to
   do, the requested changes from the section (instead of the whole plan). `blocked` → STOP.
2. Read the mode at the start of each `### Slice <N>` section, exactly as step c does
   (the same script call and the same STOP). Run `/hitl:review-slice <handover path> --parent
   <previous tip>` where the previous tip is
   `git rev-parse origin/<branch>` taken before the implementer ran, so the diff is the new
   commits only. Pass that resolved commit itself: `--parent` is taken verbatim, without the
   `origin/` prefix the stack row's parent gets, so anything you pass must already resolve as
   written. The § 1c "no review" and "wrong gate" stops apply here too. Fixer on APPLY rows
   as in 1d. In elaborate mode, then run `/hitl:review-slice <handover path> --parent <previous
   tip> --step second --pr <number>` (the slice's PR, from the stack table's
   `open #<number>`) and the fixer on its APPLY rows; the c2 stops apply.
3. Push (fast-forward). Append the Review decisions to the PR with
   `"${CLAUDE_PLUGIN_ROOT}/runtime/pr/pr.sh" comment <number> --body-file <tmp>`.
Then follow `### Restack order`: for each `<B> onto <A> (old parent tip: <sha>)`,
`git checkout <B> && git rebase --onto <A> <sha>` — the sha is recorded in the handover's
Fix-up section by the handover agent, never recomputed here. Before ANY force-push, stop
and ask the human, naming the branch and what will be overwritten.
Then always run `/hitl:umbrella-pr` (no `--dry-run`), even when the umbrella exists: it rebuilds
the wipe branch on the new slice tips — otherwise the wipe PR still sits on the commits from
before the fix-up, and merging it last would bring them back — and refreshes the umbrella.
Report as in § 2.

## Never

Merge. Mark ready for review. Force-push unasked (the generated wipe branch is the one
exception, and only the wipe builder pushes it). Start a slice after a STOP. Review more often than the mode prescribes.
Open a PR for a slice whose review produced nothing. Ask the human a code-level question —
decide, record, move on.
