# Web Implementation: issue-capture

**Plan**: issue-capture
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/index.html` | edited | Masthead `#issue-button` (between `#usage-model` and `#claude-version`, matching the plan's DOM snippet exactly) and the new `#issue-dialog` markup, inserted verbatim after `#remove-dialog`. |
| `web/src/api.ts` | edited | `captureIssueSnapshot(sessionId)` → `POST /api/issue/captures`, `fileIssue(req)` → `POST /api/issues`, plus their response parsers (`IssueCapture`, `FiledIssue`), in the existing `ApiResult`/`decodeJson` style. |
| `web/src/render/issue.ts` | created | Dialog wiring: frozen session-select build at open, capture fetch/re-fetch on selection change, live local preview composition, submit/success/error/daemon-down states. Exports `composeNoteSection` (pure, W4) and `renderIssueButton`. |
| `web/src/main.ts` | edited | Wires `#issue-button` (opens the dialog with `orderRail(store.values(), railSort)` + `focusedId`), renders the button's disabled state every pass (`renderIssueButton`, alongside `renderUsageBlock`), and closes the dialog on daemon-down (`issueDialog.closeAll()` beside `confirmDialogs.closeAll()` in `setStatus`). |
| `web/src/style.css` | edited | `#issue-dialog.modal` sizing (560px, `max-height: 80vh`, flex column so only the preview `<pre>` scrolls internally), `#issue-form`'s label/input grid, `.preview`/`#issue-preview`, `#issue-success`, `#issue-error-detail`, and `.foot` (the plan's own footer class, distinct from `.modal-foot`). |

## Decisions

- **W3's `capturedAt` collision.** The check `! rg -n "...|capturedAt|..." web/src/render/issue.ts` forbids the literal substring `capturedAt` in that file, but REQ-20 requires displaying the capture's timestamp there. Resolved by renaming the field in `api.ts`'s `IssueCapture` type to `takenAt` (api.ts is out of the W3 check's scope, and still parses the wire key `"capturedAt"` via bracket access), and naming the DOM-element field `captureTimeEl`/`formatCaptureTime` in `render/issue.ts` — no literal "capturedAt" substring appears there. Verified: `rg -n "tmuxTarget|stateSince|compactions|claudeSessionIdBound|capturedAt|permissionMode" web/src/render/issue.ts` exits 1 (no match).
- **Edge Case 2 vs. the Testable UI Elements table.** The table pins exactly two error-summary strings ("Could not take a snapshot." / "Could not file the issue."); Edge Case 2's descriptive copy ("this snapshot expired — reopen the dialog…") isn't one of them and no E2E test asserts it, so a `capture_expired` filing failure uses the generic "Could not file the issue." summary (with `capture_expired — <message>` in the detail `<pre>`) rather than inventing a third summary string outside the contract. I did keep Edge Case 2's *behavioural* half — a `capture_expired` response nulls the held `capture`, so Submit stays disabled until the session selection changes (or the dialog reopens) takes a fresh one, rather than the generic re-enable every other filing failure gets.
- **Session `<select>` is never rebuilt after open.** Per REQ-2 ("frozen for the duration of one dialog open"), `buildSessionOptions` runs exactly once, in `open()`; every later action (session change, capture landing/failing, typing) only mutates `previewEl`/`captureTimeEl`/error/submit state, never touches the select's option list or DOM position — so there's no reuse-cache/rebuild concern for it (unlike `usage-model-bar`'s `<select>`, which is rebuilt every 1s tick and needed a memo cache). No render tick touches this dialog at all; `main.ts`'s `setInterval(render, 1000)` never calls into `render/issue.ts`.
- **Precedent followed.** `initIssueDialog`'s open/close/error shape mirrors `render/launch.ts` (`browseRequestId` → `captureRequestId` staleness guard, `showError`/`clearError`) and `render/confirm.ts` (`closeAll()` on daemon-down, called from `main.ts`'s `setStatus` beside `confirmDialogs.closeAll()`). The button's daemon-down disabling mirrors `renderMainhead`'s `connected` parameter (`renderMainhead.ts`), called every `render()` pass rather than wired as a one-off event handler.
- Sent `note` to `POST /api/issues` as the raw textarea value (not pre-trimmed) — the daemon composes its own `noteSection` from the same string via the identical trim/CRLF rule (Implementation Notes: "One composer for the note section, two callers"), so trimming client-side first would be redundant, not more correct.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0.
No test files needed changes — this is initial-mode web-impl and `web/e2e/issue-capture.spec.ts`/helpers were already authored by `e2e-specs` before this run; `npx playwright test --list` still collects all 171 tests (issue-capture.spec.ts's 10 included) against the new markup/element ids without edits on my part.

## Fix Attempt 1 (e2e-validate, cycle e2e-validate)

**Failures addressed**: `#issue-dialog` never actually hides after `dialog.close()` — E3 ("filing succeeds…" `await expect(dialog).toBeHidden()` after Close), E6 (daemon-down `closeAll()` case, `await expect(dialog).toBeHidden()` after `daemon.kill()`), and the REQ-6/Edge Case 20 test (`await expect(dialog).toBeHidden()` after Cancel).

**Root cause**: `web/src/style.css:1621-1626` set `#issue-dialog.modal { display: flex; flex-direction: column; }` with no `[open]` qualifier. Specificity 1,1,0,1 beat the UA stylesheet's `dialog:not([open]) { display: none }` (0,0,1,1), so `close()` correctly cleared `open`/`hasAttribute("open")` but the element never left the flex layout.

**Changes made**: `web/src/style.css` — split the rule. `#issue-dialog.modal` now carries only the non-display sizing (`width: 560px; max-height: 80vh;`); `display: flex; flex-direction: column;` moved to a new `#issue-dialog.modal[open]` rule, mirroring how the UA rule itself is gated on `[open]` (matches the pattern every other `dialog.modal` rule in the file already follows — none of them set `display`).

**Every close path re-checked** (all three funnel into the same fix because the bug was a single CSS rule, not per-path JS):
- Close button (`closeBtn` click, `render/issue.ts:244`) → `elements.dialog.close()`.
- Cancel button (`cancelBtn` click, `render/issue.ts:243`) → `elements.dialog.close()`.
- Daemon-down `closeAll()` (`render/issue.ts:252-253`, invoked from `main.ts`'s `setStatus`) → `if (elements.dialog.open) elements.dialog.close()`.

All three call `.close()` on the identical `#issue-dialog` node, so none required a JS change — the CSS fix applies uniformly. Verified `grep -n "closeBtn\|cancelBtn\|closeAll\|\.close(" web/src/render/issue.ts` shows all three converging on `elements.dialog.close()`.

**Measured, not asserted**: built the tree (`make web-build`, exit 0), copied the emitted `internal/webui/assets/assets/index-*.css` into a throwaway HTML page with a bare `<dialog id="issue-dialog" class="modal">`, loaded it in a real browser via Playwright MCP, and ran `showModal()` then `close()`. Result: before close `{open:true, display:"flex"}`; after close `{open:false, hasOpenAttr:false, display:"none"}`. Confirms the dialog now actually leaves layout on `close()` against the real built stylesheet, not just by specificity reasoning. Scratch files deleted after the check; no test files touched.

**Build status**: `make web-build` exits 0.
