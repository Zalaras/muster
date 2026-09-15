#!/usr/bin/env bash
# plan-lint.sh <plan> — mechanical checks on plans/<plan>/plan.md. Each check exists because its
# absence cost a review cycle once (audit 2026-09-06, plans/_audit/skills-agents-audit.md F2).
# Run by /plan-work before marking a plan approved and by /orchestrate pre-flight.
# Exit 0 iff clean.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT" || exit 2
P="plans/${1:?usage: plan-lint.sh <plan>}/plan.md"
[[ -f "$P" ]] || { echo "no such plan: $P" >&2; exit 2; }
FAILS=0
note() { echo "FAIL  $1"; FAILS=$((FAILS+1)); }
section() { awk -v s="$1" '$0 ~ "^## "s{f=1;next} /^## /{f=0} f' "$P"; }
checks_block() { awk '/^```checks[[:space:]]*$/{f=1;next} f&&/^```/{f=0} f' "$P" | grep -vE '^[[:space:]]*(#|$)'; }

# 1. Required headers.
for h in Status 'Work Type' 'E2E Scope' 'Fixture plan' Features; do
  grep -qE "^\*\*$h\*\*: *[^[:space:]]" "$P" || note "missing header **$h**"
done

# 2. Every numbered edge case names the criterion that checks it, or says untested (ui-text-and-focus edge case 18).
#    An item runs from its "N." line to the next numbered line or blank line; the arrow may sit on any of those lines.
items="$(section 'Edge Cases' | awk '/^[0-9]+\. /{if(cur!="")print cur; cur=$0; next} /^[[:space:]]*$/{if(cur!="")print cur; cur=""; next} cur!=""{cur=cur" "$0} END{if(cur!="")print cur}')"
while IFS= read -r l; do
  [[ -z "$l" ]] && continue
  echo "$l" | grep -qE '→ *\**((E|W|D)[0-9]+|untested)' || note "edge case lacks '→ E<n>|W<n>|D<n>|untested: <why>': ${l:0:90}"
done <<<"$items"

# 3. Every criterion an edge case cites exists.
ids="$(section 'Acceptance Criteria' | grep -oE '\*\*(E|W|D)[0-9]+\*\*|^(E|W|D)[0-9]+ ' | tr -d '* ' | sort -u)"
for ref in $(echo "$items" | grep -oE '→ *\**(E|W|D)[0-9]+' | grep -oE '(E|W|D)[0-9]+' | sort -u); do
  grep -qx "$ref" <<<"$ids" || note "edge case cites $ref but no such criterion exists"
done

# 3a. A criterion cited by two edge cases is often right — one table-driven test covers a family
#     of related cases — but it is also how an unchecked case hides: markdown-render-fixes' edge
#     case 2 cited E14, whose text checks edge case 3 only, and the unpinned row cost a review
#     cycle. Measured across the plan corpus, most duplicates are legitimate, so this prints a
#     NOTE and never fails: re-read the criterion against each case, and write
#     `→ E<n> (shared with edge case <m>)` to say you did and silence the note.
dups="$(while IFS= read -r l; do
  [[ -z "$l" ]] && continue
  ref="$(echo "$l" | grep -oE '→ *\**(E|W|D)[0-9]+' | grep -oE '(E|W|D)[0-9]+')"
  [[ -z "$ref" ]] && continue
  echo "$l" | grep -qE "→ *\**$ref\**.*\(shared with edge case [0-9]+\)" && continue
  echo "$ref"
done <<<"$items" | sort | uniq -d)"
while IFS= read -r dup; do
  [[ -z "$dup" ]] && continue
  echo "NOTE  criterion $dup is cited by more than one edge case — re-read $dup's text against each, then write '(shared with edge case <m>)' on each citation past the first"
done <<<"$dups"

# 4. A ```checks block exists and every line is `<ID> <command>` (shortcut-fixes).
if ! grep -q '^```checks' "$P"; then
  note 'no ```checks block'
else
  while IFS= read -r l; do
    [[ "$l" =~ ^[A-Z]+[0-9]+\ .+ ]] || note "malformed checks line (need '<ID> <command>'): $l"
  done < <(checks_block)
fi

