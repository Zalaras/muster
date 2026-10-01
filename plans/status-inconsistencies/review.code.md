# Correctness review: Status Inconsistencies

**Plan**: status-inconsistencies
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 47541 words (budget 20000)

Full review (cycle 1 carried an agent-tagged Major). The source was re-read from `git diff main...HEAD`, and the cycle-1 fixes from `git diff b82e324..HEAD`.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 a prompt-less `idle_prompt` is a no-op | Yes. `machine.go` `KindNeedsInputIdle` returns on `promptID == nil`. The guard sits in the machine, so Apply's enveloped rebind still runs | D1–D3 (`TestApplyInput_PromptlessIdlePrompt`, `TestApply_PromptlessIdlePromptAfterClear`); E1 | pass |
| REQ-2 `PostToolBatch` registered as turn activity | Yes. `settings.go` registers 12 events. `interpret.go` gives `PostToolBatch` the `PreToolUse`/`PostToolUse` case, with the latch, the marker and `Agent`. capture-8 confirms that a subagent's `PostToolBatch` carries `agent_id` | D4, D16 (`settings_test.go` asserts Len 12 and Contains); E2 | pass |
| REQ-3 a wait is owned by the agent that raised it | Yes. `StateInput.Agent`/`AgentUnknown`. `waitOwnedByOther` runs after the latch and prompt adoption. `PermissionRequest` sets the owner. A `permission_prompt` Notification keeps the owner while in `needs_input`, and is main otherwise | D5 (`TestApplyInput_WaitOwnership_INVB`, `…TurnStateInvariantsAcrossEverySourceState`), owner-recorded test; E3 | pass |
| REQ-4 transcript interrupt sweep | Yes. `claudecode.PromptInterrupted` reads a 64 KB tail through `readTail` and returns `false, nil` for a missing file. `session/interrupt.go` calls the checker outside the lock. `applyTurnInterrupted` re-checks the current prompt and the open turn under the lock. `pollLoop` sweeps after `checkLiveness`. `Unread` is set through `closesTurn`, and `lastActivity` is untouched | D7–D11, poll-loop, race and real-file tests; the E4 family | pass |
| REQ-5 `backgroundTasks` on the Session | Yes. `interpretStop` counts the `status:"running"` entries, and a Stop with no list leaves the count nil. The count is reset on clear-rebind and resume-bind, persisted by 0011, restored by writeorder rollback, and always on the wire | D12, D13, D15; E5, E6 | pass |
| REQ-6 card line `1 background task` | Yes. `backgroundLine()` returns null when the count is 0 or the session is dead. `.bg-tasks` is the last child of `.card-in`, and its text equals its title | W2, W3; E5, E6 | pass |
| REQ-7 no action button on a live card | Yes. Live `actions` is `[]` and `.acts-row` is hidden when empty. An ended card shows Resume then Remove. The mainhead and tile footer are untouched | W1; E7, E8, E9 and the rewritten specs | pass |
| REQ-8 a main Stop keeps a subagent's wait | Yes. `applyTurnClosed` closes the prompt and captures the latch, `lastActivity` and the count, then returns early when the state is `needs_input` and the owner is a subagent. `Unread` stays unset (`closesTurn && State == idle`) | D14, D6, `TestApply_StopKeepingASubagentWaitIsNotUnread`; REQ-8 spec | pass |
| REQ-9 canary static strings | Yes. Three needles in `test/canary/static_test.go:73-75` | I re-ran the static tier, which reads the binary and launches nothing: `ok test/canary 0.911s` against the installed 2.1.286 | pass |
| DIAG | `kb:diagram/containers` (it now names the interrupt read, prose and `Rel`), `kb:diagram/daemon-components` (`cmd → cc` now names "interrupt checker"; `session → cc "StateInput"` already covers the new import), `kb:diagram/store-schema` (0011 columns present), `kb:diagram/web-components` (no import change). The plan's `## Diagrams` delta (three `turn_interrupted` edges) matches `inOpenTurn`'s states and is left for doc-reconcile | — | pass (cycle-1 Major 2 fixed in 21971eb) |

## Build & Tests

All results are read from `$GATES_LOG_DIR` (`gates-status-inconsistencies-c2b`, 0 failed lines):

- E2E tests: pass (515)
- Daemon tests (race): pass (every package ok, `go test -race -count=1 ./...`)
- Web tests: pass (1945, 77 files)
- Daemon build: pass
- Web build: pass
- Lint: pass (golangci 0 issues, biome clean)

