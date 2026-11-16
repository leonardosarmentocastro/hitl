#!/usr/bin/env bash
# Stub of the installed PR shim for the cleanup tests. `list` prints the JSON array in
# $FAKE_PRS (the engine filters by head itself), each record given a GitHub-style `ref`
# (`#<number>`) unless it carries one; FAKE_PRS_FAIL=1 fails like a host error.
set -u
if [ "${FAKE_PRS_FAIL:-}" = 1 ]; then
  echo "stub: host unreachable" >&2
  exit 2
fi
[ "${1:-}" = list ] || { echo "stub: only list is supported" >&2; exit 1; }
node -e '
const prs = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
process.stdout.write(JSON.stringify(prs.map((p) => ({ ref: `#${p.number}`, ...p }))));
' "${FAKE_PRS:?FAKE_PRS must be set}"
