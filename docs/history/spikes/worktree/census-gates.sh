#!/usr/bin/env bash
# S5 step 2 — run the gates on each textually-clean reconstructed merge (refs/census/<i>/M)
# in the scratch clone. Zero LLM. Run it ALONE: the suite has timing-sensitive tests
# (terminal takeover) that flake under CPU contention — measured 2026-09-07.
# Stages: check = `make check`; e2e = `make web-build build` then playwright (config workers).
# If M fails a stage, both parents (A, B) run that same stage; only "both parents pass, M
# fails" is a semantic-conflict candidate.
# Usage: census-gates.sh [idx ...]   (default: every clean pair in pairs.tsv)
set -u
STATE=/Users/damian/Documents/code/Projects/muster/plans/v1-cleanup/orchestration-state.json
if [ "${MUSTER_SPIKES_ALLOW_E2E:-}" != 1 ] && [ "$(jq -r .status "$STATE" 2>/dev/null)" != completed ]; then
  echo "refusing: pipeline v1-cleanup is $(jq -r .status "$STATE")"; exit 2; fi
D="${MUSTER_SPIKES_HOME:-$HOME/.muster-spikes}/s5-census"; R="$D/repo"; OUT="$D/gates.tsv"
export PATH=/usr/local/bin:$PATH NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh" >/dev/null; cd "$R" && nvm use >/dev/null
[ -f "$OUT" ] || printf 'idx\tref\tcheck\te2e\tA_stage\tB_stage\tnote\n' > "$OUT"
idxs=("$@"); [ ${#idxs[@]} -eq 0 ] && idxs=($(awk -F'\t' 'NR>1 && $7=="clean"{print $1}' "$D/pairs.tsv"))
co() { git checkout -q --detach "$1" && git clean -qfd web/src internal 2>/dev/null; if ! git diff --quiet HEAD "$D/.deps-ref" -- web/package-lock.json 2>/dev/null; then (cd web && npm ci --silent >/dev/null 2>&1); git rev-parse HEAD > "$D/.deps-ref"; fi; }
stage() { # stage <check|e2e> <ref> <label>
  co "$2" || { echo ERR; return; }
  if [ "$1" = check ]; then nice -n 5 make check >"$D/log-$3-check.txt" 2>&1 && echo PASS || echo FAIL
  else nice -n 5 make web-build build >"$D/log-$3-e2e.txt" 2>&1 && (cd web && nice -n 5 npx playwright test >>"$D/log-$3-e2e.txt" 2>&1) && echo PASS || echo FAIL; fi; }
for i in "${idxs[@]}"; do
  m=$(git rev-parse -q --verify "refs/census/$i/M") || { echo "$i: no merge ref"; continue; }
  c=$(stage check "$m" "$i-M"); e=skip; failed=""
  if [ "$c" = PASS ]; then e=$(stage e2e "$m" "$i-M"); [ "$e" = FAIL ] && failed=e2e; else failed=check; fi
  as=-; bs=-; note=-
  if [ -n "$failed" ]; then as=$(stage $failed "refs/census/$i/A" "$i-A"); bs=$(stage $failed "refs/census/$i/B" "$i-B")
    if [ "$as" = PASS ] && [ "$bs" = PASS ]; then note="SEMANTIC-CONFLICT-CANDIDATE($failed)"; else note="parent(s) already red at $failed"; fi; fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$i" "${m:0:7}" "$c" "$e" "$as" "$bs" "$note" | tee -a "$OUT"
done
git checkout -q main; echo "DONE results: $OUT"
