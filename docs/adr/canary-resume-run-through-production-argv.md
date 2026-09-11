---
id: canary-resume-run-through-production-argv
type: decision
status: accepted
date: 2026-09-10
summary: The canary resumes a real session through the production resume argv and asserts the same session id, retiring the manual end-then-resume check.
features: [canary]
tags: [claude-code-format, testing]
files: [test/canary/harness_test.go, internal/claudecode/launch.go]
tests: [TestPlanModeSequence, TestNotifications]
refs: [docs/history/spec-changelog.md, plan:canary-full-coverage, kb:fact/resume-keeps-session-identity, kb:adr/lifecycle-resume-rebinds-existing-session]
supersedes: []
---
**Context.** Resume was verified once by a probe and then by a manual ritual Damian ran by hand: end a real session from the dashboard, resume it, confirm the start event carries the same session id. Nothing automated exercised the resume flag or the argv the daemon builds for it.

**Options.** (A) Keep the manual ritual. (B) Add a canary run that resumes the previous authenticated run through the production argv builder, zero-token, and drives one further turn in the resumed session so the interactive rows can be asserted there too.

**Decision.** B. The resumed session is also where the plan-mode turn runs, so the run pays for itself.

**Consequences.** The manual check is retired. The resume argv is now guarded against a flag rename. One extra subscription turn in total, since the resumed session's turn replaces a turn that would otherwise have needed its own session.
