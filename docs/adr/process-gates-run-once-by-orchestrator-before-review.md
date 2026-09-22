---
id: process-gates-run-once-by-orchestrator-before-review
type: decision
status: accepted
date: 2026-09-22
summary: The orchestrator runs the gate runner once, in the foreground, before spawning the reviewers; reviewers read its log and never run a suite.
features: []
tags: [pipeline]
files: [.claude/skills/orchestrate/SKILL.md, .claude/skills/orchestrate/scripts/gates.sh, .claude/agents/review-work.md, .claude/agents/review-browser.md, .claude/agents/review-maintainability.md]
tests: []
refs: [kb:adr/process-reviewer-owns-final-validation, kb:adr/process-review-is-three-focused-reviewers-with-a-computed-verdict, kb:lesson/concurrent-build-invalidates-running-e2e, kb:lesson/subagent-never-woken-by-harness]
supersedes: [process-reviewer-owns-final-validation]
---
**Context.** `kb:adr/process-reviewer-owns-final-validation` moved the cycle's single gate run into
the one review agent so the suite would not run twice. Review is now three agents spawned in
parallel. Three agents cannot each run `make e2e` — a build beside a running sweep rewrites the
served bundle mid-sweep (kb:lesson/concurrent-build-invalidates-running-e2e) — and giving the run to
one of them makes the other two wait on a peer they cannot observe.

**Options.** (A) One reviewer runs the gates, the others start only after it reports. (B) The
orchestrator runs the gates once, in the foreground, and spawns all reviewers with the log
directory.

**Decision.** B. The point of the superseded decision — nothing runs twice — survives unchanged:
`gates.sh`'s PASS ledger keys on a working-tree fingerprint, so the Completion Final Validation on an
unchanged tree is a reuse, and a wave gate never re-proves what the baseline proved. What moves is
only who invokes it. The main session is the one place the harness reliably wakes after a long
command (kb:lesson/subagent-never-woken-by-harness), which is where a 5–10 minute run belongs anyway.

**Consequences.** Step 6 begins with the gate run and passes `GATES_LOG_DIR` and the failed-line
count to every reviewer; a red line is reported by the reviewers as a Critical and folded into the
merged verdict by `merge-review --gates-failed`, so one fix wave answers gates and findings. The
reviewers' definitions forbid re-running any gate. `make test-race` joins the baseline as the
detector run (measured 2026-09-22: 1m40s against 40s plain), so only the pre-review run pays for it
and `make test` stays the fast command testers and wave-2 gates use.
