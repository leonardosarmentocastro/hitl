# PR bodies a human can read in seconds — design

**Review mode:** simple
**Reviewed:** round 1 (2026-11-19) · round 2 (2026-11-19).

## Goal

A reviewer flooded with AI-written PRs decides in seconds whether a PR deserves a real
review. Today hitl's `## TL;DR` is three paragraphs (What / Why / How, 2–5 sentences each;
the umbrella PR of the last feature ran to about 250 words), followed by sections the human
never reads. The PR body is reshaped so that:

- the TL;DR is a real one: a few one-line bullets;
- everything a human is expected to read comes first and is short;
- everything only an agent reads is folded away and labelled as such;
- nothing is in the body without a reader;
- when the feature has a ticket, its title is a clickable link above the TL;DR.

## Who reads what today

Checked against the templates on `main`:

| Part of the body | Reader |
|---|---|
| slice `Plan:` line | agents (the slice review is handed the plan path; the doctrine names the line as parsed) |
| umbrella `Plan:` line | nobody — no slice review reads an umbrella PR, and the path is wiped before it merges |
| What, Why | the human |
| How | nobody — no script or agent reads it, and the human skips it |
| `## Review decisions` | a later `/review-slice --pr <n>` reads it so a declined finding is not raised again; the human skips it |
| umbrella `## Slices` table (`<!-- stack -->` block) | the human (links to the slice PRs, the "merge the wipe PR last" line); `/umbrella-pr` rewrites it |
| umbrella `## Notes` | nobody |

## Design

### The slice PR body

```
### [<ticket label>](<ticket url>)

## TL;DR

- <what changed, one line>
- <a second change, only if there is one>

## Why

<2–3 sentences>

## Needs you

- <one line per case under Rules; the whole section is omitted when there is none>

<one section per pr-section fact — no-install mode only, as today>

<details>
<summary>For agents — skip when reviewing</summary>

Plan: <plan path>

## Review decisions

<as today>

</details>
```

### The umbrella PR body

```
### [<ticket label>](<ticket url>)

## TL;DR

- <what the feature changes, one line>

## Why

<2–3 sentences>

## Slices

<the <!-- stack --> block, unchanged, markers included>
```

No `Plan:` line, no `## Notes`, no fold: nothing in the umbrella body is for agents only.

### Rules

- **TL;DR.** 1 to 3 bullets. Each is one line, about 15 words at most, a fragment rather
  than a sentence. It says only what changed, as someone using the thing would notice it.
  No why, no how, no risk, no file, function or test names. In the umbrella PR it
  summarises the feature; it is never one bullet per slice. A change nobody using the thing
  would notice (a refactor) says so in its one bullet: `No visible change: <what was
  reorganised>`.
- **The TL;DR is the What.** There is no `## What` section: it would repeat the bullets.
- **Why.** Its own `##` section after the TL;DR, 2–3 sentences, in today's register
  ("explain it as you would to an intern"; one honest line is fine for a trivial change).
- **Needs you** (slice PRs only). Three kinds of line in today's Review decisions block ask
  something of the human, and stay where the human reads: a deferred gap the reviewer
  marked 🟠 (a question about reordering the slices); "The security follow-up did not run
  for this slice."; and each allowed plan edit the implementer made. They are written as
  one line each under `## Needs you`, after `## Why`, and are not repeated in the fold.
  The section is written only when at least one such line exists, and holds nothing else:
  these three cases are the whole list, and a fourth is a change to the doctrine. This is
  not the situation report under Non-goals: it is existing content keeping its reader.
- **How is deleted**, from the slice PR, the umbrella PR and the doctrine. It does not move
  into the fold: it has no reader. The umbrella's old Notes called its description "the
  durable record" of the approach; after this change no PR body records the approach.
  Accepted: the code and its history are the record.
- **The fold** (slice PRs only). One `<details>` block, last in the body, summary text
  exactly `For agents — skip when reviewing`. The label addresses the human; an agent told
  to read the PR body reads the fold. A blank line follows `<summary>` and precedes
  `</details>` so the Markdown inside renders on GitHub and GitLab.
- **`Plan:` moves into the fold.** It stays a line of its own, starting at column 0, so
  whatever looks for it by name still finds it.
- **Review decisions move into the fold**, minus the Needs-you lines. The human chose this knowing
  the consequence: declined and deferred findings pass without the human seeing them
  unless they open the fold. Commenting on the PR still overturns one. The Review decisions
  *comment* a fix-up posts on a PR is left as it is: a comment is not the body, and it
  answers changes the human asked for, so the human is its reader.
- **A section names its reader.** New doctrine rule: a section enters a PR body only if it
  has a reader — the human (above the fold, short) or an agent (inside the fold). A section
  with neither is not written.
