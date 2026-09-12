# cmd/musterd — daemon entry point, wiring only

**Owns**: flag parsing, the startup order (tmux preflight, data dir, store, tokens, server, listener, update check, browser open) and shutdown (on-exit policy, in-place re-exec). Logic lives in `internal/`; this package renders results and wires packages together. **Features**: connection.

**Invariants** (violations are review-Critical):
- tmux preflight runs before the data dir or listener exists; a broken tmux is fatal with the remedy on stderr (kb:adr/surfaces-tmux-preflight-at-startup).
- A build with no embedded dashboard and no disk override exits non-zero naming both remedies (kb:adr/connection-missing-web-build-fails-fast).
- The installed Claude Code is classified, never refused (kb:adr/connection-installed-claude-classified-never-refused).
- Shutdown leaves sessions running unless the on-exit flag says otherwise (kb:adr/lifecycle-shutdown-leaves-sessions-running).
- The browser opens only when stdin is a real terminal; that condition, not a flag, keeps tests browser-free (kb:adr/connection-dashboard-auto-opens-on-terminal).
- `run()` returns an `errRestart` sentinel; only `main` calls `syscall.Exec`. Tests never replace their own process image.

**Exemplar**: `preflight.go` — a thin renderer over an injected `func(ctx) Result`; copy this shape for any new startup step.

**Gotchas**:
- `tokens.json` is rewritten and re-chmodded 0600 on every startup; the data dir is 0700.
- An empty update base URL disables checking and apply; every test daemon sets it (kb:adr/update-check-runs-in-daemon-daily).
- One stub executable per test run, never per daemon (kb:lesson/first-exec-of-fresh-script-costs-270ms).
- Wait bounds clear the sanctioned blocking total with the arithmetic written down (kb:lesson/wait-bound-below-sanctioned-blocking).
- Run `golangci-lint --tests=false` too while a test file is broken (kb:lesson/sanctioned-test-break-blinds-lint).

<!-- kb:trailer -->
<!-- kb:hash 51b903d6453cfc89 -->
- **connection** — Token and cookie auth, the /ws hello and snapshot, protocol version, connection banner, Claude version readout. → `docs/features/connection/INDEX.md`
- 20 records name files in this directory: `go run ./tools/kb for <path>` lists them for one file.
<!-- /kb:trailer -->
