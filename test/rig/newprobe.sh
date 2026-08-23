#!/usr/bin/env bash
# newprobe.sh <index> — stamp out one isolated interface-probe instance.
# Operated via the /interface-probe skill; ported from the ccc-spike rig
# (spikes/RIG.md is the historical recipe, the skill is the live one).
#
# Instances live OUTSIDE the repo tree (default /tmp/muster-probe, override with
# MUSTER_PROBE_HOME): Claude Code loads CLAUDE.md files from every parent
# directory, so a scratch repo inside muster/ (or anywhere under ~/Documents)
# silently pulls Muster's and Damian's instructions into the probe session —
# observed on the first ported run ("ready to help with the Muster project").
# Captures still land in test/rig/captures/ where analysis happens.
#
# Creates, under $MUSTER_PROBE_HOME/instances/<index>/:
#   claude-config/settings.json   UNAUTHENTICATED config dir (for inducing StopFailure)
#   statusline.sh                 status-line script that POSTs its stdin JSON to the capture server
#   hook-cmd.sh                   command-hook wrapper (SessionStart never fires over http)
#   repo/                         scratch git repo with junk files and one commit
#   env.sh                        source this to get the instance's env + helper vars
#
# Port is 878<index>; the tmux socket is a path inside the instance's own scratch dir
# (m2-terminal REQ-5: -tmux-socket accepts a filesystem path, so probe sockets live and
# die with the instance instead of tmux's shared socket directory); capture file is
# test/rig/captures/capture-<index>.jsonl.
#
# Idempotent: safe to re-run. Regenerates settings/scripts, leaves the repo and
# any captured data alone if they already exist.
#
# NEVER touches ~/.claude/.

set -euo pipefail

IDX="${1:?usage: newprobe.sh <index>   (e.g. newprobe.sh 1)}"
case "$IDX" in
  [0-9]) ;;
  *) echo "index must be a single digit 0-9 (port is 878<index>)" >&2; exit 1 ;;
esac

RIG_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROBE_HOME="${MUSTER_PROBE_HOME:-/tmp/muster-probe}"
INST="$PROBE_HOME/instances/$IDX"
PORT="878$IDX"
SOCKET="$INST/tmux.sock"
CAPTURE_DIR="$RIG_ROOT/captures"
CONFIG_DIR="$INST/claude-config"
REPO="$INST/repo"
BASE="http://127.0.0.1:$PORT"

mkdir -p "$CONFIG_DIR" "$CAPTURE_DIR" "$REPO/.claude"

# --- status line script -------------------------------------------------------
# Claude Code pipes a JSON blob on stdin and renders whatever we print on stdout.
cat > "$INST/statusline.sh" <<EOF
#!/usr/bin/env bash
# Status line for probe instance $IDX. Reads Claude Code's JSON on stdin, POSTs
# it to the capture server, prints the server's reply as the status line.
input=\$(cat)
resp=\$(curl -sS -m 3 -X POST -H 'Content-Type: application/json' \\
  --data-binary "\$input" "$BASE/statusline" 2>/dev/null) || resp="MUSTER-PROBE(post-failed)"
printf '%s' "\${resp:-MUSTER-PROBE(empty)}"
EOF
chmod +x "$INST/statusline.sh"

# --- SessionStart wrapper -----------------------------------------------------
# SessionStart does NOT fire over type:"http" (spikes/FINDINGS.md, confirmed by
# an A/B with an http and a command hook in the same block). It only fires as
# type:"command", so it needs this wrapper to reach the capture server.
cat > "$INST/hook-cmd.sh" <<EOF
#!/usr/bin/env bash
# Generic command-hook wrapper: \$1 is the event name to report it under.
event="\${1:-Unknown}"
input=\$(cat)
curl -sS -m 5 -X POST -H 'Content-Type: application/json' \\
  --data-binary "\$input" "$BASE/hook/\$event" >/dev/null 2>&1
exit 0
EOF
chmod +x "$INST/hook-cmd.sh"

