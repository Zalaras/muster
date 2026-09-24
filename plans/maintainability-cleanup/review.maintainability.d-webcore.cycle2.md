# Maintainability review: Maintainability cleanup (web core: root, protocol/, api/, sessions/, reader/)

**Plan**: maintainability-cleanup
**Verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 18026 words (budget 8000) — rules 1938 · features 6065 · diagrams 4290 · decisions 5300 · proposed 0 · facts 71 · lessons 354 · runbooks 2 (`--features connection,reader`; over budget, WARN only)
**Scope**: Scope line `web/src/*.ts web/src/protocol web/src/api web/src/sessions web/src/reader`. That is 55 non-test files: 13 root files, 7 protocol/, 9 api/ (including testfakes.ts), 13 sessions/, 10 reader/, plus the two CLAUDE.md files. 50 of them changed against `main`. Decisions read: W1–W5, plus W6b for sessions/usage.ts.

## Cycle-1 findings: status

| Cycle-1 finding | Verdict | Evidence |
|---|---|---|
| Critical 1: composition roots hold handlers, a render phase and DOM building | **partially fixed** | wsapp.ts:25-53 now holds the core mapping and `wsUrl` is defined once (ws.ts:23). The view-phase split has moved to features/views.ts:89-103, `parseStandaloneQuery` to features/reader.ts:60 and the notice to render/reader.ts:29. What remains: main.ts:107-118 still defines three emit-then-render handler bodies (Major 1). doc.ts:28,32-46 still looks up an element, branches, and mounts into the page itself (Minor 1). |
| Major 1: wire enums listed twice | **fixed** (small remainder) | Every enum the finding listed is now a `const` list with a type and a guard derived from it (protocol/prefs.ts:8-24, theme.ts:11-12, session.ts:6-14, update.ts:9-22, hello.ts:11-12). `rg 'function is(RailDensity\|RailActivity\|ClaudeFamily…)'` finds one copy of each, all in protocol/. The `"focus" \| "tiles"` union search returns 0 hits. Three two-value enums were missed (Minor 3). `PERMISSION_MODES` sits outside protocol/ (Minor 2). |
| Major 2: `moveCard`/`moveTile` each copy the reorder rule | **fixed** | sessions/reorder.ts:15-29 `insertAtDragTarget`. railorder.ts:46 and live.ts:137 both call it, and `rg "splice\(targetIndex"` finds only reorder.ts:27. |
| Major 3: decoder building blocks copied | **fixed** | protocol/decode.ts:9-40. `rg "Array.isArray" --glob '!*.test.ts'` finds only decode.ts:10,18 and http.ts:32; the http.ts one degrades rather than rejects, so it is correctly separate. The inline record checks are gone. The module's own header is now false (Minor 12), and the primitive guards live elsewhere (Minor 4). |
| Major 4: four names for one age idea | **fixed** (remainder) | `formatEndedAge`/`formatEndedAgo` are gone. Every "<age> ago" goes through `ageAgo` (render/tiles.ts:294, mainhead.ts:39, dead.ts:80,91, features/updateview.ts:40, reader/freshness.ts:12). `agoSuffix` is still exported, and its comment still tells callers to use it (Minor 7). |
| Minor 1: pref defaults owned in three places | **fixed** | protocol/prefs.ts:62-71 `PREF_DEFAULTS` feeds app.ts:92-96 and every `parsePrefsField` fallback. `rg '= "turn"'` returns 0 hits. The one remaining parameter default reads `PREF_DEFAULTS` (card.ts:206), but its comment still gives a compatibility-shim reason (Minor 10). |
| Minor 2: `PrefsRequest` copies `Prefs` | **fixed** | api/prefs.ts:11 `export type PrefsRequest = Partial<Prefs>`. |
| Minor 3: exports with no production importer | **fixed** (new ones appeared) | `onConnected`, `WsClient.stop()`, `SHORTCUT_HELP`, theme.ts's `ClaudeFamily` re-export and `readThemeHint` are all gone. The same pattern is back in new places (Minor 5, Minor 7). |
| Minor 4: markdown.ts builds DOM | **fixed** | markdown.ts:10-13,47 returns `frontmatter` and builds no elements. The builders are in render/frontmatter.ts, and reader/CLAUDE.md now says so. |
| Minor 5: two storage seam shapes | **partially fixed** | storage.ts:6-51 now has one `StorageLike` plus `readJson`/`writeJson`, used by memory.ts:42,46 and theme.ts:51. But theme.ts:49 still types its parameter as the DOM `Pick<Storage, "setItem">`, and memory.ts:58-64 still wraps `removeItem` in its own try/catch (Minor 6). |
| Seed B1: HTTP boilerplate repeated | **fixed** | api/http.ts is the only `fetch` and the only failure log. `rg -c "errorBody = await res.json"` returns 0. |
| Seed B2: permission rules in api.ts | **fixed** (created a new edge) | Moved to sessions/permission.ts. api/launch.ts:5 now imports from sessions/ (Minor 2). |
| Seed B3: `isRecord` copies | **fixed** | One definition, at decode.ts:9. |
| Seed B4: six duplicated helpers | **fixed** | One definition each: `pad2` at format.ts:8, `basename` at card.ts:106. `requireTemplate` is gone. `isClaudeFamily`, `isRailDensity` and `isRailActivity` are in protocol/. `basename` still has a pass-through re-export (Minor 5). |
| Seed B5: `ConnectionStatus`/`DRAG_MIME` living in render modules | **fixed** | app.ts:24 and dragmime.ts:13. `rg` shows no `render/masthead` or `render/dragreorder` import from reader/ or terminal/. The dragmime.ts comment names the wrong importer (Minor 12). |
| Seed B6: WS URL and handler bodies copied | **mostly fixed** | See Critical 1. |
| Note 1: size | **resolved** | size.log has no WARN on any in-scope file. The only web hits are features/launch.ts, features/reader.ts and render/reader.ts, all outside this scope. Both `biome-ignore`s were re-justified (session.ts:204-209, usage.ts:85-91). |
| Note 2: DIAG | **resolved, new gaps** | Re-derived graph below: acyclic, as the diagram claims. Five edges are undrawn (Note 1). |
| Note 3: plan IDs in comments | **not fixed** | See Minor 11. |
| Note 4: `SessionPlan`/`ReaderPlan` near-twins | unchanged | No change was asked. |
| Note 5: ws.ts if-chain vs protocol switch | unchanged | No change was asked (ws.ts:120-164). |
| Note 6: `requireElements` never requires | **fixed** | dom.ts:16-23 now throws. |
| Note 7: format.ts header out of date | **fixed** | format.ts:1-6. |
| Note 8: comparator spelled twice | **fixed** | sort.ts:80-82 `byRailPos`. |

