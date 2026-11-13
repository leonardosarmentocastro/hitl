#!/usr/bin/env bash
# The plugin's Stop hook (no-install mode): refuse to end the turn while a spec or plan the
# hitl feature added lacks its "**Reviewed:**" header line. Exit 2 + stderr makes the agent
# keep working with the reason.
#
# It runs in every repository on the machine, so it acts only in a worktree registered by
# /hitl:brainstorming (an active-feature record in project memory) of a repository without
# hitl installed, and only on documents absent at the merge-base with the record's base ref.
# Every other case — and any internal failure — exits 0: it must never block a session it
# does not own. Hand-written, not rendered; the header rule is the installed hook's, kept in
# step by scripts/__tests__/plugin-stop-hook.test.ts.
set -u

# No project memory on this machine: nothing to guard, and no node start-up per turn.
[ -d "${HITL_HOME:-$HOME/.hitl}/projects" ] || exit 0

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd) || exit 0

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

# The session's git root: the payload's cwd (it follows EnterWorktree), else
# CLAUDE_PROJECT_DIR, else $PWD — the installed hook's chain. Not a git folder: exit 0.
root=""
if cwd=$(payload_cwd); then
  root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || root=""
fi
if [ -z "$root" ]; then
  root=$(git -C "${CLAUDE_PROJECT_DIR:-$PWD}" rev-parse --show-toplevel 2>/dev/null) || exit 0
fi
cd "$root" 2>/dev/null || exit 0

# An installed repository runs its own hook.
[ -f .claude/hitl.json ] && exit 0

# Only a registered worktree is guarded.
command -v node >/dev/null 2>&1 || exit 0
base=$(node "$HERE/session.mjs" get --worktree "$root" --field base 2>/dev/null) || exit 0
[ -n "$base" ] || exit 0

# Documents present at the merge-base predate the feature. Without one, nothing can be told
# apart, so every document is checked (and never against the index: `:<path>` would skip
# tracked files).
mb=$(git merge-base HEAD "$base" 2>/dev/null) || mb=""

# The header block is everything between the "# " title and the first "## " heading;
# a Reviewed line quoted inside a task body or a code block does not count.
has_reviewed_header() {
  awk '/^## /{exit} /^\*\*Reviewed:\*\*/{found=1; exit} END{exit !found}' "$1"
}

# `count` rather than ${#missing[@]}: under `set -u` an empty array expansion is an
# unbound-variable error before bash 4.4.
missing=()
count=0
for f in docs/superpowers/specs/*.md docs/superpowers/plans/*.md; do
  [ -f "$f" ] || continue
  if [ -n "$mb" ] && git cat-file -e "$mb:$f" 2>/dev/null; then continue; fi
  has_reviewed_header "$f" || { missing+=("$f"); count=$((count + 1)); }
done

[ "$count" -eq 0 ] && exit 0

{
  echo "Unreviewed artefact(s) in this hitl feature — run the review loop before ending the turn:"
  for f in "${missing[@]}"; do echo "  - $f"; done
  [ -z "$mb" ] &&
    echo "(base ref $base was not found locally, so every spec and plan was checked — run git fetch)"
  echo "The line belongs in the header block, above the first '##' heading; one quoted further"
  echo "down does not count. Specs: /hitl:review-spec. Plans: /hitl:review-plan. If the reviewer"
  echo "failed, the command records a '**Reviewed:** round N failed' line."
} >&2
exit 2
