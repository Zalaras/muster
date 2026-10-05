---
id: layout-invariant-needs-its-width-range
type: lesson
status: active
date: 2026-10-01
summary: A "never truncates" rule tested at one width took four review cycles: each fix was checked at the widths named, and the next sweep found the next case.
features: [focus]
tags: [pipeline]
roles: [planner, web-impl, e2e-specs, review-browser]
files: []
tests: []
refs: [plan:stale-dirs-models-branches, plans/stale-dirs-models-branches/review.browser.cycle2.md, plans/stale-dirs-models-branches/review.browser.cycle3.md, plans/stale-dirs-models-branches/review.browser.cycle4.md, plans/stale-dirs-models-branches/web-implementation.md]
---
**What happened.** REQ-13 said the Focus header's model "never truncates", and the plan tested it at
1280 px only (E11, edge case 24). Review cycle 2 measured it clipped at 960 px and below. Each fix
after that was verified at the widths the review had named, and the reviewer's next 4 px sweep
found the next case: name blocks over separators at 1024, an overflowing box at 800, blank room
beside a truncated title, then blank room with short names. The implementer logged two of those as
"inferred, not measured" limits and shipped them; both came back as findings.

**Cost.** Review cycles 2–5 (about 100 min of review) plus four fix waves, roughly 3.3 h of a 6.7 h
run, on one header.

**The lesson.** A layout invariant names the width range it holds over. Its E2E test and the
implementer's own check sweep that range in small steps, not only the widths a review named. A limit
the implementer can only infer is measured or escalated, never shipped as "inferred".
