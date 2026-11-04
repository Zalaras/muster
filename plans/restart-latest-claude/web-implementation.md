# Web Implementation: Restart Latest Claude

**Plan**: restart-latest-claude
**Mode**: initial
**Pack**: kb: pack 36007 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/protocol/session.ts` | modified | `claudeVersion {running, behind} \| null` and `restartPending` decoded as required keys (REQ-3) |
| `web/src/protocol/batch.ts` | modified | `RestartResult` (`BatchResult` + `queued`) and `parseRestartResult` (REQ-4) |
| `web/src/api/sessions.ts` | modified | `restartSessions(ids)` -> `POST /api/sessions/restart` (REQ-4) |
| `web/src/app.ts` | modified | `claudeCode` app event (installed version for the restart controller) |
| `web/src/features/restartplan.ts` | created | Pure: free/busy rule, reason words, dialog classification, confirm label, dialog text (REQ-8, REQ-13, W3) |
| `web/src/features/restartnotice.ts` | created | Pure: notice derivation, oldest-version label, panel text, per-tab Ignore storage (REQ-7, REQ-9, REQ-10, W1, W2, W4) |
| `web/src/features/restart.ts` | created | Controller: panel open/close, Ignore, dialog, POST, result into the action-error line; returns `noticeLabel` / `togglePanel` for connection |
| `web/src/render/restartpanel.ts` | created | Panel DOM written in place each tick (REQ-7, REQ-9) |
| `web/src/render/restartdialog.ts` | created | Dialog DOM, two `<details open>` sections, filled once per open (REQ-8) |
| `web/src/render/masthead.ts` | modified | `renderClaudeVersion` gains the notice shape: one `<button aria-label="Claude Code update">` with the neutral dot, updated in place (REQ-7, REQ-11, REQ-12) |
| `web/src/features/connection.ts` | modified | Draws the readout every tick (memoised by description key), takes `restartNoticeLabel` / `toggleRestartPanel` in `ConnectionDeps`, emits `claudeCode` |
| `web/src/main.ts` | modified | One-line `initRestart`, deps into `initConnection`; render-phase list numbered |
| `web/index.html` | modified | `#restart-panel` static markup, `#restart-dialog` |
| `web/src/style.css` | modified | Notice button, panel, 520px dialog; readout box now `18ch + 4px` and `position: relative` |

## Decisions

