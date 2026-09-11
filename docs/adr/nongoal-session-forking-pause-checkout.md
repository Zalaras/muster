---
id: nongoal-session-forking-pause-checkout
type: decision
status: rejected
date: 2026-08-16
summary: No session forking or pause-and-checkout in the dashboard; worth tracking someday, not building.
features: [lifecycle]
tags: [revisit]
files: []
tests: []
refs: [SPEC.md, docs/history/interview-notes.md, kb:adr/actions-placement-mainhead-and-card-rows]
supersedes: []
---
**Context.** Some managers fork a session's conversation into a new one, or pause a session and check out its branch elsewhere. Claude Code's own resume and worktree support reach most of the same places.

**Options.** (A) Build fork and pause-checkout as dashboard actions. (B) Leave them to Claude Code and the terminal; at most, show in the dashboard that a session was forked.

**Decision.** B, cut for now. In Damian's words, you can kind of do that anyway.

**Consequences.** Sessions have no parent link in the data model. A later tracking feature would add a column, not a flow. The dashboard's session actions stay at end, resume and remove.
