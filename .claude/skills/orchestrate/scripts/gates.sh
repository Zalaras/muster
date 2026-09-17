#!/usr/bin/env bash
# Run the pipeline's baseline gates plus a plan's authored ```checks block, fresh.
#
# Usage (from anywhere; the script cds to the project root):
#   gates.sh <plan> [--no-e2e] [--checks-only] [--baseline-only] [--wave 1|2|3]
#
#   --no-e2e         omit `make e2e` from the baseline (a daemon plan whose Step 1 was skipped)
#   --checks-only    run only the plan's ```checks block
#   --baseline-only  run only the baseline gates
#   --fresh          ignore the result ledger and re-run every gate for real
#   --wave N         the gate for one fix wave: that wave's build/test/e2e commands for the
#                    side(s) the branch touched, plus every authored check the wave can reach
#                    (wave 1 skips the test and e2e suites, wave 2 skips e2e, wave 3 runs all).
#                    A wave gate that named only build/test/e2e let a wave pass while the plan's
#                    own `make web-lint` check was red (markdown-viewing retro, 2026-09-14).
#                    Wave 1 runs `make lint` and `make web-build` tolerating only compile errors
#                    confined to test files (_test.go typecheck, *.test.ts tsc), printing those
#                    files as a NOTE for the orchestrator to match against the impl agent's
#                    Handoff; wave 2 runs both strictly, which is what proves a sanctioned wave-1
#                    test-file break was repaired (kb:lesson/sanctioned-test-break-blinds-lint).
#                    (`golangci-lint --tests=false` was tried and rejected: it reports test-only
#                    helpers as unused on a clean tree.)
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
[[ -n "$PLAN" ]] || { echo "usage: gates.sh <plan> [--no-e2e] [--checks-only] [--baseline-only] [--fresh]" >&2; exit 2; }
shift
RUN_E2E=1; RUN_BASELINE=1; RUN_CHECKS=1; RUN_FRESH=0; WAVE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-e2e) RUN_E2E=0 ;;
    --checks-only) RUN_BASELINE=0 ;;
    --baseline-only) RUN_CHECKS=0 ;;
    --fresh) RUN_FRESH=1 ;;
    --wave) shift; WAVE="${1:-}" ;;
    --wave=*) WAVE="${1#*=}" ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done
case "$WAVE" in ''|1|2|3) ;; *) echo "--wave takes 1, 2 or 3 (got: $WAVE)" >&2; exit 2 ;; esac

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

# --- result ledger -------------------------------------------------------------------------
# SEEN dedupes within one invocation; the ledger extends that across invocations, keyed on a
# fingerprint of the working tree. The pipeline proved the same tree green up to four times per
# review cycle (the wave-3 gate, Final Validation, the reviewer's own run) because "nothing has
# changed since, that run counts" was a judgement call spanning separate processes that nothing
# could enforce. Only a PASS is ever reused — a FAIL always re-runs, so the ledger can never
# mask a red. The TTL bounds inputs the fingerprint cannot see (installed web dependencies, the
# Go build cache, the pinned claude binary); --fresh discards the ledger entirely.
LEDGER="${GATES_LEDGER:-${TMPDIR:-/tmp}/muster-gates-ledger-$PLAN.tsv}"
LEDGER_TTL="${GATES_LEDGER_TTL:-14400}"   # 4 h

tree_fingerprint() {
  {
    git rev-parse HEAD
    git diff HEAD
    git ls-files --others --exclude-standard | while IFS= read -r f; do shasum -a 256 "$f"; done
    shasum -a 256 go.sum web/package-lock.json .nvmrc 2>/dev/null
  } 2>/dev/null | shasum -a 256 | cut -d' ' -f1
}

# No git HEAD means no trustworthy fingerprint — run everything rather than reuse blindly.
FP=""
git rev-parse HEAD >/dev/null 2>&1 && FP="$(tree_fingerprint)"
NOW="$(date +%s)"
PRIOR=""
if [[ -n "$FP" ]]; then
  if (( RUN_FRESH )); then
    : > "$LEDGER" 2>/dev/null || true
  elif [[ -f "$LEDGER" ]]; then
    PRIOR="$(awk -F'\t' -v fp="$FP" -v now="$NOW" -v ttl="$LEDGER_TTL" \
      '$1==fp && $3=="PASS" && (now-$2)<=ttl {print $2 "\t" $4}' "$LEDGER")"
  fi
fi

