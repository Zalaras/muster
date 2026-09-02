# Daemon Implementation: new-ui-design-colors

**Plan**: new-ui-design-colors
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/claudecode/theme.go` | created | `DefaultConfigPath`, `ThemeFamily` + constants, `ReadThemeFamily` (REQ-13). Only place the config file's name/key appear. |
| `internal/claudecode/doc.go` | modified | One-line addition to the package's Claude-format-knowledge inventory, naming theme.go's role (no filename leak — doc.go lives inside the boundary package). |
| `internal/server/themepoll.go` | created | `themePoller`: Start/Stop/loop/tick modelled on `usagepoll.go`, mutex-held `Current()`, change-only broadcast, 250 ms torn-write retry guard (REQ-14). Also defines `claudeThemeMessage` (the flat `{"type":"claudeTheme","family":"…"}` WS envelope, §5.6). |
| `internal/server/state.go` | modified | `Snapshot.ClaudeTheme ClaudeThemeInfo`; `PrefsInfo.Theme string`; `buildSnapshot` defaults `claudeTheme.family` to `"unknown"`; `currentSnapshot` fills it from `s.themePoller.Current()` (or leaves default when nil). |
| `internal/server/prefs.go` | modified | `prefsRequest.Theme *string`; `validTheme`/`validThemePattern` (`^[a-z][a-z0-9-]{0,31}$`); `defaultTheme = "follow"`; `defaultPrefs`/`loadPrefs`/`handlePutPrefs` all extended; the "at least one field" 400 now counts `theme`; 400 message matches the plan's exact wording. |
| `internal/server/server.go` | modified | `Config.ClaudeThemePoll time.Duration`, `Config.ClaudeConfigFile string`; `Server.themePoller *themePoller` (nil when `ClaudeThemePoll <= 0`); constructed next to the usage poller; `Start`/`Shutdown` call its `Start`/`Stop`. |
| `cmd/musterd/main.go` | modified | Flags `-claude-theme-poll` (default `10s`) and `-claude-config-file` (default `claudecode.DefaultConfigPath()`, falling back to `""` on error); wired into `server.Config`. |

## Decisions

- **Measured the config file and key against the real, installed pinned binary** (`/Users/damian/.local/share/claude/versions/2.1.258`, `claude --version` → `2.1.258`), per the team lead's explicit ask, read-only:
  - Damian's live `~/.claude.json` has every other top-level scalar key the plan's Edge Case 2 implies ("Damian's own file has no key today") but no `"theme"` key — confirms the "key absent" edge case directly against real data.
  - `strings -a` on the installed binary surfaces `S5t=["apiKeyHelper","installMethod","autoUpdates",...,"theme","verbose",...]` — a top-level settings-key list matching the shape of `~/.claude.json`'s own scalar keys — and multiple call sites `resolveSetting("theme","dark")` / `vo("theme","dark").value` / `iL("theme", g, n.storageV5)`, confirming the key name is the literal string `"theme"` and Claude Code's own default (when absent) is `"dark"`.
  - The binary's own value enum: `TTn=["dark","light","light-daltonized","dark-daltonized","light-ansi","dark-ansi"]`, and its own family test is `ISt(r){return r.startsWith("light")}` — this is byte-for-byte the same "prefix light/dark, else unknown" mapping REQ-13 specifies, so `ReadThemeFamily`'s switch was implemented exactly as measured, not re-derived from the plan text alone.
  - **This resolves the fixture-vs-plan concern the team lead flagged**: `web/e2e/helpers/theme.ts`'s placeholder JSON key `"theme"` (test-specs.md line 64, "a best-effort placeholder") is the *correct* key — no mismatch to escalate. `theme.go`'s decode struct tag is `json:"theme"` on the single field `Theme *string`, on a config type named `claudeConfig`. e2e-specs can drop the "best-effort" caveat and confirm the fixture as final.
- **`themePoller.tick`'s torn-write retry compares against `Current()` (the previously *broadcast* family), not the previous tick's raw read.** This matches D11's two-branch wording exactly: a lone `Unknown` read that self-heals on the 250 ms retry produces no state change and no broadcast; two `Unknown` reads in the same tick (initial + retry) do change `Current()` and do broadcast. The guard only fires when `Current()` is already a known family — a poller that's already `Unknown` never waits 250 ms for nothing.
- **`claudeThemeMessage` lives in `themepoll.go`, not `state.go`.** Followed the codebase's existing pattern (`usageMessage` next to `usagepoll.go`'s producer via `usagewire.go`, `sessionUpsertMessage` next to its producer in `sessionwire.go`) — the message type sits with the code that constructs and broadcasts it.

## Handoff

**Build status**: `go build ./...` exits 0.
`go vet ./...` clean. `golangci-lint run ./...` and `golangci-lint run --tests=false ./...` both report 0 issues.

**Pre-existing pinned-shape tests now fail** (`go test ./internal/server/...`), because they assert the pre-plan wire shape and the plan's approved Protocol Contract adds `theme`/`claudeTheme` fields that must render (no `omitempty`, per the "explicit-null/no key omission" rule for an approved contract delta):
- `internal/server/prefs_test.go:126` `TestHandlePutPrefs_PersistsToKVUnderOneJSONKey` — asserts a 4-key persisted prefs blob; now 5 keys (`theme` added).
- `internal/server/prefs_test.go:387` `TestHandlePutPrefs_UsageModelPersistsToKVAlongsideViewAndDensity` — same shape assumption.
- `internal/server/state_test.go:13` `TestBuildSnapshot_M0Shape` — asserts the M0 snapshot has exactly 3 top-level keys (`sessions`/`usage`/`prefs`) and a 4-key prefs object; the real snapshot now also carries `claudeTheme` and a 5-key prefs object.

These are sanctioned breakage per the plan's approved Protocol Contract (§3.3/§5.2 deltas, already merged into `docs/protocol.md`) — not something I'm permitted to fix (test files are the daemon-tests agent's). All three need their expected JSON updated to include `"theme":"follow"` in `prefs` and (for the state test) a `"claudeTheme":{"family":"unknown"}` top-level key.

No import-path fixes were needed — every existing test file still compiles as-is (`go build ./...` covers production code; a full `go vet ./...` and a `go test ./... -run NONEXISTENT` typecheck-only pass both succeeded across every package, confirmed 2026-09-02).
