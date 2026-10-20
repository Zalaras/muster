#!/bin/sh
# e2e-lint.sh — mechanical checks over web/e2e that keep the suite's fixture and timing rules
# (docs/conventions.md §Testing) from eroding one spec at a time. Run from web/ by
# `npm run e2e` (so an agent running a single spec meets it too) and as `make e2e-lint` by
# the pipeline gates. Exit 0 iff clean; every hit is printed as file:line.
#
# Each check exists because its absence cost a real red run (docs/history/design/test-strategy.md):
#   1. Specs get daemons only from helpers/fixtures.ts — a hand-rolled startScratchDaemon is
#      how per-test daemons (and their load) crept back in unnoticed.
#   2. Specs import test/expect/types from ./helpers/fixtures, never "@playwright/test" —
#      the base `test` has no daemon fixtures, so importing it silently bypasses check 1.
#   3. No fixed sleeps in specs — waits are web-first expects that inherit the global timeout;
#      the one legitimate fixed hold ("it STAYED unchanged") is helpers/fixtures.ts settleFor.
#   4. No spec asserts the terminal pane's "session ended" overlay — a ~25 ms transient the
#      alive:false render pass replaces with the dead surface (terminal.spec.ts E12 flaked on
#      it for weeks); assert #dead-surface / .dead-surface .endcap and the socket tracker.
#   5. Biome lint and format over e2e/ — `make web-lint` checks the same files, but an agent
#      that runs only the e2e suite never meets it until the pipeline's wave gate (frontmatter
#      review cycle 1: a one-line format diff cost a round-trip after the sweep was green).
#   6. A test that never touches the daemon is a render test and belongs in web/render/
#      (kb:adr/process-render-fixtures-generated-from-daemon). Checked only on spec files
#      added on this branch (merge-base with main, plus untracked), so the existing suite is
#      not failed retroactively; `--census` reports the whole suite instead and exits 0.
# Comment-only lines are skipped (a leading // or *), helpers/ is exempt by construction.
set -u
cd "$(dirname "$0")/.." || exit 2
fails=0

# Rule 6's oracle. A `test(` block runs to the next test, describe or hook line, or EOF; it
# touches the daemon when a code line matches one of these, or calls a top-level
# function whose body does (one level). `tmux` and `fetch(` are deliberately broad.
# Double backslashes: awk -v unescapes the value once before it becomes a regex.
DAEMON_IDENTS='launchSession\\(|launchTitled|launchBound|launchEndedSession|openBoundSession|driveToState|ingestURL\\(|request\\.(post|put|delete|get)\\(|\\.restart\\(|\\.kill\\(|startDaemon|fileDaemon\\(|killTmuxWindow|tmux|postStatus|postWorkspace|postEffort|wireEffort|wireCache|hookMover|pinViaApi|putTitleViaApi|ViaApi\\(|getState\\(|scratchDirectory\\(|execFile|fetch\\('

