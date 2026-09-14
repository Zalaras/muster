---
id: actions-serialized-per-session
type: decision
status: accepted
date: 2026-09-14
summary: Launch, Resume, End and Remove hold a per-session-id lock, and the shell registry's global mutex becomes per-id.
features: [actions, lifecycle, surfaces]
tags: [state-machine, tmux]
files: [internal/session/manager.go, internal/server/sessions.go, internal/server/shells.go]
tests: [TestEnd_ConcurrentEndsProduceExactlyOneMarkEndedAndNeverAKillError]
refs: [plan:session-lifecycle, kb:adr/actions-kill-is-idempotent, kb:adr/surfaces-shell-is-attach-target-not-session]
supersedes: []
---
**Context.** Every session action is a check-then-act — read the registry under `Manager.mu`, release it, then do tmux and SQLite I/O — and nothing serialised the sequence. Releasing the lock across I/O is correct and must stay, but it left tmux's own refusal of a duplicate session name as the only thing preventing collisions. That covers double-spawn and nothing else: two concurrent Ends both read `Alive == true` and both attempt the kill; two concurrent Resumes both pass the not-alive gate and both rewrite the directory's `settings.local.json` through a non-atomic `os.WriteFile`, and a torn write there refuses every future launch in that directory by design.

The shell registry had the opposite problem: one global mutex held across two tmux subprocesses with `context.WithoutCancel`, so a single wedged tmux blocked every other session's shell **and** the synchronous `shells.Kill` that Remove performs.

**Options.** (A) Widen `Manager.mu` to cover whole actions — reintroduces tmux I/O under the registry lock, the one thing that lock must never hold. (B) One queue for all actions — couples unrelated sessions, the shell registry's existing mistake. (C) A lock keyed by session id.

**Decision.** C. `Manager` holds a `map[int64]*sync.Mutex` guarded by `Manager.mu`, taken around Launch, Resume, End and Remove for that id, entries reclaimed on Remove. `Manager.mu` is still released before every tmux call. `shellRegistry`'s mutex becomes per-id on the same principle, its tmux calls bounded by a timeout.

**Consequences.** Different sessions never block each other, on either surface. The loser of a concurrent End gets `409 not_alive` and the loser of a concurrent Resume gets `409 not_resumable` — honest answers instead of a 500. `writeSettings` still needs to be atomic in its own right, because a per-id lock does not exclude a `claude` process reading the file.