- REQ-1/2/4-6 are daemon-side; web REQs 3, 7-13 are in Changes. REQ-11: neutral tokens only (`--fg*`, `--line*`, `--bg-raised`, `--disabled-fg`; the only `--amber` is each surface's one `.btn.key`); REQ-12: button `disabled` from `frame.connected`, panel closed by the `status` event and by the render phase.
- Testable UI Elements: every row honoured. Panel/dialog are `role="group"` / `dialog`; the panel head is a `div` (not a heading) so `getByText` finds it exactly once.
- The plan's sentences say `<n> live sessions run`; with n = 1 they read `1 live session runs ... picks it up` (grammar only; plural text unchanged for n > 1).
- A count row of 0 is omitted from the panel's list (removed from the DOM, not hidden), because the E2E locators assert `toHaveCount(0)` on it; the two `li` nodes are held in the elements object and only re-inserted when membership changes.
- Readout width: `min-width` goes `17ch + 4px` -> `18ch + 4px` (`claude 2.1.316→318` is 18 characters). A wider reservation (20ch, to hold the warning glyph inline) failed the existing 1280px masthead test (`render/usage.spec.ts` E7: 942 > 928), so in the notice shape the `⚠` glyph is absolutely positioned in the gap left of the box. Measured with the generated fixtures: `#claude-version` width is 137.28 px in `claude-restart`, `claude-restart-queued` and `three-states`; full render suite 427 passed.
- Dialog autofocus is on Cancel (like Stop/Remove); on close, focus returns to the readout button when it still exists.
- Dialog rows are as of opening and never re-rendered by the tick; the panel's nodes are static and updated in place; only the queued list is rebuilt, and only when its (id, title, reason) signature changes (list holds no focusable node). Cache key for the readout (connection.ts): text, warning, hint, notice.disabled — every input that shapes the button's attributes.
- `[hidden]` sweep: elements the TS hides are `#restart-panel`, `#restart-panel-behind`, `#restart-panel-queued`, `#restart-dialog-note`; one rule `.restart-panel[hidden], .restart-panel [hidden], .modal.restart [hidden] { display: none; }` covers all four.
- A first `.note` class on the dialog's queued sentence collided with the existing `.note` rule (amber left bar: amber is Needs-Input only); renamed `.restart-note`.

design: `features/restartplan.ts` + `features/restartnotice.ts` follow `batchplan.ts`/`connectionversion.ts` (pure decision beside the one controller). Precedent grep: `rg "sessionStorage|safeSessionStorage" web/src` -> `features/updaterestart.ts` (readJson/writeJson over `safeSessionStorage()`, storage injected) reused as is; `rg "placeAnchored" web/src` -> `render/menu.ts`, `render/grouppopover.ts`, reused for the panel placement; `rg "semver|compareVersion" web/src` found nothing, so `compareVersions` is a small local function in restartnotice.ts.
design: `features/restart.ts` is a controller; it does not import a sibling controller. `connection.ts` receives its label and toggle through `ConnectionDeps` (`restartNoticeLabel`, `toggleRestartPanel`) the way it receives `restartBanner` from `updaterestart.ts`, and remains the readout's single writer. `actions` is passed as `{ showError }` (structural). It imports the pure `batchReport` from `groupscopy.ts` as `actions.ts` does, for the one generic partial-batch phrase.
design: `render/restartpanel.ts` / `render/restartdialog.ts` own the view-model types (`RestartPanelModel`, `RestartRow`, `RestartDialogModel`) so `render/` imports nothing from `features/` (the `ClaudeVersionDescription` precedent in `masthead.ts`).
design: the `claudeCode` app event is emitted by `connection.ts` (it already receives hello and the push), so `wsapp.ts` is untouched; the installed version thus has two readers fed by one emit.
design: state owners: `installed`, `ignoredInstalled`, `panelOpen`, `confirmIds` live in `initRestart`'s closure; the readout's last-drawn key lives in `initConnection`'s closure; the current shape of the readout (plain/notice) is read from the DOM by `renderNotice`.
design: size warnings — none on the touched web files (`make size-warn` lists no hit for them).

doc-delta: `docs/features/*/spec.md` globs must own the new files or `make check-kb` fails (it currently reports 9 unowned: the 5 web files `web/src/features/restart{,notice,plan}.ts` and `web/src/render/restart{panel,dialog}.ts`, plus 2 daemon files and 2 E2E files); suggest `web/src/features/restart*.ts` and `web/src/render/restart*.ts` on the actions spec.
doc-delta: `web/src/features/CLAUDE.md`'s list of pure decision modules lacks `restartplan.ts`, `restartnotice.ts`, and `render/CLAUDE.md`'s Owns lacks `restartpanel.ts`, `restartdialog.ts`.
doc-delta: the connection spec's readout width and the ADR `connection-claude-version-readout-short-unknown-fixed-width` now hold at 18ch (not 17ch), with the warning glyph hanging outside the box in the notice shape.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` both fail on sanctioned test files only: `Session` gained two required keys, so every `Session` literal in test code lacks them. Files: `src/api/launch.test.ts`, `src/api/sessions.test.ts`, `src/features/actionscopy.test.ts`, `src/render/{dead,mainhead,sessions,tiles}.test.ts`, `src/sessions/{card,live,sort,store}.test.ts`, `src/ws.test.ts`, `src/sessions/testfixtures.ts` (add `claudeVersion: null, restartPending: false` to `makeSession` and the private copies), plus `src/protocol/session.test.ts` fixtures (`validSession`; 68 vitest failures are all the new required keys). Non-test code compiles (`tsc` reports no non-test file); `npm run -s lint` is clean; `vite build` succeeds. Existing tests to extend: `connectionversion.test.ts`, `masthead.test.ts` (notice shape), `batch.test.ts`.
**E2E smoke**: `npx playwright test e2e/claude-restart.spec.ts` -> `6 failed, 3 passed` against the bin built from the tree (daemon-impl's uncommitted code included). Passing: Ignore from the keyboard (E3), Ignore with a pending session, the keyboard journey. The six failing ones reach and pass everything on my side (readout button text, panel, dialog sections, rows, confirm label, POST ids, `done`/`queued` result) and fail afterwards on the daemon: `expectRestartedInPlace` times out (`not alive yet` — the row is not alive again after a `done` report; the daemon log for the daemon-restart test shows `queued restart failed error="session directory no longer exists"`), or `tmux ... no server running` in `paneId`. Not a web defect; daemon-impl/validate to look. This run used a temporary local patch of the helper below (reverted, not committed).
**Spec locator mismatch for validate**: `web/e2e/helpers/claude-restart.ts` `dialogSection` is `dialog.locator("details").filter({ has: dialog.locator("summary", { hasText: label }) })`; the inner locator is chained from the dialog's role locator, and `has` is matched relative to each `details`, so it never matches (every test using it fails at `toBeVisible`/`rowOf`). It should be `has: dialog.page().locator("summary", { hasText: label })`. With only that change all my-side assertions pass.
Other guesses held: panel found as the nearest ancestor of the head containing "Restart" (the head is a direct child of `#restart-panel`); count row = label span + count span in one `li`; dialog row = title span + reason span in one `li`; dialog sections are `details open` with a `summary`.
Render tests: the three fixtures (`claude-restart`, `-queued`, `-down`) were regenerated locally to check R1-R7 by eye and by measurement and then reverted; `claude-restart-down` opens connected in the harness (the render test has to drop the socket to see the disabled button).

## Fix Attempt

None.

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: browser Minor 1 (glyph overlaps Settings), browser Minor 2 (Ignore drops focus to body), maintainability Major 2 (duplicate `setText`), Major 3 (duplicate background-task wording).

**Changes made**:
- `web/src/style.css` `.claude-notice ~ .version-warn`: margin 0 and `font-size: 0.9em`, so the glyph's box fits the 8px masthead gap. The readout box rule is untouched. Repro measured on the real masthead markup and stylesheet at 1280x900 (notice + warning): before glyph 1093.31-1100.72 vs Settings 1018.53-1096.72 (3.41px overlap, `elementFromPoint` at the glyph's left edge returned `version-warn`); after glyph 1098.05-1104.72, 1.33px clear of Settings. Readout box 1104.72-1242 (137.28px) in plain, plain+warning, notice and notice+warning, identical before and after; the plain-shape glyph stays 1234.59-1242 (its rule is not changed).
- `web/src/features/restart.ts` `ignore()`: `closePanel(false)`, `app.render()`, then focus the notice button if the render kept it, else `#settings-button`. Repro: scratch E2E (deleted after) behind session, open panel, click Ignore, notice gone: `document.activeElement` = `{"isBody":false,"id":"settings-button","tag":"BUTTON"}`.
- `web/src/render/restartpanel.ts`: imports `setText` from `../dom`, private copy deleted (`rg 'function setText' web/src` now only `dom.ts`).
- `web/src/sessions/card.ts`: new exported `backgroundTaskCount(n)` owns the "1 background task" / "N background tasks" wording; `backgroundLine` calls it. `web/src/features/restartplan.ts`: `backgroundTaskReason` deleted, `restartReason` uses `` `idle · ${backgroundTaskCount(n)}` ``.

Blast radius: `rg backgroundLine|backgroundTaskCount` consumers are the card line and the restart reason only; output strings unchanged (3140 Vitest pass). `.claude-notice ~ .version-warn` has one consumer, the masthead glyph in the notice shape (`render/masthead.ts` `buildWarningGlyph`).

**Decisions**:
- design: Ignore's focus target when no notice remains is `#settings-button`, its masthead neighbour, a deliberate stable target; precedent `rg 'closePanel\(true\)'` restore-to-notice-button is kept for Escape and toggle, where the button persists.
- design: `backgroundTaskCount` lives in `sessions/card.ts` (the existing owner of card strings, already imported by `restartplan.ts` for `displayTitle`), not a new module.
- Glyph font-size 0.9em in the notice shape only: the gap is 8px and the glyph is 7.41px at full size, so margin 0 alone left 0.59px; shrinking gives 1.33px.

**Handoff**

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0; `npm run -s lint` exit 0; `make check-kb` passes; `make size-warn` shows no new hit on touched files.
**E2E smoke**: `npx playwright test e2e/claude-restart.spec.ts` 9 passed; `-c playwright.render.config.ts render/restart.spec.ts` 14 passed.
No test files broken.
