---
id: surfaces-terminals-numbered-attach-targets
type: decision
status: accepted
date: 2026-11-20
summary: A session holds any number of terminals, each keyed by its number n with its own tmux session and socket; a new one takes the lowest free n.
features: [surfaces]
tags: [tmux]
files: [internal/tmux/tmux.go, internal/server/shells.go, internal/server/terminal.go]
tests: []
refs: [plan:better-terminal, kb:adr/surfaces-shell-is-attach-target-not-session, kb:adr/surfaces-one-live-client-per-attach-target]
supersedes: []
---
**Context.** A session carried at most one plain shell, `muster-<id>-shell`. The developer wants several, so a long-running command can keep going in one while they type in another. Each needs an identity the wire, tmux and the one-live-client law can share.

**Options.** (A) A number per session, reused once free. (B) A daemon-wide opaque id. (C) A developer-chosen name as the key.

**Decision.** A. A terminal is `(sessionId, n)`, `n ≥ 1`; its tmux session is `muster-<id>-shell` for `n = 1` and `muster-<id>-shell-<n>` otherwise, so the first terminal keeps today's name. A new terminal takes the lowest `n` not held by a running terminal, and its default name is `shell <n>`, so number and name agree. No cap. The attach socket is `/ws/shell/{id}/{n}`; the one-live-client law holds per terminal. Names cannot be the key: they change and need not be unique.

**Consequences.** Every rule that named the shell — Remove, reconcile, the kill-shutdown count and kill, seen-on-attach, the watched check — applies to every terminal of the session, which means listing by name rather than looping to a bound. A closed number is reused, so a stale reference to `n` can meet a newer terminal; names are dropped when a terminal ends so the newcomer never inherits one.
