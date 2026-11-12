---
id: fix-any-path-answer-proved-by-seeded-state
type: lesson
status: active
date: 2026-11-12
summary: An "any closer" answer was proved by rows seeding the closed ring, so the interrupt closer re-closing a reopened prompt surfaced only at review.
features: [lifecycle]
tags: [pipeline]
roles: [retro]
files: [.claude/skills/fix/SKILL.md, internal/session/interrupt.go]
tests: [TestSweepInterrupts_ReopenedPromptNotReclosedByOldInterrupt]
refs: [plan:sweep-2026-11-12-1, plans/sweep-2026-11-12-1/review.cycle1.md]
---
**What happened.** The developer answered at the /fix stop that a reopen applies to a prompt closed
by any closer (Stop, StopFailure, idle_prompt, transcript interrupt, compaction end). The plan's
edge case for that answer cited the cross-state rows, which put the id in the closed ring by hand
and never ran a real closer. Review cycle 1 read the interrupt sweep and found it re-checks the
current prompt every tick, so the old interrupt line closed the reopened prompt again. Fixing it
cost a second review cycle, four more agent spawns and an internal seam change; one impl attempt
was spent blocked because the red test had pinned the old checker signature.

**What would have caught it.** When an answer widens a fix to every path of a kind, research lists
each path's mechanism (who closes, and does it look again later?) and the Proof exercises each
real path, not state seeded to look like its result.
