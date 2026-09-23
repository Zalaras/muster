# Web Implementation: Maintainability Cleanup

**Plan**: maintainability-cleanup
**Mode**: initial (Unit W2 only — `api.ts`)
**Pack**: kb: pack 69039 words (budget 8000) — rules 1053 · features 26183 · diagrams 0 · decisions 27308 · proposed 0 · facts 9486 · lessons 4359 · runbooks 644 (`--plan maintainability-cleanup --role web-impl`; over budget, WARN only)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/api.ts` | deleted | Replaced by `web/src/api/` below. |
| `web/src/api/http.ts` | created | The only module that calls `fetch`, decodes a `Response`, or calls `console.error` for the API layer. `ApiErrorBody`/`ApiResult<T>`, `parseApiError`, `safeFetch`, `decodeJson`/`decodeEmpty`/`parseErrorResponse` (B1: the 8 copied decode-empty blocks + the 8th `errorBody` block in `fetchReaderFile` collapse to these three), and the four exported request helpers `requestJson`/`requestEmpty`/`requestText`/`requestFormData`, which write `credentials`/headers/JSON body once (down from 21 `credentials: "same-origin"` literals to 4) and call `logApiFailure` (e-m5) on every failure. |
| `web/src/api/sessions.ts` | created | `endSession`/`resumeSession`/`removeSession`/`pinSession`/`putTitle`/`putSessionOrder`/`createShell`/`fetchPane` + `PaneSnapshot`/`CreateShellResult`. |
| `web/src/api/launch.ts` | created | `launchSession`/`fetchRepos`/`browse` + `Repo`/`BrowseEntry`/`BrowseResult`/`LaunchRequest`. |
| `web/src/api/prefs.ts` | created | `putPrefs`/`refreshUsage` + `PrefsRequest`, and the new `requestPrefs(patch)` (B1) that replaces the 8 `putPrefs(...).then(console.error)` call sites. |
| `web/src/api/terminal.ts` | created | `locateDroppedFile` + `LocatedFile` — the one `FormData` upload endpoint. |
| `web/src/api/issue.ts` | created | `captureIssueSnapshot`/`fileIssue` + `IssueCapture`/`FileIssueRequest`/`FiledIssue`. |
| `web/src/api/update.ts` | created | `applyUpdate`/`checkForUpdate`/`fetchRestartImpact` + `RestartImpact`/`RestartImpactShell`. |
| `web/src/api/reader.ts` | created | `fetchReaderListing`/`fetchReaderFile` + `ReaderPlan`/`ReaderFileEntry`/`ReaderListing`. |
| `web/src/sessions/permission.ts` | created | `PERMISSION_MODES`/`PermissionMode`/`permissionModeToCheck`, moved out of the HTTP layer (B2). |
| `web/src/features/{actions,issue,launch,rail,reader,rename,settings,surfaces,update,usage,views}.ts`, `web/src/render/{dead,launchrestore,update}.ts`, `web/src/terminal/{drop,pane}.ts` | modified | Re-pointed at the new `api/*` modules (and `sessions/permission.ts` for the two launch-restore callers); every removed controller-side `console.error("<METHOD> /api/... failed: …")` (19 sites, e-m5) deleted — `http.ts`'s `logApiFailure` now logs the same information from the one place that knows the route. Where a caller did nothing but log (the 8 `putPrefs` sites, `applyUpdate`×2, `putTitle`, `pinSession`, `putSessionOrder`, `createShell`'s `reportShellSpawnFailure`), the `.then(...)`/`if` wrapper is gone too — nothing left to do at that call site. Where a caller also had UI-visible behaviour (`doEnd`/`doResume`/`doRemove`'s `showActionError`, `refreshUsage`'s `clearUsageRefreshBusy`, `applyAndRestart`'s early return), only the `console.error` line is removed. |
| `web/src/features/CLAUDE.md` | modified | Invariant line updated: `../api.ts` → `../api/` (the file it named no longer exists). |
| `web/src/protocol.ts`, `web/src/protocol/decode.ts` | modified | Two comments naming `api.ts` (a live-tense claim about where `checkForUpdate` lives / who imports `decode.ts`) corrected to `api/update.ts` / `web/src/api/`. Not otherwise touched — protocol.ts's own split is W3's. |

## Decisions

- **request helpers, four not one**: `requestJson`/`requestEmpty`/`requestText`/`requestFormData` rather than a single do-everything function, because the 21 endpoints split cleanly on "does the success response have a JSON body" (18), "is success a fixed status with no body" (7, overlapping the JSON set at `fetchReaderFile`'s error path), "is success raw text" (1: `fetchReaderFile`), and "is the request body `FormData`" (1: `locateDroppedFile`). A fifth, generic `request(method, url, {successKind, parse, body})` would have pushed a branch back into every call site instead of removing one. `rg -c "errorBody = await res.json"` before this change: 8; after, the pattern exists twice, both inside `http.ts` (`decodeJson`'s success-path parse and `parseErrorResponse`'s shared tail).
- **Uniform logging, not "only the 19 that already logged" (e-m5)**: every `request*` failure now logs via `logApiFailure`, not just the 11 endpoints (19 call sites) that happened to have a hand-written `console.error` before. Checked first that this adds no new *caller* behaviour: `rg -n "\b<fn>\(" web/src --glob '!web/src/api.ts' --glob '!*.test.ts'` for each of the 11 previously-logged functions showed every call site of each one already logged the same way (`putPrefs` ×8, `applyUpdate` ×2, one call site each for the rest) — so centralising loses no distinct behaviour. The 10 functions that never logged (`launchSession`, `fetchRepos`, `browse`, `fetchPane`, `checkForUpdate`, `captureIssueSnapshot`, `fileIssue`, `locateDroppedFile`, `fetchReaderListing`, `fetchReaderFile`) now also log on failure — a deliberate reading of "a failed `ApiResult` is logged through one helper" as a rule for every endpoint, not a preservation of the previous ad-hoc split (which had no stated reason for which endpoints logged). No unit test spies on `console.error` (`rg -n "console" web/src/**/*.test.ts` — no hits), so nothing pins the old silence.
- **`sessions/permission.ts` as B2's new home**: `web/src/sessions/CLAUDE.md`'s own "Owns" line is "pure session logic, no DOM" and its invariant is "No DOM, no socket, no fetch" — `PERMISSION_MODES`/`permissionModeToCheck` is exactly that (a wire-enum rule, not an HTTP concern), and the directory already holds the sibling shape (`rename.ts`'s `TitleCommand`/`titleCommand`, pure, no DOM). `rg -rn "PERMISSION_MODES|permissionModeToCheck" web/src/sessions` before this change: 0 hits — nothing there collided with the name. `render/launchrestore.ts` (a `render/` module, W6's to relocate) keeps its own file; only its import line moved, per this unit's instruction not to move it now.
- **No `web/src/api/index.ts`**: matches the plan's "no barrel" default and `web/src/protocol/`'s existing shape (only `decode.ts`, no `index.ts`, ahead of W3's full split) — `rg -n "index.ts" web/src` finds none anywhere in `web/src`, so there's no barrel precedent to break.
- **`decodeEmpty`/`parseErrorResponse` split rather than one function**: `decodeEmpty`'s success check (`res.status === successStatus`) must run *before* any `res.json()` call (the original 204/202 branches never touch the body on success), while `decodeJson` always attempts the body read first regardless of `res.ok` (matching every original `decodeJson` call site exactly). Reusing one `parseErrorResponse(res)` for both functions' failure tails, plus `fetchReaderFile`'s error path and `decodeJson`'s `!res.ok` branch, is what gets the 8-block count down to 2 remaining `res.json()` calls (see above) without changing either function's observable branch order.
- Every REQ this unit's findings named (B1, B2, e-m5) is covered above; nothing was left deliberately undone.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` do **NOT** exit 0 in this working tree — but the only errors are the sanctioned import-path breakage this move causes in test files, none in `web/src` implementation code (`npx tsc --noEmit 2>&1 | grep 'error TS' | grep -v '\.test\.ts'` → 0 lines). `npx vite build` alone (the actual bundle, not the `tsc` gate) succeeds — pasted below.

