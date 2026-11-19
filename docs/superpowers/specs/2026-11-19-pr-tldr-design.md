# PR bodies a human can read in seconds — design

**Review mode:** simple

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
| `Plan:` line | agents (the slice review is handed the plan path; the doctrine names the line as parsed) |
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

## What

<2–3 sentences>

## Why

<2–3 sentences>

<one section per pr-section fact — no-install mode only, as today>

<details>
<summary>For agents — skip when reviewing</summary>

Plan: <plan path>

## Review decisions

<as today>

</details>
```

The umbrella PR body is the same, with the `## Slices` block (unchanged, markers included)
between `## Why` and the fold, `Plan: <umbrella spec path>` inside the fold, and no
`## Review decisions`. `## Notes` is removed.

### Rules

- **TL;DR.** 1 to 3 bullets. Each is one line, about 15 words at most, a fragment rather
  than a sentence. It says only what changed, as someone using the thing would notice it.
  No why, no how, no risk, no file, function or test names. In the umbrella PR it
  summarises the feature; it is never one bullet per slice.
- **What / Why.** Their own `##` sections after the TL;DR, with today's length and register
  rules ("explain it as you would to an intern"; one honest line is fine for a trivial
  change).
- **How is deleted**, from the slice PR, the umbrella PR and the doctrine. It does not move
  into the fold: it has no reader.
- **The fold.** One `<details>` block, last in the body, summary text exactly
  `For agents — skip when reviewing`. A blank line follows `<summary>` and precedes
  `</details>` so the Markdown inside renders on GitHub and GitLab.
- **`Plan:` moves into the fold.** It stays a line of its own, starting at column 0, so
  whatever looks for it by name still finds it.
- **Review decisions move into the fold**, content unchanged. The human chose this knowing
  the consequence: declined and deferred findings pass without the human seeing them
  unless they open the fold. Commenting on the PR still overturns one.
- **A section names its reader.** New doctrine rule: a section enters a PR body only if it
  has a reader — the human (above the fold, short) or an agent (inside the fold). A section
  with neither is not written.
- The generated wipe PR stays exempt from all of this.

### The ticket link

- **Where it lives.** A `**Ticket:**` line in the spec header block, beside
  `**Review mode:**`. Its value is `none`, or one Markdown link `[<label>](<url>)`.
- **Who sets it.** `/review-spec` asks, at the same moment and under the same conditions as
  the review-mode question (no line, no `**Reviewed:** round` recorded, not a dry run):
  "Is there a ticket for this? Paste its link, or say none." The answer is written to the
  header and committed alone (`docs(spec): record ticket`). A link the human gave earlier
  in the design session is written into the spec when it is drafted, and then nothing is
  asked. Otherwise only the human changes the line, by hand, in a commit.
- **The label.** hitl never fetches from the tracker. A URL plus a title the human gave →
  `<KEY>: <title>` when the URL carries a key, else the title. A bare URL → the key when
  the URL's path carries one (a segment shaped like `PROJ-123`), else the URL itself.
- **Reading it.** A small script, installed beside `review-mode.sh` and shipped in
  `runtime/` like it, takes the spec path(s) and prints the ticket line(s) or `none`. It
  refuses (exit 2) a value that is neither `none` nor one link, and a URL that is not
  `http://` or `https://`. A label can hold no `]` and no line break. `absent` is treated as
  `none`. It has behaviour of its own, so it is built test-first.
- **Using it.** `/implement-stack` (each slice PR) and the handover agent (the umbrella PR
  body) put `### [<label>](<url>)` as the first line of the body. `none` or absent → no
  line at all. When a feature lists several specs with different tickets, each distinct
  ticket gets its own `###` line, in spec order.
- Any tracker works: hitl treats the ticket as a label and a URL, nothing more.

### What changes

- `templates/HITL.md` § Pull requests (inside the `pr-body-sections` knob anchors) and
  § Load-bearing invariants (add the `**Ticket:**` line; `Plan:` stays).
- `templates/claude/commands/implement-stack.md` — the slice body.
- `templates/claude/agents/handover.md` and `templates/claude/commands/umbrella-pr.md` — the
  umbrella body and the "everything from `Plan:` through `## Notes`" instruction.
- `templates/claude/commands/review-spec.md` — the ticket question.
- `commands/customize.md` — the `pr-body-sections` knob description.
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
- Fetching ticket titles from Jira, monday or any tracker.
- Enforcing the TL;DR limits mechanically.

## Anti-goals

- A TL;DR that grows back into prose, or that restates What.
- A PR body that loses the `Plan:` line or the Review decisions for the agents that read them.
- Asking about a ticket more than once per spec.

## Constraints

- `feat/adversarial-review-mode` (umbrella PR #63, three review modes) is open and edits the
  same templates, including the Review decisions block and `/review-spec`'s mode question.
  This feature branches from `main` as it is; whichever merges second rebases.
- Installed repositories receive the change through `/hitl:diff --apply`. If the release
  notes that PR #63 introduces are on the base branch when a slice is implemented, the slice
  adds a note saying the PR body changed shape; if not, no note is written.
- `pr-section` facts (no-install mode) are sections a human asked for: they stay above the
  fold, after `## Why`, slice PRs only.

## Delivery slices

1. **The body shape.** Slice and umbrella PR bodies as above, without the ticket line:
   bullet TL;DR, What, Why, no How, no Notes, the fold with `Plan:` and Review decisions,
   the doctrine rules.
2. **The ticket link.** The `**Ticket:**` spec line, the question in `/review-spec`, the
   script, and the `###` line in both bodies.

## Left to the builder

- The ticket script's name and exact output format.
- Whether `/implement-stack` reads the ticket from the specs each slice or the handover
  document carries it.
- The exact wording of the template placeholders.
