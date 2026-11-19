# `/hitl:grill-me` — start a hitl design session from a grill

## Intent

`/hitl:brainstorming` is the entry point that starts a hitl design session in any repository:
prerequisites, mode, doctrine, worktree, gates, memory, then the superpowers brainstorming
skill. hitl already recommends Matt Pocock's `/grill-me` for a feature whose shape is unclear,
but a human who wants that start has to run the grill by hand and then enter the chain by
hand.

`/hitl:grill-me <what to design>` is a second entry point. It does everything
`/hitl:brainstorming` does, and opens the design conversation with a grill; when the grill
ends, its conclusions become the input of the brainstorming skill, which writes the spec.

## Goals

- One command that goes from "an idea I cannot see the shape of" to a hitl spec under review.
- The spec that results has the same shape as any other hitl spec, because the same skill
  writes it.
- Works wherever `/hitl:brainstorming` works: installed and no-install repositories, GitHub,
  GitLab, and hosts with no PR backend.

## Non-goals

- Making a bare `/grill-me` (outside hitl) flow into the chain. No hook is added.
- Changing `/hitl:brainstorming`, the doctrine, any template, or any script under `runtime/`
  or `installer/`.
- Rendering the two entry commands from one template (see Approaches).
- Changing the messages in other commands that say `start with /hitl:brainstorming`, the
  plugin description in `.claude-plugin/plugin.json`, or the `AGENTS.md` block the installer
  writes.
- A release or version bump.

## Anti-goals

- A grill that is cut short so the chain can proceed. The grill ends when the human confirms
  a shared understanding, never earlier.
- A brainstorm that reopens what the grill settled.
- A command that carries its own copy of the grill's instructions.

## Constraints

- `/grill-me` itself cannot be invoked by a command: in current versions of Matt Pocock's
  skills it is marked `disable-model-invocation: true` and its body is "Run a `/grilling`
  session". The skill a command can invoke is `grilling`. Older versions have an invocable
  `grill-me` and no `grilling`.
- The skill is not a plugin, so there is no `enabledPlugins` entry to check; whether it is
  present is known only from the skills the session lists as available.
- `commands/brainstorming.md` is hand-written (it is not in `pluginFiles()`), and so is the
  new command. Markdown is never formatted.
- Commands are prompts: validated by a dry run, with a test pinning only the fixed copy and
  what scripts and other commands depend on.

## Approaches

Decided with the human, one at a time.

**How the spec comes to exist after the grill**

1. *Hand over to the brainstorming skill* — **chosen.** The grill's conclusions are its
   input; it lays out approaches and writes the spec. Same spec shape as every other hitl
   feature; costs a second, shorter conversation phase.
2. Write the spec directly from the grill. One conversation, but the command would own a spec
   format that can drift from what the reviewers expect.

**Where the grill's instructions come from**

1. *Require Matt Pocock's skill, found by name* — **chosen.** Stop with the install line when
   it is missing. It is the user's own `/grill-me`, with upstream improvements; the check is
   Claude reading its skill list, and another upstream rename would need a command update.
2. Carry the grill text in the command. No prerequisite, but a copy that goes stale.
3. Use the skill if present, else built-in text. Never stops, but two behaviours to describe
   and dry-run.

**How the command is built**

1. *A second hand-written file with a drift test* — **chosen.** Smallest change;
   `brainstorming.md` untouched; about 130 lines exist twice, and a test fails when the shared
   steps differ. Revisit (approach 2) if a third entry point appears.
2. One template, two rendered commands. One place to edit, but the renderer needs a new kind
   of marker and tests — more machinery than the feature.
3. A thin command that says "follow `brainstorming.md`, except…". Claude would apply the
   differences in its head mid-procedure, including inside exact-wording messages.

**How the grill connects to the brainstorm**

1. *Chained inside the command's last step* — **chosen.**
2. A Claude Code hook. No hook event corresponds to "the grill is finished", and a hook would
   also fire for a bare `/grill-me`.

