#!/usr/bin/env bash
# S5 step 3 — classify SEMANTIC-CONFLICT-CANDIDATE rows without rerunning anything:
# if the merged tree's *code* (everything outside docs/plans/.claude/spikes) is identical to
# one parent's code, the merge cannot behave differently from that parent — the failure was
# a flake. Only candidates whose code differs from BOTH parents stay candidates.
set -u
D="${MUSTER_SPIKES_HOME:-$HOME/.muster-spikes}/s5-census"; R="$D/repo"; cd "$R"
CODE=(cmd internal web/src web/e2e web/package.json web/package-lock.json go.mod go.sum Makefile test)
awk -F'\t' 'NR>1 && $7 ~ /^SEMANTIC/ {print $1, $7}' "$D/gates.tsv" | while read -r i note; do
  A="refs/census/$i/A"; B="refs/census/$i/B"; M="refs/census/$i/M"
  eqA=$(git diff --quiet "$A" "$M" -- "${CODE[@]}" && echo yes || echo no)
  eqB=$(git diff --quiet "$B" "$M" -- "${CODE[@]}" && echo yes || echo no)
  if [ $eqA = yes ] || [ $eqB = yes ]; then verdict="FLAKE (M code == $([ $eqA = yes ] && echo A || echo B))"; else verdict="REAL CANDIDATE — code differs from both parents; rerun the failing tests 3x on M"; fi
  echo "pair $i: $note → $verdict"
done
