#!/usr/bin/env bash
# Spike 2 — passive tier-1 conflict radar. READ-ONLY against every worktree of every repo
# listed in ~/.muster-spikes/radar/repos.txt. Appends one JSON line per worktree per tick.
# GIT_OPTIONAL_LOCKS=0 makes `git status` skip its index refresh write, so it can never
# race a live pipeline for index.lock. Nothing here ever writes into a repo.
set -u
export GIT_OPTIONAL_LOCKS=0
D="${MUSTER_SPIKES_HOME:-$HOME/.muster-spikes}/radar"
REPOS="$D/repos.txt"; OUT="$D/samples.jsonl"; INTERVAL="${RADAR_INTERVAL:-30}"
echo $$ > "$D/watch.pid"
while :; do
  ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  while IFS= read -r repo; do
    [ -n "$repo" ] && [ -d "$repo" ] || continue
    git -C "$repo" worktree list --porcelain 2>/dev/null | awk '/^worktree /{print $2}' | while IFS= read -r wt; do
      [ -d "$wt" ] || continue
      branch=$(git -C "$wt" symbolic-ref --short -q HEAD 2>/dev/null || echo DETACHED)
      head=$(git -C "$wt" rev-parse --short HEAD 2>/dev/null || echo "")
      base=$(git -C "$wt" merge-base HEAD main 2>/dev/null || echo "")
      dirty=$(git -C "$wt" status --porcelain 2>/dev/null | jq -R . | jq -sc .)
      if [ -n "$base" ]; then committed=$(git -C "$wt" diff --name-only "$base" HEAD 2>/dev/null | jq -R . | jq -sc .); else committed='[]'; fi
      jq -nc --arg at "$ts" --arg repo "$repo" --arg wt "$wt" --arg br "$branch" --arg head "$head" --arg base "$base" \
        --argjson dirty "$dirty" --argjson committed "$committed" \
        '{at:$at,repo:$repo,worktree:$wt,branch:$br,head:$head,base:$base,dirty:$dirty,committed:$committed}'
    done
  done < "$REPOS" >> "$OUT"
  sleep "$INTERVAL"
done
