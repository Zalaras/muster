---
id: usage-no-hydration-across-restart
type: decision
status: accepted
date: 2026-08-23
summary: Account usage reads unknown after a daemon restart until the next status post; per-session context persists on the session row.
features: [usage]
tags: [ux, store]
files: [internal/usage/**, internal/server/usage.go, internal/store/session.go]
tests: [web/e2e/gauges.spec.ts, TestUpdateSession_ContextFieldsRoundTripAllOrNothingIncludingBackToNil]
refs: [docs/history/spec-changelog.md, plan:m3-gauges, kb:adr/usage-unknown-renders-word-not-track]
supersedes: []
---
**Context.** Usage samples are persisted, so the daemon could reload the last one on start and show it immediately. A rate-limit bucket is a moving window, though, and a value from before a restart is of unknown age.

**Options.** (A) Hydrate the masthead from the last persisted sample. (B) Start the account gauges as unknown and fill them from the next status post; keep per-session context, which describes a conversation rather than a window, on the session row.

**Decision.** B.

**Consequences.** A restart shows unknown in the masthead for a few seconds on a busy account and until the next turn on an idle one. Session cards keep their last context row across the restart. A later polled source keeps its last-good value in memory only, under the same rule.
