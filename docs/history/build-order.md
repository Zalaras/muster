# Suggested build order (frozen)

Frozen: the milestone plan SPEC.md carried while v1 was being built, kept verbatim for history. It
is not current state; the features that came out of it are described in `docs/features/*/spec.md`.

Each milestone ends with something Damian actually uses day-to-day.

1. **M0 — Skeleton.** `musterd` daemon: HTTP+WS server, token auth, SQLite, `internal/claudecode`
   package stub, web shell that connects. E2E harness runs a scratch daemon.
2. **M1 — Sessions exist.** Launch `claude` in tmux from the dashboard (directory picker
   + title); `SessionStart`/`Stop`/`Notification` HTTP hooks ingested; state machine +
   session list UI (title, state, repo/branch, time-in-state, sort by blocked-longest).
   *Usable: replaces "which tab was that" today.*
3. **M2 — Terminal panes.** PTY↔WebSocket bridge to tmux, xterm.js panes, click-to-focus
   from the session list, typing works. *Usable: Terminal tabs retired.*
4. **M3 — Gauges.** Status-line POST ingestion; per-session context gauge; account
   usage bars (5-hour/weekly) + sample history. *Usable: the success criteria (§1) are met.*
5. **M4 — Durability.** Reconcile on daemon start; `--resume` for dead sessions; canary
   E2E; version pinning documented. **← v1 complete.**
6. **M5+ (v1.x, re-rank when reached):** plan-mode flow (§4.1) → worktree manager with
   setup scripts (§4.2) → start-from-PR/issue (§4.3) → permissions UI (§4.4) →
   `code <worktree>` button (anytime, trivial).

Before M0: a separate session sets up the AI build harness (agents, skills) — explicitly
not part of this spec.
