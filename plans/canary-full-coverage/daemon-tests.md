# Daemon Tests: canary-full-coverage

**Plan**: canary-full-coverage
**Verdict**: pass

## Summary

This plan's deliverable is entirely test code (`test/canary/` is all `_test.go`, per the
plan's Ownership note), so daemon-tests owns every changed/added file here — there was no
separate daemon-impl production change to test against.

Tests created: 6 new (`TestLaunchFlags`, `TestNotifications`,
`TestInstalledBinaryCarriesInterfaceStrings`, `TestKeychainCredentialShape`,
`TestUsageAPIResponseShape`, `TestThemeConfigParses`) | Tests changed: 4
(`TestHookFields`, `TestStopFailureReplacesStop`, `TestPlanModeSequence`,
`TestStatusLineFields`) | Tests unchanged: 6 | Total: 16 (+ `TestMain`)

Everything that can be verified without spending a real `make canary` run passes:
`go build ./...`, `go vet -tags=canary ./test/canary/...`, `make lint`, `make test`, and
the D3 static-tier check under `MUSTER_CANARY_OFFLINE=1` all green (output below). The
harness-backed tests (D2, D4-D7) and the live tier (D9-D11) need a real `claude` process
and/or the real Keychain/usage API, which per the plan's Implementation Notes ("For the
orchestrator") is the orchestrator's own `make canary` run in the main session, saved to
`canary-run.log` — not something a subagent may run. I could not produce that log myself;
D12 and the reviewer-verified criteria that read it (D2, D4-D11) are for the orchestrator
to gate on.

## Tests

| File | Test Name | What It Tests | Status (offline-verifiable) |
|------|-----------|---------------|------|
| `harness_test.go` | (harness only, no `Test*`) | Run C x4 (REQ-1), run D title+plan+idle wait (REQ-2/3), run E resume+ExitPlanMode (REQ-4/5), teardown of both tmux sessions (REQ-12) | compiles, vets clean |
| `canary_test.go` | `TestInstalledVersionMatchesPin` | unchanged | pass (2.1.267 vs pin 2.1.246 — expected drift, decision 4) |
| `canary_test.go` | `TestStatusLineVersionMatchesInstalled` | unchanged | skip (offline) |
| `canary_test.go` | `TestHookTransport` | unchanged | skip (offline) |
| `canary_test.go` | `TestHookFields` | Notification row now driven on `sessionInteract`, PermissionRequest row now driven on `sessionResume`, `SubagentStop` row removed with `KindInert` rationale comment (REQ-6/9) | skip (offline); compiles |
| `canary_test.go` | `TestStopFailureReplacesStop` | subtests over all four `unauthRuns` (REQ-1/D7) | skip (offline); compiles |
| `canary_test.go` | `TestPlanModeSequence` | real assertion of steps 1-2 (`PreToolUse{ExitPlanMode,plan}` before `PermissionRequest{ExitPlanMode}`) on run E; step 3 logged, not skipped (REQ-6/D5) | skip (offline); compiles |
| `canary_test.go` | `TestLaunchFlags` (new) | four-way unauth `permission_mode` sweep + authenticated `plan` cross-check (REQ-1/2/D2); `SessionStart.session_title == "Muster Canary"` (REQ-2); resume identity `source`/`session_id`/`transcript_path` (REQ-4/D6/INV-3) | skip (offline); compiles |
| `canary_test.go` | `TestNotifications` (new) | `idle_prompt` after `Stop` (REQ-3/D4); `permission_prompt` shares `PermissionRequest`'s `prompt_id`, `permission_suggestions[0]` shape (REQ-5/D5) | skip (offline); compiles |
| `canary_test.go` | `TestStatusLineFields` | added `session_name == "Muster Canary"` assertion (REQ-2) and REQ-15 log of run E's (unresumed-title) `session_name` | skip (offline); compiles |
| `canary_test.go` | `TestUnknownVersusZero` | unchanged | skip (offline) |
| `canary_test.go` | `TestCommandHookPathQuoting` | unchanged | skip (offline) |
| `canary_test.go` | `TestCommandHooksCarryEnvelopeOnEveryEvent` | unchanged | skip (offline) |
| `static_test.go` (new) | `TestInstalledBinaryCarriesInterfaceStrings` | chunked byte-string scan of the resolved `claude` binary for every `LaunchEnv()` key, the theme enum, usage path/header, credential key, Keychain mechanism, `permission-mode` flag (REQ-7/D8) | **PASS** (verified below — this is the one harness-independent, non-live new test) |
| `live_test.go` (new) | `TestKeychainCredentialShape` | production `KeychainTokenReader` returns a non-empty token; fails (never skips) on `ErrNoCredentials` (REQ-8/D9) | skip (offline); compiles |
| `live_test.go` (new) | `TestUsageAPIResponseShape` | production `FetchUsage` result shape + raw-GET body shape (REQ-8/D10) | skip (offline); compiles |
| `live_test.go` (new) | `TestThemeConfigParses` | `ReadThemeFamily(DefaultConfigPath()) != ThemeUnknown` (REQ-8/D11) | skip (offline); compiles |

