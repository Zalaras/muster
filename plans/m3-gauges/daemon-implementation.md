# Daemon Implementation: M3 — Gauges

**Plan**: m3-gauges
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/claudecode/status.go` | created | `StatusUpdate`/`InterpretStatus` (REQ-1/2/3): the only place status-line payload keys (`session_name`, `model`, `context_window`, `rate_limits`) are read. Pure function of payload bytes — no wall clock — so `SampledAt` is left zero and stamped later by `usage.Aggregator.Record`. |
| `internal/usage/usage.go` | created | `Bucket`, `Model`, `Sample`, `Snapshot` — the neutral SPEC §9.6 seam type (REQ-5). |
| `internal/usage/aggregator.go` | created | `Aggregator` (REQ-5/6/7): in-memory current sample, `Record` (value-level dedup — bucket values + model, sampledAt excluded — persists + broadcasts only on real change), `Current` (boot state is zero-value/unknown — no hydration). |
| `internal/store/migrations/0003_gauges.sql` | created | `usage_sample` table + session's 4 new nullable columns, verbatim per plan Schema Changes (REQ-8). |
| `internal/store/usage.go` | created | `UsageSampleRow` + `Store.InsertUsageSample` — stamps `at` as RFC3339Nano itself (mirrors `InsertEvent`'s own receipt-time stamping). |
| `internal/store/store.go` | modified | `InsertEvent`'s `received_at` now stamped `time.RFC3339Nano` (REQ-10/D13). |
| `internal/store/session.go` | modified | `SessionRow` gains `ModelDisplayName`, `ContextUsedPct`, `ContextTotalInputTokens`, `ContextWindowSize`; `UpdateSession`/`sessionColumns`/`scanSession` round-trip them. `InsertSession` untouched — new columns default NULL. |
| `internal/session/session.go` | modified | New `Context` type (`UsedPct`/`TotalInputTokens`/`WindowSize`, all-or-nothing — INV-2) and `Session.Context *Context` field. |
| `internal/session/status.go` | created | `applyStatusUpdate(sess, update) bool` — title/model/context refresh, each adopted only when present and only when it actually differs; never touches state/attention/failure/alive/compactions/permissionMode (INV-1, by construction — no code path reaches them). |
| `internal/session/manager.go` | modified | `Manager.ApplyStatus` (REQ-4): persists+broadcasts only when `applyStatusUpdate` reports a change (REQ-4/INV-5's session-side twin). `rowToSession`/`sessionToRow` gain the Context round-trip and the model-display-name persist-with-ID-fallback (REQ-16). |
| `internal/session/machine.go` | modified | Clear-rebind branch resets `sess.Context = nil` alongside the existing compactions/lastActivity reset (REQ-9). |
| `internal/server/ingest.go` | modified | `ingestQueue` gains a `usage *usage.Aggregator` field; `process` branches `status_line` to a new `processStatus` (InterpretStatus → `manager.ApplyStatus` → `usage.Record`, sequentially on the one worker goroutine — R4) instead of the generic `Interpret`/`manager.Apply` path (which would otherwise broadcast a no-op `sessionUpsert` on every status post, since `Interpret` returns `KindInert` for `status_line` and `Manager.Apply` persists+broadcasts unconditionally). |
| `internal/server/server.go` | modified | Wires `s.usage = usage.NewAggregator(...)` (OnChange broadcasts the `usage` WS message) and `q.usage = s.usage`. |
| `internal/server/sessionwire.go` | modified | `toWireSession` populates `Context`'s three fields from `s.Context` when non-nil (previously always null — M1 baseline). |
| `internal/server/usagewire.go` | created | `usageMessage` + `toWireUsage(usage.Snapshot) UsageInfo` — shared by the `usage` broadcast and every snapshot's embedded usage object. |
| `internal/server/state.go` | modified | `UsageInfo` gains `Model *sessionWireModel` with a bare `json:"model"` tag — present-as-null like `fiveHour`/`sevenDay`/`sampledAt`, per orchestrator ruling (see Decisions); `currentSnapshot` now calls `toWireUsage(s.usage.Current())` instead of the fixed M0 baseline. |
| `internal/claudecode/claudecodetest/claudecodetest.go` | modified | `EnvelopedStatusLineFull` + `StatusLineFullOpts` (REQ-15, Go half) — the post-first-response status-line shape with real `context_window`/`rate_limits`/`model`, every default fixed and non-wall-clock-dependent (dedup-testing requirement) so daemon-tests never hand-write wire bodies. |

## Decisions

- **`UsageInfo.Model` uses a bare `json:"model"` tag (not `omitempty`).** I initially shipped `omitempty` to avoid breaking `TestBuildSnapshot_M0Shape`'s frozen `JSONEq`, and flagged it for review. Orchestrator ruling (this session): the wire shape must match the approved §5.4 delta exactly — `model` is a present key, `null iff buckets null`, consistent with `fiveHour`/`sevenDay`/`sampledAt`'s existing explicit-null convention — and the M0Shape test breaking on the new key is *sanctioned* breakage under this plan, not a constraint to design around; updating that assertion is daemon-tests' job, not mine to avoid by bending the wire shape. Reverted to a bare tag. Confirmed: `go build ./...` still exits 0, and `TestBuildSnapshot_M0Shape` now fails exactly as expected — its `JSONEq` diff shows one added key, `"model": <nil>`, nothing else. No other new Usage field uses `omitempty` (checked: `grep -n omitempty internal/server/state.go internal/server/usagewire.go internal/server/sessionwire.go` matches only this comment, no tags).
- **`status_line` events skip the generic `Interpret`/`manager.Apply` path entirely** rather than calling both that path and `ApplyStatus`. Plan's Implementation Notes say "`Interpret` ... keeps returning inert for `status_line`" and separately that the ingest worker calls "`ApplyStatus` then `Record`, sequentially" for a routed status event — read together as: the old generic path is superseded for this event type, not run alongside it. Verified this was the right call, not an assumption: `Manager.Apply` persists and broadcasts unconditionally on every call (no change-detection), so keeping the old call alongside the new `ApplyStatus` would have produced a spurious no-op `sessionUpsert` on every single status post, directly contradicting REQ-4's "only when a surfaced field actually changed" and INV-5. `claudecode.Interpret` itself is untouched (still returns `KindInert` for `status_line`, per plan) — nothing outside `ingest.go`'s routing changed.
- **Aggregator dedup compares `ResetsAt` as well as `UsedPct`** for each bucket (not usedPct alone). The plan says "bucket values ... changed" without specifying whether resets_at counts; since a bucket rolling over to a new window is itself a real state change (not a display-only timestamp like `sampledAt`), I included it. The measured ~435 ms pair posts (canary-fields.md) carry identical values for both fields, so this doesn't affect D9/INV-5's dedup case either way.

## Handoff

**Build status**: `go build ./...` exits 0. `go vet ./...` clean. `gofmt -l .` clean. `make lint` → "0 issues."

**Test files needing changes I was not allowed to make:**
- `internal/store/migrate_test.go`: `TestMigrate_AppliesInitSchema` (two `assert.Equal(t, 2, ...)`/`assert.Equal(t, 2, version)` at lines ~39/43) and `TestMigrate_SecondCallIsANoOp` (`require.Equal(t, 2, before)` at line ~60) hard-code the post-migration `schema_migrations` count/max-version as `2`. Adding `0003_gauges.sql` makes the real count `3` — mechanical bump, same pattern m1-sessions already went through once (their own comments reference it). Confirmed by running the suite: both tests fail with `expected: 2 / actual: 3`.
- `internal/store/store_test.go`: `TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations` (`assert.Equal(t, 2, schemaMigrationsCount(...))` at line ~42) — same cause, same fix (`2` → `3`), same confirmed failure.
- `internal/server/state_test.go`: `TestBuildSnapshot_M0Shape` (`assert.JSONEq` at line ~21) needs its frozen expected JSON updated to add `"model": null` inside the `usage` object — **sanctioned** breakage per the plan's §5.4 delta (orchestrator ruling, this session): `UsageInfo.Model` is a real new wire field and must render as an explicit-null key like its siblings, not be designed around to keep an old baseline test green. Confirmed by running `go test ./internal/server/...`; it is the only failure in that package, and the diff is exactly the one added key:
  ```
  --- Expected
  +++ Actual
  @@ -7,4 +7,5 @@
     },
  - (string) (len=5) "usage": (map[string]interface {}) (len=4) {
  + (string) (len=5) "usage": (map[string]interface {}) (len=5) {
     (string) (len=8) "fiveHour": (interface {}) <nil>,
  +  (string) (len=5) "model": (interface {}) <nil>,
     (string) (len=9) "sampledAt": (interface {}) <nil>,
  ```

No other test files are affected — `go test ./internal/...` is otherwise all green except the pre-existing migration-count trio above (`claudecode`, `session`, `termbridge`, `tmux`, `gitutil` fully pass; `internal/server` passes every test except `TestBuildSnapshot_M0Shape` above; `internal/store` passes every test except the two migration-count tests above).

I verified the full status-line flow end-to-end with a throwaway (removed before finishing) integration test exercising `POST /ingest/.../status` through the real `newTestServer` harness: a full status post updated the session's title/model/context, deduped an identical pair-post to one `usage_sample` row, and a changed third post produced a second row — all via `SELECT COUNT(*) FROM usage_sample` against the real SQLite file, not just diff-reading.

## Fix Attempt 1

**Failures addressed** (review cycle 1, wave 1, `[daemon-impl]` Minors 4 and 5 — Minor 3 left alone per orchestrator ruling, recorded as a TODO.md follow-up instead):

- Minor 4: `usage.Aggregator.log` was assigned but never read.
- Minor 5: `internal/server/state.go`'s `UsageInfo` doc comment still carried a resolved in-flight pipeline note.

**Changes made:**

| File | What |
|------|------|
| `internal/usage/aggregator.go` | `Record` now uses `a.log`: a `Debug` line on the dedup-skip path (`"usage sample unchanged, skipping persist and broadcast"`) and an `Error` line (with `.Err(err)`) before wrapping the `InsertUsageSample` failure. Both are static messages — no payload field values, no session/status content — consistent with the never-log-hook/status-payloads hard rule. `Config.Logger` is unchanged. |
| `internal/server/state.go` | Trimmed the parenthetical pipeline note off `UsageInfo`'s doc comment (the "sanctioned breakage... daemon-tests' job" sentence); the comment now states only the wire contract. |

No test files touched — `internal/usage` and `internal/server` test suites pass unchanged (`go test ./internal/usage/... ./internal/server/...` → both `ok`).

**Verification:**
- `gofmt -l .` → clean (no output)
- `go vet ./...` → clean
- `go build ./...` → exits 0
- `make lint` → `golangci-lint run` → "0 issues."
- `go test ./...` → all packages `ok` (or "no test files"), including `internal/usage` and `internal/server`

**Build status**: `go build ./...` exits 0.
