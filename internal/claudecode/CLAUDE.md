# internal/claudecode — the Claude Code adapter boundary

**Owns**: every Claude-Code-format fact: hook payload keys, status-line JSON, `settings.local.json` entries, CLI argv, version pinning, the theme config file, the Keychain token and the OAuth usage API. Output is neutral domain values (`StateInput`, `StatusUpdate`, `LaunchParams`). No session state, HTTP or tmux here. **Features**: ingest, canary, launch, theme, usage.

**Invariants** (violations are review-Critical):
- A Claude Code payload key or event name appears in this package and nowhere else; other packages' tests build wire bodies through `claudecodetest` (kb:adr/ingest-wire-shaped-fixtures-via-claudecodetest).
- Every hook Muster registers, SessionStart included, is a `type:"command"` wrapper (kb:adr/ingest-all-hooks-command-wrappers, kb:fact/sessionstart-not-over-http).
- Settings land in the project-scoped `.claude/settings.local.json`, never the user's files (kb:adr/launch-settings-local-json-not-settings-json, kb:adr/launch-project-scoped-settings-not-config-dir).
- Shell quoting happens at the write boundary (kb:adr/ingest-shell-quote-at-write-boundary, kb:fact/hook-commands-are-shell-lines).
- Subprocesses run through the injectable `execFunc`; no test executes the real `security` or `claude` binary.
- Hook timeout is 2 s, never 5.

**Exemplar**: `status.go` — private wire structs, one `Interpret*` function, neutral exported types.

**Gotchas**:
- The status line's model is an object; SessionStart's is a bare string (kb:fact/status-model-is-object, kb:fact/sessionstart-model-optional-string).
- `rate_limits` is absent and context percentages are null before the first API response: unknown, not zero (kb:fact/unknown-before-first-response).
- `refreshInterval` is seconds (kb:fact/refresh-interval-seconds).
- `CLAUDE_CONFIG_DIR` breaks subscription OAuth (kb:fact/config-dir-breaks-oauth).
- A measured shape beats the official docs; record a new one as a fact before coding against it.

<!-- kb:trailer -->
<!-- kb:hash 0e0b1f74a3b8bca7 -->
- **canary** — The verified Claude Code version range, canary tiers, and the fragments tools/versions regenerates. → `docs/features/canary/INDEX.md`
- **ingest** — Hook and status-line ingest endpoints, the envelope that binds an event to a Muster session, seq assigned at ingest. → `docs/features/ingest/INDEX.md`
- **launch** — Launch dialog, repo browse and picker, trust prompt, project-scoped settings write, the claude argv. → `docs/features/launch/INDEX.md`
- **theme** — Muster theme preference and the Claude theme family poll. → `docs/features/theme/INDEX.md`
- **usage** — Masthead usage bars, per-model weekly bar, per-session context gauge, usage poll and Keychain read. → `docs/features/usage/INDEX.md`
- 56 records name files in this directory: `go run ./tools/kb for <path>` lists them for one file.
<!-- /kb:trailer -->
