# E2E Test Specs: M2 — Terminal panes

**Plan**: m2-terminal
**Mode**: fix (review cycle 1, wave 3)
**Verdict**: pass
**Tests created (this fix wave)**: 2 new tests in `views.spec.ts`; 8 existing tests strengthened with new assertions (no new files)
**Live run (this fix wave)**: 59/59 passing (full suite, `make e2e`, x2 consecutive); `views.spec.ts` alone 11/11 x4 consecutive

## Tests

| File | Test Name | Requirement | What It Verifies |
|------|-----------|-------------|------------------|
| web/e2e/terminal.spec.ts | focusing a launched session streams the stub's readback and echoes typed input (E1, E2) | REQ-1, REQ-7 | Focus auto-attaches `/ws/terminal/{id}`; stub's `MUSTER-STUB-READY` renders; typed `hello`+Enter round-trips to `stub-echo:hello` |
| web/e2e/terminal.spec.ts | clicking a rail card swaps the live terminal to the newly focused session (REQ-7) | REQ-7, REQ-12/INV-2 | Old terminal region disappears from the DOM entirely on refocus; exactly one live region exists at a time |
| web/e2e/terminal.spec.ts | focusing the same session from a second browser context supersedes the first (E3, INV-1) | REQ-2, INV-1 | Second context's attach flips the first window's surface to the "another window" overlay; reclaimed surface still round-trips input |
| web/e2e/terminal.spec.ts | supersede reclaims cleanly even when the older client was mid-keystroke (INV-1) | REQ-2, INV-1 | Mid-typing source state for the one-live-client law; new owner's round trip still works after takeover |
| web/e2e/terminal.spec.ts | the tmux oracle's window geometry matches the terminal's own fitted size (E4) | REQ-3, REQ-15 | REQ-15 sizenote's `<cols>×<rows>` cross-checked against `#{window_width}`/`#{window_height}` via the tmux oracle |
| web/e2e/terminal.spec.ts | killing the stub's tmux session shows the ended placeholder on its live surface (E12) | REQ-6, REQ-13 | PTY EIO/EOF → 4001 → "session ended" overlay; corroborated by the liveness poll flipping `alive:false` |
| web/e2e/terminal.spec.ts | focusing a dead session shows the ended placeholder without ever attempting a socket (REQ-13) | REQ-13 | No `/ws/terminal/` socket opens for an already-dead session (tracked via `page.on('websocket')`) |
| web/e2e/terminal.spec.ts | shows the disconnected overlay while the daemon is down, and streams again after restart (E13) | REQ-13 | Daemon-down banner + "disconnected" terminal overlay; on `hello` after restart the overlay clears and the pane streams again |
| web/e2e/views.spec.ts | the masthead switcher persists the chosen view across a reload (E5) | REQ-9, REQ-10 | `PUT /api/prefs` view choice survives `page.reload()` |
| web/e2e/views.spec.ts | the chosen view survives a daemon restart (E6) | REQ-10 | Prefs persisted to kv survive `daemon.restart()` |
| web/e2e/views.spec.ts | Cmd+\ toggles the view and Cmd+1 focuses the top-priority session regardless of launch order (E7) | REQ-9 | ⌘\\ toggles Focus/Tiles; ⌘1 focuses the needs-input session even though it was launched second |
| web/e2e/views.spec.ts | switching density 2x2 to 3x2 promotes the next session by sort order into the grid (E8) | REQ-8, REQ-15 | 5 sessions: 2×2 leaves exactly 1 in the strip; 3×2 promotes it; tile footer shows a geometry pattern |
| web/e2e/views.spec.ts | clicking a strip card promotes it and demotes exactly the lowest-priority live tile (E9) | REQ-8 | Promotion swaps membership 1-for-1; grid size stays fixed at N |
| web/e2e/views.spec.ts | a density change leaves a still-stripped session's tmux geometry untouched (E10, INV-3) | REQ-11, INV-3 | 7 sessions: the one session still in the strip after 2×2→3×2 has an unchanged `#{window_width}` |
| web/e2e/views.spec.ts | open terminal-socket count equals the live-surface count in Focus, Tiles, and after a promotion (E11, INV-2) | REQ-12, INV-2 | Live socket count tracked via `page.on('websocket')` == 1 (Focus), 4 (2×2), 6 (3×2), 6 (after a promotion) |
| web/e2e/views.spec.ts | every accepted PUT /api/prefs re-broadcasts the full object to every other UI socket (INV-4) | INV-4 | A second, passive browser context's switcher flips purely from the `prefs` WS broadcast |
| web/e2e/views.spec.ts | GET /api/state's prefs snapshot carries both view and density (M2 protocol delta) | REQ-10 | Snapshot default `{"view":"focus","density":"2x2"}`; a density-only PUT leaves `view` untouched |
| web/e2e/sessions.spec.ts | two synthesized PreCompact hooks bump the rail card's compaction counter to circle-2 (E14, REQ-14) | REQ-14 | `/ctx unknown ⟳1/` after one PreCompact, `/ctx unknown ⟳2/` after a second |
| web/e2e/shell.spec.ts | GET /api/state returns exactly the M0 snapshot object once authenticated (existing test, assertion updated) | REQ-10 (protocol delta) | Updated the M0-era exact-equality assertion so `prefs` includes M2's `density: "2x2"` default, matching the already-merged `docs/protocol.md` |

