---
id: rail-unread-inferred-from-live-terminal-client
type: decision
status: accepted
date: 2026-09-22
summary: A session is unread when its turn closed while no terminal client was attached; the daemon infers it from its terminal registry and clears it on attach.
features: [rail, lifecycle]
tags: [ux, state-machine, store, user-decision]
files: [internal/session/machine.go, internal/session/manager.go, internal/server/terminal.go, internal/server/shells.go, internal/store/migrations/**]
tests: []
refs: [plan:rail-card-improvements, "#34", kb:adr/surfaces-one-live-client-per-attach-target, kb:adr/focus-rail-plus-one-live-pane]
supersedes: []
---
**Context.** Once a session goes idle there was no way to tell which replies had been looked at. Only the sessions a window shows live hold a terminal socket, so the daemon's terminal registry already knows whether anyone was watching a session at the moment its turn closed.

**Options.** (A) A daemon-owned flag set at turn close when no client is attached to the session and cleared by an attach, with no new endpoint. (B) A daemon-owned flag that the client clears through an explicit seen call, so the client defines what seen means. (C) Client-only memory per window, lost on reload.

**Decision.** A, the developer's choice. The flag rides the session row and the ordinary upsert, so every window agrees and it survives daemon restarts. Attaching either of the session's surfaces marks it seen, before the first PTY byte is forwarded. The invariant that unread implies idle is held in the state setter, so any transition out of idle clears it.

**Consequences.** No protocol endpoint is added; the registry gains a watched query and the manager a watcher port. A session whose Docs tab is showing holds no terminal socket, so a reply arriving then counts as unread. Reconcile never writes the flag, so a card that died unread stays unread. The attention sort can now treat read and unread idle differently.
