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
# `rg` is Claude Code's shell function, invisible to this script, so check 7's positive grep ran
# empty and a pre-existing hit passed silently (groups: D17 red on main, found at the first wave
# gate). Recreate the shim as gates.sh does, and refuse to lint without a working rg.
if ! command -v rg >/dev/null 2>&1; then
  _cc_bin="${CLAUDE_CODE_EXECPATH:-$HOME/.local/bin/claude}"
  [[ -x "$_cc_bin" ]] && { rg() { ( exec -a rg "$_cc_bin" "$@" ); }; export -f rg; }
fi
rg --version >/dev/null 2>&1 || { echo "error: rg is not runnable here; negative-grep checks would pass vacuously — aborting" >&2; exit 2; }
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
  echo "$l" | grep -qE '→ *\**((E|R|W|D)[0-9]+|untested)' || note "edge case lacks '→ E<n>|R<n>|W<n>|D<n>|untested: <why>': ${l:0:90}"
done <<<"$items"

# 3. Every criterion an edge case cites exists.
ids="$(section 'Acceptance Criteria' | grep -oE '\*\*(E|R|W|D)[0-9]+\*\*|^(E|R|W|D)[0-9]+ ' | tr -d '* ' | sort -u)"
for ref in $(echo "$items" | grep -oE '→ *\**(E|R|W|D)[0-9]+' | grep -oE '(E|R|W|D)[0-9]+' | sort -u); do
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
    # gates.sh evals each line; a quoting error there is a red gate nobody can fix (masthead-indicators X4).
    bash -n -c "${l#* }" 2>/dev/null || note "checks line ${l%% *}: shell syntax error under eval"
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

# 6b. An error example reusing a code whose other protocol.md examples share one message copies
# that message (effort: the plan wrote a 404's prose description as its wire string). NOTE, never
# fails: some codes legitimately vary their message.
while IFS=$'\t' read -r c m; do
  known=$(grep -oE "\"code\": *\"$c\", *\"message\": *\"[^\"]*\"" docs/protocol.md 2>/dev/null | sed -E 's/.*"message": *"([^"]*)"/\1/' | grep -vxF -- "$m" | sort -u)
  [[ -n "$known" && $(wc -l <<<"$known") -eq 1 ]] &&
    echo "NOTE  error example's message for code $c is \"$m\"; every other protocol.md example carries \"$known\""
done < <(section 'Protocol Contract' | grep -oE '"code": *"[a-z_]+", *"message": *"[^"]*"' | sed -E 's/"code": *"([a-z_]+)", *"message": *"([^"]*)"/\1\t\2/' | sort -u)

# 7. Negative-grep checks dry-run clean against the plan itself (m0-skeleton) and are run against the tree
#    so a pre-existing hit is assigned under Affected Files before anyone is spawned (new-ui-design-colors W4).
while IFS= read -r l; do
  id="${l%% *}"; cmd="${l#* }"
  [[ "$cmd" =~ ^!\ *rg ]] || continue
  pat="$(echo "$cmd" | grep -oE -- "(-e )?(\"[^\"]+\"|'[^']+')" | head -1 | sed -E "s/^-e //; s/^[\"']//; s/[\"']$//")"
  # The checks block itself necessarily spells the pattern; grep the plan without it (markdown-viewing, 2026-09-13).
  if [[ -n "$pat" ]]; then
    awk '/^```checks[[:space:]]*$/{f=1;next} f&&/^```/{f=0;next} !f' "$P" | grep -qE -- "$pat" 2>/dev/null; rc=$?
    (( rc == 0 )) && note "$id: the plan text itself contains the banned pattern '$pat' — agents copying it will trip the check"
    (( rc == 2 )) && echo "NOTE  $id: could not self-check the pattern '$pat' (grep -E rejected it) — check it by hand"
  fi
  positive="${cmd#!}"
  if hits="$(eval "$positive" 2>/dev/null)" && [[ -n "$hits" ]]; then
    for hf in $(echo "$hits" | cut -d: -f1 | sort -u); do
      if section 'Affected Files' | grep -qF "$hf"; then echo "NOTE  $id: pre-existing hit in $hf (named under Affected Files)"
      else note "$id: pre-existing hit in $hf, which Affected Files does not name — assign it to its owner or drop the check"; fi
    done
  fi
