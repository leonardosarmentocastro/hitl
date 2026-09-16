#!/usr/bin/env bash
# Specs and plans are transient per-feature artifacts. This removes them from the
# current repo's working tree and commits. --push sends the commit to origin/main.
set -euo pipefail

PUSH=0
[ "${1:-}" = "--push" ] && PUSH=1

if [ ! -d docs/superpowers ]; then
  echo "nothing to wipe"
  exit 0
fi

git config user.name  >/dev/null 2>&1 || git config user.name "github-actions[bot]"
git config user.email >/dev/null 2>&1 || \
  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git rm -r --quiet docs/superpowers

if git diff --cached --quiet; then
  echo "nothing staged; skipping commit"
  exit 0
fi

git commit -q -m "chore(docs): wipe transient superpowers artifacts [skip ci]"
echo "wiped"

[ "$PUSH" -eq 1 ] && git push origin HEAD:main
exit 0
