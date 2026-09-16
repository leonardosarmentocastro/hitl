#!/usr/bin/env bash
# hitl PR shim — GitHub backend. Sourced by pr.sh; never run directly. Talks to `gh` and
# normalises with gh's built-in --jq, so jq is not a prerequisite.

RECORD_FIELDS='number,url,headRefName,baseRefName,state,isDraft,title,body'
RECORD_JQ='{number: .number, url: .url, head: .headRefName, base: .baseRefName,
            state: (.state | ascii_downcase), draft: .isDraft, title: .title, body: .body}'
REVIEW_STATE_JQ='(if . == "APPROVED" then "approved"
                  elif . == "CHANGES_REQUESTED" then "changes_requested"
                  else "commented" end)'
VIEW_JQ="$RECORD_JQ + {
  reviews:  [.reviews[]  | {author: .author.login, state: (.state | $REVIEW_STATE_JQ), body: .body}],
  comments: [.comments[] | {author: .author.login, body: .body, created_at: .createdAt}]}"

# Run gh; on failure pass its stderr through and exit 2.
gh_or_2() {
  local err
  err=$(mktemp)
  if ! gh "$@" 2>"$err"; then
    cat "$err" >&2
    rm -f "$err"
    exit 2
  fi
  rm -f "$err"
}

backend_view() {
  gh_or_2 pr view "$1" --json "$RECORD_FIELDS,reviews,comments" --jq "$VIEW_JQ"
}

# gh's search qualifiers do not prefix-match branch names reliably, so fetch and filter.
backend_list() {
  local prefix=$1 state=$2
  gh_or_2 pr list --state "$state" --limit 200 --json "$RECORD_FIELDS" \
    --jq "[.[] | select(.headRefName | startswith(\"$prefix\")) | $RECORD_JQ]"
}
