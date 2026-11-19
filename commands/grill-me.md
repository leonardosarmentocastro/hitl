---
description: Start a hitl design session from a grill — its own worktree on a feature branch, then Matt Pocock's grill-me skill, then the superpowers brainstorming skill writes the spec from what the grill settled, under the hitl doctrine. Needs Matt Pocock's skills. Usage: /hitl:grill-me <what to design>
argument-hint: <what to design>
---

You are starting a hitl design session for: $ARGUMENTS

This command is the entry point in any repository. Where hitl is installed (`/hitl:init`
ran), it follows that repository's own rules. Where it is not, nothing hitl-owned is
committed to the repository: the doctrine ships with this plugin, and what the user teaches
hitl about this project lives on this machine. You orchestrate and ask; the scripts read and
write.

## 1. Prerequisites — before anything is created; stop on the first one missing

Check, in one batch:

```bash
node --version            # 20 or newer
git --version
```

and that superpowers is enabled: `enabledPlugins` in `~/.claude/settings.json` or in this
repository's `.claude/settings.json` contains a key starting with `superpowers@`. If it does
not, stop and print exactly:

```
hitl needs the superpowers plugin (its brainstorming and writing-plans skills shape the
artefacts this workflow reviews). Install it, then re-run /hitl:grill-me:
  claude plugin marketplace add obra/superpowers-marketplace
  claude plugin install superpowers@superpowers-marketplace
```

<!-- grill-me:only -->
and that a grill skill is available: the skills this session can invoke include one named
exactly `grilling`, or else one named exactly `grill-me`. A `grill-me` that only the human can
trigger is not in that list. Only these two un-namespaced names count: a namespaced entry
never does, and this command itself (`hitl:grill-me`) never counts.
Check superpowers first; when both are missing, print the superpowers message. If neither
grill skill is there, stop and print exactly:

```
/hitl:grill-me needs the grill-me skill from Matt Pocock's skills. Install it, then re-run /hitl:grill-me:
  npx skills add mattpocock/skills
Or start with /hitl:brainstorming, which needs no extra skill.
```
<!-- grill-me:end -->

For `node` or `git` missing, stop and name the one to install.

## 2. Mode

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/context.mjs" --repo "$PWD" --plugin-root "${CLAUDE_PLUGIN_ROOT}"
```

Exit `2` → this folder is not a git repository (or hitl could not read it): say so, with
its `error`, and stop. Otherwise read the JSON. A `base: null` with a `baseError` is not a
failure here — step 4 resolves the base and stops there if it cannot:

- **`layout: "old"`** → say exactly, as your only output, this message in a code block, and
  stop. Create no worktree, write no record.

  ```
  This repository uses an older hitl layout. Run /hitl:diff --apply to upgrade it.
  ```

- **`mode: "installed"`** → say exactly, as your first line:

  ```
  hitl is installed here — following this repository's rules.
  ```

  Read the repository's `.hitl/HITL.md`, create the worktree as it prescribes, run
  § The design conversation below, and follow the repository's doctrine,
  commands and agents from there. Read nothing from this plugin's doctrine, write no
  active-feature record and read no project memory. This command's own steps end here.
- **`host: "github"`** → also require `gh auth status` to succeed; if it does not, stop and
  name `gh` (installed and signed in) as what is missing.
- **`host: "gitlab"`** → also require a non-empty `GITLAB_TOKEN`; if it is empty, stop and
  say:

  ```
  hitl needs a GitLab access token with the `api` scope in `GITLAB_TOKEN`. Export it in the shell that runs Claude Code, then re-run /hitl:grill-me.
  ```

- **any other host** → say exactly, once, with `<host>` the JSON's `host`:

  ```
  Design session only here: there is no PR backend for this repository's host (<host>). A self-hosted GitLab needs GITLAB_URL set to its address.
  ```

  If the JSON also has a `hostProblem`, say it on the next line: it names what is wrong with
  the `GITLAB_URL` that is set. Then continue; neither `gh` nor the token is required here.

## 3. Doctrine

Read the file at the JSON's `doctrine` path in full. It is the hitl doctrine for this
session and governs everything after this step; where this command and the doctrine
differ, the doctrine wins.

## 4. Worktree

The base branch is never assumed. First:

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/session.mjs" base --repo "$PWD"
```