done < <(checks_block)

# 8. Every **Features** and **Touches** name is a registered feature (one `kb ls --type spec` lists) —
#    `kb pack --plan` keys on both.
scope_names() { grep -E "^\*\*$1\*\*:" "$P" | head -1 | sed -E "s/^\*\*$1\*\*:[[:space:]]*//; s/,/ /g"; }
registered="$(go tool kb ls --type spec 2>/dev/null | awk '{print $2}' | sed 's|^kb:spec/||')"
[[ -n "$registered" ]] || note "could not list the registered features (go tool kb ls --type spec)"
for h in Features Touches; do
  for f in $(scope_names "$h"); do
    grep -qx "$f" <<<"$registered" || note "**$h** names '$f' but no feature spec registers it (go tool kb ls --type spec)"
  done
done

# 9. Every mermaid fence opens with an allowed diagram keyword — the rule check-kb applies to records,
#    applied here because plans/ is outside the kb scan (kb:adr/knowledge-diagrams-are-mermaid-records).
if grep -qE '^[[:space:]]*(```|~~~)mermaid' "$P"; then
  go tool kb fences "$P" >/dev/null 2>&1 || note "a mermaid fence opens with a keyword outside the closed kind list (run: go tool kb fences $P)"
fi

# 10. A non-empty `## Doc Delta` section — the staged claims doc-reconcile promotes after review.
#     "No doc change" is a legal body; silence is not, because nobody notices a missing section.
if [[ -z "$(section 'Doc Delta' | grep -vE '^[[:space:]]*$' | head -1)" ]]; then
  note "missing or empty '## Doc Delta' section (write 'No doc change.' if this plan changes no doc claim)"
fi

# 11. A non-empty `## Out of scope` section — the only route by which a run may add an open
#     TODO.md item (kb:adr/process-backlog-entries-are-the-users-to-file). "Nothing." is a legal
#     body; silence is not, because an absent section reads as "the orchestrator may decide".
if [[ -z "$(section 'Out of scope' | grep -vE '^[[:space:]]*$' | head -1)" ]]; then
  note "missing or empty '## Out of scope' section (write 'Nothing.' if this plan defers no work)"
fi

# 12. Every source path under Affected Files is owned by a feature the header names — kb scope's
#     rule, applied before anyone spawns. new-session-improvement hit it at its first wave gate (a 49-minute
#     stop), and its new files, owned by no feature, kept check-kb red until approval was impossible.
#     `kb for` resolves a path that does not exist yet, so new files are judged by the globs they will match.
#     web/src/style.css is exempt: one stylesheet shared by every feature on purpose, so no single owner fits
#     and naming one would pull that feature into every plan that styles anything.
#     A spec named in **Fixture plan** or a criterion must be owned too (only owned — a criterion may cite
#     another feature's spec as a regression): resume-and-dangerously-allow named its new specs nowhere else.
#     A **Touches** feature counts: the plan may edit its files (kb:adr/process-touched-features-widen-without-stopping).
header="$(scope_names Features) $(scope_names Touches)"
paths="$(section 'Affected Files' | grep -oE '`(cmd|internal|web/src|web/e2e)/[^`[:space:]]+\.[a-z]+(:[0-9]+)?`' \
  | tr -d '`' | sed -E 's/:[0-9]+$//' | grep -vE '(/CLAUDE\.md|^web/src/protocol\.ts|^web/src/style\.css)$' | sort -u)"
#     A spec basename resolves under web/e2e/ unless a web/render/ file of that name exists or the
#     plan names it there (render specs are the R* criteria's, kb:adr/process-test-levels-journey-property-logic).
named="$({ grep -E '^\*\*Fixture plan\*\*:' "$P"; section 'Acceptance Criteria'; } | grep -oE '[a-z0-9-]+\.spec\.ts' | sort -u \
  | while IFS= read -r s; do
      if [[ -f "web/render/$s" ]] || grep -qF "web/render/$s" "$P"; then echo "web/render/$s"; else echo "web/e2e/$s"; fi
    done | sort -u)"
