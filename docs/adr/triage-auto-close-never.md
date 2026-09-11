---
id: triage-auto-close-never
type: decision
status: rejected
date: 2026-09-11
summary: A tripwire hit holds an issue for Damian; triage never closes one automatically, since that is an outward write driven by attacker input.
features: [triage]
tags: [security, never, user-decision]
files: [internal/triage/checks.go, internal/triage/route.go, internal/triage/apply.go]
tests: [TestTripwire, TestTripwireAcceptedFalsePositive, TestApplyRefusesHeldIssue]
refs: [docs/history/spec-changelog.md, docs/design/triage-hardening.md, kb:adr/triage-issue-closes-when-fix-lands, kb:adr/triage-program-not-model-between-github-and-todo]
supersedes: []
---
**Context.** The hardened triage pipeline carries a small high-precision phrase tripwire. When it fires, something has to happen to the issue. Closing it as spam is the obvious reflex.

**Options.** (A) Auto-close on a tripwire hit. (B) Hold: the issue is listed for Damian and nothing is written to GitHub.

**Decision.** A is rejected; B stands. An auto-close is an outward write driven by attacker input, it contradicts the settled policy that an issue closes only when its fix lands, and on a public repository a false positive silently dismisses a real user's report. Muster is a Claude Code tool, so issues legitimately discuss prompt handling; those false positives are accepted and cost a held issue, never a close.

**Consequences.** The tripwire's recall is poor by construction and nothing depends on it. The held list is empty on a normal run. A held issue still counts as untriaged until Damian acts.
