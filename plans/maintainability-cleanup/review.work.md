# Correctness review: Maintainability Cleanup

**Plan**: maintainability-cleanup
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: `kb: pack 74587 words (budget 8000)`. It is over budget, so I read `plan.md`, `findings.md`, the decisions and the per-unit logs directly.
**Diff**: `git diff 47325f7..HEAD` (HEAD `6db870d`)

This run did not go through `/orchestrate`. The plan has Units instead of REQs, no ```checks block and no Doc Delta. My focus followed the spawn prompt: behaviour preservation, hard rules, whether the fix units are correct, and whether comments are true. Five read-only helper agents did the behaviour hunts and the comment spot-check: server wire, cmd and adapters, session and store, web, and comment truth. I re-verified every finding below that I kept, and I reviewed F1, F2 and F3 myself.

## Requirements

| Unit | Implemented | Tested | Status |
|------|-------------|--------|--------|
| F1 session writes | Yes | Yes | **fail**: the rollback is wrong when two writes are queued on one id (Major 1, Major 2) |
| F2 server concurrency | Yes | Yes | fail: two small new races (Minor 4, Minor 5); a test does not check what its name says (Minor 6) |
| F3 SessionEnd stops writing alive | Yes | Yes | pass. It agrees with accepted kb:adr/lifecycle-liveness-from-pane-existence ("SessionEnd … never sets or clears alive") |
| WF1 stale spawn / check render | Yes | Yes | pass. It changes nothing beyond what it claims |
| 59cd108 tile refit | Yes | e2e soak (findings) | pass. The only change is one line, `tilesGridEl.append(refs.root)` |
| D2 manager split | Yes | existing | pass. All 79 top-level declarations are byte-identical across the move |
| D3 session/store duplicates | Yes | Yes | fail: the launch-rollback removal order changed without being sanctioned (Minor 7) |
| D4 transport | Yes | existing | pass. The msgInternalError change covers 9 sites, not the 7 the ledger says (Note 9) |
| D5 terminal sockets | Yes | existing | pass. Only log wording changed (Note 7) |
| D6 composition root | Yes | existing | pass |
| D7a/b feature files | Yes | Yes | **fail**: the launcher rollback's kill primitive changed and can kill the wrong tmux session (Major 3) |
| D8 cmd/musterd | Yes | existing | pass. `-help` differs only by the removed plan IDs; `-version` is byte-identical |
| D9 test tidy | Yes | — | pass (Note 11) |
| D10 adapters | Yes | Yes | pass (Note 8) |
| D11 reader package | Yes | Yes | pass. Confinement, walk cap and write-log eviction are identical |
| W1–W8 web | Yes | Yes | fail: diagrams re-render twice per snapshot (Minor 3) |
| X1 plan-ID sweep | Yes | — | **fail**: false comments and citations (Major 4, Major 5); refactor commits added new plan IDs (Minor 1, Minor 2) |
| X2 docs | Yes | — | pass |
| DIAG | `kb:diagram/daemon-components` and `kb:diagram/web-components`, redrawn in `6db870d` | — | pass. Both name the new `internal/reader`, `keyedlock`, `evict` and `boundedwait` nodes and the `web/src/api/`, `protocol/` modules; I found no edge contradicted by the code |

## Build & Tests

- **E2E tests:** pass, 446/446 at `a4840e9` (`$GATES_LOG_DIR/e2e.log`). `6db870d` differs from it only in docs.
- **Size:** `WARN size` reports 60 hits (`size.log`). Judging it is review-maintainability's job.
- **Daemon tests (race), web tests, build, lint and `check-kb`:** these logs are **not** in `$GATES_LOG_DIR`. The only evidence is the gate record in `findings.md`: `make check`, `make test-race` and `make e2e` passed at each checkpoint. I did not re-run them.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| — | no ```checks block in the plan | Minor 8 `[orchestrator]` |
| E2E | `make e2e` at `a4840e9` | pass, 446/446 |
| DOC | doc upkeep, plus the protocol.md edits against the decisions | **FAIL**: `docs/adr/process-adapter-run-seam-constructor-default.md` is `status: accepted` on a plan branch (Major 6). Every `docs/protocol.md` edit (`:984`, `:1304-1305`, `:1344-1346`) is the correction that `decisions/sessionend-alive-hint` sanctions, and none is anything else. |

