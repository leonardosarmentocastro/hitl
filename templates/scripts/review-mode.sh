#!/bin/sh
# review-mode.sh <spec>... — print the review mode the specs declare.
#
# Reads the `**Review mode:**` line of each spec's header block: the lines before the first
# line starting `## `. The first such line in the header wins; one quoted further down does
# not count. The value is read ignoring case, surrounding whitespace and one trailing period.
#
# stdout, one word, exit 0: `elaborate` if any spec says elaborate; else `simple` if any says
# simple; else `absent`.
# exit 2, one line on stderr, nothing on stdout:
#   review-mode: <path>: no such file
#   review-mode: <path>: invalid value '<value>' — use simple or elaborate
#   review-mode: usage: review-mode.sh <spec>...
# An invalid value in any spec is exit 2, even when another spec says elaborate.
set -eu

if [ "$#" -eq 0 ]; then
  echo "review-mode: usage: review-mode.sh <spec>..." >&2
  exit 2
fi

# One spec's mode line: prints "absent", or "value:<trimmed value without a trailing period>".
read_line() {
  awk '
    /^## / { exit }
    /^\*\*Review mode:\*\*/ {
      v = $0
      sub(/^\*\*Review mode:\*\*/, "", v)
      gsub(/^[ \t\r]+|[ \t\r]+$/, "", v)
      sub(/\.$/, "", v)
      gsub(/^[ \t]+|[ \t]+$/, "", v)
      print "value:" v
      found = 1
      exit
    }
    END { if (!found) print "absent" }
  ' "$1"
}

result=absent
for spec in "$@"; do
  if [ ! -f "$spec" ]; then
    echo "review-mode: $spec: no such file" >&2
    exit 2
  fi
  line=$(read_line "$spec")
  [ "$line" = absent ] && continue
  value=${line#value:}
  case $(printf '%s' "$value" | tr '[:upper:]' '[:lower:]') in
    elaborate) result=elaborate ;;
    simple) [ "$result" = elaborate ] || result=simple ;;
    *)
      echo "review-mode: $spec: invalid value '$value' — use simple or elaborate" >&2
      exit 2
      ;;
  esac
done

echo "$result"
