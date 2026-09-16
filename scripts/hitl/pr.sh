#!/usr/bin/env bash
# hitl PR shim — the only thing in the installed workflow that talks to a code host.
#
#   pr.sh create  --base <branch> --head <branch> --title <text> --body-file <path> [--draft]
#   pr.sh list    --head-prefix <text> [--state open|merged|closed|all]     (default: all)
#   pr.sh view    <number>
#   pr.sh edit    <number> --body-file <path>
#   pr.sh comment <number> --body-file <path>
#
# stdout is exactly one JSON document: `list` prints an array, every other verb a record:
#   { number, url, head, base, state: open|merged|closed, draft, title, body }
# `view` adds reviews: [{ author, state: approved|changes_requested|commented, body }] and
# comments: [{ author, body, created_at }]. `edit` and `comment` return the record they touched.
#
# Exit codes: 0 ok · 1 usage (message on stderr) · 2 backend error (the host tool's stderr is
# passed through) · 3 on `create` only: a PR for that head already exists, and its record is
# on stdout so the caller can fall through to `edit`.
#
# The backend is `backend.sh` in this directory, installed by /hitl:init for the host the
# repository uses; it defines backend_create, backend_list, backend_view, backend_edit and
# backend_comment. The word is "PR" throughout; it is a merge request on GitLab.
#
# Best-effort per host, documented here so a backend author knows what may not map 1:1:
#   - draft PRs: GitHub and GitLab have them; Bitbucket has none (create ignores --draft).
#   - review vs comment: `reviews` is the host's formal review state; where a host has only
#     comments, `reviews` is [] and everything lands in `comments`.
#   - `[skip ci]` in the wipe commit: honoured by GitHub Actions and GitLab CI; not universal.
#   - a CI job's right to push to a protected main: GitHub Actions' token can with the right
#     permission; GitLab's CI_JOB_TOKEN cannot (needs a project access token).
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=backend.sh
. "$HERE/backend.sh"

usage() {
  echo "pr.sh: $1" >&2
  echo "usage: pr.sh create --base <b> --head <h> --title <t> --body-file <f> [--draft]" >&2
  echo "       pr.sh list --head-prefix <p> [--state open|merged|closed|all]" >&2
  echo "       pr.sh view <number> | edit <number> --body-file <f> | comment <number> --body-file <f>" >&2
  exit 1
}

need_number() {
  [[ "${1:-}" =~ ^[0-9]+$ ]] || usage "$2 needs a PR number"
}

verb=${1:-}
[ -n "$verb" ] || usage "verb missing"
shift

case "$verb" in
  create)
    base= head= title= body= draft=0
    while [ $# -gt 0 ]; do
      case "$1" in
        --base) base=${2:-}; shift 2 ;;
        --head) head=${2:-}; shift 2 ;;
        --title) title=${2:-}; shift 2 ;;
        --body-file) body=${2:-}; shift 2 ;;
        --draft) draft=1; shift ;;
        *) usage "unknown flag for create: $1" ;;
      esac
    done
    [ -n "$base" ] && [ -n "$head" ] && [ -n "$title" ] && [ -n "$body" ] \
      || usage "create needs --base, --head, --title and --body-file"
    [ -f "$body" ] || usage "body file not found: $body"
    backend_create "$base" "$head" "$title" "$body" "$draft"
    ;;
  list)
    prefix= state=all
    while [ $# -gt 0 ]; do
      case "$1" in
        --head-prefix) prefix=${2:-}; shift 2 ;;
        --state) state=${2:-}; shift 2 ;;
        *) usage "unknown flag for list: $1" ;;
      esac
    done
    [ -n "$prefix" ] || usage "list needs --head-prefix"
    case "$state" in open | merged | closed | all) ;; *) usage "bad --state: $state" ;; esac
    backend_list "$prefix" "$state"
    ;;
  view)
    need_number "${1:-}" view
    [ $# -eq 1 ] || usage "view takes only a number"
    backend_view "$1"
    ;;
  edit | comment)
    need_number "${1:-}" "$verb"
    number=$1
    shift
    body=
    while [ $# -gt 0 ]; do
      case "$1" in
        --body-file) body=${2:-}; shift 2 ;;
        *) usage "unknown flag for $verb: $1" ;;
      esac
    done
    [ -n "$body" ] || usage "$verb needs --body-file"
    [ -f "$body" ] || usage "body file not found: $body"
    "backend_$verb" "$number" "$body"
    ;;
  *)
    usage "unknown verb: $verb"
    ;;
esac
