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
**What happened.** `reconcile.spec.ts` E2 began failing 9/10 under soak. e2e-validate reported it as "not my file… a different, pre-existing mechanism", and daemon-impl's fix attempt agreed, concluding the only remedies were to change `classifySessionsByOwnership`'s rule — which `kb:adr/lifecycle-reconcile-converges-with-the-socket` forbids by name — or to edit the spec, and escalated it as a product decision. Both readings were inferred from the current tree alone. Nobody built the base commit. A three-worktree bisect settled it in minutes: `main` 50/50 pass, the plan's E2E migration alone 50/50 pass, the plan's daemon commit 8/10 failing. The plan had caused it; the fix attempt's own log had misread its capture, reading a write that completed *after* the shutdown log line as one that completed before.

**Cost.** A wasted fix attempt, a bisect the orchestrator had to run, a 48-minute re-fix, and a near-miss: an accepted ADR was one approval away from being reopened to accommodate a bug this plan had introduced.

**The lesson.** "Pre-existing" is a **comparative** claim and needs a comparative measurement: build the base commit — `main`, or the commit before the suspect one — and run the same repro there before making it. A mechanism present on both sides cannot explain a difference between them, so naming one is not evidence. `git worktree add <dir> <ref>` plus the project's build is usually a few minutes, far less than a wrong escalation.

The existing rule is narrower than it reads: `daemon-impl.md` and `web-impl.md` forbid reporting a **build failure** as "expected" or "pre-existing", which does not cover a behavioural or test regression, and the test and e2e agents carry no such line at all. Until a claim is measured against the base, the honest verdict is "cause not yet established", not "pre-existing".
