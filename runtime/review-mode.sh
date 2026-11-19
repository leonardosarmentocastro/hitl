#!/bin/sh
# review-mode.sh <spec>... — print the review mode the specs declare.
#
# Reads the `**Review mode:**` line of each spec's header block: the lines before the first
# line starting `## `. The first such line in the header wins; one quoted further down does
# not count. The value is read ignoring case, surrounding whitespace and one trailing period.
#
# Three values: simple, elaborate, complete. The heaviest wins.
# stdout, one word, exit 0: `complete` if any spec says complete; else `elaborate` if any says
# elaborate; else `simple` if any says simple; else `absent`.
# exit 2, one line on stderr, nothing on stdout:
#   review-mode: <path>: no such file
#   review-mode: <path>: invalid value '<value>' — use simple, elaborate or complete
#   review-mode: usage: review-mode.sh <spec>...
# An invalid value in any spec is exit 2, even when another spec carries a valid mode.
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

# rank <mode> — absent 0, simple 1, elaborate 2, complete 3.
rank() {
  case $1 in
    complete) echo 3 ;;
    elaborate) echo 2 ;;
    simple) echo 1 ;;
    *) echo 0 ;;
  esac
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
  mode=$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')
  case $mode in
    simple | elaborate | complete)
      if [ "$(rank "$mode")" -gt "$(rank "$result")" ]; then result=$mode; fi
      ;;
    *)
      echo "review-mode: $spec: invalid value '$value' — use simple, elaborate or complete" >&2
      exit 2
      ;;
  esac
done

echo "$result"