## Reviewer-Verified Criteria

The plan has no `### Reviewer-Verified` list. I checked its binding defaults by hand:
- There are no barrels in `web/src/api/` or `web/src/protocol/`.
- The `exec.CommandContext` + `WaitDelay` repetition was left inline.
- The code comments added by the sweep cite no plan IDs. The refactor commits did add some; see Minor 1 and Minor 2.

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. None of the added `session_id`/`permission_mode`/`--resume` hits outside `internal/claudecode` is Claude Code format: they are Muster log fields or comments. `PermissionModes` lives in `claudecode/launch.go`. |
| 2 | No state from terminal output | pass |
| 3 | Non-blocking hooks, 1–2 s timeouts | pass. `hookTimeoutSeconds=2` and the wrapper's `curl --max-time 2` are byte-identical. |
| 4 | tmux `-L muster`; sizing | pass. `socketFlag` is unchanged and every exec goes through `c.exec(ctx,"tmux",socketFlag+args)`. Major 3 is about which session gets targeted, not about the socket. |
| 5 | No payload logging | pass. The new 5xx logs carry `err` only. |
| 6 | Empty-gauge honesty | pass. The decoders accept and reject exactly as at base. |
| 7 | Identity on tmux target | pass |
| 8 | No settings.json / CLAUDE_CONFIG_DIR | pass |
| 9 | Real `claude` only in canary, with haiku | pass. The canary now calls the no-seam wrappers with the same argv. |

## Issues

### Critical
None.

### Major

1. **[daemon-impl] F1: a failed persist restores a stale clone whenever a later write is queued for the same id, so memory and the DB diverge. That is exactly what `finishWrite`'s doc says cannot happen.** `internal/session/writeorder.go:29-46` (the restore) and `:49-55` (`cloneRestore`)
   - Every setter builds `row` and `prev` under `m.mu` from the memory state at that moment. Take two writes on one id: t1, then t2. t2's `prev` already contains t1's mutation, and so does its `row`. Then:
     - **If t1 fails and t2 succeeds:** t1's restore sets `*cur = *prev1`, which wipes t2's mutation as well. t2 then persists and broadcasts its row, which holds t1 + t2. The DB and every client hold t1 + t2; memory holds neither.
     - **If t1 fails and t2 fails:** memory ends at `prev2`, which is post-t1. Memory now claims t1, which the DB never recorded.
   - The rail abort path (`manager_rail.go:87-90`) has the same flaw whenever any other setter has queued a write on a session in the batch.
   - The doc comment says "memory never claims what the DB doesn't hold" (`writeorder.go:24-25`). That is false in both cases above.
   - It is reachable wherever persist can fail while a second write is in flight: a store error, or a canceled ctx. For example, `terminal.go:332` passes `r.Context()` to `MarkSeen`.
   - The fix must hold for any queue depth. Options: have each queued write rebuild its row from live memory after it wins its turn; or, on failure with a later ticket already drawn, reload the row from the store instead of restoring `prev`; or cancel the queued successors the way the rail abort does. The implementer chooses.
2. **[daemon-tests] F1: no test covers a failed persist with a successor queued on the same id.** Every row of `TestPersistFailure_RollsBackEveryMutationUniformly` is a single write against a closed store. `TestWriteTurns_…` covers ordering only.
   - Add a white-box test in the style of `TestWriteTurns_FinishWriteOrdersPersistsByTicketNotGoroutineStartOrder`: draw t1 and t2 through real setters (or apply the mutations by hand), make t1's persist fail, let t2 succeed, then assert that memory equals the store row.
   - Add the case where both fail too. Both cases must fail on HEAD.
