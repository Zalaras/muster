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

# Hold the gate lock while killing and sweeping, so this tree's own live Playwright run (a
# gates.sh beside the cleanup) is never gutted. Holding (not probing) closes the window
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

# Ownership: this worktree's binary path, and the tag web/e2e/helpers/daemon.ts puts in every
# scratch dir name (first 8 hex of sha256 of the repo root). Another worktree's daemons, stubs
# and dirs are reported and never touched (docs-search-bar retro: --yes killed a neighbour's).
OWNER=$(printf '%s' "$ROOT" | shasum -a 256 | cut -c1-8)
owns() { case "$1" in *"$ROOT/bin/musterd"*|*"muster e2e-$OWNER-"*|*"muster-e2e-repo-$OWNER-"*) return 0;; esac; return 1; }
owned_pid() { # the process, or an ancestor within 8 hops (a stub's pane shell, tmux server), is ours
  local p=$1 i=0 cmd
  while [ "$i" -lt 8 ] && [ -n "$p" ] && [ "$p" -gt 1 ]; do
    cmd=$(ps -o command= -p "$p" 2>/dev/null) || return 1
    owns "$cmd" && return 0
    p=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' '); i=$((i+1))
  done
  return 1
}

# 1. Orphaned daemon / stub processes this worktree started. A user's own `musterd` started via
#    /dev-loop from this tree's bin/ is still listed — reported, and only removed with --yes,
#    which the orchestrator runs knowingly.
pids=""; others=""
for p in $(pgrep -f 'bin/musterd|stub-claude|stub-open' 2>/dev/null); do
  if owned_pid "$p"; then pids="$pids $p"; else others="$others $p"; fi
done
if [ -n "${pids// /}" ]; then
  found=1; say "musterd/stub processes:$pids"
  ps -o pid=,etime=,command= -p "$(echo $pids | tr ' ' ',')" 2>/dev/null | cut -c1-120 | sed 's/^/  /'
  act_locked "kill${pids} 2>/dev/null; sleep 1; kill -9${pids} 2>/dev/null; true"
else say "musterd/stub processes: none"; fi
[ -n "${others// /}" ] && say "  not this worktree's, left alone:$others"

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
# Only this worktree's: owner-tagged dirs, and the gates logs and ledgers of the plan its branch
# names. Untagged dirs (another tree's, a Go test's onexit build, or pre-tag) are counted, not removed.
NAMES="-name 'muster e2e-$OWNER-*' -o -name 'muster-e2e-repo-$OWNER-*'"
PLAN=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null); PLAN=${PLAN#plan/}
if [ "$PLAN" = main ] || [ -z "$PLAN" ]; then
  :
elif pgrep -f 'gates\.sh' >/dev/null 2>&1; then
  say "gates.sh is running: leaving muster-gates-*$PLAN* alone"
else
  NAMES="$NAMES -o -name 'muster-gates-$PLAN.??????' -o -name 'muster-gates-ledger-$PLAN.tsv' -o -name 'muster-gates-last-$PLAN.tsv'"
fi
foreign=$(find "$T" -maxdepth 1 \( -name 'muster e2e-*' -o -name 'muster-e2e-repo-*' -o -name 'musterd-onexit-build-*' \) \
  ! -name "muster e2e-$OWNER-*" ! -name "muster-e2e-repo-$OWNER-*" ! -name 'muster e2e-stub-*' 2>/dev/null | wc -l | tr -d ' ')
[ "$foreign" != 0 ] && say "scratch dirs not tagged for this worktree, left alone: $foreign"
n=$(eval "find \"$T\" -maxdepth 1 \\( $NAMES \\)" 2>/dev/null | wc -l | tr -d ' ')
if [ "$n" != 0 ]; then
  found=1; say "scratch dirs in \$TMPDIR: $n ($(eval "find \"$T\" -maxdepth 1 \\( $NAMES \\) -print0" 2>/dev/null | xargs -0 du -ch 2>/dev/null | tail -1 | cut -f1))"
  act_locked "eval \"find \\\"$T\\\" -maxdepth 1 \\\\( $NAMES \\\\) -print0\" | xargs -0 rm -rf"
else say "scratch dirs in \$TMPDIR: none"; fi

[ "$found" = 0 ] && say "nothing to clean." || true
exit 0
