# E2E Test Specs: order-sidebar

**Plan**: order-sidebar
**Mode**: fix (review cycle 2, wave 3)
**Verdict**: pass
**Tests created**: 22 (18 original + 4 new in this cycle)
**Live run**: 22/22 passing (rail-order.spec.ts); 17/17 passing (views.spec.ts); 140/140 passing (full suite, `make e2e`)

## Tests

| File | Test Name | Requirement | What It Verifies |
|------|-----------|-------------|------------------|
| web/e2e/rail-order.spec.ts | three launched sessions appear in the rail in creation order with Manual selected (E2) | REQ-1, REQ-5, REQ-6 | Fresh sessions render in ascending id/opened order; `#rail-sort` defaults to `manual` |
| web/e2e/rail-order.spec.ts | dragging the third card onto the first reorders the rail (E3) | REQ-10, REQ-11, REQ-4 | `dragTo` on the whole card reorders via `PUT /api/sessions/order`; DOM order cross-checked against a `GET /api/state`-derived oracle; drag-feedback classes clear |
| web/e2e/rail-order.spec.ts | a dragged order persists after a reload (E4) | REQ-1, REQ-4 | The manual order survives a full page reload (daemon-owned, not client-only) |
| web/e2e/rail-order.spec.ts | clicking Pin moves a card to the top of the pinned block (E5) | REQ-3, REQ-8, REQ-9 | `PUT /api/sessions/{id}/pin` via the UI button; card gets `pinned`+`pinned-last`, button flips to Unpin/aria-pressed=true/title |
| web/e2e/rail-order.spec.ts | pinning a second card places it below the first pinned card (E6) | REQ-3, REQ-9 | Pin order (pinned in click order); `pinned-last` moves to the newest pinned card |
| web/e2e/rail-order.spec.ts | unpinning the first pinned card places it after the remaining pinned card (E7) | REQ-3, REQ-9 | Unpin moves the session to the top of the unpinned block; `pinned-last` moves to the sole remaining pinned card |
| web/e2e/rail-order.spec.ts | dragging an unpinned card onto a pinned card pins it at that position (E8) | REQ-10, REQ-11 | `moveCard`'s "insert with target's pinned value" semantics exercised through a real drag; cross-checked against the API oracle |
| web/e2e/rail-order.spec.ts | a state change in manual mode leaves the rail order unchanged (E9, REQ-7) | REQ-7 | A synthesized Notification driving a card to `needs_input` updates only chrome, not DOM order |
| web/e2e/rail-order.spec.ts | switching to Attention resorts unpinned cards by need while the pinned block stays on top (E10, E11) | REQ-6, REQ-7, REQ-10, REQ-12 | Real keyboard typeahead (not `selectOption`) drives `#rail-sort`; needs-input unpinned card moves above idle unpinned card while the pinned block stays first; cards become non-draggable; switching back restores the exact manual order and draggability |
| web/e2e/rail-order.spec.ts | rail cards are draggable only in Manual mode | REQ-10 | `draggable` attribute toggles true/false with the sort mode |
| web/e2e/rail-order.spec.ts | the Attention selection persists after a reload (E12) | REQ-5, REQ-12 | `prefs.railSort` survives a reload |
| web/e2e/rail-order.spec.ts | a second window sees a pin and a reorder without reloading (E13) | REQ-3, REQ-4 | A second browser context observes both a pin and a drag-reorder via the `sessionUpsert` broadcast, no reload |
| web/e2e/rail-order.spec.ts | the Tiles strip order matches the rail order minus live tiles (E14) | REQ-13 | Strip order is exactly the rail's manual order filtered to the stripped subset (relative order preserved, not just membership) |
| web/e2e/rail-order.spec.ts | clicking Pin does not change the focused session (E15) | REQ-8, REQ-16 | Pinning a non-focused card via the UI leaves `#mainhead .name` (the focused session) unchanged |
| web/e2e/rail-order.spec.ts | a Pin click while the daemon is down leaves the card unpinned and the order unchanged (E16) | REQ-15 | No optimistic UI state: a failed `PUT` while the daemon is down changes nothing on screen |
| web/e2e/rail-order.spec.ts | pinning from the Tiles strip pins the session the same as the rail (REQ-13) | REQ-13, REQ-8 | Pin button works identically from the strip; the rail and `GET /api/state` agree afterward |
| web/e2e/rail-order.spec.ts | the pin button is hidden until hover/focus reveals it, but always visible once pinned (REQ-8) | REQ-8 | `opacity` computed style (not `toBeVisible()`) at rest / on hover / on focus / once pinned |
| web/e2e/rail-order.spec.ts | the rail sort select keeps focus and node identity across a render tick | REQ-12 | Guards against the usage-model-bar-class defect: a control re-rendered on `main.ts`'s 1s tick could silently lose focus/identity even though functional (`selectOption`-driven) tests still pass |
| web/e2e/rail-order.spec.ts | Cmd+1 follows the manual rail order even when the needs-input session is not first | REQ-6 (cmd-n-ordering decision, Option A) | Reviewer's measured repro (Major 1, review cycle 1): rail `one, two, three`, `three` in `needs_input` — Cmd+1 must focus `one` (the rail's actual first card), not `three` |
| web/e2e/rail-order.spec.ts | Cmd+1 follows the rail order after a drag reorder | REQ-6 (cmd-n-ordering decision, Option A) | After dragging `c` to the front, Cmd+1 focuses `c`, proving `focusNth` reads the rail's live order rather than a snapshot taken at launch |
| web/e2e/rail-order.spec.ts | Cmd+1 follows the rail order after a pin | REQ-6 (cmd-n-ordering decision, Option A) | After pinning `c` (launched last) to the top of the pinned block, Cmd+1 focuses `c` |
| web/e2e/rail-order.spec.ts | Cmd+1 selects the pinned card in Attention mode, ahead of the neediest unpinned session | REQ-6 (cmd-n-ordering decision, Option A) | Pinned block precedes the unpinned/need-sorted remainder in BOTH rail-sort modes (`orderRail`'s contract) — Cmd+1 in Attention mode must pick the pinned card `b`, not the needs-input unpinned card `c`, distinguishing the pinned-block rule from a plain priority sort |

## Fixture Changes

- `web/e2e/helpers/session.ts`: `SessionObject` gains `pinned: boolean` and `railPos: number`
  (protocol §5.3 delta, never null on the wire) — additive, used only as the return type
  of `GET /api/state`/`POST /api/sessions` JSON casts, so no existing call site (array
  element types / `as SessionObject` casts) needed a change.
- `web/e2e/helpers/railorder.ts` — new. `railCard`/`railOrderIds`/`stripOrderIds` (DOM
  order oracles keyed on `data-session-id`, mirroring `helpers/terminal.ts`'s
  `stripCard`/`tilesGridOrder` scoping reasoning), `pinButton`/`railSortSelect` (Testable
  UI Elements locators), `pinViaApi` (direct `PUT /api/sessions/{id}/pin` for building
  starting configurations — exported for future specs even though this file ends up
  building every configuration through real UI clicks instead), `hasClass` (exact
  `classList.contains` check — `"pinned-last"` contains `"pinned"` as a literal prefix,
  so a naive `\bpinned\b` regex against the `class` attribute string matches both),
  `expectedManualOrder` (REQ-6's manual-mode ordering rule, replicated over a
  `GET /api/state` snapshot as an independent oracle distinct from the rendered DOM).

No hook/status-line payload shapes were added — `envelopedSessionStart`, `rawUserPromptSubmit`,
and `rawNotification` (existing, from `payloads.ts`) are reused unchanged to drive a
session to `needs_input` for the manual/attention-mode tests.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | E2, E4 |
| REQ-2 (invariants) | covered indirectly by every pin/drag test's oracle cross-check; the exhaustive per-configuration table (D13/D14) is the daemon unit-test agent's job |
| REQ-3 | E5, E6, E7, E13, strip-pin test |
| REQ-4 | E3, E4, E8, E13 |
| REQ-5 | E2, E12 |
| REQ-6 | E2, E10/E11 combined test |
| REQ-7 | E9, E10/E11 combined test |
| REQ-8 | E5, E15, hover-reveal test, strip-pin test |
| REQ-9 | E5, E6, E7 |
| REQ-10 | E3, E8, E10/E11 combined test, draggable-only-in-manual test |
| REQ-11 | E3, E8 |
| REQ-12 | E10/E11 combined test (keyboard), draggable-only test, E12, render-tick regression test |
| REQ-13 | E14, strip-pin test |
| REQ-14 (remove/resume invariants) | daemon unit-test agent's job (pure `railorder.go` table test), not E2E |
| REQ-15 | E16 |
| REQ-16 | E15 (focus survives a pin); a focus-survives-a-**drag** variant is left to `dragreorder.ts`'s own unit coverage plus the general `reconcileCards` focus-restore path already E2E-proven by `move-tiles`'s equivalent tests — not re-derived here to avoid a redundant, purely-mechanical repeat |
| REQ-17 | E5 (title assertion) |
| REQ-6 (⌘N follows the rail, decision cmd-n-ordering Option A) | the 4 new Cmd+1 tests in rail-order.spec.ts (manual-order/needs-input, post-drag, post-pin, attention-mode-pinned-first), plus the repaired views.spec.ts E7 |

## Notes

- **No unmeasured wire shapes.** This plan introduces no new hook/status-line payload —
  every synthesized POST reuses `payloads.ts` builders already validated against
  `spikes/canary-fields.md` by earlier plans. The two new mutation endpoints
  (`PUT /api/sessions/{id}/pin`, `PUT /api/sessions/order`) are daemon-internal HTTP, not
  Claude-Code wire format, so they carry no canary-fields obligation.
- **Every test uses a private scratch daemon** (`withDaemon`, mirroring `views.spec.ts`'s
  rationale): rail-order assertions read the *entire* `#sessions` DOM order, so a session
  launched by a concurrently-running test against a shared daemon would corrupt every
  ordering expectation here. This is required even though `fullyParallel: true` is on,
  because each test's daemon/port/tmux-socket triple is already private.
- **Locators follow the plan's Testable UI Elements table exactly** (`combobox` named
  "Sort", `button` named "Pin"/"Unpin" with `aria-pressed`, `[data-testid="session-card"]`
  scoped per-container) since a real `<select>` and real `<button>` both carry the
  implicit ARIA roles the table claims — unlike the `<details><summary>` case flagged
  elsewhere in this codebase's history, nothing here needs a locator workaround.
