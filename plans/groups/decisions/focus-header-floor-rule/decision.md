# Decision: REQ-10 / E27 amended to the repo block's floor rule

**Reached by**: user decision (asked by the orchestrator on 2026-10-05, after validate attempt 1, before any fix wave).

**Why it came up.** Validate attempt 1 (plans/groups/test-specs.md, E2E Implementation Bugs) left five E27 tests red: with a long title the folder `muster-app /` (12 characters) truncates in the Focus header at 1140, 724, 600 and 500 px. Measured on the base commit 41a4469 with no group control in the tree, the same fixture truncates at 900, 724, 600 and 500 px: the existing layout gives free space to the title and holds the repo block at its 8-character floor (kb:adr/focus-model-never-truncates-name-blocks-give-way). At 1140 px the control costs the folder 26 px (81 of 81 without it, 55 of 81 with it). The plan's "repo / branch never truncate" therefore described behaviour the layout never had.

**Options put to the developer.**
1. Amend REQ-10 and E27 to the floor rule (repo block keeps its 8-character floor and never hides); retitle the five tests; keep the five floor-fitting tests the validate agent added; no code change.
2. Give the repo block priority over the title while the control is shown — a web fix wave, re-test and re-validate, reversing the accepted give-way order in that case.

**Outcome.** Option 1. Recorded inline on REQ-10 and E27 in plan.md and as kb:adr/focus-repo-block-keeps-floor-beside-group-control (proposed, user-decision).
