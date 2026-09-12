# test — canary suite and probe rig

**Owns**: `test/canary/`, the build-tagged suite driving the installed real `claude` through the production settings, shell, wrapper and enveloped-POST chain; `test/rig/`, the interface-probe rig (`capture` server, `failproxy`, `newprobe.sh`, captures). Unit and E2E tests live elsewhere. **Features**: canary.

**Invariants** (violations are review-Critical):
- Haiku only, trivial prompts, session killed on exit; `harness_test.go` performs runs A–E once per process and every test is a view over them (kb:adr/canary-drives-installed-claude-through-production-chain).
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
- `failproxy` never logs request headers; they carry a live OAuth token.

<!-- kb:trailer -->
<!-- kb:hash 6569b8b8a93cf871 -->
- **canary** — The verified Claude Code version range, canary tiers, and the fragments tools/versions regenerates. → `docs/features/canary/INDEX.md`
- 14 records name files in this directory: `go run ./tools/kb for <path>` lists them for one file.
<!-- /kb:trailer -->
