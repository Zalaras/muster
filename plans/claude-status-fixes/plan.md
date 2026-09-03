# Plan: claude-status-fixes

**Created**: 2026-09-03
**Status**: approved
**Work Type**: full-stack
**E2E Scope**: new-specs
**Closes**: #14, #15, #20
**Description**: Three status-display defects in one pass — a session reads Idle while its
background subagents are still working (#14), attention stays latched on "needs permission"
(and a failure note stays up) after work resumes (#15, #20), and clicking the already-active
view segment discards an open rename instead of committing it.

## Overview

All three were reported from live use and their causes are pinned, two by probe and one by a
Playwright repro (2026-09-03, `main` at `16436f6`):

- **#14 — Idle while still working.** Probe against Claude Code 2.1.259
  (`spikes/FINDINGS.md` → "subagent / background-task probe"; fields in
  `spikes/canary-fields.md` → "Subagent and background-task fields"): a background subagent's
  `PreToolUse`/`PostToolUse`/`PermissionRequest` hooks carry the **parent turn's** prompt id
  and arrive **after** that turn's `Stop`. The §7.3 straggler guard (`internal/session/
  machine.go`, Edge Case 2) therefore drops them: the rail says idle while the subagent edits
  files. They are distinguishable — every subagent-originated hook carries an agent marker
  that main-agent hooks never do — and resumption already works: each background completion
  arrives as a `UserPromptSubmit` with a fresh prompt id, closed by its own `Stop` (4/4
  completions across three sessions). Only the window between the parent's `Stop` and that
  fresh prompt is wrong today. The `Notification` `permission_prompt` a subagent triggers
  carries **no** marker, so only its `PermissionRequest` can identify a subagent's permission
  wait.
- **#15/#20 — stale attention.** `applyInput`'s turn-activity branch latches the mode and
  sets the active state but never clears `sess.Attention` (only `Stop`, `StopFailure` and a
  bind do). #20's own snapshot shows the consequence: a `UserPromptSubmit` flipped the state
  to working at 13:01:42Z while attention kept its 12:08:05Z timestamp. The same branch also
  leaves `sess.Failure` in place, so a failed turn's note survives into the next turn's
  working state. Both violate §5.3's "non-null iff" rules, which the file's own comment
  claims are unconditional.
- **Rename discarded.** Follow-up from `ui-text-and-focus` review cycle 2 Minor 1, verified
  by a throwaway spec: a bare `mousedown` on the already-active Focus button closes the open
  rename field with zero `PUT …/title` requests, while the same gesture on an unrelated
  button commits it (one PUT). The `mousedown` listeners on `viewFocusBtn`/`viewTilesBtn`
  in `web/src/main.ts:884-885` call `cancelOpenRenames()` unconditionally; the gesture is
  only a view switch when the button is not the active one.

Decisions taken with Damian (2026-09-03): (1) a subagent's permission request after the
parent's `Stop` is covered by the same rule as its tool activity — measured, not assumed;
(2) no new rail surface for background work — it is `working`, files are changing; (3) a
`Stop` whose `background_tasks` is non-empty still lands `idle`, and the first marked
subagent hook flips it back to `working` (~2 s later, measured) — holding `working` on
`background_tasks` alone would pin a session for as long as a backgrounded shell lives.
`background_tasks` is fixture realism for the E2E specs, never a state input.

## Requirements

### Must Have
- [ ] REQ-1: `internal/claudecode.Interpret` marks subagent-originated events. `StateInput`
  gains a neutral boolean, `FromSubagent`, true iff the payload carries the subagent agent
  marker; it is derived for the turn-activity events (`UserPromptSubmit`, `PreToolUse`,
  `PostToolUse`) and for `PermissionRequest`, and is always false for every other event
  (including `Notification`, which never carries the marker — measured). The marker's
  payload key name appears nowhere outside `internal/claudecode/` (hard rule).
- [ ] REQ-2: A turn-activity input with `FromSubagent` whose prompt id is already closed is
  **not** a straggler: the session transitions to `ACTIVE` (planning if the latch reads
  plan, else working) exactly as open-prompt activity does, but the closed prompt id is
  neither reopened nor adopted as `currentPromptID` (the parent turn stays closed; the
  next Stop-family event still lands idle/failed).
- [ ] REQ-3: A needs-input-permission input with `FromSubagent` whose prompt id is already
  closed is likewise not a straggler: the session transitions to `needs_input` with
  `attention.reason:"permission"` exactly as the open-prompt case does.
- [ ] REQ-4: Every turn-activity input that causes a transition (open prompt, or closed
  prompt with `FromSubagent`) clears `Attention` **and** `Failure` — INV-A and INV-F below.
  A genuine straggler (closed prompt, no marker) still changes nothing, including these.
- [ ] REQ-5: Unmarked events keep today's guard behaviour bit-for-bit: a closed-prompt
  `PostToolUse`/`UserPromptSubmit`/`Notification`/`PermissionRequest` without the marker
  causes no transition and no field change (the existing D11 unit test and the
  `sessions.spec.ts` straggler E2E keep passing unchanged).
- [ ] REQ-6: Clicking the **already-active** view segment (Focus while in Focus, Tiles while
  in Tiles) while a rename editor is open does not cancel it. The click's ordinary
  `mousedown`-default blur reaches the field's own `onBlur`, so the edit **commits** (one
  `PUT /api/sessions/{id}/title`, REQ-14 semantics of `ui-text-and-focus`), the view is
  unchanged, and no prefs request is sent for the view.

### Should Have
- [ ] REQ-7: A non-primary-button `mousedown` (right or middle click) on either view segment
  never cancels an open rename — the browser fires no `click` for those buttons, so no
  view switch follows and the gesture is again an ordinary blur (commit). Only a primary
  button `mousedown` on the segment that would switch the view cancels.
- [ ] REQ-8: The state-machine unit tests assert INV-A and INV-F from **every** reachable
  source state (started, planning, working, needs_input with each attention reason,
  failed, idle) for the turn-activity input, including #20's shape: attention latched under
  one permission mode, activity arriving with a different `permission_mode`.

### Nice to Have
- none.

### Named invariants

- **INV-A** (protocol §5.3): `attention` is non-null **iff** `state == "needs_input"`.
- **INV-F** (protocol §5.3): `failure` is non-null **iff** `state == "failed"`.
- **INV-G**: an event without the subagent marker whose prompt id is closed never changes
  any state-machine-owned field (today's Edge Case 2, unchanged).
- **INV-P**: a closed prompt id stays closed — no input reopens it or makes it current.

## Protocol Contract

Delta against `docs/protocol.md` (merged there on approval). **No WS message, Session
object field or HTTP endpoint changes** — this plan amends state-machine semantics only, so
the daemon and web tracks have nothing to coordinate on the wire.

### §7.2 Per-session tracked variables — addition

> Turn-scoped events may carry a **subagent marker** (measured 2.1.259, canary-fields
> "Subagent and background-task fields"): a background subagent's `PreToolUse`,
> `PostToolUse` and `PermissionRequest` carry the *parent turn's* `prompt_id` plus the
> marker; the `Notification` a subagent triggers does not. The state machine sees the marker
> only as a neutral flag derived in `internal/claudecode`.

### §7.3 Transitions — amended and added rows

| Event (guards) | Transition / effect |
|---|---|
| Turn-activity event (prompt not closed) | Adopt `prompt_id` as current → `ACTIVE`; update latch; **clear `attention` and `failure`** (§5.3 iff rules) |
| Turn-activity event (prompt already closed, **no subagent marker**) | Straggler from an unordered stream: persist, **no transition, no field change** |
| **Turn-activity event (prompt already closed, subagent marker present)** | **Background subagent still working past the parent's `Stop`: → `ACTIVE`, clear `attention` and `failure`; the closed prompt is neither reopened nor adopted as current** |
| `PermissionRequest` (prompt not closed, **or closed with subagent marker present**) | Corroborates → `needs_input`, reason `"permission"` |
| `Notification` `permission_prompt` / `idle_prompt` (prompt already closed) | Straggler (a subagent's `Notification` carries no marker — its `PermissionRequest` already did the work) |
| `Stop` | Close `prompt_id` → `idle`; capture `lastActivity`. **`background_tasks` is never read: a `Stop` with running background work lands `idle` and the first marked subagent hook returns it to `ACTIVE`** |

### §7.4 Ordering & loss tolerance — rule 2 amended

> 2. A Stop-family event closes its `prompt_id`; later-arriving **unmarked** events for a
>    closed prompt never reopen a turn (the one measured hazard: tool events interleaving
>    past a `Stop`). **Subagent-marked** events for a closed prompt are not stragglers —
>    they are a background subagent still running under the parent's prompt id (measured
>    2.1.259) — and transition the state without reopening the prompt. Resumption is
>    ordinary: each background completion arrives as a `UserPromptSubmit` with a fresh
>    `prompt_id`, closed by its own `Stop`.

## Schema Changes

No schema changes required. `closedPromptIDs`/`currentPromptID` stay in-memory only.

## UI Specifications

No new views, elements or copy. The rail card's state badge and attention timer already
render `working` / `needs input`; this plan makes the daemon feed them correctly.

### Views
- Focus / Tiles — unchanged markup. The masthead view switcher's `mousedown` guard changes
  behaviour only (REQ-6/REQ-7).

### User Flows
1. A rename is open on the mainhead (Focus) or a tile header (Tiles). The user clicks the
   view segment that is already pressed. The field closes, the typed title is committed
   (one PUT), the heading/card/tile show the new title, the view does not change.
2. As 1 but the user clicks the *other* segment: today's behaviour — the edit is cancelled
   with no PUT and the view switches (the four existing `rename.spec.ts` cases).
3. As 1 but with a right or middle click on either segment: the edit commits (blur), the
   view does not change.

### States
- No data yet / daemon down: unchanged (an open edit is cancelled on disconnect —
  `ui-text-and-focus` States rule, already pinned).

### Testable UI Elements

All pre-existing; transcribed from `ui-text-and-focus`'s table and `web/index.html`.

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Focus view segment | `button` | `Focus` | `#view-focus-btn`; `aria-pressed="true"` when active |
| Tiles view segment | `button` | `Tiles` | `#view-tiles-btn`; `aria-pressed="true"` when active |
| Rename trigger (mainhead) | `button` | the display title, or `untitled` | inside the heading |
| Rename field | `textbox` | `Session title` | `aria-label`; present only while editing |
| Tile rename trigger | `button` | the display title, or `untitled` | scope to the tile |
| Rail card state badge | — | `working` / `needs input` / `idle` / `failed` | existing `stateBadge(card)` helper in `web/e2e/helpers/session.ts` |

## Affected Files

### Daemon
- `internal/claudecode/interpret.go` — `StateInput.FromSubagent bool`; derived in the
  turn-activity case and the `PermissionRequest` case from the payload's agent marker
  (present ⇒ true). The only file that may name the marker's key.
- `internal/session/machine.go` — `KindTurnActivity`: the closed-prompt early return applies
  only when `!input.FromSubagent`; when the marker is present and the prompt is closed,
  skip the `currentPromptID` adoption but still `setState(activeState())`; on every
  transitioning path set `sess.Attention = nil` and `sess.Failure = nil`.
  `KindNeedsInputPermission`: the closed-prompt early return applies only when
  `!input.FromSubagent`. `KindNeedsInputIdle` unchanged. Update the §5.3 comment block so it
  is true.
- `internal/claudecode/doc.go` — one line in the package doc naming the subagent marker as
  part of the boundary's vocabulary (optional, daemon-impl's call).

### Web
- `web/src/main.ts` — the two `mousedown` listeners (`:884-885`) become guarded closures:
  cancel only when `e.button === 0` **and** the segment's target view differs from the
  current `view`. Update the comment above them (`:875-883`) to say why.

### Tests (owning agent named per requirement)
- `internal/claudecode/interpret_test.go` (**daemon-tests**) — REQ-1: marker ⇒
  `FromSubagent` true on `PreToolUse`/`PostToolUse`/`UserPromptSubmit`/`PermissionRequest`;
  absent ⇒ false; `Notification` `permission_prompt` ⇒ false. Assert only the measured
  shapes in `spikes/canary-fields.md`; do not invent payload variants. Tests obtain the real key legally via fixtures inside `internal/claudecode` (the package's
  own test file), so the negative grep D4 excludes that directory by construction.
- `internal/session/machine_test.go` (**daemon-tests**) — REQ-2/3/4/5/8: table-driven —
  every source state × {open-prompt activity, closed-prompt marked activity, closed-prompt
  unmarked activity, closed-prompt marked permission, closed-prompt unmarked permission,
  closed-prompt unmarked notification}; assert state, INV-A, INV-F, INV-G, INV-P after each.
  Include the #20 shape (attention under `plan`, activity arriving with `auto`).
- `web/e2e/helpers/payloads.ts` (**e2e-specs**) — `TurnActivityOpts.agentId?: string`
  (when set, `rawUserPromptSubmit`/`rawPostToolUse` add the measured `agent_id` +
  `agent_type: "general-purpose"` keys); `rawPermissionRequest(sessionId, promptId, opts?)`
  with the same option; `StopOpts.backgroundTasks?: unknown[]` (default `[]`) so E1 can post
  the measured non-empty shape. Add a `rawPreToolUse` only if a spec needs it.
- `web/e2e/subagent-status.spec.ts` (**e2e-specs**, new) — E1, E2, E3, E4, E7.
- `web/e2e/rename.spec.ts` (**e2e-specs**) — E5, E6 beside the four view-switch cancel tests.
- **Web unit tests: none.** REQ-6/REQ-7 are two guarded event listeners with no pure logic
  to extract; they are E2E-only, carried by E5 and E6. web-tests has nothing to write for
  this plan and should report that rather than invent a test.

## Edge Cases

1. Parent `Stop` (with non-empty `background_tasks`) → idle; subagent-marked `PostToolUse`
   for the same prompt → working; later fresh-prompt `UserPromptSubmit` → working (already);
   its `Stop` → idle. `stateSince` moves at each transition. → E8, D5
2. Subagent-marked `PermissionRequest` after the parent `Stop` → `needs_input`, attention
   `permission`; the unmarked `Notification permission_prompt` that follows is a straggler
   (no change — already needs_input). Then marked `PostToolUse` (accepted) → working,
   attention null. → E2, D5
3. Unmarked `Notification permission_prompt` after a `Stop` with **no** preceding
   `PermissionRequest` (lost hook) → no transition: the honest gap, documented in
   `docs/protocol.md` §7.3; the terminal itself shows the prompt. → D5 (unit) — E2E not
   separately pinned; the existing straggler E2E covers the unmarked path.
4. Unmarked `PostToolUse` after `Stop` (the measured interleave hazard) → still idle. → E3
   (the existing `sessions.spec.ts` "straggler" test, re-run unchanged), D5
5. Attention `permission` latched under `plan`, then `UserPromptSubmit` with
   `permission_mode:"auto"` on the same open prompt (#20's plan-acceptance path) → working,
   attention null, latch `auto`. → E4, D5
6. `failed` (after `StopFailure` p1), then `UserPromptSubmit` p2 → working, `failure`
   null, `lastActivity` unchanged. → E7, D5
7. Subagent-marked activity while the parent prompt is still **open** (mid-turn) → ordinary
   activity: adopts nothing new (same prompt), stays ACTIVE, clears attention/failure. → D5
8. Marked activity with an **unseen** prompt id (not closed, not current) → ordinary §7.4
   rule 3 self-heal: adopt it, ACTIVE. Marker is irrelevant when the prompt is open. → D5
9. Marked activity arrives with a `nil` prompt id → treated as open (existing rule); no
   guard applies. → D5
10. `/clear` between the parent `Stop` and a marked straggler for the **old** claude session
    id: the routing table applies the event's own row against the rebound session, and the
    rebind already reset `closedPromptIDs`, so today an old-prompt straggler is already
    treated as open activity; the marker changes nothing here. `/clear` also kills the
    subagents. → untested: existing behaviour, not changed by this plan.
11. Daemon restart in the window: `closedPromptIDs` is in-memory, so after restart a marked
    hook for the old prompt is "open" and lands ACTIVE anyway — same outcome. → untested:
    same result as the tested path.
12. Hook loss: the subagent's `PreToolUse` lost, `PostToolUse` arrives → same handling;
    `SubagentStop` lost → nothing depends on it (stays inert). → D5 (PostToolUse-only path)
13. The fresh-prompt re-invocation never arrives (not observed in 4/4 completions): the card
    stays `working` until the next Stop-family event or the pane dies. Honest per §7.3's
    "never wait for an event". → untested: cannot be induced.
14. Rename: click the active Focus segment with the mainhead editor open → commit, one PUT,
    `aria-pressed` still true on Focus. → E5
15. Rename: click the active Tiles segment with a tile editor open → commit, one PUT. → E5
16. Rename: right-click the *inactive* segment with an editor open → no cancel, commit via
    blur, view unchanged (no `click` fires for button 2). → E6
17. Rename: click the inactive segment → cancel, no PUT, view switches (unchanged; the four
    existing `rename.spec.ts` cases). → E1 suite (existing)
18. Rename: disconnect with an editor open → cancelled (unchanged, pinned by
    `ui-text-and-focus`). → E1 suite (existing)

## Acceptance Criteria

IDs are unique across the whole section — `D*` daemon, `W*` web, `E*` e2e. One clause per
criterion; never mix a runnable command with a judgement call in one item.

### Daemon
- **D1**: `make test` passes.
- **D2**: `go build ./...` passes.
- **D3**: `make lint` passes.
- **D4**: the subagent marker's payload key names appear nowhere under `cmd/` or `internal/`
  outside `internal/claudecode/` (test files under `internal/claudecode/` are inside the
  allowed directory; no other test file needs the strings).
- **D5**: `internal/session/machine_test.go` contains the source-state × input table of
  REQ-8 asserting INV-A, INV-F, INV-G and INV-P after every cell.
- **D6**: `internal/claudecode/interpret_test.go` asserts `FromSubagent` true for marked
  `PreToolUse`, `PostToolUse`, `UserPromptSubmit` and `PermissionRequest`, and false for the
  same events unmarked and for `Notification`.
- **D7**: the existing D11 straggler test and the `sessions.spec.ts` straggler E2E are
  unchanged and still pass.
- **D8**: the §5.3 comment block in `internal/session/machine.go` describes behaviour that is
  now actually true (attention/failure cleared on every transition into ACTIVE).

### Web
- **W1**: `make web-build` passes.
- **W2**: `make web-test` passes.
- **W3**: each view segment's `mousedown` listener cancels open renames only when
  `e.button === 0` and its target view differs from the current view.
- **W4**: no `any` types in new web code.

### E2E
- **E1**: `make e2e` passes.
- **E2**: subagent permission after Stop — fake session: `UserPromptSubmit` p1, `Stop` p1
  (non-empty `background_tasks`) → badge `idle`; marked `PermissionRequest` p1 → badge
  `needs input`, state API `attention.reason == "permission"`; unmarked `Notification
  permission_prompt` p1 → still `needs input` (no second transition); marked `PostToolUse`
  p1 → badge `working`, `attention == null`.
- **E3**: the pre-existing `sessions.spec.ts` straggler test (unmarked `PostToolUse` after
  `Stop` stays `idle`) passes without edits.
- **E4**: #20's path — `UserPromptSubmit` p1 (`plan`), `PermissionRequest` p1 → `needs
  input`; `UserPromptSubmit` p1 (`auto`) → badge `working`, `attention == null`,
  `permissionMode.value == "auto"`.
- **E5**: with a mainhead rename open and text typed, clicking the pressed Focus segment
  closes the field, sends exactly one `PUT …/title`, shows the new title on the heading and
  rail card, and leaves Focus pressed; the tile mirror (Tiles pressed, tile editor open)
  behaves the same.
- **E6**: with a mainhead rename open, a right-click on the Tiles segment sends exactly one
  `PUT …/title`, the view stays Focus.
- **E7**: `StopFailure` p1 → badge `failed`; `UserPromptSubmit` p2 → badge `working`, state
  API `failure == null`.
- **E8**: subagent activity after Stop — `UserPromptSubmit` p1, `Stop` p1 with non-empty
  `background_tasks` → badge `idle`; marked `PostToolUse` p1 → badge `working` with
  `stateSince` later than the idle's; `UserPromptSubmit` p2, `Stop` p2 → badge `idle`.

### Automated Checks

Every line below is `<ID> <single-line shell command>`, run from the project root. A check passes
iff its command exits 0.

```checks
D1 make test
D2 go build ./...
D3 make lint
D4 ! rg -n -e "agent_id|agent_type" cmd/ internal/ --glob '!internal/claudecode/**'
W1 make web-build
W2 make web-test
E1 make e2e
```

Notes on the negative check: **D4** is scoped to `cmd/` and `internal/` minus the boundary
package, so `web/e2e/helpers/payloads.ts` (which must carry the real keys to fake the wire)
and this plan document are outside its net. Test-file scope: `internal/claudecode/*_test.go`
is inside the excluded directory and may use the literal keys; `internal/session/*_test.go`
must not — it drives `applyInput` with `StateInput{FromSubagent: true}`, never a payload.
Tree dry-run at planning (2026-09-03): `rg -n -e "agent_id|agent_type" cmd/ internal/ --glob
'!internal/claudecode/**'` → no hits. Plan dry-run: this document names the keys in the
Overview and this note only, as facts about the wire, never in a snippet an agent would copy
into `internal/session`.

### Reviewer-Verified

- **D5**, **D6**, **D7**, **D8**: read the test tables and the comment.
- **W3**: read the two listeners.
- **W4**: no `any` in the diff.
- **E2**–**E8**: present in the suite and passing (E1 runs them; the reviewer confirms each
  criterion has a spec and that the spec asserts what the criterion says).

## Implementation Notes

- **Measured facts this plan rests on** — `spikes/FINDINGS.md` "subagent / background-task
  probe" (2026-09-03, 2.1.259; pin is 2.1.246, the incident was on 2.1.247): marked tool hooks
  under the parent prompt id at +2.1/+3.0 s after the parent `Stop`; marked
  `PermissionRequest` at +1.6 s; unmarked `Notification` at +7.7 s; fresh-prompt
  `UserPromptSubmit` re-invocation 4/4. Re-checked against decision 3 (Stop still lands
  idle): still valid — the ~2 s idle blip is the measured gap between `Stop` and the first
  marked hook, and it is the price of not trusting `background_tasks`.
- **Where the marker lives.** Only `internal/claudecode/interpret.go` reads it. Everything
  downstream sees `StateInput.FromSubagent`. If daemon-impl finds itself wanting the agent id
  itself (for display, say), that is out of scope — decision 2.
- **Order of operations in `KindTurnActivity`.** Latch the mode first (unchanged — a
  straggler still latches, that is existing behaviour and D7 pins it), then: if closed and
  unmarked → return; if open → adopt prompt id; in both remaining cases clear attention and
  failure and `setState(activeState())`.
- **Rename guard.** `viewFocusBtn.addEventListener("mousedown", (e) => { if (e.button === 0
  && view !== "focus") cancelOpenRenames(); })` and the mirror. `view` is the module-level
  current view already read by `applyPrefsFromSnapshot`. Keep the existing `click` →
  `requestView` listeners untouched.
- **E2E fixtures** are e2e-specs' to extend (`payloads.ts` is a helper, not implementation).
  Post raw hooks through the scratch daemon's ingest URL exactly as `sessions.spec.ts` does;
  wait on `queryEvents` for persistence before asserting, as the existing straggler test does.
- **Doc upkeep (orchestrator, not impl agents):** tick the three `TODO.md` entries (#14,
  #15/#20, the rename follow-up under `ui-text-and-focus`); `SPEC.md` changelog entry
  "subagent activity keeps a session working; attention/failure clear on resume; active
  segment click commits a rename"; the protocol delta above is merged into `docs/protocol.md`
  §7.2/§7.3/§7.4 at approval by the planner.
