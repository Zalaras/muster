---
id: browser-storage-unavailable-is-a-source-state
type: lesson
status: active
date: 2026-10-21
summary: A feature that keeps text in browser storage must plan and test storage-unavailable as a source state; session-notes paid two review cycles for leaving it out.
features: []
tags: [pipeline, testing]
roles: [planner, web-impl, review-browser]
files: []
tests: []
refs: [plan:session-notes, plans/session-notes/review.cycle1.md, plans/session-notes/review.cycle3.md, plans/session-notes/decisions/review-cycle-exhaustion-theme-storage/decision.md]
---
**What happened.** The plan's States named no data, data and daemon down. Its storage guidance was
a non-binding hint ("wrap every read and write"). Cycle 1 found saves that read their text back
from a draft the browser had refused to keep, so nothing was sent. Cycle 3 found an older bare
`localStorage` read in another feature's event listener that aborted the note's re-send when the
storage getter threw.

**Cost.** Two cycle-1 Majors and their fix waves, then a cycle-3 Major past the review budget: a
debate and a fourth review cycle, about an hour.

**What changed.** A feature that keeps state in browser storage lists *storage unavailable* —
the getter throws, its methods throw, the quota is full — as a source state with a journey, and
every storage access goes through the guarded accessor in `web/src/storage.ts`
(kb:adr/notes-blocked-storage-fixed-in-run-cycle-four).