## Import graph (re-derived, directory granularity, non-test files)

```
api/      -> protocol/, sessions/            <- sessions/ edge undrawn
app.ts    -> protocol/, sessions/
doc.ts    -> app.ts, dom.ts, features/, render/, ws.ts, wsapp.ts   <- render/ undrawn
features/ -> api/, app.ts, dom.ts, protocol/, reader/, render/, sessions/, shortcuts.ts, terminal/, theme.ts
main.ts   -> app.ts, features/, render/, ws.ts, wsapp.ts
reader/   -> app.ts, protocol/, sessions/, storage.ts
render/   -> api/, app.ts, dom.ts, dragmime.ts, protocol/, reader/, sessions/, terminal/, theme.ts  <- dom.ts, theme.ts undrawn
sessions/ -> protocol/
terminal/ -> api/, dragmime.ts, protocol/, ws.ts   <- ws.ts undrawn
theme.ts  -> protocol/, storage.ts
ws.ts     -> protocol/
wsapp.ts  -> app.ts, protocol/, ws.ts
CYCLES: none
```

The five undrawn edges come from these imports: api/launch.ts:5, doc.ts:23, render/sessions.ts:13, render/reader.ts:17, render/settings.ts:9,11 and terminal/pane.ts:11.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| web/src/main.ts | doc.ts, wsapp.ts, features/views.ts | W4 | — | Major 1, Minor 11 |
| web/src/doc.ts | main.ts, wsapp.ts, features/reader.ts, render/reader.ts | W4 | — | Minor 1, Minor 11 |
| web/src/wsapp.ts | app.ts, ws.ts, features/connection.ts | W4 (new module) | — | Major 1, Minor 11 |
| web/src/app.ts | wsapp.ts, protocol/prefs.ts | — | — | pass |
| web/src/ws.ts | wsapp.ts, terminal/pane.ts, protocol/messages.ts | W4 (wsUrl) | — | Minor 12 |
| web/src/storage.ts | theme.ts, reader/memory.ts | W5 (new module) | — | Minor 6 |
| web/src/dragmime.ts | render/dragreorder.ts, terminal/dropwire.ts, terminal/pane.ts | W5 (new module) | — | Minor 12 |
| web/src/theme.ts | storage.ts, protocol/theme.ts, index.html | — | — | Minor 6, Note 5 |
| web/src/dom.ts | render/{sessions,reader,settings}.ts | — | — | Minor 11 |
| web/src/shortcuts.ts | features/shortcuts.ts | — | — | pass |
| web/src/protocol/decode.ts | every protocol/* and api/* file | W1 (new module) | — | Minor 4, Minor 11, Minor 12 |
| web/src/protocol/hello.ts | other protocol/* | W3 | — | Minor 11 |
| web/src/protocol/prefs.ts | other protocol/*, features/rail.ts, render/settings.ts | W1, W3 | — | Minor 4, 11, 12 |
| web/src/protocol/session.ts | usage.ts, messages.ts | W3 (asNumber home) | — | Minor 3, Minor 4, Minor 11 |
| web/src/protocol/theme.ts | theme.ts (root) | W3 | — | Minor 7, Minor 11, Minor 12 |
| web/src/protocol/update.ts | api/update.ts | W3 | — | Minor 11 |
| web/src/protocol/usage.ts | session.ts, sessions/usage.ts | W3 | — | Minor 11 |
| web/src/protocol/messages.ts | every protocol/* | W3 | — | Minor 11, Minor 12 |
| web/src/api/http.ts | every api/* | W2 | — | Note 2, Minor 11 |
| web/src/api/prefs.ts | other api/*, http.ts, features callers | W1/W2 (none for grouping) | — | Minor 8, Minor 11 |
| web/src/api/sessions.ts | other api/* | W2 | — | pass |
| web/src/api/launch.ts | sessions/permission.ts | W2 | — | Minor 2, Note 4 |
| web/src/api/reader.ts | protocol/session.ts | W2 | — | Minor 3, Minor 11 |
| web/src/api/update.ts, issue.ts, terminal.ts | other api/* | W2 | — | issue.ts: Minor 11; update.ts, terminal.ts: pass |
| web/src/api/testfakes.ts | api/*.test.ts | tests-W* | — | Note 6 |
| web/src/sessions/reorder.ts | railorder.ts, live.ts | W5 (new module) | — | pass |
| web/src/sessions/permission.ts | rename.ts, api/launch.ts, features/launch{,restore}.ts | W2 (new module) | — | Minor 2, Minor 11 |
| web/src/sessions/usage.ts | context.ts, format.ts, protocol/usage.ts | W6b (new module) | — | Minor 9 |
| web/src/sessions/card.ts | reader/paths.ts, render/{sessions,tiles,mainhead}.ts, features/actionscopy.ts | W5 (basename) | — | Minor 5, Minor 10, Minor 11 |
| web/src/sessions/format.ts | reader/freshness.ts, render/* callers | W5 | — | Minor 7, Minor 11 |
| web/src/sessions/{railorder,live}.ts | reorder.ts | W5 | — | live.ts: Minor 11 |
| web/src/sessions/{sort,store,context,rename}.ts | siblings | — | — | sort.ts: Minor 11, 12 |
| web/src/reader/paths.ts | sessions/card.ts, features/reader.ts | W5 | — | Minor 5 |
| web/src/reader/memory.ts | storage.ts, theme.ts | W5 | — | Minor 5, Minor 6 |
| web/src/reader/{markdown,frontmatter,freshness,notice}.ts | render/frontmatter.ts, render/reader.ts | W4/W5 | — | pass |
| web/src/reader/{mermaid,slug,tree,zoom}.ts | render/{mermaid,diagramdialog}.ts | — | — | zoom.ts: Minor 11 |

## Issues

### Critical

None.

### Major

1. **[web-impl] The WS→app mapping is still split between wsapp.ts and the dashboard's own entry** — `web/src/main.ts:104-120` against `web/src/wsapp.ts:42-49`.
   - **Rule broken:** kb:adr/process-composition-roots-registration-only and `docs/conventions.md` § Composition roots, bullet 1: "no … handlers of their own". Also § Design, "One owner per concept".
   - **Evidence:** `onUsage`, `onShellActivity` and `onUpdate` (main.ts:107-118) are each `app.emit(<event>, …); app.render();`. That is the same shape as `onPrefs` and `onDocChanged` at wsapp.ts:42-49.
   - **Why a newcomer misreads it:** a reader asking "where does a WS message reach the app?" finds two answers. The only stated reason for the split is that the pop-out has no listener for those events (doc.ts:13-17, wsapp.ts:5-6). But `app.emit` to an event with no listener is already a no-op (app.ts:110-111), so that reason does not require the mapping to live in the entry.
   - **Why Major and not Critical:** the remaining bodies contain no DOM, no state and no store writes. They are the leftover third of cycle-1 Critical 1.
   - Cycle-1 Critical 1's fix clause, "each entry wires the client in one registration line", is still unmet for main.ts, which spends 17 lines on it.
   - **A fix must make true:**
     - Every WS message's app-side effect (store write, emit, render) is defined in one module.
     - main.ts's `WsClient` construction holds only delegations to feature handles (`actions.handleRemoved`, `connection.showProtocolMismatch`) and no emit/render body.
     - Any difference in the pop-out is either stated where that module is defined, or absent.

### Minor

1. **[web-impl] doc.ts still looks up an element, branches, and mounts into the page itself** — `web/src/doc.ts:28`, `:32-46`.
   - **Rule broken:** § Composition roots, bullet 1: "no DOM lookups".
   - **What remains:** `requireElement("#reader-host")`, the `target === null` branch, `host.replaceChildren(root)`, and an inline stub dependency, `getSurfaces: () => ({ state: () => new Map() })` (doc.ts:41).
   - main.ts has none of these. Every main.ts controller owns its own lookups.
   - **A fix must make true:** doc.ts only builds `app`, registers the reader/theme/connection controllers and the client, and starts the tick. Finding the host, choosing the "unknown session" notice over the reader, and mounting live in a feature module, the way features/views.ts now owns the view split.
2. **[web-impl] `PERMISSION_MODES` is a wire enum that lives in sessions/, which gives api/ an edge into sessions/** — `web/src/sessions/permission.ts:12-13`, `web/src/api/launch.ts:5`.
   - **Why it diverges:** every other wire enum's const list now lives in protocol/ (Major 1's pattern). This one is the accepted values of `POST /api/sessions`'s `permissionMode` (kb:anchor/sessions.create), and sits in sessions/.
   - **Consequence:** api/, drawn as a leaf in kb:diagram/web-components, now imports from sessions/. That is the only api→sessions edge in the graph.
   - **Guard divergence:** `permissionModeToCheck` (permission.ts:24-26) does `includes(stored ?? "")` followed by an `as PermissionMode` cast. Its siblings use a type-guard `isX(value: unknown): value is X` (protocol/prefs.ts:80-102).
   - **Rule broken:** § Design, "Match the siblings".
   - **A fix must make true:**
     - The permission-mode list and type sit with the other wire enums, and api/ imports nothing from sessions/.
     - The UI fallback rule (unknown mode → `auto`) keeps its pure home.
     - The rule narrows the stored value through a guard, not a cast.
3. **[web-impl] Three two-value wire enums still list their members twice** — `web/src/protocol/session.ts:17` with `:125` (`"permission" | "idle"`), `session.ts:39` with `:164` (`"seed" | "hook"`), and `web/src/api/reader.ts:20` with `:54` (`"git" | "walk"`).
   - **Rule broken:** § Design, "One owner per concept". Cycle-1 Major 1's clause was "each wire enum lists its members once".
   - **A fix must make true:** each of these three lists its members once, with its type and check derived from that list, as its protocol/ siblings already do.
4. **[web-impl] The decoder primitives are spread across three concept modules while decode.ts claims to be their home.**
   - **Where they are:**
     - `isNumber`/`asNumber` live in `web/src/protocol/session.ts:168-177`. They are exported so that messages.ts:15,117 can decode `shellsBusy`, which is a list of ids and nothing to do with sessions.
     - `isString`/`isBoolean` are private to `web/src/protocol/prefs.ts:104-110`.
     - decode.ts:1-7 describes itself as "Shared decoder building blocks … imports from here rather than each other".
   - **Consequence:** a newcomer looking for the number adapter opens decode.ts and does not find it, and messages.ts depends on session.ts for a primitive. W3's design line ("no third caller to justify a decode.ts home") covers where the helpers are *used*. It does not address decode.ts's stated ownership.
   - **Rule broken:** § Design, "One owner per concept".
   - **A fix must make true:** the generic value guards and adapters live in the module that says it owns decoder building blocks. No concept module imports a primitive from another concept module.
5. **[web-impl] Pass-through re-exports have come back, the pattern cycle-1 Minor 3 removed from theme.ts.**
   - **`basename`:** `web/src/reader/paths.ts:2-4` re-exports it from sessions/card.ts. Its one production importer, features/reader.ts:28, could import it from the owner directly.
   - **`StorageLike`:** `web/src/reader/memory.ts:14` re-exports it from storage.ts. Its only importer is reader/memory.test.ts:13 (`rg StorageLike --glob '!*.test.ts'` shows no production importer).
   - **Misplaced owner:** the owner of `basename` is `sessions/card.ts:106`, a "Pure card view-model" module (card.ts:1). A newcomer looking for a path helper would not open it.
   - **Rules broken:** the web-components diagram prose, "no barrel", and § Design, "seams where a test needs one and nowhere else".
   - **A fix must make true:** each symbol is imported from the module that defines it, and `basename` lives in a module whose header covers path helpers.
6. **[web-impl] The storage seam covers only two of the three storage operations, and only one of its two callers uses its type** — `web/src/theme.ts:49` (`Pick<Storage, "setItem">`), `web/src/reader/memory.ts:58-64`.
   - memory.ts's `forget` still wraps `removeItem` in its own try/catch.
   - storage.ts:1-5 says it "owns the try/catch … sequence", and `StorageLike` already declares `removeItem` (storage.ts:9).
   - **Rule broken:** § Design, "Match the siblings". This finishes cycle-1 Minor 5.
   - **A fix must make true:** both callers type their storage parameter as the seam's type, and no module outside storage.ts catches a storage exception itself.
7. **[web-impl] Exports that nothing uses, and comments that say otherwise.**
   - **`isClaudeFamily`** (`web/src/protocol/theme.ts:26-27`) is exported "Exported: theme.ts imports this instead of keeping its own copy". `rg isClaudeFamily web/src` finds no importer at all, tests included. theme.ts imports only the type.
   - **`agoSuffix`** (`web/src/sessions/format.ts:46-52`) is exported, and its comment says "Every caller … must go through this". But its only production caller is `ageAgo` two lines below, and every "<age> ago" goes through `ageAgo` (Major 4 of cycle 1). So there are still two exported names for one idea, and the comments disagree about which one to use.
   - **`putPrefs`** (`web/src/api/prefs.ts:16`) has no production caller besides `requestPrefs` in the same file. See Minor 8.
   - **Rule broken:** § Design, "seams where a test needs one and nowhere else".
   - **A fix must make true:** each export has a production importer, or it is made module-private (any test that pins only it moves to the public function, which is [web-tests]). No comment names an importer that does not exist.
8. **[web-impl] api/prefs.ts diverges from its api/ siblings in naming and grouping, and no `design:` line explains either** — `web/src/api/prefs.ts:24-26`, `:31-33`.
   - **Naming:** `requestPrefs` is a synchronous fire-and-forget `void` function. Every other exported function in api/ is `async` and returns an `ApiResult`. Its name also collides with http.ts's own `request*` family (`requestJson`/`requestEmpty`/`requestText`/`requestFormData`, http.ts:121-173), so a newcomer reads it as HTTP-layer plumbing.
   - **Grouping:** `refreshUsage`, a usage endpoint, lives in prefs.ts, grouped by response shape (prefs.ts:1-3). Every other api/ file is grouped by endpoint family (sessions, launch, reader, update, issue), which is how kb:diagram/web-components describes api/ ("one file per endpoint family").
   - **Rule broken:** § Design, "Match the siblings … or says in Decisions why it diverges". W2's Decisions have no line for either choice.
   - **A fix must make true:** the fire-and-forget prefs write has a name that does not read as part of http.ts's family, and a usage endpoint lives where a reader would look for one. Otherwise, a `design:` line states why each divergence was chosen.
9. **[web-impl] sessions/usage.ts re-declares a wire shape its sibling imports** — `web/src/sessions/usage.ts:10-15`.
   - `UsageBucketSource { usedPct; resetsAt }` is field for field protocol/usage.ts:8-11's `UsageBucket`. `ModelWindow` is already assignable to `UsageBucket` structurally.
   - The sibling that W6b's design line says it matches, sessions/context.ts:7, takes the protocol type (`SessionContext`) directly.
   - **Rule broken:** § Design, "One owner per concept".
   - **A fix must make true:** the bucket derivation's input type is the protocol type, not a second declaration of it.
10. **[web-impl] `buildCardViewModel`'s parameter default gives a compatibility-shim reason, and two callers build a full view-model to read one field** — `web/src/sessions/card.ts:203-206`, `:114`.
    - **The comment:** it says the default exists "so every existing call site (and Vitest fixture) that predates this parameter keeps compiling". That is the shim reasoning cycle-1 Minor 1 cited.
    - **The callers that actually rely on it:** features/actionscopy.ts:11 and render/mainhead.ts:37. Both call `buildCardViewModel(session, now).repoLine`, deriving timers, notes and activity lines just to read the repo line. `repoLine` itself is private (card.ts:114).
    - **Rule broken:** § Design, "One owner per concept" (the repo-line rule should be reachable by the callers that want only it).
    - **A fix must make true:** a caller that needs only the repo line can get it without building a card view-model, and the `mode` default is either gone or commented with the reason it holds today.
11. **[web-impl] Comments still cite plan IDs, plan sections and this run's findings, or narrate history** (§ Comments: "don't narrate history"). Commit 40eb7de's sweep missed these.

    **Citing this run's review:**
    - `sessions/permission.ts:1-6` names `review.maintainability.d-webcore.md Seed check B2`.
    - `protocol/prefs.ts:99` says "same finding as isRailDensity above".
    - `main.ts:102-103` and `wsapp.ts:23-24` quote cycle-1 Critical 1's fix text word for word ("the pop-out differs from the dashboard only in the handlers it declares it leaves out").

    **Plan IDs and plan sections:**
    - `protocol/update.ts:7,12,32,40,51,77` ("Plan auto-update", "Plan rail-card-improvements-2").
    - `protocol/theme.ts:7,18` ("Plan new-ui-design-colors").
    - `protocol/messages.ts:71` ("Protocol Contract") and `:136` ("Plan markdown-viewing").
    - `api/reader.ts:1` ("Plan markdown-viewing").
    - `api/issue.ts:5` ("Plan issue-capture").
    - `sessions/permission.ts:8,18` ("Plan fix-auto-mode-select", "Out of scope").
    - `sessions/card.ts:13,62` ("Testable UI Elements") and `:123` ("Plan line 287").
    - `sessions/format.ts:78` ("R5").
    - `sessions/sort.ts:40` ("the plan's explicit tiebreak").
    - `reader/zoom.ts:7` ("Testable UI Elements").
    - `main.ts:66` ("UI Specifications > Render phase order").
    - `doc.ts:15` ("the plan's States table").

    **History narration:**
    - "split out of the former protocol.ts" in all seven protocol/* headers (hello.ts:2-3, prefs.ts:2-3, session.ts:1-2, theme.ts:2-3, update.ts:2-3, usage.ts:2-3, messages.ts:5-6).
    - `decode.ts:31-32` ("repeated 10 times across the former protocol.ts and api.ts").
    - `usage.ts:85` ("down from 33 before…").
    - `session.ts:204-205`.
    - `api/http.ts:1-3` ("this used to be 8 copy-pasted…").
    - `api/prefs.ts:20-23` ("The 8 call sites…", which is now 9 per `rg requestPrefs`).
    - `wsapp.ts:3-4`.
    - `doc.ts:6-11` and `:48-52`.
    - `dom.ts:26-28`.
    - `ws.ts:22`.
    - `sessions/live.ts:16-22`.

    **A fix must make true:** no in-scope comment names a plan, a plan section, a requirement or finding ID, or this review. Where one of these comments carries a *why*, the why survives, citing a `kb:` record if it has one.
12. **[web-impl] Comments that are now false.** (Comment truth is review-work's lane. The team lead asked for these, and the fix wave touched each of these lines.)
    - `ws.ts:1-3` says "nothing else may construct a WebSocket, enforced by an automated check". terminal/pane.ts:220 does, and the component diagram says so.
    - `dragmime.ts:3` says "terminal/pane.ts checks for its presence". The importer is terminal/dropwire.ts:11 (`rg DRAG_MIME`).
    - `protocol/decode.ts:5-7` says theme.ts imports from it. It does not (theme.ts:5-6).
    - `protocol/prefs.ts:98` says "features/settings.ts's rail-activity-radio guard". The importer is render/settings.ts:10.
    - `protocol/prefs.ts:151` cites "protocol.test.ts". No such file exists; it is now protocol/prefs.test.ts.
    - `protocol/theme.ts:26`: see Minor 7.
    - `protocol/messages.ts:97` says "same tolerance as prefs.theme above", and `:111` says "same pattern as `usage.model` above". After the split, both are in other files.
    - `sessions/sort.ts:9` says "amended from the six-state table above". There is no table above.

    **A fix must make true:** each of these names the file, module or rule that is true now.
13. **[web-tests] Test comments cite this run's review, and one test keeps a type the seam made redundant.**
    - `web/src/dom.test.ts:1` ("review Minor 6") and `web/src/sessions/permission.test.ts:15-20` ("review cycle 1, Major 2 … review-maintainability cycle 1 moved the module") cite review history.
    - `web/src/reader/memory.test.ts:16-22` declares `StorageLikeWithRemove`, and its comment says "`StorageLike` … has no `removeItem` yet". storage.ts:9 now declares `removeItem`, so the comment is false and the interface is a second copy of the seam.
    - **A fix must make true:** these test comments cite no review, and the memory fixtures use the seam type from storage.ts directly. That lets Minor 5's `StorageLike` re-export go.

### Notes

1. **[note] DIAG (review-work's row):** kb:diagram/web-components's "acyclic" claim holds, since the re-derived graph above has no cycle. Five edges are not drawn, though:
   - `api → sessions` (api/launch.ts:5; Minor 2 would remove it).
   - `doc → render` (doc.ts:23).
   - `render → dom` (render/sessions.ts:13, reader.ts:17, settings.ts:11).
   - `render → theme` (render/settings.ts:9).
   - `terminal → ws` (terminal/pane.ts:11).

   The prose "`terminal/pane.ts` checks" for `DRAG_MIME` names the wrong file (it is dropwire.ts). The sessions/CLAUDE.md "Owns" line does not mention permission rules, usage-bucket derivation, the reorder rule or `basename`. reader/CLAUDE.md credits `basename` to paths.ts.
2. **[note]** api/http.ts spells out `credentials: "same-origin"` four times (lines 59, 63, 153, 168). It also puts the failure log on four slightly different tails: `fail()`, three `if (!result.ok) logApiFailure(...)`, and one inline in `requestText`. Everything is inside the one module that owns it, so no change is asked. `requestText` and `requestFormData` could build their init through `requestInit`.
3. **[note]** The enum guard body `(X as readonly unknown[]).includes(value)` appears 11 times across protocol/. W1's design line (match theme.ts's precedent rather than a factory) holds. The nullable-string check `x !== null && typeof x !== "string"` appears 23 times across protocol/ and api/. If Minor 4 gives decode.ts an `asString`, `parseNullable(x, asString)` could replace them, but no change is asked.
4. **[note]** `parseRepos` (api/launch.ts:76-78) is a one-caller pass-through around `parseListOf`. W1 inlined exactly this shape elsewhere (`parseSessions`, `parseShellsBusy`).
5. **[note]** Root theme.ts's `isThemeName(value: string)` uses `readonly string[]`, while every protocol/ guard takes `unknown`. This predates the plan.
6. **[note]** api/testfakes.ts is the only shared test-support module in `web/src`, and it lives beside production files under a name that does not end in `.test.ts`. Nothing in production imports it, so it is tree-shaken. It is [web-tests]'s to keep or rename. It matches § Design "Tests: … a helper or fixture is grepped for before it is written".
7. **[note]** Across api/*, protocol/* and the new root modules, siblings now share one shape: header, types, private parsers, and exported endpoints or `parseXMessage` over `request*`/`isRecord`. api/ files order their sections slightly differently (launch.ts puts all types first, the rest interleave), which is taste. Across both directories, the split reads as one codebase.