prior_at() {                   # $1 = cmd; prints the epoch of a reusable PASS, else nothing
  [[ -n "$PRIOR" ]] || return 0
  # Via ENVIRON, never `awk -v`: -v processes backslash escapes in the value, so a command
  # containing \. or \( never matched itself and re-ran every time.
  GATES_CMD="$1" awk -F'\t' '$2==ENVIRON["GATES_CMD"] {print $1; exit}' <<<"$PRIOR"
}

# --- runner --------------------------------------------------------------------------------
# macOS ships bash 3.2 (no associative arrays): SEEN is a newline-separated list of
# "<status><TAB><cmd>" records, looked up by exact command match.
RESULTS=()                     # "PASS|FAIL<TAB>ID<TAB>cmd"
SEEN=""
FAILS=0
n=0

seen_status() {                # $1 = cmd; prints PASS/FAIL if already run, else nothing
  GATES_CMD="$1" awk -F'\t' '$2==ENVIRON["GATES_CMD"] {print $1; exit}' <<<"$SEEN"
}

run_one() {                    # $1 = label/ID, $2 = command string
  local id="$1" cmd="$2" status
  status="$(seen_status "$cmd")"
  if [[ -n "$status" ]]; then
    RESULTS+=("$status	$id	$cmd	(deduped)")
    printf '%s  %-4s %s  (same command as an earlier line — not re-run)\n' "$status" "$id" "$cmd"
    return
  fi
  local at
  at="$(prior_at "$cmd")"
  if [[ -n "$at" ]]; then
    RESULTS+=("PASS	$id	$cmd	(ledger)")
    printf 'PASS  %-4s %s  (proven against this exact tree at %s — not re-run)\n' \
      "$id" "$cmd" "$(date -r "$at" '+%H:%M:%S')"
    SEEN="$SEEN
PASS	$cmd"
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
  if [[ "$status" == PASS && -n "$FP" ]]; then
    printf '%s\t%s\tPASS\t%s\n' "$FP" "$NOW" "$cmd" >>"$LEDGER" 2>/dev/null || true
  fi
  RESULTS+=("$status	$id	$cmd")
  printf '%s  %-4s %s\n' "$status" "$id" "$cmd"
  if [[ "$status" == FAIL ]]; then
    echo "----- last 25 lines of $log -----"
    tail -25 "$log"
    echo "----- end -----"
  fi
}

# --- wave-1 compile gates tolerant of sanctioned test-file breakage -----------------------------
# A sanctioned wave-1 signature change can break a test file only wave 2 may edit
# (kb:lesson/sanctioned-test-break-blinds-lint). `make web-build` is `tsc --noEmit && vite build`
# and tsc type-checks test files too; golangci-lint stops at the first typecheck failure, so a
# broken _test.go hides every real finding. Each gate below passes strictly, or passes when every
# reported error sits in a test file — printing those files on fd 3 (the script's stdout, past
# run_one's log redirection) as a NOTE for the orchestrator to match against the impl Handoff. Any
# error outside a test file is a real failure. Wave 2 runs the strict commands.
exec 3>&1
lint_src() {
  local out issues bad
  if out="$(make lint 2>&1)"; then printf '%s\n' "$out"; return 0; fi
  printf '%s\n' "$out"
  issues="$(printf '%s\n' "$out" | grep -E '^[^ :]+\.go:[0-9]+:[0-9]+: ' || true)"
  if [[ -z "$issues" ]]; then echo "make lint failed without issue lines"; return 1; fi
  # golangci-lint stamps "(typecheck)" only on the LAST line of a grouped typecheck block, so
  # requiring it per line made every sanctioned break with more than one call site a false red
  # (general-cleanup retro, 2026-09-16). Confinement to a test file is the test; wave 2 runs
  # `make lint` strictly, which is what proves the handoff was honoured.
  bad="$(printf '%s\n' "$issues" | grep -vE '^[^ :]+_test\.go:[0-9]+:[0-9]+: ' || true)"
  if [[ -n "$bad" ]]; then echo "lint issues outside test-file typecheck:"; printf '%s\n' "$bad"; return 1; fi
  local files; files="$(printf '%s\n' "$issues" | cut -d: -f1 | sort -u)"
  printf 'NOTE  lint-src: typecheck errors only in %s — sanctioned wave-1 breakage iff the impl Handoff names each file\n' "$(printf '%s' "$files" | tr '\n' ' ')" >&3
  return 0
}
web_build_src() {
  if make web-build; then return 0; fi
  local out files bad
  out="$(cd web && npx tsc --noEmit 2>&1)" || true
  files="$(printf '%s\n' "$out" | sed -n 's/^\([^ (]*\.tsx\{0,1\}\)([0-9]*,[0-9]*): error .*/\1/p' | sort -u)"
  if [[ -z "$files" ]]; then
    echo "make web-build failed with no tsc errors — the failure is in vite build"; return 1
  fi
  bad="$(printf '%s\n' "$files" | grep -v '\.test\.ts$' || true)"
  if [[ -n "$bad" ]]; then
    echo "tsc errors outside test files:"; printf '%s\n' "$bad"; return 1
  fi
  echo "tsc errors confined to test files:"; printf '%s\n' "$files"
  printf 'NOTE  web-build-src: tsc errors only in %s — sanctioned wave-1 breakage iff the impl Handoff names each file\n' "$(printf '%s' "$files" | tr '\n' ' ')" >&3
  (cd web && npx vite build)
}

