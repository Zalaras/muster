# Web Implementation: file-drop-fix

**Plan**: file-drop-fix
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/terminal/drop.ts` | created | Pure module: `escapePath` (REQ-4), `MAX_DROP_BYTES` (REQ-7), `classifyDrop` (REQ-2/REQ-10), `locatingText`/`noticeForFailure` (REQ-6, Testable UI Elements strings). No DOM — Vitest-testable per conventions. |
| `web/src/api.ts` | modified | Added `locateDroppedFile(sessionId, file)` posting `multipart/form-data` to `POST /api/sessions/{id}/locate` (§3.14); extended `ApiErrorBody` with optional `paths?: string[]` and `parseApiError` to carry it through for the `409 ambiguous` case. |
| `web/src/terminal/pane.ts` | modified | `TerminalSurface` gains: the `.terminal-notice` element (mounted alongside `.terminal-overlay`); `dragover`/`dragleave`/`drop` listeners on `root` (installed unconditionally, even for a dead-session surface, which only ever prevents default — REQ-8); `pasteText(text): boolean` (false unless `term` exists and the socket is `OPEN` — W8); `showNotice(text \| null)` with a 5s auto-hide timer cleared on dispose; the sequential locate→paste loop (`handleDrop`/`locateAndPasteOne`) and `classifyApiFailure` mapping a `locateDroppedFile` error code to a `terminal/drop.ts` failure kind. |
| `web/src/render/dragreorder.ts` | modified | `DRAG_MIME` renamed from `"text/plain"` to `"application/x-muster-drag-id"` and exported (was module-private). See Decisions — this is the fix for edge case 1/INV-3. |
| `web/src/render/dropguard.ts` | created | `installDropGuard(doc)`: document-level `dragover`/`drop` listeners that only act when `event.defaultPrevented` is still false, setting `dropEffect = "none"` on `dragover` (REQ-1/REQ-9/W9). |
| `web/src/main.ts` | modified | One `installDropGuard(document)` call at startup, next to the other one-time drag-wiring calls. |
| `web/src/style.css` | modified | `.terminal-notice` (bottom strip, `--scrim`/`--fg`/`--mono` 11px, `[hidden]` companion rule) and `.terminal-surface.drop-target` (REQ-12, same neutral `--line-control` outline as `.tile.drop-target`/`.card.drop-target`). |

## Decisions

- **`DRAG_MIME` had to change value, not just visibility.** The plan's edge case 1 says
  "export `DRAG_MIME` from `render/dragreorder.ts`, or check for the absence of
  `Files`/`text/plain`" to let a terminal surface's `dragover`/`drop` tell an internal
  tile/rail reorder drag apart from a genuine foreign drop. Read literally, `dragreorder.ts`'s
  existing `DRAG_MIME` constant was already `"text/plain"` (`grep -n "text/plain\|DRAG_MIME"
  web/src/render/dragreorder.ts` → line 42 `const DRAG_MIME = "text/plain";`), the exact
  same MIME a real dragged-text selection (or the E2E `dropText` helper's
  `dt.setData("text/plain", t)`) also carries — `dataTransfer.types` is
  indistinguishable between the two cases during `dragover` (values aren't readable then,
  only types), so checking for the constant's *presence* only works if its value is
  unique. I renamed it to `"application/x-muster-drag-id"` and exported it. Verified safe:
  `grep -rn "text/plain\|DRAG_MIME" web/src web/e2e --include="*.ts"` (excluding
  drop-fix's own new files) showed only the `setData` call and the `const` itself — nothing
  reads the value under that MIME (the reorder drop handler resolves the dragged id from
  its own `draggingId` module state, not `dataTransfer.getData`), and
  `web/src/render/tiledrag.test.ts`'s `fakeDataTransfer()` stub only asserts `setData` was
  *called*, never with what MIME string. `npm test` (653/653) and `make contrast` both
  pass after the change; the daemon-facing rail/tile reorder E2E specs
  (`rail-order.spec.ts`, `views.spec.ts`) are unaffected by web-src changes and are this
  plan's own designated regression pin (not re-authored here).
- **The dead-session half of REQ-8 needs no code in `pane.ts` beyond what's already there.**
  `main.ts`'s `aliveOnly()` filter means `TerminalSurface` is only ever constructed for a
  live session — the actual dead-session UI (`#dead-surface` / a tile's mounted
  dead-surface clone) is `render/dead.ts`'s component, which this plan's Affected Files
  section does not list as changed. Since that component installs no drop/dragover
  listeners of its own, a drop on it is left entirely to `installDropGuard`'s document-level
  catch-all: no notice element exists there (satisfying "no notice element inside the dead
  surface at all, not merely a hidden one"), no request is ever triggered, and navigation
  is prevented. `TerminalSurface`'s own pre-existing `!session.alive` branch (sets the
  "ended" overlay and returns before creating xterm) still gets the drop handlers
  installed per the plan's literal wording ("Constructing for a dead session installs the
  drop handlers too, but they only prevent default") — implemented via the `!this.term`
  guard inside `installDropHandlers` — even though tracing `main.ts`'s render path shows
  this branch is not reachable from the live app today; it's pre-existing defensive code
  I extended consistently rather than special-cased around.
