---
id: sweep-batch-reviewer-majored-the-loop-owned-todo-tick
type: lesson
status: active
date: 2026-10-22
summary: A sweep batch's reviewer raised a Major for the unticked TODO.md entry; a batch never ticks it, the loop does on main, so the DOC row was wrong by design.
features: []
tags: [pipeline]
roles: [review]
files: [.claude/skills/fix-batch/SKILL.md, scripts/sweep.py]
tests: []
refs: [plan:ws-close-code-1, plans/ws-close-code-1/review.code.md, kb:adr/process-fix-sweep-fresh-process-per-batch]
---
**What happened.** `/fix-batch ws-close-code 1` ran unattended. Review cycle 1 approved the
diff but marked the DOC row FAIL and wrote Major 1 `[orchestrator]`: the `TODO.md` entry the
batch resolves was still unticked and not moved to `docs/history/todo-done.md`. The reviewer
read `doc-upkeep.md`, which says a finished item is ticked, and had no way to know that a sweep
batch leaves `TODO.md` alone on purpose: `scripts/sweep.py` ticks on `main` when it squash-merges
the batch, so parallel batches never conflict on the one file they all touch.

**Cost.** None this run, since the verdict was `approved` anyway, but the same Major will appear
in every batch's cycle 1, and an orchestrator that takes it at face value spends a fix wave
ticking a file the loop then edits again on `main`.

**Lesson.** A plan whose directory is `plans/<sweep>-<n>/` and whose sweep is named in
`plans/<sweep>/sweep.json` is a sweep batch: its `TODO.md` entries stay unticked on the branch,
and the DOC row judges the Doc Delta, the records and the comments only. The tick is the loop's,
on `main`.
