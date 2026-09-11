---
id: process-real-verification-post-run-by-pipeline
type: decision
status: accepted
date: 2026-08-31
summary: A plan's single real external call is run by the orchestrator from the main session under live permission approval, not by a subagent and not by hand.
features: [issue]
tags: [pipeline, user-decision]
files: [.claude/skills/orchestrate/SKILL.md]
tests: []
refs: [docs/history/spec-changelog.md, plan:issue-capture, plans/issue-capture/decisions/r1-real-post/decision.md, kb:adr/issue-auth-gh-token-at-time-of-use]
supersedes: []
---
**Context.** Every test stubs GitHub, so the plan required one real post to the repository as verification. The review subagent tried to run it and the permission classifier denied the call.

**Options.** (A) Damian runs the steps by hand after the pipeline finishes. (B) The orchestrator runs them from the main session after the fix waves and the delta re-review, where Damian approves the permission prompts live, and pastes the result into the review.

**Decision.** B.

**Consequences.** A subagent never holds the authority to make an outward-facing call; the main session does, with a human watching. The pattern generalises to any plan whose acceptance needs one real side effect.
