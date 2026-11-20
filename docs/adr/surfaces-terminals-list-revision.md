---
id: surfaces-terminals-list-revision
type: decision
status: superseded
date: 2026-11-20
summary: Each terminals list carries a daemon-wide rising rev and each terminal reply the session's latest, so a window drops a list older than it knows.
features: [surfaces]
tags: [tmux]
files: [internal/server/shellactivity.go, internal/server/shells.go, internal/server/terminalswire.go, web/src/features/surfaces.ts]
tests: []
refs: [kb:adr/surfaces-terminals-list-on-state-stream, kb:adr/surfaces-shell-spawn-http-then-attach-ws, kb:adr/surfaces-last-shown-terminal-per-window]
supersedes: []
---
**Context.** A terminal is spawned, renamed and closed over HTTP, while its session's list arrives on `/ws`, a separate connection. A list the ~1 s poll built just before a spawn can reach the window after the spawn's reply; the window reads the new terminal as ended and moves off it, and the next list does not move it back. Close and rename overlap the same way.

**Options.** (A) The window holds a terminal it asked for until a list includes it, with a timeout. (B) The daemon drops a poll overtaken by a spawn. (C) Number every list, and have each reply say which list already reflects it.

**Decision.** C. `terminals` carries `rev`, from a daemon-wide counter that rises by one per broadcast; `snapshot.terminalsRev` is the counter when the snapshot was built. Every terminal route's reply carries `rev`, the session's latest broadcast rev after the change (`0` if none); `DELETE` answers `200 {rev}` instead of `204`. A window keeps, per session, the highest rev seen from lists, replies and the snapshot, and ignores a list below it. A reply at or below that rev whose terminal is missing from the window's list means the terminal already ended, so it is not shown. A holds only in the spawning window and needs a timeout; B cannot drop a list already handed to the socket, so a slow socket still loses; C is exact for any arrival order and covers close and rename.

**Consequences.** Additive on the wire: `protocolVersion` stays 2, as the dashboard is embedded in the binary. Revs restart with the daemon; a reconnecting window resets from the snapshot. The reply carries the session's rev, not the global counter, so a list sent before the reply that the change did not supersede still applies.
