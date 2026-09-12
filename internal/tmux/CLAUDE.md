# internal/tmux — tmux CLI on a dedicated socket

**Owns**: the `Client` that runs tmux against one socket (`-L` name or `-S` path), session and window lifecycle, pane liveness, capture, sizing, server options and the startup `Preflight`. `tmuxtest` hands tests a per-test socket under the sun_path limit. **Features**: surfaces.

**Invariants** (violations are review-Critical):
- Never the user's default server: every command carries the socket flag (kb:adr/stack-terminal-backing-tmux).
- One tmux session per Muster session, named `muster-<id>`, one window (kb:adr/surfaces-one-tmux-session-per-session, kb:adr/surfaces-one-window-per-session).
- Sizing drives `pty.Setsize` and `resize-window` together; never `resize-pane` (kb:adr/surfaces-shared-attach-single-pty, kb:lesson/resize-pane-silent-noop).
- `detach-on-destroy` is on (kb:adr/surfaces-detach-on-destroy-on, kb:lesson/detach-on-destroy-misrouted-keystrokes).
- `CapturePane` output is display only and may hold prompt text: never a state source, never logged (kb:adr/actions-pane-snapshot-display-only).
- Preflight is bounded and version-aware: missing or broken tmux is fatal, an unrecognised version warns (kb:adr/surfaces-tmux-preflight-at-startup, kb:adr/surfaces-unrecognised-tmux-version-warns).
- Subprocess seams are function fields; real tmux appears only where the assertion is a tmux-observable effect.

**Exemplar**: `preflight.go` — `lookPath`/`run` seams, a bounded `WaitDelay`, canned-result tests.

**Gotchas**:
- A `-S` path above 103 bytes fails deep inside tmux with "File name too long"; `ValidateSocket` and `tmuxtest.Socket` guard it. Named sockets are not length-checked.
- The shell pane carries no session env; a nested Claude Code there fires unrouted hooks (kb:adr/surfaces-shell-pane-carries-no-session-env).
- Probes use `-S` in a scratch dir and `kill-server` (kb:lesson/probe-tmux-sockets-left-in-shared-dir).

<!-- kb:trailer -->
<!-- kb:hash 47a01b5985c36214 -->
- **surfaces** — PTY bridge, xterm pane, the ephemeral shell surface, sizing, one live client per target. → `docs/features/surfaces/INDEX.md`
- 12 records name files in this directory: `go run ./tools/kb for <path>` lists them for one file.
<!-- /kb:trailer -->
