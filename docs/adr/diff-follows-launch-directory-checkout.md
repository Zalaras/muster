---
id: diff-follows-launch-directory-checkout
type: decision
status: accepted
date: 2026-11-20
summary: The diff is of the whole git checkout the session's launch directory is in, never the checkout Claude has moved to.
features: [diff]
tags: [ux, user-decision]
files: []
tests: []
refs: [plan:diff-viewer, kb:adr/lifecycle-card-shows-launch-directory-marks-claude-elsewhere, kb:spec/card-location]
supersedes: []
---
**Context.** A session's shell, docs reader and file drop stay on its launch directory while Claude may work in another worktree (kb:adr/lifecycle-card-shows-launch-directory-marks-claude-elsewhere).

**Options.** (A) Diff the launch directory's checkout. (B) Follow Claude's reported location.

**Decision.** A, the developer's choice (2026-11-19): the git top level of the launch directory, whole even when launched in a subdirectory.

**Consequences.** The button and diff can be empty while Claude changes files elsewhere; the header's `↳` readout says Claude is elsewhere.
