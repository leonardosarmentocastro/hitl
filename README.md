<p align="center">
  <img src=".github/logo.svg" alt="hitl: a human and an AI robot in a loop" width="360" />
</p>

# hitl

> **Let coding agents do the typing. Keep the decisions.**
> A Claude Code plugin that installs a human-in-the-loop delivery workflow into your
> repository: cold reviewers at every stage, small stacked PRs, test-first slices, and a
> human who decides only what matters.

Agents now write most of the code in many teams. The limiting factor isn't typing speed
anymore. It's how much of that output a human can trust. hitl is the process that makes
that output trustworthy, written down as agents, commands and one hook that live in your
repository.

## Why hitl

Give a coding agent a feature and you usually get one of two bad outcomes:

- **One 3,000-line PR.** It probably works, but nobody can review it, so it either sits
  unmerged or gets merged on trust.
- **A conversation that drifts.** The agent starts coding before the design is clear,
  reviews its own work, says everything is fine, and quietly drops the edge cases you
  mentioned twenty messages earlier.

The models aren't the problem. The process is: one agent designs, builds and grades its own
work in one long context, and the human only sees the end result. hitl splits that loop
apart.

<table>
<tr>
<td width="50%" valign="top">

### Without hitl

- The agent codes before the design is agreed
- The same context that wrote the code reviews it
- One huge diff at the end
- Tests written after the code, if at all
- "Looks good to me" from the agent counts as done
- You find the missed edge case in production

</td>
<td width="50%" valign="top">

### With hitl

- A spec is written, reviewed and **approved by you** before any plan exists
- A **cold** reviewer subagent, with no shared context, checks spec, plans and every slice
- The feature lands as **stacked slice PRs**, each the thinnest change a test can prove
- Every slice is **test-first**: failing test, minimal code, green, commit
- A Stop hook **won't let the session end** while a spec or plan is unreviewed
- Declined review findings are written into the PR in plain words, so you can overrule them

</td>
</tr>
</table>

## How it works

```
 DESIGN SESSION (you + agent)                         IMPLEMENTATION SESSION (agents)
 ───────────────────────────                          ───────────────────────────────
 brainstorm ─▶ spec ─▶ /review-spec ─▶ YOU APPROVE     /implement-stack <handover>
                        (cold reviewer,                  for each slice:
                         ≤2 rounds)                        implementer  (TDD, local gates)
            ─▶ slice plans ─▶ /review-plan                 slice-reviewer (cold, vs plan)
                               (cold reviewer,             fixer        (applies findings)
                                ≤2 rounds)                 (elaborate, complete: + a second review)
                                                           PR ─▶ parent branch
            ─▶ handover document ─────────────────────▶  draft umbrella PR ─▶ YOU REVIEW
```

1. **Design with the agent.** You brainstorm a feature together; the agent writes a short
   design spec and splits the work into vertical slices.
2. **A cold reviewer checks the spec.** A separate subagent, with no access to your
   conversation, reads the spec and reports findings in six types: *missing, unclear,
   conflicts, breaks, unproven, mis-sliced*. The agent sorts every finding into *apply*,
   *decline* or *your call*. You answer the design questions one at a time.
3. **You approve the spec.** Then the agent writes one plan per slice, and those get the
   same cold review as one batch. A plan problem that is really a spec gap is fixed in the
   spec.