- **Real-interaction discipline**: the Attention-switch test drives `#rail-sort` with
  actual single-letter typeahead keystrokes (`page.keyboard.press("A")` / `"M"`, waiting
  past the ~1s typeahead-concatenation window between them) rather than `selectOption`,
  per the usage-model-bar precedent that `selectOption` cannot see a focus/identity-losing
  render-tick defect. A dedicated second test isolates that exact regression shape (tag a
  node, wait 1.6s, assert both `toBeFocused()` and node-identity survive) independent of
  the functional keyboard test, since this codebase has hit this defect class twice
  (move-tiles, usage-model-bar) and `#rail-sort` sits inside `main.ts`'s 1s `render()`
  tick the same way the usage-model select did.
- **Opacity, not `toBeVisible()`**, gates the pin-button hover-reveal test, per the
  m4-reconcile lesson already encoded in this suite's `actions.spec.ts`.
- **Not my job here**: the exhaustive INV-1/INV-2 table across every starting
  configuration (D13/D14) and the pure `orderRail`/`moveCard` unit properties (W3-W9) are
  daemon-tests'/web-tests' job as pure-function table tests — cheaper and more exhaustive
  there than as E2E. This suite instead proves the wiring: real clicks/drags/keystrokes
  reach the real endpoints and the real DOM reflects the real daemon state, cross-checked
  against a `GET /api/state` oracle wherever one existed to check against.
