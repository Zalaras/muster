# Daemon Tests: claude-status-fixes

**Plan**: claude-status-fixes
**Verdict**: implementation-bug

## Summary

Tests created: 61 (13 top-level `Test*` functions, several table-driven) | Passing: 54 | Failing: 7

All 7 failures are the same root cause, found by REQ-8/D5's cross-state invariant
table: `internal/session/machine.go`'s `KindNeedsInputPermission` branch never clears
`sess.Failure`, so INV-F ("failure is non-null iff state == failed", protocol §5.3,
stated as an unconditional Named Invariant in `plan.md`) breaks whenever a
subagent-marked `PermissionRequest` for an already-closed prompt transitions a session
out of `failed` into `needs_input`. `go build ./...`, `go vet ./...` and `make lint` are
all clean; every other package's tests pass unchanged.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `interpret_test.go` | `TestInterpret_FromSubagentMarker/marked_turn-activity_events_derive_FromSubagent_true` (×3: UserPromptSubmit/PreToolUse/PostToolUse) | REQ-1: `agent_id` present ⇒ `FromSubagent` true | pass |
| `interpret_test.go` | `TestInterpret_FromSubagentMarker/unmarked_turn-activity_events_derive_FromSubagent_false` (×3) | REQ-1: no `agent_id` key ⇒ false | pass |
| `interpret_test.go` | `TestInterpret_FromSubagentMarker/an_explicit_agent_id:null_..._derives_FromSubagent_false` | defensive: JSON `null` behaves as absent | pass |
| `interpret_test.go` | `TestInterpret_FromSubagentMarker/marked_PermissionRequest_derives_FromSubagent_true` | REQ-1 on `PermissionRequest` | pass |
| `interpret_test.go` | `TestInterpret_FromSubagentMarker/unmarked_PermissionRequest_derives_FromSubagent_false` | REQ-1 negative case | pass |
| `interpret_test.go` | `TestInterpret_FromSubagentMarker/Notification_never_carries_the_marker...` (×2: permission_prompt/idle_prompt) | REQ-1: `Notification` never derives true (measured — no marker on either type) | pass |
| `interpret_test.go` | `TestInterpret_FromSubagentMarker/event_kinds_outside_REQ-1's_scope...` | Stop/StopFailure leave it false via zero value | pass |
| `machine_test.go` | `TestApplyInput_TurnActivity_ClosedPromptSubagentMarked` | REQ-2: closed+marked turn-activity → ACTIVE, prompt not reopened/adopted (INV-P) | pass |
| `machine_test.go` | `TestApplyInput_NeedsInputPermission_ClosedPromptSubagentMarked` | REQ-3: closed+marked `PermissionRequest` → needs_input, reason permission, no reopen | pass |
| `machine_test.go` | `TestApplyInput_TurnActivity_REQ20Shape` | REQ-8 #20 shape: attention latched under `plan`, activity arrives with `auto` → working, attention cleared | pass |
| `machine_test.go` | `TestApplyInput_TurnActivity_AfterFailureClearsFailureKeepsLastActivity` | Edge Case 6: failed→activity clears failure, leaves lastActivity untouched | pass |
| `machine_test.go` | `TestApplyInput_TurnActivity_SubagentMarkedWhileParentPromptStillOpen` | Edge Case 7: marker irrelevant on an already-open/current prompt | pass |
| `machine_test.go` | `TestApplyInput_TurnActivity_SubagentMarkedUnseenPromptSelfHeals` | Edge Case 8: marked activity on an unseen id is ordinary self-heal | pass |
| `machine_test.go` | `TestApplyInput_TurnActivity_SubagentMarkedNilPromptIsTreatedAsOpen` | Edge Case 9: marked activity, nil prompt id, treated as open | pass |
| `machine_test.go` | `TestApplyInput_CrossStateInvariants/*/open_prompt_activity` (×7 states) | INV-A/INV-F hold after ordinary open-prompt activity from every source state | pass |
| `machine_test.go` | `TestApplyInput_CrossStateInvariants/*/closed_prompt_marked_activity` (×7 states) | REQ-2/REQ-4: INV-A/INV-F/INV-P hold after closed+marked turn-activity from every source state | pass |
| `machine_test.go` | `TestApplyInput_CrossStateInvariants/*/closed_prompt_unmarked_activity` (×7 states) | INV-G: unmarked closed-prompt activity changes nothing, from every source state | pass |
| `machine_test.go` | `TestApplyInput_CrossStateInvariants/*/closed_prompt_marked_permission` (×7 states) | REQ-3 + INV-F: closed+marked `PermissionRequest` from every source state | **fail (7/7)** |
| `machine_test.go` | `TestApplyInput_CrossStateInvariants/*/closed_prompt_unmarked_permission` (×7 states) | INV-G: unmarked closed-prompt `PermissionRequest` changes nothing | pass |
| `machine_test.go` | `TestApplyInput_CrossStateInvariants/*/closed_prompt_unmarked_notification_idle` (×7 states) | INV-G: `KindNeedsInputIdle` closed-prompt guard unaffected by this plan | pass |

## Implementation Bugs (verdict = implementation-bug)

