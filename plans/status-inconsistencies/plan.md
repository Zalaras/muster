# Plan: Status Inconsistencies

**Created**: 2026-09-30
**Status**: completed
**Work Type**: full-stack
**E2E Scope**: new-specs
**Fixture plan**: subagent-status.spec.ts fileDaemon (existing file; E1–E4 join it — every test launches and titles its own session, nothing asserts rail order, counts or prefs); rail-cards.spec.ts fileDaemon (existing file; E5–E9 join it and its End tests are rewritten in place — one titled session per test)
**Features**: lifecycle, ingest, rail, connection, actions, surfaces, focus, tiles
**Description**: Make the card's state match what the session is doing — Needs Input transitions (#32, #40, #57), interrupts (#59), background commands (#60), a background subagent clearing a main-agent permission wait — and drop the rail card's End button.

## Overview

Six state bugs share one cause: an event Muster never sees, or one it reads too broadly. An
interface probe on 2026-09-30 (Claude Code 2.1.285, all 31 hook events registered) settled
each one's mechanism: kb:fact/clear-idle-prompt-carries-no-prompt-id (#57),
kb:fact/plan-feedback-emits-only-post-tool-batch (#32), kb:fact/ask-user-question-hook-sequence
and kb:fact/subagent-hooks-during-permission-wait (#40 and the unnumbered background-subagent
entry), kb:fact/interrupt-recorded-in-transcript (#59) and kb:fact/agent-tool-async-by-default
(#60, #64).

The daemon fixes are: a prompt-less `idle_prompt` changes nothing; `PostToolBatch` is
registered and counts as turn activity; a permission wait remembers which agent raised it and
only that agent's activity clears it; the transcript becomes a state source for interrupts
only (the developer approved this on 2026-09-30, amending the "hooks and status line only"
hard rule for this one case); and `Stop.background_tasks` becomes a count on the wire.

The web shows that count as a neutral bottom line on the card — `1 background task` —
while the state stays `idle` (option A of three, chosen by the developer). The same change
removes End from a live rail card: End stays in the Focus mainhead and tile footers, and will
come back on the card through the right-click menu (#56, not this plan).

#64 could not be reproduced (the developer's other machine holds the events). It is ticked
done when this lands, with a note saying so.

## Requirements

### Must Have
- [ ] REQ-1 (#57): an `idle_prompt` notification with no prompt id changes no state and no field, from every state.
- [ ] REQ-2 (#32): Muster registers `PostToolBatch`; it is turn activity like `PostToolUse` — marker-aware, latch-updating — so a plan rejected with feedback leaves `needs_input` for `ACTIVE` at once.
- [ ] REQ-3 (#40, background subagent): `attention` records the agent that raised it — the main agent, or a subagent's opaque id. Turn activity from any other agent neither clears `attention` nor leaves `needs_input`.
- [ ] REQ-4 (#59): while a session's state is `working`, `planning` or `needs_input`, the daemon checks its transcript on every liveness-poll tick (~5 s). An interrupt line for the current prompt closes that prompt and lands `idle`, clearing `attention` and `failure` and setting `unread` exactly as `Stop` does. `lastActivity` is left unchanged.
- [ ] REQ-5 (#60): the Session object carries `backgroundTasks`, the number of `status:"running"` entries in the latest `Stop`'s `background_tasks`. It is 0 at launch, reset to 0 by a clear-rebind and a resume-bind, left unchanged by every other event, and persisted.
- [ ] REQ-6 (#60): a live card whose `backgroundTasks > 0` shows `1 background task` (or `<n> background tasks`) as its bottom line. The state and badge are unchanged. The line is hidden when the count is 0 or the session is dead.
- [ ] REQ-7: a live rail card, and a Tiles strip card (the same markup), offers no action button. An ended card still offers Resume then Remove. The mainhead's and the tile footer's End are unchanged.

### Should Have
- [ ] REQ-8: a `Stop` for the main turn while a **subagent** owns the permission wait keeps `needs_input` and its `attention`. It still closes the prompt and captures `lastActivity`, `backgroundTasks` and the latch.
- [ ] REQ-9: the static canary tier asserts that the installed binary carries the strings `PostToolBatch`, `[Request interrupted by user]` and `[Request interrupted by user for tool use]`, so a Claude Code bump that renames them fails `make canary` rather than silently breaking REQ-2 and REQ-4.

### Nice to Have
- None.

## Protocol Contract

Delta against `docs/protocol.md`. No HTTP endpoint or WS message type changes.

### WS daemon→UI: the Session object gains `backgroundTasks`

```jsonc
{
  // … every existing field unchanged …
  "backgroundTasks": 0   // integer ≥ 0, required on every Session object. The number of
                         //   background tasks (subagents and backgrounded shells) the latest
                         //   Stop reported as still running. 0 at launch; reset to 0 by a
                         //   /clear rebind and a resume; set by every Stop; unchanged by every
                         //   other event (StopFailure carries no list). Independent of state
                         //   and of alive: the UI hides it for a dead session. Display-only —
                         //   the state machine never reads it.
}
```

Arrives in ordinary `sessionUpsert`s. A Stop whose count equals the stored one sends no extra
upsert of its own (the Stop's own transition upsert carries it).

### State machine (`kb:anchor/state.tracked`, `kb:anchor/state.transitions`) — changed rows

Tracked variables gain `attentionAgent` (who raised `attention`: empty for the main agent, else
the subagent's opaque id; persisted; never on the wire) and `backgroundTasks` (above).

| Event (guards) | Transition / effect |
|---|---|
| Turn-activity events | Now `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, **`PostToolBatch`** (all carry `prompt_id` and `permission_mode`; a subagent's carry the marker) |
| Turn-activity event, state `needs_input`, event's agent ≠ `attentionAgent` | **No transition, `attention` kept**; the latch still updates; an open, unseen `prompt_id` is still adopted as current |
| `PermissionRequest` (applies) | → `needs_input`, reason `permission`; `attentionAgent` := the event's agent |
| `Notification` `permission_prompt` (applies) | → `needs_input`, reason `permission`; `attentionAgent` kept when the state was already `needs_input`, else main |
| `Notification` `idle_prompt` with **no `prompt_id`** | Persist only, no transition, no field change (follows `/clear`, kb:fact/clear-idle-prompt-carries-no-prompt-id) |
| `Stop` | As today, plus `backgroundTasks` := running count. **Exception:** when state is `needs_input` and `attentionAgent` is a subagent, the state and `attention` are kept (the prompt still closes) |
| Transcript interrupt for `currentPromptId` (daemon poll, state `working`/`planning`/`needs_input`, prompt not closed) | Close the prompt → `idle`; clear `attention`, `failure`; `unread` as `Stop`; `lastActivity` unchanged; `backgroundTasks` unchanged |
| clear-rebind, resume-bind | Also reset `backgroundTasks` := 0 and `attentionAgent` := main |

The machine's input vocabulary gains `turn_interrupted`; `StateInput` gains an opaque agent id
and a running-task count. Neither is a payload key name, so the `internal/claudecode` boundary holds.

## Schema Changes

Migration `0011_turn_state.sql`, forward-only:

```sql
ALTER TABLE session ADD COLUMN background_tasks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE session ADD COLUMN attention_agent  TEXT;  -- NULL = main agent; non-null only while attention_reason is
```

## Diagrams

Delta of the inline `stateDiagram-v2` in `docs/features/lifecycle/spec.md`: add
`working --> idle : turn_interrupted`, `planning --> idle : turn_interrupted`,
`needs_input --> idle : turn_interrupted` (drawn on the `active` composite for the first two).
The prose under it gains the other-agent and prompt-less-idle_prompt no-transition guards.

## UI Specifications

Governing: `docs/design/design-system.md` §3 (a state colour means only its state), §5 "Rail
card" and "Buttons", §6 honesty rule 5; reference render `docs/design/mockups/a-instrument.html`
(rail card).

### Views
- Rail card (Focus) and strip card (Tiles) — one template, `session-card-template` in `web/index.html`.

### Card changes
- A new last child of `.card-in`, after `.acts-row`: `<div class="bg-tasks" hidden></div>`.
  Its text is `1 background task` for one and `<n> background tasks` for n ≥ 2. It is visible (not hover-revealed) iff `alive &&
  backgroundTasks > 0`, and carries the same text as its `title`. Style: mono, `--fs-xs`,
  `--fg-muted`, no state colour, no border; it sits on the card's own ground.
- `.acts-row` on a **live** card is hidden and empty: `CardViewModel.actions` for a live
  session is `[]`. An ended card keeps `["Resume", "Remove"]` and its hover/focus/current
  reveal. The pin control in `.r0` is unchanged.

### User Flows
1. A turn ends with a backgrounded command running → card reads `idle` with `1 background task` at the bottom → the command finishes → Claude's task-notification turn ends → the line disappears.
2. The developer presses Esc mid-turn → within ~5 s the card leaves `working` for `idle`.
3. The developer wants to end a live session → uses End in the Focus mainhead or a tile footer (the rail card no longer offers it).

### States
- No data yet: `backgroundTasks` is 0 → no line (no "0 running").
- Data: the line as above.
- Daemon down: the existing banner; the card keeps its last-known line (it is last-known state like everything else on the card).

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---|---|---|---|
| Background-tasks line | — | `/^\d+ background tasks?$/` | a `<div class="bg-tasks">` inside the card; no implicit role |
| End on a live rail card | `button` | `End` | must have **zero** matches inside a live card |
| Resume on an ended card | `button` | `Resume` | unchanged |
| Remove on an ended card | `button` | `Remove` | unchanged |
| Mainhead End | `button` | `End` | unchanged; the replacement locator for specs that ended a session from a card |
| State badge | — | `idle` / `working` / `needs input` / `planning` | existing `.badge` text |

### Invariants
- **INV-A** — `attention` is non-null iff state is `needs_input` (existing), and `attentionAgent` is non-empty only while `attention` is non-null.
- **INV-B** — turn activity whose agent differs from `attentionAgent` never takes a session out of `needs_input`.
- **INV-C** — a card never shows the background line while its session is dead, or while `backgroundTasks` is 0.
- **INV-D** — no live card, in either host view (rail, Tiles strip), ever renders an action button.

INV-B is asserted from every source state a wait can be entered from (started, working,
planning, idle, failed, needs_input), with the wait raised by main and then by a subagent, and
the activity from main, from the owning subagent and from a second subagent (D5). INV-D is
asserted in both host views (E7, E8).

## Affected Files

### Daemon (daemon-impl)
- `internal/claudecode/settings.go` — register `PostToolBatch` (`allHookEvents` goes from 11 to 12).
- `internal/claudecode/interpret.go` — `PostToolBatch` → `KindTurnActivity`; `StateInput` gains `Agent string` (opaque, from the marker, "" for main) beside `FromSubagent`, and `BackgroundTasks *int` (Stop only); new `KindTurnInterrupted`.
- `internal/claudecode/interpret_transcript.go` (new; the existing `interpret*.go` glob owns it) — `PromptInterrupted(transcriptPath, promptID string) (bool, error)`: reads the transcript tail and reports whether a `user` line with that `promptId` carries a text block starting `[Request interrupted by user`. A missing file is `false, nil`. A pure `scanInterrupt(r io.Reader, promptID string) bool` sits behind it, for unit tests.
- `internal/claudecode/claudecodetest/claudecodetest.go` — wire-shaped builders for `PostToolBatch`, a prompt-less `idle_prompt`, a `Stop` with `background_tasks`, and an interrupt transcript line (kb:adr/ingest-wire-shaped-fixtures-via-claudecodetest).
- `internal/session/machine.go` — REQ-1, 3, 4, 5, 8 arms.
- `internal/session/session.go` — `AttentionAgent`, `BackgroundTasks` fields plus `Clone`.
- `internal/session/interrupt.go` (new) — the poll-tick sweep. It collects alive sessions in an open-turn state with a current prompt id and a transcript path, calls the injected checker outside the lock, and applies `KindTurnInterrupted` through the normal persist/broadcast path.
- `internal/session/manager.go` — `Config.InterruptChecker func(path, promptID string) (bool, error)`; nil disables it. `liveness.go`'s `pollLoop` calls the sweep after `checkLiveness`.
- `cmd/musterd/main.go` — one line wiring `claudecode.PromptInterrupted`.
- `internal/store/migrations/0011_turn_state.sql` (new), `internal/store/session.go` — the two columns.
- `internal/server/sessionwire.go` — `backgroundTasks`.

### Daemon tests (daemon-tests)
- `internal/session/machine_test.go`, `internal/claudecode/interpret_test.go`, `internal/claudecode/interpret_transcript_test.go` (new), `internal/claudecode/settings_test.go` (the `Len 11` sanity becomes 12), `internal/store/session_test.go`, `internal/server/sessionwire_test.go` (or its existing home).
- `test/canary/static_test.go` — REQ-9's strings.

### Web (web-impl)
- `web/src/protocol/session.ts` — `backgroundTasks: number`, validated as a non-negative integer.
- `web/src/sessions/card.ts` — live `actions` → `[]`; `backgroundLine: string | null` on `CardViewModel`; the `CardAction` doc comment.
- `web/src/render/sessions.ts` — write `.bg-tasks`; hide `.acts-row` when `actions` is empty.
- `web/index.html` — the `.bg-tasks` slot in `session-card-template`.
- `web/src/style.css` — `.card .bg-tasks`.

### Web tests (web-tests)
- `web/src/sessions/card.test.ts`, `web/src/render/sessions.test.ts`, `web/src/protocol/*.test.ts`.

### E2E (e2e-specs)
- `web/e2e/subagent-status.spec.ts` gains E1–E4 and `web/e2e/rail-cards.spec.ts` gains E5–E9 (no new spec files, so existing feature globs own them); `web/e2e/helpers/payloads.ts` gains the builders.
- Existing specs that press End on a rail or strip card are rewritten onto the mainhead's End, and assert the card has none: `actions.spec.ts:681,1010`, `rail-cards.spec.ts:138–196,257,323`, `rail-layout.spec.ts:236`, `terminal.spec.ts:560`.

## Edge Cases

1. `/clear` pair arrives reordered: the prompt-less `idle_prompt` of the new id arrives before its `SessionStart{clear}`. It is enveloped with an unseen id → clear-rebind → `started`, then its own row applies: prompt-less, so no transition → **D2**.
2. A straggler `idle_prompt` **with** the old id's closed prompt arrives after `/clear` → routed as a straggler; the closed-prompt guard still holds, because the rebind reset only the current id's list and the event carries a prompt id → **D3**.
3. `PostToolBatch` from a subagent for a closed prompt → marker rules as today → `ACTIVE` without reopening → **D4**.
4. A session launched before this release has no `PostToolBatch` entry until Muster next writes its directory's settings (the next launch or resume there). #32 persists for it until then → untested: needs a pre-upgrade settings file and a real Claude session.
5. The subagent that owns a wait finishes without its own `PostToolUse` (hook lost). The card stays `needs_input` until a main-agent Stop-family event, an interrupt or the next prompt from main → **D6**.
6. Main agent's `UserPromptSubmit` (a new prompt, unmarked) while a subagent owns the wait → other agent → no transition (INV-B) → **D5**.
7. Interrupt line present but for an older prompt id → not current → no transition → **D8**.
8. Interrupt, then the next prompt's `UserPromptSubmit` → the interrupted prompt is closed, the new id opens a turn → `ACTIVE` → **D9**.
9. Transcript missing, unreadable, or path unknown → no transition, logged at debug, retried next tick → **D10**.
10. An interrupt line arrives while state is `idle` or `started` (the turn already closed by a Stop) → the sweep skips non-open states → **D11**.
11. Daemon restart mid-wait → `attention_agent` and `background_tasks` reload from SQLite → **D12**.
12. A backgrounded dev server lives for hours → the line stays; the state stays `idle` → **E5**.
13. `StopFailure` with background work running → count unchanged (no list on the payload) → **D13**.
14. A subagent's `PermissionRequest` while the main agent already owns a wait → owner becomes the subagent (the latest prompt on screen) → **D5** (shared with edge case 6).
15. Pane death without `SessionEnd` while `backgroundTasks > 0` → alive:false hides the line; the count is left as-is → **W3**.

## Acceptance Criteria

### Daemon
- **D1**: a prompt-less `idle_prompt` applied from each of the six states leaves state, `attention`, `failure` and `stateSince` unchanged.
- **D2**: an enveloped prompt-less `idle_prompt` on a new Claude id rebinds to `started` and stays `started`.
- **D3**: after a clear-rebind, an `idle_prompt` carrying the previous id's closed prompt id changes nothing.
- **D4**: `PostToolBatch` interprets to `KindTurnActivity` with its `permission_mode` latched and the marker derived; from `needs_input` (main-owned) an unmarked one lands `ACTIVE` with `attention` cleared.
- **D5**: a table test runs every source state × wait owner (main, subagent A) × activity agent (main, A, B) and asserts INV-B after each row.
- **D6**: with a subagent-owned wait, a main `StopFailure` lands `failed` and an interrupt lands `idle`.
- **D7**: `PromptInterrupted` returns true for both marker texts under the matching `promptId` and false for a plan-feedback `tool_result`-only transcript.
- **D8**: an interrupt line for a non-current prompt id causes no transition.
- **D9**: after a `turn_interrupted`, an unmarked tool event for the interrupted prompt is a straggler and a new prompt id opens a turn.
- **D10**: the interrupt sweep with a missing transcript file or an erroring checker leaves the session unchanged.
- **D11**: the sweep never calls the checker for a session in `idle`, `started` or `failed`, or for a dead one.
- **D12**: `background_tasks` and `attention_agent` round-trip through the store.
- **D13**: `Stop` with two running entries sets `backgroundTasks` to 2, a later `Stop` with `[]` sets 0, `StopFailure` leaves it unchanged, and clear-rebind and resume-bind reset it to 0.
- **D14**: REQ-8 — a main `Stop` with a subagent-owned wait keeps `needs_input` and `attention` and closes the prompt.
- **D15**: `backgroundTasks` is present on every serialized Session object.
- **D16**: `MergeSettings` writes the command-hook entry for `PostToolBatch`.

### Web
- **W1**: `buildCardViewModel` for a live session yields `actions` `[]`, and for an ended one `["Resume","Remove"]`.
- **W2**: `backgroundLine` is `"1 background task"` for alive with n = 1, `"<n> background tasks"` for n ≥ 2, and `null` for n = 0.
- **W3**: `backgroundLine` is `null` for a dead session with n ≥ 1.
- **W4**: the Session validator rejects a missing, negative or non-integer `backgroundTasks`.

### E2E
- **E1**: a session in `idle` receiving a prompt-less `idle_prompt` still reads `idle` after the post.
- **E2**: a session in `needs input` (ExitPlanMode `PermissionRequest`) moves to `planning` on an unmarked `PostToolBatch`.
- **E3**: a session in `needs input` (main `PermissionRequest`) still reads `needs input` after subagent-marked `PreToolUse`/`PostToolUse`.
- **E4**: a `working` session whose transcript file gains an interrupt line for its current prompt reads `idle` within 10 s.
- **E5**: a `Stop` with one running shell shows `1 background task` on an `idle` card.
- **E6**: a later `Stop` with `[]` removes the line.
- **E7**: a live rail card has no `End` button, on hover and while current.
- **E8**: a live strip card in Tiles has no `End` button.
- **E9**: ending a session from the mainhead still works, and the ended card offers `Resume` and `Remove`.

### Automated Checks

```checks
D1 make test
D2 go build ./...
D3 make lint
W1 make web-build
W2 make web-test
W3 make web-lint
E1 make e2e
K1 make check-kb
```

### Reviewer-Verified
- **R1**: no `any` in new web code.
- **R2**: the background line uses no state-colour token (design-system §3), observed in each theme.
- **R3**: REQ-9's static canary strings are asserted against the installed binary (`make canary`'s static tier, run by the orchestrator under the version ritual, not the block above).
- **R4**: `internal/session` reads no transcript bytes — the checker is injected from `cmd/musterd`.
- **R5**: no Claude Code payload key, event name or transcript marker text appears outside `internal/claudecode/` in non-test code (the boundary hard rule).

## Doc Delta

**lifecycle** — becomes true:
- Turn-activity events are `UserPromptSubmit`, `PreToolUse`, `PostToolUse` and `PostToolBatch`.
- A permission wait remembers the agent that raised it; only that agent's activity ends it, and a main `Stop` does not end a subagent's wait.
- An `idle_prompt` with no prompt id (it follows `/clear`) changes nothing.
- An interrupt emits no hook; the daemon reads the transcript each poll tick while a turn is open and closes an interrupted turn into `idle` (kb:adr/lifecycle-interrupt-read-from-transcript).
- `backgroundTasks` counts the background work the latest `Stop` reported running.

**lifecycle** — stops being true:
- "State is derived only from ingested hook events, Muster's own launch and resume actions and tmux pane liveness." It becomes: … plus the transcript's interrupt line.
- "Notification `permission_prompt` and `idle_prompt` … enter `needs_input`" loses the unconditional reading for `idle_prompt`.
- The transitions table row "Turn-activity event (prompt not closed) … clear `attention`" gains the other-agent guard.

**ingest** — becomes true: Muster registers twelve events, `PostToolBatch` among them.
**ingest** — stops being true: every "eleven events" count.

**rail** — becomes true: a live card offers no action button; `1 background task` (or `<n> background tasks`) is the card's last line while background work runs.
**rail** — stops being true: "a live card offers End" (and the card anatomy's End mention).

**protocol.md**: the Session object's `backgroundTasks`; tracked variables; the table rows above.

## Out of scope

- The right-click menu on the rail card (#56) — End comes back there. The `TODO.md` #56 entry stays open; its "remove the End button" half is done by this plan (the developer may reword the entry).
- Canary coverage of the new facts' behaviours (a live `/clear` idle_prompt, plan feedback, interrupt transcript line) — beyond R3's strings; proposed, not filed.
- Compaction state (#65, #66).

## Implementation Notes

- *Amended at the wave-1 gate:* `**Features**` widened by actions, surfaces, focus and tiles, which own test files this plan edits (the End rewrites in `actions.spec.ts` and `terminal.spec.ts`, and `backgroundTasks` fixture fields), per kb:adr/process-features-scope-answered-by-widening-header. The work is unchanged.

- **Decisions (proposed ADRs at approval):** kb:adr/lifecycle-interrupt-read-from-transcript (the transcript's interrupt line is a state source, polled on the liveness tick, for interrupts only — amends the CLAUDE.md hard rule); kb:adr/lifecycle-attention-owned-by-raising-agent (REQ-3, REQ-8); kb:adr/lifecycle-background-tasks-count-not-state (supersedes kb:adr/lifecycle-subagent-marked-events-not-stragglers's "background-tasks field is fixture realism only"; state stays idle, option A); kb:adr/rail-live-card-offers-no-actions (supersedes the card half of kb:adr/actions-placement-mainhead-and-card-rows).
- **Carried-over measurements:** kb:fact/notification-types-observed (idle_prompt ~60 s after Stop, closed prompt) was re-checked on 2.1.285 and still holds; the prompt-less case is new. kb:fact/subagent-hooks-during-permission-wait was measured on 2.1.280 and is reused as-is: 2.1.285 still marks subagent tool hooks with `agent_id` (re-observed, capture-9). kb:fact/interrupt-emits-no-turn-end held on 2.1.285 with 31 events registered, where the original probe registered only 17 events.
- The transcript tail read reuses `readTail` in `launchtranscripts.go`. The interrupt line is the latest `user` line of its prompt, so a 64 KB tail suffices.
- `internal/session` may not read files: the sweep gets the checker via `Config` (kb:adr/nongoal-generic-agent-abstraction-layer's boundary).
- **ADR files (orchestrator):** once `internal/claudecode/interpret_transcript.go` and `internal/session/interrupt.go` exist, add them to kb:adr/lifecycle-interrupt-read-from-transcript's `files:` (`check-kb` refuses an entry that matches no file, so they cannot land at approval).
- **Doc upkeep (orchestrator):** the `CLAUDE.md` hard rule becomes "NEVER derive session state by parsing terminal output — hooks, the status line, and the transcript's interrupt line only". Tick #57, #32, #40, #59, #60, #64 and the background-subagent entry, and move them to `docs/history/todo-done.md`; #64's ticked entry carries the note "unable to reproduce (2.1.285 probe, 2026-09-30); closed with the turn-state work".
