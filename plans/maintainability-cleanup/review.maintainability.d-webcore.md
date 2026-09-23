# Maintainability review: Maintainability cleanup (web core: root, sessions/, reader/)

**Plan**: maintainability-cleanup
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 17580 words (budget 8000) — rules 1874 · features 6069 · diagrams 3904 · decisions 5300 · proposed 0 · facts 71 · lessons 354 · runbooks 2 (`--features connection,reader`; over budget, WARN only)
**Scope**: 27 non-test files. Scope line: `web/src/*.ts` (main, doc, app, ws, protocol, api, dom, shortcuts, theme), `web/src/sessions/` (8), `web/src/reader/` (10). This is a standalone read with no diff and no Decisions logs, so no `design:` checks were run.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| web/src/main.ts | doc.ts, app.ts, features/connection.ts | n/a | — | Critical 1 |
| web/src/doc.ts | main.ts, app.ts, index.html, doc.html | n/a | — | Critical 1 |
| web/src/app.ts | main.ts, render/masthead.ts, features/{rail,views,connection}.ts | n/a | — | Minor 1; Notes (B5) |
| web/src/ws.ts | protocol.ts, main.ts, doc.ts | n/a | — | Minor 3, Note 5 |
| web/src/protocol.ts | api.ts, theme.ts, features/{rail,settings}.ts | n/a | filelen 967 (split settled) | Major 1, Major 3, Minor 1 |
| web/src/api.ts | protocol.ts, features/*.ts callers, render/launchrestore.ts | n/a | filelen 774 (split settled) | Major 3, Minor 2 (+B1, B2) |
| web/src/dom.ts | render/{sessions,tiles}.ts | n/a | — | Note 6 (+B4 requireTemplate) |
| web/src/shortcuts.ts | features/{shortcuts,launch}.ts | n/a | — | Minor 3 |
| web/src/theme.ts | features/theme.ts, reader/memory.ts, index.html, doc.html | n/a | — | Major 1, Minor 3, Minor 5 |
| web/src/sessions/store.ts | app.ts, other sessions/* | n/a | — | pass |
| web/src/sessions/card.ts | reader/paths.ts, render/sessions.ts | n/a | — | Minor 1 (+B4 basename) |
| web/src/sessions/context.ts | format.ts, render/context.ts | n/a | — | pass |
| web/src/sessions/format.ts | reader/freshness.ts, render/{update,dead,tiles,mainhead}.ts, features/issue.ts | n/a | — | Major 4, Note 7 (+B4 pad2) |
| web/src/sessions/live.ts | railorder.ts, render/dragreorder.ts, features/tiles.ts | n/a | — | Major 2 |
| web/src/sessions/railorder.ts | live.ts, sort.ts, features/rail.ts | n/a | — | Major 2 |
| web/src/sessions/rename.ts | render/rename.ts | n/a | — | pass |
| web/src/sessions/sort.ts | railorder.ts, format.ts | n/a | — | Note 8 |
| web/src/reader/freshness.ts | sessions/format.ts | n/a | — | Major 4 |
| web/src/reader/frontmatter.ts | markdown.ts, slug.ts | n/a | — | pass |
| web/src/reader/markdown.ts | render/reader.ts, frontmatter.ts | n/a | — | Minor 4 |
| web/src/reader/memory.ts | theme.ts | n/a | — | Major 3, Minor 5 |
| web/src/reader/mermaid.ts | render/mermaid.ts, zoom.ts | n/a | — | pass |
| web/src/reader/notice.ts | render/masthead.ts, paths.ts | n/a | — | Note 2 (+B5) |
| web/src/reader/paths.ts | sessions/card.ts | n/a | — | +B4 basename |
| web/src/reader/slug.ts | markdown.ts | n/a | — | pass |
| web/src/reader/tree.ts | render/reader.ts | n/a | — | pass |
| web/src/reader/zoom.ts | render/diagramdialog.ts | n/a | — | pass |

## Seed check

- **B1 confirmed, and the seed undercounts it.** `rg -c "errorBody = await res.json" api.ts` gives 8. `rg -c 'credentials: "same-origin"' api.ts` gives 21. There are 8 `putPrefs(...).then(console.error)` sites, not 7: features/rail.ts:35,42, usage.ts:43, views.ts:36,43 and settings.ts:146,152,161. The same `failed: ${result.error.code} ${result.error.message}` log idiom appears 19 times across 8 feature files (`rg -c`), so the fix should cover every API caller, not only `putPrefs`.
- **B2 confirmed.** api.ts:56-71 holds `PERMISSION_MODES`/`permissionModeToCheck`. Its callers are features/launch.ts:17 and render/launchrestore.ts:6, and the second is also the reason a `render/`→`api` edge exists.
- **B3 confirmed, and the seed undercounts it.** `isRecord` appears at protocol.ts:365 and api.ts:103. There are also two inline copies: theme.ts:66-67 (`typeof parsed !== "object" || parsed === null` then `as Record<string, unknown>`) and reader/memory.ts:29, 41-42. Major 3 covers these.
- **B4 confirmed.** All six are duplicated:
  - `isClaudeFamily`: theme.ts:45 and protocol.ts:626.
  - `isRailActivity`: protocol.ts:502 and features/settings.ts:11.
  - `isRailDensity`: protocol.ts:498 and features/rail.ts:15.
  - `requireTemplate`: render/sessions.ts:27 and render/tiles.ts:24. Its natural home is dom.ts, which is "Element-lookup helpers".
  - `basename`: sessions/card.ts:84 and reader/paths.ts:6. The two already behave differently: card.ts strips trailing slashes, but paths.ts gives `"/a/b/"` back unchanged.
  - `pad2`: sessions/format.ts:6 and features/issue.ts:76.

  The root cause is Major 1.
- **B5 confirmed.** `ConnectionStatus` lives at render/masthead.ts:17 and is imported by app.ts:5, reader/notice.ts:3, features/connection.ts:12 and features/reader.ts:23. `DRAG_MIME` lives at render/dragreorder.ts:51 and is imported by terminal/pane.ts:12.
- **B6 confirmed, and it is worse than duplication.** The WS URL (main.ts:98-99 = doc.ts:69-70) is copied, and so are the handler bodies: onSnapshot, onSessionUpsert, onPrefs, onClaudeTheme and onDocChanged (main.ts:104-127 ≈ doc.ts:77-98). Both are also logic living inside a composition root. See Critical 1.

## Issues

### Critical
1. **[web-impl] The two composition roots contain handlers, a render phase, DOM building and parsing, so they are not registration-only** — `web/src/main.ts:75-78`, `web/src/main.ts:98-138`, `web/src/doc.ts:30-48`, `web/src/doc.ts:66-102`.
   - **Rule broken:** kb:adr/process-composition-roots-registration-only and `docs/conventions.md` § Composition roots, bullet 1: "no DOM lookups, listeners, state or handlers of their own".
   - **main.ts:** it defines 13 `WsClient` handler bodies that write the store (`app.store.replaceAll`/`upsert`), emit events and render. It also registers its own render phase that branches on `app.state.view` (main.ts:75-78).
   - **doc.ts:** it parses the query string (`readQuery`, doc.ts:30-35), builds a `<p role="status">` by hand (doc.ts:45-48), and repeats main.ts's handler bodies line for line. Its 22-line header (doc.ts:7-22) exists only to record which of main.ts's handlers were copied and which were dropped. That is the cost of having two copies.
   - **A fix must make true:**
     - The WS→app mapping is defined once, outside both entries. That covers store replace/upsert, the snapshot's `prefs` + `snapshot` emits, a render after each, and the `ws(s)://host/ws` URL.
     - Each entry wires the client in one registration line, and the pop-out differs from the dashboard only in the handlers it declares it leaves out.
     - The Focus/Tiles view-phase split and the pop-out's query parse and "unknown session" notice live in a feature or render module, not in an entry.

### Major
1. **[web-impl] Every wire enum lists its values twice or more: once in a type-only union, again in each hand-written guard. This is why B4's guards were copied.**
   - **Where:** `web/src/protocol.ts:494-504`, `web/src/protocol.ts:573-587`, `web/src/protocol.ts:626-628`, `web/src/protocol.ts:637-646`, `web/src/theme.ts:45-47`, `web/src/app.ts:21`, `web/src/api.ts:84`.
   - **Rule broken:** § Design, "One owner per concept. … Two places that must agree will not". It already has happened: `rg` shows `isRailDensity` ×2, `isRailActivity` ×2 and `isClaudeFamily` ×2 (Seed check B4).
   - **The view union:** `"focus" | "tiles"` is spelled out 6 times: protocol.ts:195, app.ts:21, api.ts:84, features/views.ts:35 and render/masthead.ts:64,79. app.ts's exported `View` has no importer.
   - **The pattern to copy:** theme.ts:7-8 already has it. `THEMES` is a const array, `ThemeName` is derived from it, and one guard serves every caller.
   - **A fix must make true:** each wire enum (view, density, rail sort/density/activity, Claude family, session state, update phase/install kind) lists its members once. Its type and its one guard both derive from that list, and every other module imports the guard instead of re-declaring it.
2. **[web-impl] The rail and the Tiles grid each have their own copy of the insert-and-shift reorder** — `web/src/sessions/railorder.ts:40-61` (`moveCard`) and `web/src/sessions/live.ts:116-131` (`moveTile`).
   - **Rule broken:** § Design, "Reuse before add".
   - **Evidence:** both functions read the target index from the original array, filter out the dragged id, then `splice(targetIndex, 0, …)` (`rg -n "splice\(targetIndex"` → railorder.ts:53 and live.ts:129).
   - railorder.ts's own doc comment (lines 25-31) says it follows "the same convention, and the same 'read the index from the ORIGINAL array' requirement" as `moveTile`, and points readers to `moveTile`'s comment for the reason. In other words, it describes itself as a copy.
   - The DOM half of the two drags has already been merged: render/dragreorder.ts:1-7 is the "Generalised drag-to-reorder wiring" for both callers. The math half was left as two copies.
   - **A fix must make true:** the reorder rule (self-drop and absent-id no-ops, original-index insertion) exists once. `moveCard` adds only its `pinnedCount` derivation on top of it.
3. **[web-impl] The decoder building blocks are copied throughout protocol.ts and api.ts. The settled directory split will multiply the copies unless they get one home first.**
   - **Where:** `web/src/protocol.ts:420-429`, `protocol.ts:826-845`, `api.ts:156-165`, `api.ts:185-191`, `api.ts:661-672`, `api.ts:734-740`, plus the inline record checks at `web/src/theme.ts:66-67` and `web/src/reader/memory.ts:29,41-42`.
   - **Rule broken:** § Design, "Reuse before add".
   - **List parsing:** the "array of X or null" loop is hand-written 7 times (`rg -n "if \(!Array.isArray" protocol.ts api.ts` → protocol.ts:421, 827, 838 and api.ts:157, 185, 664, 734). The loops at protocol.ts:420 and :826, and api.ts:156 and :661, are character-for-character the same apart from names.
   - **Nullable sub-objects:** `raw === null ? null : parseX(raw)` followed by `if (raw !== null && x === null) return null` appears 10 times (`rg -c` → protocol.ts 9, api.ts 1). It accounts for much of the complexity the two `biome-ignore`s at protocol.ts:440 and :729 have to excuse.
   - **Record checks:** `isRecord` itself has two copies plus two inline copies (Seed check B3).
   - **A fix must make true:** the record, list-of and nullable-of decoders are defined in one module that the protocol and API decoders, theme.ts and reader/memory.ts all import. No decoder spells out one of those shapes inline.
4. **[web-impl] The relative-age helpers have four names for one idea, and one of those names is already used on the wrong kind of value** — `web/src/sessions/format.ts:34-67`.
   - **The names:** `formatEndedAge` (46-48) is an alias of `formatAge` with no logic of its own. `formatEndedAgo` (65-67) is `agoSuffix(formatAge(…))`.
   - **How callers use them:** reader/freshness.ts:15 and render/update.ts:63 compose `agoSuffix(formatAge(…))` by hand instead of calling the helper. render/dead.ts:99 calls `formatEndedAgo(pane.capturedAt, now)`, which is a capture time, not an ended time.
   - **Rule broken:** § Design, "Match the siblings … A reader who knows one module should know them all". A newcomer reads `formatEndedAgo` as specific to ended sessions and `formatEndedAge` as different from `formatAge`, and neither reading is true. The 9-line comment at format.ts:50-58 exists to explain the confusion.
   - **A fix must make true:** there is one "age" function and one "age ago" function, named for what they do rather than for their first caller. Every "<age> ago" string in the dashboard goes through the second.

### Minor
1. **[web-impl] Pref defaults are owned in three places** — `web/src/app.ts:84-90`, `web/src/protocol.ts:533-559` (`parsePrefsField` fallbacks) and `web/src/sessions/card.ts:178-180`.
   - **Evidence:** `"manual"`, `"comfortable"` and `"turn"` appear as literal defaults in app.ts and protocol.ts. `RailActivity = "turn"` is repeated as a parameter default at card.ts:180, render/sessions.ts:202,271,338,416,513 and render/tiles.ts:204.
   - card.ts:178-179 says the default exists so "every existing call site … that predates this plan keeps compiling". That is a compatibility shim for callers inside this repo.
   - **Rule broken:** § Design, "One owner per concept".
   - **A fix must make true:** the default value of each pref is stated once. The initial `AppState`, the parser fallbacks and any remaining parameter defaults all read it from there, or the parameter defaults are gone and callers pass the value.
2. **[web-impl] `PrefsRequest` copies `Prefs` field by field** — `web/src/api.ts:83-101` against `web/src/protocol.ts:194-216`.
   - Both list the same 8 fields with the same types and near-identical plan comments, so a new pref has to be added in both places.
   - **Rule broken:** § Design, "One owner per concept".
   - **A fix must make true:** the request type is derived from `Prefs` (every field optional), not listed a second time.
3. **[web-impl][web-tests] Several exports have no production importer.** Each one exists only for a test, or for a feature that does not exist yet:
   - `ws.ts:32,98`: the `onConnected` handler. No entry wires it; only ws.test.ts:176,318 uses it.
   - `ws.ts:86`: `WsClient.stop()`. `rg -n "\.stop\(\)"` finds no caller outside tests.
   - `shortcuts.ts:105-111`: `SHORTCUT_HELP`, "for a future shortcuts-help overlay". It also restates the chords in `BINDINGS` (lines 39-82) by hand, so it is one more place that must agree with the table.
   - `theme.ts:10`: `export type { ClaudeFamily }` re-export. Nothing imports `ClaudeFamily` from theme (`rg` → features/theme.ts:6 imports it from protocol).
   - `theme.ts:52-73`: `readThemeHint`. Only theme.test.ts calls it. The code that actually reads the hint is the inline scripts at index.html:16-26 and doc.html:9-19. Those accept any string for `theme`/`family`, while `readThemeHint` rejects unknown names, so the tested validation is not what runs.

   **Rule broken:** § Design, "seams where a test needs one and nowhere else", and "Reuse before add" (a third, divergent copy of the hint reader).

   **A fix must make true:** each exported value or handler has a production caller, or it is removed together with the tests that only pin it (those test deletions are [web-tests]). The "Mirrors theme.ts's readThemeHint shape" claim in index.html:10 is a doc-truth question for review-work.
4. **[web-impl] reader/markdown.ts builds DOM elements inside the no-DOM `reader/` directory** — `web/src/reader/markdown.ts:55-90` (`buildFrontmatterNode`/`Table`/`Fallback`).
   - `reader/CLAUDE.md` says: "pure reader logic, no DOM … Every module here is Vitest-testable with no DOM … except `markdown.ts`, whose DOMPurify default export needs a real `window`". That exception is about the sanitizer needing a window. It does not cover building elements.
   - § Composition roots, bullet 3: "`web/src/render/` holds pure DOM builders".
   - **A fix must make true:** the frontmatter element builders live with the other reader DOM builders in `render/`, or the directory's invariant states that markdown.ts also owns DOM building.
5. **[web-impl] The two `localStorage` users are shaped differently.**
   - **Different seams:** theme.ts:52,78 takes `Pick<Storage, "getItem">`/`Pick<Storage, "setItem">`, while reader/memory.ts:11-15 declares its own `StorageLike` interface.
   - **Two copies of the read:** each also hand-writes the same guarded read (try `getItem`, try `JSON.parse`, record-check, field guards) at theme.ts:52-73 and memory.ts:36-49.
   - **Rule broken:** § Design, "Match the siblings" and "Reuse before add".
   - **A fix must make true:** there is one storage seam type and one safe read-JSON-from-storage helper, and both modules use them.

### Notes
1. **[note] Size:** api.ts is 774 lines and protocol.ts is 967 (filelen WARN in `size.log`). Splitting both into directories is already settled.
   - About 40% of api.ts is B1's repeated fetch/decode boilerplate (8 empty-body blocks of about 10 lines each, plus 21 `credentials` lines), so the split is not what shrinks it.
   - protocol.ts's two `biome-ignore` reasons (lines 435-440 and 720-729) hold as written. Once Major 3's nullable-of helper exists, though, most of the counted points go away and both suppressions may no longer be needed.
2. **[note] DIAG (review-work's row):** kb:diagram/web-components describes the graph as "acyclic and strictly layered", and the import graph disagrees.
   - reader/notice.ts:3 → render/masthead creates a `reader/`→`render/` edge the diagram does not draw. It forms a cycle with the `render/`→`reader/` edges from render/reader.ts, diagrams.ts and diagramdialog.ts.
   - `render/`↔`terminal/` is drawn in both directions, which is itself a cycle.
   - The `render/ → api` label "snapshot load" covers only render/dead.ts. render/launchrestore.ts (B2) and render/update.ts also import from api.
3. **[note]** Plan-ID and review-history references appear on 204 comment lines across 26 of the 27 in-scope files (REQ-/INV-/W-numbers, "Plan <name>", "review … cycle N", "Major N"). Examples include doc.ts:7-22 and format.ts:50-58. § Comments: "don't narrate history".
4. **[note]** `SessionPlan` (protocol.ts:116, `{path, exists}`) and `ReaderPlan` (api.ts:685, `{path, exists, writtenAt}`), along with their parsers (protocol.ts:711 and api.ts:704), are near-twins. They decode two different wire shapes, so no change is asked. Once Major 3 is done, one could extend the other.
5. **[note]** ws.ts:130-174 dispatches with an if-chain that ends in an implicit snapshot fallthrough. Its sibling protocol.ts:935-962 switches on the same `type` field. The compiler catches a missing case today, but the two dispatchers read differently.
6. **[note]** In dom.ts, `requireElements` (line 9) never requires anything: it returns `[]` when nothing matches, while its sibling `requireElement` (line 3) throws. B4's `requireTemplate` copies belong in this module.
7. **[note]** sessions/format.ts:1 says "Pure time formatters", but the module also holds `GAUGE_WARN_THRESHOLD` (74) and `formatTokens` (78), which sessions/context.ts:8 imports. The header no longer describes the module.
8. **[note]** sessions/sort.ts:87 and :90 spell out the manual comparator `a.railPos - b.railPos || a.id - b.id` twice in the same function.
