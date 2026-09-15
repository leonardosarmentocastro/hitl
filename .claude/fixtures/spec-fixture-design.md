# Expense tags — design (FIXTURE — not a real feature)

**Status:** fixture for reviewer dry runs. Deliberately imperfect.

## Goal

Let a person attach free-text tags to an expense and filter a month's list by tag.

## Non-goals

- Tag colours, tag hierarchies, sharing tags across books.

## Design

- A tag is a string of 1–24 characters, stored on the expense row as a text array.
- The expense form gains a tag input; the month list gains a tag filter chip row.
- The API adds `tags` to the expense create/update payloads and a `tag` query parameter to
  the month list route.

## Acceptance criteria

1. A person can add a tag while creating an expense and see it on the row.
2. Filtering by a tag shows only rows carrying it.
3. The tag input feels fast.

## Delivery slices

1. **Schema.** Migration adding the `tags` column; no consumer yet.
2. **API.** Create/update accept `tags`; month list filters by `tag`.
3. **Web.** Tag input and filter chips, with stories.
