---
id: reader-change-signal-is-the-write-hook
type: decision
status: accepted
date: 2026-09-14
summary: A routed Write, Edit or MultiEdit hook naming a markdown file becomes a docChanged message; freshness is the hook time and absent when no write was seen.
features: [reader, ingest]
tags: [ux, claude-code-format]
files: []
tests: []
refs: [plan:markdown-viewing, kb:fact/hook-delivery-best-effort, kb:fact/subagent-hooks-carry-agent-id, docs/design/design-system.md]
supersedes: []
---
**Context.** The reader must re-render a file Claude just wrote and mark files it has touched. Hooks already carry the tool name and the written path; filesystem watching would be a new dependency and a second source of truth.

**Options.** (A) Mirror the write hook onto the state stream as a small message and keep write times in daemon memory. (B) A filesystem watcher per open file. (C) Fold change information into the Session object on every write.

**Decision.** A. The daemon broadcasts one message per routed write naming a markdown file under the directory or the plan path, subagent writes included, and remembers the time per path for the daemon's lifetime. The reader re-fetches the open file, lights a changed dot on others and shows the age of the last known write. When no write has been seen for a file the cue is absent rather than guessed from a modification time.

**Consequences.** Hook loss leaves a file stale and labelled, never wrong. Write times vanish on restart like shells. The Session object stays small; a client that never asked for the reader ignores the message.
