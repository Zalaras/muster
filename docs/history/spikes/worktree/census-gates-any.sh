#!/usr/bin/env bash
# Generic single-stage gate census — for each textually-clean reconstructed merge
# refs/census/<i>/M in <repo>, run <verify-cmd>; if it fails, run both parents. Only
# "both parents pass, M fails" is a semantic-conflict candidate. Zero LLM. Run alone.
# Usage: census-gates-any.sh <repo> '<verify-cmd>' [idx ...]   (default: all clean pairs)
#   env: DEPS_CMD='npm ci --silent' runs when web/package-lock.json (or LOCKFILE) changed vs last run.
set -u
R="$1"; VERIFY="$2"; shift 2; D="$(dirname "$R")"; OUT="$D/gates.tsv"; LOCK="${LOCKFILE:-package-lock.json}"
export PATH=/usr/local/bin:$PATH NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh" >/dev/null 2>&1; cd "$R" || exit 1; (nvm use >/dev/null 2>&1 || nvm use 24 >/dev/null 2>&1 || true)
[ -f "$OUT" ] || printf 'idx\tref\tM\tA\tB\tnote\tsecs\n' > "$OUT"
idxs=("$@"); [ ${#idxs[@]} -eq 0 ] && idxs=($(awk -F'\t' 'NR>1 && $7=="clean"{print $1}' "$D/pairs.tsv"))
co() { git checkout -q --detach "$1" && git clean -qfdx -e node_modules >/dev/null 2>&1
  if [ -n "${DEPS_CMD:-}" ] && ! git diff --quiet HEAD "$(cat "$D/.deps-ref" 2>/dev/null || echo HEAD)" -- "$LOCK" 2>/dev/null; then sh -c "$DEPS_CMD" >/dev/null 2>&1; git rev-parse HEAD > "$D/.deps-ref"; fi; }
stage() { co "$1" || { echo ERR; return; }; nice -n 5 sh -c "$VERIFY" >"$D/log-$2.txt" 2>&1 && echo PASS || echo FAIL; }
for i in "${idxs[@]}"; do
  m=$(git rev-parse -q --verify "refs/census/$i/M") || { echo "$i: no merge ref"; continue; }
  t0=$(date +%s); r=$(stage "$m" "$i-M"); a=-; b=-; note=-
  if [ "$r" = FAIL ]; then a=$(stage "refs/census/$i/A" "$i-A"); b=$(stage "refs/census/$i/B" "$i-B"); if [ "$a" = PASS ] && [ "$b" = PASS ]; then note=SEMANTIC-CONFLICT-CANDIDATE; else note="parent(s) already red"; fi; fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$i" "${m:0:7}" "$r" "$a" "$b" "$note" "$(( $(date +%s)-t0 ))" | tee -a "$OUT"
done
git checkout -q main; echo "DONE results: $OUT"
