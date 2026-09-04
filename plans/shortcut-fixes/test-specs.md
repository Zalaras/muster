# E2E Test Specs: shortcut-fixes

**Plan**: shortcut-fixes
**Mode**: validate (attempt 1)
**Verdict**: pass
**Tests created**: 14 new (`web/e2e/shortcuts.spec.ts`) + 6 existing spec files repointed onto the new chord

**Live run**: 262/262 passing (full suite, validate attempt 1). Own file: 14/14 passing.

## Tests

| File | Test Name | Requirement | What It Verifies |
|------|-----------|-------------|-------------------|
| web/e2e/shortcuts.spec.ts | pressing Opt+Cmd+N in Focus opens the launch dialog (E1) | E1 | ⌥⌘N opens `#launch-dialog` from Focus |
| web/e2e/shortcuts.spec.ts | pressing Opt+Cmd+N in Tiles opens the launch dialog (E2, INV-5) | E2, INV-5 | ⌥⌘N opens the dialog from Tiles too |
| web/e2e/shortcuts.spec.ts | pressing Opt+Cmd+N with the dialog already open leaves it open and keeps the Title field (E3, edge case 2) | E3 | Re-press while open is swallowed, no form reset |
| web/e2e/shortcuts.spec.ts | pressing Opt+Cmd+1 in Focus focuses the rail's first displayed card, in manual and attention modes (E4) | E4 | ⌥⌘1 selects `orderRail`'s first card in both rail modes |
| web/e2e/shortcuts.spec.ts | pressing Opt+Cmd+1 in Tiles promotes the rail's first displayed session into the grid (E5) | E5 | ⌥⌘1 promotes a stripped session pinned to rail position 1 |
| web/e2e/shortcuts.spec.ts | pressing Opt+Cmd+0 focuses the longest-blocked needs-input session, ignoring a pinned session ahead of it in manual mode (E6, INV-4) | E6, INV-4 | ⌥⌘0 bypasses the pinned block/rail order; contrasts against ⌥⌘1 landing on the pinned session |
| web/e2e/shortcuts.spec.ts | pressing Opt+Cmd+0 in Tiles promotes the neediest session into the grid (INV-5) | INV-5 | ⌥⌘0 round-trips in Tiles too (promotes, not just focuses) |
| web/e2e/shortcuts.spec.ts | pressing Opt+Cmd+0 in Tiles does not demote another tile when the neediest session is already live (edge case 6) | Edge case 6 | New dispatch path doesn't regress `promote`'s existing no-op-when-already-live behaviour |
| web/e2e/shortcuts.spec.ts | pressing Opt+Cmd+0 with sessions present but none alive stays on the explicitly focused session, never falling through to the most-recently-ended one (edge case 4) | REQ-7, edge case 4 | No fallback to `sortSessions`'s most-recently-ended pick when nothing is alive |
| web/e2e/shortcuts.spec.ts | pressing Opt+Cmd+0 with no sessions is a silent no-op (E7, edge case 3) | E7, REQ-7 | Empty store: no visible change, no console/page error |
| web/e2e/shortcuts.spec.ts | pressing Opt+Cmd+N with focus inside a session's terminal opens the dialog without leaking the keystroke to the terminal (E8, INV-3) | E8, INV-3 | Dialog opens; no WS frame sent to the terminal socket as a result of the keypress |
| web/e2e/shortcuts.spec.ts | pressing Opt+Cmd+1 with focus inside the launch dialog's Title field does not insert a digit into it (INV-3) | INV-3 | No leak into a focused text input (second INV-3 source state) |
| web/e2e/shortcuts.spec.ts | the Focus and Tiles empty placeholders name the new Opt+Cmd+N chord (E9) | E9, REQ-9 | `#main-empty` and `#tiles-empty` text |
| web/e2e/shortcuts.spec.ts | the launch dialog heading names ⌥⌘N via its kbd chip, excluded from the accessible name (E10) | E10, REQ-9 | `.kbd` chip text; heading accessible name stays "New session" |

Existing files repointed onto the new chord (mechanical — same behaviour, different key):

