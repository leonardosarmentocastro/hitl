#!/usr/bin/env bash
# Stop hook: refuse to end the turn while any spec or plan in the working tree has no
# "**Reviewed:**" header line. Exit 2 + stderr makes the agent keep working with the
# reason; the harness caps consecutive refusals at 8. stdin (the hook payload) is
# ignored on purpose: the answer depends only on the files.
set -u
cd "${CLAUDE_PROJECT_DIR:-$PWD}" 2>/dev/null || exit 0

# The header block is everything between the "# " title and the first "## " heading;
# a Reviewed line quoted inside a task body or a code block does not count.
has_reviewed_header() {
  awk '/^## /{exit} /^\*\*Reviewed:\*\*/{found=1; exit} END{exit !found}' "$1"
}

# `count` rather than ${#missing[@]}: under `set -u` an empty array expansion is an
# unbound-variable error before bash 4.4, and exiting 1 would let the turn end.
missing=()
count=0
for f in docs/superpowers/specs/*.md docs/superpowers/plans/*.md; do
  [ -f "$f" ] || continue
  has_reviewed_header "$f" || { missing+=("$f"); count=$((count + 1)); }
done

[ "$count" -eq 0 ] && exit 0

{
  echo "Unreviewed artefact(s) in the working tree — run the review loop before ending the turn:"
  for f in "${missing[@]}"; do echo "  - $f"; done
  echo "The line belongs in the header block, above the first '##' heading; one quoted further"
  echo "down does not count. Specs: /review-spec. Plans: /review-plan. If the reviewer failed,"
  echo "the command records a '**Reviewed:** round N failed' line; a pre-workflow artefact is"
  echo "hand-marked '**Reviewed:** grandfathered (<date>)'."
} >&2
exit 2