3. **[daemon-impl] D7a/D10 (c-m6): the launch/resume rollback went from `kill-window -t muster-<id>:@N` to `kill-session -t muster-<id>`. This behaviour change is not sanctioned, and on a real tmux it can kill a different session.** `internal/server/launcher.go:188-196`
   - tmux resolves a session target by prefix when no session has the exact name. I measured this on tmux 3.7b with a private socket:
     - With only `muster-7-shell` running, `kill-session -t muster-7` exits 0 and kills the shell.
     - With `muster-12` and `muster-3` running, `kill-session -t muster-1` exits 0 and kills `muster-12`.
   - The rollback runs after a spawn succeeds and a Record fails. If the new Claude pane has already exited by then, the rollback kills whatever `muster-<id>*` session is the unique prefix match: that session's own shell, which End deliberately keeps, or another live session.
   - At base, the window-id target just errored once the window was gone.
   - The fix: restore the window-target kill, or make `tmux.Client.KillSession` match exactly (`-t =<name>`, which also closes Major 7). P7 already records that this path has no test.
4. **[daemon-impl] The sweep and the refactors left false comments in daemon code.**
   - **Wrong citations:**
     - `internal/session/session.go:150` and `internal/store/session.go:99` cite `kb:adr/rail-unread-inferred-from-live-terminal-client` for `LastPrompt`. That ADR never mentions the prompt; the source is `kb:adr/rail-activity-line-turn-aware-default-with-pref`. At `store/session.go:99` the citation is right for `Unread` only.
     - `internal/session/apply.go:134-135` says "status posts never drive the state machine (kb:adr/ingest-envelope-authoritative-binding)". That ADR only covers binding. The "never a state source" rule is `kb:anchor/state.transitions`.
     - `internal/session/apply.go:33-34` credits monotonic rebinding to the same ADR. The decision is `kb:adr/ingest-monotonic-rebind`.
     - `cmd/musterd/main.go:481-482` cites `kb:adr/usage-keychain-token-read-only` for where the Keychain account name is looked up. That ADR says nothing about it.
     - `cmd/musterd/update.go` (`runUpdate`) cites `kb:adr/update-install-kinds-decide-who-may-apply` for "never restarting anything". That ADR is about who may apply, not about restarting.
   - **Stale file and identifier references:**
     - `internal/tmux/tmux.go:403` and `:411` name `internal/server/terminal.go`'s `pumpShellSocketToPTY`. It moved to `internal/server/shells.go`, whose `:399` is the only caller of `ScrollCopyMode`.
     - `internal/termbridge/termbridge.go:5` says "internal/server/terminal.go is the only caller". The only `Attach` call is `internal/server/server.go:156`. This was already false at base, but the sweep touched this comment and left it.
     - `internal/server/updatemanager.go:32` names "reader.go's gitFilesFunc", which no longer exists.
     - `internal/session/actions.go`'s `ShellNames` doc says "reportAndSweepUnknown above". That function is in `reconcile.go:183`.
     - `cmd/musterd/main.go:47` names `IssueAPIURL` and `internal/claudecode/settings.go:108` names `cfg.HookURL`. Neither field exists.
5. **[web-impl] False comment:** `web/src/render/focuskeep.ts:40` names `restoreIfLost`. The function is `restoreFocusIfLost` (`:61`).
6. **[orchestrator] `docs/adr/process-adapter-run-seam-constructor-default.md` is `status: accepted` on the plan branch.** The rule is `proposed` on a plan branch, flipped at completion (CLAUDE.md § Doc upkeep). The record has `refs: plan:maintainability-cleanup` and describes what shipped; only the status is wrong. This does not block approval.
7. **[orchestrator] A pre-existing data-loss hazard, found while measuring Major 3, and outside this plan's scope.**
   - `Manager.removeLocked`'s not-alive branch calls `KillSession(sessionTmuxName(id))` (`internal/session/actions.go:99`). This was the same at base (`manager.go:1345`).
   - Removing dead session 1 while `muster-12` is the only `muster-1*` session kills the live session 12. That is the second measurement in Major 3.
   - `KillSession`'s verification `PaneExists(name)` also prefix-matches.
   - I propose it for `proposed-backlog.md` as high priority; it is the developer's to file. An exact-match target (`=name`) in `tmux.Client` fixes both this and Major 3.

