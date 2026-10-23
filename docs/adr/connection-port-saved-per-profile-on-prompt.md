---
id: connection-port-saved-per-profile-on-prompt
type: decision
status: accepted
date: 2026-10-23
summary: A flag-given port is saved per data dir only after a terminal y/N prompt (default No); flag beats saved beats 8765; a busy port fails with no fallback.
features: [connection]
tags: [ux, user-decision]
files: [cmd/musterd/main.go, cmd/musterd/port.go]
tests: []
refs: [plan:custom-port, kb:adr/connection-port-flag-replaces-addr, kb:adr/connection-dashboard-auto-opens-on-terminal]
supersedes: []
---
**Context.** Two profiles on one Mac need different ports, and a profile should not have to pass `-port` on every start. A fixed port is also what stops a second daemon for the same profile, and open tabs, bookmarks and browser storage are tied to the port.

**Options.** (A) Flag only. (B) A port derived from the user id. (C) A free port chosen and remembered automatically. (D) Flag plus an opt-in save.

**Decision.** D. The port is the `-port` value, else the one saved in this profile's data dir (`<data-dir>/port`, a plain file holding the number), else 8765. After binding, on a real terminal and not after an update re-exec, the daemon asks `Save port N for future starts? [y/N]` when the flag's port differs from what it would otherwise use; only y/yes saves, and saving `default` clears the saved port. The daemon serves while the prompt waits. A busy port fails startup naming `-port`; nothing falls back to a free port.

**Consequences.** No single-instance lock is needed because the port stays fixed per profile. Moving a profile to a new port leaves open tabs, bookmarks and browser storage (note drafts, theme hint) on the old origin.
