---
id: fix-closed-one-cause-of-two
type: lesson
status: active
date: 2026-08-27
summary: A finding naming two doors was fixed on the door the repro used; a two-cause symptom was fixed for one. A cycle each. Fix the category, re-run the repro.
features: [lifecycle, launch]
tags: [pipeline, state-machine]
roles: [daemon-impl, web-impl, review]
files: []
tests: []
refs: [plan:m1-sessions, plan:m4-reconcile, plans/m1-sessions/review-cycle-2.md, kb:adr/ingest-monotonic-rebind]
---
**What happened.** A Critical read "clear-rebind (and plain re-bind) leaves attention and failure set". The fix reset the fields inside the clear-rebind branch only; the reviewer's repro had used a clear, and the plain re-bind path, reached by resume, fell straight through. Cycle 2 reproduced the residue in a real browser. Later, "Enter does nothing" in the launch dialog had two causes; the right fix for the one identified left the second unmeasured, and the E2E agent's logged `locator.press()` workaround surfaced as a Major one review later.

**Cost.** One review cycle each, on findings whose text had already named the second door.

**What changed.** Fix the category, not the example: the Fix Attempt enumerates every code path reaching the defect and says how each is closed, and `rg`s every consumer of anything shared. It re-runs the reviewer's exact repro and pastes the after-output, because removing a cause is not evidence the symptom is gone. A workaround in a spec is an implementation-bug report, never a repair.
