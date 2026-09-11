#!/usr/bin/env bash
# Run the pipeline's baseline gates plus a plan's authored ```checks block, fresh.
#
# Usage (from anywhere; the script cds to the project root):
#   gates.sh <plan> [--no-e2e] [--checks-only] [--baseline-only]
#
#   --no-e2e         omit `make e2e` from the baseline (a daemon plan whose Step 1 was skipped)
#   --checks-only    run only the plan's ```checks block
#   --baseline-only  run only the baseline gates
#
# Every command runs once — a checks line whose command string equals a baseline gate is
# reported under its ID without a second run. Exit status is 0 iff every gate and every check
# passed. Per-command output lands in $GATES_LOG_DIR (default: a fresh mktemp dir), and the
# last 25 lines of each failure are echoed inline.
#
# Why a script (orchestrate retro, 2026-09-02): the Final Validation loop was hand-rolled
# each run and once failed on zsh word-splitting rather than on a gate. Two environment
# facts the loop kept tripping over are handled here once:
#   * `rg` is Claude Code's shell-function shim over the `claude` binary, not a binary on
#     PATH, so a `bash -c` subshell cannot see it (m4-hook-lifetime D25). The shim is
#     recreated below when no real rg exists.
#   * Node is pinned via .nvmrc; nvm is sourced if present so `make web-*` see that Node.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT" || exit 2

PLAN="${1:-}"
[[ -n "$PLAN" ]] || { echo "usage: gates.sh <plan> [--no-e2e] [--checks-only] [--baseline-only]" >&2; exit 2; }
shift
RUN_E2E=1; RUN_BASELINE=1; RUN_CHECKS=1
for a in "$@"; do
  case "$a" in
    --no-e2e) RUN_E2E=0 ;;
    --checks-only) RUN_BASELINE=0 ;;
    --baseline-only) RUN_CHECKS=0 ;;
    *) echo "unknown flag: $a" >&2; exit 2 ;;
  esac
done

PLAN_FILE="plans/$PLAN/plan.md"
[[ -f "$PLAN_FILE" ]] || { echo "no such plan: $PLAN_FILE" >&2; exit 2; }

LOG_DIR="${GATES_LOG_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/muster-gates-$PLAN.XXXXXX")}"
mkdir -p "$LOG_DIR"

# --- environment shims ---------------------------------------------------------------------
if ! command -v rg >/dev/null 2>&1; then
  _cc_bin="${CLAUDE_CODE_EXECPATH:-$HOME/.local/bin/claude}"
  if [[ -x "$_cc_bin" ]]; then
    rg() { ( exec -a rg "$_cc_bin" "$@" ); }
    export -f rg
  fi
fi
# A `! rg …` check would pass vacuously if rg were missing (exit 127 inverted), so refuse to
# run at all unless rg demonstrably works.
if ! rg --version >/dev/null 2>&1; then
  echo "error: rg is not runnable here (no binary on PATH and the claude shim failed); negative-grep checks would pass vacuously — aborting" >&2
  exit 2
fi
if [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh" >/dev/null 2>&1
  [[ -f .nvmrc ]] && nvm use >/dev/null 2>&1
fi
PATH="$(go env GOPATH 2>/dev/null || echo "$HOME/go")/bin:$PATH"   # goreleaser & co. live here, not on a login shell's PATH (auto-update D6)

# --- runner --------------------------------------------------------------------------------
# macOS ships bash 3.2 (no associative arrays): SEEN is a newline-separated list of
# "<status><TAB><cmd>" records, looked up by exact command match.
RESULTS=()                     # "PASS|FAIL<TAB>ID<TAB>cmd"
SEEN=""
FAILS=0
n=0

seen_status() {                # $1 = cmd; prints PASS/FAIL if already run, else nothing
  printf '%s\n' "$SEEN" | awk -F'\t' -v c="$1" '$2==c {print $1; exit}'
}

run_one() {                    # $1 = label/ID, $2 = command string
  local id="$1" cmd="$2" status
  status="$(seen_status "$cmd")"
  if [[ -n "$status" ]]; then
    RESULTS+=("$status	$id	$cmd	(deduped)")
    printf '%s  %-4s %s  (same command as an earlier line — not re-run)\n' "$status" "$id" "$cmd"
    return
  fi
  n=$((n+1))
  local log="$LOG_DIR/$(printf '%02d' "$n")-$id.log"
  if ( eval "$cmd" ) >"$log" 2>&1; then
    status=PASS
  else
    status=FAIL; FAILS=$((FAILS+1))
  fi
  SEEN="$SEEN
$status	$cmd"
  RESULTS+=("$status	$id	$cmd")
  printf '%s  %-4s %s\n' "$status" "$id" "$cmd"
  if [[ "$status" == FAIL ]]; then
    echo "----- last 25 lines of $log -----"
    tail -25 "$log"
    echo "----- end -----"
  fi
}

if (( RUN_BASELINE )); then
  echo "== baseline gates (plan $PLAN)"
  run_one build "go build ./..."
  run_one test  "make test"
  run_one lint  "make lint"
  run_one web-build "make web-build"
  run_one web-test  "make web-test"
  run_one e2e-honest "! rg -n 'test\\.(skip|fixme|only)\\(' web/e2e"   # a skipped/only spec is a vacuous pass (file-drop-fix E9 class)
  run_one dead-refs "python3 .claude/skills/orchestrate/scripts/dead-refs.py"   # cited paths / make targets / musterd flags exist (two second review cycles were dead references, 2026-09-10)
  run_one e2e-lint  "make e2e-lint"   # fixtures only via helpers/fixtures.ts, no fixed sleeps (test-strategy)
  if (( RUN_E2E )); then
    run_one e2e "make e2e"
  else
    # Register the skip in SEEN so a ```checks line that names `make e2e` (E1 in most plans)
    # dedupes to SKIP instead of running the suite anyway (ui-text-and-focus: --no-e2e skipped
    # the baseline line and then ran E1's identical command for five minutes).
    echo "SKIP  e2e  make e2e  (--no-e2e)"
    SEEN="$SEEN
SKIP	make e2e"
  fi
fi

if (( RUN_CHECKS )); then
  echo "== authored checks from $PLAN_FILE"
  # Lines between the ```checks fence and the next ``` fence; skip blanks and # comments.
  block="$(awk '/^```checks[[:space:]]*$/{f=1;next} f&&/^```/{f=0} f' "$PLAN_FILE")"
  if [[ -z "$block" ]]; then
    echo "NOTE  no \`\`\`checks block in $PLAN_FILE — plan predates the Automated Checks convention; baseline only"
  else
    while IFS= read -r line; do
      [[ -z "${line// }" || "$line" == \#* ]] && continue
      id="${line%% *}"; cmd="${line#* }"
      if [[ "$id" == "$line" ]]; then
        echo "FAIL  ??   malformed checks line (no command): $line"; FAILS=$((FAILS+1)); continue
      fi
      run_one "$id" "$cmd"
    done <<<"$block"
  fi
fi

echo
echo "== summary: $((${#RESULTS[@]})) lines, $FAILS failed; logs in $LOG_DIR"
if (( FAILS )); then
  for r in "${RESULTS[@]}"; do [[ "$r" == FAIL* ]] && echo "  $r"; done
  exit 1
fi
exit 0
