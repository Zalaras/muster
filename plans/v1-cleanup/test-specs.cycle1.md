# E2E Test Specs: v1 Cleanup

**Plan**: v1-cleanup
**Mode**: authoring
**Verdict**: harness-only
**Tests created**: 0
**Live run**: not run (authoring)

## Summary

This plan's `E2E Scope` is `harness-only`: REQ-16, REQ-17 and REQ-18 are comment/variable
corrections and one cleanup-guard fix across five existing spec files, not a new spec. No
fixture, no daemon-global assertion, and no new test file. All edits are to comments or
variable names only — no assertion's meaning, strength, or scope changed, with one
exception (REQ-18) which strengthens a `finally` block's cleanup coverage without touching
any `expect`.

## Edits made

**REQ-16** — `web/e2e/subagent-status.spec.ts`, test "a failed turn's note is cleared once
the next turn starts, not carried into working (E7)":
- Renamed `lastActivityBefore` → `stateSinceBefore` (it holds `failed.stateSince`, not the
  session's separate `lastActivity` field — the old name invited exactly that confusion).
- Reworded the neighbouring comment from "stateSince moved (a real transition happened),
  lastActivity concern is the daemon-tests' to pin precisely" to "stateSince moved from
  stateSinceBefore (a real transition happened) — the separate lastActivity field is the
  daemon-tests' to pin precisely", naming both the field and the variable explicitly.

**REQ-17** — six comments across five files named the pre-`shortcut-fixes` bare-modifier
chords (`⌘N`, `⌘1`, `⌘1-9`); all now name the shipped `⌥⌘N` / `⌥⌘1–9` chords
(`web/src/shortcuts.ts:92-94` is the source of truth for the shipped labels, confirmed
live in `web/e2e/shortcuts.spec.ts:369,385`):
1. `web/e2e/shell.spec.ts:21` — quoted empty-state text `"No sessions yet — ⌘N to
   launch"` → `"No sessions yet — ⌥⌘N to launch"`.
2. `web/e2e/helpers/picker.ts:11` — "the `⌘N` kbd beside the heading text" → "the `⌥⌘N`
   kbd beside the heading text".
3. `web/e2e/views.spec.ts:98` — "⌘1 moves focus the same way a rail-card click does" →
   "⌥⌘1 moves focus the same way a rail-card click does".
4. `web/e2e/terminal.spec.ts:395` — "⌘1-9 (`focusNth`)" → "⌥⌘1–9 (`focusNth`)".
5. `web/e2e/rail-order.spec.ts:537` — "⌘1-9 (`focusNth`) now indexes into" → "⌥⌘1–9
   (`focusNth`) now indexes into".
6. `web/e2e/rail-order.spec.ts:539` — "Before this fix, ⌘1 could disagree with what card
   1 visually is" → "Before this fix, ⌥⌘1 could disagree with what card 1 visually is".

Per the plan's Reviewer-Verified note for E2 ("`rail-order.spec.ts:582-586` describes a
*past* decision, so `⌥⌘1–9` is the right replacement there rather than a rewording"),
items 5 and 6 are a plain symbol substitution — the surrounding "Decision ... Option A"
narrative is untouched. (Line numbers in the plan are stale relative to the current tree —
this block now sits at 536-541 — but the content match is unambiguous: it is the only
"Decision `plans/order-sidebar/decisions/cmd-n-ordering/decision.md`" comment in the
file.) The plan's other cited line numbers (`shell.spec.ts:28`, `views.spec.ts:112`,
`terminal.spec.ts:407`) have the same drift; each target was located by content (the
bare-chord grep below), not by the stale number.

Verified no bare-modifier chord comment remains: `grep -rn '⌘N\|⌘1-9\|⌘1[^0-9]'
web/e2e --include="*.ts" | grep -v '⌥⌘'` returns nothing.

**REQ-18** — `web/e2e/plain-shell.spec.ts`, test "switching to shell on a DEAD tile with
its directory removed shows the daemon's error in that tile's own dead-surface notice,
and a neighbouring tile is unaffected". Before this fix, `dirA` (the dead session's
scratch directory) was cleaned up manually mid-test (`await dirA.cleanup()`) with no
guard, and the `finally` block only ever cleaned up `dirB` — any assertion throwing
*before* that manual cleanup call (e.g. the `deadTileSurface` visibility check) leaked
`dirA`'s scratch directory. Applied the same `cleaned`-guard-plus-`finally` shape its
Focus-variant neighbour (`plain-shell.spec.ts:349-395`) already uses:
- Added `let dirACleaned = false;` before the `try`.
- Set `dirACleaned = true;` immediately after `await dirA.cleanup();`.
- Changed the `finally` from `await Promise.all([dirB.cleanup()]);` to
  `await Promise.all([dirACleaned ? Promise.resolve() : dirA.cleanup(), dirB.cleanup()]);`
  — both directories are now guaranteed cleaned up exactly once regardless of where an
  assertion throws.

No assertion (`expect`) was added, removed, or changed in any of these edits.

## Collection gate

```
$ npx playwright test --list
...
Total: 281 tests in 25 files
```

No errors, no duplicate titles. Same file/test count as before this plan's edits (no
spec added or removed) — the harness-only nature is preserved.

## Spec files this harness edit now covers

These five files' existing tests remain exactly as before except for the corrected
comments/variable name/cleanup guard above — no test's coverage changed:

- `web/e2e/subagent-status.spec.ts` (E7 test, REQ-16)
- `web/e2e/shell.spec.ts` (REQ-17)
- `web/e2e/helpers/picker.ts` (REQ-17, used by `launch.spec.ts` and `tiles-launch.spec.ts`)
- `web/e2e/views.spec.ts` (REQ-17)
- `web/e2e/rail-order.spec.ts` (REQ-17)
- `web/e2e/terminal.spec.ts` (REQ-17)
- `web/e2e/plain-shell.spec.ts` (REQ-18)

## Coverage

| Requirement | Files touched |
|-------------|----------------|
| REQ-16 | `web/e2e/subagent-status.spec.ts` |
| REQ-17 | `web/e2e/shell.spec.ts`, `web/e2e/helpers/picker.ts`, `web/e2e/views.spec.ts`, `web/e2e/rail-order.spec.ts`, `web/e2e/terminal.spec.ts` |
| REQ-18 | `web/e2e/plain-shell.spec.ts` |

## Notes

- No new fixture, no daemon-global assertion, no new spec file — matches the plan's
  Fixture plan header ("none").
- Did not touch `web/playwright.config.ts`, `web/e2e/helpers/fixtures.ts`, or
  `web/scripts/e2e-lint.sh`.
- This is authoring mode for a harness-only plan; per the e2e-specs brief, validate mode
  will run the full suite (`make e2e`) and report `pass`, not `harness-only` again.
