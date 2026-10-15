---
id: usage-cache-warmth-kept-until-clear-read-against-client-clock
type: decision
status: superseded
date: 2026-10-14
summary: The Session carries the prompt cache's expiry and lifetime, persisted and cleared only by /clear; the dashboard compares the expiry with its own clock.
features: [usage, lifecycle]
tags: [claude-code-format]
files: [internal/claudecode/status.go, internal/session/status.go, internal/session/machine.go]
tests: []
refs: [plan:rail-card-organise, "#84", kb:fact/prompt-cache-status-shape, kb:fact/resume-reads-prior-prompt-cache, kb:fact/haiku-main-cache-ttl-5m-on-2-1-299, kb:fact/refresh-interval-seconds]
---
**Context.** #84 shows whether a session's prompt cache is still warm. An idle session posts
nothing (production writes no refresh interval), the lifetime is not always an hour, and a resume
inside the lifetime reads the earlier cache.

**Decision.** The wire carries `cache: {expiresAt, ttlSeconds} | null` on the Session, adopted from
a status post whose prompt cache has both fields usable; a post without one changes nothing. It is
stored on the session row, kept by Stop, pane death, Resume, compaction and a daemon restart, and
cleared only by a `/clear` rebind, which starts a conversation the old cache cannot serve. The
daemon never compares it with the clock; the dashboard does, so warmth changes while nothing
arrives. Claude Code's `warm` flag and the re-send token count are not carried.

**Consequences.** One more upsert per main-thread request. An ended card still knows whether a
resume would start warm. A lost status post leaves a stale expiry until the next one corrects it.