## Fixture Changes

- `web/e2e/helpers/daemon.ts` (REQ-5, plan's "Affected Files > E2E" row):
  - `tmuxSocket` is now a filesystem **path** (`join(dataDir, "tmux.sock")`) instead of a
    bare name, so the harness itself exercises the `-S`/path form REQ-5 adds to the daemon,
    and the socket file is cleaned up automatically inside `teardown()`'s existing `rm`.
    All of the class's own `tmux` invocations (`teardown`, `killTmuxWindow`,
    `tmuxPaneExists`) switched from `-L <name>` to `-S <path>` to match.
  - The stub `claude` binary is upgraded from a plain `#!/bin/sh` sleep loop to an echo
    loop per the plan's explicit spec: prints `MUSTER-STUB-READY` once, then
    `stub-echo:<line>` per line read from stdin, then falls into the old sleep-forever
    loop once stdin hits EOF (pane torn down). M1's liveness tests still control death
    explicitly via `killTmuxWindow`, so this is additive, not a behaviour change for them.
  - New method `ScratchDaemon.tmuxDisplay(target, format)` — thin wrapper over
    `tmux -S <socket> display-message -p -t <target> <format>`, the geometry oracle E4/E10
    need. Test-oracle only, per the hard rule that capture/attach never becomes a state
    source.
- `web/e2e/helpers/terminal.ts` (new): `terminalRegion`, `terminalOverlay`, `liveTile`,
  `stripCard`, `TerminalSocketTracker`, `parseSizenote`. Shapes/locators are all DOM-level
  (no wire payloads to synthesize here — REQ-1..REQ-13 are exercised through the real
  bridge against the real stub, not synthesized hook/status-line payloads). No new
  Claude-Code-format fixtures were needed for this plan: REQ-14's compaction test reuses
  `rawPreCompact`, already present in `payloads.ts` since a prior plan (its own doc-comment
  attributes it to "REQ-21", the M1-era requirement number that became this plan's queued
  follow-up).

