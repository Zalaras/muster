---
id: cross-source-compare-in-measured-forms
type: lesson
status: active
date: 2026-10-26
summary: A de-dup across two sources was planned and tested with one synthetic form; the sources' measured precisions never compared equal, costing a review cycle.
features: []
tags: [pipeline, testing]
roles: [planner, daemon-impl, daemon-tests]
files: []
tests: []
refs: [plan:usage-bar-consistency, plans/usage-bar-consistency/review.cycle1.md]
---
**What happened.** REQ-9 asked that the same 5h/7d values from the status line and the usage call
be de-duplicated. The status line states a reset as epoch seconds on a 10-minute boundary, the
usage call as RFC3339 with microseconds just before it; both fact records were in every pack. The
aggregator compared them exactly, and the test helper `ahead()` handed both sources the same
truncated instant, so the test passed while real data never de-duped.

**Cost.** Review cycle 1's correctness Major 1, about 75 minutes of fix waves and a second review
cycle.

**The lesson.** A requirement that compares or de-dups values arriving from two sources names each
source's measured form (precision, units, rounding), and its test feeds both forms through their
real interpreters; a shared synthetic helper hides exactly the gap the comparison must close.
