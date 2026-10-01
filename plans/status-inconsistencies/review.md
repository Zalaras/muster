# Review: status-inconsistencies

**Plan**: status-inconsistencies
**Verdict**: approved
**Cycle**: 2
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code approved, browser approved, maintainability approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Status Inconsistencies

**Plan**: status-inconsistencies
**Part verdict**: approved
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

## Browser review

# Browser review: Status Inconsistencies

**Plan**: status-inconsistencies
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 29006 words (budget 20000)
**Rig**: `make web-build build` at 90f6149 (`bin/musterd v0.19.1-42-g90f6149-dirty`; only `plans/` files were dirty). Every test ran its own scratch daemon from `helpers/fixtures.ts`: data dir `$TMPDIR/muster e2e-*` (the path has a space in it), a private `-S` tmux socket inside that dir, torn down with it, and the shared E2E stub `claude`. Headless Chromium at the config viewport, 1280×720. Throwaway spec `web/e2e/zz-review-browser.spec.ts` (4 tests, all green), deleted afterwards; `git status --porcelain` shows nothing of mine. Gates log c2b: 0 failed lines (e2e 515 passed, web-build green), so the app driven here is the one that ships.

Since cycle 1, `web/src` changed by one comment line (`web/src/protocol/session.ts`). The daemon changes are `applyTurnClosed` / `applyTurnInterrupted` pulled out of `applyInput`, plus the `InterruptChecker` type. So every daemon transition row (REQ-1..4, REQ-8) and every background-line row was driven again on this build.

## Matrix

