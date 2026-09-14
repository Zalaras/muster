---
id: reader-plan-located-by-transcript-scan
type: decision
status: accepted
date: 2026-09-14
summary: The plan path is derived by scanning the transcript every hook names, on bounded triggers, and persisted on the session row; no watcher, no poll.
features: [reader, lifecycle, ingest]
tags: [claude-code-format, store]
files: []
tests: []
refs: [plan:markdown-viewing, kb:fact/plan-file-path-in-transcript, kb:fact/plan-mode-hook-sequence, kb:fact/clear-mints-new-session-id, kb:adr/ingest-monotonic-rebind, kb:adr/lifecycle-migrations-add-tables-when-written]
supersedes: []
---
**Context.** A plan lives at a path built from a per-session slug that appears on no hook payload; only the transcript records it, on plan-mode attachment lines and as a top-level slug. Muster persisted nothing from the transcript path every hook carries, and a clear mints a fresh transcript.

**Options.** (A) Scan the transcript on every hook. (B) Scan on the moments a plan can appear and when the reader opens, keeping the latest transcript path per session. (C) Watch the plans directory with fsnotify or poll modification times.

**Decision.** B. The transcript path and the derived plan path are two session columns written only on change. The scan runs on SessionStart, on leaving plan mode, on a write under the default plans directory and on every reader listing request; it decodes only lines carrying the two marker keys and treats a missing transcript as no plan. A hook whose Claude session id the session has already left never moves either value. All of it lives in the Claude Code adapter package.

**Consequences.** The plan slot fills within one hook of the plan being written and survives a daemon restart. An edit made outside Claude Code is not noticed until the reader opens or the window regains focus; a plan-only modification-time poll may be wanted later and would be a separate decision. The scan costs tens of milliseconds on the largest transcript, paid only on trigger events.
