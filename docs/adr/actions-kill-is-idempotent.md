---
id: actions-kill-is-idempotent
type: decision
status: accepted
date: 2026-09-14
summary: A tmux session that is already gone counts as a successful kill; only a genuine tmux failure blocks End and Remove.
features: [actions, lifecycle]
tags: [tmux, ux]
files: [internal/tmux/tmux.go, internal/session/manager.go]
tests: [TestKillSession_RemovesTheWholeSessionIdempotentForAnUnknownName, TestEnd_AlreadyGoneTmuxSessionIsSuccessNotError]
refs: [plan:session-lifecycle, kb:anchor/sessions.end, kb:anchor/sessions.remove, kb:adr/lifecycle-liveness-from-pane-existence]
supersedes: []
---
**Context.** `KillSession` wrapped every non-zero tmux exit as an error, including `can't find session`. Liveness is polled every ~5 s, so a dead pane reads as alive for up to a poll interval: a user clicking End in that window got `500 end_failed` with raw tmux stderr, over a terminal the handler had already closed. Remove propagated it, so the session could not be removed either.

**Options.** (A) Have callers string-match tmux stderr — pushes tmux vocabulary into `internal/session` and `internal/server`, the boundary CLAUDE.md forbids crossing for `internal/claudecode`. (B) Treat an `*exec.ExitError` as success. (C) Treat one as success only once the session is **verified gone**.

**Decision.** C — but the verification has to be honest, which took three attempts. Going through `PaneExists` proved nothing, because it collapsed every `ExitError` to `(false, nil)`: "not there" and "I could not ask" were one value, so a socket tmux could not reach read as a successful kill and Remove would delete a row whose pane was still running. The distinction belongs in the tmux layer's own readers. `PaneExists` and `ListSessions` now error when tmux reports `error connecting to <socket>` with `(Permission denied)` (EACCES) or `(Operation not permitted)` (EPERM). Every other non-zero exit stays "not there" — load-bearing, since `No such file or directory`, `Socket operation on non-socket` and `no server running on` all mean no server, hence genuinely gone.

Both errnos are needed: EPERM was measured under a sandbox profile with the server alive, and a macOS-only tool run under Claude Code meets it. Stderr is matched only to escalate.

**Consequences.** An already-gone session returns `200`; `500 end_failed` means a genuine failure and still leaves the row. Liveness and reconcile gain the same honesty — reconcile acts on nothing when it cannot enumerate, rather than sweeping rows whose panes are alive.