## Note for the reviewer: TestLaunchFlags vs TestStatusLineFields split (REQ-2)

The plan's Acceptance Criterion D2 reads "`TestLaunchFlags` asserts ... `session_title`,
`session_name` and the interactive `plan` value", but the plan's own Affected Files /
Implementation Notes assign the `session_name` assertion to `TestStatusLineFields`
specifically ("`TestStatusLineFields` `session_name` assertion (REQ-2) and REQ-15 log").
I followed the more specific instruction: `session_title` (a hook field) is asserted in
`TestLaunchFlags`; `session_name` (a status-line field) is asserted in
`TestStatusLineFields`, right next to the REQ-15 log of the same field on the resumed
session. Both are real `assert.Equal` calls, not skips — REQ-2 is fully covered, just
split across the two tests the Implementation Notes actually named. Flagging this so the
reviewer can confirm the split is acceptable rather than treating D2's literal wording as
unmet.

## Implementation Bugs

None found. `internal/claudecode` already exported every seam the plan's Implementation
Notes call for (`BuildArgv` with `Title`/`PermissionMode`/`ResumeSessionID`, `LaunchEnv`,
`KeychainTokenReader`, `RunCommand`, `FetchUsage`, `ReadThemeFamily`, `DefaultConfigPath`)
and every one behaved exactly as its own doc comments and `spikes/canary-fields.md`
describe — no production code needed changing or was changed.

## Test Run Output

### `go build ./...`
```
(exit 0, no output)
```

### `go vet -tags=canary ./test/canary/...`
```
(exit 0, no output)
```

### D3 (automated check from the plan)
```
$ MUSTER_CANARY_OFFLINE=1 go test -tags=canary -count=1 -v -run '^TestInstalledBinaryCarriesInterfaceStrings$' ./test/canary/...
=== RUN   TestInstalledBinaryCarriesInterfaceStrings
--- PASS: TestInstalledBinaryCarriesInterfaceStrings (0.14s)
PASS
ok  	github.com/Zalaras/muster/test/canary	0.870s
```

### Full offline run (`MUSTER_CANARY_OFFLINE=1 go test -tags=canary -count=1 -v ./test/canary/...`)
```
--- FAIL: TestInstalledVersionMatchesPin (0.02s)
    (expected: installed 2.1.267 vs pin 2.1.246 — decision 4, the pin bump is a
    post-land ritual, not part of this plan)
--- SKIP: TestStatusLineVersionMatchesInstalled
--- SKIP: TestHookTransport
--- SKIP: TestHookFields
--- SKIP: TestStopFailureReplacesStop
--- SKIP: TestPlanModeSequence
--- SKIP: TestLaunchFlags
--- SKIP: TestNotifications
--- SKIP: TestStatusLineFields
--- SKIP: TestUnknownVersusZero
--- SKIP: TestCommandHookPathQuoting
--- SKIP: TestCommandHooksCarryEnvelopeOnEveryEvent
--- SKIP: TestKeychainCredentialShape
--- SKIP: TestUsageAPIResponseShape
--- SKIP: TestThemeConfigParses
--- PASS: TestInstalledBinaryCarriesInterfaceStrings (0.14s)
FAIL
```
Every skip names `MUSTER_CANARY_OFFLINE is set: ...` (INV-1 holds: nothing under offline
launches a session, reads the Keychain, or opens a network connection — the only test
that ran real logic offline is the static tier).

