# Daemon Tests: claude-status-fixes

**Plan**: claude-status-fixes
**Verdict**: pass

## Summary

Tests created: 62 (14 top-level `Test*` functions, several table-driven) | Passing: 62 | Failing: 0

This is the re-run after daemon-impl's Fix Attempt 1 (commit `422ce5c`, pre-review
fix), which added `sess.Failure = nil` to both `KindNeedsInputPermission` and
`KindNeedsInputIdle` in `internal/session/machine.go`. All 7 previously-failing
`TestApplyInput_CrossStateInvariants/*/closed_prompt_marked_permission` subtests
(logged in the prior run, preserved at `daemon-tests.failed.1.md`) now pass unchanged —
no test file needed editing to fix them.

daemon-impl's implementation log named a second INV-F path it closed with no existing
test covering it: `KindNeedsInputIdle` reached from `failed` via an unseen fresh prompt
id (a lost `UserPromptSubmit`, so the closed-prompt guard never fires because the new
prompt id was never seen at all — distinct from the D5 table's own
`closed_prompt_unmarked_notification_idle` row, which seeds the prompt as **closed**,
a genuine INV-G straggler with no transition). I added one new test,
`TestApplyInput_NeedsInputIdle_FromFailedViaUnseenFreshPromptClearsFailure`, pinning
INV-F on that exact scenario. It passes against the fixed implementation.

`go build ./...`, `go vet ./...`, and `make lint` are all clean. `make test` is green
across every package.

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
| `machine_test.go` | `TestApplyInput_NeedsInputIdle_FromFailedViaUnseenFreshPromptClearsFailure` (new this run) | INV-F on the second path daemon-impl's fix closed: `failed` → `needs_input` via `KindNeedsInputIdle` for an unseen fresh prompt id (lost `UserPromptSubmit`) — stale `Failure` must not survive | pass |
| `machine_test.go` | `TestApplyInput_TurnActivity_REQ20Shape` | REQ-8 #20 shape: attention latched under `plan`, activity arrives with `auto` → working, attention cleared | pass |
| `machine_test.go` | `TestApplyInput_TurnActivity_AfterFailureClearsFailureKeepsLastActivity` | Edge Case 6: failed→activity clears failure, leaves lastActivity untouched | pass |
| `machine_test.go` | `TestApplyInput_TurnActivity_SubagentMarkedWhileParentPromptStillOpen` | Edge Case 7: marker irrelevant on an already-open/current prompt | pass |
| `machine_test.go` | `TestApplyInput_TurnActivity_SubagentMarkedUnseenPromptSelfHeals` | Edge Case 8: marked activity on an unseen id is ordinary self-heal | pass |
| `machine_test.go` | `TestApplyInput_TurnActivity_SubagentMarkedNilPromptIsTreatedAsOpen` | Edge Case 9: marked activity, nil prompt id, treated as open | pass |
| `machine_test.go` | `TestApplyInput_CrossStateInvariants/*/open_prompt_activity` (×7 states) | INV-A/INV-F hold after ordinary open-prompt activity from every source state | pass |
| `machine_test.go` | `TestApplyInput_CrossStateInvariants/*/closed_prompt_marked_activity` (×7 states) | REQ-2/REQ-4: INV-A/INV-F/INV-P hold after closed+marked turn-activity from every source state | pass |
| `machine_test.go` | `TestApplyInput_CrossStateInvariants/*/closed_prompt_unmarked_activity` (×7 states) | INV-G: unmarked closed-prompt activity changes nothing, from every source state | pass |
| `machine_test.go` | `TestApplyInput_CrossStateInvariants/*/closed_prompt_marked_permission` (×7 states) | REQ-3 + INV-F: closed+marked `PermissionRequest` from every source state — previously failing 7/7, now clean after Fix Attempt 1 | pass |
| `machine_test.go` | `TestApplyInput_CrossStateInvariants/*/closed_prompt_unmarked_permission` (×7 states) | INV-G: unmarked closed-prompt `PermissionRequest` changes nothing | pass |
| `machine_test.go` | `TestApplyInput_CrossStateInvariants/*/closed_prompt_unmarked_notification_idle` (×7 states) | INV-G: `KindNeedsInputIdle` closed-prompt guard (closed, not merely unseen, prompt id) unaffected by this plan | pass |

