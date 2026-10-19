#!/usr/bin/env bash
# Run the pipeline's baseline gates plus a plan's authored ```checks block, fresh.
#
# Usage (from anywhere; the script cds to the project root):
#   gates.sh <plan> [--no-e2e|--full-e2e] [--checks-only] [--baseline-only] [--fresh] [--wave 1|2|3]
#
#   --no-e2e         omit the e2e gate (an `E2E Scope: none` plan at Final Validation)
#   --full-e2e       the e2e gate is the whole suite — Final Validation, once per plan; the only
#                    run (with --no-e2e) that writes the completion record orch-state.py reads
#   --e2e-scope      print the spec files the scoped e2e gate would run (see "E2E scope") and exit;
#                    takes no lock, runs no `--touch`
#   --checks-only    run only the plan's ```checks block
#   --baseline-only  run only the baseline gates
#   --fresh          ignore the result ledger and re-run every gate for real
#   --code-fingerprint  print the tree fingerprint outside plans/ that a full run records, and exit
#   --wave N         the gate for one fix wave: that wave's build/test/e2e commands for the
#                    side(s) the branch touched, plus every authored check the wave can reach
#                    (wave 1 skips the test and e2e suites, wave 2 skips e2e, wave 3 runs the
#                    scoped e2e gate).
#
#   The e2e gate is SCOPED by default (kb:adr/process-e2e-gates-scoped-full-sweep-once-at-completion):
#   `make e2e SPECS='…'` over the spec files this plan can affect, computed below from the branch
#   diff, the plan's Features/Touches headers and the feature registry's ownership. The whole suite
#   runs once, at Final Validation (--full-e2e), and `status completed` is refused until that run
#   is green on the current tree.
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
# passed; a WARN line (size-warn.sh: funlen, dupl, file length) reports hits and never fails
# (kb:adr/process-size-linters-warn-never-fail). Per-command output lands in $GATES_LOG_DIR
# (default: a fresh mktemp dir), and the last 25 lines of each failure are echoed inline.
#
# Why a script (orchestrate retro, 2026-09-02): the Final Validation loop was hand-rolled
# each run and once failed on zsh word-splitting rather than on a gate. Two environment
# facts the loop kept tripping over are handled here once:
#   * `rg` is Claude Code's shell-function shim over the `claude` binary, not a binary on
#     PATH, so a `bash -c` subshell cannot see it (m4-hook-lifetime D25). The shim is
#     recreated below when no real rg exists.
#   * Node is pinned via .nvmrc; nvm is sourced if present so `make web-*` see that Node.
#   * The whole run holds the machine-wide gate lock (tools/gatelock): shared for --wave 1|2
#     (no Playwright there; two trees' wave gates may overlap), exclusive otherwise — a scoped
#     e2e run is still a Playwright run. It waits GATES_LOCK_WAIT (default 150s: the 10-minute
#     Bash ceiling minus a ~390 s full baseline; a scoped baseline is shorter, the budget stands)
#     and exits 75 when the wait expires — busy, not red: rerun, the ledger reuses every PASS.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT" || exit 2

ORIG_ARGS=("$@")   # for the re-exec under the gate lock below
PLAN="${1:-}"
[[ -n "$PLAN" ]] || { echo "usage: gates.sh <plan> [--no-e2e|--full-e2e] [--checks-only] [--baseline-only] [--fresh] [--wave 1|2|3] [--e2e-scope]" >&2; exit 2; }
shift
# The tree outside plans/, for orch-state.py's completion refusal: a full run records its fail
# count against it (LAST, below), and committing the state or review files does not move it.
code_fingerprint() {
  { git ls-files -s -- ':!plans'; git diff HEAD -- ':!plans'
    git ls-files --others --exclude-standard -- ':!plans' | while IFS= read -r f; do shasum -a 256 "$f"; done
  } 2>/dev/null | shasum -a 256 | cut -d' ' -f1
}
RUN_E2E=1; E2E_MODE=scoped; PRINT_SCOPE=0; RUN_BASELINE=1; RUN_CHECKS=1; RUN_FRESH=0; WAVE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-e2e) RUN_E2E=0 ;;
    --full-e2e) E2E_MODE=full ;;
    --e2e-scope) PRINT_SCOPE=1 ;;
    --checks-only) RUN_BASELINE=0 ;;
    --baseline-only) RUN_CHECKS=0 ;;
    --fresh) RUN_FRESH=1 ;;
    --wave) shift; WAVE="${1:-}" ;;
    --wave=*) WAVE="${1#*=}" ;;
    --code-fingerprint) code_fingerprint; exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done