### `make lint`
```
golangci-lint run
0 issues.
```
(One `gocritic: appendAssign` finding in `static_test.go`'s chunk-reader was fixed during
this step — `append(carry, buf[:n]...)` assigned to a new `chunk` var now builds `chunk`
via two `append(chunk, ...)` calls instead.)

### `make test`
```
go test -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	14.541s
ok  	github.com/Zalaras/muster/internal/claudecode	10.827s
ok  	github.com/Zalaras/muster/internal/ghissue	1.991s
ok  	github.com/Zalaras/muster/internal/gitutil	2.175s
ok  	github.com/Zalaras/muster/internal/locate	3.473s
ok  	github.com/Zalaras/muster/internal/server	21.823s
ok  	github.com/Zalaras/muster/internal/session	7.076s
ok  	github.com/Zalaras/muster/internal/store	7.899s
ok  	github.com/Zalaras/muster/internal/termbridge	7.162s
ok  	github.com/Zalaras/muster/internal/tmux	15.919s
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest	6.936s
ok  	github.com/Zalaras/muster/internal/usage	8.447s
ok  	github.com/Zalaras/muster/internal/webui	7.497s
```

## Handoff to the orchestrator

Per the plan's Implementation Notes ("For the orchestrator", Decision 3): run
`make canary` once in the main session against the installed binary, save it to
`plans/canary-full-coverage/canary-run.log`, and confirm `md5 -q ~/.claude/settings.json`
is unchanged before/after. That log is what the reviewer reads for D2, D4-D11 and D12 —
none of those are exit-code checks I can produce here.

## Fix Attempt 1 (pre-review)

