---
id: fix-wave-uncovers-product-defect
type: lesson
status: active
date: 2026-09-14
summary: A fix wave that builds a better fixture can expose a new product defect; that is an implementation-bug verdict folded into the same cycle, not a failed wave.
features: []
tags: [pipeline, testing]
roles: [orchestrator, e2e-specs]
files: []
tests: []
refs: [plan:new-session-dialog, plans/new-session-dialog/test-specs.md, plans/new-session-dialog/web-implementation.md]
---
**What happened.** In new-session-dialog's first review cycle, fixing an E13 Major needed a 25-entry browse fixture. The longer listing exposed a missing `min-height: 0` on `.browse`, so the listing painted over the form rows — a product defect no earlier fixture was long enough to reach.

**Cost.** None beyond the routing: the wave's own tagged fixes were complete, and the new bug went to the impl agent as a fresh wave 1 inside the same cycle.

**What changed.** Fix Wave Ordering says a review cycle's wave 3 may report `implementation-bug` exactly as Step 5 does; the verdict neither fails the wave nor ends the cycle. e2e-specs reports the defect in the E2E Implementation Bugs table and leaves the honest test failing.
