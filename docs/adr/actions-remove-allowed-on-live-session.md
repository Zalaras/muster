---
id: actions-remove-allowed-on-live-session
type: decision
status: accepted
date: 2026-08-27
summary: Remove is allowed on a live session; it ends the session first and its dialog says so, then deletes the row and broadcasts sessionRemoved.
features: [actions, lifecycle]
tags: [ux, user-decision]
files: [internal/server/sessions.go, internal/session/manager.go]
tests: [TestRemove_EndsAnAliveSessionFirstAndLeavesTheRowOnAFailingKill, TestHandleRemoveSession_DeadSessionSucceeds, web/e2e/actions.spec.ts]
refs: [docs/history/spec-changelog.md, plan:m4-reconcile, kb:anchor/sessions.remove, kb:anchor/sessions.end, kb:anchor/ws.session-removed]
supersedes: []
---
**Context.** End kills a live session's tmux session and keeps the row, which stays resumable because the daemon holds the Claude id. Remove deletes the row. Whether Remove should be offered while the session is still alive was open.

**Options.** (A) Remove only dead sessions, forcing End first. (B) Allow Remove on a live session, run the End path first, and warn in the dialog copy.

**Decision.** B, settled with Damian in planning.

**Consequences.** If the kill fails the row is left in place rather than removed out from under a running session. End deliberately leaves a companion shell surface running; Remove kills both. The removal is broadcast as its own message, and event rows for the removed session are kept.