| File | Change |
|------|--------|
| web/e2e/launch.spec.ts:389,816 | `Meta+n` → `Alt+Meta+KeyN`; title at :797 renamed Cmd+N → Opt+Cmd+N |
| web/e2e/views.spec.ts:110 | `Meta+1` → `Alt+Meta+Digit1`; title/comments at :69,96,101,103,104 renamed Cmd+1 → Opt+Cmd+1 |
| web/e2e/rail-order.spec.ts:616,647,676,720 | `Meta+1` → `Alt+Meta+Digit1`; four test titles + three comments renamed Cmd+1 → Opt+Cmd+1 |
| web/e2e/focus-marker.spec.ts:126 | `Meta+2` → `Alt+Meta+Digit2`; title at :114 renamed Cmd+2 → Opt+Cmd+2 |
| web/e2e/permission-mode.spec.ts:75 | `Meta+n` → `Alt+Meta+KeyN` (no stale prose reference found) |

`focus-marker.spec.ts:126` and `permission-mode.spec.ts:75` were **not** in the plan's
Affected Files > E2E call-site list — a full-suite grep for `Meta\+[0-9n]` found them too.
Both would have tripped W13/W14 and both exercise chords this plan rebinds, so they're in
scope regardless of the plan's list being incomplete.

## Fixture Changes

No new fixture/payload shapes. `shortcuts.spec.ts` reuses `helpers/payloads.ts`'s existing
`envelopedSessionStart`/`rawUserPromptSubmit`/`rawNotification` (already capture-faithful,
used by every needs-input-driving test in the suite) via a local `makeNeedsInput` helper
copied verbatim from `rail-order.spec.ts`'s (each spec file keeps its own copy of this
fixture, matching that file's existing pattern rather than introducing a new shared
module for one function).

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| E1 | pressing Opt+Cmd+N in Focus opens the launch dialog |
| E2 | pressing Opt+Cmd+N in Tiles opens the launch dialog |
| E3 | pressing Opt+Cmd+N with the dialog already open... |
| E4 | pressing Opt+Cmd+1 in Focus focuses the rail's first displayed card... |
| E5 | pressing Opt+Cmd+1 in Tiles promotes the rail's first displayed session... |
| E6 | pressing Opt+Cmd+0 focuses the longest-blocked needs-input session... |
| E7 | pressing Opt+Cmd+0 with no sessions is a silent no-op |
| E8 | pressing Opt+Cmd+N with focus inside a session's terminal... |
| E9 | the Focus and Tiles empty placeholders name the new Opt+Cmd+N chord |
| E10 | the launch dialog heading names ⌥⌘N via its kbd chip |
| REQ-5 | E4 (both rail modes), rail-order.spec.ts's four repointed tests |
| REQ-6 | E6, E6's Tiles/INV-5 companion, edge-case-3/4/7's no-op tests |
| REQ-7 | edge case 3 (empty store) and edge case 4 (sessions present, none alive) tests |
| REQ-9 | E9, E10 |
| INV-3 | E8 (terminal focus, WS-frame oracle) + the launch-dialog Title-field test (second source state) |
| INV-4 | E6 (pinned-ahead session, manual mode) plus its ⌥⌘1 contrast assertion |
| INV-5 | E4/E5 (⌥⌘1 in both views) + the dedicated ⌥⌘0-in-Tiles test |
| Edge case 6 | dedicated "does not demote" test |
| W13/W14 (negative greps) | satisfied by removing every `Meta+n`/`Meta+<digit>` press across `web/e2e/` |

Not covered here by design, per the plan's own routing:
- **INV-1** (no browser-reserved chord) — Reviewer-Verified against `spikes/S5-key-probe.md`;
  "E2E structurally cannot check this" (Playwright injects events below browser chrome).
  No test in this file claims otherwise.
- **INV-2** (exact modifier match, the 15-signature loop) and **W16** (the `event.key`
  dead-key proof) — explicitly Vitest's job (`web-tests` owns them); Playwright cannot
  emulate macOS's ⌥ dead-key transform (`press("Alt+Meta+Digit1")` delivers `key: "1"`, not
  `"¡"`), so an E2E "proof" here would be no proof at all.
