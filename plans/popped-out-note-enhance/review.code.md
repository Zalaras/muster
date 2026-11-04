# Correctness review: Popped-out note enhancements

**Plan**: popped-out-note-enhance
**Verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 31961 words (budget 30000)

This is a full review, not a delta cycle. Cycle 2 left a browser Major open (settled by the
`banner-above-popped-panel` debate, consensus A), so the delta rule does not apply. Since
`review_commits[2]` (`f6627357`), the source diff is small: `setForm` in `features/notes.ts`, and
z-index 46 on `.banner` and `#connection-status` in `style.css`. Three render tests were added. On
the docs side there is a new ADR, the design-system sentence, the diagram count, the plan amendment
and the Testable UI row. I re-read all of it. Rows for files with no change since cycle 2 carry
cycle 2's evidence, re-checked where the new diff could affect them. Every cycle 2 issue, from all
three parts, is checked in the Delta table.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 per-session pop-out, one panel | Yes: `notes.ts` `renderPhase`/`stillWanted`; `focusChanged` closes (unchanged since cycle 2) | R1, R8, E1, E2, E8, E11 | pass |
| REQ-2 own rectangle per session | Yes: `places` map, `effectiveRect` | R1, E1 | pass |
| REQ-3 per-tab memory, old key ignored | Yes: `muster.note-places` via `safeSessionStorage`. `muster.note-panel` is never read (C2) | W1, W2, W3, E1, old-key E2E | pass |
| REQ-4 pop in / close / window keep the rectangle, Remove forgets it | Yes: `closeByUser`, `popIn`, `openInWindow`; `withoutPlace` on `sessionRemoved`, `withoutAbsent` on snapshot | R2, R3, W5, E2, E3, E4 | pass |
| REQ-5 drag/resize anywhere in the window, clamped, 260×150 floor, 360×300 default | Yes. New this cycle: `setForm` (`notes.ts:69-72`) is now the only writer of `form`; `rg 'form = '` finds only `:70`. It clears `liveGesture` on every move out of `popped`, so `update`/`end` (`:238,:247`) cannot write `popped: true` after Pop in, Close, Open in window, a focus change, Tiles or a removal | R4, R5, R6, W4; cycle 2 tests at `notes-places.spec.ts:327,365,399`; new drag-across-Pop-in test (`notes-places.spec.ts:508`); its pre-fix failure is recorded in `render-tests.md` | pass |
| REQ-5 *Amended* (cycle 2): banner and connection readout above a popped panel | Yes: `.banner` has `position: relative; z-index: 46` (`style.css:510-511`). `#connection-status` has `z-index: 46` (`:361`) on its existing `position: relative`. Order: panel 45 < banner/readout 46 < `.menu` 50 < `.pop`/`.cardtip` 55. The only `position: fixed` rules in `style.css` are `.menu`, `.pop`/`.cardtip` and `.npanel` | Two new render tests (`notes-places.spec.ts:469,489`) reach the real daemon-down state (hello, snapshot, socket drop) with a panel placed under each element. They assert the overlap first, then that the `elementFromPoint` hit is `#banner` / `#connection-status`. Both failed before the fix (`render-tests.md`) | pass |
| REQ-6 anchored Close saves at once, returns focus | Yes: `closeByUser` → `close(true)` → `editor.release()` flush | R11, E2E Close, keyboard test | pass |
| REQ-7 three controls per form, inside at 260px | Yes: Pop out, Pop in, Open in window, Close | R7, the 260×150 test | pass |
| REQ-8 Open in window: popup, closes the panel, focuses an existing window, a blocked popup keeps the panel | Yes: `noteswindows.ts` `openOrFocus`; early return in `openInWindow` | W6 (seam), E3, popped-out window test | pass |
| REQ-9 note window: content, no controls, Escape only leaves edit, title, theme | Yes: `notespage.ts`, `note.ts`, `note.html` (which has no banner or readout, so the z-index change does not reach it) | R9, R12, E5 | pass |
| REQ-10 window stays on its session, two-way sync | Yes: fixed `sessionId`, `adoptIncoming` | E5 | pass |
| REQ-11 `connecting…`, unsaved status, kept text re-sent; amended `musterd unreachable` while reconnecting | Yes: `notesview.ts` `windowStatus`; `saver.resend` on snapshot; `notessave.ts` `stillFailed` | R13, `notes-window.spec.ts:69`, `notesview.test.ts`, `notessave.test.ts`, E6 ×2, mirror-ordering E2E | pass |
| REQ-12 removed notice, drafts dropped, unknown/malformed id | Yes: `markRemoved`; `reader/query.ts` `parseSessionParam`; `noteWindowWsHandlers` wires `sessionRemoved` | R9, W7, `query.test.ts`, E7 | pass |
| REQ-13 storage unavailable | Yes: every access goes through `safeSessionStorage()`/`safeLocalStorage()` | R8, blocked-storage E2E | pass |
| REQ-14 hidden in Tiles, window live in Tiles | Yes: `showsFor` requires `view === "focus"` | R10, E5 | pass |
| DIAG | `kb:diagram/web-components`, the only diagram `kb for` names for `notes.ts` and `style.css`; the notes spec has no inline fence. `reader/` now reads "12 modules … the ?session= parse" (counted 12: find, freshness, frontmatter, markdown, memory, mermaid, notice, paths, query, slug, tree, zoom). `features/` 48 (counted 48) and `render/` 45 (counted 45) are unchanged. The `Rel(features, reader, "markdown, tree, query")` label covers the new use. The z-index change adds no module or edge | — | pass |