# daemonless_tests FILE — prints `FILE:LINE:<test line>` for each test block touching no
# daemon, then a final `COUNT n m` line (n = daemonless, m = tests).
daemonless_tests() {
  awk -v idents="$DAEMON_IDENTS" -v file="$1" '
    function code(line) { return line !~ /^[[:space:]]*(\/\/|\*)/ }
    function touching(line) { return code(line) && line ~ idents }
    # Pass 1: top-level functions whose bodies touch the daemon.
    FNR == NR {
      if ($0 ~ /^(export )?(async )?function [A-Za-z_][A-Za-z0-9_]*[[:space:]]*(<[^>]*>)?\(/) {
        name = $0; sub(/^(export )?(async )?function /, "", name); sub(/[[:space:]]*(<[^>]*>)?\(.*/, "", name)
        infn = name; fntouch[name] = 0; next
      }
      if (infn != "" && $0 ~ /^}/) { infn = ""; next }
      if (infn != "" && touching($0)) fntouch[infn] = 1
      next
    }
    # Pass 2: test blocks.
    function flush() {
      if (start == 0) return
      tests++
      if (!touch) { n++; print file ":" start ":" title }
      start = 0
    }
    function calls_touching_fn(line,   f) {
      if (!code(line)) return 0
      for (f in fntouch) if (fntouch[f] && index(line, f "(") > 0) return 1
      return 0
    }
    /^[[:space:]]*test\(/ { flush(); start = FNR; title = $0; touch = 0 }
    /^[[:space:]]*test\.(describe|beforeEach|afterEach|beforeAll|afterAll|skip|only|fixme)/ { flush(); next }
    start > 0 && (touching($0) || calls_touching_fn($0)) { touch = 1 }
    END { flush(); print "COUNT " n + 0 " " tests + 0 }
  ' "$1" "$1"
}

if [ "${1:-}" = "--census" ]; then
  total_n=0
  total_m=0
  for f in e2e/*.spec.ts; do
    count=$(daemonless_tests "$f" | sed -n '/^COUNT /p')
    set -- ${count:-COUNT 0 0}
    n=$2
    m=$3
    total_n=$((total_n + n))
    total_m=$((total_m + m))
    [ "$n" -gt 0 ] && echo "WARN  $f: $n of $m tests touch no daemon"
  done
  echo "e2e-lint: census $total_n of $total_m tests touch no daemon"
  exit 0
fi

report() { # $1 = rule, $2 = hits (file:line:text per line; empty = clean)
  [ -z "$2" ] && return 0
  echo "e2e-lint: $1"
  printf '%s\n' "$2" | sed 's/^/  /'
  fails=$((fails + 1))
}

# code_lines PATTERN FILE — matching lines, minus comment-only ones, prefixed with the file.
code_lines() { grep -nE "$1" "$2" | grep -vE '^[0-9]+:[[:space:]]*(//|\*)' | sed "s|^|$2:|"; }

hits=$(for f in e2e/*.ts; do code_lines 'startScratchDaemon\(' "$f"; done)
report "startScratchDaemon() outside helpers/ — take \`daemon\`, \`startDaemon\` or fileDaemon() from ./helpers/fixtures" "$hits"

hits=$(for f in e2e/*.spec.ts; do code_lines '"@playwright/test"' "$f"; done)
report "spec imports \"@playwright/test\" — import test/expect/types from ./helpers/fixtures instead" "$hits"

# `(^|[^.[:alnum:]_])` keeps test.setTimeout(...) (a per-test budget, not a sleep) out of it.
hits=$(for f in e2e/*.spec.ts; do code_lines '(waitForTimeout\(|(^|[^.[:alnum:]_])setTimeout\()' "$f"; done)
report "fixed sleep in a spec — use a web-first expect/expect.poll, or settleFor() for a stays-unchanged check" "$hits"

# `[^[:alnum:]]ended` (not \b — BSD grep) catches /session ended/, /ended/ and "ended" after
# terminalOverlay(; the second alternative catches a raw getByText on the same text.
hits=$(for f in e2e/*.spec.ts; do code_lines '(terminalOverlay\(.*[^[:alnum:]]ended|getByText\(/[^/]*session ended)' "$f"; done)
report "asserting the transient \"session ended\" overlay — assert the durable dead surface instead: #dead-surface (Focus) / .dead-surface .endcap (tile), terminalRegion(...).toHaveCount(0), TerminalSocketTracker for the socket" "$hits"

hits=$(npx --no-install biome check e2e 2>&1) || report "biome lint/format over e2e/ — run \`npx biome check --write e2e\` from web/" "$hits"

# On main the merge-base is HEAD, so only untracked spec files are new.
added=$( {
  git diff --relative --diff-filter=A --name-only "$(git merge-base main HEAD)" -- 'e2e/*.spec.ts'
  git ls-files --others --exclude-standard -- 'e2e/*.spec.ts'
} 2>/dev/null | sort -u)
hits=$(for f in $added; do
  [ -f "$f" ] || continue
  daemonless_tests "$f" | grep -v '^COUNT '
done)
report "a test that never touches the daemon is a render test — move it to web/render/ (see web/render/CLAUDE.md)" "$hits"

if [ "$fails" -gt 0 ]; then
  echo "e2e-lint: $fails rule(s) violated"
  exit 1
fi
echo "e2e-lint: clean"