case "$WAVE" in ''|1|2|3) ;; *) echo "--wave takes 1, 2 or 3 (got: $WAVE)" >&2; exit 2 ;; esac
(( RUN_E2E )) || [[ "$E2E_MODE" == scoped ]] || { echo "--no-e2e and --full-e2e exclude each other" >&2; exit 2; }

PLAN_FILE="plans/$PLAN/plan.md"
[[ -f "$PLAN_FILE" ]] || { echo "no such plan: $PLAN_FILE" >&2; exit 2; }

# --- E2E scope -------------------------------------------------------------------------------
# The spec files this plan can affect, as `make e2e SPECS=…` wants them (`e2e/<file>.spec.ts`, sorted):
# `all` on a harness-wide change; else the specs owned by a **Features**/**Touches** feature or by
# a changed code file's owner (so it runs after the `--touch` line has widened the header), the
# specs the branch changed or the **Fixture plan** names, and the importers of a changed helper
# through helper→helper imports to a fixpoint. Only files on disk count: a Fixture-plan spec not
# yet authored would make Playwright exit 1 on "no tests found". The set is approximate by design
# — a shared-package edit can break a spec no feature link reaches — which is why the full sweep
# still runs once (--full-e2e).
E2E_HARNESS_WIDE='^(web/playwright\.config\.ts|web/package(-lock)?\.json|web/vite\.config\.ts|web/tsconfig[^/]*\.json|web/scripts/e2e-lint\.sh|web/index\.html|Makefile|\.nvmrc|internal/webui/)'

changed_files() {              # committed range from main plus the working tree, one path per line
  local base; base="$(git merge-base main HEAD 2>/dev/null || true)"
  { [[ -n "$base" ]] && git diff --name-only "$base" HEAD; git status --porcelain | cut -c4- | sed -E 's/^.* -> //'; } 2>/dev/null \
    | sed '/^$/d' | sort -u
}

header_names() {               # $1 = Features|Touches → the header's names, one per line
  grep -E "^\*\*$1\*\*:" "$PLAN_FILE" | sed -E 's/^\*\*[A-Za-z]+\*\*:[[:space:]]*//' | tr ',' ' ' | tr -s ' ' '\n' | sed '/^$/d'
}

e2e_scope() {                  # prints `all`, nothing, or the spec list on one line
  local changed code feats specs owned helpers queue seen h importers all_specs
  changed="$(changed_files)"
  local wide; wide="$(printf '%s\n' "$changed" | grep -E "$E2E_HARNESS_WIDE" || true)"
  if [[ -n "$wide" ]]; then
    echo "e2e scope: all — harness-wide change: $(printf '%s' "$wide" | tr '\n' ' ')" >&2
    echo all; return
  fi
  code="$(printf '%s\n' "$changed" | grep -E '^(cmd|internal|web/src|web/e2e)/.*\.(go|ts)$' || true)"
  feats="$( { header_names Features; header_names Touches
              # shellcheck disable=SC2086
              [[ -n "$code" ]] && go tool kb owners $code 2>/dev/null | cut -f2 | tr ',' '\n'
            } | grep -vx -- '-' | sed '/^$/d' | sort -u)"
  specs=""
  if [[ -n "$feats" ]]; then
    # shellcheck disable=SC2086
    owned="$(go tool kb owners web/e2e/*.spec.ts 2>/dev/null \
      | awk -F'\t' -v F=" $(printf '%s ' $feats)" '{ n=split($2,a,","); for (i=1;i<=n;i++) if (index(F, " " a[i] " ")) { print $1; break } }')"
    specs="$owned"
  fi
  specs="$specs