## Design

### The command

`commands/grill-me.md`, a copy of `commands/brainstorming.md` with exactly these differences:

1. **Frontmatter.** Its own `description`, naming the grill start, the hand-over to the
   brainstorming skill, and `Usage: /hitl:grill-me <what to design>`.
2. **Its own name.** Every place `brainstorming.md` names `/hitl:brainstorming` as the command
   to re-run (the superpowers stop message, the `GITLAB_TOKEN` message) names `/hitl:grill-me`.
   Mentions of the *superpowers brainstorming skill* are unchanged.
3. **One more prerequisite, in step 1**, checked in the same batch as the others and before
   anything is created. The session's available skills must include `grilling`, or else an
   invocable `grill-me`. If neither is there, stop and print exactly:

   ```
   /hitl:grill-me needs the grill-me skill from Matt Pocock's skills. Install it, then re-run /hitl:grill-me:
     npx skills add mattpocock/skills
   Or start with /hitl:brainstorming, which needs no extra skill.
   ```

   The superpowers prerequisite stays: the brainstorming and writing-plans skills are still
   used.
4. **The design-session step** (step 7 in no-install mode, and the matching sentence of the
   `mode: "installed"` branch in step 2). Where `brainstorming.md` invokes the superpowers
   brainstorming skill with `$ARGUMENTS`, this command does three things in order:
   1. Invoke `grilling` (or the invocable `grill-me` found in step 1) with `$ARGUMENTS`. The
      grill runs to its own end condition: the human confirms a shared understanding. The
      command says not to end it early and not to write a spec during it.
   2. Write out, in the conversation, the shared understanding: every decision reached, in the
      human's terms, and anything left open. The human can correct it.
   3. Invoke the superpowers brainstorming skill with `$ARGUMENTS` and that summary, under the
      doctrine. The decisions in the summary are settled: the brainstorm does not reopen them.
      It still lays out the approaches and writes the spec, and the doctrine governs from
      there.

Everything else — the mode check, the old-layout refusal, the host rules, the doctrine read,
the worktree procedure, `session.mjs start`, gates, remembering, the context block — is
word-for-word `brainstorming.md`. In particular the worktree is created before the grill
starts, as the doctrine requires for "a brainstorm, a grill, a design discussion".

### Tests

- `scripts/__tests__/grill-me-command.test.ts`: the same pins as
  `brainstorming-command.test.ts` against `commands/grill-me.md`, plus: the exact
  missing-skill message; that the grill is invoked before the brainstorming skill in both the
  installed branch and the design-session step; and that the hand-over states the decisions
  are settled.
- A drift test in the same file: steps 1–6 of the two commands are equal once the command's
  own name is normalised and the grill prerequisite is removed. A fix made to one file and not
  the other fails it.
- `plugin-prompts.test.ts`: `grill-me` joins the commands that must carry the old-layout
  upgrade message.

### Documentation

- `README.md`, § Use it without installing: name `/hitl:grill-me` beside
  `/hitl:brainstorming`, one or two sentences on when to pick it and that it needs Matt
  Pocock's skills. The closing "Pairs well with" paragraph points to `/hitl:grill-me`.
- `commands/help.md`: the closing recommendation names `/hitl:grill-me` as the way to start
  from a grill inside hitl.

## Left to the builder

- The exact wording of the command's description, of the three design-session sub-steps, and
  of the README and help sentences.
- How the drift test normalises the two files, as long as a one-sided edit to a shared step
  fails it.

## Validation

`pnpm test` and `pnpm format:check`. The command is a prompt: a dry run of `/hitl:grill-me`
in a no-install repository and in this (installed) one, checking that the missing-skill stop
fires before any worktree exists and that the brainstorm starts from the grill's summary.

## Delivery slices

One slice.

1. **The `/hitl:grill-me` command** — `commands/grill-me.md`, its tests (including the drift
   test and the old-layout list), and the README and help text.
