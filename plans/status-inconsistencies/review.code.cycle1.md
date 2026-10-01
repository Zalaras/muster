# Correctness review: Status Inconsistencies

**Plan**: status-inconsistencies
**Verdict**: needs-changes
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
