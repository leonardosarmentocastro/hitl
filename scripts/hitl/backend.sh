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

LIST_LIMIT=200

# `head:<prefix>` narrows on the server (GitHub's search prefix-matches it); `startswith` is
# the exact check. Fetching one past the limit tells a complete list from a cut-off one, and a
# cut-off list is an error, never a partial answer. gh's --jq has no --arg, so the prefix is
# escaped into the string literal by hand; a prefix search cannot quote is not sent to search.
backend_list() {
  local prefix=$1 state=$2 lit
  lit=${prefix//\\/\\\\}
  lit=${lit//\"/\\\"}
  local args=(pr list --state "$state" --limit $((LIST_LIMIT + 1)) --json "$RECORD_FIELDS")
  [[ $prefix == *\"* ]] || args+=(--search "head:$prefix")
  gh_or_2 "${args[@]}" --jq "if length > $LIST_LIMIT
    then error(\"pr.sh list: more than $LIST_LIMIT PRs match; the list would be incomplete\")
    else [.[] | select(.headRefName | startswith(\"$lit\")) | $RECORD_JQ] end"
}

backend_create() {
  local base=$1 head=$2 title=$3 body_file=$4 draft=$5
  local args=(pr create --base "$base" --head "$head" --title "$title" --body-file "$body_file")
  [ "$draft" = 1 ] && args+=(--draft)
  local err
  err=$(mktemp)
  if ! gh "${args[@]}" >/dev/null 2>"$err"; then
    if grep -qi "already exists" "$err"; then
      rm -f "$err"
      gh_or_2 pr view "$head" --json "$RECORD_FIELDS" --jq "$RECORD_JQ"
      exit 3
    fi
    cat "$err" >&2
    rm -f "$err"
    exit 2
  fi
  rm -f "$err"
  gh_or_2 pr view "$head" --json "$RECORD_FIELDS" --jq "$RECORD_JQ"
}

backend_edit() {
  gh_or_2 pr edit "$1" --body-file "$2" >/dev/null
  gh_or_2 pr view "$1" --json "$RECORD_FIELDS" --jq "$RECORD_JQ"
}

backend_comment() {
  gh_or_2 pr comment "$1" --body-file "$2" >/dev/null
  gh_or_2 pr view "$1" --json "$RECORD_FIELDS" --jq "$RECORD_JQ"
}
