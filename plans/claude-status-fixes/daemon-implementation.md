# Daemon Implementation: claude-status-fixes

**Plan**: claude-status-fixes
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/claudecode/interpret.go` | modified | `StateInput.FromSubagent bool` added; derived (`agent_id` presence) for the `UserPromptSubmit`/`PreToolUse`/`PostToolUse` turn-activity case and the `PermissionRequest` case (REQ-1). Every other event path (including `Notification`) leaves it false via the zero value — no other case touches it. |
| `internal/session/machine.go` | modified | `KindTurnActivity`: closed-prompt early return now guarded by `!input.FromSubagent`; a closed-but-marked prompt still transitions via `sess.setState(sess.activeState(), now)` but skips adopting the closed id as current (INV-P). Every transitioning path (open prompt, or closed+marked) now clears `sess.Attention` and `sess.Failure` (INV-A/INV-F, REQ-4). `KindNeedsInputPermission`: same closed-prompt guard relaxed for `FromSubagent` (REQ-3). `KindNeedsInputIdle` untouched (plan scope). |
| `internal/claudecode/doc.go` | modified | One-paragraph addition naming the subagent marker as part of the boundary vocabulary, kept to the neutral `FromSubagent` bool — optional per plan, done for documentation completeness. |

## Decisions

- Marker detection is presence of the `agent_id` JSON key (`*string != nil`), not a truthiness/non-empty check on its value — matches `spikes/canary-fields.md`'s "main-agent tool hooks have no `agent_id` key at all" (never present as `null` either) and the e2e fixture in `web/e2e/helpers/payloads.ts:102-104,125-127,177-179`, which only ever sets `agent_id` to a non-empty string when the marker option is used. No decoding of `agent_type` was needed — the plan only requires a boolean derived from marker presence.
- `KindNeedsInputPermission` does not clear `sess.Failure` — the plan's REQ-4 and §7.3 table scope the attention/failure clear to turn-activity transitions only; the permission-request transition already sets `sess.Attention` unconditionally and the plan does not ask for a `Failure` clear there. Left unchanged from existing behaviour beyond the closed-prompt guard relaxation.
- `web/src/main.ts` (REQ-6/REQ-7, the two `mousedown` listeners at what was line 884-885) was found already implemented when I read the file — web-impl (parallel track) had landed the guarded closures and matching comment before I looked. No daemon-side action was needed there; left untouched and unstaged, per the instruction to leave web-impl's uncommitted files alone.

## Handoff

**Build status**: `go build ./...` exits 0.

`gofmt -l .`: clean for the files I touched. `go vet ./...`: clean. `make lint` (`golangci-lint run`): "0 issues." `golangci-lint run --tests=false ./...`: "0 issues." D4 negative check (`rg -n -e "agent_id|agent_type" cmd/ internal/ --glob '!internal/claudecode/**'`): no hits (exit 1, satisfies the `!` gate). Existing `go test ./internal/claudecode/... ./internal/session/...` passes unchanged (no test files edited).

No test files needed changes I wasn't allowed to make — none of my edits touched an import path in a test file. `internal/claudecode/interpret_test.go` and `internal/session/machine_test.go` are daemon-tests' to write next (REQ-1/REQ-8 table-driven cases per the plan).

## Fix Attempt 1 (pre-review fix)

**Failures addressed**: `TestApplyInput_CrossStateInvariants/*/closed_prompt_marked_permission` (7/7, one per source state) — `daemon-tests.md`'s reported bug: `KindNeedsInputPermission` transitioned `sess.State` to `needs_input` without clearing `sess.Failure`, breaking INV-F ("`failure` is non-null iff `state == "failed"`", protocol §5.3, an unconditional Named Invariant per `plan.md`, not scoped to turn-activity only as my initial Decisions note incorrectly read REQ-4).

**Orchestrator ruling accepted**: INV-A and INV-F hold after every transition regardless of which event caused it, not just the ones REQ-4 named. Per the ruling I enumerated and closed every code path in `internal/session/machine.go` that transitions a session into `needs_input`:

| Path | Reachable from `failed`? | Fix |
|---|---|---|
| `KindNeedsInputPermission`, open-prompt door (`promptID` not closed, or nil) | Yes — a `PermissionRequest` can arrive for a fresh/unseen prompt id while `sess.State == StateFailed` (no closed-prompt guard applies to this door at all; it was never gated). | `sess.Failure = nil` added unconditionally before `setState`, so it covers this door too — the line is not inside the closed-prompt `if`. |
| `KindNeedsInputPermission`, closed-with-subagent-marker door (the bug `daemon-tests.md` reproduced) | Yes — `StopFailure` closes the prompt and sets `Failure`, then a subagent-marked `PermissionRequest` for that same closed id passes the `!input.FromSubagent` guard. | Same `sess.Failure = nil` line — one code path, both doors share it since the guard only gates the early `return`, not the fields set below it. |
| `KindNeedsInputIdle` (not itself part of this plan's REQ list, but named explicitly in the orchestrator's ruling as reachable from `failed` via an unseen fresh prompt id when `UserPromptSubmit` was lost — e.g. `StopFailure` closes p1, p2's `UserPromptSubmit` hook is dropped, `Notification idle_prompt` for p2 arrives: `promptID` p2 is neither closed nor current, so the closed-prompt guard doesn't fire and the branch transitions to `needs_input` carrying the stale `failed`-turn `Failure`) | Yes, by the scenario above. | Added the same `sess.Failure = nil` line, mirroring `KindNeedsInputPermission`. This is broader than the plan's own Affected Files note ("`KindNeedsInputIdle` unchanged") — documented as a deviation below, directed by the orchestrator, not my own scope call. |

`KindTurnActivity` was already correct (REQ-4, fixed in the initial pass) and needed no change here. `KindTurnClosed`/`KindTurnFailed`/`applyBind` were already unconditional and needed no change.

**Changes made**: `internal/session/machine.go` — one line, `sess.Failure = nil`, added in each of the two `KindNeedsInputPermission`/`KindNeedsInputIdle` branches, right after the `Attention` assignment and before `setState`. Comments added at both sites explaining the invariant and (for the idle branch) the specific reachable-from-`failed` scenario. No other file touched.

**Decisions (this attempt)**:
- Reversed my initial-pass reading that REQ-4 scopes the attention/failure clear to turn-activity only. The plan's Named Invariants section states INV-F unconditionally ("failure is non-null iff state == failed" — no input-kind qualifier), and D5 requires it asserted "after each" of the input variants across every reachable source state; REQ-4's own text only *guarantees* the turn-activity case, it never says other paths are exempt. The orchestrator ruled on this reading; I did not re-litigate it.
- Extended the fix to `KindNeedsInputIdle`, which the plan's Affected Files table calls "unchanged" and which had no failing test (the suite's only `closed_prompt_unmarked_notification_idle` case is a straggler with no transition, so it can't have exposed this). This is a real, if pre-existing and previously unreachable-by-test, INV-F gap: verified by tracing the code — `KindNeedsInputIdle`'s closed-prompt guard only checks `promptID != nil && sess.promptClosed(*promptID)`; an unseen (never-closed) prompt id skips it and falls through to `setState(StateNeedsInput, now)` with `sess.Failure` untouched. I made this change because the orchestrator's ruling named this exact path explicitly, not as my own scope expansion.

**Verification** (re-run after the fix):
- `go build ./...`: exit 0.
- `go vet ./...`: clean, no output.
- `make lint` (`golangci-lint run`): "0 issues."
- `golangci-lint run --tests=false ./...`: "0 issues." (production code lints clean independent of any test-file state).
- `gofmt -l internal/session/machine.go`: clean, no output.
- `go test ./internal/session/... ./internal/claudecode/...`: both packages `ok`. `TestApplyInput_CrossStateInvariants` re-run standalone with `-v`: all 42 subtests pass, including all 7 previously-failing `*/closed_prompt_marked_permission` cases (`started`, `planning`, `working`, `needs_input_permission`, `needs_input_idle`, `failed`, `idle`).
- D4 negative check (`rg -n -e "agent_id|agent_type" cmd/ internal/ --glob '!internal/claudecode/**'`): no hits, exit 1 (satisfies the `!` gate) — this fix added no new payload-key references.
- No test file was edited; `internal/session/machine_test.go` and `internal/claudecode/interpret_test.go` are untouched by this attempt.
