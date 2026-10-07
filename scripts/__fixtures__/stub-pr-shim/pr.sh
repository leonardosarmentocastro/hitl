#!/usr/bin/env bash
# Stub of the installed PR shim for the cleanup tests. `list` prints the JSON array in
# $FAKE_PRS (the engine filters by head itself); FAKE_PRS_FAIL=1 fails like a host error.
set -u
if [ "${FAKE_PRS_FAIL:-}" = 1 ]; then
  echo "stub: host unreachable" >&2
  exit 2
fi
[ "${1:-}" = list ] || { echo "stub: only list is supported" >&2; exit 1; }
cat "${FAKE_PRS:?FAKE_PRS must be set}"
