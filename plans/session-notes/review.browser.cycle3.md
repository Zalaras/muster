# Browser review: Session notes

**Plan**: session-notes
**Verdict**: needs-changes
**Cycle**: 3
**Pack**: kb: pack 15485 words (budget 30000)
**Rig**: `make web-build build` at ae9622b8 (clean tree apart from the other reviewers' untracked parts), `bin/musterd` per test via `helpers/fixtures.ts` `daemon`: a fresh scratch data dir under `$TMPDIR/muster e2e-<owner>-…` (with a space), `-S <dataDir>/tmux.sock`, and the E2E stub `claude`. Headless Chromium at 1440×900, throwaway `web/e2e/zz-rb-notes-c3.spec.ts` run in the foreground with `--workers=1` (4 tests, three runs), then deleted. Fixture teardown killed each daemon and ran `tmux -S … kill-server`.

Gates log `/var/folders/8t/36s1xtwj1xjfn1pg_jrwztjw0000gn/T/gates-session-notes-c3`: 0 failed lines. `21-e2e.log` shows 635 passed and `04-web-build.log` is green, so the app I drove is the one that ships.

**Scope.** Since cycle 2 (206717da) the only `web/src` changes are `storage.ts` (the new `listKeys`) and `features/notesdrafts.ts` (`storedIds` now calls it). `storedIds` feeds `pending()`, which three paths use: the snapshot handler (re-send on load and reconnect, and dropping drafts of sessions that no longer exist), `flushAll` on `pagehide` and `visibilitychange`, and nothing else. I re-measured every cell those paths reach, in three storage states: **normal**, **storage blocked, getter throws** (`window.localStorage` throws on access, the way Chrome behaves when site data is blocked), and **storage blocked, methods throw** (the object exists, but `length`, `key`, `getItem`, `setItem` and `removeItem` all throw). After that I ran a smoke pass over the cycle-2 geometry and visibility cells to confirm they still hold. The rest of the cycle-2 matrix (`review.browser.cycle2.md`) is carried forward unchanged, because no code that renders it has changed.

Hosts: **focus** (the glyph, the anchored and popped panel, and the rail card) and **tiles**. **pop-out `/doc.html`** is N/A, because notes have no `/doc.html` host. States: **no data**, **data**, and **daemon-down** (SIGTERM through `daemon.kill()`, with the banner confirmed `display:block`).

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-10 (stale drafts) | focus | no data, normal storage | on load, a stored draft for a session that does not exist is dropped. Keys that are not drafts are left alone | pass | seeded `muster.note-draft.9999`, `muster.note-draft.abc` and `muster.unrelated-note-x`, then reloaded. `9999` is removed. `abc` (not an integer id) and the foreign key are kept. Session 1's `/api/state` note stays `null`, so nothing was sent for a bad key. No `pageerror` |
| REQ-10 / REQ-11 | focus (anchored) | daemon-down, normal storage | the typed text is kept in local storage per session, and the unsaved status shows in `--warn` | pass | `localStorage` `muster.note-draft.1` = `"kept across page close"`. `.st` reads `unsaved, musterd unreachable`, colour rgb(232,207,90) = `--warn`, display block, opacity 1. Banner `display:block` |
| REQ-10 | focus | daemon-down → up, normal storage | a draft kept by a page that is gone is re-sent by the next page load with no action | pass | the tab was closed while musterd was down (its `pagehide` keepalive PUT failed), then `daemon.restart()` and a new tab in the same context. `/api/state` note = `kept across page close`. `muster.note-draft.1` removed and the other keys untouched. Glyph `ng has`, rail `Has a note` count 1. After a reload the panel shows the text. No `pageerror` in either tab. This is the path `listKeys` now serves |
| REQ-10 / REQ-11 | focus (anchored) | daemon-down → up, storage blocked (methods throw) | text kept in the open page, unsaved status, re-sent on reconnect, status clears | pass | `.st` `unsaved, musterd unreachable` in `--warn`. Editor value `first while down`, the same TEXTAREA still `activeElement` after 1.2 s. After restart the PUT `{"note":"first while down"}` leaves with no action, `/api/state` matches, and `.st` is empty. No `pageerror`, so the `listKeys` catch path holds |
| REQ-10 / REQ-11 | focus (anchored) | daemon-down, storage blocked (getter throws) | text kept, unsaved status in `--warn` | pass | `.st` `unsaved, musterd unreachable`, rgb(232,207,90). Editor keeps `first while down` and focus across 1.2 s |
| REQ-10 / REQ-11 | focus (anchored) | daemon-down → up, storage blocked (getter throws) | the kept text is re-sent on reconnect with no action, and the status clears | **FAIL** | the banner goes `display:none`, but no PUT leaves in 9 s. `/api/state` stays `first` and `.st` still reads `unsaved, musterd unreachable` with musterd reachable. A `pageerror` is thrown from the snapshot dispatch (Major 1). One more keystroke sends `first while down!` and clears the status |
| REQ-9 | focus | data, storage blocked (both) | the first save reaches the daemon | pass | PUT `{"note":"first"}` and `/api/state` = `first` in both variants |
| REQ-6 | focus | no data → data | glyph muted, then foreground; keyboard focus kept across a tick | pass | `ng`, rgb(166,171,188) = `--fg-dim`, opacity 0.55, then `ng has`, rgb(232,230,225) = `--fg`. `activeElement` stays `Note` after 1.2 s; Enter opens the panel |
| REQ-7 | focus (anchored) | no data | panel under the glyph | pass | glyph 314–327 × 63.7–76.7; panel 314–714 × 80.7–152.5 |
| REQ-12 / REQ-14 | focus (popped) | data | Pop out lands inside the slot | pass | panel 1056–1416 × 119.4–419.4, inside `section.main` 300–1440 × 95.4 (mainhead bottom)–900 |
| REQ-17 | tiles | data | the popped panel is hidden in Tiles and comes back at the same rectangle | pass | Tiles: `[hidden]`, computed `display:none`. Back in Focus: 1056,119.4 360×300 |
| REQ-18 | focus (rail card) | data | marker shown | pass | `.mk` computed display flex |
| REQ-19 | focus (rail card) | data | the hover opens a read-only tooltip | pass | at 600 ms: display block, `pointer-events:none`, text `Note read-only hello body`, box 277–577 × 181.8–286.8 |
| §6.7 | all | daemon-down | daemon-down surfaced prominently | pass | `#banner` display block in every daemon-down cell |
| all other cycle-2 rows | focus / tiles | all | as in `review.browser.cycle2.md` | carried forward | no rendering code changed since 206717da. The smoke rows above re-measured the same numbers |
| all rows | pop-out `/doc.html` | all | — | N/A — notes have no `/doc.html` host | |

## Issues

### Critical
None.

### Major
1. **[web-impl]** With browser storage blocked so that reading `window.localStorage` throws, a note typed while musterd was down is not re-sent when musterd comes back. The panel keeps saying `unsaved, musterd unreachable` after the banner has cleared, and the text reaches the daemon only on the next keystroke. The cause is older than this plan and is not the `listKeys` change: `web/src/theme.ts` `writeThemeHint(hint, storage = localStorage)` evaluates the `localStorage` global in its default parameter. The theme feature's `snapshot` listener therefore throws (stack: `Mc` ← theme `a()` ← `emit` ← `onSnapshot`), and the throw aborts the later `snapshot` listeners in the same emit, notes' re-send among them. In the same state, the focused terminal's `/ws/terminal/1` was not reopened after the reconnect either. A fix must make the snapshot reach the notes handler when storage is blocked: `writeThemeHint`'s default goes through `safeLocalStorage()`, or the bus isolates a throwing listener, or both. The plan's "wrap every read and write" (Technical Context) and REQ-10's "re-sent on reconnect" then hold in this state. The fix is one line outside this plan's diff, so the orchestrator may route it to `/fix` rather than this run.

### Minor
None.

### Notes
1. **[note]** REQ-11's "nothing shows while a save is merely in flight" is still not measured in the running app. A request cannot be held open without a network stub, so W5 and R8 own it (as in cycle 2).
2. **[note]** A draft key whose suffix is not an integer (`muster.note-draft.abc`) is ignored and never cleaned up. It is harmless (it is never sent and nothing shows) and the behaviour is the same as before `listKeys`. No change requested.
3. **[note]** **[e2e-specs]** No committed spec or render test drives blocked storage, so Major 1 could not fail any gate. The regression test for the fix needs a journey that blocks the `localStorage` getter before load, types while musterd is down, restarts it, and asserts the PUT with no further input.
