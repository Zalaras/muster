---
id: surfaces
type: spec
status: active
date: 2026-09-12
summary: PTY bridge, xterm pane, the ephemeral shell surface, sizing, one live client per target.
features: [surfaces]
tags: [tmux]
go: [internal/server/terminal*.go, internal/server/shells*.go, internal/server/shellactivity*.go, internal/server/shellregistry*.go, internal/server/plainshell_test.go, internal/server/settings_shell_test.go, internal/termbridge/**, internal/tmux/**, internal/tty/**]
web: [web/src/features/surfaces*.ts, web/src/terminal/notice*.ts, web/src/terminal/overlay*.ts, web/src/terminal/pane*.ts, web/src/terminal/shell*.ts, web/src/terminal/surfaceswitch*.ts, web/src/render/surfaceseg*.ts, web/src/render/terminalspanel*.ts, web/src/features/terminalspanel*.ts, web/src/terminal/terminals*.ts, web/render/helpers/surfaces.ts, web/render/surfaces.spec.ts, web/render/helpers/terminals.ts, web/render/terminals.spec.ts]
e2e: [web/e2e/terminal.spec.ts, web/e2e/shell.spec.ts, web/e2e/plain-shell.spec.ts, web/e2e/shell-activity.spec.ts, web/e2e/shell-keys.spec.ts, web/e2e/shell-scroll.spec.ts, web/e2e/terminals.spec.ts, web/e2e/helpers/terminal.ts, web/e2e/helpers/shell.ts, web/e2e/helpers/terminals.ts, web/e2e/helpers/shellinput.ts]
protocol: [terminal.ws, terminal.shell-ws, sessions.shell, ws.shell-activity]
refs: [kb:adr/surfaces-shared-attach-single-pty, kb:adr/surfaces-one-live-client-per-session, kb:adr/surfaces-one-live-client-per-attach-target, kb:adr/surfaces-one-tmux-session-per-session, kb:adr/surfaces-scrollback-affordance-claude-pane-only, kb:adr/surfaces-scroll-speed-via-launch-env, kb:adr/surfaces-shell-is-attach-target-not-session, kb:adr/surfaces-shell-spawn-http-then-attach-ws, kb:adr/surfaces-shell-dies-at-kill-shutdown-too, kb:adr/surfaces-shell-pane-carries-no-session-env, kb:adr/surfaces-shell-control-in-tile-footer, kb:adr/surfaces-tmux-preflight-at-startup, kb:adr/surfaces-detach-on-destroy-on, kb:adr/surfaces-shell-scroll-via-daemon-copy-mode, kb:adr/surfaces-shell-busy-from-tmux-process-state, kb:adr/surfaces-snapshot-restored-tick-always-self-clears, kb:adr/theme-terminal-ground-follows-claude-family, kb:adr/stack-terminal-rendering-xterm-js, kb:fact/scroll-speed-env-present, docs/design/design-system.md]
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
scrollback, so xterm keeps none; no scroll affordance is built for the Claude pane
(kb:adr/surfaces-scrollback-affordance-claude-pane-only) — the shell surface, below, gets
one. Wheel speed inside Claude Code is set through an environment variable in the launch
env (kb:adr/surfaces-scroll-speed-via-launch-env, kb:fact/scroll-speed-env-present).

## Sizing and the one-live-client law

The client sends its first resize frame on open once the surface has a layout (a shell kept behind Docs sends none until mounted), then debounced; the daemon applies the PTY
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

A session may carry several plain shells, its terminals, each its own attach target, switched by a
`claude | shell | ▾ | docs` segment in the mainhead and in a tile's footer
(kb:adr/surfaces-shell-control-in-tile-footer). `shell` shows the terminal last shown, starting one
when none is running; ▾ opens a Terminals panel listing each running terminal by name, running or
idle, with the one on screen marked, a rename, a close, and New terminal. The `shell` segment always
reads `shell`; a count beside it shows once two or more terminals run, and its tooltip names the
terminal on screen. A new terminal is named `shell N`, the lowest number free in its session, until
renamed; a name lasts as long as its terminal. When the terminal on screen ends, the
lowest-numbered running terminal of the session takes its place, or claude when none is left.
While the diff viewer is open no segment of the surface switch is selected; choosing a segment, or
picking or creating a terminal from the Terminals panel, closes the viewer and shows that surface;
opening the panel, or renaming or closing a terminal from it, leaves the viewer open; closing the
viewer any other way returns to the surface that was selected (kb:spec/diff).
A window ignores a terminals list older than a spawn, close or rename reply it has already acted
on, so a late list never undoes one.
A terminal is spawned lazily by `kb:anchor/sessions.shell` and attached over
`kb:anchor/terminal.shell-ws`, which never spawns, so a spawn failure has a body the
dashboard can render — a fixed-phrase message, with the raw tmux/OS error in the daemon
log only (kb:adr/surfaces-shell-spawn-http-then-attach-ws). It runs the user's
interactive shell in the session's directory with no Muster session environment, whatever
environment the daemon was started in (the tmux client strips `MUSTER_SESSION` from every
command it runs, so the server whose global environment each pane inherits never holds the
daemon's own), so a nested `claude` cannot drive the parent's state (kb:adr/surfaces-shell-pane-carries-no-session-env).
A shell is not a session: no row, card, state or wire kind
(kb:adr/surfaces-shell-is-attach-target-not-session). It outlives End and view switches, can
open on a dead session, and dies on exit, Remove, reconcile or a kill shutdown
(kb:adr/surfaces-shell-dies-at-kill-shutdown-too). The Claude socket and the
shell socket of one session never supersede each other
(kb:adr/surfaces-one-live-client-per-attach-target). A shell's exit does not touch the
session's liveness. The wheel over the shell surface scrolls the pane's tmux history: the
client sends a `scroll` control frame that the daemon turns into tmux copy-mode commands,
and tmux mouse mode stays off throughout so browser drag-to-select keeps working
(kb:adr/surfaces-shell-scroll-via-daemon-copy-mode). Option+Arrow and Cmd+Arrow are
translated to their readline word- and line-jump equivalents on the shell surface only;
the Claude pane keeps xterm.js's own handling. A shell reports a busy flag derived from
three tmux-read gates — its foreground command, its alternate-screen flag, and the pane
tty's line discipline — and the shell segment's spinner and tick follow any of the session's terminals (the
panel shows which one is busy): a spinner while one is busy and a tick once work finishes; under `prefers-reduced-motion: reduce` the spinner stands still, keeping its busy shape (kb:adr/surfaces-shell-busy-from-tmux-process-state).

Switching a session's surface from the Focus header or a tile footer, by pointer or keyboard,
moves keyboard focus into the surface switched to: the terminal for claude and shell (the
shell's once its spawn resolves), the reader's body for docs. It does not take focus back
from somewhere the developer moved it meanwhile, and a claude switch on an ended session has
no terminal to take it.

## Does not

Surfaces never read terminal content as state, never open a live client for a rail card or
strip card, and never restyle Claude Code's TUI.
