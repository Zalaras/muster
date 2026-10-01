# Review: status-inconsistencies

**Plan**: status-inconsistencies
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser approved, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Status Inconsistencies

**Plan**: status-inconsistencies
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 47524 words (budget 20000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 prompt-less `idle_prompt` is a no-op | Yes — `machine.go` `KindNeedsInputIdle` returns on `promptID == nil`; the guard sits in the machine, so Apply's enveloped rebind still runs (D2) | D1, D2, D3 (`machine_turnstate_test.go`, `interrupt_test.go`); E1 | pass |
| REQ-2 `PostToolBatch` registered, turn activity | Yes — `settings.go` (12 events), `interpret.go` turn-activity case with latch and marker | D4, D16; E2 | pass |
| REQ-3 wait owned by the raising agent | Yes — `StateInput.Agent`/`AgentUnknown`, `waitOwnedByOther` guard after latch and prompt adoption, owner set on `PermissionRequest`, kept by a `permission_prompt` Notification | D5 (6 states × owner × activity agent), owner-recorded test; E3 and the subagent-owned-wait test | pass |
| REQ-4 transcript interrupt sweep | Yes — `claudecode.PromptInterrupted` (64 KB tail via `readTail`), `session/interrupt.go` checker outside the lock, `KindTurnInterrupted` arm re-validates the current prompt and open turn, `pollLoop` calls it after `checkLiveness`, `Unread` via `closesTurn` | D7–D11, poll-loop and race tests; three E4-family specs | pass |
| REQ-5 `backgroundTasks` on the Session | Yes — `interpretStop` counts `status:"running"`; set on Stop, reset by clear-rebind (explicit and escalated) and resume-bind, persisted (0011), always on the wire | D12, D13, D15; E5, E6, REQ-8 spec | pass |
| REQ-6 card line `1 background task` | Yes — `backgroundLine()` in `sessions/card.ts`, `.bg-tasks` slot last in `.card-in`, text = title, hidden when 0 or dead | W2, W3; E5, E6, ended-card test | pass |
| REQ-7 no action button on a live card | Yes — live `actions` `[]`, `.acts-row` hidden when empty; ended keeps Resume, Remove; mainhead and tile footer untouched | W1; E7, E8, E9 and six rewritten specs | pass |
| REQ-8 main Stop keeps a subagent wait | Yes — `KindTurnClosed` closes the prompt and captures latch, `lastActivity` and count before returning early when `needs_input` with a subagent owner; `Unread` not set | D14, D6, unread test; REQ-8 spec | pass |
| REQ-9 canary static strings | Yes — three needles in `test/canary/static_test.go` | Ran by me, static tier only (reads the binary, launches nothing): `ok test/canary 0.928s` against the installed 2.1.286 | pass |
| DIAG | `kb:diagram/containers`, `kb:diagram/daemon-components`, `kb:diagram/store-schema` (updated to 0011, true), plan `## Diagrams` delta (the three `turn_interrupted` edges match the arm's `inOpenTurn` states) | — | fail — correctness Major 2 |

## Build & Tests

E2E tests: pass (515) · Daemon tests (race): pass (24 packages ok, `go test -race -count=1 ./...`) · Web tests: pass (1945) · Daemon build: pass · Web build: pass · Lint: pass (golangci 0 issues, biome clean) — all read from $GATES_LOG_DIR (`gates-status-inconsistencies-c1`, 0 failed lines; contrast 43 pairs × 3 themes, 0 failures; versions fresh; e2e-lint clean; features-scope clean; comment-checks clean; dead-refs 0 missing).

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass (deduped to the race run, 02-test.log) |
| D2 | `go build ./...` | pass (01-build.log, empty = clean) |
| D3 | `make lint` | pass (03-lint.log, 0 issues) |
| W1 | `make web-build` | pass (04-web-build.log) |
| W2 | `make web-test` | pass (05-web-test.log, 1945 passed) |
| W3 | `make web-lint` | pass (06-web-lint.log) |
| E1 | `make e2e` | pass (16-e2e.log, 515 passed) |
| K1 | `make check-kb` | pass (10-kb-check.log, 476 records, 0 problems) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass — four `proposed` ADRs with `refs: plan:status-inconsistencies`, the transcript ADR's `files:` now names `interpret_transcript.go` and `interrupt.go`; five new fact records; the CLAUDE.md hard rule amended; no `deviation:` lines in any log; both `doc-delta:` lines affect no doc sentence. `TODO.md` ticks wait for an approved review, per the orchestrate skill. Every Doc Delta line matches the code. Two stale statements the delta does not name are correctness Majors 1 and 2 |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| R1 | no `any` in new web code | pass | `git diff main...HEAD -- web/src web/e2e` added lines: the only `any` hits are prose in two comments |
| R2 | background line uses no state-colour token | pass (code) | `.card .bg-tasks` uses `--mono`, `--fs-xs` and `--fg-muted` only, has no border and sets `tabular-nums`. The rendered result in each theme is review-browser's to observe |
| R3 | REQ-9 strings asserted against the installed binary | pass | `MUSTER_CANARY_OFFLINE=1 go test -tags=canary -run 'TestInstalledBinaryCarriesInterfaceStrings$' ./test/canary` → `ok` (claude 2.1.286) |
| R4 | `internal/session` reads no transcript bytes | pass | `rg 'os\.(Open\|ReadFile)\|bufio' internal/session` (non-test) finds nothing. `interrupt.go` imports only `context`, `errors` and `claudecode` (for the Kind). The checker comes in through `Config.InterruptChecker` ← `server.Config` ← `cmd/musterd/main.go:422` |
| R5 | no payload key, event name or marker text outside `internal/claudecode/` in non-test code | pass | Telltale `rg` outside the package: only comments (`machine.go:84,204` name `idle_prompt`, as existing comments already do) and pre-existing store column names. The marker prefix and `PostToolBatch` appear only in `internal/claudecode` and in the canary test |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — `StateInput.Agent` is an opaque value; `background_tasks`, `agent_id` and `promptId` are parsed only in `internal/claudecode` |
| 2 | Terminal-output state parsing | pass — the new state source is the transcript's interrupt line, as the amended rule and kb:adr/lifecycle-interrupt-read-from-transcript allow; nothing reads pane text |
| 3 | Blocking hook handler | pass — ingest path untouched; the sweep runs on the poll goroutine |
| 4 | Bare tmux / resize-pane | pass — no tmux change |
| 5 | Payload logging | pass — the sweep logs only `err` and `session_id` |
| 6 | Empty-gauge dishonesty | pass — `backgroundLine` returns null for 0 or dead; the slot is hidden, never shows "0" |
| 7 | Identity on `session_id` | pass — `AttentionAgent` is a subagent id, and identity is untouched |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass — the static canary tier only scans the binary |

## Issues

### Critical
None.

### Major
1. **[daemon-tests]** A stale "eleven events" count in a test the plan's ingest delta covers ("stops being true: every 'eleven events' count"). The assertion message at `internal/server/settings_shell_test.go:110` says `"REQ-5: one hook.sh serves all eleven events"`, and the comment at `:134` says `"every one of the eleven events carries the exact same command string"`. Muster now registers twelve events. Fix: say "twelve", or drop the number, as `settings.go`'s comments already do.
2. **[orchestrator]** DIAG: `kb:diagram/containers` is now false. Its prose (`docs/diagrams/containers.md:29-30`) says "musterd scans Claude Code's transcript **only** to locate the plan file", and its `Rel(musterd, claudefiles, "Finds plan via transcript; …")` names no other read. musterd now also reads the transcript tail on every poll tick for the interrupt line (kb:adr/lifecycle-interrupt-read-from-transcript). The same drift, smaller: `kb:diagram/daemon-components`'s `Rel(cmd, cc, "wrapper scripts, version")` leaves out the interrupt checker `cmd/musterd` now wires from `internal/claudecode`. Fix: update both records in a `docs(status-inconsistencies)` commit.

### Minor
1. **[e2e-specs]** Two comment defects in `web/e2e/helpers/payloads.ts`:
   - (a) `rawPostToolBatch` and the three builders after it were inserted between `rawPreCompact`'s JSDoc (`/** Raw \`PreCompact\` — increments the compaction counter only … */`, now at ~line 407) and `rawPreCompact` itself. That JSDoc now sits above `rawPostToolBatch`'s doc, and `rawPreCompact` is left with none. Move the PreCompact comment back onto its function.
   - (b) The `interruptTranscriptLine` comment says the `message.content` nesting "is unmeasured for this line specifically (flagged in test-specs.md)". That is no longer true. test-specs.md Handoff 3 records the orchestrator's confirmation. I also read the probe instance's own transcripts (`~/.claude/projects/-private-tmp-muster-probe-instances-9-repo/*.jsonl`, keys and marker text only): all four interrupt lines are `{"type":"user","promptId":<string>,"message":{"role":"user","content":[{"type":"text","text":"[Request interrupted by user…]"}]}}`. Say it is measured, and cite kb:fact/interrupt-recorded-in-transcript.

### Notes
1. **[note]** After a daemon restart the sweep cannot see an interrupt. `currentPromptID` is in memory only, and the sweep needs it, so a session restored in `working`/`planning`/`needs_input` is not checked until its next turn-activity hook adopts a prompt id. An Esc in that window, including right after "Update and restart", leaves the card `working`. This matches the plan's "for the current prompt" and daemon-tests flagged it. It may be worth a line in `proposed-backlog.md`.
2. **[note]** `Apply` sets `Unread` whenever `closesTurn(kind) && State == idle`, even when the `KindTurnInterrupted` arm returned early. In the race `TestSweepInterrupts_TurnClosedBetweenCheckAndApply` covers (a Stop lands between check and apply), `Unread` is recomputed from the watcher a moment after the Stop computed it. That is harmless unless the developer read the card inside that window. No change requested.
3. **[note]** kb:fact/interrupt-recorded-in-transcript records the text block but not the `message.content` array nesting. `lineInterrupts` depends on that nesting, and the canary guards only the strings. The measurement in Minor 1(b) could go into the fact's body. This is orchestrator record work if wanted.
4. **[note]** The installed binary is 2.1.286. The five new facts are `verified: 2.1.285..2.1.285`, and the gate's `versions check` passed. Any bump ritual is `/claude-code-upgrade`'s.
5. **[note]** `rail-cards.spec.ts` stays on `fileDaemon`, as its header says, but E8 takes the per-test `daemon` fixture because it changes the Tiles view pref (conventions §Testing). The Fixture plan header does not mention that exception. The choice is correct; the header is incomplete.
6. **[note]** `.card .bg-tasks` uses `margin-top: 7px`. That matches its sibling `.note`, and `style.css` has no spacing tokens, so this is not a token violation.

## Browser review

# Browser review: Status Inconsistencies

**Plan**: status-inconsistencies
**Part verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 29004 words (budget 20000)
**Rig**: `make web-build build` at 5c1732a (`bin/musterd` v0.19.1-34-g5c1732a); each test ran a fresh scratch daemon from `helpers/fixtures.ts` (data dir `$TMPDIR/muster e2e-*`, which has a space in it; a private `-S` tmux socket inside it, torn down with it; the shared E2E stub `claude`); headless Chromium 1280×900; throwaway spec `web/e2e/zz-review-browser.spec.ts`, deleted afterwards. Gates log c1: 0 failed lines (e2e 515 passed, web-build green), so the app driven here is the one that ships.

## Matrix

Hosts: **focus** = the Focus-view rail card; **strip** = the Tiles strip card (same template); **tile** = a live tile; **mainhead** = the Focus mainhead. No state colour means the computed `color` equals the resolved `--fg-muted` and matches none of `--teal/--amber/--rose/--violet/--idle`.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-6 | focus | no data | no line at count 0 | pass | `.bg-tasks` hidden=true, computed display `none`, box 0×0; `/api/state` backgroundTasks 0 |
| REQ-6 | focus | data | `1 background task` visible at rest, last line | pass | text and title `1 background task`; display block, opacity 1, visibility visible; last child of `.card-in`; box 14,197–288,213 inside card 0,85–299,224; previous visible row (`.activity.claude`) ends at 190, so no overlap; card-in scrollHeight 138 = clientHeight 138 |
| REQ-6 | focus | data | plural, counts only running entries | pass | a Stop with 2 running + 1 completed gives `2 background tasks`, API reports 2 |
| REQ-6 | focus | data | state and badge unchanged by the count | pass | badge `idle`, API state `idle`, attention null |
| REQ-6 | focus | data | line survives a new turn (`working`) | pass | badge `working`, line `2 background tasks` still inside the card (201–217 in 85–228) |
| REQ-6 | focus | data, compact / expanded / comfortable | contained in every density | pass | compact: bg 166–183 in card 85–191; expanded: 201–217 in 85–228; long-text expanded: 493–510 in 303–521; scrollHeight = clientHeight in each |
| REQ-6 / R2 | focus | data, Instrument / Dark / Light | mono, `--fs-xs`, `--fg-muted`, no state colour, no border | pass | Instrument rgb(178,182,195) = `--fg-muted`; Dark rgb(193,197,204) = `--fg-muted`; Light rgb(65,69,79) = `--fg-muted` (≠ `--idle` rgb(83,87,100)); font ui-monospace 11.25px; border 0; transparent background |
| REQ-6 | focus | data → Stop `[]` | line removed | pass | hidden=true, display `none`; badge `idle`; API 0 |
| REQ-6 / EC12 | focus | data, settled 6 s | line and idle hold across render ticks and a poll tick | pass | after 6 s: line `1 background task`, badge `idle`, API `idle` |
| REQ-6 | focus | daemon-down | card keeps its last-known line; banner shown | pass | after SIGTERM: `#banner` display block, opacity 1, box 0,46–1280,78, text "musterd unreachable — hook output in open panes is Muster's absence, not session failure."; bg line still `1 background task` inside the card |
| REQ-5 | focus | after restart | count persisted | pass | after restart: banner hidden, line `1 background task`, API backgroundTasks 1 |
| REQ-6 / INV-C / EC15 | focus | dead (pane killed with count 1) | line hidden on a dead card | pass | alive false, `.bg-tasks` hidden=true, display `none`; the ended card's acts-row shows Resume and Remove |
| REQ-6 / REQ-8 | focus | needs_input + count | line and attention note together | pass | note `needs your permission — 00:02` visible, bg line 583–600 below it, inside the card |
| REQ-6 | strip | no data | no line at count 0 | pass | before the Stop: strip card has no bg row (strip 116 px tall) |
| REQ-6 | strip | data | line visible and contained | pass | text `1 background task`, opacity 1, display block; box 14,873–1269,890 inside card 0,762–1280,900 inside `#tiles-strip` 0,760.6–1280,900 (viewport 900); scrollHeight 138 = clientHeight 138 |
| REQ-6 | strip | data, compact / expanded | contained | pass | compact: 876–893 in 795–900; expanded: 873–890 in 746–900 |
| REQ-6 | strip | daemon-down | last-known line kept; banner shown | pass | banner display block, same text; strip line `1 background task` in the same box |
| REQ-5 | strip | after restart | persisted | pass | strip line `1 background task` after restart |
| REQ-6 | tile | data | — | N/A — plan §UI Specifications puts the line on the card only; tile shows none (count 0 matches) | |
| REQ-6 | pop-out | any | — | N/A — `/doc.html` hosts no session card | |
| REQ-7 / INV-D | focus | no data, rest | no action button on a live card | pass | the only button in the card is Pin; `.acts-row` hidden=true, display `none`, 0 children, height 0; card-in padding below the last row is unchanged (10 px), so no empty gap |
| REQ-7 / INV-D | focus | data, hover | none on hover | pass | buttons [Pin (opacity 1)]; acts-row display `none` |
| REQ-7 / INV-D | focus | data, current | none while current | pass | aria-current `true`; buttons [Pin]; acts-row display `none` |
| REQ-7 | focus | data, keyboard | no hidden focusable stop left in the card | pass | focus on Pin, then Tab, lands on the mainhead `rename` button (outside the card); Pin keeps focus across 1.2 s |
| REQ-7 / INV-D | focus | daemon-down | none | pass | buttons [Pin]; acts-row display `none` |
| REQ-7 / INV-D | strip | data, rest and hover | none | pass | buttons [Pin]; acts-row hidden, display `none`, 0 children, at rest and on hover |
| REQ-7 | focus | ended, not current | Resume then Remove, revealed on hover or focus | pass | at rest the acts-row has opacity 0, display flex, labels [Resume, Remove]; on hover opacity 1; Tab from Pin gives Resume focus and opacity 1 |
| REQ-7 | focus | ended, current | Resume and Remove shown | pass | acts-row opacity 1, [Resume, Remove] |
| REQ-7 | mainhead | data | End present and working with a pointer | pass | End opacity 1, display block, box 1078,55–1123,80; click → "End session?" dialog → End session → card `ended`, API alive false, tmux pane gone |
| REQ-7 | tile | data | footer End unchanged and working | pass | `.tfoot` End opacity 1, box 591,398–628,417; click opens "End session?" (then cancelled) |
| REQ-1 | focus | idle | a prompt-less idle_prompt changes nothing | pass | 2.5 s later: badge `idle`, note display `none`, API idle, attention null |
| REQ-1 | focus | working | a prompt-less idle_prompt changes nothing | pass | 2.5 s later: badge `working`, note hidden, API working, attention null |
| REQ-2 | focus | needs_input (ExitPlanMode) | unmarked PostToolBatch → planning | pass | before: `needs input` with note `needs your permission`; after, settled 1.5 s: badge `planning`, note hidden, API planning, attention null |
| REQ-3 / INV-B | focus | needs_input (main wait) | subagent Pre/Post/PostToolBatch keep the wait | pass | 2.5 s later: badge `needs input`, note visible, API attention `permission`; a later main PostToolUse gives `working` with attention null |
| REQ-8 | focus | needs_input (subagent wait) | main Stop keeps needs_input and attention | pass | badge `needs input`, note visible, API attention kept, backgroundTasks 1; the owning subagent's PostToolUse then gives `working` |
| REQ-4 | focus | working | interrupt line → idle within 10 s | pass | idle 4.3 s after the append; settled: attention null, failure null; card `unread` (not attached) |
| REQ-4 | focus + mainhead | needs_input, focused | tool-use interrupt → idle | pass | idle after 3.3 s; note hidden, attention null; card `current`, not unread (attached) |
| REQ-4 | tile | working | interrupt → idle | pass | the tile `.sdot` goes from title `working` (teal) to title `idle` (idle grey) after 3.9 s; API idle |
| REQ-1..4, 8 | strip / pop-out | — | N/A — daemon state rows; the strip card is the same `stateBadge` template as the focus row above, and pop-out has no state | | |
| REQ-9 | — | — | N/A — static canary tier, not browser-observable (R3, orchestrator's version ritual) | | |
| REQ-1..4 | any | daemon-down | N/A — these transitions need a running daemon; the daemon-down banner and last-known card are measured above | | |
| §7.1 | tile/focus | data | one live client | N/A — this plan adds no terminal client or surface; the gate e2e (515 green) covers the rule | |

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** When a strip card gains the background line, the whole strip grows and the live tiles shrink. Measured at 5 sessions in 2×2: `#tiles-strip` went from 116 to 139 px and the first tile from 349 to 337 px; the tile footer geometry stayed 84×11 at this size. The note and activity rows already make the strip grow the same way, so this is the existing pattern, not a regression. No change requested.
2. **[note]** In Tiles, a session shown as a live tile has no background-task indicator. The line exists only on the card, and cards appear only in the strip there. This matches the plan, whose UI Specifications place the line on the card only. It is recorded because the developer may expect it on the tile header.
3. **[note]** The pop-out (`/doc.html`) is N/A for every row: it hosts no session card and no state.

## Maintainability review

# Maintainability review: Status Inconsistencies

**Plan**: status-inconsistencies
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 33917 words (budget 20000)
**Scope**: 25 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (four are generated CLAUDE.md trailers)

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/main.go | (composition root) server.go wiring | n/a (one registration line) | filelen 513→515, parseFlags/run unchanged (45/44 on main); no reason given | Minor 1 |
| internal/claudecode/CLAUDE.md | (generated trailer) | n/a | none | pass |
| internal/claudecode/claudecodetest/claudecodetest.go | same file's builders (RawPostToolUseFile, RawPreToolUseTool, RawNotification, PlanAttachmentLine, SlugLine) | size reason only | filelen 536→621; reason holds | Minor 4 |
| internal/claudecode/interpret.go | files.go, status.go | yes (AgentUnknown) | none | pass |
| internal/claudecode/interpret_transcript.go | launchtranscripts.go, plan.go | no line for the file (sweep line covers the session side) | none | Minor 3 |
| internal/claudecode/settings.go | — (comment/list edit) | n/a | none | pass |
| internal/server/server.go | shellactivity.go, sessionwire.go | yes (via sweep line) | New 43 (unchanged from main) | Minor 2 |
| internal/server/sessionwire.go | server.go | n/a (field add) | none | pass |
| internal/session/CLAUDE.md | (generated trailer) | n/a | none | pass |
| internal/session/apply.go | machine.go, writeorder.go | n/a (helper beside isBindKind) | none | pass |
| internal/session/interrupt.go | liveness.go (checkLiveness, collectSessions) | yes | none | pass |
| internal/session/liveness.go | interrupt.go | yes | none | pass |
| internal/session/machine.go | session.go, apply.go, interpret.go | yes (clearAttention, idle guard) | applyInput 52→68; no reason given | Minor 1 |
| internal/session/manager.go | liveness.go, server.go | yes (via sweep line) | filelen 551→559; reason holds | Minor 2 |
| internal/session/row.go | store/session.go | n/a (field add) | none | pass |
| internal/session/session.go | machine.go | yes (clearAttention; guard named on fields) | none | pass |
| internal/session/writeorder.go | row.go | yes (doc-delta line) | none | pass |
| internal/store/migrations/0011_turn_state.sql | 0010_pending_resume.sql | n/a | none | pass |
| internal/store/session.go | migrations/0011 | n/a (field add) | none | pass |
| web/src/protocol/session.ts | decode.ts, hello.ts, same file's parseContext | no | none | Minor 5 |
| web/src/render/CLAUDE.md | (generated trailer) | n/a | none | pass |
| web/src/render/sessions.ts | tiles.ts, mainhead.ts | yes | none | pass |
| web/src/sessions/CLAUDE.md | (generated trailer) | n/a | none | pass |
| web/src/sessions/card.ts | permission.ts, render/update.ts | yes | none | pass |
| web/src/style.css | neighbouring `.card` rules | n/a | none | pass |

## Issues

### Critical

### Major

### Minor
1. **[daemon-impl]** `internal/session/machine.go:23` `applyInput` grew from 52 statements on `main` (measured: `golangci-lint run --enable-only funlen` on a `main` worktree, `'applyInput' has too many statements (52 > 40)`) to 68 on this branch (gates `15-size.log`), and `daemon-implementation.md` § Decisions gives no reason for it (its only size line covers `claudecodetest.go` and `manager.go`). `cmd/musterd/main.go` is in the same position: filelen 513 → 515, no reason given. Cites review question 6 / kb:adr/process-size-linters-warn-never-fail. The sibling `internal/claudecode/interpret.go` pulls its larger arms into named functions (`interpretStop`, `interpretNotification`, `interpretSessionStart`). A fix must leave either a reason in Decisions that the code bears out, or an `applyInput` whose switch arms can be read without scrolling through the new KindTurnClosed/KindTurnInterrupted owner logic. A split that only silences the warning does not count. For main.go, one line of reason is enough.
2. **[daemon-impl]** The interrupt-checker seam is written as an inline func type three times, with two different parameter names: `internal/server/server.go:66` `InterruptChecker func(transcriptPath, promptID string) (bool, error)`, `internal/session/manager.go:96` `InterruptChecker func(path, promptID string) (bool, error)`, `internal/session/manager.go:113` `interruptChecker func(path, promptID string) (bool, error)`. The sibling seams have names: `internal/server/server.go` `Attach attachFunc`, and `internal/server/shellactivity.go:36` `type ttyCanonicalChecker func(ttyPath string) (bool, error)`. `internal/session/manager.go:20` declares `PaneChecker` as a named interface. A fix must give the seam one name, declared once in `internal/session` and referenced by both Configs and the Manager field, so a signature change happens in one place.
3. **[daemon-impl]** `internal/claudecode/interpret_transcript.go:303` `scanInterrupt` is a second way to walk a transcript tail's JSONL lines in this package. It uses `bufio.NewReader(r).ReadBytes('\n')`. The sibling `internal/claudecode/launchtranscripts.go:215` `transcriptScan.scanChunk` uses `bufio.NewScanner` with an explicit `scanner.Buffer(..., 1024*1024)` and says the same thing about a mid-line first line being skipped. The design line's search (`rg "PromptInterrupted|interrupt" internal/`) could not find the existing loop, and no `design:` line covers the new file. Cites conventions § Design "reuse before add" and review question 2. A fix must leave either one line-iteration path shared by both readers, or a `design:` line that says why the interrupt scan needs a different reader. If the reason is that there is no 1 MiB line cap, a tail with one huge tool_result line before the interrupt line would make Scanner stop early, and the line should say so.
4. **[daemon-impl]** `internal/claudecode/claudecodetest/claudecodetest.go:255` `RawSubagentPermissionRequest` adds the subagent marker by decoding `RawPermissionRequest`'s JSON output and encoding it again. The sibling builders do it another way: `RawPostToolUseFile` (`:158`), `RawPreToolUseTool` (`:181`) and the new `RawPostToolBatch` (`:276`) each take `ToolFileOpts.AgentID` and set `agent_id`/`agent_type` inline. The marker is now written in four places, in two shapes, and the builder that decodes its own output is the one a newcomer would not expect. The file's rows for the other builders show the pattern. A fix must leave one way for a builder in this file to add the subagent marker. That can be a shared helper or opts on `RawPermissionRequest`. Either way, `agent_type`'s value should live in one place.
5. **[web-impl]** `web/src/protocol/session.ts:292-297` validates `backgroundTasks` as `typeof === "number" && Number.isInteger && >= 0`. The sibling count fields in the same parser check only the type: `compactions` (`:214`, `typeof compactions !== "number"`) and `railPos` (`:303`, `typeof railPos !== "number"`). A negative or fractional count therefore rejects the whole session on this field alone, with no `design:` line saying why (review question 2). A fix must make the parser treat its integer counts one way: either match the siblings, or state in `web-implementation.md` § Decisions why this count alone is range-checked.

### Notes
1. **[note]** Shared state: `AttentionAgent`/`BackgroundTasks` are declared with their guard (`session.go:156-166`, "under Manager.mu"). Every writer (`rg "\.BackgroundTasks =|\.AttentionAgent =|clearAttention\(\)"`: machine.go 59/73/89/107/115/126/134/195/200/231) runs inside `applyInput`/`applyBind` under `m.mu`, and both fields are in `restoredSessionFields`. `sweepInterrupts` takes value copies through `collectSessions` under the lock, calls the checker outside it, and `KindTurnInterrupted` checks `currentPromptID`/`inOpenTurn` again under the lock. I checked the interleaving checker(P)=true → Stop(P) → UserPromptSubmit(P2) → Apply(P): it is a no-op. I found no unguarded path.
2. **[note]** Reuse is good in several places. `PromptInterrupted` reuses `readTail`/`transcriptTailBytes` (launchtranscripts.go:285/40). `sweepInterrupts` mirrors `checkLiveness`'s `collectSessions` shape. `interpretStop` follows the sibling `interpret*` helpers. `backgroundLine` sits beside `repoLine`/`activityLines` as a pure view-model function. Hiding an empty `.acts-row` reuses `reconcileActsRow`.
3. **[note]** `interpret_transcript.go`'s `interpret_` prefix reads as part of the hook `Interpret` family, but the function is a transcript reader wired through cmd/musterd and is never called by `Interpret`. The sibling transcript readers are `launchtranscripts.go` and `plan.go`. The name is a matter of taste; no change requested.
4. **[note]** The new injected edge (cmd/musterd → `claudecode.PromptInterrupted` → `session.Manager` sweep) belongs to review-work's DIAG row: check that `kb:diagram/daemon-components` shows it.
5. **[note]** The singular/plural handling in `sessions/card.ts:321` (`n === 1 ? "1 background task" : ...`) sits beside a similar one at `render/update.ts:101` (`shells.length === 1 ? "shell" : "shells"`). Two uses do not yet justify a helper.
6. **[note]** The size warnings that already existed and did not grow, `server.go` `New` (43) and `cmd/musterd/main.go` `parseFlags`/`run` (45/44), measure the same on `main`. The `claudecodetest.go` (621) and `manager.go` (559) filelen hits have a reason in Decisions that holds.
