---
id: surfaces-shell-scroll-via-daemon-copy-mode
type: decision
status: accepted
date: 2026-09-22
summary: The wheel on a shell surface is a control frame the daemon turns into tmux copy-mode commands; tmux mouse mode stays off, so drag-to-select keeps working.
features: [surfaces]
tags: [ux, tmux]
files: [internal/tmux/tmux.go, internal/server/terminal.go, web/src/terminal/pane.ts]
tests: []
refs: [plan:terminal-fixes-cleanup, kb:adr/surfaces-scrollback-affordance-not-built, kb:adr/surfaces-scrollback-affordance-claude-pane-only, kb:adr/surfaces-one-live-client-per-attach-target, docs/design/design-system.md, "#45"]
supersedes: []
---
**Context.** The wheel over a plain shell cycled command history instead of scrolling. xterm.js falls back to emitting cursor keys whenever the active buffer has no scrollback, and `scrollback: 0` makes that always. Raising it cannot help: `tmux attach-session` emits the alternate-screen switch, so the browser terminal is always on the alternate buffer. The only real buffer is tmux's pane history, which a plain shell — unlike a Claude pane — genuinely fills.

**Options.** (A) tmux `mouse on` for the shell's own tmux session. (B) Keep `mouse off` and inject SGR mouse sequences as PTY input. (C) Keep `mouse off` and have the daemon drive copy-mode, with the wheel carried as a control frame on the shell socket. Measurements: `spikes/S7-shell-surface-inputs.md` §3.

**Decision.** C. A scrolls, but once tmux requests mouse tracking xterm.js hands every mousedown to the application, so drag-to-select becomes Option+drag — the developer's constraint was explicit that scrolling must not cost highlighting. B is measured dead: tmux swallows injected mouse bytes. C was measured end to end — `copy-mode -e` then `send-keys -X -N <n> scroll-up`, one round trip per gesture, auto-exit at the bottom, clamping at the top, and no mouse-tracking enable ever emitted.

**Consequences.** tmux `mouse` must stay `off` everywhere; turning it on for any pane silently reintroduces the selection loss this decision exists to avoid. Input writes cancel copy-mode first (`send-keys -X cancel`), so typing while scrolled back reaches the shell and returns it to the live bottom. The shell socket now carries one client→server text frame the Claude socket does not.