Hosts: **focus** = the Focus-view rail card; **strip** = the Tiles strip card (same template); **tile** = a live tile; **mainhead** = the Focus mainhead. "No state colour" means the computed `color` equals the resolved `--fg-muted`.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-6 | focus | no data | no line at count 0 | pass | `.bg-tasks` hidden=true, display `none`, box 0×0; API backgroundTasks 0 |
| REQ-6 | focus | data | `1 background task` visible at rest, last line | pass | text and title `1 background task`; display block, opacity 1, visibility visible; last visible child; box 14,197–288,213 inside card 0,85–299,224; card-in scrollHeight 138 = clientHeight 138 |
| REQ-6 | focus | data | plural, counts only running entries | pass | Stop with 2 running and 1 `completed` shows `2 background tasks`; API 2 |
| REQ-6 | focus | data | state and badge unchanged by the count | pass | badge `idle`, API `idle`, attention null |
| REQ-6 | focus | data, new turn | line kept while `working` | pass | badge `working`, line `2 background tasks` at 201–217, inside card 85–228 |
| REQ-6 | focus | data, compact / expanded / comfortable | contained in each density | pass | compact 166–183 in 85–191 (105 = 105); expanded 201–217 in 85–228 (142 = 142); comfortable same as expanded |
| REQ-6 / R2 | focus | data, Instrument / Dark / Light | `--fg-muted`, mono `--fs-xs`, no border | pass | Instrument rgb(178,182,195) = resolved `--fg-muted`; Dark rgb(193,197,204) = `--fg-muted`; Light rgb(65,69,79) = `--fg-muted`; ui-monospace 11.25px; border 0; transparent background |
| REQ-6 / EC12 | focus | data, settled 6 s | line and idle hold across render and poll ticks | pass | after 6 s: `1 background task`, badge `idle`, API `idle` |
| REQ-6 | focus | data → Stop `[]` | line removed | pass | hidden=true, display `none`, box 0×0; API 0 |
| REQ-6 | focus | daemon-down | last-known line kept; banner prominent | pass | after SIGTERM: `#banner` display block, opacity 1, box 0,46–1280,78, text "musterd unreachable — hook output in open panes is Muster's absence, not session failure."; line `1 background task` at 229–245, inside card 117–256 |
| REQ-5 | focus | after restart | count persisted | pass | banner hidden; line `1 background task`; API 1 |
| REQ-6 / INV-C / EC15 | focus | dead, count 1 | line hidden on an ended card | pass | alive false; `.bg-tasks` hidden=true, display `none` |
| REQ-6 / REQ-8 | focus | needs_input + count | line and attention note together | pass | note `needs your permission — 00:04` at 559–576, line at 583–600 below it, line is the last child |
| REQ-6 | strip | no data | no line | pass | `.bg-tasks` display `none`; strip 622–720 |
| REQ-6 | strip | data | line visible and contained | pass | display block, opacity 1; box 14,693–1269,710 inside card 0,582–1280,720 inside `#tiles-strip` 581–720 (viewport 720); 138 = 138 |
| REQ-6 | strip | daemon-down | last-known line kept | pass | banner visible; strip line same text and box |
| REQ-5 | strip | after restart | persisted | pass | strip line `1 background task` |
| REQ-6 | tile | data | — | N/A — plan §UI Specifications puts the line on the card only; tile `.bg-tasks` count 0 | |
| REQ-6 / REQ-7 | pop-out | any | — | N/A — `/doc.html` hosts no session card and no state | |
| REQ-7 / INV-D | focus | data, rest / hover / current | no action button on a live card | pass | buttons [Pin] only in all three; `.acts-row` hidden=true, display `none`, 0 children, height 0; aria-current `true` when current |
| REQ-7 | focus | data, keyboard | no hidden focusable stop in the card | pass | Pin keeps focus for 1.2 s; Tab moves to the mainhead rename button (`rb-bg`), outside the card |
| REQ-7 / INV-D | focus | daemon-down | no action button | pass | buttons [Pin]; acts-row display `none` |
| REQ-7 / INV-D | strip | data, rest and hover | no action button | pass | buttons [Pin]; acts-row hidden, display `none`, 0 children |
| REQ-7 | focus | ended, not current | Resume then Remove, shown on hover or focus | pass | at rest acts-row display flex, opacity 0, labels [Resume, Remove]; after hover, opacity 1; Tab from Pin focuses Resume and the row goes to opacity 1 |
| REQ-7 | focus | ended, current | Resume and Remove shown | pass | after mainhead End: class `ended current`, acts-row opacity 1, [Resume, Remove] |
| REQ-7 | mainhead | data | End present and works with a pointer | pass | End opacity 1, display block, box 1078,55–1123,80; click opens "End session?"; End session gives API alive false and the tmux pane is gone |
| REQ-7 | tile | data | footer End unchanged | pass | `.tfoot` End opacity 1, box 591,308–628,327; click opens the End dialog (cancelled with Escape) |
| REQ-1 | focus | idle | prompt-less idle_prompt changes nothing | pass | 2.5 s later: badge `idle`, note display `none`, API idle, attention null, failure null |
| REQ-1 | focus | working | prompt-less idle_prompt changes nothing | pass | 2.5 s later: badge `working`, note hidden, API working, attention null |
| REQ-2 | focus | needs_input (ExitPlanMode) | unmarked PostToolBatch → planning | pass | before: `needs input`, note `needs your permission`; settled 1.5 s later: badge `planning`, note hidden, API planning, attention null |
| REQ-3 / INV-B | focus | needs_input (main wait) | subagent Pre/Post/PostToolBatch keep the wait | pass | 2.5 s later: badge `needs input`, note visible, API attention `permission`; then main PostToolUse gives `working`, attention null |
| REQ-3 / INV-B | focus | needs_input (subagent wait) | main and second-subagent PostToolUse keep the wait | pass | badge `needs input`, note visible, API attention `permission` |
| REQ-8 | focus | needs_input (subagent wait) | main Stop keeps needs_input and attention | pass | badge `needs input`, note visible, API attention kept, backgroundTasks 1; the owning subagent's PostToolUse then gives `working`, attention null |
| REQ-4 | focus | working, not current | interrupt line → idle within 10 s | pass | idle 3.3 s after the append; settled: attention null, failure null; card `s-idle unread` |
| REQ-4 | focus + mainhead | needs_input, current | tool-use interrupt → idle | pass | idle after 3.3 s; note hidden, attention null; card `s-idle current`, not unread |
| REQ-4 / EC7 | focus | working on p2 | interrupt for older p1 ignored; p2's line → idle | pass | after 6 s hold: `working`, API working; after the p2 line: `idle` |
| REQ-4 | strip | working | interrupt → idle | pass | the session landed in the strip (6th session), and the strip badge went `working` → `idle` within 10 s |
| REQ-4 | tile | working | interrupt → idle | [note] not re-measured this cycle; see Note 1 | |
| REQ-1..3, 8 | strip / pop-out | — | N/A — the strip card is the same `stateBadge` template measured on focus; pop-out has no state | | |
| REQ-9 | — | — | N/A — static canary tier, not browser-observable (R3) | | |
| REQ-1..4 | any | daemon-down | N/A — these transitions need a running daemon; daemon-down banner and last-known card are measured above | | |
| §7.1 | tile/focus | data | one live client | N/A — the plan adds no terminal client or surface; gate e2e (515 green) covers the rule | |

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** REQ-4 on a live tile's `.sdot` was not re-measured. My tile-host session was the sixth, so it was demoted to the strip, and I measured the interrupt there instead (strip badge went `working` → `idle`). Cycle 1 measured the tile dot going `working` → `idle` in 3.9 s. Since then `web/src` changed by one comment, and the interrupt path is the same daemon broadcast that the focus and strip rows observed on this build. No change requested.
2. **[note]** As in cycle 1: when a strip card gains the background line, the strip grows (581 vs 622 top at 720 px) and the live tiles shrink. This is the existing pattern for note and activity rows. No change requested.
3. **[note]** As in cycle 1: a session shown as a live tile has no background-task indicator, because the plan puts the line on the card only.

