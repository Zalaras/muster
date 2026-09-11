---
id: nongoal-macos-notifications
type: decision
status: rejected
date: 2026-08-16
summary: No macOS notifications or other alerts outside the dashboard; the dashboard is the alert surface by design.
features: [rail]
tags: [ux, user-decision]
files: []
tests: []
refs: [SPEC.md, docs/history/interview-notes.md, kb:adr/stack-frontend-web-app-served-by-daemon, kb:adr/rail-attention-sort-order, kb:adr/shortcuts-jump-to-neediest-option-command-zero]
supersedes: []
---
**Context.** Session managers commonly push a system banner when a session needs input or finishes. Muster's premise is that Damian works inside the dashboard, where the rail already sorts sessions by how badly they need attention.

**Options.** (A) Post macOS notifications for needs-input, failed and finished. (B) Make the dashboard glanceable enough that no out-of-band alert is needed.

**Decision.** A is rejected. In Damian's words, the point is to be working in the dashboard. If the dashboard proves not glanceable enough in practice, the question is reopened by amending the dashboard, not by adding banners.

**Consequences.** No notification permission, no notification centre integration and no dependency for either. The attention sort and the jump-to-neediest chord carry the load that banners would have.
