---
id: surfaces-terminals-list-on-state-stream
type: decision
status: accepted
date: 2026-11-20
summary: Each session's terminal list (number, name, busy) is one whole-list terminals message on /ws, replacing shellActivity; names live in daemon memory.
features: [surfaces]
tags: [tmux]
files: [internal/server/shellactivity.go, internal/server/state.go, web/src/protocol/messages.ts]
tests: []
refs: [plan:better-terminal, kb:adr/surfaces-shell-busy-from-tmux-process-state, kb:adr/surfaces-shell-is-attach-target-not-session]
supersedes: []
---
**Context.** The dashboard knew of a shell only through its own spawn call and the per-session busy flag. A Terminals list has to show every terminal, its name and running/idle, update live while open, drop a terminal that exited by itself, keep a rename across a reload and agree between windows.

**Options.** (A) Keep `shellActivity` and add a separate list message. (B) One whole-list message per session replacing `shellActivity`. (C) The dashboard polls a list endpoint.

**Decision.** B. `terminals {sessionId, terminals: [{n, name, busy}]}` is broadcast with the session's whole list on any spawn, close, observed exit, rename or busy flip, and `snapshot.terminals` carries every list, replacing `shellsBusy`. A whole list makes a lost message self-correcting; one message keeps one truth for busy. The `shell` segment's indicator becomes "any terminal busy", derived by the dashboard. Names live in daemon memory, so they survive a reload and agree across windows, and end with the terminal or the daemon. Polling (C) was what the prototype did; it lags and multiplies requests per open window.

**Consequences.** Still no `Session` field and no state: a terminal is not a session. The snapshot shape changes, so every render fixture regenerates.
