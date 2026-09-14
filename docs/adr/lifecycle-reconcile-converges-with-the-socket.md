---
id: lifecycle-reconcile-converges-with-the-socket
type: decision
status: accepted
date: 2026-09-14
summary: Reconcile decides row ownership from tmux list-sessions, repairs tmux_target from tmux, and never deletes a row whose pane is alive.
features: [lifecycle, actions]
tags: [store, tmux]
files: [internal/session/manager.go, internal/tmux/tmux.go]
tests: [TestReconcile_AliveFalseRowWithALiveMusterSessionIsRevivedNotSwept, TestReconcile_LiveMusterSessionUnderAPlaceholderTargetIsRepairedAndKeptAlive, TestReconcile_AliveRowWithAStaleWindowTargetIsRepairedNotMarkedEnded]
refs: [plan:session-lifecycle, kb:adr/lifecycle-liveness-from-pane-existence, kb:adr/lifecycle-reconcile-before-first-snapshot, kb:adr/lifecycle-session-identity-is-tmux-target, kb:anchor/state.liveness]
supersedes: [lifecycle-ended-rows-swept-next-start]
---
**Context.** kb:adr/lifecycle-ended-rows-swept-next-start settled *which* rows survive a restart, and is still right about that. Its implementation classified purely from the database: `alive=0` short-circuited to a delete **before** any pane check, and `tmux_target` — the identity of record per kb:adr/lifecycle-session-identity-is-tmux-target — was written once at spawn and never verified. tmux was consulted only to report, never to decide. This contradicted kb:adr/lifecycle-liveness-from-pane-existence, which says `alive` is decided by pane existence alone: the sweep never asked.

Three unescapable states followed. A row marked ended whose pane is alive is deleted outright, so a `kill -9` between a resume's spawn and its persist destroys the record while the resumed `claude` runs on. A row still carrying the `''` placeholder is read as dead by reconcile, as "not launched yet" by the poll, and as "owns no tmux session" by the unknown-name sweep — so the row's own live pane is reported as an orphan. A row whose window id went stale is marked ended while its name is treated as known, leaving Resume refused with a raw tmux `duplicate session`.

**Options.** (A) Keep classifying from the database. (B) Add a repair pass afterwards. (C) Classify ownership by name, from one `tmux list-sessions` snapshot.

**Decision.** C, restating the sweep rule with a pane-confirmation clause. A row whose `muster-<id>` is on the socket owns it: `tmux_target` and `tmux_pane` are re-derived from tmux, persisted if changed, and the row is alive — whatever `alive` said. A row whose `muster-<id>` is absent follows the superseded rules exactly. **No row is deleted while its pane is alive.**

**Consequences.** kb:adr/lifecycle-reconcile-before-first-snapshot is untouched: unknown sessions are still reported, never adopted, never killed; shells are still killed unconditionally. The launch and resume crash windows stop producing unreachable panes. Reconcile no longer aborts on the first row-level error.
