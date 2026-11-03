---
id: small-track-proof-covers-every-req-clause
type: lesson
status: active
date: 2026-11-03
summary: A small-track Proof tested a REQ's size but not the colour the same REQ named; review returned a Major and the batch spent a second cycle on it.
features: []
tags: [pipeline]
roles: [orchestrator, render-tests]
files: [.claude/skills/fix-batch/SKILL.md]
tests: []
refs: [plan:sweep-2026-11-03-2, plans/sweep-2026-11-03-2/review.code.cycle1.md]
---
**What happened.** Batch `sweep-2026-11-03-2`'s REQ-2 (group caret) named a size, an orientation
and a colour (`--fg-muted` at rest, `--fg` on header hover). The plan's Proof for it measured only
the ink box and the button, so render-tests wrote exactly that; review cycle 1 found the colour
clause untested — reverting it stayed green — and returned a Major.

**Cost.** One render-tests fix wave (1.5 minutes), a second scoped gates run and a second review
(about fifteen minutes) for one `toHaveCSS` pair.

**Lesson.** When writing a small-track plan's `## Proof`, read each REQ clause by clause: every
observable value it names (size, colour, order, label, focus target) gets an assertion in some
Proof line, or the REQ drops the clause.
