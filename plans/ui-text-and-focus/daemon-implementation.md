# Daemon Implementation: ui-text-and-focus

**Plan**: ui-text-and-focus
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/store/migrations/0007_title_override.sql` | created | REQ-9: `session.title_override TEXT`, nullable, no default/backfill, verbatim per Schema Changes. |
| `internal/store/session.go` | modified | `SessionRow.TitleOverride *string`; `sessionColumns` and `scanSession` read it; `UpdateSession` writes it. `InsertSessionParams` untouched — a new session never starts with an override. |
| `internal/session/session.go` | modified | `Session.TitleOverride *string`; new `DisplayTitle() *string` (REQ-11 precedence: override, else Title, else nil); new unexported `stringPtrEqual` helper shared by `SetTitle`/`ApplyStatus`'s broadcast checks. |
| `internal/session/status.go` | modified (comment only) | Logic unchanged (still returns `bool`, still never reassigns `TitleOverride`); doc comment now names `TitleOverride` among the fields `applyStatusUpdate` never reaches and explains that the display-title/broadcast distinction is the caller's job (`Manager.ApplyStatus`), not this function's — kept the signature stable specifically so `status_test.go` (which asserts on the returned `bool`) needed no change. |
| `internal/session/manager.go` | modified | `ApplyStatus` now captures `DisplayTitle()`/`Model`/`Context` before calling `applyStatusUpdate`, persists whenever `applyStatusUpdate` reports a change (unchanged behaviour), but broadcasts only when the wire-visible triple actually moved (REQ-12: a Claude-name refresh while an override is set persists but does not broadcast). New `SetTitle(ctx, id, title *string) (bool, error)`: sets/clears `TitleOverride` under the lock, computes changed from `(DisplayTitle(), TitleOverride)` before/after, persists+broadcasts only on a real change, returns `ErrUnknownSession` for a missing id. `rowToSession`/`sessionToRow` carry `TitleOverride`. |
| `internal/server/sessionwire.go` | modified | `sessionWire.Title` now comes from `s.DisplayTitle()` (was the raw `Title` field); new `TitleOverride *string \`json:"titleOverride"\`` populated straight from `s.TitleOverride`. |
| `internal/server/sessions.go` | modified | New `setTitleRequest` (decodes `title` as `json.RawMessage` so an absent key is distinguishable from an explicit `null` — a missing key leaves the field at its nil zero value, a JSON `null` is copied through verbatim as the 4 literal bytes); new `handleSetTitle`: 400 for a missing key, non-string/non-null value, or a trimmed (rune-counted) length outside 1–100; delegates to `Manager.SetTitle`; 404 `unknown_session`; 204 on success. |
| `internal/server/server.go` | modified | Registered `PUT /api/sessions/{id}/title` beside `/pin`, same `requireCookie` wrapping. |

## Decisions

- Kept `applyStatusUpdate`'s signature as `bool` (unchanged from before this plan) rather than introducing a `{Persist, Broadcast}` result struct, even though REQ-12 needs the two questions answered separately. First attempt used the struct and broke `internal/session/status_test.go` (17 call sites assert `changed := applyStatusUpdate(...)` as a plain `bool` — confirmed by `go vet` failing at `status_test.go:109:19: cannot use changed (variable of struct type statusUpdateResult) as bool value`). Per the plan's own Affected Files note ("`internal/session/status.go` — unchanged logic"), moved the persist-vs-broadcast split into `Manager.ApplyStatus` instead, comparing `DisplayTitle()`/`Model`/`Context` before and after the call. This produces the same REQ-12 behaviour (verified: `TestApplyStatus_NoChangeDoesNotBroadcast` and the rest of `internal/session`'s suite pass) without touching the test file at all — no test-file break to hand off for this piece.
- `SetTitle`'s no-op path (edge cases 3/4: clearing an already-nil override, or setting to the same override string) neither persists nor broadcasts, matching `SetPinned`/`SetOrder`'s existing "nothing changed → skip both" pattern in this same file.

## Handoff

**Build status**: `go build ./...` exits 0.
`go vet ./...` clean. `gofmt -l .` empty. `make lint` → "0 issues." `golangci-lint run --tests=false ./...` → "0 issues." (run because two test files below carry sanctioned breakage, per the hard gate note — confirms no production-code lint findings were being hidden by them.)

**Sanctioned test breakage — not mine to fix, hardcoded migration count**:
- `internal/store/migrate_test.go` — `TestMigrate_AppliesInitSchema` (asserts `schemaMigrationsCount`/`MAX(version)` == 6) and `TestMigrate_SecondCallIsANoOp` (asserts `before` == 6) hardcode the total migration count in a comment-and-literal pattern that every prior migration-adding plan bumped in turn (the comment on `TestMigrate_AppliesInitSchema` names m1-sessions/m3-gauges/m4-reconcile/usage-model-bar/order-sidebar, each contributing one to the count). Adding `0007_title_override.sql` makes a fresh DB apply 7 migrations, not 6. Both literals need `6 → 7` and the comments need `+ order-sidebar` → `+ order-sidebar (0006) + ui-text-and-focus (0007_title_override)`.
- `internal/store/store_test.go` — `TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations` asserts `schemaMigrationsCount(t, st2.db) == 6` with the same comment pattern; same `6 → 7` fix.
- Confirmed via `go test ./internal/store/...`: all three fail with `expected: 6 / actual: 7` and nothing else — this is purely the literal-count staleness, not a logic problem in the migration itself (`internal/store/session.go`'s round-trip is otherwise exercised by the rest of that package's suite, which passes).

**Unrelated pre-existing flakiness observed, not caused by this plan's changes** (no files in `internal/claudecode`/shell-wrapper code were touched): `internal/server`'s `TestWrapperScriptsShellRoundTrip_DaemonUnreachableExitsSilentlyAndFast` and `TestWrapperScriptsShellRoundTrip_UnmanagedSessionProducesZeroRequests` each failed once across several `go test ./internal/server/...` runs (one `signal: killed`, one transient) and passed on every retry, including a full `make test` run that showed `internal/server` green. Matches the "make test intermittently red on main" behaviour already on file for this repo.

None of the daemon files I edited need any test-file changes beyond the two named above (both are pre-existing store-package tests unrelated to session/server logic).
