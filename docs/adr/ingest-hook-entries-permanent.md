---
id: ingest-hook-entries-permanent
type: decision
status: accepted
date: 2026-08-27
summary: Muster's hook entries in a directory are permanent by design; no reference counting, no strip on shutdown, no strip on remove.
features: [ingest, launch]
tags: [claude-code-format, user-decision]
files: [internal/claudecode/settings.go]
tests: [TestMergeSettings_MigrationFixtureIsIdempotentAfterFirstMerge, TestMergeSettings_CalledTwiceProducesByteIdenticalOutput]
refs: [docs/history/spec-changelog.md, plan:m4-hook-lifetime, kb:adr/ingest-all-hooks-command-wrappers]
supersedes: []
---
**Context.** With http hooks, a stale entry in a directory Muster no longer managed printed an error on every tool call, so removing entries seemed necessary, yet no removal point was safe: entries must survive a daemon restart under a live session.

**Options.** (A) Reference-count sessions per directory and strip at zero. (B) Strip on daemon shutdown. (C) Strip when the last session in a directory is removed. (D) Leave entries in place forever.

**Decision.** D, decided with Damian. Once every hook is a wrapper that exits silently when unmanaged, a stale entry costs a brief shell exit and no visible noise, so the lifetime question dissolves rather than needing an answer.

**Consequences.** Instrumenting a directory is idempotent and one-way. Uninstrumenting is a manual edit the user makes if they ever want it. The merge must stay byte-identical on repeat so version control in that directory sees no churn.
