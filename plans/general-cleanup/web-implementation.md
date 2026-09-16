# Web Implementation: General Cleanup

**Plan**: general-cleanup
**Mode**: initial
**Pack**: `kb:pack plan=general-cleanup role=web-impl features=ingest,lifecycle,surfaces,actions,connection,theme,reader,triage,launch`

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/reader/notice.ts` | created | REQ-6: exported `classifyDocChanged(openPath, changedPath)` pinning markdown-render-fixes edge case 5. REQ-8: exported `deriveNotice(status, loadingPath, bodyRendered, noticeText)`, now taking the three-way `ConnectionStatus` instead of a boolean so a never-connected reader reads `connecting…` instead of the unreachable text. |
| `web/src/render/focusrestore.ts` | created | REQ-7: `isRestorableControl(el)` (button/select inside `#app`, duck-typed for jsdom-free Vitest) and `shouldRestoreFocus({activeIsBody, stillInDocument, disabled})`, the pure decision `features/connection.ts` drives. |
| `web/src/features/connection.ts` | edited | REQ-7: `initConnection`'s `onChange` now remembers `document.activeElement` (if restorable) before the render for a non-connected status, and restores focus to it once after the render that returns to `connected`, via the two pure functions above. No other site touched (R1). |
| `web/src/app.ts` | edited | REQ-8: `RenderFrame` gains `connection: ConnectionStatus` alongside the existing `connected: boolean`; `render()` sets both from `state.connection`. |
| `web/src/features/reader.ts` | edited | REQ-6: `handleDocChanged` now calls `classifyDocChanged` instead of its own inline path comparison. REQ-8: removed the local `deriveNotice`/`UNREACHABLE_TEXT`, imports the pure version from `reader/notice.ts`; `ReaderInstance.render`'s third parameter is now `connection: ConnectionStatus` (was `connected: boolean`), and both call sites (`reconcileInstances`, the standalone branch of `renderFrame`) pass `frame.connection`. |
| `web/src/doc.ts` | edited | REQ-9: wires `onPrefs`/`onClaudeTheme` to `app.emit("prefs"/"claudeTheme", ...)` and calls `initTheme(app, { surfaces: { applyTheme() {} } })` before the socket starts, mirroring `main.ts`'s init order. Also emits `"prefs"` from the snapshot's own `prefs` field in `onSnapshot` (see Decisions). Updated the file's top comment, which previously documented `onPrefs`/`onClaudeTheme` as deliberately unwired. |

## Decisions

- REQ-9 addition beyond the plan's literal bullet: `doc.ts`'s `onSnapshot` now also does `app.emit("prefs", snapshot.prefs)`, mirroring `main.ts:106`. The plan bullet names only the live `onPrefs`/`onClaudeTheme` broadcasts, but `internal/server/prefs.go:266` shows `prefsMessage` is only broadcast on a *change* (`f.hub.broadcast(prefsMessage{...})` inside the PUT handler, not on connect) — without reading `snapshot.prefs` at connect, a pop-out opened after the user had already picked a non-`"follow"` theme would resolve `themeChoice`'s default (`"follow"`) instead of the persisted choice until the next live change, which may never come. This isn't a protocol change (the field was already on the wire) and doesn't contradict anything the plan states, so it isn't tagged `deviation:`.
- `RestorableCandidate` (`render/focusrestore.ts`) is a minimal duck-typed interface (`tagName`, `closest`), not `Element`, per the Implementation Notes' "no jsdom in Vitest" for this unit surface — a real `document.activeElement` is structurally compatible, so `features/connection.ts` needs no cast to call `isRestorableControl`.
- Every REQ-6/7/8/9 item in the plan's Web Affected Files list is done above; no item deliberately skipped.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0.

**Plan's own E2E specs (smoke check, not a verdict)**: ran `npx playwright test general-cleanup.spec.ts` from `web/` after `make web-build build` from the project root.
- E1, E2, E3, E4 pass.
- **E5 fails on a test-fixture gap, not an implementation defect**: `scratchDirectory()` creates an empty temp directory with no `.md` file, so `launchSession`'s session never has a plan or any listed file. The reader's own `decideInitialOpen` (`features/reader.ts`) correctly opens nothing (`listing.plan?.exists` is false, `memory.openPath` is unset) — the pop-out link (`popOutHref`) is `null` whenever `openPath` is `null` by design (`buildBarVM`), so `popOutLink(region)` never renders and the test's own precondition assertion (`await expect(popOutLink(region)).toBeVisible(...)` at `general-cleanup.spec.ts:197`) times out before it ever reaches the REQ-9 assertions later in the test. The error-context snapshot confirms the reader shows `nothing open — pick a file` and `0 .md`. Fixing this needs the test to seed a markdown file into `dir` (or otherwise get a file open) before clicking into the docs surface — that edit belongs to e2e-specs, not to me (I may not edit `web/e2e/**`). REQ-9's actual wiring (`doc.ts`'s `onPrefs`/`onClaudeTheme` → `initTheme`) is otherwise identical in shape to `main.ts`'s already-exercised path, and is covered by `npx tsc --noEmit`/`npm run build` plus code review; I was not able to observe the live theme-follow assertion itself run green due to this fixture gap.

No test files needed changing beyond the above (no import path of mine moved/renamed a symbol another test imports).