No hook/status-line wire shapes were invented. Every new fixture in this plan's test files
is either (a) a locator against DOM the plan's Testable UI Elements table specifies, or (b)
a tmux CLI oracle call, never a synthesized Claude-Code payload.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 (bridge) | terminal.spec.ts: E1/E2 round trip |
| REQ-2/INV-1 (one-live-client) | terminal.spec.ts: E3 second-context supersede, mid-typing supersede |
| REQ-3 (resize) | terminal.spec.ts: E4 geometry oracle |
| REQ-4 (tmux topology/options) | not e2e's job (D8 Go integration test) — no e2e coverage needed |
| REQ-5 (socket path) | exercised structurally by every test via the upgraded harness (`-tmux-socket <dataDir>/tmux.sock`); D9 itself is a Go test |
| REQ-6 (PTY env/EOF) | terminal.spec.ts: E12 (EOF -> 4001 -> ended placeholder + liveness nudge) |
| REQ-7 (Focus live pane) | terminal.spec.ts: E1/E2, rail-card refocus swap |
| REQ-8 (Tiles view) | views.spec.ts: E8 density growth, E9 promotion |
| REQ-9 (view switcher) | views.spec.ts: E5 reload persistence, E7 keyboard (⌘\\, ⌘1) |
| REQ-10 (prefs) | views.spec.ts: E5, E6, prefs-snapshot test |
| REQ-11/INV-3 (geometry single writer) | views.spec.ts: E10 (both halves since Fix Attempt 1: stripped session's `#{window_width}` unchanged AND a continuing-live tile's geometry moved + matches its footer via the tmux oracle); E8/E9 (oracle cross-check after density change / promotion) |
| REQ-12/INV-2 (snapshots never attach) | terminal.spec.ts: rail-card refocus swap; views.spec.ts: E11 |
| REQ-13 (degraded states) | terminal.spec.ts: E12 (dead/ended), dead-on-focus (no attach), E13 (daemon down + reattach); terminal.spec.ts E3 (superseded overlay) |
| REQ-14 (⟳n compaction) | sessions.spec.ts: E14 |
| REQ-15 (sizenote/footer, Should Have) | terminal.spec.ts: E4 (sizenote parse); views.spec.ts: E8/E9/E10 (tile footer geometry cross-checked against the tmux oracle via `expectTileGeometryMatchesTmux` — upgraded from a pattern match in Fix Attempt 1, review cycle-1 Critical 6) |
| REQ-16 (scrollback, Nice to Have, explicitly out of scope) | no test — that is the point; enforced by the plan's D5 negative grep, not e2e |
| INV-4 (prefs echo) | views.spec.ts: dedicated INV-4 test |

## Repairs (validate / fix modes only)

Not applicable — authoring mode. No live run was performed.

## Test Run Output

Not run (authoring mode). Collection gate output:

```
$ npx playwright test --list
...
Total: 57 tests in 8 files
```

Exit code 0, no collection errors, no duplicate titles.

`npx tsc --noEmit -p .` also passes clean after fixing two `exactOptionalPropertyTypes`
violations in `views.spec.ts` (an indexed `titles[i]` access is `string | undefined` under
`noUncheckedIndexedAccess`; fixed with `?? ""` at the two `launchSession(...)` call sites).

## Notes

- **Isolation hazard specific to this plan, designed around explicitly**: Tiles/density
  grid membership and prefs are computed over *every* session on a daemon, and prefs are
  global per daemon — not scoped per browser tab. Under `fullyParallel: true`, sharing one
  daemon across `views.spec.ts`'s tests (the pattern `sessions.spec.ts` and other M0/M1
  files use) would let one test's launched sessions or `PUT /api/prefs` leak into another
  concurrently-running test's exact-count or exact-view assertions. `views.spec.ts`
  therefore gives every single test its own private `ScratchDaemon` via a small
  `withDaemon()` helper, rather than a shared `beforeAll`. This costs more daemon spin-ups
  per file but is the only way to keep density/promotion/socket-count assertions
  deterministic without weakening them to "at least N" style checks.
