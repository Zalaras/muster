#!/usr/bin/env bash
# features-scope.sh <plan> — every source file this branch changed belongs to a feature the
# plan's **Features** header names.
#
# Maps each changed file under cmd/, internal/, web/src/ and web/e2e/ (committed range against
# main plus the working tree) to its owning feature through `kb for <path>`, and fails on any
# feature the header omits. Exit 0 when every owner is named, 1 otherwise, 2 on usage error.
#
# Why (frontmatter retro, 2026-09-23): `kb pack --plan` keys on the header, so a fix wave that
# moves code into another feature's files leaves every later agent and reviewer without that
# feature's records. doc-reconcile Step 1 was the only check, and it runs after review: the
# frontmatter run blocked there after three approved cycles and paid a fourth to re-review the
# lifecycle file with lifecycle in the pack. Run by gates.sh in the baseline and every wave.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT" || exit 2
PLAN="${1:-}"; P="plans/$PLAN/plan.md"
[[ -n "$PLAN" && -f "$P" ]] || { echo "usage: features-scope.sh <plan> (plans/<plan>/plan.md must exist)" >&2; exit 2; }

header="$(grep -E '^\*\*Features\*\*:' "$P" | head -1 | sed -E 's/^\*\*Features\*\*:[[:space:]]*//; s/,/ /g')"
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

fail=0
while IFS= read -r f; do
  [[ -e "$f" ]] || continue   # deleted on this branch — its owner is judged by what replaced it
  skip "$f" && continue
  for owner in $("$kb" for "$f" 2>/dev/null | awk '/^features:/{on=1;next} /^[a-z]+:/{on=0} on && NF{print $1}'); do
    case " $header " in *" $owner "*) ;; *)
      echo "$f → feature '$owner', not in **Features**: $header"; fail=1 ;;
    esac
  done
done <<< "$changed"
if (( fail )); then
  echo "Widening **Features** is the developer's call — stop the pipeline and ask (kb pack keys on the header)."
  exit 1
fi
echo "features-scope: every changed source file's feature is in **Features** ($header)"
