# Daemon Tests: M4 — Hook-command path quoting

**Plan**: m4-hook-quoting
**Verdict**: pass

## Summary

Tests created: 10 new `Test*` functions (9 table subtests inside 2 of them) + 1 sanctioned-breakage update to an existing test + 1 new test-helper (`claudecodetest.RawStatusLineFull`) | Passing: all | Failing: 0

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/claudecode/settings_test.go` | `TestMergeSettings_FreshFileRegistersEveryHTTPHookEventAndSessionStartAsCommand` (updated) | Sanctioned-breakage: SessionStart/statusLine `command` now asserted as `shellQuote(cfg.X)`, not bare; timeouts (2 / none) still correct | pass |
| `internal/claudecode/settings_test.go` | `TestShellQuote` (5 subtests: space-free, space-bearing, embedded quote, multiple embedded quotes, empty string) | `shellQuote` unit itself, independent of JSON plumbing | pass |
| `internal/claudecode/settings_test.go` | `TestMergeSettings_CommandFieldsAreShellQuotedForSpaceBearingPath` | D1: fresh file writes both command fields as `'<path>'` for a space-bearing path (production shape) | pass |
| `internal/claudecode/settings_test.go` | `TestMergeSettings_ShellQuoteEscapesSingleQuoteAndStaysIdempotent` | D2/Edge Case 2: `'` in a path is escaped correctly; second merge on that output is byte-identical | pass |
| `internal/claudecode/settings_test.go` | `TestMergeSettings_ReplacesLegacyBareCommandEntriesWithQuoted` | D3/Edge Case 1: a directory instrumented by a pre-quoting daemon (bare entries on disk) ends up with exactly one quoted SessionStart entry, no bare survivor anywhere in the file bytes | pass |
| `internal/claudecode/settings_test.go` | `TestMergeSettings_QuotedExistingEntriesAreByteIdentical` | D4: re-merge over the quoted form is a true no-op, and the quoted entry is recognized (not duplicated) | pass |
| `internal/claudecode/settings_test.go` | `TestIsMusterEntry_RecognizesBothFormsForBothConfiguredPaths` (4 subtests: SessionStartCommand bare/quoted, StatusLineCommand bare/quoted) | R1: `isMusterEntry`'s command branch does all four comparisons, not just the one D3 exercises | pass |
| `internal/claudecode/settings_test.go` | `TestMergeSettings_ForeignCommandMatchingStatusLinePathOnSessionStartIsTreatedAsMusters` | Edge Case 4 end-to-end through `MergeSettings`: a SessionStart entry whose command equals `cfg.StatusLineCommand` is indistinguishable from Muster's own and gets replaced (documented, deliberate) | pass |
| `internal/claudecode/settings_test.go` | `TestIsMusterEntry_EmptyConfiguredPathNeverMatchesAnEmptyForeignCommand` | Implementation Notes' `p != ""` guard: an unset configured path must never eat a foreign entry with an empty command | pass |
| `internal/server/settings_shell_test.go` (new) | `TestWrapperScriptsShellRoundTrip` | D6/D6a/D6b/D6c/REQ-5: command strings extracted **verbatim** from a real `MergeSettings` output, run through real `sh -c` against a space-bearing data dir and a real `httptest` server — SessionStart binds `claude_session_id`, status line produces one `usage_sample` row and one routed `status_line` event | pass (skips cleanly if `curl`/`sh` absent from PATH, per Edge Case 7) |
| `test/canary/canary_test.go` | `TestCommandHookPathQuoting` | D9/REQ-8: six-row expectation table from the 2026-08-25 probe, skipped with `needsHarness` like its siblings | pass (skip) |

## Implementation Bugs

None found. `MergeSettings`/`isMusterEntry`/`shellQuote` behave exactly as REQ-1 through REQ-5 and R1 specify; the shell round-trip test proves the generated command strings actually execute correctly through a real `sh -c` against a space-bearing data dir.

## Notes for the reviewer

