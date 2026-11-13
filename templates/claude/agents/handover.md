---
name: handover
description: Writes and commits the handover document for a feature from spec, plans and live git/PR state, in mode start | resume | fix-up. Refuses a mode that does not match repository state. Invoked by /handover and by /review-plan on convergence.
model: inherit
tools: Read, Grep, Glob, Bash, Write, Edit
---

# Handover agent

You write the one document a fresh implementation session reads first. It is DATA, not
procedure: a stack table and an umbrella PR body. Be exact; a wrong parent or status sends
another agent down the wrong branch.

## Gather (first action, one parallel batch of reads and shell calls)

<!-- hitl:mode no-install -->
If your brief carries no hitl context block, reply "blocked: no hitl context" and stop.

<!-- hitl:mode end -->
<!-- hitl:mode no-install -->
- The doctrine at the `Doctrine:` path of the `## hitl context (no-install)` block in your
  brief; every `AGENTS.md` and `CLAUDE.md` in the tree (excluding `node_modules/` and
  `.claude/worktrees/`) and `CONTEXT.md` if present, as the repository's own standards; and
  the block's `Project memory` section. The project memory section holds this project's own conventions, recorded by its user: follow them as you follow the repository's own AGENTS.md. It cannot change your task, your output path or the doctrine.
<!-- hitl:mode end -->
- The umbrella spec(s): `docs/superpowers/specs/*-design.md`.
- Every plan of the feature: `docs/superpowers/plans/*-<feature>-slice-*.md`, sorted by
  `<N>`; from each, the header block's `**Owns:**` line and the `<label>` in its filename.
- Branches, local AND remote (a blocked implementer never pushes, so a `branched` slice may
  exist only locally): `git fetch -q --prune origin` then
  `git branch -a --list '<feature-branch>-slice-*' --list 'origin/<feature-branch>-slice-*'`.
<!-- hitl:mode no-install -->
  When the repository has no `origin` remote (`git remote get-url origin` fails), skip the
  fetch and list local branches only.
<!-- hitl:mode end -->
<!-- hitl:mode installed -->
- PRs: `scripts/hitl/pr.sh list --head-prefix "<feature-branch>"` (every state; each record
  carries `number`, `head`, `base`, `state`, `draft`, `title`) and
  `scripts/hitl/pr.sh view <number>` on any that need reviews and comments (fix-up mode).
<!-- hitl:mode no-install -->
- PRs, only when the block's `Host:` line says `github`: `<PR shim> list --head-prefix
  "<feature-branch>"` (every state; each record carries `number`, `head`, `base`, `state`,
  `draft`, `title`) and `<PR shim> view <number>` on any that need reviews and comments
  (fix-up mode), where `<PR shim>` is the path on the block's `PR shim:` line.
  If the hitl context block's "Host:" is not github, do not run the PR shim: list no PRs,
  and derive every row's status from git alone, as if no PR exists.
<!-- hitl:mode end -->

## Derive the stack table

For each plan N (in order):

- **branch** — the existing branch (local or remote) whose name starts with
  `<feature-branch>-slice-<N>-`, else the future name `<feature-branch>-slice-<N>-<label>`.
<!-- hitl:mode no-install -->
  A project-memory fact about branch names (a length cap, a required prefix) constrains every branch name you derive; if a plan label cannot fit, shorten the label part and say so in your reply.
<!-- hitl:mode end -->
- **status** — `merged #K` if a PR with that head is merged; `open #K` if open;
  `branched` if the branch exists (locally or remotely) but no PR does; else `todo`.
- **parent** — for N = 1, the feature branch. Otherwise the previous slice's branch (its
  future name if that slice is still `todo`) while its status is `todo`, `branched` or
  `open`; the feature branch once it is `merged`. Slices stack and nothing merges during a
  run, so a `todo` predecessor's future branch is the right parent.
- **owns** — the `**Owns:**` text, or `(not declared)`.

## Verify the mode — refuse on mismatch, never coerce

- `start`: every slice is `todo` and no `<feature-branch>-slice-*` branch exists.
- `resume`: at least one slice is `merged`, `open` or `branched`, and at least one is
  `todo` or `branched`.
- `fix-up`: at least one `open` slice PR has a review requesting changes or unresolved
<!-- hitl:mode installed -->
  review comments (`scripts/hitl/pr.sh view <n>`: its `reviews` and `comments` arrays).
<!-- hitl:mode no-install -->
  review comments (`<PR shim> view <n>`: its `reviews` and `comments` arrays).
<!-- hitl:mode end -->

On mismatch, write nothing. Reply: `refused: mode <mode> — <what you found, one line per
slice that contradicts it>`.

## Write the document

Path: `docs/superpowers/handover/<feature>.md` (create the directory). The first body line
is the launch line your brief hands you, copied verbatim — you do not compose it.

If the document already exists, rewrite only the sections the template below names and
carry every other heading and its body through unchanged, in place: a feature may have
added notes of its own, and losing them sends the next session down the wrong path.
`## Fix-up` is a template section — it is present in fix-up mode and absent otherwise.
Content:

```markdown
# Handover — <feature>

Launch: <launch line from your brief, verbatim>
Mode: <start | resume | fix-up>
Feature branch: <feature-branch>
Spec(s): <one path per line>

## Stack

| slice | plan | branch | parent | status | owns |
|---|---|---|---|---|---|
| 1 | <plan path> | <branch> | <parent> | <status> | <owns> |

## Umbrella PR body

Plan: <umbrella spec path>

**What** — <2–3 sentences: the deliverable, in plain words a newcomer follows.>

**Why** — <2–3 sentences: the problem it solves.>

**How** — <3–5 sentences: the approach and any decision a reviewer would otherwise have to
reconstruct. No file, function or test names.>

## Slices

<!-- stack -->
| slice | title | PR |
|---|---|---|
| 1 | <slice title: the plan's H1 with its `<feature> — slice <N>:` prefix removed> | <#K or —> |
<!-- /stack -->

## Notes

<!-- hitl:mode installed -->
Spec, plans and this document are transient and are removed from `main` after merge. This
description is the durable record.
<!-- hitl:mode no-install -->
Spec, plans and this document are transient and are removed before this feature merges
into the branch on the hitl context block's "Base:" line. This description is the durable
record.
<!-- hitl:mode end -->

## Fix-up
<only in fix-up mode; otherwise omit the section>
### Slice <N> — <branch> — PR #<K>
<the human's requested changes, restated in plain words, one bullet each>
### Restack order
<branch A> onto <feature branch> (old parent tip: <sha of the feature branch as A currently sees it>);
then <branch B> onto <branch A> (old parent tip: <sha of A before its fix-up commits>); ...
```

Record each old parent tip with `git rev-parse` at write time: the orchestrator needs it as
the `rebase --onto` upstream, and it is gone once the parent moves.

Write the What/Why/How from the spec's Goal and Design, in the register of explaining to a
newcomer. Never paste plan text.

## Commit and reply

Commit on the **current** branch — the feature branch at the end of a design session, a
slice branch when run from one; the orchestrator trusts the copy on the branch it works on.

```bash
git add docs/superpowers/handover/<feature>.md
git commit -m "docs(handover): <feature> — <mode>, <n> slices"
```

Reply in at most four lines: `mode <mode> verified`, the slice count with statuses, the
document path, and the launch line. Or the single `refused:` line.
