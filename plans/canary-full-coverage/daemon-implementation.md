# Daemon Implementation: canary-full-coverage

**Plan**: canary-full-coverage
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `Makefile` | modified | `canary` target help string updated to state the new cost ("4 haiku turns + zero-token unauth/resume/live checks") and that `MUSTER_CANARY_OFFLINE=1` now also covers the static binary check (REQ-14). Target body unchanged. |
| `docs/claude-code-pin.md` | modified | Rewrote "Current state of the canary": run table extended to A/B/C×4/D(plan mode + idle wait)/E(resume + unanswered `ExitPlanMode`); added "Static tier" and "Live tier" paragraphs stating what each proves and does not prove; "Still manual" cut to exactly three rituals (plan-mode step 3, `agent_id` on subagent-originated hooks, `fable` alias by static inspection), with `SubagentStop` explicitly called out as not a residual (`KindInert`); R2 recorded as automated (closed by run E); added "rerun once before reading it as drift" guidance for the two flaky-class edge cases (run E's tool-call miss, live tier 5xx); added the `canary-run.log` convention note for plan reviews (REQ-13). |

There is no production Go change in this plan — `internal/claudecode/` already exports every
seam the canary needs (`BuildArgv`, `LaunchEnv`, `KeychainTokenReader`, `RunCommand`,
`FetchUsage`, `ReadThemeFamily`, `DefaultConfigPath`, `InstalledVersion`). All test code
(`test/canary/*_test.go`, including any new `static_test.go` / `live_test.go`) belongs to
daemon-tests and was not touched here.

## Decisions

- None — both files match the plan's Requirements (REQ-13, REQ-14) and Implementation Notes
  ("For daemon-impl" section) directly; no deviation needed.

## Handoff

**Build status**: `go build ./...` exits 0.

Verification run:
- `go build ./...` → exit 0
- `gofmt -l .` → no output (clean)
- `go vet ./...` → exit 0
- `make lint` (`golangci-lint run`) → "0 issues."
- `golangci-lint run --tests=false ./...` → "0 issues." (production code excluding test files, in case a later test-file break needs this signal isolated)

No test files needing changes — none were touched or invalidated by this step.

## Fix Attempt 1 (review cycle 1)

**Failure addressed**: review.cycle1.md issue 1 (`[daemon-impl]`) — `ScrollSpeed`'s doc
comment in `internal/claudecode/launch.go` still said the `make canary` assertion was
"not yet" done, contradicting this plan's own static tier (which asserts every
`LaunchEnv()` key by name) and the plan's own `TODO.md` upkeep line marking the item
done on 2026-09-10.

**Changes made**: Replaced the stale four lines (previously lines 55-58) with a statement
that the static tier has asserted the variable's presence since 2026-09-10 (name-based
presence check via `LaunchEnv()`, catching a rename/removal), while being explicit that it
does not catch a change in the variable's *effect* on scroll rate — that stays a manual
re-measurement against `spikes/S6-scroll-bandwidth.md`. Confirmed the assertion this
comment now describes actually exists: `test/canary/static_test.go:24-49` iterates
`claudecode.LaunchEnv()` and asserts each key (its only key is
`CLAUDE_CODE_SCROLL_SPEED`) is present in the installed binary. No other lines in the
comment or the constant were touched — this was a single-issue fix with no other code
path affected (`ScrollSpeed`/`LaunchEnv` have exactly this one call site of stale prose,
confirmed by reading the whole file above and below the edited block).

**Verification**:
- `go build ./...` → exit 0
- `make lint` (`golangci-lint run`) → "0 issues."