4. **A handover document closes the design session.** It contains the stack table (each
   slice's branch, parent and the one capability it owns) and the exact command to start
   implementation.
5. **A fresh session implements the stack.** For each slice, an implementer agent works
   test-first, a cold slice reviewer compares the diff with the plan, a fixer applies the
   accepted findings, and a PR opens against the previous slice.
6. **You review small PRs, then one umbrella PR.** Nothing merges without you.

Every review loop is capped: **one round is too few, two is good, three is too many.** The
reviewer's "approved" means nothing on its own; what counts is the triage.

Each feature is reviewed in one of three modes, chosen once when its spec is first reviewed,
each one step heavier than the last. **simple** is the cold rounds above. **elaborate** makes
the spec's second round an adversarial review that tries to break the design; each slice's
code also gets an adversarial review after the cold slice review and its fixes, and a second
fix pass before its PR opens. **complete** adds a security review that asks what an attacker
would gain, at both places, alongside the adversarial one. Every slice PR says which mode
reviewed it.

## Where you decide, and where the agents work

| You | The agents |
|---|---|
| What to build, and the trade-offs in the design | Writing the spec, the plans, the code and the tests |
| Approving the spec | Reviewing spec, plans and each slice, cold |
| Answering *your call* findings | Sorting findings into apply / decline / your call |
| Reviewing each slice PR and the umbrella PR | Applying fixes, running the local gates, opening PRs |
| Overruling a declined finding with a PR comment | Recording every decline in the PR, in plain words |

## Install

You need [Claude Code](https://claude.com/claude-code), the
[superpowers](https://github.com/obra/superpowers) plugin, Node 20+ and git, plus, for the
code host: on GitHub, [`gh`](https://cli.github.com/) installed and signed in; on GitLab, a
`GITLAB_TOKEN` with the `api` scope, and `GITLAB_URL` set to the instance's address for a
self-hosted GitLab.

```bash
claude plugin marketplace add obra/superpowers-marketplace
claude plugin install superpowers@superpowers-marketplace

claude plugin marketplace add leonardosarmentocastro/hitl
claude plugin install hitl@hitl
```

Then, inside the repository you want to set up:

```
/hitl:init
```

`/hitl:init` reads your tree, asks one question per thing it finds (CI, which testing rules
apply), shows you what it will write, and writes it. Commit the result like any other
change.

Already copied the workflow by hand? `/hitl:init --adopt` records what you have without
rewriting it. It first moves a doctrine and reviewer context it finds in the old places into
`.hitl/`, and points `CLAUDE.md` at the doctrine's new place.

## Your first feature

```
> Let's build CSV export for the monthly report.
```

The agent creates the branch `feat/csv-export`, brainstorms with you, commits the spec and
runs `/review-spec`. You answer its questions and approve. It writes the slice plans, runs
`/review-plan`, writes the handover document and prints a single line to start the next
session:

```
/implement-stack docs/superpowers/handover/csv-export.md
```

Run it in a fresh session, go do something else, and come back to a stack of draft PRs.

## What lands in your repository

With `/hitl:init`, hitl is **installer-only**. Nothing runs from the plugin: your
repository owns every file, and you change them by pull request like any other code. You can
uninstall the plugin and the workflow keeps working.

| Path | What it is |
|---|---|
| `.hitl/HITL.md` | The workflow rules, written for agents and humans alike |
| `.claude/agents/` | `spec-reviewer`, `plan-reviewer`, `slice-reviewer`, `implementer`, `fixer`, `handover`, `adversarial-reviewer`, `security-reviewer` |
| `.claude/commands/` | `/review-spec`, `/review-plan`, `/review-slice`, `/handover`, `/implement-stack`, `/umbrella-pr` |
| `.claude/hooks/` + `settings.json` | The Stop hook that blocks the turn while a spec or plan is unreviewed |
| `.hitl/review-context.md` | What reviewers should know about *your* repo |
| `scripts/hitl/` | A small PR shim (swappable code-host backend) and the wipe builder |
| `.hitl/manifest.json` | Install record (version, choices, file hashes), used only by `/hitl:diff` and `/hitl:help` |

Specs and plans live under `docs/superpowers/` only while a feature is in progress: they
leave through a generated draft PR, `<feature branch>-wipe`, built by `/umbrella-pr` and
merged last — after every slice, before the umbrella PR. The umbrella PR description is the
record that lasts.

## Use it without installing

Some repositories cannot take the install: no permission to commit tooling, a team that has
not agreed to it, a client project. There, type `/hitl:brainstorming` instead of starting a
feature by hand. It checks the prerequisites, puts the session in its own worktree on a
feature branch, confirms the project's local gates with you, and runs the same chain from
the plugin: reviewed spec, reviewed plans, a handover, then `/hitl:implement-stack` in a new
session for the stacked draft PRs and the umbrella PR. Nothing hitl-owned is committed; only
the feature's own documents under `docs/superpowers/`, as always.

When you cannot see the feature's shape yet, type `/hitl:grill-me` instead. It is the same
start, but the design conversation opens with a grill
([Matt Pocock's skills](https://github.com/mattpocock/skills), `npx skills add mattpocock/skills`):
you confirm a summary of what the grill settled, and the brainstorm writes the spec from it.

- **Memory lives on your machine**, in `~/.hitl/projects/<host>/<owner>/<repo>/`: the
  local gates, what reviewers should know, extra PR sections. hitl asks before it remembers
  anything, and every worktree and clone of the project reads the same memory.
- **Code hosts: GitHub and GitLab.** hitl labels the merge requests it opens `hitl` and finds them by that label.
- **The wipe PR merges last.** hitl copies the feature's documents to
  `~/.hitl/projects/<…>/features/` and opens a generated draft PR,
  `<feature branch>-wipe`, that deletes them from the branch. It is rebuilt on every
  `/hitl:umbrella-pr` run. As in an installed repository, merge it after every slice and
  before the umbrella PR.
- **`/hitl:cleanup`** removes a finished feature's worktree and branches, and tells you if
  the documents reached your main branch because the wipe PR did not merge first.

In a repository that did run `/hitl:init`, `/hitl:brainstorming` and `/hitl:grill-me` follow
that repository's own rules instead.

## Make it yours, keep it current

- **`/hitl:customize`**: change one rule at a time (round limits, slice size, testing
  rules, ...). It asks you questions, then edits the marked paragraph. It refuses to touch
  the few lines the scripts parse.
- **New versions arrive by themselves.** Every feature or fix merged here is released
  automatically, so a new version exists within minutes of the merge. Claude Code does not
  update plugins from this marketplace on its own by default; to turn that on once, run
  `/plugin`, open **Marketplaces**, pick `hitl` and enable auto-update. Claude Code then
  updates shortly after a session starts. To update by hand: `claude plugin marketplace
  update hitl`, then `claude plugin update hitl`, then a new session or `/reload-plugins`. In
  a repository where hitl is installed, `/hitl:diff` then shows what changed, with each
  version's notes.
- **`/hitl:diff`**: shows what changed upstream since your installed version, file by file,
  next to your own edits. `--apply` opens the upgrade PR.
- **`/hitl:help`**: shows where your install stands, what to run next, and what is
  missing.

## The ideas behind it

- **Cold review beats self-review.** A reviewer that never saw the conversation can't be
  talked into agreeing with it.
- **Size is never a reason to skip a step.** A one-field change gets a one-paragraph spec,
  but it still gets a spec.
- **Vertical slices, never horizontal.** Each PR is the thinnest change a behaviour test
  can prove. A migration without the code that uses it isn't a slice.
- **The agent decides code; you decide design.** Code-level findings are settled by the
  orchestrator and written into the PR. Design questions come to you, one at a time.
- **You own the files.** No hidden runtime and no prompt you can't read or change.

## Developing

```bash
pnpm install
pnpm test           # script tests + drift test
pnpm format:check
```

This repository's own `.claude/`, `.hitl/HITL.md` and `scripts/hitl/` are rendered from
`templates/`, and `pnpm test` fails if they drift apart. Edit the template and its copy
together. See `AGENTS.md` for refreshing the install manifest.

Pairs well with [Matt Pocock's skills](https://github.com/mattpocock/skills): `/grill-me` is
a good way to start a feature whose shape you can't see yet, and `/hitl:grill-me` starts the
whole chain from it.

## License

[MIT](LICENSE).
