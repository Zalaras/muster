#!/usr/bin/env bash
# features-scope.sh <plan> [--touch] — every source file this branch changed belongs to a feature
# the plan's **Features** or **Touches** header names.
#
# Maps each changed file under cmd/, internal/, web/src/ and web/e2e/ (committed range against
# main plus the working tree) to its owning feature through `kb for <path>`, and fails on any
# owner neither header names. With --touch, a missing owner is appended to **Touches** in
# plans/<plan>/plan.md instead (the header is created after **Features** when absent), reported
# as `touched`, and the run passes: a touched feature packs as spec and contract only, so
# widening into it costs no developer stop (kb:adr/process-touched-features-widen-without-stopping).
# Exit 0 when every owner is named or was just touched, 1 otherwise, 2 on usage error.
#
# Why the check (frontmatter retro, 2026-09-23): `kb pack --plan` keys on the headers, so a fix
# wave that moves code into another feature's files leaves every later agent and reviewer without
# that feature's records. doc-reconcile Step 1 was the only check, and it runs after review: the
# frontmatter run blocked there after three approved cycles and paid a fourth to re-review the
# lifecycle file with lifecycle in the pack. Run by gates.sh in the baseline and every wave.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT" || exit 2
PLAN=""; TOUCH=0
for a in "$@"; do
  case "$a" in
    --touch) TOUCH=1 ;;
    *) PLAN="$a" ;;
  esac
done
P="plans/$PLAN/plan.md"
[[ -n "$PLAN" && -f "$P" ]] || { echo "usage: features-scope.sh <plan> [--touch] (plans/<plan>/plan.md must exist)" >&2; exit 2; }

scope_names() { grep -E "^\*\*$1\*\*:" "$P" | head -1 | sed -E "s/^\*\*$1\*\*:[[:space:]]*//; s/,/ /g"; }
features="$(scope_names Features)"
touches="$(scope_names Touches)"
header="$features $touches"
base="$(git merge-base main HEAD 2>/dev/null || true)"
changed="$( { [[ -n "$base" ]] && git diff --name-only "$base" HEAD; git status --porcelain | cut -c4-; } 2>/dev/null \
  | grep -E '^(cmd|internal|web/src|web/e2e)/' | sort -u)"
[[ -n "$changed" ]] || { echo "features-scope: no changed source files"; exit 0; }

kb="$(mktemp -d)/kb"; trap 'rm -rf "$(dirname "$kb")"' EXIT
go build -o "$kb" ./tools/kb || { echo "features-scope: could not build tools/kb" >&2; exit 2; }

# Changed files whose glob owner is not the feature the change serves, one reason each.
skip() {
  case "$1" in
    */CLAUDE.md) return 0 ;;         # a generated kb trailer rides every record edit (make gen-kb)
    web/src/protocol.ts) return 0 ;; # wire types mirroring docs/protocol.md: the anchor's feature owns the
                                     # change, and plan-work merges it under the plan's own anchors
  esac
  return 1
}

# touch_feature appends $1 to **Touches**, creating the header on the line after **Features**.
touch_feature() {
  python3 - "$P" "$1" <<'PY'
import re, sys, pathlib
p, name = pathlib.Path(sys.argv[1]), sys.argv[2]
text = p.read_text()
m = re.search(r"^\*\*Touches\*\*:[ \t]*(.*?)[ \t]*$", text, re.M)
if m:
    names = [n.strip() for n in m.group(1).split(",") if n.strip()]
    if name not in names:
        names.append(name)
    text = text[:m.start()] + "**Touches**: " + ", ".join(names) + text[m.end():]
else:
    f = re.search(r"^\*\*Features\*\*:.*$", text, re.M)
    if not f:
        sys.exit("no **Features** header to place **Touches** after")
    text = text[:f.end()] + "\n**Touches**: " + name + text[f.end():]
p.write_text(text)
PY
}

fail=0
while IFS= read -r f; do
  [[ -e "$f" ]] || continue   # deleted on this branch — its owner is judged by what replaced it
  skip "$f" && continue
  for owner in $("$kb" for "$f" 2>/dev/null | awk '/^features:/{on=1;next} /^[a-z]+:/{on=0} on && NF{print $1}'); do
    case " $header " in *" $owner "*) continue ;; esac
    if (( TOUCH )); then
      touch_feature "$owner" || { echo "features-scope: could not edit $P" >&2; exit 1; }
      header="$header $owner"
      echo "features-scope: touched $owner for $f (plan.md edited — commit it as docs($PLAN): touch $owner)"
    else
      echo "$f → feature '$owner', in neither **Features** ($features) nor **Touches** ($touches)"; fail=1
    fi
  done
done <<< "$changed"
if (( fail )); then
  echo "Run with --touch to add each missing owner to **Touches** (packs spec and contract only, no stop)."
  exit 1
fi
echo "features-scope: every changed source file's feature is in **Features** ($features) or **Touches** ($(scope_names Touches))"
