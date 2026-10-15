# Daemon Implementation: Effort

**Plan**: effort
**Mode**: initial
**Pack**: kb: pack 37750 words (budget 30000) — WARN pack exceeds budget of 30000 words

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/claudecode/status.go` | modified | REQ-5: `StatusUpdate.Effort` (`*StatusEffort{Level *string}`) is non-nil on every interpreted post; absent key / null / empty level reads as `Level == nil`. The only reader of the status line's `effort` key (R1). |
| `internal/claudecode/launch.go` | modified | REQ-2/10/11: `EffortLevels`, `ValidEffort`, `LaunchParams.Effort`; `BuildArgv` appends `--effort <level>` after `--permission-mode` when non-empty. |
| `internal/claudecode/launchtranscripts.go` | modified | REQ-11: `PastSession.Effort` = the last `assistant` line's top-level `effort` (a later assistant line with none resets it to nil). |
| `internal/store/migrations/0015_effort.sql` | created | Schema Changes: six `session` columns + `repo.last_effort`. |
| `internal/store/session.go` | modified | `SessionRow` effort columns; `InsertSession` seeds `effort_known/effort_level/effort_requested`; `UpdateSession`, `sessionColumns`, `scanSession` carry all six. |
| `internal/store/repo.go` | modified | REQ-4: `Repo.LastEffort`, `UpsertRepoParams.Effort` written on launch (nil clears), `TouchRepo` leaves it; new `repoColumns` const shared by the four queries. |
| `internal/session/effort.go` | created | `Effort`, `EffortWarning`, `adoptEffort` (adopt + first-report check), `Session.EffortLevel()`, `Manager.ClearEffortWarning` (REQ-5/7/9). |
| `internal/session/session.go` | modified | `Effort`, `EffortWarning`, `effortRequested` fields. |
| `internal/session/row.go` | modified | Effort/warning/requested round-trip through `rowToSession` / `sessionToRow` (INV-E3/E4 on every whole-row writer, D11). |
| `internal/session/status.go`, `apply.go` | modified | `applyStatusUpdate` calls `adoptEffort` last (after the model); `ApplyStatus`'s broadcast decision gains `Effort` and `EffortWarning` pointer comparisons. |
| `internal/session/writeorder.go` | modified | `restoreChangedFields` and `restoredSessionFields` list the three new fields (`CheckSessionFieldCoverage` stays empty). |
| `internal/session/manager.go` | modified | `CreateParams.EffortRequested` / `EffortSeed` passed to `InsertSession`. |
| `internal/session/actions.go`, `reconcile.go` | modified | `RecordResume` and `RepairOwnedSession` clear `effortRequested` (a Resume-button resume cancels a pending check, edge case 11); `effort`/`effortWarning` untouched (REQ-10). |
| `internal/server/launcher.go` | modified | REQ-2/3/4/10: `createSessionRequest.Effort *string`; check order directory, model, permissionMode, effort; Launch records it on the repo, in argv and as `EffortRequested`; Resume passes `sess.EffortLevel()`. |
| `internal/server/launcherpast.go` | modified | REQ-3/11: combination message gains `effort`; transcript effort goes into argv and `EffortSeed`. |
| `internal/server/sessionwire.go` | modified | REQ-5/7: required keys `effort` and `effortWarning` (null values, no `omitempty`). |
| `internal/server/repos.go` | modified | REQ-4: `lastEffort`. |
| `internal/server/effort.go` | created | REQ-9: `DELETE /api/sessions/{id}/effort-warning`, 204 / 404 `unknown_session`. |
| `internal/server/server.go` | modified | one `register(s, newEffortFeature(...))` line. |

## Decisions

- Measured (scratch session-package test, deleted): launch `max` → `effort=null warning=null pending="max"`; first post `high` on Opus 4.5 → `effort={level:high} warning={req:max actual:high model:Opus 4.5} pending=""`, 1 upsert; repeat post 0 upserts; store round trip kept effort and warning; dismiss 1 upsert, second dismiss 0; post without key → `{level:null}`; launch `high` + first post without key → `warning={req:high actual:null}`; `EffortSeed medium` → `effort={level:medium}` with no check, then `low` → `{level:low}`, no warning; `CheckSessionFieldCoverage()` empty.
- Measured (scratch server-package test, deleted): `effort` max / null / absent accepted; `HIGH` and `auto` → `400 invalid_request "effort must be one of low, medium, high, xhigh, max"`; invalid permissionMode + invalid effort reports permissionMode; resume form with `effort: null` accepted, `effort: "low"` → `...cannot be combined with title, model, permissionMode or effort`; `BuildArgv` → `claude --model m --resume x --permission-mode auto --effort medium`, none when empty.
- A non-object `effort` key (wrong JSON type) decodes as no level, like an absent one; ingest has already required the payload to be a JSON object.
- `RepairOwnedSession` (only reachable from the Resume button's already-exists repair) clears the pending check like `RecordResume`; reconcile's `reviveOwnedSession` does not, so a daemon restart keeps a pending check (edge case 15).
- `effort`/`effortWarning` model name: `effortWarning.model` is the session's model display name after the post, so a launch whose first post carries no model names the launch value (the model id until a post confirms it), never null unless the session had no model at all.
- REQ-14 (canary static `--effort` presence) is deliberately not done here: it is an edit to `test/canary/static_test.go`, a test file; listed in Handoff.
- `design:` `internal/session/effort.go` holds the effort types, the status-post adoption + first-report check and `ClearEffortWarning`, matching the plan's `effort*.go` placement. Reused: `stringPtrEqual`, `derefOrZero`/`ptrOrNil` (row.go), `persistWholeRowLocked` with a `MarkSeen`-shaped body (persist and broadcast only when it was set). Grep `rg -n 'func (derefOr|deref|strDeref|stringOrEmpty|valueOr)' internal` found only `derefOrZero`; `rg -n 'func copyString|func cloneString|func strPtr' internal` found nothing, hence the one-line `copyString` (a status reading's string must not alias the update).
- `design:` effort state is three Session fields (`Effort`, `EffortWarning` as immutable pointer snapshots replaced on change, `effortRequested` as an in-memory+persisted string), so `restoreChangedFields` compares them like `Model`/`Cache`. Writers named at the declaration: `ApplyStatus`, `CreateSession`, `RecordResume`/`RepairOwnedSession`, `ClearEffortWarning`, all under `Manager.mu`; the write-turnstile persists them. Matched sibling: `Cache`/`adoptCache`.
- `design:` `Session.EffortLevel()` exists because inlining the two nil checks in `Resume` took its cyclomatic complexity to 17 (gocyclo ceiling 15); the helper is the single place a resume reads "the level to pass back".
- `design:` `CreateParams` takes `EffortRequested` (launch, starts the check) and `EffortSeed` (Resume-tab, shown at once, no check) as two plain strings rather than a union type: the two are mutually exclusive by construction in the two callers, and `InsertSessionParams` mirrors them as `*string` the way `PendingResumeClaudeSessionID` does.
- `design:` `internal/server/effort.go` is a feature type with `mount`, registered in one line in `server.go`; sibling matched: `rename.go` (`renameFeature`, `parseSessionID`, `writeUnknownSession`, `context.WithoutCancel`). A launch-form field needs no new type (`createSessionRequest.Effort *string`: absent and null mean the same on the launch form, and on the resume form both mean "not given", so the `connection-absent-vs-null` RawMessage rule does not apply).
- `design:` `repoColumns` const in `store/repo.go`: the same ten-column list was spelled four times (`UpsertRepo`, `TouchRepo`, `GetRepo`, `ListRepos`) and a twelfth column would have meant four edits; no `repoColumns`-like const existed (`rg -n 'repoColumns|sessionColumns' internal/store` → only `sessionColumns` in session.go, which this matches).
- Size: no new warning. `internal/store/session.go` went 476 → 499 lines (under the 500 threshold); `internal/server/launcher.go` (611 → 624), `internal/session/manager.go` (623 → 628), `Resume` and `launchResume` were already over before this plan and gained only the new request field and params.
- All REQs on the daemon side: REQ-2/3 (launcher.go, launchcreate path), REQ-4 (repo.go, repos.go, launcher.go), REQ-5/7 (status.go, effort.go, apply.go), REQ-9 (effort.go), REQ-10 (launcher.go Resume), REQ-11 (launchtranscripts.go, launcherpast.go). REQ-1, 6, 8, 12, 13 are web. REQ-14 handed off (above).
- doc-delta: `launch` § Doc Delta says a launched level the first report contradicts "raises the launch-mismatch warning"; true as shipped, with the condition that a model with no effort setting counts as contradicting (`actual: null`).
- doc-delta: `actions` / `past-sessions`: a Resume-button resume also cancels a still-pending first-report check (edge case 11), which the spec sentences do not yet say.

## Handoff

**Build status**: `go build ./...` exits 0; `gofmt -l .` empty; `go vet ./...` clean; `make lint` → `0 issues.` (test files still compile, so the lint gate is not blinded; `golangci-lint run --tests=false` not needed).

Gate evidence: `go test -race -count=1 ./internal/claudecode/... ./internal/session/... ./internal/store/... ./internal/server/...` → claudecode ok, session ok, and only the sanctioned failures below (a `TestWrapperReply_AnAnswerThatNeverComesPrintsNothing` 5.42 s > 5 s timing flake failed once under load and passed on the rerun).

Sanctioned breakage (frozen assertions the delta changes) and test work for daemon-tests:

- `internal/store/migrate_test.go:39,43,60` and `internal/store/store_test.go:52` (`TestMigrate_AppliesInitSchema`, `TestMigrate_SecondCallIsANoOp`, `TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations`): migration count and max version 14 → 15 (Schema Changes, `0015_effort.sql`).
- `internal/server/launcherpast_test.go:96` (`TestValidateResumeRequest/*combined*`, three rows): the message is now `resumeSessionId cannot be combined with title, model, permissionMode or effort` (Protocol Contract, POST /api/sessions resume form).
- `internal/server/sessionwire_test.go:216`: the Session key list gains `effort`, `effortWarning` (does not fail today; should assert the two required keys and their null values).
- `internal/store/session_test.go` `TestUpdateSession_RoundTripsEveryField` and `repo_test.go`: add the six session columns and `last_effort`.
- `internal/claudecode/claudecodetest/claudecodetest.go`: a status-post builder that can carry `effort.level` (and omit it), so server tests do not spell the key.
- `test/canary/static_test.go` (REQ-14 / D14): add the `--effort` flag string to the needles in `TestInstalledBinaryCarriesInterfaceStrings`.
- New unit tests: D7 (INV-E1..E5 table in `internal/session`), D4/D12 (`BuildArgv`, transcript scan), D13 (dismiss route), D8 (`lastEffort`).
- `kb refs` reports one missing path outside daemon scope: `web/e2e/helpers/effort.ts:344  scripts/contrast-pairs.json  missing (path)` (a web e2e file's citation; owner: web-impl / e2e-specs).
- Untouched on purpose: `plans/effort/orchestration-state.json`, every `web/` file (web-impl's uncommitted work).

## Fix Attempt 1 (pre-review fix)

**Failures addressed**: `TestHandleDismissEffortWarning_UnknownSessionIs404WithTheContractMessage` (unknown_id, malformed_id) — the dismiss route served the shared `unknown session id` where the Protocol Contract (and `docs/protocol.md:1034`) says `no session with that id`.

**Changes made**: `internal/server/effort.go` — new `msgEffortUnknownSession` and `writeEffortUnknownSession` (code from the shared `codeUnknownSession`, message the contract's). Both paths that reach this route's 404 now use it: (1) a malformed `{id}` — the handler parses `{id}` itself instead of `parseSessionID`, which writes the shared message; (2) `session.ErrUnknownSession` from `ClearEffortWarning`. The route has no other 404 source (no `sessionOr404`, no guard 404).

Blast radius: `respond.go`'s `msgUnknownSession`, `writeUnknownSession`, `parseSessionID` and `sessionOr404` are untouched, so every other consumer (rail, rename, actions, groups, launcher Resume, locate/reader/shells/issue) is byte-identical. `rg -n "unknown session id|no session with that id" internal/server --glob '!*_test.go'` shows only the unchanged shared sites plus the new one.

Re-run of the failing test: `go test -race -count=1 -run 'Effort|UnknownSession' ./internal/server/ -v` → `--- PASS: TestHandleDismissEffortWarning_UnknownSessionIs404WithTheContractMessage` and `TestUnknownSessionEnvelope_ByteIdenticalAcrossMigratedCallSites` still passes. Full package: `go test -race -count=1 ./internal/server/` → `ok 340.620s`. `gofmt -l .` empty, `go build ./...` 0, `make lint` → `0 issues.`.

**Decisions**:
- design: the 404 for this route is a one-off helper beside the shared one rather than a message parameter on `writeUnknownSession` — `rg -n "func writeUnknownSession|func parseSessionID" internal/server` finds only the shared pair, which `respond_unknown_session_test.go` pins; changing their signatures would touch every call site. Matches `launcherrors.go` `notFound`, which also owns its message beside the shared constants.
- doc-delta: `docs/protocol.md` lines 794, 837, 871 and 1034 already describe `unknown_session` in prose or the contract message; only the effort-warning route serves `no session with that id` as the message text, every other route serves `unknown session id`. Nothing to amend unless doc-reconcile wants the divergence noted.

## Fix Attempt 2 (review cycle 1)

**Failures addressed**: maintainability Minor 3 (stale/incomplete size Decisions line); the developer's decision on the dismiss-404 message (kb:adr/focus-effort-dismiss-404-uses-shared-body: option B, the shared `unknown session id`).

**Changes made**: `internal/server/effort.go` — removed `msgEffortUnknownSession` / `writeEffortUnknownSession` and the hand-written `strconv.ParseInt`; the handler now calls `parseSessionID` and `writeUnknownSession` exactly as `rename.go` does. Paths reaching the route's 404: (1) malformed `{id}` → `parseSessionID` → `writeUnknownSession`; (2) `session.ErrUnknownSession` from `ClearEffortWarning` → `writeUnknownSession`. No other 404 source. Blast radius: `respond.go` untouched, so every other consumer of the shared pair is byte-identical; `rg -n "msgEffortUnknownSession|writeEffortUnknownSession"` now finds nothing. Repro (`go test -race -count=1 -run 'UnknownSession|Effort|Rename|Groups|Actions' ./internal/server/`): only `TestHandleDismissEffortWarning_UnknownSessionIs404WithTheContractMessage/{unknown_id,malformed_id}` fail, both now served `{"error":{"code":"unknown_session","message":"unknown session id"}}` against the frozen `no session with that id` assertion (sanctioned, Handoff below); `respond_unknown_session_test.go` still passes. `go build ./...` 0, `gofmt -l .` empty, `make lint` → `0 issues.`.

**Decisions**:
- Supersedes the `Size:` line in `## Decisions` above (its numbers predate the `3e5da467` merge). Every size hit on a touched file, from `make size-warn` after the merge (base = main):
  - `internal/store/session.go` filelen 514 (main 491): new hit. It holds `SessionRow`, insert/update/get/scan and the one `sessionColumns` list for a single table, and the six effort columns add fields to each of those; splitting the table's read and write halves across files only to pass the line count would scatter one column list.
  - `internal/store/session.go` `UpdateSession` funlen 64 (main 60): new hit. The body is one `UPDATE session SET` listing every column plus its argument list; three more column lines and three arguments cross 60. There is no logic to extract.
  - `internal/store/session.go` `scanSession` funlen 66 (main 62): already a hit. It is one `Scan` over every column plus the decode of the nullable columns; the effort columns add four lines.
  - `internal/claudecode/claudecodetest/claudecodetest.go` filelen 651 (main 641): already a hit, +10 lines: an `EffortLevel` option on two status-post option structs and the `addEffort` helper both builders call. The file is the single home of the synthesized hook and status-line builders, so the new key belongs beside its siblings.
  - `internal/server/server.go` `New` statements 49 (main 48): already a hit; the one `register(s, newEffortFeature(...))` line is the registration `docs/conventions.md` § Composition roots prescribes, one statement per feature.
  - `internal/server/launcher.go` filelen 624 (main 611): already a hit, +13 lines (the `effort` request field, its validation and the launch/resume pass-through). `Resume` statements 42: already a hit; the plan added one struct field to its literal, no statement.
  - `internal/server/launcherpast.go` `launchResume` funlen 69 (main 62): already a hit, +7 lines for the transcript's effort string handed to argv and `EffortSeed`.
  - `internal/session/manager.go` filelen 628 (main 623): already a hit, +5 lines (`CreateParams` effort fields and their pass to `InsertSession`).
  - Splits made only to clear any of these were not made.
- design: `effort.go`'s 404 now reuses the shared `parseSessionID` / `writeUnknownSession` (matches `rename.go`); the one-off helper from Fix Attempt 1 is gone, so that attempt's `design:` line about a per-route 404 helper no longer applies.
- doc-delta: the Fix Attempt 1 note that `no session with that id` is served only by the effort-warning route is wrong; every route, including `DELETE /api/sessions/{id}/effort-warning`, serves `unknown session id`.

## Handoff (Fix Attempt 2)

**Build status**: `go build ./...` exits 0; `make lint` → `0 issues.` (test files still compile; `--tests=false` not needed).

Sanctioned breakage for daemon-tests: `internal/server/effort_test.go:51` (comment) and `:67`, `TestHandleDismissEffortWarning_UnknownSessionIs404WithTheContractMessage` (`unknown_id`, `malformed_id`): expect message `no session with that id`; the contract now reads `{"error": {"code": "unknown_session", "message": "unknown session id"}}` (kb:adr/focus-effort-dismiss-404-uses-shared-body). Update the expected body and the test's name/comment (it no longer has a route-specific message).
