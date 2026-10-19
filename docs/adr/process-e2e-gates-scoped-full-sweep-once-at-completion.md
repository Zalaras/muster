---
id: process-e2e-gates-scoped-full-sweep-once-at-completion
type: decision
status: accepted
date: 2026-10-19
summary: Gate runs before Completion run E2E scoped to the specs the plan can affect; the whole suite runs once, at Final Validation, and only that run completes a plan.
features: []
tags: [pipeline, testing]
files: [.claude/skills/orchestrate/scripts/gates.sh, Makefile, .claude/skills/orchestrate/SKILL.md, .claude/skills/fix/SKILL.md, .claude/agents/e2e-specs.md, .claude/agents/review-work.md]
tests: []
refs: [kb:adr/process-gates-run-once-by-orchestrator-before-review, kb:adr/process-playwright-runs-exclusive-on-machine, kb:adr/process-e2e-one-load-policy, kb:adr/process-e2e-no-playwright-retries, kb:lesson/concurrent-e2e-across-worktrees-goes-red, kb:lesson/concurrent-build-invalidates-running-e2e, kb:lesson/main-session-gate-list-dropped-check-kb, kb:lesson/per-test-daemons-flaked-the-suite]
---
**Context.** `make e2e` takes about seven minutes at 846 tests and holds the gate lock
exclusively (kb:adr/process-playwright-runs-exclusive-on-machine), locking every other worktree
out. One review cycle ran it up to three times: the E2E agent's full-suite step, the wave-3 gate,
and the pre-review baseline, whose ledger reuse broke once doc-reconcile committed. The time is
daemon-spawning tests at the four-worker ceiling (kb:adr/process-e2e-one-load-policy), not
Playwright; the lever is how often the sweep runs.

**Options.** Keep every gate a full sweep; scope every gate before Completion; scope only wave 3
and the E2E agent's step; mock the daemon or tmux.

**Decision.** Scope every gate before Completion. `gates.sh` computes the scope itself
(kb:lesson/main-session-gate-list-dropped-check-kb): the specs owned by a Features or Touches
feature (after `--touch` widened the header) or by a changed file's owner, the specs the branch
changed or the Fixture plan names, the importers of a changed helper to a fixpoint, and `all` on
a harness-wide change. It runs `make e2e SPECS='…'` under the same lock and build order
(kb:lesson/concurrent-build-invalidates-running-e2e) and registers the bare `make e2e` so a
plan's `E1 make e2e` check dedupes to the gate. Final Validation runs `--full-e2e` after
doc-reconcile; only it, or `--no-e2e` on an `E2E Scope: none` plan, writes the record `status
completed` requires. Retries stay zero (kb:adr/process-e2e-no-playwright-retries). Scoping wave 3
alone saves nothing, since a clean cycle already paid one sweep; mocking hides the daemon-to-UI
seam where the real bugs live.

**Consequences.** A cycle's gate run falls from about twelve minutes cold to about five. A
regression in a spec no feature link reaches surfaces at Final Validation, after approval, and
routes like a wave-3 implementation bug: fix waves, the full run again, a delta re-review. The
full sweep stays, since load flakes show only under the whole suite
(kb:lesson/per-test-daemons-flaked-the-suite). The gates-once decision stands, its e2e line scoped.