# A path named anywhere else in the plan (Doc upkeep, Implementation Notes) is judged by the
# header rule only: groups named the anchors table (docs/protocol-anchors.tsv) under Doc upkeep, and `knowledge` reached
# the header at doc-reconcile, two hours and a blocked verdict later.
others="$(grep -oE '`(cmd|internal|web/src|web/e2e|tools|docs)/[^`[:space:]]+\.[a-z]+`' "$P" | tr -d '`' | sort -u | grep -vxF -f <(printf '%s\n' "$paths") || true)"
if [[ -n "$paths$named$others" ]]; then
  all="$(printf '%s\n%s\n%s\n' "$paths" "$others" "$named" | grep -v '^$' | sort -u)"
  # One kb invocation resolves every path: `path<TAB>owner[,owner]`, `-` when none.
  if owners_tsv="$(go tool kb owners $all 2>/dev/null)"; then
    owners_of() { printf '%s\n' "$owners_tsv" | awk -F'\t' -v p="$1" '$1==p && $2!="-" {print $2}' | tr ',' ' '; }
    while IFS= read -r f; do
      [[ -n "$f" ]] || continue
      owners="$(owners_of "$f")"
      if [[ -z "$owners" ]]; then
        # check-kb refuses a glob matching no file, so a not-yet-existing file cannot be registered at approval.
        if [[ -e "$f" ]]; then note "$f: owned by no feature — add its glob to docs/features/<f>/spec.md at approval"
        else echo "NOTE  $f: new, owned by no feature — the orchestrator adds its glob once it exists (kb:adr/process-unowned-file-globs-land-before-approval)"; fi
        continue
      fi
      for o in $owners; do
        case " $header " in *" $o "*) ;; *) note "$f → feature '$o', in neither **Features** nor **Touches** — add it to one (Touches when its behaviour is unchanged)" ;; esac
      done
    done <<<"$paths"
    while IFS= read -r f; do
      [[ -n "$f" && -e "$f" ]] || continue
      for o in $(owners_of "$f"); do
        case " $header " in *" $o "*) ;; *) note "$f (named outside Affected Files) → feature '$o', in neither **Features** nor **Touches** — add it to one" ;; esac
      done
    done <<<"$others"
    while IFS= read -r f; do
      [[ -z "$f" ]] || [[ -n "$(owners_of "$f")" ]] || { [[ -e "$f" ]] \
        && note "$f: owned by no feature — add its glob to docs/features/<f>/spec.md at approval" \
        || echo "NOTE  $f: new, owned by no feature — the orchestrator adds its glob once it exists (kb:adr/process-unowned-file-globs-land-before-approval)"; }
    done <<<"$named"
  else
    note "could not run kb owners to check Affected Files ownership"
  fi
fi

# 13. Doc Delta arithmetic: a spec body is capped at 1000 words (check-kb). groups' rail delta needed
#     ~320 words against a spec at 792 - 100 freed, found by doc-reconcile after review approved; the
#     split into a `groups` feature was a developer decision two hours before the run could complete.
python3 - "$P" <<'PY' || true
import re, sys, pathlib
plan = pathlib.Path(sys.argv[1]).read_text()
m = re.search(r"^## Doc Delta\n(.*?)(?=^## |\Z)", plan, re.S | re.M)
if m:
    delta, cur, adds, cuts = m.group(1), None, {}, {}
    for line in delta.splitlines():
        h = re.match(r"^\*\*([a-z0-9-]+)\*\* — (becomes true|stops being true)", line)
        if h:  # an inline delta counts too: launch-dialog-fixes' one-paragraph delta registered nothing
            cur = (h.group(1), h.group(2))
            d = adds if cur[1] == "becomes true" else cuts
            d[cur[0]] = d.get(cur[0], 0) + len(line[h.end():].split())
            continue
        if cur and line.startswith("- "):
            d = adds if cur[1] == "becomes true" else cuts
            d[cur[0]] = d.get(cur[0], 0) + len(line.split())
    for f in sorted(set(adds) | set(cuts)):
        spec = pathlib.Path(f"docs/features/{f}/spec.md")
        if not spec.exists(): continue
        body = spec.read_text().split("---", 2)[-1]
        body = re.sub(r"```mermaid.*?```", "", body, flags=re.S)  # check-kb excludes mermaid source; a 947-word NOTE on a 797-word body cost launch-inflight-guard five minutes
        words = len(body.split()) + adds.get(f, 0) - cuts.get(f, 0)
        if words > 1000:
            print(f"NOTE  Doc Delta: {f} spec would reach ~{words} words (cap 1000) — cut more under 'stops being true' or split a feature before approval")
        elif words > 900:  # docs-search-bar planned ~800 against the then 800 cap and stayed silent; fix waves' doc-delta lines added ~50 more and doc-reconcile blocked
            print(f"NOTE  Doc Delta: {f} spec would reach ~{words} of 1000 words — fix waves add claims; cut or split a feature before approval")
