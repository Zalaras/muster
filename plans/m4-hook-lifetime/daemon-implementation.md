# Daemon Implementation: M4 — Hook lifetime

**Plan**: m4-hook-lifetime
**Mode**: fix (attempt 1)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/claudecode/settings.go` | modified | `SettingsConfig` reshaped to `{HookCommand, StatusLineCommand, LegacyCommands}` (REQ-4); `allHookEvents` (httpHookEvents + SessionStart) all get one `type:"command"` entry, no `type:"http"` anywhere (REQ-1/REQ-2); `isMusterEntry`/new `isMusterIngestURL`/`isMusterCommand` recognise legacy http + legacy/current command entries for stripping (REQ-3); new `stripMusterAllowedURLs` removes Muster's own `allowedHttpHookUrls` entries, preserves foreign ones, deletes the key when empty, never adds one (REQ-2/D5); `WriteWrapperScripts` now returns `(hookScript, statusLineScript, legacyScript string, err error)`, writes `hook.sh` (was `hook-sessionstart.sh`), best-effort removes the legacy path (REQ-5); `writeEnvelopeScript` template gains the `[ -z "$MUSTER_SESSION" ] && exit 0` early exit and unconditional `musterSession` field, single-quoted URL (REQ-6/REQ-7) |
| `internal/claudecode/doc.go` | modified | Package comment notes the m4-hook-lifetime command-wrapper transport |
| `internal/server/sessions.go` | modified | `sessionLauncher` drops `hookURL`/`statusURL`, gains `hookScript`/`legacyScripts`; `writeSettings` builds the new `SettingsConfig` |
| `internal/server/server.go` | modified | `Config` drops `BaseURL` (now dead — nothing in this package composed a URL from it anymore) and `SessionStartScript`, gains `HookScript`/`LegacyScripts`; launcher wiring updated |
| `internal/server/ingest.go` | modified | `process` computes `enveloped := ev.MusterSession != nil` and passes it into `manager.Apply` (REQ-9); status path (`processStatus`) untouched (REQ-11) |
| `internal/session/manager.go` | modified | `Apply` gains `enveloped bool`; for an enveloped non-bind-kind event, binds a never-bound session (no transition) or rebinds (via `applyBind`+`KindClearRebind`) a session bound to a different claude id, before `applyInput` runs — single persist + broadcast preserved (REQ-9/D18); new unexported `isBindKind` helper |
| `cmd/musterd/main.go` | modified | Consumes `WriteWrapperScripts`'s new 4-value return, passes `HookScript`/`LegacyScripts` through `server.Config`, logs the two script paths at Info once at startup (REQ-16) — paths only, never token/URL |
| `test/canary/canary_test.go` | modified | Added skipped (`needsHarness`) `TestCommandHooksCarryEnvelopeOnEveryEvent` stub (REQ-14/D25), documenting the 2026-08-27 probe recipe |
| `SPEC.md` | modified | §6 daemon-down bullet amended; §11 changelog entry added (D27) |
| `TODO.md` | modified | Ticked the three M4 items this plan resolves ("Surface daemon down prominently", "Per-directory hooks instrument every session", "Muster never removes its own hook entries") with the permanent-by-design decision and measurements; added the post-v1 compiled-hook-helper note under M5+ (D28) |

`docs/protocol.md` already carried the plan's Protocol Contract delta (merged during planning, verified via `git diff docs/protocol.md` before starting) — no further edit needed for D26.

## Decisions

- Removed `server.Config.BaseURL` and the dead `containsString` helper in `internal/claudecode/settings.go` — both became write-only/unused once the launcher stopped composing ingest URLs. Verified via `grep -rn "BaseURL" internal/server/ cmd/musterd/` (only the now-removed setter remained) and `grep -rn "containsString" internal/claudecode/` (only its own definition and the one call site I was replacing) before deleting either.
- Kept `httpHookEvents` as its own var (rather than inlining it into `allHookEvents`) instead of collapsing the two: `internal/claudecode/settings_test.go` (test-agent-owned) still iterates `httpHookEvents` directly at two call sites (`grep -n "httpHookEvents" internal/claudecode/settings_test.go` → lines 40, 236), so removing the var would force an unauthorized test edit. `allHookEvents = append([]string{"SessionStart"}, httpHookEvents...)` is the eleven-event list REQ-1 needs.
- `isMusterEntry`'s http branch and the new `allowedHttpHookUrls` stripping both call a single `isMusterIngestURL(raw string) bool` helper (URL-shape + loopback check) rather than duplicating the parse-and-match logic — same recognition rule REQ-2 and REQ-3 both need.
- `WriteWrapperScripts`'s legacy-script removal is silently best-effort (no logging) since `internal/claudecode` has no logger dependency today — confirmed via `grep -rn "zerolog" internal/claudecode/*.go` (no non-test hits). D9 only requires the removal to happen when possible; no acceptance criterion requires logging its failure.

## Handoff

**Build status**: `go build ./...` exits 0 (verified: `go build ./...; echo $?` → `0`, and `gofmt -l .` prints nothing for the whole tree).

Test files needing updates — all explicitly listed under the plan's "Tests (daemon-tests owns)" Affected Files, broken by the signature/field changes above (confirmed via `go vet ./...`, which only fails on these three):

- `internal/claudecode/settings_test.go` — every use of the old `SettingsConfig{HookURL, StatusURL, SessionStartCommand}` fields (`testSettingsConfig` and two ad-hoc literals) must move to `{HookCommand, StatusLineCommand, LegacyCommands}`; REQ-1..REQ-4/REQ-8 unit tests plus the Edge Case 1 migration fixture per the plan.
- `internal/server/sessions_test.go` — `sessionLauncher{hookURL: ...}` (line 157) must become `sessionLauncher{hookScript: ..., legacyScripts: ...}`.
- `internal/server/settings_shell_test.go` — `TestWrapperScriptsShellRoundTrip` calls `WriteWrapperScripts` (3-value return) and builds `SettingsConfig{HookURL, StatusURL, SessionStartCommand, StatusLineCommand}`; needs the new 4-value return and field names, per REQ-12's extension of this test.
- `internal/session/manager_test.go` — every `mgr.Apply(ctx, id, claudeID, promptID, input)` call (10 call sites) needs a trailing `enveloped bool` argument; REQ-9/10/11 invariant table (D14-D17) is new test content on top of that mechanical fix.
- `internal/session/machine_test.go` — confirmed clean: `grep -n "Apply(\|SettingsConfig" internal/session/machine_test.go` returns no hits, so this file needs no signature-fallout fix (only new invariant-table test content per REQ-9/10/11, if daemon-tests chooses to put it here rather than in `manager_test.go`).

None of the above are assertion/behavior changes I judged incorrect — they are mechanical fallout of the approved contract's Go-level signature/field changes (REQ-4, REQ-9), sanctioned breakage per the plan's own Affected Files split.

`go vet ./...` output confirming the exact (and only) three broken packages:

```
# github.com/Zalaras/muster/internal/claudecode
vet: internal/claudecode/settings_test.go:16:3: unknown field HookURL in struct literal of type SettingsConfig
# github.com/Zalaras/muster/internal/session
vet: internal/session/manager_test.go:270:117: not enough arguments in call to mgr.Apply
	have (context.Context, int64, string, nil, claudecode.StateInput)
	want (context.Context, int64, string, *string, claudecode.StateInput, bool)
# github.com/Zalaras/muster/internal/server
vet: internal/server/sessions_test.go:157:3: unknown field hookURL in struct literal of type sessionLauncher
```

`make lint` will fail for the same reason until daemon-tests updates these three files — not a defect in the non-test code (`gofmt -l .` and `go vet` are clean everywhere else; `golangci-lint run ./internal/claudecode/...` etc. after these test files are fixed should be clean, verified by isolating the vet errors above to exactly those three files/packages).

Automated checks re-run from the plan's `Automated Checks` block (all pass except the ones gated on daemon-tests' work, and `E1`/full `D19` which need the test suite fixed first):

```
D22 ! rg -n "hook_event_name" cmd/ internal/ --glob '!internal/claudecode/**'   → PASS
D23 ! rg -n "shellQuote|'\\''" cmd/ internal/server/ internal/session/          → PASS
D24 ! rg -n "hookURL|statusURL" internal/server/sessions.go                    → PASS
D25 rg -q "func TestCommandHooksCarryEnvelopeOnEveryEvent" test/canary/canary_test.go → PASS
D30 ! go list -deps ./internal/claudecode | rg -q "internal/(usage|store)"     → PASS
D20 go build ./...                                                             → PASS (exit 0)
```

`D19 make test`, `D21 make lint`, `E1 make e2e` were not re-run to a green state here since they depend on the test-file fixes listed above; that is next step's (daemon-tests') job per the pipeline.

## Fix Attempt 1

**Failures addressed**: review.md cycle 1 — Critical 1 (`[orchestrator:decision]`, now decided as Option B, monotonic rebind) and Minor 3 (`[daemon-impl]`, `httpHookEvents` doc comment gives the wrong reason for the var's survival).

### Critical 1 — monotonic rebind guard

**Files changed**: `internal/session/manager.go` (`Manager.Apply`, doc comment + rebind branch).

**Decision followed**: `plans/m4-hook-lifetime/decisions/monotonic-rebind/decision.md` — Option B, verbatim guard: "if `byClaude[incoming id]` already points at this session and it is not the current `ClaudeSessionID`, route and apply the event, do not rebind/reset." Matches `docs/protocol.md` §4.2 (already amended by the orchestrator) and Edge Case 6a in `plan.md` byte-for-byte; no protocol text touched here.

**Every code path into the defective branch, enumerated**:

The defect lived entirely in one `switch` inside `Manager.Apply` (`internal/session/manager.go:414-423` pre-fix), gated by `enveloped && !isBindKind(input.Kind)`. There are exactly two cases inside that switch, and only the second was ever wrong:

1. `sess.ClaudeSessionID == ""` (never-bound session, Edge Case 5) — binds with no transition. Unaffected: still fires only when there is no prior binding to protect, so "backwards" cannot apply. Confirmed unchanged by re-reading the diff and by `TestApply_NeverBoundSessionBindsWithNoTransitionThenAppliesItsOwnEvent` staying green.
2. `sess.ClaudeSessionID != claudeSessionID` (bound to a different id) — this is the one and only door the Critical opened, and it has exactly one call site (there is no second switch, no duplicate branch elsewhere in the file — confirmed by `grep -n "isBindKind\|enveloped &&" internal/session/manager.go`, one hit each). Every enveloped non-bind-kind event with a session_id different from the current binding funnels through this single line, so closing it here closes the category, not just the reviewer's `SessionEnd(reason:"clear")` example — the same guard also protects a reordered straggler of any other non-bind kind (e.g. a late `PreCompact` or `PostToolUse` naming an old id) that happens to arrive after a rebind, which the review's "any late event naming the previous conversation" language explicitly worried about.

**Fix**: inside case 2, before calling `applyBind`, check whether `m.byClaude[claudeSessionID]` already maps to this same `musterSessionID`:

```go
case sess.ClaudeSessionID != claudeSessionID:
    if owner, known := m.byClaude[claudeSessionID]; !known || owner != musterSessionID {
        applyBind(sess, claudeSessionID, claudecode.StateInput{Kind: claudecode.KindClearRebind}, now)
        m.byClaude[claudeSessionID] = musterSessionID
    }
```

If `byClaude[claudeSessionID]` is unknown, or known but points at a *different* muster session, this is a genuine forward rebind (Edge Case 4) or first bind of that particular claude id, and applyBind/reset runs exactly as before. If it's known and points at *this* muster session, this session bound that claude id once already and has since moved past it — the event is a reordered straggler; it falls through to the unconditional `applyInput(sess, claudeSessionID, promptID, input, now)` below (unchanged, still runs exactly once, still the only persist/broadcast per D18) but the binding, state, context and compaction counter are left alone.

**Blast-radius check on `byClaude` (per instructions, verifying it's never pruned in a way that would defeat the guard):**

```
grep -n "byClaude" internal/session/manager.go
```
gave every read/write site:
- Line ~79/101: map declared/constructed — n/a.
- Line ~119 (constructor): populates `byClaude[sess.ClaudeSessionID] = sess.ID` from the DB row at startup — only the *current* id per session, no historical ones (a known, pre-existing restart-time gap unrelated to this fix — a restart loses the stale-id memory the guard depends on, but so did the review's own reasoning: "the manager already holds that knowledge" describes the live-process case).
- Line ~230-232 (`removeFromMemory`, shared by `DeleteSession`, `Reconcile`'s sweep, and `Remove`): deletes **every** `byClaude` entry pointing at a given muster session id — but this only runs when the whole muster session is being removed from `m.sessions`. `Apply` looks up `m.sessions[musterSessionID]` first and returns an error immediately if that lookup misses, so a session whose `byClaude` entries were just wiped by `removeFromMemory` can never reach the guard at all. Confirmed by reading `End`/`EndAll` (`internal/session/manager.go:558-624`) and `RecordResume` (`internal/session/manager.go:664-687`): neither touches `byClaude` or calls `removeFromMemory` — only `DeleteSession`/`Reconcile`/`Remove` do, and all three also drop the session from `m.sessions` in the same call.
- Lines 377 (`Resolve`), 418/421/427 (the three write sites inside `Apply`, one per switch case plus the bind-kind assignment after `applyInput`) — all read-only or write-through; my change added one more read (`known, owner := m.byClaude[claudeSessionID]`) at line 421's old location, no new writer.

Net: there is no path that deletes a *single* stale claude id while leaving the owning muster session alive, so the guard's precondition ("the manager already holds that knowledge") holds for every session still reachable by `Apply`.

**Confirmed the guard is not tripped by the two paths named in the review's checklist**:
- **Never-bound bind path (Edge Case 5)**: guarded by the `sess.ClaudeSessionID == ""` case above it — case 2 (and therefore the new guard) never runs when there was no prior binding. Verified: `TestApply_NeverBoundSessionBindsWithNoTransitionThenAppliesItsOwnEvent` still green.
- **Forward `/clear` path (Edge Cases 4, 5, 7)**: a genuine forward rebind's target id has never been `byClaude`-mapped to this muster session before (or is unmapped entirely), so `!known || owner != musterSessionID` is true and `applyBind` still runs, unchanged. Verified: `TestApply_INV2_RebindResetsContextAndCompactionsBeforeItsOwnRowApplies` (12 subtests, forward rebind resets before its own row), `TestApply_INV7_RebindOnOneSessionLeavesABystanderUntouched`, and `TestApply_EnvelopedSameBoundIDNeverRebindsEvenForClearDeathHint` (Edge Case 6, same-id no-op — untouched, doesn't even enter case 2) all still pass.

**Reviewer's repro re-run** (unit-level trace from review.md Critical 1, reproduced with a throwaway test in `internal/session`, written, run, and deleted per the constraint against adding permanent test files — the sanctioned regression test is daemon-tests' to add next wave):

Sequence: bind `claude-old` (`KindBind`) → one `PreCompact` (`KindCompaction`) on `claude-old` → `SessionStart(clear)` to `claude-new` (`KindClearRebind`) → `claude-new` goes `working` (`KindTurnActivity`) and compacts once more → reordered `SessionEnd(reason:"clear")` (`KindClearDeathHint`) for `claude-old` arrives last.

Before the fix (guard temporarily reverted to the old unconditional `applyBind`, same repro, run with `go test ./internal/session/... -run TestThrowaway_MonotonicRebindGuard -v`):
```
Error: claudeSessionID: expected "claude-new", actual "claude-old"
Error: state:           expected "working",    actual "started"
Error: compactions:     expected 1,             actual 0
```
— matches review.md's reported trace (`claude-new -> claude-old`, `working -> started`, `1 -> 0`) exactly.

After the fix (guard restored), same repro, same command:
```
--- PASS: TestThrowaway_MonotonicRebindGuard_ReorderedClearSessionEndDoesNotRebindBackwards (0.01s)
PASS
```
`final.ClaudeSessionID == "claude-new"`, `final.State == StateWorking`, `final.Compactions == 1` — all three assertions pass.

**Real-daemon repro**: not independently re-run against a live `musterd`+tmux+stub-claude rig. Justification (not asserted, checked): `grep -n "\.Apply(" internal/server/*.go` shows exactly one call site, `internal/server/ingest.go:146`, which computes `enveloped := ev.MusterSession != nil` and calls `manager.Apply(ctx, *sessionID, ev.SessionID, ev.PromptID, input, enveloped)` — the same arguments, same function, no additional logic between the HTTP/hook layer and `Manager.Apply`. The review's own "real daemon" trace (`state=working  claudeSessionId=managed-new` → `state=started  claudeSessionId=managed-xyz` after the reordered event) is therefore the identical code path as the unit-level trace, differing only in how the arguments arrive (real hook.sh/tmux/HTTP vs. a direct call); the unit-level before/after match above is evidence for both.

**Verification commands run after the fix**:
```
go build ./...        → exit 0
go vet ./...           → exit 0
gofmt -l .             → no output
go test ./... -count=1 → all packages ok (cmd/musterd, internal/claudecode, internal/gitutil, internal/server, internal/session, internal/store, internal/termbridge, internal/tmux, internal/usage)
make lint               → "0 issues."
```

### Minor 3 — `httpHookEvents` doc comment

**File changed**: `internal/claudecode/settings.go`.

Replaced the comment's claim that the var is kept because "REQ-2/REQ-3's legacy-http-entry stripping only ever applied to these ten" (false — `isMusterEntry` strips a Muster http entry identically on all eleven events, `SessionStart` included) with the actual reason: `allHookEvents` is built from `httpHookEvents` plus `SessionStart`, and `settings_test.go` iterates `httpHookEvents` directly (two call sites, per the initial implementation's own `## Decisions` entry), so the var can't be inlined away without an unauthorized test edit.

## Handoff

**Build status**: `go build ./...` exits 0 (re-verified after this fix wave).

No test files were edited or need edits for this fix wave — the guard is a pure `internal/session/manager.go` change and requires no signature or field changes. The throwaway repro test used to verify Critical 1 (`internal/session/manager_repro_throwaway_test.go`, `TestThrowaway_MonotonicRebindGuard_ReorderedClearSessionEndDoesNotRebindBackwards`) was deleted after use, per the constraint against adding permanent test files in this role.

**Regression test daemon-tests must add next wave** (the reviewer's repro, as a permanent test in `internal/session/manager_test.go`, alongside the existing `TestApply_INV2_RebindResetsContextAndCompactionsBeforeItsOwnRowApplies` / `TestApply_EnvelopedSameBoundIDNeverRebindsEvenForClearDeathHint` tests it belongs next to):

- Bind `claude-old` (`Apply(..., "claude-old", nil, StateInput{Kind: KindBind}, true)`).
- One `PreCompact` on `claude-old` (`Apply(..., "claude-old", nil, StateInput{Kind: KindCompaction}, true)`) — gives the rebind something to lose.
- `SessionStart(clear)` to `claude-new` (`Apply(..., "claude-new", nil, StateInput{Kind: KindClearRebind}, true)`).
- `claude-new` goes `working` (`Apply(..., "claude-new", nil, StateInput{Kind: KindTurnActivity}, true)`) then compacts once more (`Apply(..., "claude-new", nil, StateInput{Kind: KindCompaction}, true)`) — assert `Compactions == 1`, `State == StateWorking` as a sanity checkpoint.
- Reordered straggler: `SessionEnd(reason:"clear")` for `claude-old` arrives last (`Apply(..., "claude-old", nil, StateInput{Kind: KindClearDeathHint}, true)`).
- Assert on the final snapshot: `ClaudeSessionID == "claude-new"` (not rebound backwards), `State == StateWorking` (not reset to `started`), `Compactions == 1` (not zeroed) — this is Edge Case 6a / D-series coverage for the monotonic-rebind decision, and should sit next to D15's INV-2 table since it is the mirror case (INV-2 covers the forward rebind resetting; this covers the backward non-rebind not resetting).
- A second subtest worth adding in the same test function/table: repeat with a non-`ClearDeathHint` stale kind (e.g. a reordered `PostToolUse`/`KindTurnActivity` naming `claude-old`) to cover the "any late event naming the previous conversation" case the review's Critical 1 text called out, not just the `SessionEnd(reason:"clear")` example specifically.
