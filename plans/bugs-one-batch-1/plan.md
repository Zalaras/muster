# Plan: bugs-one-batch-1

**Status**: completed
**Shape**: fix
**Work Type**: full-stack
**E2E Scope**: new-specs
**Fixture plan**: rail-menu.spec.ts daemon (one group, three sessions per test); effort-header.spec.ts daemon (the test kills and restarts its own daemon); update.spec.ts daemon (a routed /ws, no real update)
**Render fixtures**: notes, reader-docs-large, new: reader-docs-large-pair (two idle Focus sessions, `reader-large-a` and `reader-large-b`, each on its own copy of the large tree with `0-outline.md`)
**Features**: lifecycle, rail, groups, actions, notes, reader, surfaces, update
**Touches**: connection, focus
**Description**: Eight bug entries from `## Bugs`: a dead pane's card flips to ended within a second of a non-clear SessionEnd; a right-click on a selected card acts on the whole selection; closing the note returns focus to the terminal; the reader keeps each document's scroll position across surface and session switches and reloads; the reserving size note's NBSP gets a guard; a reversed wheel after a clamped flick scrolls the new way at once; the unreachable action error clears on reconnect; the pop-out reloads after an update restart.

## Symptom

### e1 — A card shows alive for up to 5 s after Claude exits

> - [ ] **A card shows alive for up to 5 s after Claude exits** when no terminal is attached. From
>   `plans/maintainability-cleanup/`.

No GitHub issue.

### e2 — Right click menu with multiple select only applies action to one

