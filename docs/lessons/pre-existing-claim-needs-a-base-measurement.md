---
id: pre-existing-claim-needs-a-base-measurement
type: lesson
status: active
date: 2026-09-16
summary: A regression was called pre-existing without building the base commit; a bisect showed the plan had caused it, after an accepted ADR was nearly reopened.
features: [lifecycle, surfaces]
tags: [state-machine, tmux]
files: [.claude/agents/daemon-impl.md, .claude/agents/web-impl.md, .claude/agents/e2e-specs.md]
tests: []
refs: [plan:general-cleanup, plans/general-cleanup/daemon-implementation.md, plans/general-cleanup/test-specs.md, kb:adr/lifecycle-liveness-writes-stop-at-shutdown]
roles: [daemon-impl, web-impl, daemon-tests, web-tests, e2e-specs, orchestrator]
---

**What happened.** `reconcile.spec.ts` E2 failed 9/10 under soak. e2e-validate called it "pre-existing", daemon-impl's fix attempt agreed, and both escalated it as a product decision that would have reopened `kb:adr/lifecycle-reconcile-converges-with-the-socket`. Nobody built the base commit. A three-worktree bisect settled it in minutes: `main` 50/50, the plan's daemon commit 8/10 failing. The plan had caused it.

**Cost.** A wasted fix attempt, a bisect the orchestrator ran, a 48-minute re-fix, and an accepted ADR one approval from being reopened for a bug this plan introduced.

**The lesson.** "Pre-existing" is a comparative claim and needs a comparative measurement: build the base commit (`git worktree add <dir> main`) and run the same repro there before making it. A mechanism present on both sides cannot explain a difference between them. Until measured, the verdict is "cause not yet established".