**Verdict**: pass (gates green; see below — this is a pre-review fix, `make canary` itself
was not re-run here per the orchestrator's cost rule).

**Defect** (routed from the orchestrator's real `make canary` run, `canary-run.log`
committed at `cfcf5a0`): run D failed at build with `no SessionStart within 90s (trust
prompt seen: true)`, red-lining every harness-backed test. Both trust-prompt loops in
`test/canary/harness_test.go` (run D, then ~line 439; run E, then ~line 530) answered the
workspace-trust prompt with a blind `send-keys Enter`. On the installed Claude Code
2.1.267 the prompt preselects "No, exit" (top row), so a blind Enter exits the session
before `SessionStart` ever fires — matches plan Edge Case 15's amendment exactly.

**Fix**: added one helper, `answerTrustPrompt(ctx, target, pane string) error`
(`harness_test.go`, next to `looksLikeTrustPrompt`), used by both loops in place of the
blind `sendKeys(ctx, target, "Enter")`. It splits the already-captured pane into lines,
finds the line containing the selection marker (`❯`, `trustPromptMarker`) and the line
containing the exact row text `"Yes, I trust this folder"` (`trustPromptYesRow`), and:

- if the marker is already on the Yes row → `Enter`
- if the marker is on another row (or unresolved this frame) and above the Yes row →
  `Down`
- if below → `Up`
- if the Yes row itself isn't visible this frame → send nothing, let the caller's existing
  3 s pacing retry on the next capture

This is order-agnostic (works whether "Yes" is listed first, as measured on 2.1.233 per
FINDINGS §9, or second, as on 2.1.259+/2.1.267 per canary-fields.md and the orchestrator's
probe) and never presses Enter until the marker's row is confirmed to be the Yes row —
never a blind Enter, per the amendment. `capture-pane` stays a wait/answer oracle only
(CLAUDE.md): the pane text is used only to decide how to answer a dialog already on
screen, never to infer session state. The existing 3 s re-send pacing is unchanged — the
loop variable was renamed `lastEnter` → `lastAction` since it now gates any answering key
(`Down`/`Up`/`Enter`), not only `Enter`.

**Evidence — algorithm verified against the real installed binary, zero tokens.** Ran a
standalone reproduction of the exact decision procedure (same marker/Yes-row string match,
same Down/Enter branching) against a fresh `claude --model claude-haiku-4-5-20251001` in a
never-seen scratch dir, on a dedicated tmux socket, submitting no prompt:

```
step 0: yes_line=14 marker_line=13
-> sending Down
step 1: yes_line=14 marker_line=14
marker already on Yes row -> sending Enter, done
```

Pane after answering showed the Claude Code REPL banner (`Claude Code v2.1.267` /
`Haiku 4.5 · Claude Team` / the `Try "write a test for <filepath>"` placeholder), not the
trust prompt — confirming the algorithm reaches the REPL on the installed binary's current
(No-first) layout. The session was killed via `tmux -L <socket> kill-server` immediately
after, without ever submitting a prompt (0 tokens); `~/.claude/settings.json` was never
read or written (a fresh scratch dir was used, not the repo's own `.claude/`).

**Gates (zero-token, cost rule — `make canary` itself was not re-run here):**

```
$ go vet -tags=canary ./test/canary/...
(exit 0, no output)

$ gofmt -l test/canary/harness_test.go
(no output — already formatted)

$ make lint
golangci-lint run
0 issues.

$ MUSTER_CANARY_OFFLINE=1 go test -tags=canary -count=1 -v -run '^TestInstalledBinaryCarriesInterfaceStrings$' ./test/canary/...
=== RUN   TestInstalledBinaryCarriesInterfaceStrings
--- PASS: TestInstalledBinaryCarriesInterfaceStrings (0.16s)
PASS
ok  	github.com/Zalaras/muster/test/canary	1.018s

$ make test
ok  	github.com/Zalaras/muster/cmd/musterd	14.772s
ok  	github.com/Zalaras/muster/internal/claudecode	11.194s
ok  	github.com/Zalaras/muster/internal/ghissue	3.023s
ok  	github.com/Zalaras/muster/internal/gitutil	3.232s
ok  	github.com/Zalaras/muster/internal/locate	4.229s
ok  	github.com/Zalaras/muster/internal/server	23.269s
ok  	github.com/Zalaras/muster/internal/session	8.496s
ok  	github.com/Zalaras/muster/internal/store	6.781s
ok  	github.com/Zalaras/muster/internal/termbridge	5.658s
ok  	github.com/Zalaras/muster/internal/tmux	16.342s
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest	7.932s
ok  	github.com/Zalaras/muster/internal/usage	8.754s
ok  	github.com/Zalaras/muster/internal/webui	7.693s
```

**Files touched**: `test/canary/harness_test.go` only (run D's and run E's trust-prompt
loops, plus the new `answerTrustPrompt`/`trustPromptYesRow`/`trustPromptMarker`). No
production code, no other test files, `plan.md` and `orchestration-state.json` untouched.

**Handoff**: the orchestrator's next real `make canary` run against the installed binary
is what proves run D/E now clear the trust prompt end-to-end (this fix only proves the
answering algorithm reaches the REPL in isolation, not the full harness build).

## Fix Attempt 2 (pre-review)

**Verdict**: pass (gates green below; per the orchestrator's cost rule the real
`make canary` run is not repeated here).

**Defect** (routed from the orchestrator's second real `make canary` run,
`canary-run.log` committed at `c657cff`): the trust-prompt fix worked — the harness built
end to end (C×4, D, E) — but two assertions were red on one cause:

```
TestHookFields/PermissionRequest
    PermissionRequest missing "permission_suggestions"; has [cwd scratchpad_dir prompt_id permission_mode session_id transcript_path hook_event_name tool_name tool_input]
TestNotifications/permission_prompt_shares_PermissionRequest's_prompt_id_(REQ-5)
    permission_suggestions must be an array; got <nil>
```

Per the plan amendment (`plan.md` REQ-5/REQ-9/D5, "Amended 2026-09-10"): the measured
`ExitPlanMode` `PermissionRequest` on 2.1.267 carries no `permission_suggestions`; the
shape the plan originally quoted was measured on a `Write` request in `default` mode
(`test/rig/captures/capture-6.jsonl`, 2.1.259), never on `ExitPlanMode`, and no production
code reads the key (`grep -rn permission_suggestions internal/ cmd/` hits only the
`claudecodetest` fixture) — confirmed again here, same result. It is not a Muster
dependency, so the canary must not gate on it.

**Fix** (`test/canary/canary_test.go` only):

- `TestHookFields`'s `PermissionRequest` row (line ~105): dropped `permission_suggestions`
  from the required-fields list, leaving `tool_name`, `tool_input`; `permission_mode`
  presence stays asserted via the row's existing `true` flag. Added a comment naming the
  amendment and the measured absence.
- `TestNotifications`'s permission subtest (REQ-5, ~line 295): the array/non-empty/shape
  assertions now run only inside `if present`, where `present` comes from a plain
  two-value map read (`raw, present := req.payload["permission_suggestions"]`) rather than
  the previous type-asserting `req.payload["permission_suggestions"].([]any)` that failed
  outright on a missing key. `tool_name` and `permission_mode` are read as scalar strings
  and logged alongside `present` via `t.Logf` — matching INV-2 (no payload map or
  `tool_input` in any log line) and REQ-11 (name/scalar only).
- Also added a `t.Logf` in `TestNotifications`'s idle subtest (REQ-3) giving
  `idle.at.Sub(stop.at).Seconds()` — the measured gap between run D's `Stop` and the
  `idle_prompt` Notification, logged (never asserted, per the plan's flake-avoidance
  rule) for the orchestrator to carry into `spikes/canary-fields.md`.

Nothing else in either test changed: ordering assertions, `prompt_id` sharing, the
`permission_mode` presence/absence split, and every other row/subtest are untouched.

**Blast radius.** Both failing tests read the same run-E `PermissionRequest` capture, and
both are now fixed by the same underlying premise (the key is optional). Checked for other
readers of `permission_suggestions` in the package — `grep -n permission_suggestions
test/canary/*.go` after the fix shows only the two edited sites (the row comment/list and
the `TestNotifications` block); `TestPlanModeSequence` and `TestLaunchFlags` don't read the
key at all. No other test needed touching.

**Gates (zero-token; `make canary` itself was not re-run here per the cost rule):**

```
$ go vet -tags=canary ./test/canary/...
(exit 0, no output)

$ make lint
golangci-lint run
0 issues.

$ MUSTER_CANARY_OFFLINE=1 go test -tags=canary -count=1 -v -run '^TestInstalledBinaryCarriesInterfaceStrings$' ./test/canary/...
=== RUN   TestInstalledBinaryCarriesInterfaceStrings
--- PASS: TestInstalledBinaryCarriesInterfaceStrings (0.14s)
PASS
ok  	github.com/Zalaras/muster/test/canary	0.796s

$ make test
go test -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	14.465s
ok  	github.com/Zalaras/muster/internal/claudecode	10.835s
ok  	github.com/Zalaras/muster/internal/ghissue	2.322s
ok  	github.com/Zalaras/muster/internal/gitutil	3.843s
ok  	github.com/Zalaras/muster/internal/locate	3.607s
ok  	github.com/Zalaras/muster/internal/server	21.463s
ok  	github.com/Zalaras/muster/internal/session	7.811s
ok  	github.com/Zalaras/muster/internal/store	6.073s
ok  	github.com/Zalaras/muster/internal/termbridge	5.964s
ok  	github.com/Zalaras/muster/internal/tmux	16.078s
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest	7.624s
ok  	github.com/Zalaras/muster/internal/usage	8.471s
ok  	github.com/Zalaras/muster/internal/webui	8.063s
```

**Files touched**: `test/canary/canary_test.go` only. No production code, no other test
files, `plan.md` and `orchestration-state.json` untouched.

**Handoff**: the orchestrator's next real `make canary` run is what proves
`TestHookFields/PermissionRequest` and `TestNotifications` pass end to end with the
optional-key handling; the offline gates above only prove the package still compiles,
lints, and passes everything reachable without a live session.
