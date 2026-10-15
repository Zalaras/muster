---
id: rename-claude-change-after-delivery-clears-override
type: decision
status: accepted
date: 2026-10-15
summary: Once a rename has reached Claude Code, a later different name from Claude Code clears the title override; the last rename wins wherever it was made.
features: [rename, lifecycle]
tags: [ux, user-decision]
files: []
tests: []
refs: [plan:rename-claude-session, kb:adr/rename-muster-owned-title-override-wins, kb:adr/rename-pushed-to-claude-once, kb:fact/slash-rename-immediate-no-hook, kb:fact/session-name-uniqueness-flagged, "#71"]
supersedes: []
---
**Context.** The title override wins over Claude Code's name on the dashboard
(kb:adr/rename-muster-owned-title-override-wins), and a rename is now sent to Claude Code once
(kb:adr/rename-pushed-to-claude-once), with what was sent held in memory. A `/rename` typed later
left the dashboard on the old Muster title, and after a daemon restart the override no longer
matched Claude Code's name and would be sent again, undoing the `/rename` each time. A name Claude
Code suffixed on a collision had the same effect.

**Options.** (A) The override keeps winning; persist what was sent so a restart does not re-send.
(B) The last rename wins wherever it was made: after delivery, Claude Code's different name clears
the override.

**Decision.** B, chosen by the developer. An override is delivered once it has been sent, or once
Claude Code's reported name equals it. After that, a reported name that differs from both the
override and the name Claude Code had just before delivery clears the override, and the dashboard
shows Claude Code's name. Before delivery the override still wins and status posts never touch it.

**Consequences.** A `/rename` and a collision suffix both show on the dashboard. A cleared override
leaves nothing to re-send after a restart, so nothing is stored. A status post still naming the
pre-delivery name, arriving late, never clears it. Two windows stay open: a `/rename` typed between
a Muster rename and the next prompt is overwritten by that prompt's send, and a restart between a
send and the next status post may send the override once more.
