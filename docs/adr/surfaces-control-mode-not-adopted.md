---
id: surfaces-control-mode-not-adopted
type: decision
status: rejected
date: 2026-09-13
summary: The terminal attach path stays plain tmux attach; control mode's byte saving is ~1000x under the only measured user-facing limit and is not strictly dominant.
features: [surfaces]
tags: [tmux, never, consensus, user-decision]
files: [internal/termbridge/termbridge.go, internal/tmux/tmux.go, internal/server/terminal.go]
tests: []
refs: [plans/decisions/tmux-control-mode/decision.md, spikes/S4-findings.md, spikes/S6-scroll-bandwidth.md, kb:adr/stack-terminal-backing-tmux, kb:adr/surfaces-shared-attach-single-pty, kb:adr/surfaces-scrollback-affordance-not-built]
supersedes: []
---
**Context.** `tmux attach` costs far more bytes than the application produces. Measured 2026-09-12 on tmux 3.7b with Muster's exact server options and a silent application, so every byte is tmux's own: a 12,941-byte attach handshake and sporadic ~6.4 KB full-screen repaints while idle, against 78 bytes and exactly zero under `tmux -CC`. Control mode would have kept tmux, session identity, reconcile and the existing tests intact. `kb:adr/surfaces-scrollback-affordance-not-built` parked it as a separate later item.

**Options.** (A) Rewrite `internal/termbridge` as a control-mode client: parse `%output` back to raw bytes, send input as `send-keys -H` on the client's stdin, resize with `refresh-client -C` plus `resize-window`, and reconstruct the opening screen from `capture-pane -e -p` plus synthesized terminal modes, since control mode sends nothing on attach (measured). (B) Keep the raw byte pipe.

**Decision.** B, by advocate debate reaching consensus, then Damian's call to drop rather than defer. The saving is denominated in a unit with no measured consequence: `spikes/S4-findings.md` §6 measured the current path at p50 5.0 ms keystroke-to-frame, 1.06 MB/s sustained to the browser, ~0% idle renderer CPU and a flat heap — all with tmux's amplification already inside those numbers. The bytes removed sit roughly three orders of magnitude under a ceiling nothing has approached.

**Consequences.** Not deferred and not a backlog item; reopening needs a measured symptom outside §6's envelope, never a byte ratio. Control mode is not strictly dominant: tmux coalesces a 50 MB burst to 21 MB, while `%output` carries every application byte plus 1.39x octal escaping, so `-CC` plausibly sends more under load. Any future attempt owes a multi-line paste test first, and would falsify `docs/protocol.md`'s "the daemon transforms nothing".
