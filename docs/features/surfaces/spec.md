---
id: surfaces
type: spec
status: active
date: 2026-09-12
summary: PTY bridge, xterm pane, the ephemeral shell surface, sizing, one live client per target.
features: [surfaces]
tags: [tmux]
go: [internal/server/terminal*.go, internal/server/shells*.go, internal/server/plainshell_test.go, internal/server/settings_shell_test.go, internal/termbridge/**, internal/tmux/**]
web: [web/src/features/surfaces.ts, web/src/terminal/**]
e2e: [web/e2e/terminal.spec.ts, web/e2e/shell.spec.ts, web/e2e/plain-shell.spec.ts, web/e2e/helpers/terminal.ts, web/e2e/helpers/shell.ts]
protocol: [terminal.ws, terminal.shell-ws, sessions.shell]
refs: [kb:adr/surfaces-shared-attach-single-pty, kb:adr/surfaces-one-live-client-per-session, kb:adr/surfaces-one-live-client-per-attach-target, kb:adr/surfaces-one-tmux-session-per-session, kb:adr/surfaces-scrollback-affordance-not-built, kb:adr/surfaces-scroll-speed-via-launch-env, kb:adr/surfaces-shell-is-attach-target-not-session, kb:adr/surfaces-shell-spawn-http-then-attach-ws, kb:adr/surfaces-shell-lifetime-until-exit-remove-or-reconcile, kb:adr/surfaces-shell-pane-carries-no-session-env, kb:adr/surfaces-shell-control-in-tile-footer, kb:adr/surfaces-tmux-preflight-at-startup, kb:adr/surfaces-detach-on-destroy-on, kb:adr/theme-terminal-ground-follows-claude-family, kb:adr/stack-terminal-rendering-xterm-js, kb:fact/scroll-speed-env-present, docs/design/design-system.md]
---
A surface is a live, interactive terminal embedded in the dashboard: view output, click,
type and prompt. Sessions run inside tmux on a dedicated socket, one tmux session per
Muster session (kb:adr/surfaces-one-tmux-session-per-session); tmux is a hard dependency
checked before the daemon listens (kb:adr/surfaces-tmux-preflight-at-startup).

## The bridge

A surface opens `kb:anchor/terminal.ws`. The daemon attaches one PTY to the session's tmux
session and streams raw bytes both ways; xterm.js renders them verbatim
(kb:adr/stack-terminal-rendering-xterm-js). The dashboard restyles nothing inside the pane;
only the frame's ground and foreground follow the theme family Claude Code itself draws
for, in every Muster theme (kb:adr/theme-terminal-ground-follows-claude-family). tmux owns
scrollback, so xterm keeps none and no scroll affordance is built
(kb:adr/surfaces-scrollback-affordance-not-built); wheel speed inside Claude Code is set
through an environment variable in the launch env (kb:adr/surfaces-scroll-speed-via-launch-env,
kb:fact/scroll-speed-env-present).

## Sizing and the one-live-client law

The client sends a resize frame on open and then debounced; the daemon applies the PTY
size and then resizes the tmux window, never the pane-level primitive
(kb:adr/surfaces-shared-attach-single-pty). A session is live on exactly one surface at one
geometry at a time; every other rendering is a static snapshot
(kb:adr/surfaces-one-live-client-per-session). The daemon enforces it per attach target: a
new socket for the same target supersedes the old one, which closes with the superseded
code and shows a click-to-reclaim overlay rather than reconnecting. Geometry ownership moves
with the socket, which is how view switching resizes only the sessions whose live surface
changed (docs/design/design-system.md "Terminal rules"). A PTY end closes the socket with
the pane-ended code and nudges liveness. Attaching to a dead session is refused. The
surface manager in the dashboard is the only place a terminal is constructed or disposed,
and never for a dead session.

## The shell surface

A session may carry a plain shell as a second attach target, switched by a `claude | shell`
segment in the mainhead and in a tile's footer (kb:adr/surfaces-shell-control-in-tile-footer).
The shell is spawned lazily by `kb:anchor/sessions.shell` and attached over
`kb:anchor/terminal.shell-ws`, which never spawns, so a spawn failure has a body the
dashboard can render (kb:adr/surfaces-shell-spawn-http-then-attach-ws). It runs the user's
interactive shell in the session's directory with no Muster session environment, so a
nested `claude` cannot drive the parent's state (kb:adr/surfaces-shell-pane-carries-no-session-env).
A shell is not a session: no row, card, state or wire kind
(kb:adr/surfaces-shell-is-attach-target-not-session). It outlives End and view switches, can
open on a dead session, and dies on exit, Remove or reconcile
(kb:adr/surfaces-shell-lifetime-until-exit-remove-or-reconcile). The Claude socket and the
shell socket of one session never supersede each other
(kb:adr/surfaces-one-live-client-per-attach-target). A shell's exit does not touch the
session's liveness. A running shell shows a pip with its own token.

## Does not

Surfaces never read terminal content as state, never open a live client for a rail card or
strip card, and never restyle Claude Code's TUI.
