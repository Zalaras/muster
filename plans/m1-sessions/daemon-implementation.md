# Daemon Implementation: m1-sessions

**Plan**: m1-sessions
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/store/migrations/0002_sessions.sql` | created | `repo`, `session` tables + `event.session_id` column/index, verbatim from the plan's Schema Changes |
| `internal/store/repo.go` | created | `UpsertRepo`/`GetRepo`/`ListRepos` (MRU ordering, per-directory launch defaults) |
| `internal/store/session.go` | created | `InsertSession`/`UpdateSession`/`DeleteSession`/`GetSession`/`ListSessions` — whole-row persistence |
| `internal/store/store.go` | modified | `Event` gains `SessionID *int64`; `InsertEvent` persists it |
| `internal/gitutil/gitutil.go` | created | `git` CLI wrapper (never go-git): `IsRepo`/`Branch`/`IsWorktree` |
| `internal/tmux/tmux.go` | created | Dedicated-socket tmux ops: `NewWindow`, `PaneExists`, `KillWindow`, always `-L <socket>` |
| `internal/claudecode/launch.go` | created | `BuildArgv` — CLI argv construction (`--model`/`--name`/`--permission-mode`) |
| `internal/claudecode/settings.go` | created | `MergeSettings` (deterministic settings.local.json merge) + `WriteWrapperScripts` (SessionStart + status-line command wrappers) |
| `internal/claudecode/interpret.go` | created | `Interpret(eventType, payload) StateInput` — the only reader of event-type-specific payload keys; neutral `InputKind` vocabulary (Bind/ClearRebind/TurnActivity/…) |
| `internal/claudecode/claudecodetest/claudecodetest.go` | modified | Added builders for every M1 event (enveloped `SessionStart`, turn-activity, `Notification`, `PermissionRequest`, `Stop`, `StopFailure`, `PreCompact`, `SessionEnd`, status-line) |
| `internal/session/session.go` | created | `Session` domain type, `State`/`PermissionMode`/`Attention`/`Failure`/`Model`, prompt-close guard (bounded to 8) |
| `internal/session/machine.go` | created | `applyInput`/`applyBind` — the §7.3 transition table over `claudecode.StateInput`, no Claude Code vocabulary |
| `internal/session/manager.go` | created | `Manager`: in-memory registry, `CreateSession`/`RecordLaunch`/`DeleteSession`/`Apply`/`Resolve`/`Exists`/`List`, the ~5s liveness poll (ctx-aware `Start`/`Stop`) |
| `internal/server/sessionwire.go` | created | `sessionWire` (protocol §5.3 JSON shape) + `toWireSession` |
| `internal/server/sessions.go` | created | `POST /api/sessions` handler + `sessionLauncher` (validate → repo upsert → insert session → write settings → spawn tmux → record/broadcast; rollback deletes the row on failure) |
| `internal/server/repos.go` | created | `GET /api/repos` (branch read at request time) |
| `internal/server/browse.go` | created | `GET /api/browse` (home-dir default, dotfiles excluded, 400/404 per contract) |
| `internal/server/ingest.go` | modified | Worker now resolves routing (envelope `musterSession` when known, else the claude-session-id binding), persists `session_id`, then feeds `claudecode.Interpret` + `Manager.Apply`; logs (never payloads) on unrouted events |
| `internal/server/ws.go` | modified | `wsHub` gains per-client outbound channels + non-blocking `broadcast`; `handleWS` loops sending hello → snapshot → broadcast deltas |
| `internal/server/state.go` | modified | `Snapshot.Sessions` is now `[]sessionWire`; added `(*Server).currentSnapshot` (manager-backed); `buildSnapshot()` kept as the pinned M0 fixture (`TestBuildSnapshot_M0Shape` still calls it directly) |
| `internal/server/server.go` | modified | `Config` gains `ClaudeBin`/`TmuxSocket`/`BaseURL`/`SessionStartScript`/`StatusLineScript`; `New` wires `tmux.Client` → `session.Manager` (OnUpsert → hub broadcast) → `sessionLauncher`; routes for the three new endpoints; `Start`/`Shutdown` drive the manager's `LoadAll`/poll lifecycle |
| `cmd/musterd/main.go` | modified | `-claude-bin`/`-tmux-socket` flags (REQ-19); computes `baseURL`; calls `claudecode.WriteWrapperScripts`; passes the new fields into `server.Config` |

## Decisions

- **`SessionStart.model` shape**: the plan's Implementation Notes call it "a plain model-ID string, sometimes absent," but the already-authored E2E fixture (`web/e2e/helpers/payloads.ts`) sends it as `{id, display_name}` (mirroring the status line). `interpret.go`'s `modelID()` accepts either shape (object-with-id first, then a bare string) so both the authored E2E fixture and a future real-wire discovery of the plain-string form work without a code change.
- **`Session.Model.DisplayName` does not survive a restart independently of `ID`**: the `session` table (plan's Schema Changes, verbatim) has one `model TEXT` column, not two. In memory, `DisplayName` stays the launch value while `ID` can be overwritten by `SessionStart`'s model field, matching protocol §5.3. On disk only the current `ID` value persists, so after a daemon restart `DisplayName` re-derives as equal to whatever `ID` currently is (losing the original launch string if `SessionStart` had already overwritten it before the restart). Not observable within one daemon lifetime and not covered by any E2E test; flagging since it's a real, if narrow, semantic gap against §5.3's "displayName stays the verbatim string until M3."
- **Placeholder `tmux_target`**: the plan's launch sequence needs the session's id (for the pane env) before tmux can produce a target, so `InsertSession` writes `tmux_target = ''` and `Manager.RecordLaunch` fills in the real value once the window is spawned — broadcast happens only at that point (REQ-2). The liveness poll skips any session whose `TmuxTarget == ""` to avoid a false-dead read in that narrow window.
- **One tmux *session* per socket, named "muster"**: not spelled out verbatim in the plan; `internal/tmux` creates/reuses a single tmux session inside the dedicated socket and opens one window per Muster session, giving targets shaped exactly like the protocol's own example (`"muster:@4"`). Verified interactively (`tmux new-session -d -s muster`, `new-window -t muster: -P -F "#{window_id} #{pane_id}"`, then `list-panes`/`kill-window` on the returned target) — behaves as expected, including `list-panes` on a killed window exiting non-zero, which `PaneExists` treats as "gone."
- **`internal/gitutil` is a new package** not named in the plan's Affected Files list. Git detection (is-git / branch / worktree) is needed both at launch (`sessions.go`) and in `GET /api/repos` (`repos.go`); a small shared package avoids duplicating `git -C` invocations. Minimal (`os/exec` + three functions), per conventions ("Git/GitHub: never go-git").
- **`buildSnapshot()` (package-level function) is unchanged in behavior** — `TestBuildSnapshot_M0Shape` calls it directly and pins the empty-sessions M0 shape. Production handlers (`handleState`, `handleWS`) now call the new `(*Server).currentSnapshot()` method instead, which fills `Sessions` from the session manager. Both share the same `Snapshot` struct (`Sessions` field type changed from `[]any` to `[]sessionWire`, which is JSON-invisible — `assert.JSONEq`/`assert.Empty` in the existing test still pass).
- **`newIngestQueue`'s 3-arg constructor signature is unchanged** (two existing unit tests call it directly). The session-manager reference is set as a struct field (`q.manager = mgr`) after construction in `server.go`, not as a constructor parameter.

## Handoff

**Build status**: `go build ./...` exits 0. `go vet ./...` and `gofmt -l .` are clean. `make lint` reports 0 issues.

**Pre-existing test files needing an update (not done by me — outside the allowed edit scope):**
- `internal/store/migrate_test.go` (`TestMigrate_AppliesInitSchema`, `TestMigrate_SecondCallIsANoOp`) and `internal/store/store_test.go` (`TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations`) hardcode "exactly 1 migration applied" / `version == 1`. Adding `0002_sessions.sql` (required by this plan's Schema Changes) makes the real count 2, so these three assertions now fail:
  ```
  --- FAIL: TestMigrate_AppliesInitSchema
      Error: Not equal: expected: 1, actual: 2
  --- FAIL: TestMigrate_SecondCallIsANoOp
      Error: Not equal: expected: 1, actual: 2
  --- FAIL: TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations
      Error: Not equal: expected: 1, actual: 2
  ```
  This is the expected, plan-mandated consequence of a second migration file existing, not an implementation defect. The fix is updating those three hardcoded `1`s (and, in `TestMigrate_AppliesInitSchema`, the asserted `version`) to `2` — I did not touch these files since it's assertion content, not an import path.
- Everything else (`internal/server`, `internal/claudecode`) passes unchanged: `go test ./...` is green except for the three lines above.

No other test files needed changes; no import paths were invalidated by this work (no existing symbol was moved/renamed/deleted).

## Fix Attempt 1

**Mode**: fix (attempt 1), review cycle 1 of 3, wave 1 — daemon-impl issues only.

**Failures addressed** (from `plans/m1-sessions/review.md`):

| # | Sev | Issue |
|---|-----|-------|
| 1 | Critical | Clear-rebind left `Attention`/`Failure` set on a `started` session |
| 2 | Critical | `MergeSettings` destroyed foreign hooks on Muster-owned events |
| 8 | Major | `checkLiveness` held live `*Session` pointers outside the mutex (data race) |
| 9 | Major | Wrapper scripts written `0o755` with the ingest token in cleartext |
| 10 | Major | No rollback/window-kill when `RecordLaunch` fails |
| 11 (daemon half) | Major | `modelID` accepted a fictional `{id, display_name}` object shape |
| 2 | Minor | `handleCreateSession` threaded a cancelable ctx through launch+rollback |
| 3 | Minor | `muster.db` created `0644` |
| 11 | Minor | `StopFailure` with no `error` field produced `FailureError: &""` instead of nil |
| 12 | Minor | `repos.go` leaked raw `err.Error()` in the client-visible envelope |

**Changes made**:

| File | What |
|------|------|
| `internal/session/machine.go` | `applyBind`: when `kind == KindClearRebind` (covers both the explicit `/clear` rebind and the id-change escalation path), now also clears `Attention`, `Failure`, and `LastActivity`, alongside the existing `Compactions`/prompt-guard reset. |
| `internal/claudecode/settings.go` | Added `isMusterEntry`/`foreignHookGroups`: within each Muster-owned hook event, only entries recognizable as Muster's own (an HTTP entry whose URL path matches `/ingest/<token>/(hook\|status)` regardless of host/port/token, or a command entry matching the generated wrapper script paths) are dropped; every other entry in that event's array survives. `MergeSettings` now builds each owned event's array as `append(foreign, mustersOwnGroup)` instead of overwriting wholesale. Also changed `writeEnvelopeScript`'s file mode from `0o755` to `0o700` (Major 9). |
| `internal/session/manager.go` | `checkLiveness` now collects `{id, tmuxTarget}` value copies (a local `livenessTarget` struct) under the lock instead of live `*Session` pointers, closing the race with `RecordLaunch`'s write to `TmuxTarget`. |
| `internal/server/sessions.go` | `Launch`: on `RecordLaunch` failure, now calls `l.rollback` (deletes the row) and `l.tmux.KillWindow` (kills the already-spawned pane) before returning `launch_failed`. `handleCreateSession` now passes `context.WithoutCancel(r.Context())` into `Launch`, so a client navigating away mid-launch cannot cancel the tmux spawn or the rollback's own DB write. |
| `internal/store/store.go` | `Open` now `os.Chmod(path, 0o600)`s the database file after migrating, closing the world-readable window now that real hook payload/prompt text flows into it. |
| `internal/claudecode/interpret.go` | `StopFailure` case: `FailureError` is now only set when the payload's `error` field is non-empty (nil otherwise, instead of a pointer to `""`). `modelID` dropped the `{id, display_name}` object-shape branch — SessionStart's `model` is settled by measurement (2026-08-22 interface probe, `spikes/canary-fields.md`) as a plain model-id string only; the object shape was never real for this event. |
| `internal/claudecode/claudecodetest/claudecodetest.go` | `EnvelopedSessionStart` now embeds `model` as a plain string (matching the measured shape) instead of an `{id, display_name}` object. `EnvelopedStatusLinePreFirstResponse` (status-line builder) is untouched — the object shape is real there. |
| `internal/server/repos.go` | `handleListRepos`'s `ListRepos` failure now logs the real error server-side and returns a curated `"could not list repos"` message to the client instead of `err.Error()`. |

**Decisions**:

- **`browse.go`'s reported leak (review Minor 12, `browse.go:36`) was not found.** `rg -n "err.Error()" internal/server/browse.go` returns no matches — every error path there (`os.UserHomeDir` failure, stat/readdir failures) already returns a curated message ("could not determine home directory", "directory does not exist or is not a directory", "directory is not readable"). No change made; the review's line reference doesn't match the file I read. Flagging rather than guessing at what else might have been meant.
- **`Critical 2`'s recognizability check is path-shape-based, not exact-URL-based.** `TestMergeSettings_ReplacesMustersOwnEntriesWholesale` merges with a *changed* host/port/token between calls and still expects the stale entry replaced (not appended alongside). An exact match against the *current* `cfg.HookURL` would fail to recognize the *old* entry once the port/token rotates, breaking that test — confirmed by running it both ways. Matching on the URL path shape (`/ingest/[^/]+/(hook|status)`) recognizes Muster's own entries independent of host/port/token instead, which is what both the wholesale-replace test and the foreign-hook-survives probe require simultaneously. Verified with a throwaway probe test (removed before finishing) reproducing the review's exact formatter-hook scenario: the formatter survives, Muster's own entry is present once.
- **Left two tests intentionally red, per this task's fix-mode instructions** (my gate is `go build ./...`, not `make test`):
  - `internal/claudecode/settings_test.go:215` (`TestWriteWrapperScripts`) pins wrapper-script mode `0o755`; the correct fix (Major 9) is `0o700`. `go test` output: `Not equal: expected: 0x1ed actual: 0x1c0`.
  - `internal/claudecode/interpret_test.go:175` (`TestInterpret_StopFailure_EmptyErrorStillReturnsANonNilPointer`) pins `FailureError` as non-nil on an empty `error` field; the correct fix (Minor 11) is nil. `go test` output: `Expected value not to be nil`.
  - Both are the daemon-tests agent's to update per the fix-mode boundary; not touched here beyond the one permitted case (`claudecodetest.go`, not a `_test.go` file — see below).
- **`internal/claudecode/interpret_test.go:46`'s test ("model present as an `{id, display_name}` object extracts the id") still passes despite the `modelID` object-branch removal**, because I also updated the non-test helper `claudecodetest.EnvelopedSessionStart` (not a `_test.go` file, so within my editable scope) to embed `model` as a plain string. The test still exercises `ModelID` round-tripping through `Interpret`, just no longer via the object shape its name describes — the name/comment are now stale but the assertion is not broken. Not renamed (test-file content is out of scope); flagging for the test agent's own pass.
- **`internal/claudecode/ingest_test.go:32`** embeds a literal `SessionStart` payload with an `{id, display_name}` model object, but that test (`TestParseIngestBody_EnvelopedVsRaw`) never calls `Interpret` or asserts on `Model` — it only checks envelope routing fields (sessionID/type/promptID/toolUseID/musterSession/tmuxPane) — so the object-shape literal is inert and the test is unaffected by the `modelID` change. Confirmed via `grep -n "Interpret(" ingest_test.go` (no matches).

**Build status**: `go build ./...` exits 0. `gofmt -l .` and `go vet ./...` clean. `make lint` reports 0 issues. `go test ./...` is green except the two tests named above as intentionally left red for the test agent (`TestWriteWrapperScripts`, `TestInterpret_StopFailure_EmptyErrorStillReturnsANonNilPointer`). `internal/session` passes under `-race`.

## Fix Attempt 2 (review cycle 2, wave 1)

**Failures addressed**: `[daemon-impl]` Critical 1, Major 1, Major 2, Minor 2 from `plans/m1-sessions/review.md` cycle 2.

**Changes made**:

| # | File | Change |
|---|------|--------|
| Critical 1 | `internal/session/machine.go` | `applyBind` now clears `sess.Attention`/`sess.Failure` unconditionally, before the `kind == KindClearRebind` check, instead of only inside that branch. A plain `KindBind` (e.g. `SessionStart(source:"resume")`, which per `spikes/canary-fields.md` reuses the original `session_id` and so never escalates to `KindClearRebind`) no longer lands on `started` with a stale `attention`/`failure` still set. The `Compactions`/prompt-guard/`LastActivity` reset stays inside the `KindClearRebind`-only branch, per the review's explicit instruction that this part is genuinely `/clear` semantics. Per the orchestrator's scope ruling, the §7.3 resume-row `alive := true` → `idle` half is **not** implemented — that deferral is already made explicit in `plan.md`'s Overview ("Resume is M4 … this deferral includes §7.3's `SessionStart (source:"resume")` row"). |
| Major 1 | `internal/store/store.go` | `Open` now chmods `path`, `path+"-wal"`, and `path+"-shm"` to `0o600` (was: `path` only), tolerating `os.IsNotExist` on the sidecars (they may not exist yet on a brand-new database with no writes). This runs after `Migrate`, by which point WAL mode has already created the sidecars, so they exist to be chmod'd. Measured before the fix: `muster.db-wal mode=-rw-r--r--`, `muster.db-shm mode=-rw-r--r--`, both world-readable. |
| Major 2 | `internal/claudecode/settings.go` | `isMusterEntry` now additionally requires the HTTP hook URL's host to be loopback (`localhost`, or an IP where `net.ParseIP(host).IsLoopback()`), via a new `isLoopbackHost` helper. A foreign HTTP hook on a remote host that happens to share Muster's `/ingest/<token>/(hook\|status)` path shape is no longer recognized as Muster's own and survives the merge; Muster's own token/port-rotation heal is untouched since Muster only ever binds loopback. |
| Minor 2 | `plans/m1-sessions/web-implementation.md` | Investigated, found the review's premise does not match current source (see Decisions) — no change made to the log line, since it is already accurate. |

**Verification**: `go build ./...` exits 0. `gofmt -l .` clean. `go vet ./...` clean. `make lint`: `0 issues.` `go test ./...` — all packages pass, including `internal/session`, `internal/store`, `internal/claudecode`, and `internal/server`, with no regressions.

**Decisions**:

- **Minor 2 — no code/doc change made; the review's premise doesn't hold against current source.** The review cites `style.css:230-234` as having "no `background` declaration at all" and concludes "the stripe is transparent when unstyled." I read the actual rule:
  ```
  230:.card .stripe {
  231-  width: 3px;
  232-  flex: none;
  233-  /* Inert default, not the Idle state colour (design-system §3: a state colour may only
  234-   * ever mean its state) — every state class below overrides this. */
  235-  background: var(--dim);
  236-}
  ```
  Line 235 — one line past the review's cited range — does declare `background: var(--dim)`, and `--dim: #565c6d;` is defined unconditionally at `:root` (`style.css:17`), so the stripe is *not* transparent; it paints solid dim-gray whenever no state class overrides it. `grep -n "\.stripe" web/src/style.css` confirms the only overrides are the six `s-*` selectors (`s-blocked`/`s-failed`/`s-plan`/`s-work`/`s-start`/`s-idle`); no later rule cancels line 235 back to transparent. `web-implementation.md`'s Fix Attempt 2 log line ("now reads `var(--dim)` instead of `var(--idle)`") therefore already matches reality exactly, and changing it to claim "transparent"/"no declaration" would introduce a false statement rather than correct one. I made no edit and am flagging the discrepancy here rather than complying with a premise I could not verify — the substantive point the review was reaching for (no *state* colour can leak onto a stateless card) already holds regardless, since `--dim` is not one of the state tokens (§3's amber/rose/violet/teal).

**Tests needed (not mine to add under the fix-mode boundary — for daemon-tests)**:
- `internal/session/machine_test.go`: a companion to the three existing `TestApplyInput_ClearRebind` subtests — a plain `KindBind` (unchanged `claudeSessionID`) from `StateNeedsInput` and from `StateFailed`, asserting the resulting session has `Attention == nil` and `Failure == nil` and lands on `StateStarted`. This is exactly the missing test the review named for Critical 1.
- `internal/store/store_test.go`: an assertion that `Open` leaves `path`, `path+"-wal"`, and `path+"-shm"` all at mode `0o600` (the review's explicitly requested regression guard for Major 1).
