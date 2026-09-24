# Web Tests: Maintainability Cleanup — Unit W7 (web controllers)

**Plan**: maintainability-cleanup
**Verdict**: pass
**Pack**: not run via `go run ./tools/kb pack` this unit (spawned directly by the team lead
with the task text inline, repairing W7's sanctioned test breakage — not a `/orchestrate`
role spawn). Read directly: `plans/maintainability-cleanup/web-implementation-W7.md` in full
(Changes, Decisions, Handoff), the two named test files, and every production file the
Handoff's renames/removals touch (`web/src/features/surfaces.ts`, `web/src/render/settings.ts`,
`web/src/features/update.ts`, `web/src/terminal/surfaceswitch.ts`, `web/src/dom.ts`,
`web/src/terminal/pane.ts`).

## Summary

Tests created: 8 new (4 in `dom.test.ts`, 4 in `surfaceswitch.test.ts`) | Deleted: 2 (the
Updates-section-wiring describe block in `render/settings.test.ts`) | Modified: 4 (2 call
sites in `surfaces.test.ts`, 2 `setChecked` tests in `settings.test.ts`) | Net test count:
1856 → 1862, all passing.

Fixed the two sanctioned-breakage files per the Handoff exactly (mechanical rename in
`surfaces.test.ts`; field/handler removal, `setChecked` arity drop, and the wiring
describe-block deletion in `render/settings.test.ts`). Added direct unit coverage for two of
the three new pure functions the team lead named as candidates (`surfaceBodyKind`,
`checkRadioValue`); declined the third (`terminalThemeColors`) as DOM-bound and already E2E
covered — see below.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `features/surfaces.test.ts` | (both existing, unchanged intent) | `initSurfaces(app, { getTilesLive })` — renamed dep field only, same stale-shell-spawn-guard assertions | pass |
| `render/settings.test.ts` | `checks exactly the theme radio matching the given theme and the rail-activity radio` | `setChecked(theme, railActivity)`, 2-arg signature post-Major-7, no `updateToggle` assertion | pass |
| `render/settings.test.ts` | `leaves every theme radio unchecked for a theme name none of them carry (edge case 6)` | same, 2-arg `setChecked` call | pass |
| `dom.test.ts` | `checks exactly the radio whose value matches, unchecking every other one` | `checkRadioValue` core behaviour | pass |
| `dom.test.ts` | `unchecks every radio when none match, and returns false` | no-match branch + return value, uncovered by either caller's own test | pass |
| `dom.test.ts` | `returns true when a radio matched` | matched return value | pass |
| `dom.test.ts` | `is a no-op on an empty radio list, returning false` | boundary: empty input | pass |
| `terminal/surfaceswitch.test.ts` | `docs selected always yields docs, regardless of alive (INV-1)` | `surfaceBodyKind("docs", *)` | pass |
| `terminal/surfaceswitch.test.ts` | `claude selected on a dead session yields dead` | `surfaceBodyKind("claude", false)` | pass |
| `terminal/surfaceswitch.test.ts` | `claude selected on a live session yields surface` | `surfaceBodyKind("claude", true)` | pass |
| `terminal/surfaceswitch.test.ts` | `shell selected yields surface regardless of alive (REQ-7)` | `surfaceBodyKind("shell", *)` | pass |

### Deletions (itemised)

- `render/settings.test.ts` describe block `"initSettingsDialog — Updates section wiring
  (plan auto-update, rail-card-improvements-2)"` (2 tests: `onToggleUpdateCheck receives the
  toggle's current checked state`, `wires checkBtn/applyBtn/restartBtn clicks to
  onCheckNow/onUpdate/onUpdateAndRestart`) — the wiring under test moved to
  `web/src/features/update.ts` (Major 7), which took over the toggle/apply/restart/check
  elements and handlers directly; `SettingsDialogHandlers` no longer declares
  `onToggleUpdateCheck`/`onUpdate`/`onUpdateAndRestart`/`onCheckNow`, so the fakes and
  assertions had no target left. `features/update.ts` has no direct unit test (same shape as
  `features/usage.ts`/`features/actions.ts`'s controller-level code, per the Handoff) but the
  exact behaviour these two tests checked is E2E-covered: toggle change → immediate check in
  `web/e2e/update.spec.ts:170` (`"unchecking the toggle clears the badge and available
  version; rechecking triggers an immediate check (E3, REQ-3, INV-1; plan
  rail-card-improvements-2 REQ-11)"`); apply-button click in `update.spec.ts:212` (`"clicking
  Update swaps the on-disk binary and reports Updated without restarting the running process
  (E4, User Flow 2)"`); restart-button click in `update.spec.ts:269`/`:331` (E5/E6); check-button
  click in `update.spec.ts:839` (`"pressing Check now with a newer release published shows
  that version in the Available readout and badges the Settings button (E9)"`) through
  `update.spec.ts:990` (E12/e-note-4).
- `updateToggle`/`applyBtn`/`restartBtn`/`checkBtn` removed from `fakeElements()`'s return
  type and body — `SettingsDialogElements` no longer declares them (Major 7).
- The `expect(els.updateToggle.checked).toBe(true)` assertion in the first `setChecked` test
  — `setChecked` no longer takes or writes an `updateCheck` argument.

## Declined Coverage

- **`terminalThemeColors()` (`web/src/terminal/pane.ts:37`)** — not given a direct unit test.
  It is module-private (unexported) and calls `getComputedStyle(document.documentElement)`,
  which needs a real browser DOM; this project's Vitest config has no `jsdom`/`happy-dom`
  dependency (confirmed: `grep -n jsdom web/package.json` → no hit), matching every other
  DOM-bound module in `terminal/`/`render/` that this project routes to Playwright instead
  (`docs/conventions.md` §Testing: Vitest = logic, Playwright = rendering). Its effect — the
  live terminal pane's background/foreground tracking the `--term`/`--term-fg` design tokens
  across a theme change — is exercised in `web/e2e/theme.spec.ts:150` (`"Focus: choosing
  Light re-themes the chrome and the live pane ground within one render, no reload (E7,
  INV-3 Focus)"`, asserting `resolvedCssVar(page, "--term", "background-color")` against the
  live pane) and `theme.spec.ts:186` (`"Tiles: choosing a theme re-themes both live tiles'
  grounds (E8, INV-3 Tiles multi-instance)"`, same assertion across two simultaneous tiles).
  Extracting it to a pure, DOM-free helper (to make it unit-testable) is an implementation
  change this role may not make; as built, this is not an implementation bug — it is
  DOM-tangled by necessity (reading a live computed style), and the two `alive`-independent
  callers (constructor, `applyTheme()`) collapsing onto one function is exactly what Minor 16
  asked for.

## Test Run Output

```
npx tsc --noEmit
(no output — 0 errors)

make web-lint
cd web && npm run -s lint
Checked 246 files in 191ms. No fixes applied.

make web-test
cd web && npm test
> muster-web@0.0.0 test
> vitest run

 RUN  v5.0.0 /Users/damian/Documents/code/Projects/muster-maintainability/web

 Test Files  71 passed (71)
      Tests  1862 passed (1862)
   Start at  09:52:46
   Duration  3.40s (transform 52%, tests 22%, import 21%, worker 5%)

make web-build
cd web && npm run -s build
✓ built in 1.73s
[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification. — pre-existing mermaid/cytoscape
    bundling warning, unrelated to this unit's changes (same chunks named in every prior
    build of this tree).
```
