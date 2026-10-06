---
id: small-track-impl-extras-had-no-tester-pass
type: lesson
status: active
date: 2026-10-06
summary: The first /fix run made the post-green tester pass optional; the impl's measured extra behaviour shipped untested and cost a review cycle of twenty minutes.
features: []
tags: [pipeline]
roles: [orchestrator]
files: [.claude/skills/fix/SKILL.md]
tests: []
refs: [plan:launch-inflight-guard, plans/launch-inflight-guard/review.code.cycle1.md, kb:adr/process-small-track-for-fixes]
---
**What happened.** `/fix launch-inflight-guard` ran red-first: e2e-specs pinned the double-press
defect, web-impl made it green in 3.5 minutes. The impl log's `## Decisions` recorded a measured
addition the plan never named — disabling a focused Launch drops focus to `<body>`, so the agent
restored it after a refusal. The skill said to spawn the test agent again "only when the test
itself must change", so nobody did, and review cycle 1 returned a Major: behaviour shipped with no
test guarding it.

**Cost.** One fix wave (e2e-specs, 6 minutes, half of it a soak), a second full gates run (10
minutes, for one added E2E test) and a second review cycle (2 minutes): about twenty minutes of a
sixty-five-minute run.

**What changed.** `/fix` step 5: on green, read the impl log's Decisions; a `Measured:` line or a
behaviour outside the REQs sends the Proof agent in once more in its ordinary mode, reading the
Handoff, before the gates — the pipeline's own impl-then-tests order, which red-first had removed.