### Minor

1. **[daemon-impl] The refactor commits added plan and review IDs to non-test comments** (conventions § Comments; the plan's binding default):
   - `internal/session/row.go:10` (a-m1)
   - `internal/session/manager.go:171` (a-M1), `:302` (S7/a-m4), `:341-342` ("Critical 1", split across lines), `:345` and `:355` (S6)
   - `internal/session/actions.go:95` and `internal/session/liveness.go:54` (S6)
   - `internal/store/migrate.go:36` (a-m6)
   - `internal/store/repo.go:74` (a-m7)
   - `internal/store/store.go:72` and `:80` (a-m2)

   `manager.go:344-345` also names `reconcileRow` and `livenessTarget`, which no longer exist.
2. **[web-impl] Plan IDs in web comments:**
   - `web/src/sessions/permission.ts:1-2` ("review.maintainability.d-webcore.md Seed check B2", added by W2)
   - `web/src/sessions/format.ts:78` (R5) and `web/src/features/connection.ts:72` (R1), which the web sweep missed
3. **[web-impl] W7 (e-M8): each snapshot now re-renders every mounted reader's diagrams twice instead of once.**
   - `features/theme.ts:34` emits `themeChanged` synchronously on both the `prefs` and the `snapshot` events.
   - `wsapp.ts:34-35` emits both of those back to back for every snapshot.
   - `features/reader.ts:599-601` chains a full `rerenderDiagrams` pass per emit.
   - Base used a `MutationObserver`, which folded the two same-task attribute writes into one callback.
   - The final DOM is the same, but the mermaid work is doubled and a second SVG swap can be seen on every reconnect.
   - The fix: emit or coalesce so there is at most one pass per task, as at base.
4. **[daemon-impl] F2 (b-m11): `applyWG.Add(1)` runs after `m.mu.Unlock()`.** `internal/server/updatemanager.go:359-363`
   - A `Stop` that lands between the unlock and the `Add` sees `applyCancel` set, cancels it, and `Wait`s on a zero counter, so it returns at once. The goroutine then starts unwaited.
   - This is `sync.WaitGroup`'s documented misuse: an Add from zero concurrent with a Wait.
   - The fix: move the `Add(1)` inside the critical section, before the unlock.
5. **[daemon-impl] F2 (b-M2): a takeover can now install a connection after `closeAll` has already emptied the map.** `internal/server/terminal.go:119-141` against `:202-213`
   - At base, `closeAll` waited on `mu` until an in-flight takeover had registered, then closed it with 1001.
   - Now `mu` is released across `attach`. A takeover that finishes after `closeAll` puts its conn into the fresh map, where it never gets the 1001 shutdown close that `kb:anchor/terminal.ws` pins.
   - The fix: have `closeAll` set a closed flag; `takeover` checks it under `mu` when it installs, and closes the conn with 1001 if set.
6. **[daemon-tests] F2: the name `TestHandlePutPrefs_ConcurrentPUTsAllReachTheBroadcastToo` claims broadcast coverage, but the test only asserts the persisted object.** `internal/server/prefs_concurrency_test.go`
   - It drains both frames and discards them, so it duplicates its sibling test.
   - After the fix the broadcasts are serialised under `f.mu`, and one client's outbox is FIFO, so the second frame must carry both `view:"tiles"` and `density:"3x2"`. Assert that.
7. **[daemon-impl] D3 (S7/a-m4): the launch rollback now deletes the store row first, so a failed delete leaves a never-announced placeholder session in memory.** `internal/session/manager.go:282`, `:311-329`
   - `launcher.rollback` only logs the error, so the placeholder is served by `List()` and the next `/api/state` or `/ws` snapshot.
   - At base, memory was dropped first, so the placeholder was never visible. The ledger's behaviour notes do not record this change.
   - The comment's rationale, "a failed delete can never look like a completed remove", fits `Remove`. It is backwards for a row the UI was never told about.
   - The fix: on the `notify=false` rollback path, drop memory whatever the store result, which is base behaviour. The Reconcile sweep's new order is fine.
8. **[orchestrator]** The plan has no ```checks block, and `$GATES_LOG_DIR` holds only `e2e.log` and `size.log`. The `make check` and `make test-race` results at HEAD are asserted in `findings.md` § Gate record, not logged where review can read them.

### Notes

1. **[note]** F3 kept `KindDeathHint`/`KindClearDeathHint` as separate names, although both now behave exactly like `KindInert`. The F3 log gives the reason (proposed-backlog P8's nudge would re-need the distinction). The name no longer describes the behaviour; renaming it is a shape question for review-maintainability.
2. **[note]** F2: while a takeover is in flight, `Watched` now returns false for that key instead of blocking. A turn closing in that window sets `Unread=true`, and the attach's `MarkSeen` then clears it: one extra pair of upserts. The comment at `terminal.go:110-113` documents this. The `terminalRegistry.keyLocks` entries are never forgotten; there are at most two per session id.
3. **[note]** F1: a rail batch that fails partway keeps the writes that already persisted and rolls back the rest, so two sessions can share a `RailPos` in both memory and the DB. That matches the doc ("writes already persisted … stand"). At base the DB had the same partial state.
4. **[note]** The session-agent measured that D3 surfaces a corrupt stored time as a scan error, which the ledger sanctions. The effect is larger than the ledger's wording suggests: `ListSessions` stops at the first bad row, so `LoadAll` fails and the daemon starts with an empty registry. Only hand-edited data can reach this.
5. **[note]** Unknown-session errors are now the bare `ErrUnknownSession`, so the ingest warn lines lose the session id. End's final capture log now reads "pane snapshot capture failed" without "final". Both are log-only.
6. **[note]** D5: the shell socket's pre-upgrade `PaneExists` is now bounded by `shellTmuxTimeout` (5 s). A stuck tmux reaches the existing 500 `internal_error` branch (base `shells.go:253-256`) instead of hanging. That is not a new status.
7. **[note]** D5 log wording: "shell terminal ws upgrade rejected" is now "terminal ws upgrade rejected", and "attaching shell bridge failed" is now "attaching terminal bridge failed". Close codes, takeover and MarkSeen order, and the resize clamps are all identical on both surfaces.
8. **[note]** Small unsanctioned deltas, none on the wire:
   - `tmux.Client.run` returns stdout only on success; base used CombinedOutput. This only matters if tmux writes to stderr on exit 0.
   - `musterd -update` requests `ReleaseTag(latest.String())` instead of the raw tag, so it differs only for a tag without the `v` or with leading zeros. Its not-a-release stderr now includes the tag.
   - Status routing now keys on `job.kind == claudecode.KindStatus` instead of `ev.Type == "status_line"`.
   - `runCapture`'s error on an expired ctx no longer wraps the ExitError; its only caller debug-logs it.
9. **[note]** D4 changed nine 5xx bodies to `msgInternalError`, one more than the ledger's seven: `prefs.go:345` "persisting prefs" is also in the set. No old text was pinned in `docs/protocol.md`. `errorResponse` gained `paths,omitempty`, and the 409 body is byte-identical.
10. **[note]** W2's sanctioned `logApiFailure` and W5's `basename` are as described. The decoders, the API calls (method, path, headers, credentials, body, all 21 endpoints) and the WS URLs are identical, and there is no new `innerHTML`, second socket or dependency.
11. **[note]** In claudecodetest (test support), `envelope()` turns `musterSession` 0 into 1. No caller passes 0; D9a's log records it. `claudecodetest.go` (17), `tmuxtest.go` (2) and `migrations/0009_rail_cards.sql` still carry plan IDs. These are test-support and migration files that X1 did not sweep; they fit proposed-backlog P6.
12. **[note]** The F3 regression test `TestApply_SessionEndAfterStopKeepsResumeChance` drives exactly the decision's failure: Stop, then SessionEnd, then Reconcile on the next boot keeps the row. It would fail on the pre-F3 code, where alive=false makes the reconcile sweep delete the row.