> - [ ] **Right click menu with multiple select only applies action to one** ([#97](https://github.com/Zalaras/muster/issues/97)) — With
>   several items selected, the right click menu applies its action to only one item instead of all of
>   the selected items. Expected: The right click menu should apply its action to all selected items
>   rather than just the one under the pointer.
>   Filed 2026-10-15 from musterd 0.21.2 / Claude Code 2.1.300, focus view, session working.
>   Labels: bug, rail, ux.

### e4 — Closing notes should take focus back to Claude typing

> - [ ] **Closing notes should take focus back to Claude typing** ([#111](https://github.com/Zalaras/muster/issues/111)) — After
>   closing the session note with Esc, keyboard focus does not return to the Claude typing area.
>   Expected: Closing the note with Esc should give focus back to Claude typing.
>   Filed 2026-10-22 from musterd 0.25.1 / Claude Code 2.1.308, focus view, session idle.
>   Labels: bug, focus.

### e5 — I don't want my position in the doc reset on swapping sessions

> - [ ] **I don't want my position in the doc reset on swapping sessions** ([#109](https://github.com/Zalaras/muster/issues/109)) — Switching
>   between sessions, or between tabs such as docs, shell and claude, resets the scroll position in
>   the document being read. Expected: The scroll position in a document should be preserved when
>   swapping sessions or tabs and coming back.
>   Filed 2026-10-21 from musterd 0.25.1 / Claude Code 2.1.306, focus view, session started.
>   Labels: bug, documents, ux.

### e6 — Check the Focus view's first-attach terminal height

> - [ ] **Check the Focus view's first-attach terminal height** — the size note's reserved row
>   was restored; confirm the terminal is not a row short on first attach. From
>   `plans/maintainability-cleanup/`.

No GitHub issue.

### e7 — A hard wheel flick swallows the next wheel the other way

> - [ ] **A hard wheel flick swallows the next wheel the other way** — after a hard downward
>   flick over a shell surface, the next several wheel-ups do nothing before the pane starts
>   scrolling up. Reversing direction should scroll the other way straight away. From
>   `plans/shell-pane-fixes/`.

No GitHub issue.

### e8 — "Could not reach musterd." stays after the daemon is back

> - [ ] **"Could not reach musterd." stays after the daemon is back** — after an action fails while
>   musterd is down, the action-error line keeps that message once the connection returns, until
>   the next action replaces it. It should clear when the daemon is reachable again. From
>   `plans/effort/`.

No GitHub issue.

### e9 — The pop-out reader keeps the old dashboard after Update and restart

> - [ ] **The pop-out reader keeps the old dashboard after Update and restart** — dashboard
>   windows reload onto the new version; an open pop-out should too. From
>   `plans/settings-update-failures/`.

No GitHub issue.

## Findings

Each entry's full research is `plans/bugs-one-batch/research/<id>.md`, `## Answers` included. The
developer's one answer covered every entry: "we're going with your suggested default".

**e1.** Reproduced on a scratch daemon with a stub `-claude-bin`: after a non-clear `SessionEnd`
POST and the stub's exit, `tmux has-session` fails within 0.1 s but `alive` stays true for
3.6–4.7 s, until the 5 s poll tick. Cause: the only on-demand check is `Manager.Nudge`
(`internal/session/liveness.go:145`), whose sole production caller is the terminal pump's PTY-EOF
path (`internal/server/terminal.go:320`). A non-clear `SessionEnd` becomes `KindDeathHint`, which the
state machine treats as a no-op by design (kb:adr/lifecycle-liveness-from-pane-existence), and
nothing re-checks the pane. A single nudge at ingest would race: the hook fires from the still-running
process and ingest is async (kb:adr/ingest-seq-assigned-at-ingest), so the pane may still exist when
the event is applied. Default taken: a bounded re-check, about every 200 ms for up to about 3 s, each
through `checkOneLiveness(…, false)` so the `stopped` guard holds
(kb:adr/lifecycle-liveness-writes-stop-at-shutdown); triggered from `Manager.Apply` on
`claudecode.KindDeathHint` (not `KindClearDeathHint`). `alive` is still decided by pane existence
alone; this is not a payload write.

**e2.** Reproduced by the existing REQ-7 E2E (`web/e2e/rail-menu.spec.ts:424`), which asserts the
single-card behaviour: `No group` from selected card A leaves B grouped. The behaviour is the
accepted kb:adr/rail-card-right-click-menu-holds-session-actions ("In Select mode the menu is for
the one card"). Cause: `railmenu.ts` `open()` builds `cardMenuItems(session)` and `entriesFor(session)`
closing over one id; `RailMenuDeps` has no view of the selection; `groups.moveToEntries` wraps one
session (`groups.ts:482`). Developer's decision, after asking what general practice is (Finder,
Explorer, Gmail, VS Code): reverse the ADR with a superseding one
(`docs/adr/rail-card-menu-on-selected-card-acts-on-selection.md`, proposed on this branch). In
Select mode, right-clicking a card **in** the selection opens a menu for the whole selection: Stop…,
Remove… and Move to apply to the selection, each confirming with the count as the selection bar does
(`actions.dispatchMany("end"|"remove", ids, origin)`, the many-session `moveToEntries`); Resume and
Pin/Unpin are hidden in that menu; the menu names the count; with live and ended mixed, Stop and
Remove both show and each applies to the sessions it fits; Select mode stays on afterwards
(kb:adr/rail-select-mode-persists-across-bar-actions). Right-clicking a card **outside** the selection
opens today's single-card menu and leaves the selection as it was. Tiles has no select mode; the strip
card is unchanged. No protocol change: `sessions.end-many`, `sessions.remove-many` and
`sessions.group` already take id lists.

**e4.** Reproduced with a scratch Playwright spec: after Escape (anchored and popped), the popped
panel's close button, and a second glyph click, `document.activeElement` is the `Note` glyph button;
only click-away lands in the terminal. Cause: `notes.ts` `close(returnFocus)` ends with
`glyph.focus()` and `closeByUser()` always passes `true`; `initNotes(app)` takes no deps so it
cannot reach `surfaces.focusSelected(id)` as `rail.ts` and `launch.ts` do. Defaults: all three user
closes return focus to the **selected surface** (`surfaces.focusSelected`, so the shell terminal when
Shell is selected); with Docs showing or the session ended (nothing takes focus) fall back to the
glyph, never `body`. Escape still only acts from inside the panel
(kb:adr/notes-escape-only-from-inside-the-panel, unchanged).

**e5.** Reproduced with a scratch Playwright spec on a real daemon: `scrollTop` 600 became 0 after
docs→shell→docs, docs→claude→docs and session A→B→A; the `article.md` node is new each time. Cause:
`features/reader.ts` `reconcileInstances` disposes the `ReaderInstance` whenever its session is not
visible with `docs` selected, and a rebuilt instance re-opens `memory.openPath` into a fresh body.
`ReaderMemory` (`web/src/reader/memory.ts`, key `muster.reader.<sessionId>`) holds no scroll
position. Defaults: one position per session + document (a map keyed by path, capped or pruned to
paths still in the listing); stored in the existing localStorage `ReaderMemory` so it survives a
reload (kb:adr/reader-memory-split-browser-and-daemon already puts the reading position in browser
memory); a stored position applies only when a reader instance is built or a remembered path is
opened with the loading cue, never to a reader already showing in the other window on a `storage`
event; restore again after the diagram pass settles, clamped to `scrollHeight − clientHeight`;
find's jump on a file switch (kb:adr/reader-find-query-follows-file-switch) must still win.

**e6.** Did **not** hold. Measured at five viewport heights (601–899 px) with a probe spec: the first
`resize` frame (1–23 ms after the socket opens) already carries the settled row count, xterm rows
equal the rows that fit and tmux `window_height`, before and after a resize round-trip. The NBSP
placeholder (`web/src/render/focusview.ts` `renderSizenote` with `reserving`) gives `#sizenote` its
real 26 px before the first `refit()`. Stale: the E4 comment in `web/e2e/terminal.spec.ts:211-221`
still describes the ASCII-space era ("pre-sizenote height, one row taller") and cites `main.ts:175`.
Developer's default: add the guard. Batch ruling on the optional E2E first-resize-frame assertion:
**not added** — kb:adr/process-transient-displays-not-oracles generalises to any value a later pass
replaces, and E4's own comment documents the next tick's refit correcting the first fit as intended
behaviour, so pinning the first frame would assert an intermediate the product does not promise. The
unit NBSP assertion and the E4 comment correction land; the entry is ticked with the measurement.

**e7.** Reproduced by running the real `accumulateWheelDelta` on the frames `pane.ts` feeds it: a
+10000 px flick → `lines −200, carry 6000`; the next wheel-ups (−100) give `−200`, `−90`, then `5`.
Cause: `web/src/terminal/shellkeys.ts` `accumulateWheelDelta` carries every unconsumed pixel past
the 200-line clamp, and nothing resets the carry on a direction change, so the next opposite-sign
event cannot outweigh it. Fix: when `eventDeltaY` is non-zero and its sign is opposite to
`accumDeltaY`, drop the carry and start from `eventDeltaY` alone; same-direction carry past the clamp
stays, so the pinned test `a sum past the 200-line clamp carries the unconsumed pixels to the next
frame` stays green. Web only; the daemon handles each frame once, synchronously.

**e8.** Reproduced with a scratch Playwright spec following E13: kill, Dismiss on the effort strip
(the one control still enabled while down), restart; the masthead reads connected and the banner hides,
but `#action-error` still shows `Could not reach musterd.` 3 s later. Cause:
`web/src/features/actions.ts` `showActionError` is the line's only writer and clears only on a later
successful action; nothing subscribes to the connection coming back (`status` fires only for
non-connected states; `helloArrived` has one listener, `updaterestart.ts`). Defaults: only the
`network_error` message clears on reconnect (a real daemon refusal stays), so `actions.ts` must know
the shown message's code; the launch dialog's own error line is out of scope.

**e9.** Reproduced with a scratch Playwright spec using `update.spec.ts`'s routed-`/ws` technique:
after a synthetic `update` broadcast with `apply.phase: "restarting"` and a server-side close, the
pop-out reconnected but fired 0 `load` events and kept its pre-restart marker. Cause: `web/src/doc.ts`
registers `coreWsHandlers` only and never calls `initUpdateRestart`; `coreWsHandlers` (`wsapp.ts`)
has no `onUpdate`/`onHelloArrived`, which only `dashboardWsHandlers` relays onto the bus, so
`updaterestart.ts` never holds a record in the pop-out. Fix: the pop-out wires `initUpdateRestart(app)`
before the socket starts and a handler set that relays `onUpdate` and `onHelloArrived` (factored so
the dashboard's two relays are not duplicated). The pop-out has no banner, so `bannerOverride` and the
"Updated to" confirmation go unread there; the reload keeps `?session=…&path=…` so the same document
reopens. No protocol change; this brings the pop-out into line with
kb:adr/update-restart-reloads-dashboard and the update spec's "every window … reloads".

## Requirements

### Must Have
- **REQ-1**: After a non-clear `SessionEnd` is applied to a session whose pane then disappears, the
  session's `alive` becomes false within 1 s without a poll tick; the same `sessionUpsert` with
  `alive:false` reaches dashboards sooner, nothing else on the wire changes. (e1)
- **REQ-2**: A `clear` SessionEnd starts no re-check, and a re-check that lands after `Stop` has
  begun does not persist `alive=false` (the existing `stopped` guard). The re-check is bounded (about
  every 200 ms, capped near 3 s) and does nothing while the pane still exists. (e1)
- **REQ-3**: In Select mode, right-clicking a card that is in the selection opens a menu whose label
  names the count (for example `Actions for 2 sessions`) and whose Stop…, Remove… and Move to
  (each group, `New group…`, `No group`) apply to every selected session: Stop… and Remove… open the
  count confirm as the selection bar does and dispatch the daemon batch; a Move to choice moves every
  selected session. Resume and Pin/Unpin are absent from that menu. With live and ended sessions mixed,
  Stop… and Remove… both show and each applies to the sessions it fits. Select mode and the selection
  stay on afterwards (survivors after a Remove). (e2)
- **REQ-4**: In Select mode, right-clicking a card outside the selection opens today's single-card
  menu for that card and leaves the selection unchanged. Outside Select mode, and on the Tiles strip
  card, the menu is unchanged. (e2)
- **REQ-5**: Escape inside the anchored or popped note panel, the popped panel's close button and a
  second click on the note glyph each close the panel and put keyboard focus in the selected
  surface's terminal (Claude, or the shell when Shell is selected). When no terminal can take focus
  (Docs selected, or an ended session) focus lands on the note glyph, never on `body`. Escape with
  focus outside the panel still does nothing to it. (e4)
- **REQ-6**: The reader remembers a scroll position per session and per open document in its
  browser memory (`muster.reader.<sessionId>`), bounded to paths still in the listing. A reader
  rebuilt after a Claude or Shell switch, a session switch and back, or a page reload opens the
  remembered document at that position (clamped to the document's current height, re-applied after
  the diagram pass). A `storage` event from another window never scrolls a reader already showing.
  Old-shape memory JSON without the field still parses. (e5)
- **REQ-7**: The reserving size note (`renderSizenote(el, null, { reserving: true })`) stays visible
  and holds exactly one non-breaking space (`" "`), and the E4 comment in
  `web/e2e/terminal.spec.ts` describes today's behaviour (the first fit already sees the reserved row;
  re-parsing per poll is for load, not for a transient height). (e6)
- **REQ-8**: `accumulateWheelDelta` with a non-zero `eventDeltaY` whose sign is opposite to the
  carried `accumDeltaY` drops the carry: a +10000 flick followed by −100 yields `lines 5`; a −5000
  flick followed by +100 yields `lines −5`. Same-direction carry past the 200-line clamp is
  unchanged. (e7)
- **REQ-9**: An action error whose code is `network_error` (`Could not reach musterd.`) shown in
  `#action-error` is cleared when the connection comes back (the next hello); any other action error
  (a daemon refusal or a partial batch report) survives a reconnect until the next action replaces or
  clears it. The launch dialog's own error line is untouched. (e8)
- **REQ-10**: A pop-out reader (`/doc.html`) that received an `update` broadcast with
  `apply.phase: "restarting"` reloads on its first reconnect's hello, keeping its `session=` and
  `path=` query so the same document reopens; a pop-out that saw no restart record does not reload on
  an ordinary reconnect. The dashboard's own behaviour is unchanged. (e9)

## Affected Files
### Daemon (daemon-impl)
- `internal/session/liveness.go` — REQ-1, REQ-2: a bounded pane re-check (about 200 ms cadence, about
  3 s cap) built on `checkOneLiveness` with `endOnCheckError=false`; bounded goroutine, tracked on
  `m.wg` or cancelled by the manager's context, the implementer's call.
- `internal/session/apply.go` — REQ-1, REQ-2: arm the re-check when the applied input's `Kind` is
  `claudecode.KindDeathHint` (never `KindClearDeathHint`). Neutral `Kind` only; no Claude Code
  vocabulary leaves `internal/claudecode/`.
- `internal/server/renderfix_scenarios_reader.go` — REQ-6 fixture: scenario `reader-docs-large-pair`,
  two idle Focus sessions each on its own copy of the large tree, mirroring `driveReaderDiagramsPair`
  without the tiles pref; regenerate `web/render/fixtures/`.
### Web (web-impl)
- `web/src/features/railmenu.ts` — REQ-3, REQ-4: when `groups.selecting()` and the right-clicked id is
  in `groups.selectedIds()`, build the selection menu (count label, Stop…/Remove… through
  `actions.dispatchMany`, many-session Move to); otherwise today's path. `RailMenuDeps` widens
  structurally.
- `web/src/features/railmenuitems.ts` — REQ-3: the pure item list for a selection (which items show and
  their enablement given live/ended mix, connection and in-flight).
- `web/src/features/groups.ts` — REQ-3: expose Move to entries for many sessions (today wrapped as one
  at the handle).
- `web/src/features/notes.ts` — REQ-5: a `NotesDeps` with `surfaces: { focusSelected(id): void }`;
  user closes return focus through it, glyph fallback when nothing took focus.
- `web/src/reader/memory.ts` — REQ-6: a per-path scroll field with a pure transition and a tolerant
  parser; pruning to the listing.
- `web/src/features/reader.ts` — REQ-6: save the body's scroll (debounced and on dispose), restore
  after a remembered open and after the diagram pass, clamped; never on a `storage`-event adoption.
- `web/src/render/reader.ts` — REQ-6, only if a scroll-listener helper belongs beside `attachScrollSpy`.
- `web/src/terminal/shellkeys.ts` — REQ-8: reset the carry on a direction reversal.
- `web/src/features/actions.ts` — REQ-9: `showError` learns the error's code (or compares against the
  shared network-error body); subscribe to the reconnect (`helloArrived`) and clear only the
  `network_error` message.
- `web/src/api/http.ts` — REQ-9, only if the network-error body or code is exported for the comparison.
- `web/src/features/groups.ts`, `groupsdialogs.ts`, `effort.ts` — REQ-9, only if `showError`'s
  signature changes.
- `web/src/doc.ts` — REQ-10: `initUpdateRestart(app)` before the socket starts; a handler set relaying
  `onUpdate` and `onHelloArrived`; header comment updated.
- `web/src/wsapp.ts` — REQ-10: the pop-out handler set (or the two relays moved into core) with the
  dashboard's relays shared, header and doc comments updated.
- `web/src/features/updaterestart.ts` — REQ-10: comment wording only, if "this window" reads as
  dashboard-only.
- `web/src/main.ts` — REQ-5: `initNotes(app, { surfaces })` (surfaces is built earlier; no thunk).
  REQ-3: `initRailMenu(app, { actions, groups })` already passes both handles; untouched unless the
  type needs it.
### Existing tests this breaks
- `web/e2e/rail-menu.spec.ts`: the REQ-7 test at line 424 asserts the single-card behaviour the
  developer reversed; e2e-specs rewrites it (Proof E1).
- `web/e2e/effort-header.spec.ts`: the E13 test gains assertions (Proof E3); nothing it asserts today
  changes.
- `web/e2e/terminal.spec.ts`: the E4 comment (REQ-7) is rewritten by e2e-specs; its assertions stay.
- `web/render/notes.spec.ts` R13 keeps focusing the glyph itself before each pass, so it stays green.

## Proof

One per entry: red today, green after.

1. **e1 — daemon-tests**, `internal/session/manager_test.go`,
   `TestApply_NonClearSessionEndEndsSessionPromptlyOnceThePaneDies`: `newTestManager(t, st, pc,
   rec.record, withPollInterval(time.Hour))`, `CreateSession` + `RecordLaunch("muster-1:@1", "%1")`,
   `pc.setExists("muster-1:@1", true)`, `mgr.Apply(ctx, id, "c1", nil,
   claudecode.StateInput{Kind: claudecode.KindDeathHint}, true)` while the pane still exists, then
   `pc.setExists(..., false)`; `require.Eventually(… !got.Alive …, 1*time.Second, 20*time.Millisecond)`.
   Red today: nothing re-checks the pane. Companions in the same file: `KindClearDeathHint` starts no
   watch (alive stays true within the same bound while the pane exists); after `mgr.Stop` a follow-up
   check does not persist `alive=false` (mirrors
   `TestCheckOneLiveness_StoppedGuard_PeriodicPollAndNudgeSkipPersistAfterStop`). (D1)
2. **e2 — e2e-specs**, `web/e2e/rail-menu.spec.ts`: the REQ-7 test at line 424 is rewritten as
   "right-clicking a selected card in Select mode applies the menu's action to the whole selection,
   and an unselected card keeps its own single-card menu (REQ-3, REQ-4, #97)": select A and B (both in
   group `review`), right-click A, the menu label names 2 sessions and lists Stop…, the groups, New
   group…, No group and no Pin; choose `No group`;
   `expect.poll(() => stateSession(page, daemon, b.id).groupId).toBeNull()` — red today (B stays
   grouped); "2 selected" and both checkboxes stay. A second journey: Stop… from selected A opens the
   count confirm ("Stop 2 sessions" as the bar's wording), confirming ends both, select mode stays on.
   The unselected card C keeps today's single-card menu (Stop…, groups, Pin) and the selection stays.
   (E1) **web-tests**, `web/src/features/railmenuitems.test.ts`: the selection item list for all-live,
   all-ended and mixed selections, disconnected and in-flight; new logic tests, green on arrival. (W1)
3. **e4 — render-tests**, `web/render/notes.spec.ts`, fixture `notes`, session `notes-short`:
   "Escape in the anchored note panel, Escape in the popped panel and the popped close button each
   close it and return keyboard focus to the Claude terminal (REQ-5, #111)": click the terminal, open
   with the glyph, press Escape, `expect.poll(() => activeElementInsideTerminal(page, "notes-short")).toBe(true)`
   — red today (activeElement is the `Note` glyph); the popped variants in the same test or beside it;
   a fallback case on `notes-ended`: focus lands on the glyph, not `body`. (R1)
4. **e5 — render-tests**, `web/render/reader.spec.ts`: "the reading position in an open document
   survives selecting Claude and then Docs again, switching to another session and back, and a reload
   (REQ-6, #109)": on `reader-docs-large` open `0-outline.md` in Focus, set the rendered body's
   `scrollTop` to 600, click claude then docs, `expect.poll(() => renderedBody.evaluate(el => el.scrollTop)).toBe(600)`
   (±1) — red today (`0`); the reload leg beside E19; on `reader-docs-large-pair` the rail-card
   switch to `reader-large-b` and back. (R2) **web-tests**, `web/src/reader/memory.test.ts`: the scroll
   transition, pruning, and old-shape JSON parsing to the default; green on arrival. (W2)
5. **e6 — web-tests**, `web/src/render/focusview.test.ts`: `renderSizenote(el, null, { reserving: true })`
   leaves `el.hidden === false` and `el.textContent === " "` — passes today on purpose: it is a
   guard for a measured non-bug (the research's "a test that passes today is blocked" rule does not
   apply; the entry's route is `chore`). (W3) **e2e-specs**: the E4 comment correction in
   `web/e2e/terminal.spec.ts` (no assertion change), alongside E1.
6. **e7 — web-tests**, `web/src/terminal/shellkeys.test.ts`, inside the `accumulateWheelDelta`
   describe: "a wheel the other way after a clamped flick scrolls the new direction at once":
   `accumulateWheelDelta(accumulateWheelDelta(0, 10000).accumDeltaY, -100).lines` is `5` — red today
   (`-200`); mirror `(-5000, +100)` → `-5`. (W4)
7. **e8 — e2e-specs**, `web/e2e/effort-header.spec.ts`: the E13 test pins
   `toHaveText("Could not reach musterd.")` after the failed Dismiss and, right after the banner hides
   and **before** the second Dismiss, `expect(page.locator("#action-error")).toBeHidden()` — red today
   (`Received: visible`). A second test: a refusal (the `page.route` 500 on Dismiss as REQ-9's test
   does) survives `daemon.restart()` in the line. (E3)
8. **e9 — e2e-specs**, `web/e2e/update.spec.ts`, beside "a window holding a restart record reloads on
   a mismatched-protocol reconnect…": "an open pop-out reader holding a restart record reloads on its
   first reconnect (REQ-10)": open `/doc.html?session=…&path=…`, set `window.__e2eMarker`, push the
   synthetic `update` broadcast with `apply.phase: "restarting"` down the routed socket, close the
   server side; `page.waitForEvent("load")` — red today (times out, marker survives); afterwards the
   status line is connected and the URL still carries `session=` and `path=`. (E5)

## Edge Cases
1. The pane still exists when the death hint is applied (hook beats process exit) → D1
2. A straggler non-clear SessionEnd on a live pane (pre-resume pane) → D1 (shared with edge case 1) — the watch finds the pane alive on every tick and expires
3. Right-click on a selected card while the daemon is down → E1 (the selection menu's items are disabled like the single-card menu's) — untested: the existing REQ-10 test covers the single-card menu; the selection path shares `cardMenuItems`' connection rule
4. A selection whose sessions are all ended: Stop… absent, Remove… present → W1
5. Note closed from the popped panel while Shell is the selected surface → untested: the render harness mounts the Claude terminal only; REQ-5's "selected surface" rule is one call into `surfaces.focusSelected`, the same seam `rail.ts` uses
6. Reader rebuilt onto a document shorter than the stored offset → R2 (the clamp; the test's reload leg on the same document keeps 600, the clamp is reviewer-verified)
7. Memory JSON written by the previous build (no scroll field) → W2
8. Two consecutive clamped flicks the same way → W4 (the pinned carry test stays green beside the new ones)
9. A refusal shown before the daemon goes down, then a reconnect → E3
10. A pop-out that saw no restart record reconnects → E5 (the ordinary reconnect in the same test fires no `load`)

## Acceptance Criteria

### Automated Checks
```checks
D1 go test -count=1 -run 'TestApply_NonClearSessionEnd|TestApply_ClearSessionEnd|TestCheckOneLiveness_StoppedGuard' ./internal/session/
D2 go test -count=1 ./internal/session/ ./internal/server/
W1 cd web && npx vitest run src/features/railmenuitems.test.ts
W2 cd web && npx vitest run src/reader/memory.test.ts
W3 cd web && npx vitest run src/render/focusview.test.ts
W4 cd web && npx vitest run src/terminal/shellkeys.test.ts
W5 make web-test
R1 cd web && npm run -s render:lint && npx playwright test -c playwright.render.config.ts render/notes.spec.ts
R2 cd web && npm run -s render:lint && npx playwright test -c playwright.render.config.ts render/reader.spec.ts
R3 make render-test
E1 make e2e SPECS='e2e/rail-menu.spec.ts'
E3 make e2e SPECS='e2e/effort-header.spec.ts'
E5 make e2e SPECS='e2e/update.spec.ts'
L1 make lint
L2 make web-lint
```

### Render
- **R1**: fixture `notes`, session `notes-short` (live, idle) and `notes-ended` for the fallback.
- **R2**: fixtures `reader-docs-large` (one Focus session, the large tree) and the new
  `reader-docs-large-pair` (two Focus sessions on separate copies of the large tree, for the
  session-switch leg).

### Reviewer-Verified
- The e1 re-check never writes `alive` from the payload: every flip goes through
  `checkOneLiveness`, and the goroutine ends at the cap or when the pane is gone.
- `railmenu.ts` reads `groups.selecting()`/`selectedIds()` inside `open()`, not at init.
- The reader's stored scroll is applied only in the instance-build/remembered-open path, never in the
  `storage`-event adoption path, and is clamped to `scrollHeight − clientHeight`.
- The E4 comment in `web/e2e/terminal.spec.ts` no longer claims a pre-sizenote first fit.
- `actions.ts` clears `#action-error` on reconnect only when the shown error's code is `network_error`.

## Doc Delta
**lifecycle** — becomes true: `alive` is nudged by a non-clear `SessionEnd` too — a bounded pane
re-check (about every 200 ms for up to about 3 s) that ends the session as soon as the pane is gone;
the shutdown guard covers it. Stops being true: "nudged by PTY EOF and End" alone. In
`docs/protocol.md` `kb:anchor/state.liveness`, "event-nudged (PTY EOF, End)" gains the SessionEnd
re-check; no message, field or anchor changes. The spec is at 797 words: the sentence is edited in
place and an equal number of words is cut from the same paragraph.
**rail** — becomes true: in Select mode a right-click on a selected card opens the selection's menu
(count in its label; Stop…, Remove…, Move to over the selection; no Resume or Pin); an unselected
card keeps its own menu and the selection. Stops being true: the single-card-in-Select-mode sentence
and its citation of kb:adr/rail-card-right-click-menu-holds-session-actions, replaced by
kb:adr/rail-card-menu-on-selected-card-acts-on-selection. The spec is at 792 words: cut as many as
are added.
**groups** — becomes true: § Select mode names the card menu as a way to act on the selection, and
that the mode stays on afterwards. Stops being true: nothing. The spec is at the 800-word cap: cut
as many words as are added.
**actions** — becomes true: the card menu on a selected card is a third origin of the Stop and
Remove batches; the action-error line clears a `Could not reach musterd.` message when the
connection returns, and keeps any other message until the next action. Stops being true: nothing.
**notes** — becomes true: closing the panel from the keyboard, the close control or the glyph returns
keyboard focus to the selected surface's terminal, or to the glyph when no terminal is showing.
Stops being true: nothing. The spec is at the 800-word cap: cut as many words as are added.
**reader** — becomes true: the reading position per document is remembered beside the last open
file, expanded folders and folds; the pop-out reloads after an update restart like the dashboard.
Stops being true: nothing. The spec is at 778 words: edit the existing memory sentence in place.
**update** — becomes true: only the dashboard shows the updating banner and the `Updated to`
confirmation; every window, the pop-out included, reloads on its first reconnect. Stops being true:
nothing.
**surfaces** — No doc change (the carry is not described).

## Out of scope
- Resume and Pin for a selection (no batch endpoint exists; protocol work).
- The launch dialog's own error line after a reconnect.
- Keeping the pop-out's scroll position across its reload beyond what e5's memory already restores.