PY

# 14. Warn, never fail: Affected Files is an impact read, so a backticked call or signature there pins
#     a shape that is the implementer's (kb:adr/process-plan-fixes-boundaries-not-shape).
section 'Affected Files' | grep -E '`[A-Za-z_][A-Za-z0-9_.]*\(' | while IFS= read -r l; do
  echo "NOTE  Affected Files names a signature — the shape is the implementer's: ${l:0:100}"
done || true

# 15. Warn, never fail: every **Features** name packs its full record set into every agent, about
#     11,000 words each on a shared file's co-owner (groups: fourteen features, 60k-word packs). A
#     feature whose files the plan edits without changing its behaviour belongs under **Touches**.
nfeat=$(scope_names Features | wc -w | tr -d ' ')
if (( nfeat > 5 )); then
  echo "NOTE  **Features** names $nfeat features — a feature whose behaviour this plan leaves alone belongs under **Touches** (spec and contract only)"
fi

# 17. An R* criterion is a render test against a generated fixture, so the plan must say which
#     scenario holds its state: a `### Render` subsection and a **Render fixtures** header naming
#     scenarios that exist under web/render/fixtures/ or are marked `new:` for daemon-impl
#     (kb:adr/process-render-fixtures-generated-from-daemon).
if section 'Acceptance Criteria' | grep -qE '^\- \*\*R[0-9]+\*\*'; then
  section 'Acceptance Criteria' | grep -qE '^### Render' || note "R* criteria present but no '### Render' subsection under Acceptance Criteria"
  rf="$(grep -E '^\*\*Render fixtures\*\*:' "$P" | head -1 | sed -E 's/^\*\*Render fixtures\*\*:[[:space:]]*//')"
  if [[ -z "$rf" || "$rf" == none ]]; then
    note "R* criteria present but **Render fixtures** is missing or 'none' — name the scenario(s), existing or 'new: <name> (<what it holds>)'"
  else
    for name in $(printf '%s' "$rf" | sed -E 's/new: *([a-z0-9-]+) *\([^)]*\)/NEW/g' | tr ',' ' '); do
      [[ "$name" == NEW ]] && continue
      [[ -f "web/render/fixtures/$name.json" ]] || note "**Render fixtures** names '$name' but web/render/fixtures/$name.json does not exist (mark it 'new: $name (<what it holds>)')"
    done
  fi
fi

# 18. Warn, never fail: when E* criteria outnumber every other level, the plan is probably testing
#     display properties at the most expensive tier — each E should be a journey that needs the
#     daemon (kb:adr/process-test-levels-journey-property-logic).
ne=$(section 'Acceptance Criteria' | grep -cE '^\- \*\*E[0-9]+\*\*' || true)
nother=$(section 'Acceptance Criteria' | grep -cE '^\- \*\*(R|W|D)[0-9]+\*\*' || true)
if (( ne > nother )); then
  echo "NOTE  $ne E* criteria against $nother R*/W*/D* — most criteria sit at the E2E tier; check each E is a journey the daemon is needed to falsify, not a display property (R*)"
fi

# 16. The tree passes check-kb at approval, bar the plan's own new files (check 12 notes those):
#     rail-card-organise's planning facts sat above the version ceiling, red through two review cycles.
while IFS= read -r l; do
  [[ -z $l || $l == kb:* ]] && continue
  [[ $l == *"owned by no feature"* ]] && grep -qF -- "${l%%:*}" "$P" && continue
  note "check-kb: ${l:0:160}"
done <<< "$(go tool kb check 2>&1)"

if (( FAILS )); then echo "plan-lint: $FAILS failure(s) in $P"; exit 1; fi
echo "plan-lint: $P clean"