## Maintainability review

# Maintainability review: Status Inconsistencies

**Plan**: status-inconsistencies
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 33934 words (budget 20000)
**Scope**: 25 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (four are generated CLAUDE.md trailers). Since cycle 1 (`b82e324..HEAD`), six non-test files changed: claudecodetest.go, interpret_transcript.go, server.go, machine.go, manager.go, protocol/session.ts. The other 19 files have not changed since cycle 1, and their cycle-1 rows are carried below.

## Delta

| Prior Minor | Fix commit | Verified how |
|-------------|------------|--------------|
| 1: `applyInput` grew with no reason given; main.go filelen had no reason | 69adef7 | The KindTurnClosed and KindTurnInterrupted arms are now `applyTurnClosed` (`machine.go:222`) and `applyTurnInterrupted` (`machine.go:249`). Each arm is now one call, the same shape as `interpret*` in claudecode. Gates `15-size.log`: `applyInput` is 51 statements, below main's 52. The split pulls out two whole owner-logic arms, so it is a real restructure and does more than silence the warning. Decisions gives a reason for main.go 513→515: the two lines are the wiring in the composition root. That reason holds (`main.go:422`). |
| 2: interrupt-checker seam declared inline three times | 69adef7 | `type InterruptChecker func(path, promptID string) (bool, error)` is declared once at `internal/session/manager.go:102`. `session.Config` (`:96`), the Manager field (`:118`) and `server.Config` (`server.go:66`) all use it. `rg 'func\(path, promptID\|func\(transcriptPath' internal cmd` finds no inline copies left. |
| 3: `scanInterrupt` uses a second line reader with no design line | 69adef7 | The comment at `interpret_transcript.go:38-42` and a `design:` line in the cycle-1 Decisions both say why it reads with `bufio.Reader`: Scanner has a 1 MiB cap and ends the whole scan on an over-long line, which would hide an interrupt that comes after a large tool_result line. This is the reason the Minor asked for, and it holds. |
| 4: subagent marker written four times in two shapes | 69adef7 | `markSubagent` (`claudecodetest.go:231`) is the only place `agent_type` is set. `rg 'agent_type' internal --glob '!*_test.go'` finds one assignment, at `:236`. All four builders call it. `RawPermissionRequest` delegates with `""`, and the decode/re-encode is gone. |
| 5: only `backgroundTasks` is range-checked, with no reason given | 838e02f, c4fe5d5 | A comment at `web/src/protocol/session.ts:292` and a `design:` line in the web Decisions give the reason: the contract types this field "integer >= 0", and W4 pins that range. The reason holds. |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/main.go | server.go wiring | size line (cycle-1 fix) | filelen 515, reason holds; parseFlags/run 45/44, same as main | pass |
| internal/claudecode/CLAUDE.md | (generated trailer) | n/a | none | pass |
| internal/claudecode/claudecodetest/claudecodetest.go | RawPostToolUseFile, RawPreToolUseTool, RawPostToolBatch, marshal/orDefault helpers | size line; markSubagent is explained at the helper | filelen 619, reason holds | pass |
| internal/claudecode/interpret.go | files.go, status.go | yes (AgentUnknown) | none | pass |
| internal/claudecode/interpret_transcript.go | launchtranscripts.go (`transcriptScan.scanChunk`), plan.go | yes (cycle-1 fix) | none | pass |
| internal/claudecode/settings.go | (comment/list edit) | n/a | none | pass |
| internal/server/server.go | shellactivity.go (`ttyCanonicalChecker`), sessionwire.go | yes | New 43, same as main | pass |
| internal/server/sessionwire.go | server.go | n/a (field add) | none | pass |
| internal/session/CLAUDE.md | (generated trailer) | n/a | none | pass |
| internal/session/apply.go | machine.go, writeorder.go | n/a | none | pass |
| internal/session/interrupt.go | liveness.go (checkLiveness, collectSessions) | yes | none | pass |
| internal/session/liveness.go | interrupt.go | yes | none | pass |
| internal/session/machine.go | session.go, apply.go, claudecode/interpret.go | yes | applyInput 51 (main 52), restructured | pass |
| internal/session/manager.go | liveness.go, server.go; PaneChecker/PaneSnapshotter/TmuxSessions/Watcher port types | yes (InterruptChecker) | filelen 564 (559 at cycle 1; the +5 is the named seam asked for); reason holds | pass |
| internal/session/row.go | store/session.go | n/a (field add) | none | pass |
| internal/session/session.go | machine.go | yes (clearAttention; guard named on fields) | none | pass |
| internal/session/writeorder.go | row.go | yes (doc-delta line) | none | pass |
| internal/store/migrations/0011_turn_state.sql | 0010_pending_resume.sql | n/a | none | pass |
| internal/store/session.go | migrations/0011 | n/a (field add) | none | pass |
| web/src/protocol/session.ts | same file's compactions/railPos checks, decode.ts | yes (cycle-1 fix) | none | pass |
| web/src/render/CLAUDE.md | (generated trailer) | n/a | none | pass |
| web/src/render/sessions.ts | tiles.ts, mainhead.ts | yes | none | pass |
| web/src/sessions/CLAUDE.md | (generated trailer) | n/a | none | pass |
| web/src/sessions/card.ts | permission.ts, render/update.ts | yes | none | pass |
| web/src/style.css | neighbouring `.card` rules | n/a | none | pass |