- **Locator choices left to e2e-specs' call, per the Testable UI Elements table**:
  - Live tile: `page.getByRole("article").filter({ hasText: title })` — the plan's own
    phrase "article-shaped" is read literally: a bare `<article>` element (unlike
    `<div>`/`<span>`) does carry an implicit ARIA role of `article`, so this is expected to
    resolve against genuinely semantic markup rather than guessing a testid. If web-impl
    ships tiles as `<div>`s instead, validate mode will need to repair this locator (not
    add a role to the product).
  - Strip card: reused `getByTestId("session-card")` (same as M1's rail cards), because
    the plan's own UI spec text says a strip card is "the M1 card content on its side" —
    i.e. explicitly the same component, not a new one. If Tiles' strip in fact renders a
    distinct container/testid, this is the first thing validate mode should check.
  - Terminal overlay: matched by the exact text pattern the Testable UI Elements table
    pins (`/disconnected|another window|session ended/`), scoped inside the terminal
    region locator (`aria-label="Terminal: <title>"`) so it can't accidentally match the
    unrelated daemon-down banner.
- **xterm rendering assumption**: `@xterm/xterm@6.0.0` is used with no canvas/WebGL addon
  in `web/package.json` (only `@xterm/addon-fit`), so its default renderer is DOM-based —
  rendered terminal rows are real text nodes and standard Playwright text matchers
  (`toContainText`, `getByText`) work against them without reaching into xterm internals.
  If web-impl adds a canvas/WebGL renderer addon, every text assertion inside a terminal
  region in `terminal.spec.ts` would need to move to a different oracle (most likely the
  tmux `capture-pane` oracle) — flagging this now so validate mode isn't surprised.
- **`GET /api/sessions/{id}/pane` (§3.4) is explicitly deferred to M4** — no test targets
  it; the "ended placeholder" tests assert the DOM overlay only, never a pane snapshot.
- **REQ-4 (tmux topology/options) has no direct E2E test.** It is entirely a Go-level
  acceptance criterion (D8: `show-options` reports `window-size manual`) with no
  user-visible surface beyond what E1/E4 already exercise indirectically (a working,
  correctly-sized bridge implies the options are in effect). Adding a dedicated E2E tmux
  `show-options` oracle test would just re-implement D8 through Playwright for no
  additional coverage, so it was left to daemon-tests.
- **Two-context tests never share a `browser` between tests** — each opens its own
  `browser.newContext()` and closes it in a `finally`, so no cross-test cookie/session
  bleed even though contexts are cheap to create relative to daemons.
- **`shell.spec.ts` assertion updated, not newly authored**: this predates m2-terminal
  (plan m0-skeleton) but its exact-equality check on `GET /api/state`'s `prefs` object
  would go stale the moment prefs gains `density` — which `docs/protocol.md` already
  reflects as merged (git status shows it modified ahead of this plan's daemon/web work).
  Updating it here keeps the suite internally consistent with the approved protocol
  contract rather than leaving a known-stale assertion for validate mode to trip over.
  This is a one-line value fix (add the new field to the same object), not a scope or
  strength change to the assertion.
- Per the harness rules, nothing here launches a real `claude` binary; every terminal
  round trip goes through the upgraded stub via a real tmux session on the per-run scratch
  socket.

## Validate Attempt 1

Build/test prerequisites checked first: `go build ./...` and `go test ./...` both exit 0
(daemon-impl's Fix Attempt 1 + daemon-tests' updates to `tmux_test.go` /
`sessions_test.go` / `state_test.go` are all in place). `npm run build` (web) also exits 0
— web-tests already fixed the `ws.test.ts`/`protocol.test.ts` `density`-field fixtures
web-impl flagged in its Handoff. `make build` + `cd web && npm run build` were run to
produce the `bin/musterd` and `web/dist` the harness spawns.

`npx playwright test --list` (before any spec changes): clean, 57 tests in 8 files,
matching authoring mode's count exactly (no implementation-side surprises in route/element
naming that would show up as a *collection*-time problem — those only surface at runtime).

Live run of the four target files uncovered 7 failures on the first pass. Each was
diagnosed against the actual DOM/behavior (never against what I expected on paper) before
deciding repair-vs-escalate. All 7 turned out to be spec defects — locators or test
architecture that couldn't see real, plan-conforming behavior, not implementation bugs.
Re-ran the full four-file set 4 consecutive times (33/33 each) and the whole 57-test suite
once (57/57) after all repairs landed, to rule out residual flakiness before calling this
`pass`.

### Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|------------------------|-----|-------------------------|
| 1 | `shell.spec.ts`: "renders the masthead, connection status and empty sessions state..." | `getByText("No sessions yet")` strict-mode violation: 3 elements | M2 added `#main-empty`/`#tiles-empty`, both containing "No sessions yet — ⌘N to launch" as a substring of the M0-era exact rail text this test actually targets (`#sessions`'s bare "No sessions yet") | `getByText("No sessions yet", { exact: true })` | REQ-6/7/8 (M0 shell): still requires the rail's exact empty-state text to be visible, unchanged in strength |
| 2 | `views.spec.ts`: E8/E9/E10/E11 (density/promotion counts) | `liveTile()` counts included stripped sessions too (5 "live" out of 5 launched, or 0 stripped where 3 expected) | `helpers/terminal.ts`'s `liveTile` used `page.getByRole("article")`, which matches BOTH the tile template (`<article class="tile">`) and the strip/rail card template (`<article class="card" data-testid="session-card">`) — both role="article" | Scoped to `page.locator("article.tile")` | REQ-8/E8/E9, REQ-11/INV-3/E10, REQ-12/INV-2/E11: exact live-vs-stripped counts, unweakened |
| 3 | `views.spec.ts`: E8/E9/E11 (`stripCard` assertions) | `getByTestId('session-card').filter(...)` strict-mode violation: 2 elements | The Focus-view rail (`aria-label="Sessions"`) is only ever `hidden`, never removed, when Tiles is active (`main.ts`: `viewFocusEl.hidden = view !== "focus"`) — so a session's rail card and its Tiles-strip card (same template, same testid, same title) coexist in the DOM at once | Scoped `stripCard` to `page.locator("#tiles-strip").getByTestId(...)` | Same requirements as #2: still requires exactly one strip card with that title, now unambiguously the strip's own copy |
| 4 | `terminal.spec.ts`: "supersede reclaims cleanly even when the older client was mid-keystroke (INV-1)" | `toContainText("stub-echo:world")` never matched; actual text was `stub-echo:still-typworld` | My expected value was wrong, not the bridge: REQ-1 says the daemon transforms nothing, and a real tty's canonical-mode line buffer is a kernel property of the underlying pty, not of whichever WebSocket currently owns the read side — window A's unsubmitted "still-typ" legitimately stays queued across the supersede and concatenates with window B's later "world" before Enter flushes the line. This is correct raw-byte-passthrough behavior, not a bug | Send `Control+U` (POSIX VKILL) in window B before typing, so the round-trip assertion is deterministic and no longer an accident of what window A happened to type | INV-1/REQ-2: "the new owner's own round trip still works" after a mid-keystroke takeover — assertion is if anything stricter now (also proves control bytes pass through post-takeover) |
| 5 | `terminal.spec.ts`: E4 (geometry oracle) | `expect.poll(...).toBe(rows)` timed out; sizenote parsed once showed one more row than tmux ever converged to (e.g. 28 vs 27) | `renderFocusView` (`main.ts:175`) calls `surface.refit()` on every render pass, including the very first one that happens *before* `renderSizenote` first un-hides `#sizenote` — so the first `fit()` measures the terminal slot at a taller, pre-sizenote-line height. The next render tick's `refit()` (main.ts's "1s tick keeps geometry current") corrects both the resize frame sent to tmux and the sizenote text to the true settled value. Reading the sizenote exactly once, right after it appears, can catch that transient value | Re-parse the sizenote's text inside `expect.poll`'s predicate (once for cols, once for rows) instead of parsing it once outside the poll, so both sides settle together | E4/REQ-15: still requires the tmux oracle and the pane's own reported geometry to be exactly equal — only *when* they're compared changed, not whether |
| 6 | `terminal.spec.ts`: multiple tests, `MUSTER-STUB-READY` intermittently not found under full-suite parallelism | Root cause below (#7) was the real cause; a defensive `{ timeout: 15_000 }` (matching this file's own existing pattern for overlay assertions) was added to every `MUSTER-STUB-READY` check as well, since attaching a real tmux/PTY bridge under `fullyParallel` load is measurably slower than the default 5s in the worst case | Missing generous timeout for a real (non-mocked) tmux/PTY round trip under concurrent load | Added `{ timeout: 15_000 }` | No requirement weakened — still requires the exact readback string, just with patience matching this file's own established pattern for the same kind of real-bridge wait |
| 7 | `terminal.spec.ts`: E3, E4, REQ-13-dead-session (only reproduced with the whole file run sequentially/co-scheduled) | Session-specific terminal region never appeared for a later test in the file; traced to Focus's default "auto-focus top of the §3.4 sort order" landing on an *earlier* test's still-registered session, not the one just launched | Test-isolation bug in my own spec, not the product: the file used one `beforeAll`/`afterAll`-shared `ScratchDaemon` for every non-`describe.serial` test, but (unlike `sessions.spec.ts`, whose assertions are always scoped by title/card) most tests here rely on being "the only session in the run" for Focus's auto-focus behavior to land where expected — true only by accident of Playwright's worker scheduling, not by test design. `views.spec.ts` had already solved the identical problem for itself (its own Notes section flags exactly this hazard) with a per-test daemon; `terminal.spec.ts` predates that pattern | Switched `test.beforeAll`/`afterAll` to `test.beforeEach`/`afterEach`, giving every top-level test its own private `ScratchDaemon` (the nested `describe.serial` E13 block already had its own private daemon and needed no change) | E1-E4, E12, REQ-7, REQ-13: same assertions, now actually guaranteed to run against a daemon that really does have only the one session the test just launched, instead of depending on execution order |

`No assertion was deleted, skipped, or weakened.`

### Test Run Output

```
$ npx playwright test --list
Total: 57 tests in 8 files   (both before and after all repairs — no collection regressions)

$ npm run e2e -- e2e/terminal.spec.ts e2e/views.spec.ts e2e/sessions.spec.ts e2e/shell.spec.ts
  (post-repair, run 1)          33 passed (11.5s)
  (post-repair, run 2)          33 passed (11.9s)
  (post-repair, run 3)          33 passed (12.0s)

$ npx playwright test e2e/terminal.spec.ts --workers=1
  8 passed (11.5s)   — whole file sequential, confirms repair #7's isolation fix

$ npm run e2e   (full 57-test suite)
  57 passed (15.3s)
```

### Notes on Validate Attempt 1

- The two `tsc`-visible fixture fixes web-impl/daemon-impl flagged in their Handoff
  sections (`ws.test.ts` density field, `state_test.go`'s `TestBuildSnapshot_M0Shape`
  literal) were both already applied by web-tests/daemon-tests before this run — verified
  by `go build ./...` / `go test ./...` / `npm run build` all exiting 0 with no changes
  needed from me.
- No test file outside the four named target files was touched.
- No implementation code (`web/src/`, `internal/`, `cmd/`) was touched.

## Fix Attempt 1 (review cycle 1, wave 3)

**Issues addressed**: review.md Critical 6, Minor 7 (both `[e2e-specs]`), plus new
user-visible behaviour from this cycle's `daemon-implementation.md` Fix Attempt 2 and
`web-implementation.md` Fix Attempt 1 (no review issue named these directly — added per
the fix-cycle rule that e2e-specs asserts a wave's new DOM/protocol-visible behaviour).

Re-read `plan.md`'s Named Invariants/Testable UI Elements, `web/src/render/tiles.ts` (the
real `.geo`/`.marker` footer markup and `renderTileGeometry`'s alive-driven marker text),
`web/e2e/helpers/daemon.ts` (existing `tmuxDisplay` oracle), and both implementation
logs' latest Fix Attempt sections before editing, since line numbers in review.md predate
this cycle's fixes.

### Critical 6 — INV-3's "geometry moves" half was never asserted

**Root cause in my spec**: E10's `#{window_width}`-unchanged check only ever looked at
sessions that stayed *stripped* across a density change; E8's REQ-15 check
(`getByText(/\d+×\d+/)`) is a pattern match a stale or fabricated footer value satisfies
equally well. Neither test could tell a tile that genuinely refit from one that never
did — exactly the gap that let Critical 1 (Tiles never refits) ship green.

**Fix**: added `expectTileGeometryMatchesTmux(page, daemon, title, tmuxTarget)` to
`web/e2e/helpers/terminal.ts` — polls the live tile's `.geo` footer text against a fresh
`daemon.tmuxDisplay(target, "#{window_width}"/"#{window_height}")` reading until they
agree, so a stale/fabricated footer value that never converges times out instead of
passing. Applied it at all three source states the review named:
- **View switch** (E8, Focus→Tiles): cross-checks `titles[0]`'s footer against tmux right
  after the first Tiles click.
- **Density change** (E8, 2×2→3×2 *and* a new check in E10): E8 cross-checks the
  session promoted by the density change; E10 additionally captures a *continuing-live*
  session's `#{window_width}` baseline before the switch, cross-checks its footer against
  a fresh tmux reading after, and asserts the fresh reading **differs** from the
  baseline — proving the tile actually moved (2×2 has 2 grid columns, 3×2 has 3, so a
  continuing tile's fitted width must change), not merely that footer and tmux still
  agree on an untouched value.
- **Promotion** (E9, strip-card click): cross-checks the newly promoted session's footer
  against tmux right after the click.

`web/e2e/helpers/daemon.ts` and `web/e2e/helpers/terminal.ts` needed no other change —
`tmuxDisplay` already existed as the E4 oracle; this just reuses it against Tiles.

### Minor 7 — INV-2 asserted only from the browser

**Fix**: added `ScratchDaemon.totalAttachedClients()` to `web/e2e/helpers/daemon.ts` — a
thin oracle summing `#{session_attached}` across every tmux session on the run's socket
via `tmux -S <socket> list-sessions -F "#{session_attached}"` (returns 0 if the tmux
server hasn't started yet, rather than throwing). Added a `daemon.totalAttachedClients()`
poll alongside every existing `tracker.liveCount` assertion in E11 (Focus:1, 2×2:4,
3×2:6, after-promotion:6) — a daemon-side corroboration of the exact same counts the
browser-side tracker already asserted, per the review's "costs one helper call" framing.

### New coverage for this cycle's fix-wave behaviour (not tagged in review.md)

Per the fix-cycle rule, read `daemon-implementation.md` Fix Attempt 2 and
`web-implementation.md` Fix Attempt 1 and added assertions for behaviour they newly
shipped that no existing test exercised:

- **`web/e2e/views.spec.ts`: "a live tile stays typable across the 1s render tick"** —
  web-impl's Critical 2 fix (tile chrome updates in place; `reconcileTilesGrid` no longer
  rebuilds/re-parents a mounted surface every 1s tick). Clicks into a Tiles live surface,
  waits past two full render ticks (2.2s — deliberately real wall-clock time, since the
  bug is specifically about surviving elapsed ticks, not a network round trip a
  `page.waitForResponse`-style wait would substitute for), then types and asserts the
  stub echo arrives. This is the exact repro shape the reviewer used by hand
  ("clicked into repo3's tile, waited 1.6s, pressed l then Enter — nothing reached the
  pane") turned into an automated regression test.
- **`web/e2e/views.spec.ts`: "killing one of several live tiles ends only that tile
  without misrouting keystrokes into another"** — daemon-impl's Critical 3 fix
  (`detach-on-destroy on`) plus web-impl's Critical 5 fix (tile marker driven by `alive`,
  not geometry nullability). Launches two sessions into Tiles, kills one's tmux session
  via the existing `killTmuxWindow` oracle helper, and asserts: the killed tile's overlay
  reads "session ended"; its footer marker reads `stopped` (not the old geometry-derived
  `live`); the *other* session still has exactly one attach client per
  `#{session_attached}` (never two, ruling out Critical 3's client-hop); and typing into
  the other tile still reaches only that tile (`stub-echo:TYPED-INTO-B`, not misrouted).
  This is the multi-session kill scenario the review's own Critical 7/(daemon-tests)
  finding names as structurally missing from the Go suite — added here at the E2E layer
  since the observable failure mode (keystrokes reaching the wrong Claude Code pane) is
  fundamentally a cross-process, browser-visible behaviour.

Both new tests reuse only existing/newly-added helpers (`terminalRegion`,
`terminalOverlay`, `liveTile`, `daemon.killTmuxWindow`, `daemon.tmuxDisplay`) — no new
wire-format fixtures were invented; both drive the real bridge/tmux exactly as every
other test in this file already does.

### Repairs

None — every change in this wave is new coverage (new tests, or new assertions appended
to existing tests), not a repair of a locator/wait/fixture that failed against real
markup. Nothing needed correcting: `expectTileGeometryMatchesTmux` and
`totalAttachedClients()` both passed on the first live run.

`No assertion was deleted, skipped, or weakened.`

### Test Run Output

```
$ npx playwright test --list
Total: 59 tests in 8 files   (57 + 2 new — no collection regressions)

$ npx tsc --noEmit -p .
(no output — exit 0)

$ go build ./...
(exit 0)

$ go test ./... -count=1
ok  	github.com/Zalaras/muster/internal/claudecode
ok  	github.com/Zalaras/muster/internal/gitutil
ok  	github.com/Zalaras/muster/internal/server
ok  	github.com/Zalaras/muster/internal/session
ok  	github.com/Zalaras/muster/internal/store
ok  	github.com/Zalaras/muster/internal/termbridge
ok  	github.com/Zalaras/muster/internal/tmux
(all packages green — daemon-tests' one-line detach-on-destroy fix and the tmux_test.go
NewSession updates are already in place from an earlier wave)

$ npm run build   (web)
✓ 23 modules transformed, exit 0

$ npm run e2e -- e2e/views.spec.ts
  (run 1) 11 passed (9.0s)
  (run 2) 11 passed (8.4s)
  (run 3) 11 passed (8.6s)
  (run 4) 11 passed (8.4s)

$ make e2e   (full suite, x2 consecutive)
  (run 1) 59 passed (18.4s)
  (run 2) 59 passed (18.9s)

$ npx playwright test --list   (re-verified after all edits)
Total: 59 tests in 8 files
```

### Notes on Fix Attempt 1

- Only `web/e2e/helpers/daemon.ts`, `web/e2e/helpers/terminal.ts`, and
  `web/e2e/views.spec.ts` were touched (`git status --porcelain` confirmed after this
  wave) — no implementation code under `web/src/`, `internal/`, or `cmd/` was modified.
- `web/playwright.config.ts` and global setup were not touched.
- The "killing one of several live tiles" test deliberately launches only 2 sessions
  (not the 5-7 used elsewhere in this file) — 2×2 density accommodates both as live
  tiles, which is the minimum needed to reproduce Critical 3's cross-session
  misrouting (the bug requires ≥2 sessions on the same tmux socket, per the review's own
  framing); a larger fleet would add nothing but runtime.
- `page.waitForTimeout(2_200)` in the Critical 2 regression test is a deliberate
  wall-clock wait, not a masked async dependency: the behaviour under test (does the
  grid rebuild blur a mounted surface's focus after real elapsed time via
  `setInterval(render, 1000)`) has no observable DOM signal to poll for short of the
  bug itself, so a fixed wait past two ticks is the correct tool, mirroring the
  reviewer's own manual repro method.
