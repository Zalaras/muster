# Daemon Implementation: M4 — Reconcile, shutdown policy, end / remove / resume

**Plan**: m4-reconcile
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/store/migrations/0004_reconcile.sql` | created | `last_snapshot`/`last_snapshot_at` columns (Schema Changes). |
| `internal/store/session.go` | modified | `SessionRow.LastSnapshot/LastSnapshotAt`; carried through `UpdateSession`/`scanSession`/`sessionColumns`; new `UpdateSnapshot(ctx, id, text, at)` column-only write. |
| `internal/tmux/tmux.go` | modified | `ListSessions`, `KillSession`, `CapturePane` (+ `trimTrailingBlankLines`) — REQ-2/REQ-4/REQ-5's tmux primitives. |
| `internal/claudecode/interpret.go` | modified | `KindResumeBind`; `interpretSessionStart` maps `source:"resume"` to it (REQ-8). |
| `internal/session/session.go` | modified | `Session.LastSnapshot`/`LastSnapshotAt` (in-memory twin of the row fields). |
| `internal/session/machine.go` | modified | `applyInput` routes `KindResumeBind` through `applyBind`; same-id resume bind sets `alive:=true`, state `idle`, skips the clear-rebind reset block; a different-id resume still escalates to clear-rebind → `started` (REQ-8). |
| `internal/session/manager.go` | modified | `PaneSnapshotter`/`Killer` interfaces; `Config`/`Manager` gain `PaneSnapshotter`, `SessionKiller`, `OnRemoved`; `ErrUnknownSession`/`ErrSessionNotAlive` sentinels; `Reconcile`, `End`, `Remove`, `RecordResume`, `Snapshot`, `EndAll`, `markEnded` (shared dead-flip, replaces the inline body `checkOneLiveness` used to have), `captureSnapshot`/`storeSnapshot`, `removeFromMemory` (shared by `DeleteSession`/`Reconcile`/`Remove`), `sessionTmuxName`; `checkOneLiveness` now also captures a snapshot on every tick/Nudge when the pane exists (REQ-4); `rowToSession`/`sessionToRow` carry the new fields. |
| `internal/claudecode/launch.go` | modified | `LaunchParams.ResumeSessionID`; `BuildArgv` emits `--resume <id>` and omits `--name` when set (REQ-7/D13). |
| `internal/server/sessionwire.go` | modified | `sessionRemovedMessage`, `paneSnapshotWire`. |
| `internal/server/terminal.go` | modified | `terminalRegistry.closeSession(id)` — closes a live socket with `4001 pane_ended` (End's pre-kill step). |
| `internal/server/sessions.go` | modified | `sessionLauncher.Resume`; `notFound`/`notResumable`/`directoryMissing` error constructors (reusing `launchError`); handlers `handleEndSession`, `handleRemoveSession`, `handleResumeSession`, `handlePaneSnapshot`; `parseSessionID` helper. |
| `internal/server/server.go` | modified | Routes for `/end`, `/resume`, `/pane`, `DELETE`; `Manager` wired with `PaneSnapshotter`/`SessionKiller`/`OnRemoved` (broadcasts `sessionRemoved`); `Start` runs `Reconcile` after `LoadAll`, before `manager.Start()`/`ingest.Start()`; new `LiveSessionCount()`, `TmuxSocket()`, `EndAllSessions(ctx)` accessors for `cmd/musterd`'s on-exit logic. |
| `cmd/musterd/main.go` | modified | `-on-exit` flag (`ask`\|`leave`\|`kill`, default `ask`); `run()` gains a `stdin *os.File` parameter (`main` passes `os.Stdin`); `resolveOnExit`/`isCharDevice`/`askKillPrompt` (10s-timeout TTY prompt, REQ-3); shutdown path calls `srv.EndAllSessions` or logs "leaving" before the existing `srv.Shutdown(shutdownCtx)`. |

## Decisions

- **`Server.Shutdown`'s signature is unchanged** (`Shutdown(ctx)`, no `onExit` param), diverging from the plan's Affected-Files line ("`Shutdown(ctx, onExit)`"). Evidence: `go vet ./...` failed with `internal/server/gauges_test.go:34:54: not enough arguments in call to srv.Shutdown` and 18 more call sites across `gauges_test.go`, `ingest_routing_test.go`, `settings_shell_test.go`, `ingest_test.go`, `terminal_test.go`, `ws_test.go` (`grep -rn "\.Shutdown(" internal/server/*_test.go` → 19 hits, all `srv.Shutdown(context.Background())`), none of which I may edit. The plan's own Implementation Notes already describe the non-breaking shape: "the answer selects between `manager.EndAll` and nothing. **Both paths then run the existing `Shutdown`**." I followed that: added `Server.EndAllSessions(ctx) int` (thin forward to `manager.EndAll`) plus `LiveSessionCount()`/`TmuxSocket()` accessors; `cmd/musterd`'s `run()` decides leave-vs-kill, calls `EndAllSessions` itself when killing, logs the REQ-3 line, then calls the untouched `srv.Shutdown(shutdownCtx)`. No test file needed changing.
- **`run()`'s signature gained a `stdin *os.File` parameter.** No pre-existing `cmd/musterd/*_test.go` exists (`find cmd/musterd -name '*_test.go'` → empty) so this was a free choice, not a break; done so D19–D21 can inject a non-TTY `*os.File` (e.g. `os.Pipe()`'s read end, which `Stat().Mode()` reports as `ModeNamedPipe`, never `ModeCharDevice`) without touching the real `os.Stdin`.
- **`SessionKiller` renamed to `Killer`** inside `internal/session` (the `Config`/`Manager` field is still named `SessionKiller`) — `make lint` failed with `revive: type name will be used as session.SessionKiller by other packages, and that stutters`; renaming the type only (not the field) fixed it with `0 issues`.
- **`markEnded` is a new shared helper** behind `checkOneLiveness`, `Reconcile`'s mark-ended rows, and `End` (via its own liveness nudge) — REQ-5's literal sequence "final snapshot → kill-session → **liveness nudge**" is implemented as: capture, kill, then run the *same* `checkOneLiveness`/`markEnded` path every other death goes through, rather than a bespoke alive-flip inside `End`. This keeps INV-1 (alive ⇔ pane existence) enforced by one code path instead of two independently-written ones. Verified manually (see below) that End correctly transitions alive→false, captures the final snapshot, and that a second End on the same id returns `ErrSessionNotAlive`.
- **Reconcile's "unknown session" check compares by session *name*** (`sessionTmuxName(sess.ID)` = `"muster-<id>"`), not by parsing `TmuxTarget` — matches `internal/tmux.Client.NewSession`'s own naming and avoids depending on `TmuxTarget`'s internal `session:window` format.
- REQ-16/D8 (the `TestMergeSettings_ForeignCommandHookOnSessionStartSurvives` regression guard) needs **no production code change** — `internal/claudecode/settings.go`'s existing `isMusterEntry`/`foreignHookGroups`/`MergeSettings` (landed in m4-hook-quoting) already preserve a foreign `type:"command"` `SessionStart` hook and don't duplicate Muster's own entry on re-merge; I verified this by reading `settings.go` rather than by running the not-yet-written test. The test itself is a `_test.go` addition, out of scope for daemon-impl (test-file constraint) — flagged in Handoff for daemon-tests.

## Verification (manual, beyond the unit tests daemon-tests will add)

Ad-hoc probes used per-test scratch `-S` sockets under `os.MkdirTemp`, always `kill-server`'d and the temp dir removed — no litter in the shared tmux socket directory (checked: `git status --porcelain` shows no stray files afterward, and `ls internal/ | grep scratch` is empty).

- `claudecode.BuildArgv` with `ResumeSessionID` set: `["claude" "--model" "sonnet" "--resume" "abc-123" "--permission-mode" "plan"]` — `--name` omitted even though `Title` was also set; a normal launch (no `ResumeSessionID`) still emits `--name`.
- `KindResumeBind` end-to-end through `Manager.Apply`: a session bound to `claude-1`, failed (`state=failed`), then resume-bound with the **same** id → `state=idle`, `failure=nil`, `attention=nil`, `alive=true`. Then resume-bound again with a **different** id (`claude-2`) → escalates, `state=started`, `claudeSessionId=claude-2`. Matches REQ-8/D11/D12 exactly.
- `Manager.End`/`Snapshot`/`RecordResume`/`Remove` against a real tmux socket: `End` → `alive=false`, `endedAt` set, tmux session gone; a second `End` → `session not alive` (`ErrSessionNotAlive`); `RecordResume` with a fresh real pane → `alive=true`, `endedAt=nil`, state untouched (`started`, i.e. whatever it was), snapshot cleared; `Remove` on the (now alive again) session → tmux session killed then gone, row gone, `mgr.Get` reports unknown.
- `Manager.Reconcile` against a real tmux socket with three rows — alive-with-real-dead-pane (spawned, then `KillWindow`ed), already-`alive=false`, and alive-with-a-real-live-pane: result `{KeptAlive:1 MarkedEnded:1 Swept:1}`, and the DB rows afterward show exactly that (dead one `alive=false`/`endedAt` set, already-ended one gone via `sql: no rows in result set`, live one still `alive=true`). An earlier probe with a *fabricated* (never actually live) target string for the "dead" row produced a false `KeptAlive` — traced to tmux's global, session-agnostic `@N` window-id resolution coincidentally matching a different, genuinely-live session's window id (a pre-existing property of `tmux.Client.PaneExists`/target resolution, unrelated to any code this plan touches, and not reachable when `TmuxTarget` always comes from a real `NewSession` call as it does in every production path). Not fixed — out of scope, and not a real risk in practice: window ids are monotonic per tmux **server process** and never reused while that process stays alive, so a stale row's target can only collide with a *new* session's id after the tmux server itself has been restarted (never just musterd) *and* the coincidence lines up — the ordinary "reboot" case in Edge Case 7 has no server at all, which fails cleanly instead.

## Handoff

**Build status**: `go build ./...` exits 0.
`gofmt -l .` — clean. `go vet ./...` — clean. `make lint` — `0 issues.`

**Frozen tests broken by this plan's approved contract changes (sanctioned breakage — for daemon-tests to update, not revert):**
- `internal/claudecode/interpret_test.go:28-34` (`TestInterpret_SessionStart/resume_binds_(same_session_id_path,_still_a_Bind_kind_at_the_interpreter_level)`): asserts `source:"resume"` still interprets as `KindBind`. REQ-8/§7.3 requires a distinct `KindResumeBind` so the state machine can land it in `idle` instead of `started`; `Interpret("SessionStart", …)` now correctly returns `KindResumeBind` for `source:"resume"`. The test (and its now-inaccurate name/comment) needs updating to expect `KindResumeBind`.
- `internal/store/migrate_test.go:40,44,61` and `internal/store/store_test.go:43`: hardcode the applied-migration count as `3`. Adding `0004_reconcile.sql` (Schema Changes, D22) makes it `4` — these literals need bumping.

**Test files needing changes I was not allowed to make:** the two groups above (constraint: I may only touch a test file's `import` line). No other test files need changes — the rest of the existing suite (`internal/server`, `internal/session`, `internal/tmux`, `internal/termbridge`, `internal/usage`, `internal/gitutil`) passes unmodified against the new code.

**Still outstanding (not daemon-impl's job under this plan):**
- REQ-16/D8: `TestMergeSettings_ForeignCommandHookOnSessionStartSurvives` in `internal/claudecode/settings_test.go` — new test, daemon-tests' to write; no production code change was needed (see Decisions).
- D9–D21 (Reconcile/End/Remove/RecordResume/KindResumeBind/BuildArgv/HTTP/`-on-exit` unit and HTTP tests) — all daemon-tests' to write against the interfaces/behavior implemented here.
- R4 doc upkeep (TODO.md ticks, SPEC §11 changelog) — left for the pipeline's later step; `docs/protocol.md` was already fully merged with this plan's delta before I started (confirmed by reading §3.4/3.5/3.7/3.8/5.5/7.3/7.5 — all present and consistent with the plan's Protocol Contract), so no edits were needed there.

## Fix Attempt 1

**Mode**: fix (attempt 1) — review cycle 1

**Failures addressed**: Major 1 (`alive` set from a hook payload, breaking INV-1); Minors 1–4 tagged `[daemon-impl]`.

### Major 1 — `alive` set from a hook payload, breaking INV-1

`internal/session/machine.go` — `applyBind`'s `KindResumeBind` branch (the only place
in the tree this issue could live) deleted `sess.Alive = true` and left only
`sess.setState(StateIdle, now); return`.

Enumerating every code path that could set `Alive` from something other than tmux
pane existence, to confirm this was the only door:

- `applyBind`'s `KindResumeBind` branch — **the reported defect, now closed** (line
  removed).
- `applyBind`'s plain-`KindBind` and `KindClearRebind` branches — never touched
  `Alive` before or after; confirmed by reading the full function body again after the
  edit.
- `applyInput`'s other cases (`KindTurnActivity`, `KindNeedsInputPermission`,
  `KindNeedsInputIdle`, `KindTurnClosed`, `KindTurnFailed`, `KindCompaction`,
  `KindDeathHint`, `KindClearDeathHint`, `KindInert`) — only `KindDeathHint` touches
  `Alive` (`sess.Alive = false`), and that's `SessionEnd`'s actual pane-death signal,
  which is legitimate (not what INV-1 forbids — INV-1's rule is tmux pane existence is
  authoritative, and this hook *is* Claude Code's own end-of-pane notice, corroborated
  by the liveness poll independently). Not part of this defect.
- `grep -rn "\.Alive = true" internal/session/*.go internal/claudecode/*.go` (excluding
  test files) → one production hit left: `manager.go:615` inside `RecordResume`, which
  sets `alive:=true` from the real tmux spawn that `RecordResume`'s caller just
  performed (REQ-7) — not a hook path, and explicitly the source of truth INV-1
  requires. Confirmed this is the only remaining production site.

No other code path sets `Alive` from hook-derived data. The category is closed, not
just the one branch the reviewer's repro exercised (there was in fact only one branch
in this category to begin with).

**Sanctioned test breakage (do not revert):** `internal/session/machine_test.go:309`
(`assert.True(t, sess.Alive, "REQ-8: applyBind's resume-bind branch marks the session
alive")`) now fails for all six states in
`TestApplyInput_ResumeBind_SameClaudeIDFromEveryStateLandsIdleWithAttentionAndFailureCleared`.
This is Major 2 in the review, expected and pre-approved: daemon-tests drops this
assertion next wave. Verified via `go test ./...` — only this one test fails,
everything else across the whole module (`internal/session`, `internal/server`,
`internal/tmux`, `internal/termbridge`, `internal/usage`, `internal/gitutil`,
`internal/store`, `internal/claudecode`, `cmd/musterd`) is green.

### Minor 1 — `End` can return 200 with `alive:true` when the post-kill liveness check errors

`internal/session/manager.go` — `checkOneLiveness` gained an `endOnCheckError bool`
parameter: on a `PaneExists` error it still logs a warning, but when
`endOnCheckError` is true it now falls through to `markEnded` instead of returning
silently. `End` (the only caller that just performed the kill itself) passes `true`;
the two periodic-poll callers (`checkLiveness`'s loop and `Nudge`) pass `false`,
keeping their existing "leave as-is until the next tick" behaviour for an ordinary
transient tmux hiccup unrelated to a kill Muster itself just issued. All three call
sites were updated (`manager.go:539`, `:678`, `:699`) — enumerated via
`grep -n "checkOneLiveness(ctx" internal/session/manager.go` before and after to
confirm no fourth caller was missed.

### Minor 2 — blank-pane snapshot indistinguishable from "never captured"

`internal/session/manager.go` — `Snapshot`'s sentinel changed from
`sess.LastSnapshot == ""` to `sess.LastSnapshotAt.IsZero()`, so a pane that was
genuinely captured with blank content now serves 200 text instead of 404
`no_snapshot`. Scope note: `storeSnapshot`'s own diff-check (`sess.LastSnapshot ==
text`) still short-circuits the very first capture if that first capture happens to be
blank (both sides are `""`, so `LastSnapshotAt` never gets set) — this narrower
edge case is not what the review's Minor 2 described (it was about the read-side
sentinel) and is left alone as out of scope for this fix.

### Minor 3 — `EndAllSessions` shutdown path has no deadline

`cmd/musterd/main.go` — the `onExitKill` branch now runs
`srv.EndAllSessions(endAllCtx)` against a `context.WithTimeout(context.Background(),
shutdownTimeout)` (the same 10s budget `httpServer.Shutdown`/`srv.Shutdown` already
use), cancelled immediately after, instead of the previous unbounded
`context.Background()`.

### Minor 4 — latent snapshot-text-in-error log channel

`internal/tmux/tmux.go` — added `runCapture`, a variant of `run` that keeps stdout and
stderr in separate buffers (`bytes.Buffer`) instead of `CombinedOutput()`, so a
non-zero exit's wrapped error can only ever carry stderr (tmux's own diagnostic), never
the pane text that would have been on stdout. `CapturePane` now calls `runCapture`
instead of `run`. All other `c.run` call sites are untouched — they're not the pane-text
path and don't carry the same R3 risk.

**Verification**:
- `go build ./...` — exits 0.
- `gofmt -l .` — no output (clean).
- `go vet ./...` — no output (clean).
- `make lint` — `0 issues.`
- `go test ./...` — every package passes except the one sanctioned failure above
  (`internal/session`, all six subtests of
  `TestApplyInput_ResumeBind_SameClaudeIDFromEveryStateLandsIdleWithAttentionAndFailureCleared`).

**Handoff note**: `internal/session/machine_test.go:309`'s assertion is expected to
fail per the review's own Minor 2 ("Drop the assertion when Major 1 is fixed") — this
is daemon-tests' fix in the next wave, not a regression to chase here.

## Fix Attempt 2

**Mode**: fix (attempt 2) — review cycle 2

**Failure addressed**: Minor 2, `[daemon-impl]` — "The blank-first-capture edge
remains" (`internal/session/manager.go:489`).

The review's diagnosis was correct and matched what Fix Attempt 1's own scope note
already flagged: `storeSnapshot`'s diff check (`sess.LastSnapshot == text`) skips the
persist whenever text is unchanged from the in-memory zero value, which is exactly what
happens when the very first capture for a session is genuinely blank (`sess.LastSnapshot
== "" == text`). That leaves `LastSnapshotAt` zero forever even though a capture did
succeed, so `Snapshot`'s `LastSnapshotAt.IsZero()` sentinel (the read-side fix from
cycle 1 Minor 2) reports "never captured" for a pane that genuinely was captured.

Fix: `internal/session/manager.go` — `storeSnapshot`'s guard changed from
`sess.LastSnapshot == text` to `sess.LastSnapshot == text && !sess.LastSnapshotAt.IsZero()`.
The diff-skip now only fires once a first capture has actually landed (`LastSnapshotAt`
set); the very first call — blank or not — always falls through and persists, which sets
`LastSnapshotAt` unconditionally on that first call regardless of what the captured text
is.

There is exactly one call site with this bug: `storeSnapshot` is the sole writer of
`LastSnapshot`/`LastSnapshotAt` in `internal/session` (`grep -n "LastSnapshotAt =" internal/session/*.go`
excluding tests → `manager.go:495` only; `RecordResume` clears the fields to zero/empty
rather than writing them, which is intentional per REQ-7 and untouched by this fix). Both
of `storeSnapshot`'s callers — `captureSnapshot` (periodic/liveness-triggered) and `End`'s
final-snapshot capture — go through the same fixed function, so both are covered by the
one change; there is no second code path that duplicates the diff logic.

**Verification**:
- `gofmt -l internal/session/manager.go` — no output (clean).
- `go vet ./...` — no output (clean).
- `go build ./...` — exits 0.
- `go test ./internal/session/...` — pass (1.264s), including
  `TestSnapshot_GenuinelyBlankCaptureServesTextNotNoSnapshot` (cycle-1 Minor 2's read-side
  test, unaffected: its scenario captures non-blank text first, so the diff always differs
  on the second, blank call regardless of this guard).
- `make test` — every package passes (`cmd/musterd`, `internal/claudecode`, `internal/gitutil`,
  `internal/server`, `internal/session`, `internal/store`, `internal/termbridge`,
  `internal/tmux`, `internal/usage`).
- `make lint` — `0 issues.`

**Handoff for daemon-tests**: no existing test exercises the very-first-capture-blank
scenario (`TestSnapshot_GenuinelyBlankCaptureServesTextNotNoSnapshot` deliberately
captures non-blank text first, per its own doc comment, to build the *read-side* cycle-1
scenario — it does not touch this write-side edge). A regression test for this fix would:
create a session, call `RecordLaunch` (no snapshot yet), set the fake snapshotter's text
to `""` for the target, call `mgr.captureSnapshot` once, then assert `mgr.Snapshot(id)`
returns `ok=true` with empty text and a non-zero `at` — proving the very first capture,
even when blank, sets `LastSnapshotAt`. No implementation file needed further changes
beyond `internal/session/manager.go`.
