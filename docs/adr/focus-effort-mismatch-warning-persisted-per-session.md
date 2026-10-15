---
id: focus-effort-mismatch-warning-persisted-per-session
type: decision
status: accepted
date: 2026-10-15
summary: A launch whose first status report contradicts its chosen effort gets a warning stored on the session row, shown under the Focus header until dismissed.
features: [focus, launch, card-location]
tags: [ux, store, user-decision]
files: []
tests: []
refs: [plan:effort, kb:fact/effort-levels-per-model, kb:adr/session-effort-tri-state-from-status-line, "#68"]
supersedes: []
---
**Context.** Claude Code clamps an effort the model does not offer silently, and a model without
effort ignores the flag (kb:fact/effort-levels-per-model). The developer wants to know when a launch
did not come up at the level asked for, in every window and across reloads and restarts, until they
dismiss it.

**Options.** (A) A client-side notice kept in browser storage. (B) Daemon state on the session row.

**Decision.** B. The first effort report after a launch that carried a level sets `effortWarning`
`{requested, actual, model}` iff the reported level differs (none counts as different). Later
posts, `/clear`, both resumes, reconcile and restarts never set or clear it; only
`DELETE /api/sessions/{id}/effort-warning` or Remove clears it. The dashboard shows it as a strip in
the `--warn` tokens and tints the bracketed effort while it stands.

**Consequences.** A `/effort` typed before the first report can raise it; accepted. In-session
changes and resumes never warn.
