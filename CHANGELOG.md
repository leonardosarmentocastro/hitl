# Changelog

What changes for a repository that has hitl installed, or for someone who runs it without an install.

## Unreleased

## 0.4.1

- Releases publish in the same run (#77)

## 0.4.0

- `elaborate` no longer includes the security review: it is now one cold review and one adversarial review. The mode that includes the security review is called `complete`. A spec that says `**Review mode:** elaborate` and should keep its security review must be changed to `complete` by hand. Everyone working on a repository should update the plugin together: an older plugin refuses `complete` and still runs the security review for `elaborate`.
- Slice and umbrella PR bodies are shorter: a bullet TL;DR and a Why, a `## Needs you` section only when the human must act, and everything only agents read (the plan line, review decisions) folded at the bottom.
- `/review-spec` asks once for the feature's ticket and records it as a `**Ticket:**` spec line; slice and umbrella PR bodies then open with the ticket as a clickable title.

- `/hitl:grill-me` — start a hitl design session from a grill (#57)
- Three review modes: simple, elaborate, complete (#63)
- PR bodies a human can read in seconds (#68)
- Automatic releases (#73)

## 0.3.0

- The first release with a changelog; earlier changes are not listed.
