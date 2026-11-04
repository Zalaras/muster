---
id: restart-is-stop-then-resume-in-place
type: decision
status: accepted
date: 2026-11-04
summary: A restart is the existing Stop path then the existing Resume path on the same row under one per-session lock, keeping the latched permission mode and effort.
features: [actions]
tags: []
files: [internal/server/launcher.go]
tests: []
refs: [plan:restart-latest-claude, kb:adr/lifecycle-resume-rebinds-existing-session, kb:fact/resume-with-plan-flag-keeps-plan]
supersedes: []
---
**Context.** A restart must bring each session back where it was: the same conversation, card, title, group and rail position.

**Options.** (A) Reuse Stop and Resume on the same row. (B) A new launch path that resumes into a fresh row.

**Decision.** A, holding the session's lock across both halves. The Resume argv already carries the latched permission mode, so plan mode survives (kb:fact/resume-with-plan-flag-keeps-plan), and the last-known effort.

**Consequences.** A mode changed with Shift+Tab that no hook reported is lost, as with any Resume. A failure in the Resume half leaves the row ended and resumable.
