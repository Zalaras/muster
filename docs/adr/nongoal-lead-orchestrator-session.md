---
id: nongoal-lead-orchestrator-session
type: decision
status: rejected
date: 2026-08-16
summary: No lead orchestrator chat session built into the dashboard; Claude Code's native cross-session messaging covers it and a lead can run in an ordinary pane.
features: []
tags: [ux]
files: []
tests: []
refs: [SPEC.md, docs/history/interview-notes.md]
supersedes: []
---
**Context.** The mockup's overview had a chat panel for a lead session that would direct the others. Claude Code meanwhile shipped agent listing and cross-session messaging natively.

**Options.** (A) Build a chat panel bound to a designated lead session, with Muster relaying instructions to the rest. (B) Treat a lead as just another session launched into a normal pane and let Claude Code's own messaging do the coordination.

**Decision.** B.

**Consequences.** The dashboard has no session role concept and no chat surface. Muster stays an observer and launcher of sessions rather than a participant in their conversations, which also keeps prompt text out of its own wire.
