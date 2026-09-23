# Web Implementation: Maintainability Cleanup

**Plan**: maintainability-cleanup
**Mode**: initial (Unit W1 only — decoders and enums)
**Pack**: kb: pack 17580 words (budget 8000) — rules 1874 · features 6069 · diagrams 3904 · decisions 5300 · proposed 0 · facts 71 · lessons 354 · runbooks 2 (`--features connection,reader`; over budget, WARN only)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/protocol/decode.ts` | created | Shared decoder building blocks: `isRecord`, `parseListOf`, `parseNullable` (Major 3). Home chosen ahead of protocol.ts's own settled split into `web/src/protocol/` (W3). |
| `web/src/protocol.ts` | modified | Every wire enum now a `const` array `as const` + derived type + one guard (Major 1): `CLAUDE_CODE_STATUSES`, `MODEL_SCOPED_ERRORS`, `SESSION_STATES`, `RAIL_SORTS`, `VIEWS`, `DENSITIES`, `RAIL_DENSITIES`, `RAIL_ACTIVITIES`, `UPDATE_INSTALL_KINDS`, `UPDATE_APPLY_PHASES`, `CLAUDE_FAMILIES`. `isClaudeFamily`/`isRailDensity`/`isRailActivity` now exported as the one guard (Seed check B4). `PREF_DEFAULTS: Prefs` added (Minor 1) and used by every `parsePrefsField` fallback. `parseUsage`/`parseSession`/`parseContext`/`parseSnapshot` use `parseListOf`/`parseNullable`, dropping `parseModelScopedList`, `parseSessions`, `parseShellsBusy`, `parseNullableNumber` as now-redundant wrappers. |
| `web/src/api.ts` | modified | `PrefsRequest = Partial<Prefs>` (Minor 2) — no longer lists the 8 fields a second time. Local `isRecord` dropped for `protocol/decode`'s. `parseRepos`/`parseBrowseResult`/`parseRestartImpact`/`parseReaderListing` use `parseListOf`/`parseNullable`. |
| `web/src/theme.ts` | modified | Own `isClaudeFamily` dropped; imports protocol's. `readThemeHint`'s inline record check replaced with `protocol/decode`'s `isRecord`. |
| `web/src/reader/memory.ts` | modified | `isClearedAtShape`/`loadMemory`'s inline record checks replaced with `protocol/decode`'s `isRecord`. |
| `web/src/app.ts` | modified | `View` moved to `protocol.ts` (`VIEWS`/`View`) — app.ts's own export had no importer. Initial `AppState` reads `PREF_DEFAULTS` instead of repeating the literal defaults. |
| `web/src/features/rail.ts` | modified | Drops its own `isRailDensity`, imports protocol's (Seed check B4). |
| `web/src/features/settings.ts` | modified | Drops its own `isRailActivity`, imports protocol's (Seed check B4). |
| `web/src/features/views.ts` | modified | `requestView`'s param typed `View` (from protocol) instead of an inline `"focus" \| "tiles"` (Major 1's view-union count). |
| `web/src/render/masthead.ts` | modified | `renderViewSwitcher`/`renderDensityControl` take `View` instead of inline `"focus" \| "tiles"`. |
| `web/src/sessions/card.ts` | modified | `buildCardViewModel`'s `railActivity` default reads `PREF_DEFAULTS.railActivity` (Minor 1). |
| `web/src/render/sessions.ts` | modified | Five `railActivity` parameter defaults read `PREF_DEFAULTS.railActivity`. |
| `web/src/render/tiles.ts` | modified | `renderStrip`'s `railActivity` default reads `PREF_DEFAULTS.railActivity`. |

## Decisions

- design: `web/src/protocol/decode.ts` is the new home for `isRecord`/`parseListOf`/`parseNullable`, placed under `web/src/protocol/` ahead of `protocol.ts`'s own settled split into that directory (W3) — `protocol.ts`, `api.ts`, `theme.ts` and `reader/memory.ts` all import one module rather than each other. `rg -n "if (!Array.isArray" web/src/protocol.ts web/src/api.ts` showed 7 hand-written array loops before this change (matches Major 3's own count); nothing already did this.
- design: the enum pattern (`const ARRAY = [...] as const`; `type T = (typeof ARRAY)[number]`; `(ARRAY as readonly unknown[]).includes(value)`) matches theme.ts's existing `THEMES`/`ThemeName`/`isThemeName` precedent exactly (the pattern Major 1's finding names) rather than a shared `makeEnumGuard<T>()` factory — "Match the siblings" (docs/conventions.md § Design), since theme.ts's own guard doesn't use one either.
- design: `parseNullable`'s `parseItem` needs `(v) => T | null`, but the existing `isString`/`isBoolean` guard shape `parsePrefsField` uses needs `v is T`. There was no existing "is this a number" guard for `SessionContext`'s three fields, so I added `isNumber` alongside its `isString`/`isBoolean` siblings, plus a one-line `asNumber` adapter for `parseNullable`'s different shape, rather than writing two divergent number checks.
- Named parse functions with exactly one caller (`parseSessions`, `parseShellsBusy`, `parseModelScopedList`) were inlined as direct `parseListOf(...)` calls rather than kept as pass-through wrappers around the new helper.
- `PrefsRequest -> Partial<Prefs>` (Minor 2) also collapsed api.ts's 8 per-field `kb:anchor` comments, since `Prefs`'s own field comments are now the only copy of that documentation; the now-unused `Density`/`RailActivity`/`RailDensity`/`RailSort` type imports were dropped from api.ts (`rg -n '\bDensity\b|\bRailActivity\b|\bRailDensity\b|\bRailSort\b' web/src/api.ts` showed no other reference).
- `View` (previously `app.ts`'s own `export type View = "focus" | "tiles"`) moved to `protocol.ts` as `VIEWS`/`View`: `rg -n '"focus" \| "tiles"|from "\.\./app"|from "\./app"' web/src` confirmed nothing imported `View` from `app.ts` before this change (the review's own B-note). `Prefs.view`, `PrefsRequest` (now derived), `features/views.ts` and `render/masthead.ts` now share this one type instead of six separate spellings (Major 1's count).
- Deliberately not done here (this unit's stated scope was Major 3, Major 1, Minor 1, Minor 2, and Seed check B3/B4's `isRailActivity`/`isRailDensity`/`isClaudeFamily`/`isRecord` guards only):
  - B4's other three duplicate helpers — `requireTemplate` (render/sessions.ts + render/tiles.ts), `basename` (sessions/card.ts + reader/paths.ts), `pad2` (sessions/format.ts + features/issue.ts) — are W5's ("one owner per helper"), not touched.
  - Major 2 (moveCard/moveTile reorder duplication), Major 4 (age-function naming), Minor 3 (dead exports with no production importer), Minor 4 (markdown.ts building DOM), Minor 5 (two storage seam shapes) are other units'/W5's and not touched.
- Size: `protocol.ts` grew from 967 to 981 lines (new `const` arrays plus their comments) and `api.ts` shrank from 774 to 725; both still trip the 500-line `filelen` warning. Expected — plan.md's Notes 1 already settles the directory split as W2 (api.ts)/W3 (protocol.ts), not this unit.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` (via `make web-build`) exit 0.

No test files need changes. Every guard/helper renamed, exported, or removed in this unit was previously module-private; grepped `protocol.test.ts`, `api.test.ts`, `theme.test.ts`, `reader/memory.test.ts` for `isRailSort|isRailDensity|isRailActivity|isClaudeFamily|isSessionState|isClaudeCodeStatus|isModelScopedError|isUpdateInstallKind|isUpdateApplyPhase|isRecord|parseNullableNumber` — no hits, so none of them were exercised directly by a test.

### Gate tails

```
$ npx tsc --noEmit
(clean, no output)

$ make web-lint
cd web && npm run -s lint
Checked 187 files in 182ms. No fixes applied.

$ make web-test
cd web && npm test
 Test Files  46 passed (46)
      Tests  1843 passed (1843)

$ make web-build
...
✓ built in 1.67s
[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification.  <- pre-existing (mermaid/cytoscape vendor chunks), unrelated to this change
```