- **`noticeForFailure`'s `not_connected` case ignores its `name` parameter.** The plan's
  own Testable UI Elements text for it (`Pane isn't connected — nothing pasted`) never
  interpolates a filename, but the function signature `noticeForFailure(name, failure)` is
  specified in Affected Files with a single shape for both parameters — kept it uniform
  (callers in `pane.ts` pass `""` for the text-drop path, where there's no dropped file to
  name) rather than special-casing the signature for one variant.
- REQ-12 (drop-target styling / `dropEffect: copy`) is Nice-to-Have and untested by any
  acceptance ID — implemented per the UI spec anyway (reuses the existing `--line-control`
  drop-target language) since it cost nothing extra once the dragover/dragleave handlers
  existed.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` (`make web-build`) exit 0.
`make web-test` (653/653) and `make contrast` (0 failures, all 3 themes) also pass.

No test files needed changes — `web/e2e/drop.spec.ts` and `web/e2e/helpers/{terminal,dropfiles}.ts`
were already authored by e2e-specs against the plan's Testable UI Elements table and the
signatures this implementation matches (`escapePath`, `classifyDrop`, `locatingText`,
`noticeForFailure`, `pasteText`, the exact notice strings). Not run here — daemon-impl's
`/api/sessions/{id}/locate` endpoint is a sibling in-flight change on this branch; E2E
execution is web-tests'/e2e-validate's stage once both sides land.

## Fix Attempt 1

**Failures addressed**: web-tests verdict `implementation-bug` — `classifyApiFailure` in
`web/src/terminal/pane.ts` was a private, unexported pure function, unreachable from any
`.test.ts` file without a full DOM/xterm/socket harness around `TerminalSurface`.

**Changes made**: moved `classifyApiFailure(error: ApiErrorBody): LocateFailure` verbatim
(same body: `not_located` / `ambiguous` with `error.paths?.length ?? 0` / `too_large` /
default `"other"`) from `web/src/terminal/pane.ts` into `web/src/terminal/drop.ts`,
alongside `LocateFailure`/`noticeForFailure` (its natural home, per web-tests' own
suggestion and the `terminal/overlay.ts` precedent), and exported it. `drop.ts` gained a
single type-only import, `import type { ApiErrorBody } from "../api";` — still no DOM/fetch
code, so the module stays pure and Vitest-testable. `pane.ts` now imports
`classifyApiFailure` from `./drop` instead of defining it, and dropped its now-unused
`ApiErrorBody`/`LocateFailure` imports from `../api`/`./drop`'s type re-export (`grep -n
"ApiErrorBody\|LocateFailure\|classifyApiFailure" web/src/terminal/pane.ts` after the edit
shows only the import line and the one call site). No behaviour change — pure move.

**Gates**: `make web-build` → `tsc --noEmit && vite build` exits 0, builds
`internal/webui/assets/assets/index-VsUDH8og.js`. `make web-test` → 24 files, 699/699
passing (same count as before this fix — no new tests were added here; web-tests owns
adding coverage for the now-exported function in its own pass).
