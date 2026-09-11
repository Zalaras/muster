#!/bin/sh
# e2e-lint.sh — mechanical checks over web/e2e that keep the suite's fixture and timing rules
# (docs/conventions.md §Testing) from eroding one spec at a time. Run from web/ by
# `npm run e2e` (so an agent running a single spec meets it too) and as `make e2e-lint` by
# the pipeline gates. Exit 0 iff clean; every hit is printed as file:line.
#
# Each check exists because its absence cost a real red run (docs/design/test-strategy.md):
#   1. Specs get daemons only from helpers/fixtures.ts — a hand-rolled startScratchDaemon is
#      how per-test daemons (and their load) crept back in unnoticed.
#   2. Specs import test/expect/types from ./helpers/fixtures, never "@playwright/test" —
#      the base `test` has no daemon fixtures, so importing it silently bypasses check 1.
#   3. No fixed sleeps in specs — waits are web-first expects that inherit the global timeout;
#      the one legitimate fixed hold ("it STAYED unchanged") is helpers/fixtures.ts settleFor.
#   4. No spec asserts the terminal pane's "session ended" overlay — a ~25 ms transient the
#      alive:false render pass replaces with the dead surface (terminal.spec.ts E12 flaked on
#      it for weeks); assert #dead-surface / .dead-surface .endcap and the socket tracker.
# Comment-only lines are skipped (a leading // or *), helpers/ is exempt by construction.
set -u
cd "$(dirname "$0")/.." || exit 2
fails=0

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

if [ "$fails" -gt 0 ]; then
  echo "e2e-lint: $fails rule(s) violated"
  exit 1
fi
echo "e2e-lint: clean"