If it exits non-zero, say `cannot resolve the default branch: <its error>` and stop — never
assume one. Otherwise use its `base` wherever the procedure branches from the base
(`<base>`). Then run the doctrine's § Feature branches worktree procedure — including its
*Already in this topic's worktree* and *Collision* cases; do not improvise another one.
Once the session is in the topic's worktree — created now, already there, or an existing
one the human chose to reuse — register it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/session.mjs" start --worktree "<absolute worktree path>" --topic "<topic>" --base "<base>"
```

This writes the active-feature record and adds `.claude/worktrees/` and `.claude/reviews/`
to the clone's `.git/info/exclude`, so neither shows in `git status`.

## 5. Memory

From the step 2 JSON:

- `skipped` not empty → name those files: they are in the project memory folder
  (`memoryDir`) but are not valid facts, so they are ignored until fixed by hand.
- `gates` is `null` → run the doctrine's § Project memory, *Confirming gates*, with
  `${CLAUDE_PLUGIN_ROOT}` as `<Plugin root>`: discovery is
  `node "${CLAUDE_PLUGIN_ROOT}/installer/discover.mjs" --repo "$PWD"` and the save is
  `node "${CLAUDE_PLUGIN_ROOT}/runtime/memory.mjs" write --repo "$PWD" --name gates --type gates …`
  as the doctrine gives it. Do not start the design session without a confirmed answer —
  a list of gates, or "this repository has no gates".

## 6. Remembering

The doctrine's § Project memory, *Remembering*, applies for the whole session: whenever the
human states something specific to this project, ask once, verbatim,
`Remember this for this project?` — and write nothing to memory unless they say yes.

## 7. Design session

Print the hitl context block for the session and keep it in view — the doctrine refers to
its lines (`Plugin root`, `Base`, the gates, the project memory):

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/context.mjs" --repo "<absolute worktree path>" --plugin-root "${CLAUDE_PLUGIN_ROOT}" --format brief
```

Then run § The design conversation below, under the doctrine. The
project memory facts are this project's conventions and context for the design.

<!-- grill-me:only -->
## The design conversation

Both modes run this section: step 7, and the `mode: "installed"` branch of step 2 once the
worktree exists — "this command's own steps end here" there means steps 3 to 7, not this
section.

1. **Grill.** Invoke the grill skill found in step 1 — `grilling`, else `grill-me` — with
   `$ARGUMENTS`. Never invoke this command (`hitl:grill-me`) here. If the invocation fails,
   print the step 1 missing-skill message and stop; the worktree stays. The grill ends when
   the human confirms a shared understanding, or when the human asks to stop it ("enough,
   write it up"). Never end it yourself, and write no spec during it. A branch the human
   stopped before answering is an open item.
2. **Summary.** Write out, in the conversation, the shared understanding: every decision
   reached, in the human's terms, and every open item. Then stop and wait. Fold a correction
   in and show the corrected summary again; go on only when the human confirms it.
3. **Hand over.** Invoke the superpowers brainstorming skill with `$ARGUMENTS` and the
   confirmed summary, under the doctrine. Where the two disagree, the summary wins. Its
   decisions are settled: do not reopen them. Its open items are the brainstorm's questions.
   The brainstorm still lays out the approaches and writes the spec; the doctrine governs
   from there.

The topic, the branch prefix and the worktree were chosen from the request, before the
grill. When the grill outgrows them:

- **The name no longer fits.** It stays. Rename nothing.
- **Nothing to build.** The session ends here: no hand-over, no spec. Tell the human to run
  `/hitl:cleanup` from the main checkout — it never offers the worktree it is run from.
- **Two features.** Continue with one, the human's choice; name the other as out of scope in
  the summary.
<!-- grill-me:end -->