## Build & Tests

E2E tests: pass (664, full suite. The NOTE line in the gates summary says scope `all`: `web/vite.config.ts` is harness-wide) · Daemon tests (race): pass (every package ok, `gates-c3b/01-test.log`) · Web tests: pass (3101) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues; biome checked 419 files).

The race line comes from `gates-c3b`, which had 0 failed lines. Every other line comes from
`gates-c3`, run on the same tree at HEAD `a543e114` (the e2e log's `VERSION='v0.27.3-44-ga543e114-e2e'`).
In `gates-c3`, `make test-race` hit the 10-minute timeout in `internal/server`
(`TestWSHub_CloseAllDoesNotBlockBroadcastOnASlowPeer`) and `internal/session` under machine load.
The branch changes no Go file (`git diff --stat main...HEAD -- internal cmd` is empty), the non-race
`go test` inside C1 passed both packages, and the `gates-c3b` re-run passed. So this is load, not a
regression (Note 3).

Also green: render-fixtures (106 scenarios up to date), render-lint, render-test (445 passed),
contrast (54 pairs × 3 themes, 0 failures), features-inventory, versions, e2e-honest, kb check (664
records, 0 problems), e2e-lint, features-scope (Features notes; Touches connection, reader, actions),
comments, comment-ledger, and e2e-level (census only). The size `WARN` on `reader.ts` (707 lines, as
on `main`) belongs to review-maintainability.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| W1 | `make web-build` | pass (`gates-c3/04-web-build.log`; only the chunk-size advisory) |
| W2 | `make web-test` | pass (`05-web-test.log`, 108 files, 3101 tests) |
| W3 | `make web-lint` | pass (`09-web-lint.log`) |
| R1 | `make render-test` | pass (`08-render-test.log`, 445 passed) |
| E1 | `make e2e` | pass (`21-e2e.log`, 664 passed) |
| C1 | `make check` | pass (`22-C1.log`: lint, `go test`, web-lint, web-test, contrast, e2e-lint, render-lint, versions, render fixtures, kb check) |
| C2 | `! grep -rn "muster.note-panel\"" web/src --include=*.ts --exclude=*.test.ts` | pass (`23-C2.log` is empty) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. All four proposed ADRs exist for notes with `refs: plan:popped-out-note-enhance`. The new `notes-banner-above-popped-panel` describes what shipped: the z-order it states (dialogs, popovers 55, menus 50, banner/readout 46, panel 45) matches `style.css`. `notes-popout-per-session-anywhere-in-window` supersedes `notes-popout-hidden-in-tiles-geometry-per-tab`. The implementation logs have no `deviation:` lines. Both `doc-delta:` lines are folded into `doc-delta.md`, and its new banner/readout clause holds in the code. Every other delta line still holds (no code under them changed). The #112 `TODO.md` entry (line 195) stays open until Completion, as it should. One cosmetic citation slip is Minor 1 |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | no `any` in new web code | pass | `rg ': any\b\|as any\|<any>'` over `features/notes*.ts`, `note.ts`, `render/notespanel.ts`, `reader/query.ts`, `connectionhealth.ts` finds nothing |
| V2 | `note.ts` only wires | pass | 22 lines, unchanged: createApp, initTheme, initUpdateRestart, mountNotePage, tick, connection state, WsClient. No DOM lookup, listener or state of its own |
| V3 | Chrome popup without a tab strip; a second press brings it to the front | pass (code read) | `window.open(url, "muster-note-<id>", "popup,width=520,height=460")` without `noopener`, and `existing.focus()` while `!closed`; E3 shows no second page opens. A window raised on screen cannot be seen headless |
| V4 | note window fills the window at 320×240 and 1200×900, body scrolls | pass (carried) | Measured in cycle 1. Since then `style.css` changed only the z-index on `.npanel`, `.banner` and `#connection-status`. `note.html` has neither of the latter two, and `.npanel.window` is `position: static` |
| V5 | storage only through `safeSessionStorage()`/`safeLocalStorage()` | pass | No direct `sessionStorage`/`localStorage` in the new or changed `src` files |
| V6 | design-system § Note panel describes the per-session pop-out, window bounds, three controls and the note window | pass | `docs/design/design-system.md:325-349`. It now also states the `musterd unreachable` window status and the z-order against menus, popovers, banner and readout, which settles cycle 2's correctness Note 3 |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: web-only change (`git diff --stat main...HEAD -- internal cmd` is empty) with no Claude Code format knowledge |
| 2 | Terminal-output state parsing | pass |
| 3 | Blocking hook handler | pass: no daemon change |
| 4 | Bare tmux / resize-pane | pass: none |
| 5 | Payload logging | pass |
| 6 | Empty-gauge dishonesty | pass: the window shows `connecting…` before `hello` and `musterd unreachable` while reconnecting. The banner can no longer be hidden under a placed panel |
| 7 | Session identity on `session_id` | pass: keyed on the Muster session id |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary | pass: E2E uses the stub through `launchNoted`. The render tests run no daemon |

Design tokens: the new CSS adds only z-index and position literals, with no colour, font or spacing.
`.banner[hidden]` still has its `display: none` companion, and `position: relative` does not change
`display`.

## Delta (delta re-review only)

This is not a delta cycle. Every cycle 2 issue was checked anyway against `git diff f6627357..HEAD`:

| Prior issue | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 2 correctness Major 1 `[orchestrator]` diagram `reader/` says 11 modules | `8b70c12c` | Now "12 modules", counted 12. The edge label adds `query` |
| cycle 2 correctness Minor 1 `[orchestrator]` Testable UI status row lacks `musterd unreachable` | `8b70c12c` | The row lists `` (empty), `connecting…`, `musterd unreachable` or `unsaved, musterd unreachable`, window-only for the middle two, citing the amendment |
| cycle 2 browser Major 1 `[web-impl] [orchestrator:decision]` popped panel covers the daemon-down banner | `2e43049d` (decision, ADR, plan amendment), `2a55004f` (CSS), `87a451a6` (tests) | Option A landed as `decision.md` says. Banner and readout are at z 46 over the panel's 45. The decision's dissent asked for a render test pinning the order, and two were added, both red before the fix |
| cycle 2 maintainability Minor 1 `[web-impl]` `liveGesture` outlives `popIn` | `2a55004f`, `87a451a6` | `setForm` clears the gesture on every form other than `popped`, and all four former assignments go through it. A render test drags across Pop in by keyboard and checks that no popped panel shows on return and that the rectangle is unchanged. It was red before the fix (`render-tests.md`) |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[orchestrator]** `docs/design/design-system.md:345-349`, § Note panel. The cycle 2 insertion put
   the two new sentences between `This session has been removed.` and the citation that belonged to
   it. The paragraph now ends `…readable over any placement (kb:adr/notes-banner-above-popped-panel).`
   with a separate line `(kb:adr/notes-own-window-is-a-third-page).` after it. That stray line reads
   as a second citation for the z-order sentence. A fix moves `(kb:adr/notes-own-window-is-a-third-page)`
   back to the note-window sentences it supports, or drops it, so that each citation follows its own
   claim. Doc upkeep, so it does not block approval.

### Notes

1. **[note]** The two new banner/readout render tests, like the precedent at
   `notes-window.spec.ts:76`, route `/ws` to send hello and the snapshot and then close. Each hello
   resets `WsClient.attempt` (`ws.ts:137`), so the socket cycles about every 500 ms. The banner is
   hidden for the instant between each hello and the close that follows it. An `elementFromPoint`
   sample that lands in that instant would hit the panel. The window is tiny, and both tests were
   green in the gate run (445/445). If either test ever flakes, this is where to look.
2. **[note]** Cycle 2's correctness Notes 1 and 2 still hold unchanged: the window's own re-send
   rests on the mirror-ordering E2E, and `stillFailed` means "until any host's save of the shared
   draft succeeds". The cycle 3 diff does not touch `notessave.ts` or the E2E specs.
3. **[note]** `gates-c3`'s `make test-race` timed out in `internal/server` and `internal/session`
   at 10 minutes under machine load from a sibling worktree. The branch changes no Go file, the
   non-race `go test` in C1 passed both packages, and `gates-c3b` re-ran the race line green.
4. **[note]** `web-tests.md` still records cycle 1's count (3070); the gate ran 3101.
   `render-tests.md` now records the cycle 2 wave (445). Only the log is stale.
5. **[note]** The banner z-order touches the connection feature's banner element (connection is a
   **Touches** feature). The behaviour belongs to notes, since the panel is what moved over it. The
   delta line sits under notes, and no sentence of the connection spec changes, so no promotion to
   Features is owed.
6. **[note]** The pack is over its budget (31961 of 30000 words); `kb` warned.