- **Edge case 8** (session shortcuts no-op under a non-launch modal) — Reviewer-Verified.
- **REQ-2** (bare ⌘N no longer intercepted) — deliberately not tested here. Asserting it
  would require `page.keyboard.press("Meta+n")` in this suite, which the plan's own
  Automated Checks dry-run note forbids outright ("no test has a legitimate reason to press
  a chord Muster no longer binds") — and W13's negative grep would fail on it. The Muster-
  side half of REQ-2 (`matchShortcut` returns `null` for ⌘N) is W4, Vitest's job.

## Notes

- No `web/playwright.config.ts` or harness changes needed; nothing routed to web-impl.
- `web/e2e/shortcuts.spec.ts`'s INV-3 terminal test tracks `framesent` events on the
  session's `/ws/terminal/` WebSocket (`page.on("websocket", ws => ws.on("framesent", ...))`)
  as a stronger oracle than "no character appears in the echoed output" — the stub only
  echoes complete lines, so a single non-Enter keystroke wouldn't show up in `region`'s text
  regardless of whether it leaked. The frame-count check is cleared immediately before the
  keypress under test, so only frames caused by that keypress count.
- Every test in this file presses only the plan's new ⌥⌘ chords; the six edited pre-existing
  spec files no longer contain `press("Meta+n")` or `press("Meta+<digit>")` anywhere.
- All are new-behaviour tests (the chord itself is what the plan changes), so none needed to
  run green at authoring per the regression-pin rule — collection cleanliness is the whole
  gate this pass.

## Validate Attempt 1

Rebuilt in the required order (`make web-build build`), then ran `web/e2e/shortcuts.spec.ts`
live, then swept the full suite (`make e2e`).

### Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | pressing Opt+Cmd+0 in Tiles does not demote another tile when the neediest session is already live (edge case 6) | `stateBadge(liveTile(page, targetTitle))` never matched — timed out waiting for visible "needs input" text | Live tiles carry state only via the `.sdot` dot's `title` attribute (`render/tiles.ts:67`); `stateBadge`/`BADGE_TEXT` visible-text rendering is rail/strip-card-only (`sessions/card.ts`). `stateBadge(liveTile(...))` combines a strip-card assertion helper with a live-tile locator — structurally impossible shape, as web-impl's report diagnosed and directed. | `tileStateDot(page, targetTitle)` (an existing helper already used the identical way in `views.spec.ts:795`) with `toHaveAttribute("title", /needs input/i)` | Edge case 6: still asserts the target session actually reached `needs_input` (the oracle proving the precondition), then still asserts every previously-live tile — including the target — stays visible and the strip stays empty after ⌥⌘0, i.e. that the new dispatch path doesn't regress `promote`'s existing no-op-when-already-live behaviour. This is a positive-value assertion (not an absence/negative-count assertion), so the deliberate-breakage proof-of-red rule doesn't apply; the repair only swaps which locator/attribute observes the same already-`needs_input` fact used identically by a passing test in the same file (E6) and in `views.spec.ts`. |

No assertion was deleted, skipped, or weakened.

### Full-suite sweep

`make e2e` (project root, after the same rebuild): **262/262 passing**, 0 failures, across
all 24 spec files including the six files repointed at authoring
(`launch.spec.ts`, `views.spec.ts`, `rail-order.spec.ts`, `focus-marker.spec.ts`,
`permission-mode.spec.ts`, and `shortcuts.spec.ts` itself). No pre-existing spec needed a
sanctioned-breakage update — the plan's protocol contract makes no wire-format change, so
nothing outside `web/e2e/shortcuts.spec.ts` needed touching.

### Test Run Output

```
$ npm run e2e -- e2e/shortcuts.spec.ts   (from web/)
Running 14 tests using 6 workers
  14 passed (5.6s)

$ make e2e   (project root, full suite)
Running 262 tests using 6 workers
  262 passed (1.1m)
```

### Notes

- Rebuilt with `make web-build build` (that order) before every run, per the harness note
  that a targeted `npm run e2e` does not rebuild for you.
- No implementation code, config, or global setup/teardown was touched. Only
  `web/e2e/shortcuts.spec.ts` changed (one import line, one locator/assertion swap).
- `plans/shortcut-fixes/orchestration-state.json` shows modified in `git status` but was
  not touched by this run — left as-is, not staged.
