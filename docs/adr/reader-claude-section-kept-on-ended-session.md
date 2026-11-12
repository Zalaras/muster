---
id: reader-claude-section-kept-on-ended-session
type: decision
status: accepted
date: 2026-11-12
summary: The reader nav's claude section, plan included, stays on an ended session, replacing the removal of the plan slot and its header row.
features: [reader]
tags: [ux, user-decision]
files: []
tests: []
refs: [plan:claude-tmp-files, kb:adr/reader-scratchpad-in-folded-claude-section]
supersedes: []
---
**Context.** Today an ended session's reader drops the plan slot and its header row. Scratch files outlive the session (nothing deletes them on exit, kb:fact/scratchpad-dir-per-session-id), and the moment a session ends is when its scratch notes are most often wanted.

**Options.** (A) Keep today's rule and hide the whole section on an ended session. (B) Keep the section, plan and scratch files both openable.

**Decision.** B, at the developer's call on 2026-11-12.

**Consequences.** The reader of an ended session reads like a live one's. Files the system later removes from the temp directory simply drop out of the list; the plan stays as long as its file exists.