$(printf '%s\n' "$changed" | grep -E '^web/e2e/[^/]+\.spec\.ts$' || true)
$(grep -E '^\*\*Fixture plan\*\*:' "$PLAN_FILE" | grep -oE '[a-z0-9-]+\.spec\.ts' | sed 's|^|web/e2e/|' || true)"
  helpers="$(printf '%s\n' "$changed" | grep -E '^web/e2e/helpers/[^/]+\.ts$' | sed -E 's|^web/e2e/helpers/(.*)\.ts$|\1|' || true)"
  queue="$helpers"; seen=""
  while [[ -n "${queue// }" ]]; do
    h="$(printf '%s\n' "$queue" | sed '/^$/d' | sed -n 1p)"; queue="$(printf '%s\n' "$queue" | sed '/^$/d' | sed 1d)"
    printf '%s\n' "$seen" | grep -qx -- "$h" && continue
    seen="$seen
$h"
    importers="$(grep -lE "from \"\./(helpers/)?$h\"" web/e2e/*.spec.ts web/e2e/helpers/*.ts 2>/dev/null || true)"
    specs="$specs
$(printf '%s\n' "$importers" | grep -E '\.spec\.ts$' || true)"
    queue="$queue
$(printf '%s\n' "$importers" | grep -E '^web/e2e/helpers/' | sed -E 's|^web/e2e/helpers/(.*)\.ts$|\1|' || true)"
  done
  specs="$(printf '%s\n' "$specs" | sed '/^$/d' | sort -u | while IFS= read -r s; do [[ -f "$s" ]] && printf '%s\n' "${s#web/}"; done)"
  [[ -n "$specs" ]] || return 0
  all_specs="$(cd web && ls e2e/*.spec.ts | sort)"
  [[ "$specs" == "$all_specs" ]] && { echo "e2e scope: all — the set reached every spec file" >&2; echo all; return; }
  printf '%s\n' "$specs" | tr '\n' ' ' | sed 's/ $//'; echo
}

if (( PRINT_SCOPE )); then e2e_scope; exit 0; fi

# Re-exec once under the gate lock (header): only the baseline, wave 3 and --checks-only can
# reach Playwright (scoped or full, either is exclusive), so waves 1 and 2 take it shared. Nested
# `make test`/`make e2e` below then no-op their own acquire via MUSTER_GATELOCK. Exit 75 = busy
# (the holder is named).
if [[ -z "${MUSTER_GATELOCK:-}" ]]; then
  case "$WAVE" in 1|2) _mode=shared ;; *) _mode=exclusive ;; esac
  go build -o bin/gatelock ./tools/gatelock || exit 2   # built, not `go run`: go run masks exit codes (75 included)
  exec bin/gatelock run --$_mode --wait "${GATES_LOCK_WAIT:-150s}" -- "$0" "${ORIG_ARGS[@]}"
fi

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
# Go build cache, the pinned claude binary); --fresh discards the ledger entirely. The key is the
# command string, so a scoped `make e2e SPECS='…'` PASS never stands in for the full `make e2e`
# Final Validation runs (--full-e2e), which is by design the one run that is not a reuse.
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
RESULTS=()                     # "PASS|FAIL|WARN<TAB>ID<TAB>cmd"
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

run_warn() {                   # $1 = label/ID, $2 = command string — reports hits, never fails
  n=$((n+1))
  local log="$LOG_DIR/$(printf '%02d' "$n")-$1.log"
  ( eval "$2" ) >"$log" 2>&1 || true
  local hits; hits="$(grep -c '^WARN ' "$log" 2>/dev/null || true)"
  RESULTS+=("WARN	$1	$2	($hits hits)")
  printf 'WARN  %-4s %s  (%s hits — never fails; see %s)\n' "$1" "$2" "${hits:-0}" "$log"
}

# The e2e gate (header "E2E scope"). Whatever ran, `make e2e` is registered in SEEN with the
# outcome, so a ```checks line naming the bare command (E1 in most plans) means "the e2e gate"
# and dedupes to it instead of sweeping the suite a second time.
run_e2e_gate() {
  local scope count status
  if (( ! RUN_E2E )); then
    echo "SKIP  e2e  make e2e  (--no-e2e)"
    SEEN="$SEEN
SKIP	make e2e"
    return
  fi
  if [[ "$E2E_MODE" == full ]]; then run_one e2e "make e2e"; return; fi
  scope="$(e2e_scope)"
  if [[ -z "$scope" ]]; then
    echo "SKIP  e2e  make e2e  (scope empty: no spec changed, named or owned by a Features/Touches feature — the whole suite runs at Final Validation, --full-e2e)"
    SEEN="$SEEN
SKIP	make e2e"
    return
  fi
  if [[ "$scope" == all ]]; then
    echo "NOTE  e2e scope: all (a harness-wide file or an everywhere-imported helper changed)"
    run_one e2e "make e2e"
    return
  fi
  count="$(wc -w <<<"$scope" | tr -d ' ')"
  echo "NOTE  e2e scope: $count spec file(s) — $scope — the whole suite runs once at Final Validation (--full-e2e)"
  run_one e2e "make e2e SPECS='$scope'"
  status="$(seen_status "make e2e SPECS='$scope'")"
  SEEN="$SEEN
$status	make e2e"
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
# Every non-test web/src/features module is named in that directory's CLAUDE.md, as a `file.ts` or a
# **feature** trailer entry; web-impl twice left a new module out (groups, masthead-indicators retros).
features_inventory() {
  local f b c=web/src/features/CLAUDE.md rc=0
  for f in web/src/features/*.ts; do
    [[ $f == *.test.ts ]] && continue; b=$(basename "$f")
    grep -qF "\`$b\`" "$c" || grep -qF "**${b%.ts}**" "$c" || { echo "$f is not named in $c"; rc=1; }
  done
  return $rc
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
  _changed="$(changed_files)"
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
       (( WEB_TOUCHED ))    && { run_one web-build-src "web_build_src"; run_one features-inventory "features_inventory"; } ;;
    2) (( DAEMON_TOUCHED )) && { run_one test "make test"; run_one lint "make lint"; }
       (( WEB_TOUCHED ))    && { run_one web-test "make web-test"; run_one web-build "make web-build"; } ;;
    3) ;;   # the scoped e2e gate, below, after `--touch` has widened the header it reads
  esac
  run_one features "go tool kb scope --plan $PLAN --touch"   # a fix wave that moved code into another feature widens **Touches** itself
  run_one comments "python3 .claude/skills/orchestrate/scripts/comment-checks.py --gates"   # plan IDs / review labels in added production lines; the SubagentStop hook's backstop
  run_one kb-check "make check-kb"   # a new file owned by no feature, or a dead cited path, shows here, not at the full run (groups retro: four hand glob edits)
  [[ "$WAVE" == 3 ]] && run_e2e_gate
  # A wave runs every authored check except the suites a later wave owns — this is what makes
  # `make web-lint` (and any other static check the plan authored) part of every wave gate.
  # Wave 1 also leaves the full lint and web-build to wave 2 (sanctioned test-file breakage above).
  # Waves 1 and 2 hold the gate lock shared, so any authored Playwright line (`make e2e*` or a
  # raw `playwright test`) is skipped there rather than refused as a self-deadlock; wave 3 owns it.
  case "$WAVE" in
    1) WAVE_SKIP='^(make test|make web-test|make e2e.*|make lint|make web-build|.*playwright.*)$' ;;
    2) WAVE_SKIP='^(make e2e.*|.*playwright.*)$' ;;
    3) WAVE_SKIP='^$' ;;
  esac
  RUN_BASELINE=0
fi

if (( RUN_BASELINE )); then
  echo "== baseline gates (plan $PLAN)"
  run_one build "go build ./..."
  run_one test  "make test-race"           # the race detector is a real failure; ~161 s (2026-09-26), so only the baseline pays for it
  # A green race run is a superset of `make test`, so an authored check naming the plain
  # command dedupes to this PASS instead of running the suite a second time.
  [[ "$(seen_status "make test-race")" == PASS ]] && SEEN="$SEEN
PASS	make test"
  run_one lint  "make lint"
  run_one web-build "make web-build"
  run_one web-test  "make web-test"
  run_one web-lint  "make web-lint"        # Biome lint + format over web/src, web/e2e, web/scripts
  run_one contrast  "make contrast"        # AA contrast/hue/literal gate over web/src/style.css
  run_one features-inventory "features_inventory"   # every features/*.ts named in its CLAUDE.md
  run_one versions  "make check-versions"  # no stale Claude Code version-range fragment
  run_one e2e-honest "! rg -n 'test\\.(skip|fixme|only)\\(' web/e2e"   # a skipped/only spec is a vacuous pass (file-drop-fix E9 class)
  run_one kb-check  "make check-kb"   # records parse, cited kb: ids resolve, generated INDEX/contract/rules/CLAUDE trailers fresh, cited paths / make targets / musterd flags exist (two second review cycles were dead references, 2026-09-10)
  run_one e2e-lint  "make e2e-lint"   # fixtures only via helpers/fixtures.ts, no fixed sleeps (test-strategy)
  run_one features "go tool kb scope --plan $PLAN --touch"   # changed files' owning features all in **Features** or **Touches**, widening the latter itself (frontmatter retro, 2026-09-23)
  run_one comments "python3 .claude/skills/orchestrate/scripts/comment-checks.py --gates"   # plan IDs / review labels in added production lines (settings-update-failures retro, 2026-09-25)
  run_one comment-ledger "go run ./tools/commentpass verify $PLAN"   # every added production comment is a ledger keep (the comment pass ran before these gates)
  run_warn size ".claude/skills/orchestrate/scripts/size-warn.sh --changed"   # funlen/dupl/file length on this branch's files; read by the maintainability reviewer, never a failure
  run_e2e_gate   # scoped per cycle; `--full-e2e` at Final Validation is the one whole-suite run
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
WARNS=0; for r in "${RESULTS[@]}"; do [[ "$r" == WARN* ]] && WARNS=$((WARNS+1)); done
echo "== summary: $((${#RESULTS[@]})) lines, $FAILS failed, $WARNS warn-only; logs in $LOG_DIR"
# The completion record orch-state.py's `status completed` reads: only a full run whose e2e gate
# was the whole suite (--full-e2e) or deliberately absent (--no-e2e) writes it. A scoped run never
# does, so completion waits for the one full sweep on the current tree.
if (( RUN_BASELINE && RUN_CHECKS )) && [[ -z "$WAVE" ]] && { (( ! RUN_E2E )) || [[ "$E2E_MODE" == full ]]; }; then
  printf '%s\t%s\t%s\n' "$(code_fingerprint)" "$FAILS" "$NOW" > "${TMPDIR:-/tmp}/muster-gates-last-$PLAN.tsv"
fi
if (( FAILS )); then
  for r in "${RESULTS[@]}"; do [[ "$r" == FAIL* ]] && echo "  $r"; done
  exit 1
fi
exit 0
