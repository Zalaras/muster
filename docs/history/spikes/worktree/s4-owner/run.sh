#!/usr/bin/env bash
# S4 run — owner-handoff. Launches ONE real Haiku session in wt-B on a private tmux socket,
# lands A onto main, then injects the conflict notice into the idle owner session and
# measures the result. GUARDED: refuses unless the v1-cleanup pipeline is complete or
# MUSTER_SPIKES_ALLOW_LLM=1 is set.
set -u
STATE=/Users/damian/Documents/code/Projects/muster/plans/v1-cleanup/orchestration-state.json
if [ "${MUSTER_SPIKES_ALLOW_LLM:-}" != 1 ] && [ "$(jq -r .status "$STATE" 2>/dev/null)" != completed ]; then
  echo "refusing: pipeline v1-cleanup is $(jq -r .status "$STATE") — set MUSTER_SPIKES_ALLOW_LLM=1 to override"; exit 2; fi
D="${MUSTER_SPIKES_HOME:-$HOME/.muster-spikes}/s4-owner"; SOCK="$D/tmux.sock"; LOG="$D/run-$(date +%s).log"
export PATH=/usr/local/bin:$PATH; t() { tmux -S "$SOCK" "$@"; }
idle() { # idle = prompt marker visible AND no "esc to interrupt"/thinking indicator, on two consecutive polls (max $1 s).
  # The bare ❯ marker is NOT enough: Claude Code keeps it on screen while working (measured 2026-09-07).
  local calm=0
  for ((i=0;i<$1;i+=2)); do perl -e 'sleep 2'; local pane; pane=$(t capture-pane -p -t s)
    if echo "$pane" | grep -q '❯' && ! echo "$pane" | grep -q -E 'esc to interrupt|thinking|…'; then calm=$((calm+1)); [ $calm -ge 2 ] && return 0; else calm=0; fi
  done; return 1; }
bash "$(dirname "$0")/setup.sh" | tee "$LOG"
t kill-server 2>/dev/null; t new-session -d -s s -x 200 -y 50 -c "$D/wt-B"; t set-option -g status off
t send-keys -t s 'export LANG=en_US.UTF-8 TERM=xterm-256color; unset CLAUDE_CONFIG_DIR; /Users/damian/.local/bin/claude --model claude-haiku-4-5-20251001 --permission-mode acceptEdits --allowedTools "Bash(git:*),Bash(bash:*),Bash(sh:*),Bash(./verify.sh),Bash(cat:*),Bash(ls:*),Read,Edit,Write,Grep,Glob"' Enter
idle 60 || { echo "session never became idle (trust prompt?)"; t capture-pane -p -t s | tail -12; }
t capture-pane -p -t s | grep -q 'safety check' && { t send-keys -t s Down; perl -e 'sleep 1'; t send-keys -t s Enter; idle 40; }
echo "== land A onto main" | tee -a "$LOG"; git -C "$D/repo" checkout -q main && git -C "$D/repo" merge -q --squash A && git -C "$D/repo" commit -qm "land A" && git -C "$D/repo" log --oneline -1 | tee -a "$LOG"
files=$(git -C "$D/wt-B" merge-tree --write-tree main B >/dev/null 2>&1 || git -C "$D/wt-B" merge-tree --write-tree main B | sed -n '2,$p' | awk '{print $NF}' | sort -u | tr '\n' ' ')
msg="Muster: your branch B now conflicts with main on: ${files}(main moved when branch A landed: $(git -C "$D/repo" log -1 --format=%s main)). Please rebase B onto main, resolve the conflicts preserving both branches' intent, run ./verify.sh until it passes, and stop. Do not push."
echo "== inject: $msg" | tee -a "$LOG"; t send-keys -t s "$msg"; perl -e 'sleep 1'; t send-keys -t s Enter
idle 300 || echo "owner did not return to idle within 300s" | tee -a "$LOG"
echo "== measurements" | tee -a "$LOG"
{ echo "status.porcelain: $(git -C "$D/wt-B" status --porcelain | wc -l | tr -d ' ') entries"; echo "rebase in progress: $([ -d "$D/repo/.git/worktrees/wt-B/rebase-merge" ] && echo yes || echo no)"; echo "merge-base==main: $([ "$(git -C "$D/wt-B" merge-base HEAD main)" = "$(git -C "$D/repo" rev-parse main)" ] && echo yes || echo no)"; echo "verify: $(cd "$D/wt-B" && bash ./verify.sh 2>&1)"; echo "verify.sh tampered vs main: $(git -C "$D/wt-B" diff main -- verify.sh | grep -c "^[-+][^-+]")"; echo "commits on B beyond main: $(git -C "$D/wt-B" log --oneline main..HEAD | wc -l | tr -d " ")"; echo "lib.sh:"; sed 's/^/  /' "$D/wt-B/lib.sh"; echo "main.sh:"; sed 's/^/  /' "$D/wt-B/main.sh"; } | tee -a "$LOG"
t capture-pane -p -S -60 -t s > "$D/pane-final.txt"
t send-keys -t s '/exit' Enter; perl -e 'sleep 4'; t kill-server 2>/dev/null; echo "log: $LOG"