# 4b. A negated grep over a path that does not exist is a false green, not a check: rg exits 2 on a
#     missing path argument and `! rg …` negates that error into a pass. mermaid-support's W6 was
#     dry-run green at approval — three of its six paths were files the plan had not created yet —
#     and stayed vacuous until the wave-1 gate.
while IFS= read -r l; do
  cmd=${l#* }
  [[ "$cmd" == "!"*rg* ]] || continue
  # Drop the quoted pattern(s) first: their contents are a regex, never paths.
  bare=$(printf '%s' "$cmd" | sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g")
  for tok in $bare; do
    case "$tok" in
      !|rg|--|-*) continue ;;
    esac
    [[ "$tok" == */* || "$tok" == *.* ]] || continue
    [[ -e "$tok" ]] || note "checks line ${l%% *}: negated grep names a path that does not exist ($tok) — rg exits 2 and \`! rg\` turns that into a pass"
  done
done < <(checks_block)

# 5. A prose criterion of the form "no X survives/remains in <dir>" is a negative grep and belongs in the block (shortcut-fixes).
while IFS= read -r l; do
  [[ -n "$l" ]] && note "negative-grep criterion written as prose, move it into \`\`\`checks: ${l:0:100}"
done < <(awk '/^## Acceptance Criteria/{f=1} /^```checks/{f=0} f' "$P" | grep -E '^- \*\*[A-Z]+[0-9]+\*\*' | grep -iE '(\bno\b.*\b(survives?|remains?|is left|appears?) (in|under|anywhere)\b|\b(references?|mentions?|pointers?) to the (old|removed|deleted|renamed)\b)')

# 6. Protocol error examples carry the {"error": {...}} envelope (file-drop-fix Major 4).
while IFS= read -r l; do
  [[ -n "$l" ]] && note "error example without the {\"error\":{…}} envelope: ${l:0:100}"
done < <(section 'Protocol Contract' | grep -E '^\{? *"code": *"' )

# 7. Negative-grep checks dry-run clean against the plan itself (m0-skeleton) and are run against the tree
#    so a pre-existing hit is assigned under Affected Files before anyone is spawned (new-ui-design-colors W4).
while IFS= read -r l; do
  id="${l%% *}"; cmd="${l#* }"
  [[ "$cmd" =~ ^!\ *rg ]] || continue
  pat="$(echo "$cmd" | grep -oE -- "(-e )?(\"[^\"]+\"|'[^']+')" | head -1 | sed -E "s/^-e //; s/^[\"']//; s/[\"']$//")"
  # The checks block itself necessarily spells the pattern; grep the plan without it (markdown-viewing, 2026-09-13).
  if [[ -n "$pat" ]] && awk '/^```checks[[:space:]]*$/{f=1;next} f&&/^```/{f=0;next} !f' "$P" | grep -qE -- "$pat"; then
    note "$id: the plan text itself contains the banned pattern '$pat' — agents copying it will trip the check"
  fi
  positive="${cmd#!}"
  if hits="$(eval "$positive" 2>/dev/null)" && [[ -n "$hits" ]]; then
    echo "NOTE  $id: pre-existing hits in the tree — each file must appear under Affected Files against its owner:"
    echo "$hits" | cut -d: -f1 | sort -u | sed 's/^/        /'
  fi
done < <(checks_block)

# 8. Every **Features** name is a registered feature (a spec.md under the docs features tree) — `kb pack --plan` keys on it.
for f in $(grep -E '^\*\*Features\*\*:' "$P" | head -1 | sed -E 's/^\*\*Features\*\*:[[:space:]]*//; s/,/ /g'); do
  [[ -f "docs/features/$f/spec.md" ]] || note "**Features** names '$f' but docs/features/$f/spec.md does not exist"
done

# 9. Every mermaid fence opens with an allowed diagram keyword — the rule check-kb applies to records,
#    applied here because plans/ is outside the kb scan (kb:adr/knowledge-diagrams-are-mermaid-records).
if grep -qE '^[[:space:]]*(```|~~~)mermaid' "$P"; then
  go run ./tools/kb fences "$P" >/dev/null 2>&1 || note "a mermaid fence opens with a keyword outside the closed kind list (run: go run ./tools/kb fences $P)"
fi

# 10. A non-empty `## Doc Delta` section — the staged claims doc-reconcile promotes after review.
#     "No doc change" is a legal body; silence is not, because nobody notices a missing section.
if [[ -z "$(section 'Doc Delta' | grep -vE '^[[:space:]]*$' | head -1)" ]]; then
  note "missing or empty '## Doc Delta' section (write 'No doc change.' if this plan changes no doc claim)"
fi

if (( FAILS )); then echo "plan-lint: $FAILS failure(s) in $P"; exit 1; fi
echo "plan-lint: $P clean"