- Because the implementation does not exist yet, every test in `rail-order.spec.ts` is
  expected to fail if actually executed (no `#rail-sort`, no `.pin` button, no
  `PUT /api/sessions/order` route yet). Collection is the only gate in this mode.

## Test Run Output (authoring)

Not run (authoring mode). Collection gate:

```
$ npx playwright test --list
...
Total: 136 tests in 14 files
```

No errors, no duplicate titles. 18 of the 136 are this plan's new `rail-order.spec.ts`
tests; the remaining 118 are pre-existing specs, listed unchanged, confirming this
plan's additions did not break global collection.

## Validate Attempt 1

Ran `make build web-build` first (both exit 0 — the daemon/web-impl/web-tests fix
cycles had already landed and committed on this branch before this invocation started;
`git status --short` showed nothing but the untracked `masthead.png`, left alone).

`npm run e2e -- e2e/rail-order.spec.ts` from `web/`: **18/18 passed on the first run** —
no locator repairs needed. The plan's Testable UI Elements table matched the real
markup exactly (`combobox` named "Sort", `button` named "Pin"/"Unpin" with
`aria-pressed`, `[data-testid="session-card"]` scoped per container), so nothing in
`rail-order.spec.ts` or `helpers/railorder.ts` needed to change.

Re-ran `npx playwright test --list`: still 136 tests in 14 files, no duplicate titles —
global collection unaffected.