- **Exempt:** the generated wipe PR, as today, and the upgrade PR `/hitl:diff --apply`
  opens. The upgrade PR's body is a merge report with a per-file table, not a description
  of a feature; it keeps its shape.

### Bodies written before this change

The umbrella body is written into the handover document by the handover agent and copied
by `/umbrella-pr` later.

- `/umbrella-pr` copies everything under the handover document's `## Umbrella PR body`
  heading, stopping at the first `##` heading that is not one of a body's own (`## TL;DR`,
  `## Why`, `## Slices`, and `## Notes` in an old body) or at the end of the document. A
  heading a feature added to its handover document is therefore never copied into the PR.
- `/umbrella-pr` never reshapes what it copies: a body in the old shape is opened as it is.
  This covers a repository upgraded mid-feature, the open `feat/adversarial-review-mode`
  stack, and this feature's own handover document.
- A re-run of the handover agent (`resume`, `fix-up`) rewrites the section as it rewrites
  every template section, so from then on the document holds the new shape, with the
  ticket line as the specs read at that moment.
- An umbrella PR that is already open is edited only between its stack markers, as today.

### The ticket link

- **Where it lives.** A `**Ticket:**` line in the spec header block, beside
  `**Review mode:**`. Its value is `none`, or one Markdown link `[<label>](<url>)`.
- **Who sets it.** `/review-spec` sets it, at the same moment and under the same conditions
  as the review-mode question (no `**Ticket:**` line, no `**Reviewed:** round` recorded, not
  a dry run), whether or not the spec has a `**Review mode:**` line.
  If the human already gave a ticket link in this session, it uses that and asks nothing.
  Otherwise it asks once: "Is there a ticket for this? Paste its link — and its title, if
  you want it shown — or say none." The answer is checked against the script's rules
  before anything is written; an answer that would be refused is asked again on the spot,
  with the reason, which is the same question and not a second one. The
  line is written to the header and committed alone (`docs(spec): record ticket`).
  Otherwise only the human changes the line, by hand, in a commit. No other command
  changes.
- **The label.** hitl never fetches from the tracker. The key is the last part of the URL's
  path shaped like `PROJ-123` (capital letters and digits, a dash, digits; case matters).
  A URL plus a title the human gave → `<KEY>: <title>` when there is a key, else the title.
  A bare URL → the key, else the URL itself. `[` and `]` in a title are written as `(` and
  `)`; `@` and backticks are dropped, so a title never notifies an account from a PR body. The label is computed by the `/review-spec` prompt and the question is skipped in a
  dry run, so the test of the template's text is its whole proof.
- **Reading it.** A small script, installed beside `review-mode.sh` and shipped in
  `runtime/` like it, takes the spec path(s) and prints the ticket line(s) or `none`. It
  refuses (exit 2) a value that is neither `none` nor one link; a URL that is not
  `http://` or `https://`, or that holds a space or a `)`; a label holding `]` or a line
  break, an `@` or a backtick; and a spec path that does not exist. `none` is read as
  `**Review mode:**` values are: case, surrounding whitespace and one trailing period are
  ignored. `absent` is treated as `none`. Each spec is judged on its own: the script
  prints the ticket of every spec it accepts and exits 2 if it refused any, naming it. It
  has behaviour of its own, so it is built test-first.
- **When it refuses.** A ticket is a link, not a rule about how the feature is reviewed, so
  a refusal never stops an implementation run. `/review-spec` prints the message and stops
  before reviewing, as it does for a bad review-mode line: the human is there to fix it.
  `/implement-stack` and the handover agent write the body without the refused spec's
  ticket line, keep the lines of the specs that were accepted, and report the refusal in
  their reply.
- **Using it.** `/implement-stack` (each slice PR) and the handover agent (the umbrella PR
  body) each run the script on the specs the handover document lists, when they write a
  body — `/implement-stack` once per slice, as it reads the review mode — and put `### [<label>](<url>)` as the first line of the body. `none` or absent → no
  line at all. When a feature lists several specs with different tickets — different by
  URL — each gets its own `###` line, in spec order; the first label seen for a URL wins.
- **A line changed later.** A `**Ticket:**` line edited by hand reaches the slice PRs
  opened after the edit, and the umbrella body only if the handover agent runs again
  before the umbrella PR opens. Accepted: otherwise the human edits the umbrella PR.
- Any tracker works: hitl treats the ticket as a label and a URL, nothing more.

### What changes

- `templates/HITL.md`:
  - § Pull requests, the `Plan:` bullet (outside the knob anchors): the line sits in the
    fold of a slice PR and is for agents; "and human reviewers" goes; the umbrella PR
    carries no `Plan:` line.
  - § Pull requests, inside the `pr-body-sections` knob anchors: the TL;DR and Why rules
    replace the What / Why / How bullet; the Review decisions bullet says it sits in the
    fold.
  - § Pull requests, outside the anchors, so tuning cannot remove them: the "a section
    names its reader" rule, the Needs-you list, the two exemptions, and the ticket line.
  - § Specs and plans: a bullet defining `**Ticket:**`, as `**Review mode:**` has one.
  - § Load-bearing invariants: add the `**Ticket:**` line; `Plan:` stays.
