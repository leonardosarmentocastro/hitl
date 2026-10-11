#!/usr/bin/env bash
# Stop hook: refuse to end the turn while any spec or plan in the working tree has no
# "**Reviewed:**" header line. Exit 2 + stderr makes the agent keep working with the
# reason; the harness caps consecutive refusals at 8.
#
# The tree is the git root of the session's current folder — the payload's `cwd`, which
# follows EnterWorktree — so a session in a worktree is never gated on a sibling session's
# files. Any failure (no payload, not JSON, no cwd, no node, not a git folder) falls back to
# CLAUDE_PROJECT_DIR, then $PWD: the worst case is the launch folder, never no gate.
set -u

payload_cwd() {
  [ -t 0 ] && return 1
  command -v node >/dev/null 2>&1 || return 1
  node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try {
        const c = JSON.parse(s)?.cwd;
        if (typeof c === "string" && c !== "") process.stdout.write(c);
        else process.exit(1);
      } catch {
        process.exit(1);
      }
    });'
}

root=""
if cwd=$(payload_cwd); then
  root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || root=""
fi
cd "${root:-${CLAUDE_PROJECT_DIR:-$PWD}}" 2>/dev/null || exit 0

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
