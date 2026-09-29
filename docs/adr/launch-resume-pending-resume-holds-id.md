---
id: launch-resume-pending-resume-holds-id
type: decision
status: accepted
date: 2026-09-28
summary: An alive session spawned with --resume X counts as holding Claude session X until it binds or dies, so no second resume of X can start in that window.
features: [launch]
tags: [user-decision]
files: [internal/session/manager.go, internal/server/launcherpast.go]
tests: []
refs: [plan:resume-and-dangerously-allow, plans/resume-and-dangerously-allow/decisions/pending-resume-holds-id/decision.md, kb:adr/launch-resume-one-alive-row-per-claude-session]
supersedes: []
---
**Context.** A resumed row has no Claude session id until its `SessionStart{source:"resume"}`. That can take indefinitely while Claude Code waits on its trust prompt or bypass warning, and then a second resume of the same id could start.

**Options.** (A) Treat the pending `--resume X` row as holding X. (B) Narrow the one-alive-row guard to bound rows.

**Decision.** A, the developer's call.

**Consequences.** `openSessionId` and `409 already_open` mean "bound to, or pending a resume of". The pending id lives in memory and is dropped when the row binds or dies.
