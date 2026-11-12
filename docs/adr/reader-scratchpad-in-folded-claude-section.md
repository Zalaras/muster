---
id: reader-scratchpad-in-folded-claude-section
type: decision
status: accepted
date: 2026-11-12
summary: The nav's plan header becomes a claude section folded to one summary row with label chips; unfolded, the plan then the scratchpad .md files.
features: [reader]
tags: [ux, user-decision]
files: []
tests: []
refs: [plan:claude-tmp-files, kb:fact/scratchpad-dir-per-session-id]
supersedes: []
---
**Context.** Claude writes scratch markdown into a per-session folder under the system temp directory that the reader cannot list (#121). The nav already opens with a plan header and slot; another always-open list there would push the files tree down on every session.

**Options.** (A) Rename the plan header to a foldable claude section listing the plan and each scratch file. (B) The same section folded by default to one summary row whose chips say what is there. (C) A small tree with the plan, a scratchpad folder and a dimmed folder of files from before /clear. Mockups in plans/claude-tmp-files/mockups/.

**Decision.** B, at the developer's call on 2026-11-12. The chips (plan or a dimmed no plan, and the scratch count) are labels; the whole row toggles. Only .md files are listed, nested folders included. Only the session's current scratchpad is listed. The fold is remembered per session in the browser and starts folded.

**Consequences.** The files tree starts one row from the top whatever Claude has written. After /clear the list follows the new, empty folder and earlier scratch files drop out of view; keeping them would need the daemon to remember every folder, which is C and was declined.
