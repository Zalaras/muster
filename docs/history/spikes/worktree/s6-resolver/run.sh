#!/usr/bin/env bash
# S6 run — for each pair and each arm (ctx | diff), a fresh headless resolver session rebases
# B onto main and resolves; ground truth = go vet + go test. GUARDED like S4.
# Model is a parameter: MODEL=claude-haiku-4-5-20251001 (default) — use the same model in both arms.
set -u
STATE=/Users/damian/Documents/code/Projects/muster/plans/v1-cleanup/orchestration-state.json
if [ "${MUSTER_SPIKES_ALLOW_LLM:-}" != 1 ] && [ "$(jq -r .status "$STATE" 2>/dev/null)" != completed ]; then
  echo "refusing: pipeline v1-cleanup is $(jq -r .status "$STATE")"; exit 2; fi
D="${MUSTER_SPIKES_HOME:-$HOME/.muster-spikes}/s6-resolver"; MODEL="${MODEL:-claude-haiku-4-5-20251001}"; OUT="$D/results-$(date +%s).tsv"
bash "$(dirname "$0")/make-pairs.sh"
printf 'pair\tarm\trebase_left_conflicts\tverify\tresolution_sha\n' > "$OUT"
for p in p1 p2 p3; do for arm in ctx diff; do
  R="$D/pairs/$p/$arm"; cd "$R"; git checkout -q B
  if [ "$arm" = ctx ]; then extra="Task context: branch A's task is in TASK-A.md (also visible in git log main -1); yours (B) is in TASK-B.md. Preserve BOTH intents."; else extra=""; fi
  prompt="Rebase branch B onto main in this repo and resolve every merge conflict so that 'go vet ./... && go test ./...' passes. $extra Do not delete tests. Finish the rebase (git rebase --continue) and stop. Do not push."
  /Users/damian/.local/bin/claude -p "$prompt" --model "$MODEL" --permission-mode acceptEdits --allowedTools "Bash,Read,Edit,Write" </dev/null >"$R/../resolver-$arm.log" 2>&1
  left=$(git diff --name-only --diff-filter=U | wc -l | tr -d ' '); [ -d .git/rebase-merge ] && left="$left(rebase-in-progress)"
  v=$(go vet ./... >/dev/null 2>&1 && go test ./... >/dev/null 2>&1 && echo PASS || echo FAIL)
  printf '%s\t%s\t%s\t%s\t%s\n' "$p" "$arm" "$left" "$v" "$(git rev-parse --short HEAD)" | tee -a "$OUT"
done; done
echo "results: $OUT"
