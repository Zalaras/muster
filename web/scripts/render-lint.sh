#!/bin/sh
# render-lint.sh — mechanical checks over web/render that keep the render tier daemon-free
# (web/render/CLAUDE.md; kb:adr/process-render-fixtures-generated-from-daemon). Run from
# web/ by `npm run render-test` and by the pipeline gates. Exit 0 iff clean; every hit is
# printed as file:line.
#
#   1. Only helpers/harness.ts imports "@playwright/test" — the base `test` has no `dashboard`
#      fixture, so importing it is how a spec would reach a real origin.
#   2. No spec reaches a daemon: no e2e helper import, no scratch daemon, no launch, no HTTP.
#   3. No fixed sleeps — waits are web-first expects; the stays-unchanged hold is settleFor().
#   4. No hand-written state in a spec: a `hello`/`snapshot` literal or a `sessions: [`
#      literal bypasses the generated fixtures, whose shape the daemon guarantees.
#   5. Biome lint and format over render/.
# Comment-only lines are skipped (a leading // or *).
set -u
cd "$(dirname "$0")/.." || exit 2
fails=0

report() { # $1 = rule, $2 = hits (file:line:text per line; empty = clean)
  [ -z "$2" ] && return 0
  echo "render-lint: $1"
  printf '%s\n' "$2" | sed 's/^/  /'
  fails=$((fails + 1))
}

# code_lines PATTERN FILE — matching lines, minus comment-only ones, prefixed with the file.
code_lines() { grep -nE "$1" "$2" | grep -vE '^[0-9]+:[[:space:]]*(//|\*)' | sed "s|^|$2:|"; }

all_files=$(find render -name '*.ts' -not -name '*.d.ts' | sort)
spec_files=$(find render -name '*.spec.ts' | sort)

hits=$(for f in $all_files; do
  [ "$f" = "render/helpers/harness.ts" ] && continue
  code_lines '"@playwright/test"' "$f"
done)
report "\"@playwright/test\" imported outside helpers/harness.ts — import test/expect/types from ./helpers/harness" "$hits"

hits=$(for f in $spec_files; do
  code_lines '(\.\./e2e/helpers|startScratchDaemon\(|launchSession\(|request\.post\(|fetch\()' "$f"
done)
report "a render spec reaches a daemon — no e2e helpers, no launch, no HTTP; the state comes from loadFixture()" "$hits"

# `(^|[^.[:alnum:]_])` keeps test.setTimeout(...) (a per-test budget, not a sleep) out of it.
hits=$(for f in $all_files; do
  code_lines '(waitForTimeout\(|(^|[^.[:alnum:]_])setTimeout\()' "$f"
done)
report "fixed sleep — use a web-first expect/expect.poll, or settleFor() for a stays-unchanged check" "$hits"

hits=$(for f in $spec_files; do
  code_lines '(type: "snapshot"|type: "hello"|sessions: \[)' "$f"
done)
report "hand-written daemon state in a spec — load a generated fixture with loadFixture()/dashboard.open() instead" "$hits"

hits=$(npx --no-install biome check render 2>&1) || report "biome lint/format over render/ — run \`npx biome check --write render\` from web/" "$hits"

if [ "$fails" -gt 0 ]; then
  echo "render-lint: $fails rule(s) violated"
  exit 1
fi
echo "render-lint: clean"
