---
id: surfaces-shared-attach-single-pty
type: decision
status: accepted
date: 2026-08-16
summary: Display is one daemon-owned PTY attached to tmux and fanned out; sizing drives both pty.Setsize and resize-window, never resize-pane or capture-pane polling.
features: [surfaces]
tags: [tmux]
files: [internal/termbridge/termbridge.go, internal/tmux/tmux.go, web/src/terminal/pane.ts]
tests: [TestBridge_Resize_AppliesPtySetsizeThenTmuxResizeWindow, TestResizeWindowAndDisplayVar_RoundTripTheRequestedGeometry, web/e2e/terminal.spec.ts]
refs: [docs/history/spec-changelog.md, spikes/FINDINGS.md, kb:anchor/terminal.ws, kb:adr/surfaces-one-live-client-per-session]
supersedes: []
---
**Context.** The research handoff assumed the dashboard would poll capture-pane and maybe fall back to control mode, and named resize-pane as the sizing primitive. The spike falsified both: the pane primitive exits zero and does nothing on a single-pane window, and tmux sizes a session to its smallest attached client.

**Options.** For display: (A) poll capture-pane, (B) tmux control mode, (C) attach a PTY and push bytes. For clients: (D) one tmux client per browser tab, (E) one daemon-owned attach fanned out to every browser client. For sizing: (F) resize-pane, (G) resize-window alone, (H) Setsize alone, (I) both Setsize and resize-window with the window latched to manual sizing.

**Decision.** C, E and I. tmux sees a single client, so its smallest-client rule never fires; the PTY sizes the region the client paints into and the window resize sizes what the application lays out against.

**Consequences.** capture-pane is a test oracle and a snapshot source, never the display path or a state source. tmux owns scrollback and xterm keeps none. External viewers attach read-only or with size ignored so they cannot resize the session. A browser resize is debounced and applied as one geometry per session.
