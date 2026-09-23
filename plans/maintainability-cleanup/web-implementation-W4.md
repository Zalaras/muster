# Web Implementation: Maintainability Cleanup — Unit W4

**Plan**: maintainability-cleanup
**Mode**: initial
**Unit**: W4 composition roots (d-C1/B6)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/wsapp.ts` | created | `coreWsHandlers(app, connection)` — the WS→App mapping (store replace/upsert, `prefs`+`snapshot` emits, a render after each) both `main.ts` and `doc.ts` used to hand-copy. `doc.ts` registers it verbatim; `main.ts` spreads its own dashboard-only handlers (`onSessionRemoved`, `onUsage`, `onShellActivity`, `onUpdate`, `onProtocolMismatch`) over it. |
| `web/src/ws.ts` | edited | Added `wsUrl(path)`, the one `ws(s)://<host>/<path>` builder — replaces the copy in `main.ts`, the copy in `doc.ts`, and the third copy in `terminal/pane.ts:218` (Seed B6). |
| `web/src/main.ts` | edited | Composition-root cleanup: (1) removed the inline `app.onRender` that dispatched to `focus.renderView`/`tiles.renderView` — that render-phase logic now lives in `initViews` (see `features/views.ts` below), called as `initViews(app, { focus, tiles })`; (2) removed the hand-written `wsProtocol`/`wsUrl` lines and the 13 handler bodies, replaced with `wsUrl("/ws")` and `{ ...coreWsHandlers(app, connection), <4 dashboard-only handlers> }`. |
| `web/src/doc.ts` | edited | (1) `readQuery()` moved to `features/reader.ts` as `parseStandaloneQuery` (exported, pure); (2) the hand-built `<p role="status">unknown session</p>` moved to `render/reader.ts` as `renderUnknownSessionNotice(host)`; (3) the 8-handler `WsClient` literal replaced with `coreWsHandlers(app, connection)`, registered unchanged; (4) rewrote the stale header comment, which existed only to record what was hand-copied from `main.ts` — now records what the shared mapping does and doesn't cover instead. |
| `web/src/features/reader.ts` | edited | Added `parseStandaloneQuery(search): StandaloneTarget \| null`, colocated with `StandaloneTarget`. Moved the private `UNKNOWN_SESSION_TEXT` constant out to `reader/notice.ts` (see below) and imports it from there instead. |
| `web/src/reader/notice.ts` | edited | Added `UNKNOWN_SESSION_TEXT`, exported alongside the existing `UNREACHABLE_TEXT` — the one owner for a string two different call sites (a failed listing fetch, and `doc.ts`'s own unparsable query) both need. |
| `web/src/render/reader.ts` | edited | Added `renderUnknownSessionNotice(host)` — the DOM half of `doc.ts`'s placeholder, now living beside the reader's other DOM builders instead of inline in the entry. |
| `web/src/features/views.ts` | edited | `initViews` now takes `{ focus: ViewRenderer; tiles: ViewRenderer }` and its own render-phase registration calls `deps.focus.renderView(frame)`/`deps.tiles.renderView(frame)` after the switcher/density/hidden work, merging what used to be `main.ts`'s phases 10 and 11 into one registration inside the feature that owns `app.state.view`. |
| `web/src/terminal/pane.ts` | edited | `attach()`'s socket URL now goes through `wsUrl(`/ws/${path}/${this.sessionId}`)` from `../ws` instead of its own `wsProtocol` ternary. |

## Decisions

- design: `coreWsHandlers` lives in a new top-level `wsapp.ts`, not in `app.ts` or `ws.ts`. `app.ts` is documented as "Pure enough to unit-test (no DOM)" and has never imported `ws.ts`'s types — folding WS-handler bodies into it would give the generic cross-feature seam a transport-specific dependency. `ws.ts` documents itself as owning "connecting, reconnecting with backoff, and dispatching parsed messages to handlers", deliberately decoupled from `App` so its own tests drive it with plain handler mocks (`rg -n "import.*from \"\.\./app\"" web/src/ws.test.ts` → no match) — adding `App`-aware handler bodies there would break that. A third, separate module matches how `features/connection.ts` already keeps `createConnectionState` (DOM-free) separate from `initConnection` (DOM-full) for the same reason: two things that change for different reasons.
- design: `wsUrl` lives in `ws.ts`, not `wsapp.ts` — it has zero dependency on `App` and is exactly the kind of thing `terminal/pane.ts` (which has no reason to import an App-aware module) needs to reuse without pulling in the WS→App mapping too. `pane.ts` already imports root-level modules (`../render/dragreorder`, `../api/terminal`), so a `../ws` import is not a new kind of edge.
- design: the merged `onHello`/`connected` interface (`WsAppConnection`) doesn't require any change to `ConnectionState`'s existing `connected(): void` signature — verified via `npx tsc --noEmit` (0 errors) that TS's function-type subtyping (fewer parameters is a subtype of more) accepts passing `hello.claudeCode` at the `WsAppConnection.connected(claudeCode)` call site even though the concrete `ConnectionState.connected` implementation ignores the argument at runtime.
- design: `initViews`'s render phase absorbs what was `main.ts`'s standalone phase-11 `app.onRender` — `rg -n "renderView" web/src/features/focus.ts web/src/features/tiles.ts` shows both `FocusHandle`/`TilesHandle` already export `renderView(frame: RenderFrame): void`, so no new interface was needed on their side; `views.ts` is the feature that owns `app.state.view` (its own header comment already says so), making it the natural place to decide who renders into it, rather than a composition root doing that dispatch itself.
- design: `parseStandaloneQuery` lives in `features/reader.ts` beside `StandaloneTarget` rather than in `reader/` (pure-logic dir) — it's small and used by exactly one caller (`doc.ts`), and colocating it with the type it constructs matches how `StandaloneTarget` itself was already placed in `features/reader.ts`, not `reader/`.
- design: `renderUnknownSessionNotice` lives in `render/reader.ts` even though it isn't part of the `#reader-template` component the rest of that file builds — `render/` is documented as "the DOM half of every view: ... the reader"; there's no dedicated "pop-out shell" render module, and adding a whole new file for one 6-line builder seemed like more indirection than the plan's Critical 1 asked for. Flagged here rather than silently placed.
- `UNKNOWN_SESSION_TEXT` reuse: the pop-out's "no valid `?session=`" case and `features/reader.ts`'s "daemon said `unknown_session`" case are different failure paths that happen to want the same word: moved to `reader/notice.ts` (already the pure-logic home for `UNREACHABLE_TEXT`, the sibling "no data yet" string) rather than duplicating a second string literal.
- Every REQ/finding this unit covers (d-C1, Seed B6 including the third `pane.ts:218` URL copy) is addressed above; nothing was left deliberately undone.

## Handoff

**Build status**: `npx tsc --noEmit` exits 0; `npm run build` exits 0.

- `npx tsc --noEmit` — clean, no output.
- `make web-lint` — `Checked 217 files in 185ms. No fixes applied.`
- `make web-test` — `Test Files 60 passed (60)`, `Tests 1843 passed (1843)`. No broken tests; nothing needed re-pointing (no test imported `main.ts`/`doc.ts` internals, and `focus.ts`/`tiles.ts`'s `renderView` signatures were already `RenderFrame`-typed).
- `make web-build` — succeeded (`✓ built in 1.81s`); the chunk-size warnings are the pre-existing mermaid/katex/cytoscape bundle notices, unrelated to this unit.
- `make check-kb` — `kb: 425 records, 23 features, 1 problem(s)`, the one problem being `internal/server/respond.go` (owned by no feature) — a daemon-track file from a different unit in this run, not touched here. `web/src/wsapp.ts` is already covered by `docs/features/connection/spec.md`'s existing `web/src/ws*.ts` glob (verified: `go run ./tools/kb for web/src/wsapp.ts` resolves to feature `connection`), so no spec glob edit or `make gen-kb` change was needed (`gen-kb` reported "all generated files fresh").
- `python3 .claude/skills/orchestrate/scripts/dead-refs.py` — `351 references checked, 0 missing`.
- Size warnings (`make size-warn`, never a gate): `web/src/features/reader.ts` (621 lines, was already 611/over-threshold before this unit — `parseStandaloneQuery` added ~10 lines) and `web/src/render/reader.ts` (542 lines, was already 531/over-threshold — `renderUnknownSessionNotice` added ~11 lines). Both were already past the 500-line filelen threshold before this unit touched them; splitting either is out of scope for W4 (composition roots) and belongs to W5/W6's later render-layer/helper units per the plan's unit list, not repeated here.

No test files needed changes. No broken tests to report.
