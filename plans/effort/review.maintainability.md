# Maintainability review: Effort

**Plan**: effort
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 23037 words (budget 30000)
**Scope**: 43 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (full review). Nine of them changed since cycle 1's commit `12c84dd5`: `internal/server/effort.go`, `web/src/api/launch.ts`, `web/src/features/effort.ts`, `web/src/features/focus.ts`, `web/src/main.ts`, `web/src/protocol/decode.ts` (new to the diff), `web/src/render/mainhead.ts`, and two generated or hand-written CLAUDE.md files. I re-read each of those against its siblings. The other 34 files are byte-identical to cycle 1, so their cycle 1 results carry over unchanged.

## Cycle 1 items

| Cycle 1 item | Fix commit | Verified how |
|---|---|---|
| Major 1 `[orchestrator:decision]`: the dismiss route's own 404 | `ad6c01d3` (contract, option B by decision), `3474b867` | `effort.go:27-35` now calls `parseSessionID(w, r)` and `writeUnknownSession(w)`, the same as `rename.go:49`. The constant, the helper and the `strconv` import are gone. `rg -n 'msgEffortUnknownSession\|writeEffortUnknownSession' internal` finds nothing. |
| Minor 1 `[web-impl]`: local `isNullableString` | `dd377598` | `rg -n isNullableString web/src --glob '!*.test.ts'` finds one definition (`protocol/decode.ts:31`, beside `isString`). `api/launch.ts:106-175` uses it at all eight nullable-string sites, and no inline spelling is left in the file. Web lint is clean (`06-web-lint.log`: "No fixes applied"). |
| Minor 2 `[web-impl]`: Dismiss wired outside `focus.ts` | `dd377598` | `features/effort.ts` now attaches nothing and returns `{ dismiss(id) }`. `focus.ts:159-164` attaches the `.dismiss` listener beside Stop/Resume (`:147`), Remove (`:151`) and the group button (`:154`) through structural `deps.effort`. `main.ts:60` builds `effort` before `focus`, which is `rename`'s shape. The `design:` line at `web-implementation.md:80` withdraws the old one and cites `rename.ts`, which now matches. |
| Minor 3 `[daemon-impl]`: size Decisions stale or incomplete | Fix Attempt 2 in `daemon-implementation.md` | Every daemon hit in `16-size.log` is listed with main→branch numbers that match the log: `session.go` filelen 514, `UpdateSession` 64, `scanSession` 66, `claudecodetest.go` 651, `New` 49, `launcher.go` 624 / `Resume` 42, `launchResume` 69, `manager.go` 628. Each reason holds; see Note 1 for one clause that goes further than the code. |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/claudecodetest/claudecodetest.go | transcripts.go | n/a (test helper) | filelen 651 (main 641); reason given and holds (one home for the builders) | pass |
| internal/claudecode/claudecodetest/transcripts.go | claudecodetest.go | n/a | none | pass |
| internal/claudecode/launch.go | (own `PermissionModes`/`ValidPermissionMode`) | n/a | none | pass |
| internal/claudecode/launchtranscripts.go | (own `model` scan) | no | none | pass (cycle 1 Note 6 stands) |
| internal/claudecode/status.go | (own `interpretPromptCache`) | no | none | pass (Note 4) |
| internal/server/CLAUDE.md | — | n/a (generated trailer) | none | pass (Note 5) |
| internal/server/effort.go | rename.go, respond.go | yes (Fix Attempt 2: reuses `parseSessionID`/`writeUnknownSession`) | none | pass |
| internal/server/launcher.go | launcherpast.go | yes | funlen `Resume` 42, filelen 624: already over, reason holds | pass |
| internal/server/launcherpast.go | launcher.go | yes | funlen `launchResume` 69: already over, reason holds | pass |
| internal/server/repos.go | — | n/a (one field) | none | pass |
| internal/server/server.go | — | n/a (one `register` line) | funlen `New` 49: reason holds (one registration per feature, § Composition roots) | pass |
| internal/server/sessionwire.go | (own `sessionWireCache`) | n/a | none | pass |
| internal/session/CLAUDE.md | — | n/a (generated trailer) | none | pass |
| internal/session/actions.go | reconcile.go | n/a (one line) | none | pass |
| internal/session/apply.go | status.go | n/a | none | pass |
| internal/session/effort.go | manager_rail.go, status.go, row.go | yes | none | pass |
| internal/session/manager.go | — | yes | filelen 628 (main 623), reason holds | pass |
| internal/session/reconcile.go | actions.go | n/a (one line) | none | pass |
| internal/session/row.go | (own row mappers) | n/a | none | pass |
| internal/session/session.go | neighbouring field declarations | yes | none | pass (Note 3) |
| internal/session/status.go | apply.go | n/a | none | pass (Note 4) |
| internal/session/writeorder.go | — | yes | none | pass |
| internal/store/CLAUDE.md | — | n/a (generated trailer) | none | pass |
| internal/store/migrations/0016_effort.sql | — | n/a | none | pass |
| internal/store/repo.go | session.go | yes (`repoColumns`) | none | pass |
| internal/store/session.go | repo.go, store.go (`encodeTime`) | yes | filelen 514, funlen `UpdateSession` 64 (new), `scanSession` 66 (already over); reasons hold for the plan's lines | pass (Note 1) |
| web/src/api/launch.ts | protocol/decode.ts, protocol/session.ts | n/a (fix to cycle 1 Minor 1) | none | pass |
| web/src/api/sessions.ts | (own `putSessionsGroup`) | n/a | none | pass |
| web/src/features/CLAUDE.md | — | n/a | none | pass |
| web/src/features/effort.ts | rename.ts, focus.ts | yes (`web-implementation.md:80`) | none | pass |
| web/src/features/focus.ts | rename.ts, render/mainhead.ts, render/dead.ts | yes (same line) | none | pass (Note 2) |
| web/src/features/launch.ts | launchrestore.ts | yes | filelen 824 (main 796), reason holds | pass |
| web/src/features/launchrestore.ts | launch.ts, sessions/permission.ts | yes | none | pass |
| web/src/main.ts | — | n/a (one `init` line, moved before `focus`) | none | pass |
| web/src/protocol/decode.ts | api/launch.ts, protocol/session.ts | n/a (one primitive beside `isString`) | none | pass (Note 6) |
| web/src/protocol/session.ts | protocol/decode.ts | yes | none | pass (Note 6) |
| web/src/render/effortstrip.ts | render/mainhead.ts | yes | none | pass |
| web/src/render/mainhead.ts | effortstrip.ts, own `renderStopResume` | yes (`web-implementation.md:81`) | none | pass |
| web/src/sessions/CLAUDE.md | — | n/a (generated trailer) | none | pass |
| web/src/sessions/card.ts | sessions/effort.ts | yes | none | pass |
| web/src/sessions/effort.ts | sessions/permission.ts | yes | none | pass |
| web/src/sessions/testfixtures.ts | — | n/a | none | pass |
| web/src/style.css | `.banner` (style.css:488) | n/a | none | pass (cycle 1 Note 7 stands) |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** In Fix Attempt 2, the `UpdateSession` reason says "There is no logic to extract". That is true of the lines the plan added (six columns and six arguments). It is not true of the whole function: `internal/store/session.go:295-322` has five copies of the nil-check `encodeTime(*row.X)` block. The decode side already has a helper for this (`decodeRowTimePtr`, `:425`), and `rg -n 'encodeTime\(\*' internal/store` finds no encode-side twin. Those five blocks are older than the branch, and the reason holds for what this plan changed. If the warning should ever go, an encode helper that mirrors `decodeRowTimePtr` is the real restructure. That is follow-up work, not a fix for this plan.
2. **[note]** The Dismiss button is found inline at `features/focus.ts:159` (`requireElement(".dismiss", mainheadElements.effortStrip)`). The other controls focus wires are fields on `MainheadElements` (`stopResumeBtn`, `removeBtn`, `groupBtn`) or `DeadSurfaceRefs` (`resumeBtn`). This is defensible: `MainheadElements` is what `renderMainhead` writes to, and render never touches the button. The button is static markup (`index.html:120`) that `renderEffortStrip` never replaces (it rewrites only `.sentence`), so the listener survives every pass. Also, every other `FocusDeps` member has a doc line naming its init-order guarantee, and `effort` (`focus.ts:70`) now has none: comment pass cycle 2 (`7c30b541`) dropped it. Comments belong to the comment pass.
3. **[note]** Cycle 1 Note 3 still stands. The three new `Session` fields at `internal/session/session.go:206-208` (`Effort`, `EffortWarning`, `effortRequested`) have no declaration comment naming their writers and `Manager.mu`, unlike every neighbour (`:197-204`). The guard itself is sound: every writer runs under `Manager.mu`, and `make test-race` passed (`02-test.log`). This belongs to the comment pass.
4. **[note]** Cycle 1 Note 4 still stands. These are comment-pass items: `StatusUpdate`'s "every field is nil when the payload didn't carry it" is no longer true for `Effort`, because `interpretEffort` (`claudecode/status.go:198-204`) never returns nil. The immutable-snapshot lists in `session/status.go:20-22` and `Session.Clone` leave out the effort fields.
5. **[note]** The hand-written **Owns** line of `internal/server/CLAUDE.md:3` lists the `/api/sessions` routes by file, "`rail.go` (pin, order), `rename.go` (title)", and does not mention `effort.go` (the effort-warning dismiss). Doc truth belongs to review-work.
6. **[note]** `protocol/decode.ts:31` now exports `isNullableString`, but `api/launch.ts` is its only consumer. About 20 sites across `protocol/session.ts`, `protocol/update.ts`, `protocol/usage.ts`, `protocol/hello.ts`, `api/update.ts` and `api/reader.ts` still spell `x !== null && typeof x !== "string"` inline (`rg -n '!== null && typeof \w+ !== "string"' web/src --glob '!*.test.ts'`). Three of those are new on this branch (`protocol/session.ts:283,293,294`, the effort decode), and they match the inline spelling of every other site in that file. Converting only those three would split the file's spelling. A tree-wide sweep onto the helper is a follow-up the orchestrator can propose.
7. **[note]** `render/mainhead.ts`'s `writeModelText`/`writeEffort` compare against the live DOM and write only on a difference. That matches the file's own `renderStopResume` (`if (btn.textContent !== view.label)`) and the "never rebuilt" contract in `renderMeta`'s doc comment. The `design:` line (`web-implementation.md:81`) gives the reason it differs from `effortstrip.ts`'s `dataset` signature.
8. **[note]** Size log: `internal/store/session_test.go:181` `TestUpdateSession_RoundTripsEveryField` has 111 statements, which is a funlen hit in a test file. `16-size.log` has no `dupl` line, so no test-body duplication is named and nothing is filed.
