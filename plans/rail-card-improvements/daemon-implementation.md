# Daemon Implementation: Rail Card Improvements

**Plan**: rail-card-improvements
**Mode**: initial
**Pack**: `kb:pack plan=rail-card-improvements role=daemon-impl` — 23289 words (WARN exceeds 8000-word budget); sections: rules 1234, features 7327, decisions 8343, facts 4111, lessons 2266, runbooks 2

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/store/migrations/0009_rail_cards.sql` | created | Two additive `ALTER TABLE` statements: `session.unread INTEGER NOT NULL DEFAULT 0`, `session.last_prompt TEXT`. |
| `internal/store/session.go` | modified | `SessionRow.Unread`/`LastPrompt`; `InsertSession` writes `0, NULL` explicitly; `UpdateSession`'s SET clause and args; `sessionColumns`/`scanSession` read both columns. |
| `internal/session/session.go` | modified | `Session.Unread bool`, `Session.LastPrompt *string`; `setState` now clears `Unread` whenever `next != StateIdle` — the single place every `applyInput` arm routes through, so INV `Unread ⇒ idle` can't be stranded by any arm. |
| `internal/session/machine.go` | modified | `KindTurnActivity` stores the truncated prompt (`truncate(*input.Prompt, 200)`) when `input.Prompt != nil`, after the straggler early-return; `applyBind`'s clear-rebind branch nils `LastPrompt`; reworded the line-71 comment ("the preceding turn-activity event") to keep D4's adapter-boundary grep clean. |
| `internal/session/manager.go` | modified | New `Watcher` interface (`Watched(sessionID int64) bool`) and `Config.Watcher`/`Manager.watcher` field, nil-safe (counts as unwatched); `Apply` sets `sess.Unread = watcher==nil \|\| !watcher.Watched(id)` after `applyInput` returns, only for `KindTurnClosed`; new `MarkSeen(ctx, id)` clears `Unread` and persists+broadcasts only when it was true; `rowToSession`/`sessionToRow` map both new fields. |
| `internal/claudecode/interpret.go` | modified | `StateInput.Prompt *string`; split the old shared `"UserPromptSubmit", "PreToolUse", "PostToolUse"` case so only `UserPromptSubmit` reads `prompt` and sets `Prompt` (nil when absent or prefixed with the measured `<task-notification>` background-completion tag); the two tool-use cases are unchanged and never set `Prompt`. |
| `internal/server/sessionwire.go` | modified | `sessionWire.Unread bool`/`LastPrompt *string` (both required keys); `toWireSession` copies them straight from the domain `Session`. |
| `internal/server/terminal.go` | modified | `terminalRegistry.Watched(sessionID int64) bool` (exported — see Decisions) satisfies `session.Watcher`; `handleTerminal` calls `f.manager.MarkSeen(r.Context(), id)` right after a successful takeover, before the pump goroutines start (so before any PTY byte is forwarded). |
| `internal/server/shells.go` | modified | Same `MarkSeen` call in `handleShellTerminal`, after a successful shell takeover. |
| `internal/server/prefs.go` | modified | `defaultRailDensity`/`defaultRailActivity` constants; `validRailDensity`/`validRailActivity`; `prefsRequest`/`storedPrefs` gain both fields; `defaultPrefs()`/`loadPrefs()` set and validate them (out-of-enum stored value silently falls back to the default, same as every other pref); two new `prefsFields` rows with the plan's exact `railDensity` error message and an analogous `railActivity` one; the "at least one of" message lists both new fields. |
| `internal/server/state.go` | modified | `PrefsInfo.RailDensity`/`RailActivity string` fields and doc comment. |
| `internal/server/server.go` | modified | `terminals := newTerminalRegistry()` moved above `session.NewManager(...)` and passed as `session.Config.Watcher: terminals` — composition-root wiring only. |

## Decisions

- The plan's Affected Files section names the terminal-registry method `terminalRegistry.watched(sessionID int64) bool` (lowercase). Go interface satisfaction requires the exact identifier, and since `session.Watcher` (defined in `internal/session`) declares the exported method `Watched`, a type in a different package (`internal/server`) can only satisfy it with an identically-spelled exported `Watched` — an unexported `watched` in `internal/server` would be a *different* qualified method name per the Go spec and would not satisfy the interface at all (confirmed: `go build ./...` only succeeds with the capitalized name; a lowercase attempt fails `*terminalRegistry does not implement session.Watcher`). Implemented as `Watched`, treated as a spelling correction of the plan's prose, not a deviation from REQ-8's actual port shape (`Watcher.Watched(sessionID) bool`, which the plan's own Requirements section already states with the capital).
- No other departures from the plan's daemon-side Requirements, Protocol Contract, or Affected Files.

## Handoff

**Build status**: `go build ./...` exits 0.

Verification run:
```
$ go build ./...
$ go vet ./...
$ gofmt -l .          # clean
$ make lint           # golangci-lint run — 0 issues
$ golangci-lint run --tests=false ./...
internal/server/issue.go:541  buildIssueSnapshot unused
internal/server/prefs.go:192  loadPrefs unused
2 issues: unused: 2
```
Both `--tests=false` findings are pre-existing test-facing delegators (`(*Server).loadPrefs` at `internal/server/prefs.go:192`, unchanged by this plan beyond line-shift; `(*Server).buildIssueSnapshot` in a file this plan never touches) that are only reachable from `*_test.go` files — not introduced or affected by this work. `make lint` (which includes test files) reports 0 issues, confirming production code plus tests is clean.

`rg -n "UserPromptSubmit|last_assistant_message|task-notification" internal/session internal/server internal/store --glob '!*_test.go'` — D4's own check command — exits 1 (no matches).

`python3 .claude/skills/orchestrate/scripts/dead-refs.py` — 939 references checked, 7 missing, all pre-existing `.claude/settings.local.json` path references unrelated to this diff (that file is gitignored by design).

`go test -run NONE ./...` — every package (including test files) compiles; no web-impl test files were touched or need repair from the daemon side.

No test files needed changes. Nothing to hand off to the test agent.
