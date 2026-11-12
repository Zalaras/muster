---
id: reader-scratchpad-dir-from-hooks-persisted
type: decision
status: accepted
date: 2026-11-12
summary: A session's scratchpad folder comes from routed hooks of its current Claude session id, persisted on the row, never cleared or moved by stragglers.
features: [reader, ingest]
tags: [claude-code-format]
files: []
tests: []
refs: [plan:claude-tmp-files, kb:fact/scratchpad-dir-per-session-id, kb:adr/reader-plan-located-by-transcript-scan, kb:adr/ingest-monotonic-rebind]
supersedes: []
---
**Context.** Every hook and status-line post of an interactive session names its scratchpad folder; /clear moves it to the new session id's folder, a resume returns to the original, and a print-mode session sends null (kb:fact/scratchpad-dir-per-session-id). The reader needs the folder for live and ended sessions, across daemon restarts.

**Options.** (A) Read it from routed hooks and keep it on the session row. (B) Read it from the status line. (C) Derive it from the user id, working directory and session id.

**Decision.** A, following the transcript path's pattern: the adapter package alone reads the field and passes it on only when well formed; the session moves it only for a hook bound to its current Claude session id, persists it on change, broadcasts it, and never clears it — not on a null, a death or a restart.

**Consequences.** A straggler from a session id the pane has left never moves the folder. Status posts never bind a session, so B could not be gated the same way. C would hard-code Claude Code's temp root and path encoding. Losing the one hook that names a new folder only delays the move, since every later hook names it again.
