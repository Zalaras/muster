# test — canary suite and probe rig

**Owns**: `test/canary/`, the build-tagged suite driving the installed real `claude` through the production settings, shell, wrapper and enveloped-POST chain; `test/rig/`, the interface-probe rig (`capture` server, `failproxy` and its `failapi` response, `newprobe.sh`, captures). Unit and E2E tests live elsewhere. **Features**: canary.

**Invariants** (violations are review-Critical):
- Haiku only, trivial prompts, session killed on exit; `harness_test.go` and `harness_turns_test.go` perform runs A–J once per process and every test is a view over them (kb:adr/canary-drives-installed-claude-through-production-chain).
- Payload bodies stay in memory; failure messages carry event names and key lists only.
- `~/.claude/settings.json` is never read or written; the scratch repo lives under `os.MkdirTemp`, outside `~/Documents`.
- tmux only on the harness's own socket path, killed on exit (kb:lesson/probe-tmux-sockets-left-in-shared-dir).
- The live tier fails, never skips, on a missing credential (kb:adr/canary-live-tier-fails-never-skips); the harness skips only when installed equals the verified ceiling (kb:adr/canary-skips-on-ceiling-bump-extends-record).
- Wire-format questions go through `/interface-probe` and the rig, findings to `docs/facts/` (kb:adr/process-interface-probe-rig-in-repo).

**Exemplar**: `test/canary/skip_test.go` — a pure decision table; copy this shape for a zero-token assertion. New probe: `test/rig/newprobe.sh <index>`.

**Gotchas**:
- `CLAUDE_CONFIG_DIR` breaks subscription OAuth; only the zero-token unauthenticated sweep uses it (kb:fact/config-dir-breaks-oauth).
- Headless `claude -p` fires the full hook sequence; hook probes need no tmux (kb:fact/headless-fires-full-hook-sequence).
- The trust prompt preselects "No, exit" on 2.1.259+; the harness moves the marker before Enter (kb:fact/trust-prompt-preselects-exit).
- Probe instances live in `/tmp/muster-probe`; a scratch repo under `~/Documents` inherits every parent `CLAUDE.md`.
- `MUSTER_CANARY_OFFLINE=1` always wins over `MUSTER_CANARY_FORCE=1`.
- The canary's settings are production plus exactly one key: `statusLine.refreshInterval`, which `MergeSettings` never writes (kb:adr/canary-refresh-interval-key-canary-only).
- Run D holds **two** claude sessions — `/clear` mints a second in the same pane — so status-line views filter on `preClearClaudeID()` (kb:adr/canary-run-d-holds-two-claude-sessions).
- `failproxy` never logs request headers, and `failapi` (which it and the canary's fail server share) never reads them: they carry a live OAuth token.
- Four runs depart from production, each covered by an ADR: G appends `--allowedTools Bash` to the argv, I and J set `ANTHROPIC_BASE_URL` + `CLAUDE_CODE_MAX_RETRIES=0`, and the capture server holds run H's `PostToolUse` replies for 1.5 s.

<!-- kb:trailer -->
<!-- kb:hash d5e232bb5221554c -->
- **canary** — The verified Claude Code version range, canary tiers, and the fragments tools/versions regenerates. → `docs/features/canary/INDEX.md`
- 19 records name files in this directory: `go run ./tools/kb for <path>` lists them for one file.
<!-- /kb:trailer -->
