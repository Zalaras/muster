---
id: lifecycle-resume-rebinds-existing-session
type: decision
status: accepted
date: 2026-08-16
summary: Resuming a dead session keeps the Muster row and its title and rebinds it to the new pane, matched on the unchanged Claude session_id.
features: [lifecycle, actions]
tags: [state-machine, tmux]
files: [internal/session/manager.go, internal/server/sessions.go]
tests: [TestApplyInput_ResumeBind_SameClaudeIDFromEveryStateLandsIdleWithAttentionAndFailureCleared, TestRecordResume_UpdatesTargetClearsSnapshotLeavesStateUntouched, web/e2e/actions.spec.ts]
refs: [docs/history/spec-changelog.md, kb:fact/resume-keeps-session-identity, kb:anchor/sessions.resume, kb:anchor/state.transitions]
supersedes: []
---
**Context.** Reconcile wanted to offer a resume for a session whose pane had died. The probe confirmed that a resumed CLI reports the same session id and transcript path as the original, so the daemon can recognise it deterministically.

**Options.** (A) Treat the resumed CLI as a brand-new Muster session and let the old row linger. (B) Spawn the resume in a fresh tmux session and rebind the existing row to it, keeping Muster-side state such as the title.

**Decision.** B. Identity keys on the tmux target, so the resume updates that target, clears the stale pane snapshot and waits for the enveloped start event to bind.

**Consequences.** The resumed session lands in idle with attention and failure cleared, never in started. A resume whose start event carries a different Claude id is treated as a clear-style rebind rather than trusted. A session with no known Claude id cannot be resumed and the endpoint says so.