- **`claudecodetest.RawStatusLineFull`** was added (plan Implementation Notes explicitly authorizes this: "daemon-tests may add a `RawStatusLineFull` sibling in `claudecodetest`"). Implemented by extracting the existing `EnvelopedStatusLineFull`'s payload construction into a private `statusLineFullPayload` helper shared by both exported builders — no behavior change to `EnvelopedStatusLineFull` (verified: its own existing callers/tests still pass unmodified).
- **gofmt doc-comment smart-quote trap** (same one daemon-impl's Decisions log flagged): three of my new doc comments originally contained the literal `` `'\''` `` escape sequence directly above a `func`/`struct` declaration; `gofmt -w` silently rewrote it to a mangled `'\”` (verified byte-for-byte before/after with `grep`). Fixed by rewording those three comments to describe the four-character close-escape-reopen replacement in prose instead of a code span with adjacent quotes — `gofmt -l .` is clean after. This only affects comments; none of the actual test assertion strings (backtick-quoted Go string literals like `` `'/a'\''b'` ``) were touched, since gofmt's doc-comment pass only rewrites comments attached to declarations, not code.
- **D6 test design note**: both the SessionStart and status-line runs authenticate via the wrapper script's own `$MUSTER_SESSION` envelope injection (`resolveSessionID` trusts a present, known `musterSession` before falling back to claude-session-id binding), so the two runs in `TestWrapperScriptsShellRoundTrip` are independent — no ordering dependency between them, matching how a real freshly-launched session's first status-line post (which arrives before any prior binding) still routes correctly.
- One subtlety fixed during development: `event.type` isn't unique per `claude_session_id` in this test (the same claude id gets both a `SessionStart` and later a `status_line` row), so the status-line assertion queries `type = 'status_line' AND claude_session_id = ?` rather than an unqualified `SELECT type … WHERE claude_session_id = ?`, which was nondeterministic (SQLite returned whichever row happened to come back first, observed failing once during development with `expected: status_line, actual: SessionStart`). Documented in the test's own `statusLineEventSessionID`/`countStatusLineEventsForSession` helper comments.
- `TestWrapperScriptsShellRoundTrip` is not hermetic (shells out to real `curl`/`sh`, per Edge Case 7) — skips outright if either isn't on `PATH`. Ran green locally (macOS) both plain and under `go test -race`.

## Test Run Output

```
$ go build ./...
(clean)

$ go vet ./...
(clean)

$ gofmt -l .
(clean — no files listed)

$ make test
go test ./...
?   	github.com/Zalaras/muster/cmd/musterd	[no test files]
ok  	github.com/Zalaras/muster/internal/claudecode	(cached)
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/gitutil	(cached)
ok  	github.com/Zalaras/muster/internal/server	(cached)
ok  	github.com/Zalaras/muster/internal/session	(cached)
ok  	github.com/Zalaras/muster/internal/store	(cached)
ok  	github.com/Zalaras/muster/internal/termbridge	(cached)
ok  	github.com/Zalaras/muster/internal/tmux	(cached)
ok  	github.com/Zalaras/muster/internal/usage	(cached)
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]

$ make lint
golangci-lint run
0 issues.

$ go test -race ./...
(all ok, including internal/server 16.992s and internal/claudecode 1.755s)

$ go test -tags canary ./test/canary/... -run TestCommandHookPathQuoting -v
=== RUN   TestCommandHookPathQuoting
    canary_test.go:154: needs the M4 canary harness (scratch repo + capture server); inventory kept executable so it cannot drift from spikes/canary-fields.md
--- SKIP: TestCommandHookPathQuoting (0.00s)
PASS

Automated-checks grep gates (plan.md ```checks``` block, daemon-tests' portion):
D10 ! rg -n "hook_event_name" cmd/ internal/ --glob '!internal/claudecode/**'        -> exit 1 (clean)
D13 ! rg -n '"rate_limits"|...' cmd/ internal/ --glob '!internal/claudecode/**'       -> exit 1 (clean)
D7  ! rg -n "shellQuote|'\\''" cmd/ internal/server/                                  -> exit 1 (clean)
D9  rg -q "func TestCommandHookPathQuoting" test/canary/canary_test.go                -> PASS
```