- `templates/claude/commands/implement-stack.md` — the slice body, and where the "security
  follow-up did not run" line and the plan-edit lines go.
- `templates/claude/commands/review-slice.md` — the 🟠 deferred gap is told to the human
  under Needs you, not in the Review decisions.
- `templates/claude/agents/handover.md` and `templates/claude/commands/umbrella-pr.md` — the
  umbrella body and how it is delimited.
- `templates/claude/commands/review-spec.md` — the ticket question.
- `commands/customize.md` — the `pr-body-sections` knob row and the invariant list in
  § "Refuse an invariant". This file is written by hand, not rendered.
- The new ticket script under `templates/scripts/`, registered in `installer/lib.mjs`.
- Tests: `pr-body.test.ts`, `plugin-prompts.test.ts` and the knob-anchor test pin the new
  shape; new tests for the ticket script.
- Re-render: `.hitl/manifest.json` and the plugin's no-install files, per `AGENTS.md`.

## Approaches

1. **Wording only — chosen.** Change the templates and the doctrine; the tests pin the
   shape of the templates. The TL;DR is long today because the template asks for sentences
   and the writer obeys, so asking for bullets fixes the cause.
2. **Wording plus a check.** The PR script also refuses a body whose TL;DR is over the
   limit. Guarantees the shape, but adds code and a new way for an implementation run to
   stop. Not chosen; worth revisiting only if wording alone does not hold.
3. **Keep the Review decisions visible** (always, only when non-empty, or as a one-line
   count). Not chosen: the human does not read them, and a count line is part of the
   "situation report" below.

## Non-goals

- **A situation-report section** (risk, what needs the human's decision). The human finds
  it promising as input for a classifier that decides whether a PR needs human attention,
  possibly as its own section later. Not now.
- Rewriting the bodies of PRs already open or merged.
- Reshaping the upgrade PR body.
- Fetching ticket titles from Jira, monday or any tracker.
- Enforcing the TL;DR limits mechanically.
- A release note for this change: the release-notes mechanism is not on `main`.

## Anti-goals

- A TL;DR that grows back into prose.
- A slice PR body that loses the `Plan:` line or the Review decisions for the agents that
  read them.
- Asking about a ticket more than once per spec.

## Constraints

- `feat/adversarial-review-mode` (umbrella PR #63, three review modes) is open and edits the
  same templates, including the Review decisions block and `/review-spec`'s mode question.
  This feature branches from `main` as it is; whichever merges second rebases.
- Installed repositories receive the change through `/hitl:diff --apply`.
- `pr-section` facts (no-install mode) are sections a human asked for: they stay above the
  fold, after `## Why`, slice PRs only.

## Delivery slices

1. **The body shape.** Slice and umbrella PR bodies as above, without the ticket line:
   bullet TL;DR, Why, no What, no How, no Notes, Needs you, the fold with `Plan:` and
   Review decisions in slice PRs, the umbrella body's delimiting, the doctrine rules.
2. **The ticket link.** The `**Ticket:**` spec line, the question in `/review-spec`, the
   script, and the `###` line in both bodies.

## Acceptance

The tests on template text prove the templates ask for the new shape, not that a writer
produces it. Each slice is also proven by one dry run, observed by a human as `AGENTS.md`
prescribes for prompts, and reported in the slice PR:

- Slice 1: the handover agent and `/umbrella-pr --dry-run` on a fixture produce an umbrella
  body with 1 to 3 one-line bullets, `## Why`, and no What, How, Notes or `Plan:`; a slice
  body written from the new template has the fold last, with `Plan:` at column 0 inside
  it, and no `## Needs you` when none of the three cases applies.
- Slice 2: the same run with a `**Ticket:**` link shows the `###` link as the first line;
  with `none` it shows no such line.

## Decisions and declined alternatives

- Round 1, YOUR CALL — the TL;DR and `## What` asked for the same content. The human chose
  to drop `## What`; giving it a different job was declined as a line writers would blur.
- Round 1 — reshaping the `/hitl:diff` upgrade PR body: declined, out of scope; it is named
  as exempt instead.
- Round 1 — a release note conditional on another branch: declined; this feature writes
  none.
- Round 2, YOUR CALL — the fold would also hide lines that ask something of the human.
  The human chose to show them under `## Needs you`; folding them too was declined,
  because a short body would stop meaning "this PR is routine".

## Left to the builder

- The ticket script's name and exact output format.
- The exact wording of the template placeholders.