## Implementation Bugs

None outstanding. The one bug from the prior run (`KindNeedsInputPermission` leaving
`sess.Failure` set, breaking INV-F) is fixed in commit `422ce5c` and confirmed by
re-running the exact previously-failing subtests below.

## Test Run Output

```
$ go test ./internal/session/... -run 'TestApplyInput' -v
...
=== RUN   TestApplyInput_NeedsInputPermission_ClosedPromptSubagentMarked
--- PASS: TestApplyInput_NeedsInputPermission_ClosedPromptSubagentMarked (0.00s)
=== RUN   TestApplyInput_NeedsInputIdle_FromFailedViaUnseenFreshPromptClearsFailure
--- PASS: TestApplyInput_NeedsInputIdle_FromFailedViaUnseenFreshPromptClearsFailure (0.00s)
...
=== RUN   TestApplyInput_CrossStateInvariants/started/closed_prompt_marked_permission
--- PASS: TestApplyInput_CrossStateInvariants/started/closed_prompt_marked_permission (0.00s)
=== RUN   TestApplyInput_CrossStateInvariants/planning/closed_prompt_marked_permission
--- PASS: TestApplyInput_CrossStateInvariants/planning/closed_prompt_marked_permission (0.00s)
=== RUN   TestApplyInput_CrossStateInvariants/working/closed_prompt_marked_permission
--- PASS: TestApplyInput_CrossStateInvariants/working/closed_prompt_marked_permission (0.00s)
=== RUN   TestApplyInput_CrossStateInvariants/needs_input_permission/closed_prompt_marked_permission
--- PASS: TestApplyInput_CrossStateInvariants/needs_input_permission/closed_prompt_marked_permission (0.00s)
=== RUN   TestApplyInput_CrossStateInvariants/needs_input_idle/closed_prompt_marked_permission
--- PASS: TestApplyInput_CrossStateInvariants/needs_input_idle/closed_prompt_marked_permission (0.00s)
=== RUN   TestApplyInput_CrossStateInvariants/failed/closed_prompt_marked_permission
--- PASS: TestApplyInput_CrossStateInvariants/failed/closed_prompt_marked_permission (0.00s)
=== RUN   TestApplyInput_CrossStateInvariants/idle/closed_prompt_marked_permission
--- PASS: TestApplyInput_CrossStateInvariants/idle/closed_prompt_marked_permission (0.00s)
...
PASS
ok  	github.com/Zalaras/muster/internal/session	0.835s
```

Full suite:

```
$ make test
go test -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	17.759s
ok  	github.com/Zalaras/muster/internal/claudecode	2.254s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/ghissue	3.688s
ok  	github.com/Zalaras/muster/internal/gitutil	3.726s
ok  	github.com/Zalaras/muster/internal/locate	1.578s
ok  	github.com/Zalaras/muster/internal/server	21.721s
ok  	github.com/Zalaras/muster/internal/session	8.488s
ok  	github.com/Zalaras/muster/internal/store	5.573s
ok  	github.com/Zalaras/muster/internal/termbridge	7.507s
ok  	github.com/Zalaras/muster/internal/tmux	19.236s
ok  	github.com/Zalaras/muster/internal/usage	7.969s
ok  	github.com/Zalaras/muster/internal/webui	8.410s
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]
```

```
$ make lint
golangci-lint run
0 issues.
```

`go build ./...`: exit 0. `go vet ./...`: clean, no output. `gofmt -l
internal/session/machine_test.go internal/session/machine.go`: clean, no output
(machine.go untouched by me — daemon-impl's own fix was already gofmt-clean per its
log).

## Notes

Only `internal/session/machine_test.go` was touched this run (one new test function
added; no existing test edited). `internal/claudecode/interpret_test.go` is unchanged
from the prior run. No implementation file was modified by this agent.