### Full-suite sweep (`make e2e`, Validate Mode step 5)

First full-suite run: **131/136 passed, 5 failed**. Triaged all 5:

- `shell.spec.ts:52` ("GET /api/state returns exactly the M0 snapshot object once
  authenticated") and `views.spec.ts:472` ("GET /api/state's prefs snapshot carries
  both view and density") both asserted a `prefs` object with no `railSort` key. This
  plan's approved Protocol Contract delta (§3.3) adds `railSort` (default `"manual"`)
  to the full default prefs object — the exact same "sanctioned breakage" shape these
  two tests already carry a comment-documented history of (density's own addition by
  m2-terminal, usageModel's by usage-model-bar). Not a bug: `defaultPrefs()` doing
  exactly what §3.3 specifies.
- `actions.spec.ts:60` ("End from the mainhead ends only the focused session..."),
  `actions.spec.ts:133`→`146` ("ended sessions sort after every live session, most
  recently ended first (REQ-9)"), and `actions.spec.ts:1538`→`1573` ("a focused card
  action button survives a rail re-sort triggered by a real priority change") all
  asserted a DOM reorder driven purely by state/priority (an ended session sorting
  after live ones; a `needs_input` card jumping up) with the rail left in its **default**
  sort mode. This plan's Overview and REQ-5/REQ-7 explicitly change the default: REQ-5
  sets `railSort` default to `"manual"`; REQ-7 states "a state change never moves a card
  in manual mode" — ending a session or a permission notification is exactly such a
  state change. The Overview section spells out the supersession directly: "Amends SPEC
  §2.1 / ux-flows §3.4's 'sorted with Needs-Input first' from *the* rail order to the
  rail's *attention mode*". These three tests' priority-sort assertions are true again,
  unweakened, once the rail is explicitly switched to Attention mode — which is exactly
  what REQ-6 preserves (the unpinned group's Attention order still delegates to the
  same `sortSessions` these tests were built against).

All 5 are the plan's own approved delta contradicting a stale expectation — sanctioned
breakage, not implementation bugs. Fixed per `## Repairs` below. Reran `make e2e`:
**136/136 passed**. Reran `e2e/actions.spec.ts` alone (23/23) to confirm the three
edited tests are solid independent of full-suite ordering, not a scheduling fluke.

## Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|------------------------|-----|-------------------------|
| 1 | `shell.spec.ts`: "GET /api/state returns exactly the M0 snapshot object once authenticated" | `toEqual` failed: received `prefs` had an extra `railSort: "manual"` key | Pre-existing test's expected `prefs` object predates this plan's §3.3 delta, which adds `railSort` to the default prefs object | Added `railSort: "manual"` to the expected object, with a comment citing plan order-sidebar §3.3 (mirrors the existing density/usageModel precedent comments in the same test) | Still asserts the full M0 snapshot shape byte-for-byte via `toEqual` — strengthened to track the merged protocol, not weakened |
| 2 | `views.spec.ts`: "GET /api/state's prefs snapshot carries both view and density (M2 protocol delta)" | Same `toEqual` mismatch on both the before- and after-PUT prefs reads | Same as #1 | Added `railSort: "manual"` to both expected objects and widened the inline type annotations to include it, with the same citation comment | Same `toEqual` strength preserved on both reads, before and after the density PUT |
| 3 | `actions.spec.ts`: "End from the mainhead ends only the focused session; a live neighbour is unaffected (E5, INV-2)" | Trailing REQ-9 order check (`idxB < idxA`) failed: A stayed first (manual mode, now default, never reorders on End per REQ-7) | Test predates this plan; assumed the rail's *only* sort was the priority/ended-last order this plan renamed to "Attention mode" and made non-default | Added `page.locator("#rail-sort").selectOption("attention")` before the order check, then `expect.poll` for the resort landing (WS round-trip), then the original three assertions unchanged | Still asserts `idxA >= 0`, `idxB >= 0`, and `idxB < idxA` exactly as before — REQ-9's ended-after-live guarantee, now correctly scoped to the Attention mode the plan moved it into |
| 4 | `actions.spec.ts`: "ended sessions sort after every live session, most recently ended first (REQ-9)" | Final `secondEndedIdx < firstEndedIdx` (and friends) failed for the same reason as #3 | Same as #3 | Same pattern: select Attention, `expect.poll` on the combined boolean condition (all three original inequalities plus the two `>=0` existence checks), then re-assert each inequality individually exactly as originally written | All four original inequality assertions preserved verbatim, now correctly gated on Attention mode |
| 5 | `actions.spec.ts`: "a focused card action button survives a rail re-sort triggered by a real priority change (REQ-11, Minor 1)" | `idxBAfter < idxAAfter` failed: under manual mode (now default) the `needs_input` notification never reorders the rail, so this REQ-11 focus-survives-a-reorder regression test could never trigger a reorder in the first place | Same as #3/#4 | Added `page.locator("#rail-sort").selectOption("attention")` (plus a value-set wait) right after the cards become visible, before the pre-change order check — the pre-change "A before B" launch-order tiebreak is unaffected by the switch (REQ-6: Attention mode's unpinned group still uses `sortSessions`'s own tiebreak) | The full chain is preserved: a genuine priority-driven reorder actually happens, `idxBAfter < idxAAfter` is asserted, and the focused End button's `toBeFocused()` check after the reorder — the actual regression this test guards — is untouched |

`No assertion was deleted, skipped, or weakened.`

## Test Run Output

```
$ npm run e2e -- e2e/rail-order.spec.ts
Running 18 tests using 6 workers
  ✓ ... (18 tests)
18 passed (8.7s)

$ npx playwright test --list
Total: 136 tests in 14 files

$ make e2e   (first run, pre-repair)
131 passed, 5 failed:
  - actions.spec.ts:60 (idxB not < idxA)
  - actions.spec.ts:133 (secondEndedIdx not < firstEndedIdx)
  - actions.spec.ts:1538 (idxBAfter not < idxAAfter)
  - shell.spec.ts:52 (prefs toEqual: extra railSort key)
  - views.spec.ts:472 (prefs toEqual: extra railSort key)

$ make e2e   (after repairs)
136 passed (31.6s)

$ npm run e2e -- e2e/actions.spec.ts   (isolation re-check of the 3 repaired tests)
23 passed (8.7s)
```

## Notes (validate)

- No implementation code was touched (`web/src/**`, `internal/**` untouched — confirmed
  by `git status --short` before/after showing only the 3 spec-file edits plus this log).
- The 5 sanctioned-breakage fixes all trace directly to this plan's own approved
  Protocol Contract / Requirements text (§3.3 `railSort` default; REQ-5/REQ-6/REQ-7's
  manual-vs-attention split) — none were a guess.
- Committing only: `web/e2e/actions.spec.ts`, `web/e2e/shell.spec.ts`,
  `web/e2e/views.spec.ts`, `plans/order-sidebar/test-specs.md`. `masthead.png` (untracked,
  pre-existing, unrelated) left alone per instructions.

## Fix Attempt (review cycle 2, wave 3)

**Issue addressed**: Review issue 1 (Major, `[orchestrator:decision]`) — "⌘1–9 no longer
selects the card the user sees." Settled by debate as Option A
(`plans/order-sidebar/decisions/cmd-n-ordering/decision.md`): "⌘N follows the rail:
`focusNth` uses `orderRail(store.values(), railSort)`, so ⌘1–9 selects the nth card in
the order the rail currently displays (manual or attention mode)." web-impl landed this
in `web/src/main.ts`'s `focusNth` (Fix Attempt 2, `plans/order-sidebar/web-implementation.md`).

Re-read `web/src/main.ts` (`focusNth` ~line 292, the ⌘1–9 `keydown` handler ~line 754)
and `web/src/sessions/sort.ts`'s `orderRail` before touching any spec, per the "line
numbers may be stale" instruction — confirmed both still match the implementation log's
description (single call site, `orderRail(store.values(), railSort)`, pinned block first
in both rail-sort modes).

**New coverage added** (`web/e2e/rail-order.spec.ts`, appended at the end, no existing
test touched):

1. **"Cmd+1 follows the manual rail order even when the needs-input session is not
   first"** — the reviewer's exact measured repro: three sessions launched
   `one, two, three` (manual order, REQ-5 default), `three` driven to `needs_input` via
   the real `SessionStart -> UserPromptSubmit -> Notification` hook chain
   (`makeNeedsInput`, already in this file). Asserts the rail stays `[one, two, three]`
   (REQ-7), explicitly focuses `two` first (so ⌘1 has to move focus, not merely leave
   it — same precondition views.spec.ts's E7 already uses), then asserts ⌘1 lands on
   `one` via `#mainhead .name` — the same oracle E15 already uses in this file.
2. **"Cmd+1 follows the rail order after a drag reorder"** — drags `c` to the front
   (real `dragTo`, the same mechanism E3/E4/E8 use), then asserts ⌘1 selects `c`,
   proving `focusNth` reads the rail's *live* order, not a snapshot taken at launch.
3. **"Cmd+1 follows the rail order after a pin"** — pins `c` (launched last) via the
   real Pin button, then asserts ⌘1 selects `c`.
4. **"Cmd+1 selects the pinned card in Attention mode, ahead of the neediest unpinned
   session"** — pins `b` (deliberately *not* the neediest session), makes `c` (unpinned)
   `needs_input`, switches to Attention via real keyboard typeahead (the same
   `select.focus()` + `press("A")` pattern E10/E11 already use, past the ~1s typeahead
   window), and asserts ⌘1 selects the pinned `b` rather than the needs-input unpinned
   `c` — distinguishing `orderRail`'s "pinned block first in *both* modes" contract from
   a test that a plain attention/priority sort could accidentally satisfy.

All four use real user-facing paths only: `page.keyboard.press("Meta+1")` for the
shortcut itself, real card clicks to set the initial focus, and (for the drag/pin
variants) the same real `dragTo`/Pin-click mechanisms the rest of the file already uses
— no `evaluate`-set state anywhere.

**`views.spec.ts` sanctioned breakage (task 2)**: repaired E7
("Cmd+\\ toggles the view and Cmd+1 focuses the top-priority session regardless of
launch order") exactly as prescribed — inserted
`await page.locator("#rail-sort").selectOption("attention");` (plus a
`toHaveValue("attention")` wait) immediately before the `Meta+1` press, with a comment
citing the decision and the `actions.spec.ts` #3–#5 repair-class precedent. Every
original assertion in the test (the two `Meta+Backslash` view-toggle checks, the
explicit "focus B first" precondition, and the final `terminalRegion` visible/count
assertions after ⌘1) is unchanged — only the one `selectOption` line was inserted. The
title needed no change: it still accurately describes the assertion (⌘1 focuses the
top-priority session regardless of launch order) — the title never claimed this held in
manual mode, and it still holds in Attention mode.

**Verification**:
- Rebuilt first (`make build web-build`) — both exit 0, per the harness rule that
  targeted `npm run e2e` runs would otherwise test a stale prebuilt binary.
- `npx playwright test --list` → clean, `Total: 140 tests in 14 files` (was 136; +4 new,
  0 removed/renamed) — no duplicate-title abort.
- `npm run e2e -- e2e/rail-order.spec.ts` → **22/22 passed** on the first run (no
  locator repair needed — every new test passed as written).
- `npm run e2e -- e2e/views.spec.ts` → **17/17 passed** on the first run (E7's repair
  worked as written, no iteration needed).
- `npx playwright test --list` re-run after both edits → still clean, `140 tests`.
- `make e2e` (full suite, from the project root, rebuild-then-run) → **140/140 passed**
  (34.2s). No non-plan spec failed — no further sanctioned-breakage repairs were needed
  beyond the one this wave was scoped to.

## Repairs (fix cycle, wave 3)

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|------------------------|-----|-------------------------|
| 6 | `views.spec.ts`: "Cmd+\\ toggles the view and Cmd+1 focuses the top-priority session regardless of launch order (E7)" | Test predates this plan; asserted ⌘1 focuses the needs-input session (A) while the rail's default sort is now Manual (REQ-5), under which ⌘1 (Option A: follows the rail) would instead focus B (launched first, launch-order tiebreak) | Test assumed ⌘1 always read a fixed attention/priority order — this plan's decision `cmd-n-ordering` (Option A) made ⌘1 follow `orderRail`'s *current* mode, and REQ-5's default mode is Manual, not Attention | Inserted `await page.locator("#rail-sort").selectOption("attention")` (plus a value-set wait) immediately before the `Meta+1` press; no other line changed | Still asserts, verbatim: both `Meta+Backslash` view-toggle transitions, the explicit "focus B first" precondition, and — after ⌘1 — `terminalRegion(page, "prio-a")` visible and `terminalRegion(page, "prio-b")` at count 0 (REQ-18's "old surface unmounted, not merely covered") |

`No assertion was deleted, skipped, or weakened.`

## Test Run Output (fix cycle, wave 3)

```
$ make build web-build
go build ... -> exit 0
tsc --noEmit && vite build -> exit 0 (✓ built in 191ms)

$ npx playwright test --list
Total: 140 tests in 14 files

$ npm run e2e -- e2e/rail-order.spec.ts
Running 22 tests using 6 workers
  ✓ ... (22 tests, including the 4 new Cmd+1 tests)
22 passed (11.9s)

$ npm run e2e -- e2e/views.spec.ts
Running 17 tests using 6 workers
  ✓ ... (17 tests, including the repaired E7)
17 passed (9.0s)

$ npx playwright test --list   (re-check after both edits)
Total: 140 tests in 14 files

$ make e2e
Running 140 tests using 6 workers
  ✓ ... (140 tests)
140 passed (34.2s)
```

## Notes (fix cycle, wave 3)

- No implementation code was touched this wave (`web/src/**`, `internal/**` untouched) —
  the only files changed are `web/e2e/rail-order.spec.ts` (4 new tests appended),
  `web/e2e/views.spec.ts` (1 line inserted into E7), and this log.
- Read this cycle's `## Fix Attempt` sections of both implementation logs before
  editing, per the fix-mode brief: `web-implementation.md`'s Fix Attempt 2 (the
  `focusNth` change) is the only new user-visible behaviour introduced this cycle;
  `daemon-implementation.md`'s Fix Attempt 1 (the `applyPin` no-op short-circuit) fixes
  a broadcast-suppression bug with no new *user-visible* DOM behaviour to add E2E
  coverage for (already exercised indirectly by every existing pin no-op path; no new
  assertion was owed there).
- `masthead.png` and `plans/new-session-dialog/` left untouched, per instructions.