The other gate lines also passed: contrast (43 pairs × 3 themes, 0 failures), versions (fresh), e2e-honest (clean), kb check (476 records, 0 problems), dead-refs (0 missing), e2e-lint (clean), features-scope (clean) and comment-checks (clean). The `WARN size` line belongs to review-maintainability.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass (deduped to the race run, 02-test.log) |
| D2 | `go build ./...` | pass (01-build.log empty = clean) |
| D3 | `make lint` | pass (03-lint.log, 0 issues) |
| W1 | `make web-build` | pass (04-web-build.log) |
| W2 | `make web-test` | pass (05-web-test.log, 1945 passed) |
| W3 | `make web-lint` | pass (06-web-lint.log) |
| E1 | `make e2e` | pass (16-e2e.log, 515 passed) |
| K1 | `make check-kb` | pass (10-kb-check.log) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. All four ADRs are `proposed` (`lifecycle-attention-owned-by-raising-agent`, `lifecycle-background-tasks-count-not-state`, `lifecycle-interrupt-read-from-transcript`, `rail-live-card-offers-no-actions`). No `deviation:` lines appear in any log. Neither `doc-delta:` line affects a doc sentence. The CLAUDE.md hard rule is amended (line 78). The interrupt fact now records the `message.content` nesting. `TODO.md` ticks wait for an approved review, per the orchestrate skill. Every Doc Delta line matches the code: twelve events, the `PostToolBatch` turn activity, wait ownership with the main-Stop exception, the prompt-less `idle_prompt` no-op, the interrupt read, the `backgroundTasks` count, no live-card action and the bottom line |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| R1 | no `any` in new web code | pass | No added line in `git diff main...HEAD -- web/src web/e2e` matches `: any`, `as any`, `<any>` or `any[]` |
| R2 | background line uses no state-colour token | pass (code) | `.card .bg-tasks` uses only `--mono`, `--fs-xs` and `--fg-muted`, with no border and `tabular-nums`. Its `[hidden]` companion is present. The per-theme render is review-browser's to observe (it passed in cycle 1) |
| R3 | REQ-9 strings asserted against the installed binary | pass | `MUSTER_CANARY_OFFLINE=1 go test -tags=canary -run 'TestInstalledBinaryCarriesInterfaceStrings$' ./test/canary` → `ok` (claude 2.1.286) |
| R4 | `internal/session` reads no transcript bytes | pass | `rg 'os\.(Open\|ReadFile)\|bufio' internal/session` (non-test) finds nothing. The checker is the named `session.InterruptChecker` seam, wired `cmd/musterd/main.go:422` → `server.Config` → `session.Config` |
| R5 | no payload key, event name or marker text outside `internal/claudecode/` in non-test code | pass | Outside the package, the changed non-test files contain only two comments in `machine.go` (`:84`, `:177`) naming `idle_prompt`, which existing comments already do, and Muster's own `background_tasks` column name in the migration and `store/session.go` |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. `Agent` is an opaque value, and `background_tasks`, `agent_id` and `promptId` are parsed only in `internal/claudecode` |
| 2 | Terminal-output state parsing | pass. The only new state source is the transcript's interrupt line, which the amended rule and the proposed ADR allow. Nothing reads pane text |
| 3 | Blocking hook handler | pass. The ingest path is untouched, and the sweep runs on the poll goroutine |
| 4 | Bare tmux / resize-pane | pass. No tmux change |
| 5 | Payload logging | pass. The sweep logs only `err` and `session_id` |
| 6 | Empty-gauge dishonesty | pass. At count 0 or for a dead session, `backgroundLine` returns null and the slot is hidden. It never shows "0" |
| 7 | Identity on `session_id` | pass. Identity is untouched |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass. The static canary tier only scans the binary |

## Cycle-1 issues re-checked

| Cycle-1 issue | Fix commit | Verified how |
|---------------|------------|--------------|
| correctness Major 1 `[daemon-tests]` "eleven events" in `settings_shell_test.go:110,134` | `86712e5` | diff read. Both lines now say "every event" / "every registered event". `rg eleven` across `internal cmd web/src web/e2e` leaves only `settings.go:58,60`, which correctly describes the eleven non-SessionStart names |
| correctness Major 2 `[orchestrator]` stale containers / daemon-components diagrams | `21971eb` | diff read. Both records now name the interrupt read |
| correctness Minor 1(a) `[e2e-specs]` PreCompact JSDoc displaced | `6553322` | diff read. The JSDoc now sits directly above `rawPreCompact` |
| correctness Minor 1(b) `[e2e-specs]` "unmeasured" nesting comment | `6553322` | diff read. It now says measured and cites kb:fact/interrupt-recorded-in-transcript, which states the `message.content` nesting |
| maintainability Minors 1–5 (arms split, one `InterruptChecker` type, `markSubagent`, `scanInterrupt` reader reason, range-check reason) | `69adef7`, `838e02f`, `c4fe5d5` | diff read. `applyTurnClosed` and `applyTurnInterrupted` are byte-for-byte moves of the old arm bodies, with no behaviour change. `RawPermissionRequest` → `RawSubagentPermissionRequest(…, "")` yields the same body. The new comments are true |

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** `web/e2e/helpers/payloads.ts:481`: the reworded `interruptTranscriptLine` JSDoc line is 158 characters, while its neighbours wrap at about 95. The content is true and biome does not reflow comments, so no change is requested.
2. **[note]** The `SessionRow` comment in `internal/store/session.go` ("Neither is read by anything but the state machine's own persistence round trip and the wire") is loose for `AttentionAgent`, which never reaches the wire. It is true of the store row itself, which only `row.go` converts. No change requested.
3. **[note]** Cycle-1 correctness Notes 1 and 3 are now in `proposed-backlog.md` and the interrupt fact. Notes 2, 4, 5 and 6 still stand as written in `review.cycle1.md`.
