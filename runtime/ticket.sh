#!/bin/sh
# ticket.sh <spec>... — print the ticket links the specs declare.
#
# Reads the `**Ticket:**` line of each spec's header block: the lines before the first line
# starting `## `. The first such line in the header wins; one quoted further down does not
# count. The value is trimmed of surrounding whitespace. `none` is read ignoring case and one
# trailing period; a spec with no line has no ticket.
#
# A link is accepted when the whole value is `[label](url)`: the label is non-empty and holds
# no `]`, `@` or backtick; the url starts `http://` or `https://` and holds no space and no `)`.
#
# stdout: one line per accepted ticket, `[<label>](<url>)`, in argument order, one per distinct
# url (the first label wins); or the single word `none` when no spec has a ticket.
# exit 0 when nothing was refused. exit 2 when any spec was refused: stdout still carries the
# accepted tickets (nothing, not `none`, if there are none), and stderr one line per refusal:
#   ticket: <path>: no such file
#   ticket: <path>: invalid value '<value>' — use none or [label](http(s) url)
#   ticket: usage: ticket.sh <spec>...
set -eu

if [ "$#" -eq 0 ]; then
  echo "ticket: usage: ticket.sh <spec>..." >&2
  exit 2
fi

# One spec's ticket line: prints "absent", or "value:<trimmed value>".
read_line() {
  awk '
    /^## / { exit }
    /^\*\*Ticket:\*\*/ {
      v = $0
      sub(/^\*\*Ticket:\*\*/, "", v)
      gsub(/^[ \t\r]+|[ \t\r]+$/, "", v)
      print "value:" v
      found = 1
      exit
    }
    END { if (!found) print "absent" }
  ' "$1"
}

# Succeeds when $1 is one `[label](url)` link the contract accepts; sets `url`.
is_link() {
  case $1 in
    "["*) ;;
    *) return 1 ;;
  esac
  inner=${1#?}
  case $inner in
    *"]"*) ;;
    *) return 1 ;;
  esac
  label=${inner%%"]"*}
  rest=${inner#*"]"}
  [ -n "$label" ] || return 1
  case $label in
    *"@"* | *"\`"*) return 1 ;;
  esac
  case $rest in
    "("*")") ;;
    *) return 1 ;;
  esac
  url=${rest#?}
  url=${url%?}
  case $url in
    *" "* | *"	"* | *")"*) return 1 ;;
    http://?* | https://?*) return 0 ;;
    *) return 1 ;;
  esac
}

nl='
'
refused=0
out=""
seen=$nl
for spec in "$@"; do
  if [ ! -f "$spec" ]; then
    echo "ticket: $spec: no such file" >&2
    refused=1
    continue
  fi
  line=$(read_line "$spec")
  [ "$line" = absent ] && continue
  value=${line#value:}
  word=$(printf '%s' "${value%.}" | tr '[:upper:]' '[:lower:]')
  [ "$word" = none ] && continue
  if is_link "$value"; then
    case $seen in
      *"$nl$url$nl"*) continue ;;
    esac
    seen=$seen$url$nl
    out=$out$value$nl
  else
    echo "ticket: $spec: invalid value '$value' — use none or [label](http(s) url)" >&2
    refused=1
  fi
done

if [ -n "$out" ]; then
  printf '%s' "$out"
elif [ "$refused" -eq 0 ]; then
  echo none
fi
[ "$refused" -eq 0 ] || exit 2