## Issues

### Critical

### Major

### Minor

### Notes
1. **[note]** `internal/session/manager.go:102`: the other injected ports in this file (`PaneChecker` `:20`, `PaneSnapshotter` `:27`, `TmuxSessions` `:38`, `Watcher` `:49`) are grouped in one block ahead of `Config`. `InterruptChecker` is declared after `Config`. The `Config.InterruptChecker` field comment (`:93-95`) also repeats the type's first sentence. Both are placement and taste, so no change is requested.
2. **[note]** The shared-state analysis from cycle 1 still holds. `applyTurnClosed` and `applyTurnInterrupted` are called only from `applyInput`, under `Manager.mu`, and each says "Callers hold the manager's lock". `applyTurnInterrupted` keeps the recheck under the lock (`currentPromptID`/`inOpenTurn`).
3. **[note]** The size warnings that remain are unchanged from main or have a reason in Decisions that holds: `server.go` `New` 43, `main.go` `parseFlags`/`run` 45/44, filelen on `claudecodetest.go`/`manager.go`/`main.go`. The test-file funlen hits are test bodies and not `dupl` duplicates, so none is filed.
4. **[note]** The new injected edge (cmd/musterd → `claudecode.PromptInterrupted` → session sweep) belongs to review-work's DIAG row. Commit 21971eb says the diagrams now name the interrupt read.