Test files needing an import fix (moved-path breakage, not edited per this unit's instruction — "do not edit tests"):

1. **`web/src/api.test.ts`** — imports `applyUpdate, browse, captureIssueSnapshot, createShell, endSession, fetchPane, fetchReaderFile, fetchReaderListing, fetchRepos, fetchRestartImpact, fileIssue, launchSession, locateDroppedFile, PERMISSION_MODES, permissionModeToCheck, pinSession, putPrefs, putSessionOrder, refreshUsage, removeSession, resumeSession` from `"./api"` (line 2-24). Every one of these now lives across `web/src/api/{sessions,launch,prefs,terminal,issue,update,reader}.ts` and `web/src/sessions/permission.ts` — this file most likely wants splitting to match, one spec file per new module (mirroring the production split), not just a repointed import. Fails at runtime (`vitest`): `Cannot find module './api'`.
2. **`web/src/features/surfaces.test.ts:12,21`** — `import type { ApiResult } from "../api"` and `import { createShell, type CreateShellResult } from "../api"`. New homes: `ApiResult`/`ApiErrorBody` → `../api/http`, `createShell`/`CreateShellResult` → `../api/sessions`. Fails at runtime (mocks `createShell`, a live import).
3. **`web/src/render/dead.test.ts:7,21`** — `import type { ApiResult, PaneSnapshot } from "../api"` and `import { fetchPane } from "../api"`. New homes: `ApiResult` → `../api/http`, `PaneSnapshot`/`fetchPane` → `../api/sessions`. Fails at runtime.
4. **`web/src/terminal/drop.test.ts:2`** — `import type { ApiErrorBody } from "../api"` → `../api/http`. Type-only; only `tsc` catches this one (vitest passes since the import erases).
5. **`web/src/render/launchrestore.test.ts:2`** — `import type { Repo } from "../api"` → `../api/launch`. Type-only, same as above.
6. **`web/src/render/update.test.ts:11`** — `import type { RestartImpactShell } from "../api"` → `../api/update`. Type-only, same as above.

`make web-test` tail (3 of these fail to load at runtime; the other 3 are type-only and pass at runtime but fail `tsc`):

```
 FAIL  src/api.test.ts [ src/api.test.ts ]
Error: Cannot find module './api' imported from .../web/src/api.test.ts
 FAIL  src/features/surfaces.test.ts [ src/features/surfaces.test.ts ]
Error: Cannot find module '/src/api' imported from .../web/src/features/surfaces.test.ts
 FAIL  src/render/dead.test.ts [ src/render/dead.test.ts ]
Error: Cannot find module '/src/api' imported from .../web/src/render/dead.test.ts

 Test Files  3 failed | 43 passed (46)
      Tests  1664 passed (1664)
```

`npx tsc --noEmit` tail (all 9 errors are inside the 6 files above; `TS2345` on `api.test.ts:84` is a cascade from `mode: any` after the failed import, not a separate defect):

```
src/api.test.ts(24,8): error TS2307: Cannot find module './api' or its corresponding type declarations.
src/api.test.ts(84,78): error TS2345: Argument of type '(mode: any) => void' is not assignable ...
src/features/surfaces.test.ts(12,32): error TS2307: Cannot find module '../api' ...
src/features/surfaces.test.ts(21,53): error TS2307: Cannot find module '../api' ...
src/render/dead.test.ts(7,46): error TS2307: Cannot find module '../api' ...
src/render/dead.test.ts(21,27): error TS2307: Cannot find module '../api' ...
src/render/launchrestore.test.ts(2,27): error TS2307: Cannot find module '../api' ...
src/render/update.test.ts(11,41): error TS2307: Cannot find module '../api' ...
src/terminal/drop.test.ts(2,35): error TS2307: Cannot find module '../api' ...
```

`npx vite build` tail (the actual embedded bundle, unaffected by the test-file breakage):

```
✓ built in 1.76s
```

`npm run -s lint` (Biome, over the 8 new/8 modified/1 deleted source files plus everything else):

```
Checked 195 files in 188ms. No fixes applied.
```

`python3 .claude/skills/orchestrate/scripts/dead-refs.py`: `18 references checked, 0 missing`.

File lengths (`wc -l`): `http.ts` 174, `sessions.ts` 104, `launch.ts` 117, `update.ts` 59, `reader.ts` 75, `issue.ts` 74, `prefs.ts` 32, `terminal.ts` 32, `permission.ts` 27 — all well under the 500-line `filelen` threshold, no size-warn suppressions needed. (`make size-warn` itself errors on `web/src/api.ts: No such file or directory` until the deletion is staged — `git ls-files` still lists the pre-delete path from the index; not a defect in this change, resolves once the main session commits.)