# --- settings.json ------------------------------------------------------------
# Every hook event the pinned binary supports, all pointed at the capture server.
# http timeouts are 2 s per the CLAUDE.md hard rule (a slow hook taxes every turn
# by its timeout, additively). The SessionStart command wrapper keeps 10 s — it
# fires once at startup, not per turn.
write_settings() {
python3 - "$1" "$BASE" "$INST/statusline.sh" "$INST/hook-cmd.sh" <<'PY'
import json, sys
out, base, statusline, hookcmd = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]

events = [
    "PreToolUse", "PostToolUse", "UserPromptSubmit", "SessionStart", "SessionEnd",
    "Stop", "StopFailure", "SubagentStop", "PreCompact", "Notification",
    "PermissionRequest", "TeammateIdle", "TaskCompleted", "WorktreeCreate",
    "WorktreeRemove",
]

hooks = {
    e: [{"hooks": [{"type": "http", "url": f"{base}/hook/{e}", "timeout": 2}]}]
    for e in events
}
# SessionStart is command-only; http never fires. Keep both so a future version
# that starts honouring http is visible as a duplicate rather than a gap.
hooks["SessionStart"] = [{"hooks": [
    {"type": "http", "url": f"{base}/hook/SessionStart-http", "timeout": 2},
    {"type": "command", "command": f"{hookcmd} SessionStart", "timeout": 10},
]}]

settings = {
    "model": "claude-haiku-4-5-20251001",
    "allowedHttpHookUrls": [base + "/*"],
    # refreshInterval is in SECONDS (proven not milliseconds). The status line is
    # event-driven regardless; this only covers idle gaps between turns.
    "statusLine": {"type": "command", "command": statusline, "refreshInterval": 5},
    "hooks": hooks,
}
with open(out, "w") as f:
    json.dump(settings, f, indent=2)
    f.write("\n")
PY
}

# Project scope is the isolation mechanism that works (spikes/FINDINGS.md):
# CLAUDE_CONFIG_DIR breaks subscription OAuth. The config-dir copy is written too,
# for probes that deliberately want an unauthenticated session (zero-token
# StopFailure induction).
write_settings "$REPO/.claude/settings.json"
write_settings "$CONFIG_DIR/settings.json"

# --- scratch git repo ---------------------------------------------------------
if [ ! -d "$REPO/.git" ]; then
  git -C "$REPO" init -q -b main
  git -C "$REPO" config user.email "probe@example.invalid"
  git -C "$REPO" config user.name "Muster Probe"
  printf '# scratch repo for muster probe instance %s\n' "$IDX" > "$REPO/README.md"
  printf 'package main\n\nimport "fmt"\n\nfunc main() { fmt.Println("hello") }\n' > "$REPO/main.go"
  printf 'alpha\nbeta\ngamma\n' > "$REPO/notes.txt"
  mkdir -p "$REPO/sub"
  printf 'nested junk\n' > "$REPO/sub/nested.txt"
  git -C "$REPO" add -A
  git -C "$REPO" commit -qm "initial scratch commit"
fi

# --- env helper ---------------------------------------------------------------
cat > "$INST/env.sh" <<EOF
# source this: . "$INST/env.sh"
export PROBE_IDX=$IDX
export PROBE_PORT=$PORT
export PROBE_BASE=$BASE
export PROBE_SOCKET=$SOCKET
export PROBE_REPO=$REPO
export PROBE_CAPTURE=$CAPTURE_DIR/capture-$IDX.jsonl
export LANG=en_US.UTF-8
export TERM=xterm-256color

# CLAUDE_CONFIG_DIR is deliberately NOT exported: setting it breaks subscription
# OAuth ("Not logged in · Please run /login"). It is provided as a plain (unexported)
# variable for probes that deliberately want an UNAUTHENTICATED session — export it
# yourself per-command, never for a session you expect to reach the API.
PROBE_CONFIG_DIR_UNAUTHENTICATED=$CONFIG_DIR
unset CLAUDE_CONFIG_DIR
EOF

echo "instance $IDX ready"
echo "  config dir : $CONFIG_DIR (unauthenticated — for StopFailure induction only)"
echo "  repo       : $REPO"
echo "  port       : $PORT"
echo "  tmux socket: $SOCKET"
echo "  capture    : $CAPTURE_DIR/capture-$IDX.jsonl"
echo "  env        : . $INST/env.sh"
