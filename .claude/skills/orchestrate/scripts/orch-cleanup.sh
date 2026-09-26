#!/usr/bin/env bash
# Report (and with --yes, remove) what an /orchestrate run can leave behind on the machine.
# Covers only what the pipeline itself creates: musterd/stub processes it spawned, the
# dedicated `tmux -L` sockets it uses, and its $TMPDIR scratch dirs. It never touches the
# user's default tmux server, their Claude Code sessions, or any MCP server process.
# Stopping idle teammates is NOT here — that needs the harness's TaskStop, not a shell.
set -uo pipefail
APPLY=0; [ "${1:-}" = "--yes" ] && APPLY=1
T="${TMPDIR:-/tmp/}"; found=0
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"

say() { printf '%s\n' "$*"; }
act() { if [ "$APPLY" = 1 ]; then eval "$1"; say "  removed"; else say "  (dry run — pass --yes to remove)"; fi; }

# Hold the gate lock while killing and sweeping: `pgrep -f bin/musterd` matches every
# worktree's scratch daemons and the $TMPDIR sweep every tree's `muster e2e-*` dirs, so a
# neighbour's live Playwright run would be gutted. Holding (not probing) closes the window
# between check and act. Busy (75) → steps 1 and 3 report only; step 2 is safe regardless.
BUSY=0
if [ -z "${MUSTER_GATELOCK:-}" ]; then
  (cd "$ROOT" && go build -o bin/gatelock ./tools/gatelock) || exit 2   # built: `go run` masks exit 75
  rc=0; (cd "$ROOT" && bin/gatelock run --exclusive --wait 0 -- "$0" "$@") || rc=$?
  [ "$rc" = 75 ] || exit "$rc"
  BUSY=1
fi
gatelock_holder() { "$ROOT/bin/gatelock" status 2>/dev/null | tr '\n' ';'; }
act_locked() { # like act, but a held gate lock turns the action into a report
  if [ "$BUSY" = 1 ]; then say "  skipped — gate lock held by $(gatelock_holder) a Playwright run in another worktree owns these"; else act "$1"; fi
}

# 1. Orphaned daemon / stub processes. Matched on the muster binary path and the harness's
#    stub names, so a user's own `musterd` started via /dev-loop from bin/ is still listed —
#    it is reported, and only removed with --yes, which the orchestrator runs knowingly.
pids=$(pgrep -f 'bin/musterd|stub-claude|stub-open' 2>/dev/null | tr '\n' ' ')
if [ -n "${pids// /}" ]; then
  found=1; say "musterd/stub processes: $pids"
  ps -o pid=,etime=,command= -p ${pids} 2>/dev/null | cut -c1-120 | sed 's/^/  /'
  act_locked "kill ${pids} 2>/dev/null; sleep 1; kill -9 ${pids} 2>/dev/null; true"
else say "musterd/stub processes: none"; fi

# 2. tmux sockets under the dedicated dir — only those with no live server.
socks=$(ls /private/tmp/tmux-$(id -u)/ 2>/dev/null || true)
stale=""
for s in $socks; do tmux -L "$s" ls >/dev/null 2>&1 || stale="$stale $s"; done
if [ -n "${stale// /}" ]; then
  found=1; say "stale tmux sockets:$stale"
  act "for s in$stale; do rm -f /private/tmp/tmux-\$(id -u)/\$s; done"
else say "stale tmux sockets: none"; fi

# 3. Scratch debris. Bounded to $TMPDIR at depth 1 and to names the harness owns.
# A running gates.sh writes per-command logs to $TMPDIR/muster-gates-<plan>.XXXXXX, so sweeping
# while one is alive deletes the log it is writing and every check reports "No such file or
# directory" instead of its result — a green tree read as 14 failures (general-cleanup retro,
# 2026-09-16). Found by pgrep, never a PID file (kb:lesson/pid-file-captures-subshell).
NAMES="-name 'muster e2e-*' -o -name 'muster-e2e-repo-*' -o -name 'musterd-onexit-build-*'"
if pgrep -f 'gates\.sh' >/dev/null 2>&1; then
  say "gates.sh is running: leaving muster-gates-* alone"
else
  NAMES="$NAMES -o -name 'muster-gates-*'"
fi
n=$(eval "find \"$T\" -maxdepth 1 \\( $NAMES \\)" 2>/dev/null | wc -l | tr -d ' ')
if [ "$n" != 0 ]; then
  found=1; say "scratch dirs in \$TMPDIR: $n ($(eval "find \"$T\" -maxdepth 1 \\( $NAMES \\) -print0" 2>/dev/null | xargs -0 du -ch 2>/dev/null | tail -1 | cut -f1))"
  act_locked "eval \"find \\\"$T\\\" -maxdepth 1 \\\\( $NAMES \\\\) -print0\" | xargs -0 rm -rf"
else say "scratch dirs in \$TMPDIR: none"; fi

[ "$found" = 0 ] && say "nothing to clean." || true
exit 0
