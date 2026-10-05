---
id: layout-claims-are-measurements-not-sentences
type: lesson
status: active
date: 2026-10-05
summary: Two REQ-10 sentences carried from the mockup described how the Focus header gives way; both were false against the layout on main and cost two amendments.
features: []
tags: [pipeline]
roles: [planner, review-browser]
files: []
tests: []
refs: [plan:groups, plans/groups/decisions/focus-header-floor-rule/decision.md, plans/groups/decisions/control-hide-rule/decision.md, kb:lesson/pre-existing-claim-needs-a-base-measurement]
---

**What happened.** REQ-10 said "repo / branch never truncate" and "the control hides before the title shortens". Validate measured on the base commit that a folder over 8 characters already truncated beside a long title at 900–500 px with no control present; browser review measured that a 29-character title shortened beside the control at 760–864 px while the fixed 640 px rule kept the control shown. Neither claim had been measured when the spec was written; both came from the mockup's prose.

**Cost.** A second validate attempt, a two-advocate debate, two developer decisions and the E27 tests rewritten twice.

**What changed.** A requirement that states how an existing surface gives way — what truncates, hides or shortens first, and at which widths — is a measurement to take on `main` at planning, with the widths and fixture lengths written into the plan's Carried-over measurements. A sentence carried from a mockup is a hypothesis; the review-browser rig is where it gets tested, and by then every amendment costs a cycle.
