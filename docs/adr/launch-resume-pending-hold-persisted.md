---
id: launch-resume-pending-hold-persisted
type: decision
status: accepted
date: 2026-09-29
summary: A session spawned with --resume X holds Claude session X until it binds or ends, and the hold is stored with its row so a daemon restart keeps it.
features: [launch, past-sessions, actions]
tags: [user-decision]
files: [internal/session/manager.go, internal/session/liveness.go, internal/session/row.go, internal/store/session.go, internal/store/migrations/0010_pending_resume.sql, internal/server/launcherpast.go]
tests: [TestAliveByClaudeSessionID_PendingHoldAcrossRestart, TestInsertSession_PendingResumeClaudeSessionIDRoundTrips]
refs: [plans/resume-and-dangerously-allow/proposed-backlog.md, kb:adr/launch-resume-one-alive-row-per-claude-session]
supersedes: [launch-resume-pending-resume-holds-id]
---
**Context.** A resumed row has no Claude session id until its `SessionStart{source:"resume"}`, which can wait indefinitely on the trust prompt or the bypass warning. The pending row already held X in that window (option A of the superseded record), but only in memory: a musterd restart dropped the hold, the Resume list offered X again, and a second resume of X started beside the first.

**Options.** (A) Keep the hold in memory. (B) Store it on the session row.

**Decision.** B, the developer's call. The hold rule itself is unchanged.

**Consequences.** `openSessionId`, `409 already_open` and `not_resumable` mean "bound to, or pending a resume of" across a restart too. The hold is a nullable column on `session`, written at insert and cleared when the row binds or ends, so a revived row never brings a stale hold back.