| Bug | File | Expected (per plan) | Actual |
|-----|------|---------------------|--------|
| `KindNeedsInputPermission` never clears `sess.Failure` | `internal/session/machine.go:41-48` | INV-F (`plan.md` Named Invariants, protocol §5.3): "`failure` is non-null **iff** `state == "failed"`" — unconditional, not scoped to a particular input kind. Once REQ-3 relaxes the closed-prompt guard for a subagent-marked `PermissionRequest`, that branch newly transitions state out of `failed` into `needs_input` (a path that was always a straggler — and therefore unreachable — before this plan's change). | `sess.Failure` is left exactly as it was. A session that fails (`StopFailure`, closing its prompt and setting `Failure`) and then receives a subagent-marked `PermissionRequest` for that same now-closed prompt id lands in `needs_input` while still carrying the stale `server_error`/message pair — both `attention` (correctly, reason `"permission"`) and `failure` are non-null simultaneously, breaking INV-F. `daemon-implementation.md`'s own Decisions section names this explicitly as a deliberate scope call ("`KindNeedsInputPermission` does not clear `sess.Failure` — ... the plan does not ask for a `Failure` clear there"), but that reading conflicts with the plan's own unconditional Named Invariant and with D5's requirement to assert INV-F "after each" of the 6 input variants across every reachable source state. |

Reproduced from every one of the 7 source states tested (`started`, `planning`,
`working`, `needs_input/permission`, `needs_input/idle`, `failed`, `idle`) — this is not
state-dependent, it is a straight-line missing `sess.Failure = nil` in the
`KindNeedsInputPermission` case.

## Test Run Output

```
=== RUN   TestApplyInput_CrossStateInvariants/started/closed_prompt_marked_permission
    machine_test.go:670:
        Error Trace:  /Users/damian/Documents/code/Projects/muster/internal/session/machine_test.go:670
        Error:        Expected nil, but got: &session.Failure{Error:"stale_error", Message:"stale message"}
        Test:         TestApplyInput_CrossStateInvariants/started/closed_prompt_marked_permission
        Messages:     INV-F: failure must be nil once state has moved off failed to needs_input
--- FAIL: TestApplyInput_CrossStateInvariants (0.00s)
    --- FAIL: TestApplyInput_CrossStateInvariants/started/closed_prompt_marked_permission (0.00s)
    --- FAIL: TestApplyInput_CrossStateInvariants/planning/closed_prompt_marked_permission (0.00s)
    --- FAIL: TestApplyInput_CrossStateInvariants/working/closed_prompt_marked_permission (0.00s)
    --- FAIL: TestApplyInput_CrossStateInvariants/needs_input_permission/closed_prompt_marked_permission (0.00s)
    --- FAIL: TestApplyInput_CrossStateInvariants/needs_input_idle/closed_prompt_marked_permission (0.00s)
    --- FAIL: TestApplyInput_CrossStateInvariants/failed/closed_prompt_marked_permission (0.00s)
    --- FAIL: TestApplyInput_CrossStateInvariants/idle/closed_prompt_marked_permission (0.00s)
FAIL
FAIL	github.com/Zalaras/muster/internal/session	4.287s
```

Everything else green:

```
ok  	github.com/Zalaras/muster/internal/claudecode	0.487s
ok  	github.com/Zalaras/muster/internal/ghissue	(cached)
ok  	github.com/Zalaras/muster/internal/gitutil	(cached)
ok  	github.com/Zalaras/muster/internal/locate	(cached)
ok  	github.com/Zalaras/muster/internal/server	16.114s
ok  	github.com/Zalaras/muster/internal/store	1.203s
ok  	github.com/Zalaras/muster/internal/termbridge	(cached)
ok  	github.com/Zalaras/muster/internal/tmux	(cached)
ok  	github.com/Zalaras/muster/internal/usage	2.715s
ok  	github.com/Zalaras/muster/internal/webui	3.524s
```

`go build ./...`: exit 0. `go vet ./...`: clean. `make lint`: "0 issues." D4 negative
check (`rg -n -e "agent_id|agent_type" cmd/ internal/ --glob '!internal/claudecode/**'`):
no hits (exit 1, satisfies the gate). D7 (existing D11 straggler unit test): re-ran
unedited, still passes
(`TestApplyInput_TurnActivity/D11/Edge_Case_2:_turn-activity_for_an_already-closed_prompt_causes_no_transition`).
`gofmt -l` on both touched test files: clean.

## Notes for the fix

The minimal correction is almost certainly one line, symmetric with the turn-activity
branch's own fix: `internal/session/machine.go`'s `KindNeedsInputPermission` case should
set `sess.Failure = nil` alongside its existing `sess.Attention = &Attention{...}` —
matching the same "every transitioning path clears both" reasoning REQ-4 already applies
to turn-activity, and restoring INV-F as an actual invariant rather than a
turn-activity-only guarantee. `internal/claudecode/interpret_test.go`'s
`TestInterpret_FromSubagentMarker` and every other new test in
`internal/session/machine_test.go` need no changes either way — only the
`closed_prompt_marked_permission` column of `TestApplyInput_CrossStateInvariants` (and
its companion `TestApplyInput_NeedsInputPermission_ClosedPromptSubagentMarked`, which
doesn't currently seed a stale `Failure` and so didn't itself fail) is affected. Once
fixed, re-run `go test ./internal/session/...`.
