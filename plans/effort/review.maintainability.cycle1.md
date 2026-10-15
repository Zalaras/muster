# Maintainability review: Effort

**Plan**: effort
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 21691 words (budget 30000)
**Scope**: 42 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/claudecodetest/claudecodetest.go | transcripts.go | n/a (test helper) | filelen 651 (main 641), no reason given | Minor 3 |
| internal/claudecode/claudecodetest/transcripts.go | claudecodetest.go | n/a | none | pass |
| internal/claudecode/launch.go | (own `PermissionModes`/`ValidPermissionMode`) | n/a (constants mirror `PermissionModes`) | none | pass |
| internal/claudecode/launchtranscripts.go | (own `model` scan) | no | none | pass (Note 6) |
| internal/claudecode/status.go | (own `interpretPromptCache`) | no | none | pass (Note 4) |
| internal/server/CLAUDE.md | — | n/a (generated trailer) | none | pass (Note 9) |
| internal/server/effort.go | rename.go, respond.go, launcherrors.go | yes (rename.go matched; Fix Attempt 1's one-off 404) | none | Major 1 |
| internal/server/launcher.go | launcherpast.go | yes (`createSessionRequest.Effort *string`) | funlen `Resume` 42 stmts, filelen 624: already over, reason holds | pass |
| internal/server/launcherpast.go | launcher.go | yes | funlen `launchResume` 69: already over, reason holds | pass |
| internal/server/repos.go | — | n/a (one field) | none | pass |
| internal/server/server.go | — | n/a (one `register` line) | funlen `New` 49 stmts: already over, no reason given | Minor 3 |
| internal/server/sessionwire.go | (own `sessionWireCache`) | n/a | none | pass |
| internal/session/CLAUDE.md | — | n/a (generated trailer) | none | pass |
| internal/session/actions.go | reconcile.go | n/a (one line) | none | pass |
| internal/session/apply.go | status.go | n/a | none | pass |
| internal/session/effort.go | manager_rail.go (`MarkSeen`), status.go (`adoptCache`), row.go | yes | none | pass (Notes 3, 8) |
| internal/session/manager.go | — | yes (`CreateParams` two strings) | filelen 628 (main 623), reason holds | pass |
| internal/session/reconcile.go | actions.go | n/a (one line) | none | pass |
| internal/session/row.go | (own cache/model row mappers) | n/a | none | pass |
| internal/session/session.go | (neighbouring field declarations) | yes | none | pass (Note 3) |
| internal/session/status.go | apply.go | n/a | none | pass (Note 4) |
| internal/session/writeorder.go | — | yes (`restoreChangedFields`) | none | pass |
| internal/store/CLAUDE.md | — | n/a (generated trailer) | none | pass |
| internal/store/migrations/0016_effort.sql | — | n/a | none | pass |
| internal/store/repo.go | session.go (`sessionColumns`) | yes (`repoColumns`) | none | pass |
| internal/store/session.go | repo.go | yes | **new** filelen 514 (main 491), **new** funlen `UpdateSession` 64 (main 60), `scanSession` 66 (main 62, already over); the Decisions reason is stale | Minor 3 |
| web/src/api/launch.ts | protocol/decode.ts, protocol/session.ts | no | none | Minor 1 |
| web/src/api/sessions.ts | (own `putSessionsGroup`) | n/a | none | pass |
| web/src/features/CLAUDE.md | — | n/a | none | pass (Note 9) |
| web/src/features/effort.ts | focus.ts, rename.ts, usage.ts, groups.ts | yes (claims the usage.ts/rename.ts shape) | none | Minor 2 |
| web/src/features/focus.ts | effort.ts | n/a (one element ref) | none | pass |
| web/src/features/launch.ts | launchrestore.ts | yes | filelen 824 (main 796), reason holds | pass (Note 1) |
| web/src/features/launchrestore.ts | launch.ts, sessions/permission.ts | yes | none | pass |
| web/src/main.ts | — | n/a (one `init` line) | none | pass |
| web/src/protocol/session.ts | protocol/decode.ts | yes (beside `PERMISSION_MODES`) | none | pass |
| web/src/render/effortstrip.ts | render/railsections.ts (signature memo), render/mainhead.ts | yes | none | pass |
| web/src/render/mainhead.ts | effortstrip.ts | n/a | none | pass |
| web/src/sessions/CLAUDE.md | — | n/a (generated trailer) | none | pass |
| web/src/sessions/card.ts | sessions/effort.ts | yes (`EffortReadout`) | none | pass |
| web/src/sessions/effort.ts | sessions/permission.ts | yes | none | pass |
| web/src/sessions/testfixtures.ts | — | n/a | none | pass |
| web/src/style.css | `.banner` (style.css:488) | n/a | none | pass (Note 7) |

## Issues

### Critical

None.

### Major

1. **[orchestrator:decision]** `DELETE /api/sessions/{id}/effort-warning` serves its own 404 message, which puts back a divergence an earlier cleanup removed. `internal/server/effort.go:14-17` adds `msgEffortUnknownSession = "no session with that id"` and `writeEffortUnknownSession` beside the shared `respond.go:84` `msgUnknownSession = "unknown session id"` / `respond.go:87` `writeUnknownSession`. At `effort.go:34-37` the handler also parses `{id}` by hand with `strconv.ParseInt`, where its sibling `rename.go:49` calls `parseSessionID(w, r)`. `respond_unknown_session_test.go:40-55` records that six call sites were collapsed into "one spelling instead of six" and that the test guards "against a *future* divergence"; this route is that divergence, with the same `unknown_session` code and a different message. The cause is the contract: `plans/effort/plan.md:127` / `docs/protocol.md:1034` give the message as `no session with that id`, which is the prose description that `docs/protocol.md:794,837,871` use, and those same lines give the body as `"message": "unknown session id"`. That makes it a contract choice and not an impl defect (cites conventions § Design "One owner per concept"):
   - **Option A — keep the contract as written:** this route keeps its own message, its one-off writer and its hand-rolled id parse. It costs a second `unknown_session` spelling that `TestUnknownSessionEnvelope_ByteIdenticalAcrossMigratedCallSites` does not cover, and a reader has to learn that one route differs.
   - **Option B — amend the contract to the shared body:** `docs/protocol.md:1034` and the plan's contract give `"message": "unknown session id"`, and the handler uses `parseSessionID` and `writeUnknownSession` like `rename.go`. `effort.go` loses its constant, its helper and its `strconv` parse. The dismiss 404 tests change their expected message, and the route can join the byte-identical table.

### Minor

1. **[web-impl]** `web/src/api/launch.ts:89` adds a module-local `isNullableString`. Two problems follow. First, the module that owns decode primitives says so: `protocol/decode.ts:1-5` reads "This module owns how a JSON primitive … and 'null or one of these' are recognised … Every module under `web/src/protocol/` and `web/src/api/` imports from here". Second, the same file now spells the same check two ways: `parseRepo` (lines 110-116) uses the helper, while lines 156, 157, 159 and 179 keep the inline `x !== null && typeof x !== "string"`. `rg -n 'function (is\w*Nullable\w*|isStringOrNull|nullableString|asNullableString)' web/src` finds only this one definition, and no `design:` line covers it. A fix must make two things true: the nullable-string check has one home (exported from `protocol/decode.ts` beside `isString`, if it is kept at all), and `api/launch.ts` spells the check one way throughout. `parseRepo` must stay under the Biome cognitive-complexity ceiling.
2. **[web-impl]** The strip's Dismiss is the only Focus-pane control wired outside `features/focus.ts`, and the strip now has two owners. `features/focus.ts:118` looks up `#effort-strip` for rendering. `features/effort.ts:10` separately looks up `#effort-strip .dismiss` and attaches its listener. Every other mainhead control gets its listener in `focus.ts`: Stop/Resume at `:147`, Remove at `:151`, and the group button at `:154`, which goes through `deps.groups.openMoveMenu`. Rename hands `mainheadRenameHandlers` to focus, and focus attaches them (`rename.ts:15-17`, `focus.ts` `attachRenameEditor`). The `design:` line says `features/effort.ts` "takes `usage.ts`/`rename.ts`'s shape", but `rename.ts` attaches nothing to the mainhead, so the line cites a precedent that does the opposite (conventions § Design "Match the siblings", "One owner per concept"). A fix must make one of these true: (a) the Dismiss listener is attached where the other Focus-pane controls are, and reaches the dismiss call through a structural dep or handler as rename and groups do; or (b) a `design:` line names the actual reason the strip is the exception, and cites no sibling that contradicts it.
3. **[daemon-impl]** The Decisions size line is stale and incomplete. It reads "no new warning. `internal/store/session.go` went 476 → 499 lines (under the 500 threshold)". The gates' size log measures `internal/store/session.go` at 514 lines; main has 491, so this is a new filelen hit. It also reports `UpdateSession` at 64 lines; that is a new funlen hit, since it is 60 on main and the threshold is >60. Both came after the `3e5da467` merge of main. Two other hits on touched files have no reason at all: `claudecodetest.go` filelen 651 (main 641) and `server.go` `New` funlen 49 statements. Each warning is fine with a reason that holds (conventions § Design "Size is read, not obeyed"; kb:adr/process-size-linters-warn-never-fail). A fix must make the Decisions line account for every size hit on a touched file, each with a reason the code bears out, for example that `UpdateSession` is one UPDATE listing every column. A split made only to clear a warning does not count.

### Notes

1. **[note]** The size reason for `web/src/features/launch.ts` (796 → 824) holds. The added lines are one more form row's select, restore and touched wiring, alongside Model and Permission mode in the same controller. The reasons for `launcher.go` `Resume`, `launcherpast.go` `launchResume`, `manager.go` and the pre-existing `scanSession` hit also hold: each was over on main and gained only the new field.
2. **[note]** `repoColumns` (`internal/store/repo.go:25`) is a good reuse. It matches `sessionColumns` and removes four copies of the same column list.
3. **[note]** The three new `Session` fields at `internal/session/session.go:206-208` have no declaration comment. Every neighbour names its writers and `Manager.mu` (for example `:197`, `:200-203`). The daemon `design:` line says "Writers named at the declaration", which is not true in the tree. The guard itself is sound: every writer (`adoptEffort` via `ApplyStatus`, `CreateSession`, `RecordResume`, `RepairOwnedSession`, `ClearEffortWarning`) runs under `Manager.mu`, the pointer fields are replaced rather than mutated, and `make test-race` passed. Comment upkeep belongs to the comment pass.
4. **[note]** `claudecode.interpretEffort` (`status.go:198-204`) never returns nil, so the `reading == nil` branch in `session.adoptEffort` (`effort.go:28`) is reachable only from a hand-built `StatusUpdate`. The `StatusUpdate` doc comment ("Every field is nil when the payload didn't carry it") is now false for `Effort`. Two other comments now leave out `Effort`/`EffortWarning`: the immutable-snapshot list in `applyStatusUpdate`'s comment (`session/status.go:20-22`) and the one in `Session.Clone`'s comment (`session.go:228-229`). These are comment-pass items.
5. **[note]** `internal/server/effort.go` otherwise matches `rename.go`: a feature type with `mount`, one-line `register`, `context.WithoutCancel`, and an error switch on `session.ErrUnknownSession`. `session.ClearEffortWarning` mirrors `MarkSeen` (`manager_rail.go:169-187`) line for line.
6. **[note]** `launchtranscripts.go:212` assigns `s.effort = line.Effort` on every assistant line. The `model` assignment just above it is guarded by `!= ""`. If "the last assistant line had no effort, so resume without `--effort`" is intended, the asymmetry is correct; whether it is intended is review-work's call.
7. **[note]** `.effort-strip` (`style.css:910-927`) repeats `.banner`'s shape (`style.css:488-500`: full width, token background, bottom border, mono font, `flex: none`, a `[hidden]` rule) with a new `--warn-*` family. `.banner.neutral` is a precedent for variants. The strip adds a flex row, a glyph and a button, so sharing the rule is not clearly better. No change requested.
8. **[note]** `copyString` (`session/effort.go:57`) is a package-wide pointer helper, but it lives in a feature file while `derefOrZero`/`ptrOrNil` live in `row.go`. The implementer's `rg` shows nothing existing for it. Taste only.
9. **[note]** The hand-written parts of two CLAUDE.md files leave out `effort`: the route list in `internal/server/CLAUDE.md`'s **Owns** line ("`rail.go` (pin, order), `rename.go` (title)") and the **Features** list in `web/src/features/CLAUDE.md`. Doc truth belongs to review-work. The `web-components` diagram's module counts were updated on the branch (37 `features/` modules, measured).
10. **[note]** The one red gate line (`e2e/effort-header.spec.ts:893`, the Dark-theme `--warn` hue check) belongs to review-work and review-browser.
