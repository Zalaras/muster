---
id: ingest-claude-cwd-read-in-interpret-only
type: decision
status: accepted
date: 2026-10-01
summary: Claude's working directory is read from the verbatim hook payload in Interpret and from the status line, never added to the raw ingest envelope.
features: [ingest]
tags: []
files: [internal/claudecode/interpret.go, internal/claudecode/status.go]
tests: []
refs: [plan:stale-dirs-models-branches, plans/stale-dirs-models-branches/daemon-implementation.md]
supersedes: []
---
**Context.** The plan had the raw hook struct in `ingest.go` read the common `cwd`, then
`Interpret` turn it into `StateInput.Cwd`. `Interpret` already receives the verbatim payload.

**Options.** (A) Add `cwd` to the ingest envelope and pass it through. (B) Read it in
`Interpret` alone.

**Decision.** B. The envelope carries only what routing needs
(kb:adr/ingest-envelope-binds-never-cwd); a second reader of the same key with no consumer
would be one more place the key name lives. The status line's `workspace.current_dir`, falling
back to its top-level `cwd`, is read in `status.go`. Both stay inside `internal/claudecode`.

**Consequences.** `ingest.go` is unchanged by plan `stale-dirs-models-branches`.