# --- wave gate ------------------------------------------------------------------------------
# Which side did this branch touch? Committed range plus the working tree; when neither can be
# determined (no merge-base, detached tree) both run, so a wave gate never under-runs.
if [[ -n "$WAVE" ]]; then
  DAEMON_TOUCHED=0; WEB_TOUCHED=0
  _base="$(git merge-base main HEAD 2>/dev/null || true)"
  _changed="$( { [[ -n "$_base" ]] && git diff --name-only "$_base" HEAD; git status --porcelain | cut -c4-; } 2>/dev/null )"
  if [[ -z "${_changed// }" ]]; then
    DAEMON_TOUCHED=1; WEB_TOUCHED=1
  else
    printf '%s\n' "$_changed" | grep -qE '^(cmd|internal)/' && DAEMON_TOUCHED=1
    printf '%s\n' "$_changed" | grep -qE '^web/'            && WEB_TOUCHED=1
    (( DAEMON_TOUCHED || WEB_TOUCHED )) || { DAEMON_TOUCHED=1; WEB_TOUCHED=1; }
  fi

  echo "== wave $WAVE gate (plan $PLAN; daemon=$DAEMON_TOUCHED web=$WEB_TOUCHED)"
  case "$WAVE" in
    1) (( DAEMON_TOUCHED )) && { run_one build "go build ./..."; run_one lint-src "lint_src"; }
       (( WEB_TOUCHED ))    && run_one web-build-src "web_build_src" ;;
    2) (( DAEMON_TOUCHED )) && { run_one test "make test"; run_one lint "make lint"; }
       (( WEB_TOUCHED ))    && { run_one web-test "make web-test"; run_one web-build "make web-build"; } ;;
    3) run_one e2e "make e2e" ;;
  esac
  # A wave runs every authored check except the suites a later wave owns — this is what makes
  # `make web-lint` (and any other static check the plan authored) part of every wave gate.
  # Wave 1 also leaves the full lint and web-build to wave 2 (sanctioned test-file breakage above).
  case "$WAVE" in
    1) WAVE_SKIP='^(make test|make web-test|make e2e|make lint|make web-build)$' ;;
    2) WAVE_SKIP='^(make e2e)$' ;;
    3) WAVE_SKIP='^$' ;;
  esac
  RUN_BASELINE=0
fi

if (( RUN_BASELINE )); then
  echo "== baseline gates (plan $PLAN)"
  run_one build "go build ./..."
  run_one test  "make test"
  run_one lint  "make lint"
  run_one web-build "make web-build"
  run_one web-test  "make web-test"
  run_one web-lint  "make web-lint"        # Biome lint + format over web/src, web/e2e, web/scripts
  run_one contrast  "make contrast"        # AA contrast/hue/literal gate over web/src/style.css
  run_one versions  "make check-versions"  # no stale Claude Code version-range fragment
  run_one e2e-honest "! rg -n 'test\\.(skip|fixme|only)\\(' web/e2e"   # a skipped/only spec is a vacuous pass (file-drop-fix E9 class)
  run_one kb-check  "make check-kb"   # records parse, cited kb: ids resolve, generated INDEX/contract/rules/CLAUDE trailers fresh
  run_one dead-refs "python3 .claude/skills/orchestrate/scripts/dead-refs.py --all"   # cited paths / make targets / musterd flags exist (two second review cycles were dead references, 2026-09-10)
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
  [[ -n "$WAVE" ]] && echo "== authored checks reachable in wave $WAVE" || echo "== authored checks from $PLAN_FILE"
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
      if [[ -n "$WAVE" ]] && printf '%s' "$cmd" | grep -qE "${WAVE_SKIP}"; then
        echo "SKIP  $id   $cmd  (a later wave owns this suite)"; continue
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
