---
id: issue-daemon-creates-issues-only
type: decision
status: accepted
date: 2026-08-31
summary: The daemon's involvement ends at creating an issue: no reading, labels or status sync; a filed issue's fate is a developer-workflow concern outside musterd.
features: [issue, triage]
tags: [security, user-decision]
files: [internal/ghissue/ghissue.go, internal/server/issue.go]
tests: []
refs: [docs/history/spec-changelog.md, plan:issue-capture, kb:adr/triage-issue-closes-when-fix-lands, kb:adr/triage-state-derived-from-todo]
supersedes: []
---
**Context.** Once the dashboard could file issues it was tempting to let it show them, label them or reflect their state.

**Options.** (A) Grow the daemon into a small issue client. (B) Stop at creation and leave triage, closing and status to the repository workflow.

**Decision.** B. Reading issue bodies into a process that also holds prompt text and shell access is a different risk class from writing an allowlisted snapshot out.

**Consequences.** Triage and landing became development skills that never touch the daemon. The boundary held when the repository went public and issue bodies became untrusted input; the hardening happened entirely on the workflow side.
