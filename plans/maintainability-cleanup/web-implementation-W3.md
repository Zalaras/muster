# Web Implementation: Maintainability Cleanup

**Plan**: maintainability-cleanup
**Mode**: initial (Unit W3 only — `protocol.ts` → `web/src/protocol/`)
**Pack**: not re-run for this unit (W1/W2 already pulled the connection/reader pack; this
unit is a mechanical continuation of the same split named in plan.md § Units W3 and the
"Defaults that bind the units" section)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/protocol/hello.ts` | created | `PROTOCOL_VERSION`, `CLAUDE_CODE_STATUSES`/`ClaudeCodeStatus`, `ClaudeCodeInfo`, `Hello`, `parseHello` (now exported — `messages.ts`'s `parseMessage` dispatches to it), `isSupportedProtocolVersion`. |
| `web/src/protocol/session.ts` | created | `SESSION_STATES`/`SessionState`, `SessionAttention`, `SessionFailure`, `SessionRepo`, `SessionModelInfo`, `PermissionModeInfo`, `SessionContext`, `SessionPlan`, `Session`, `parseSession` (biome-ignore kept directly above it), `parseModelInfo` and `asNumber` now exported (usage.ts and messages.ts each need one). |
| `web/src/protocol/usage.ts` | created | `UsageBucket`, `ModelWindow`, `MODEL_SCOPED_ERRORS`/`ModelScopedError`, `Usage`, `UNKNOWN_USAGE`, `UsageMessage`, `parseUsage` (biome-ignore kept directly above it, now exported for `messages.ts`'s `parseSnapshot`), `parseUsageMessage` (now exported for dispatch). Imports `parseModelInfo`/`SessionModelInfo` from `./session`. |
| `web/src/protocol/prefs.ts` | created | `RAIL_SORTS`/`RailSort`, `VIEWS`/`View`, `DENSITIES`/`Density`, `RAIL_DENSITIES`/`RailDensity`, `RAIL_ACTIVITIES`/`RailActivity`, `Prefs`, `PREF_DEFAULTS`, `PrefsMessage`, `isRailDensity`/`isRailActivity` (already exported pre-split), `parsePrefs`/`parsePrefsMessage` (now exported for `messages.ts`). |
| `web/src/protocol/update.ts` | created | `UPDATE_INSTALL_KINDS`/`UpdateInstallKind`, `UPDATE_APPLY_PHASES`/`UpdateApplyPhase`, `UpdateApply`, `UpdateInfo`, `UpdateMessage`, `parseUpdateInfo` (already exported pre-split), `parseUpdateMessage` (now exported for dispatch). |
| `web/src/protocol/theme.ts` | created | `CLAUDE_FAMILIES`/`ClaudeFamily`, `ClaudeThemeInfo`, `ClaudeThemeMessage`, `isClaudeFamily` (already exported pre-split), `parseClaudeThemeInfo`/`parseClaudeThemeMessage` (now exported for `messages.ts`). |
| `web/src/protocol/messages.ts` | created | `Snapshot`, `SessionUpsert`, `SessionRemoved`, `DocChanged`, `ShellActivityMessage`, the `Message` union, `parseSnapshot`, `parseSessionUpsert`, `parseSessionRemoved`, `parseDocChanged` (already exported), `parseShellActivityMessage`, `parseMessage` (the entry point) — the envelopes that don't belong to one concept, plus the dispatcher. |
| `web/src/protocol.ts` | deleted | Replaced by the seven files above. |
| `web/src/protocol/decode.ts` | modified | Two comments naming `protocol.ts` as a live path corrected: the header no longer describes the split as future ("ahead of the settled split... W1/W3"), since it's now done; the `parseNullable` doc comment says "the former protocol.ts". |
| `web/src/render/masthead.ts` | modified | One comment ("optional wire field (protocol.ts)") repointed to `protocol/usage.ts`, plus its import re-pointed across `hello`/`prefs`/`session`/`usage`. |
| `web/src/ws.ts` | modified | Header comment corrected ("Message parsing lives in protocol/messages.ts and the protocol-version gate in protocol/hello.ts"); import re-pointed across `hello`/`messages`/`prefs`/`session`/`theme`/`update`/`usage`. |
| `web/src/app.ts`, `web/src/theme.ts`, `web/src/api/{launch,prefs,sessions,update}.ts`, `web/src/features/{actions,connection,focus,issue,launch,rail,reader,settings,surfaces,theme,tiles,update,usage,views}.ts`, `web/src/render/{confirm,context,dead,mainhead,rename,sessions,tiles,update}.ts`, `web/src/sessions/{card,context,live,rename,sort,store}.ts`, `web/src/terminal/pane.ts` | modified | Import lines re-pointed from `"../protocol"`/`"./protocol"` to the concept module each symbol actually lives in now (`protocol/hello`, `protocol/session`, `protocol/usage`, `protocol/prefs`, `protocol/update`, `protocol/theme`, `protocol/messages`) — 37 files, no barrel. |
| `docs/features/connection/spec.md` | modified | `web:` glob `web/src/protocol*.ts` → `web/src/protocol.test.ts, web/src/protocol/**` (kept the stray top-level test file's glob alongside the new directory glob — see Decisions). |
| `.claude/rules/connection.md`, `docs/features/connection/INDEX.md` | regenerated | `make gen-kb` output from the spec.md glob change above. |

## Decisions

- **Grouping**: each concept module owns its own single-field envelope (`UsageMessage` beside `Usage`/`parseUsage`, `PrefsMessage` beside `Prefs`/`parsePrefs`, `UpdateMessage` beside `UpdateInfo`, `ClaudeThemeMessage` beside `ClaudeThemeInfo`) rather than collecting every envelope into `messages.ts`. `messages.ts` holds only the envelopes with no concept module of their own (`SessionUpsert`, `SessionRemoved`, `DocChanged`, `ShellActivityMessage`), `Snapshot` (which touches every concept), the `Message` union, and `parseMessage` — read literally, plan.md's "messages.ts = envelopes + Snapshot + parseMessage/parseSnapshot" could mean *every* envelope lands there, but that would pull `Usage`/`Prefs`/`UpdateInfo`/`ClaudeThemeInfo`'s own broadcast wrapper away from the type it wraps for no reason, working against "one wire enum/concept lists its members once" the sibling units (W1) already established. `session.ts` similarly keeps `Session` itself but not `SessionUpsert`/`SessionRemoved` — those are envelopes around a session, not the session shape.
- **`asNumber`/`isNumber` home**: `session.ts`, since `parseContext`'s three nullable numeric fields are `asNumber`'s only same-file caller; exported because `messages.ts`'s `parseSnapshot` also needs it for `shellsBusy` (a list of session ids). `rg -n "isNumber|asNumber" web/src` pre-move showed both used only inside the old `protocol.ts` (session's `parseContext` and the snapshot's `shellsBusy` block) — no third caller to justify a `decode.ts` home instead.
- **Exports added, not removed**: `parseHello`, `parseModelInfo`, `parsePrefs`, `parsePrefsMessage`, `parseUsage`, `parseUsageMessage`, `parseUpdateMessage`, `parseClaudeThemeInfo`, `parseClaudeThemeMessage`, `asNumber` were module-private in `protocol.ts` and are now exported, because `messages.ts`'s `parseSnapshot`/`parseMessage` (and, for `parseModelInfo`, `usage.ts`'s `parseUsage`) call them across a file boundary. Verified by the multiset diff below — every other line moved unchanged, only these ten `function` → `export function` (or already-exported) transitions and the necessary new `import`/header lines differ.
- **Proof of a pure move**: `git show HEAD:web/src/protocol.ts` (981 lines, the W1/W2-committed baseline) diffed against the seven new files' non-import, non-blank lines, both sorted and with `export ` stripped for the comparison (so the ten intentional privacy changes above don't show as noise): the only remaining diff lines are the old top-of-file header (removed) versus each new file's own header comment (added) — every parsing/validation/type line is identical. Command and full diff are in the Handoff section below.
- **`docs/features/connection/spec.md`'s `web:` glob**: changed the literal-`protocol.ts`-only instruction to `web/src/protocol.test.ts, web/src/protocol/**` rather than just `web/src/protocol/**`, because `web/src/protocol*.ts` (the pre-existing glob) matched both `protocol.ts` (now gone) *and* the still-present `protocol.test.ts` (single-segment `*` matches `.test`) — dropping straight to `protocol/**` newly orphaned `protocol.test.ts` (`make check-kb` went from 28 to 28 problems with a *different* 28th: `web/src/protocol.test.ts: owned by no feature` replaced whatever `protocol/**`-only left uncovered). Keeping the explicit `protocol.test.ts` entry is a deliberate stopgap: W8 (web tests) is expected to delete or split that file when it re-points tests at the new modules, at which point this glob entry becomes dead and X2/doc-reconcile should drop it — noted here so it isn't mistaken for a permanent glob.
- **Not touched (explicitly out of scope for W3, per plan.md § Units)**: the ADR `files:` entries naming `web/src/protocol.ts` (`docs/adr/connection-protocol-bumps-only-on-shape-change.md`, `docs/adr/process-web-lint-format-biome.md`) — plan.md's X2 ("ADR `files:`") owns these, not this unit; `make check-kb`'s two new "files entry ... matches no file" lines below are exactly these two ADRs, a direct and expected consequence of deleting `protocol.ts` that X2 will close. Also not touched: the pre-existing `web/src/api*.ts`-related `check-kb` problems (3 ADRs, `connection/spec.md`'s `api*.ts` glob, 14 `web/src/api/*.ts` ownership lines, `surfaces.test.ts`, `sessions/permission.*.ts`) — these are W2's `api.ts` split, already broken before this unit started, not mine to fix.
- No new helper, seam, or module was invented beyond the seven concept files the plan names — nothing to add a `design:` line for.

## Handoff

**Build status**: `npx tsc --noEmit` — 0 errors outside test files; 18 pre-existing-shape test-file errors, all `TS2307: Cannot find module './protocol'`/`'../protocol'` (moved-symbol breakage, sanctioned per plan.md's "Impl agents never edit tests... list each broken test in your log for the test agent" — not fixed here). `npx vite build` (the actual bundle `make web-build` runs after `tsc`) succeeds on its own; `make web-build`'s combined `tsc && vite build` script fails only because of the same 18 test files' `tsc` errors.

Test files needing a repoint (all are `import type`/mixed-value imports from the deleted `"./protocol"`/`"../protocol"`; only `protocol.test.ts` actually fails at `vitest` runtime today since its imports are runtime values — the other 17 are type-only and currently pass at runtime, failing only under `tsc`):

1. **`web/src/protocol.test.ts`** — `isSupportedProtocolVersion, parseDocChanged, parseMessage, parseSession, PROTOCOL_VERSION, UNKNOWN_USAGE` from `"./protocol"`. New homes: `isSupportedProtocolVersion`/`PROTOCOL_VERSION` → `./protocol/hello`, `parseDocChanged`/`parseMessage` → `./protocol/messages`, `parseSession` → `./protocol/session`, `UNKNOWN_USAGE` → `./protocol/usage`. This file tests every concept's parser (hello/session/usage/prefs/update/theme/messages) in one place — mirrors `api.test.ts` in W2's handoff, likely wants splitting one-per-concept to match the production split, not just a repointed import.
2. **`web/src/app.test.ts`** — `import type { Session } from "./protocol"` → `./protocol/session`.
3. **`web/src/ws.test.ts`** — `import type { ClaudeThemeMessage, DocChanged, Hello, PrefsMessage, Session, Snapshot, UpdateInfo, UpdateMessage, Usage, UsageMessage } from "./protocol"`. New homes: `Hello` → `./protocol/hello`; `DocChanged`/`Snapshot` → `./protocol/messages`; `PrefsMessage` → `./protocol/prefs`; `Session` → `./protocol/session`; `ClaudeThemeMessage` → `./protocol/theme`; `UpdateInfo`/`UpdateMessage` → `./protocol/update`; `Usage`/`UsageMessage` → `./protocol/usage`.
4. **`web/src/render/masthead.test.ts`** — `import type { ClaudeCodeInfo, Density, ModelWindow, SessionModelInfo, Usage } from "../protocol"` → `ClaudeCodeInfo` from `../protocol/hello`, `Density` from `../protocol/prefs`, `ModelWindow`/`Usage` from `../protocol/usage`, `SessionModelInfo` from `../protocol/session`.
5. **`web/src/render/update.test.ts`** — `import type { Prefs, UpdateApplyPhase, UpdateInfo, UpdateInstallKind } from "../protocol"` → `Prefs` from `../protocol/prefs`, the other three from `../protocol/update`.
6. **`web/src/render/{context,dead,mainhead,sessions,tiles}.test.ts`, `web/src/sessions/{card,context,live,rename,sort,store}.test.ts`, `web/src/api/{launch,sessions}.test.ts`** — each imports one or two of `Session`/`SessionContext`/`Density`/`RailSort`/`SessionState` from `"../protocol"`; new homes are `../protocol/session` (`Session`, `SessionContext`, `SessionState`) and `../protocol/prefs` (`Density`, `RailSort`) per file — same mapping used for that file's production sibling in the Changes table above.

`npx tsc --noEmit` tail (18 errors, all in the files above):

```
src/api/launch.test.ts(2,30): error TS2307: Cannot find module '../protocol' or its corresponding type declarations.
src/api/sessions.test.ts(2,30): error TS2307: Cannot find module '../protocol' or its corresponding type declarations.
src/app.test.ts(2,30): error TS2307: Cannot find module './protocol' or its corresponding type declarations.
src/protocol.test.ts(9,8): error TS2307: Cannot find module './protocol' or its corresponding type declarations.
src/render/context.test.ts(11,37): error TS2307: Cannot find module '../protocol' or its corresponding type declarations.
src/render/dead.test.ts(9,30): error TS2307: Cannot find module '../protocol' or its corresponding type declarations.
src/render/mainhead.test.ts(23,30): error TS2307: Cannot find module '../protocol' or its corresponding type declarations.
src/render/masthead.test.ts(2,84): error TS2307: Cannot find module '../protocol' or its corresponding type declarations.
src/render/sessions.test.ts(3,30): error TS2307: Cannot find module '../protocol' or its corresponding type declarations.
src/render/tiles.test.ts(11,30): error TS2307: Cannot find module '../protocol' or its corresponding type declarations.
src/render/update.test.ts(12,77): error TS2307: Cannot find module '../protocol' or its corresponding type declarations.
src/sessions/card.test.ts(2,30): error TS2307: Cannot find module '../protocol' or its corresponding type declarations.
src/sessions/context.test.ts(2,37): error TS2307: Cannot find module '../protocol' or its corresponding type declarations.
src/sessions/live.test.ts(2,44): error TS2307: Cannot find module '../protocol' or its corresponding type declarations.
src/sessions/rename.test.ts(2,30): error TS2307: Cannot find module '../protocol' or its corresponding type declarations.
src/sessions/sort.test.ts(2,54): error TS2307: Cannot find module '../protocol' or its corresponding type declarations.
src/sessions/store.test.ts(2,30): error TS2307: Cannot find module '../protocol' or its corresponding type declarations.
src/ws.test.ts(13,8): error TS2307: Cannot find module './protocol' or its corresponding type declarations.
```

`npx vite build` tail (the actual embedded bundle, unaffected by the test-file breakage):

```
✓ built in 1.62s
[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification.  <- pre-existing (mermaid/cytoscape/elk vendor chunks), unrelated to this change
```

`npm run -s lint` (Biome, includes an `npx biome check --write` pass that only reformatted one wrapped import line in the new `messages.ts`):

```
Checked 210 files in 186ms. No fixes applied.
```

`make web-test` tail (1 suite fails to load — `protocol.test.ts`, a runtime-value import; the other 17 broken-import files are type-only and pass at runtime):

```
 FAIL  src/protocol.test.ts [ src/protocol.test.ts ]
Error: Cannot find module './protocol' imported from .../web/src/protocol.test.ts

 Test Files  1 failed | 53 passed (54)
      Tests  1631 passed (1631)
```

`make check-kb` tail (27 problems: 2 are new, caused directly by deleting `protocol.ts`, and are X2's ADR-`files:` sweep per plan.md; the other 25 pre-date this unit — W2's `api.ts` split left its own ADR/spec/ownership entries unreconciled, plus one unrelated daemon file):

```
docs/adr/connection-commands-http-ws-push-only.md: files entry "web/src/api.ts" matches no file        <- pre-existing (W2), not this unit
docs/adr/connection-protocol-bumps-only-on-shape-change.md: files entry "web/src/protocol.ts" matches no file   <- new, X2's to fix
docs/adr/launch-start-in-explicit-flag-auto-fallback.md: files entry "web/src/api.ts" matches no file   <- pre-existing (W2), not this unit
docs/adr/process-web-lint-format-biome.md: files entry "web/src/protocol.ts" matches no file            <- new, X2's to fix
docs/adr/update-manual-check-is-a-synchronous-post.md: files entry "web/src/api.ts" matches no file      <- pre-existing (W2), not this unit
docs/features/connection/spec.md: web entry "web/src/api*.ts" matches no file                            <- pre-existing (W2), not this unit
internal/store/watermark_test.go: owned by no feature (add it to a docs/features/<name>/spec.md glob)    <- pre-existing, unrelated (daemon)
web/src/api/*.ts, web/src/api/*.test.ts (14 files), web/src/features/surfaces.test.ts,
web/src/sessions/permission.ts, web/src/sessions/permission.test.ts: owned by no feature                 <- pre-existing (W2), not this unit
kb: 425 records, 23 features, 27 problem(s)
```

`make refs` tail (clean — 0 missing; only pre-existing gitignore notices):

```
dead-refs: 2997 references checked, 0 missing
```

`python3 .claude/skills/orchestrate/scripts/dead-refs.py` (non-`--all`, the gate script): `81 references checked, 0 missing`.

**Multiset-diff proof of verbatim code movement** (old `protocol.ts` at `git show HEAD:web/src/protocol.ts`, 981 lines, vs. the concatenation of the 7 new files — both stripped of import blocks and blank lines, sorted, with `export ` stripped so the 10 intentional new exports don't show as noise):

```
$ diff /tmp/old_norm.txt /tmp/new_norm.txt
```

Every one of the ~30 remaining diff lines is a fragment of a new per-file header comment (`// Wire types and parser for ...`, `// ... one of the protocol/ concept modules split out of the former protocol.ts (plan maintainability-cleanup W3).`) replacing the single old top-of-file header (`// Message types and parser for the daemon->UI WebSocket protocol (docs/protocol.md, protocol version 2).`) — no parsing, validation, or type-shape line differs.
