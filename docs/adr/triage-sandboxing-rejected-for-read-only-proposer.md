---
id: triage-sandboxing-rejected-for-read-only-proposer
type: decision
status: rejected
date: 2026-09-11
summary: Sandboxing the issue-reading step is not used; capability removal beats isolation for a read-only job, and the platform sandbox has no hard network boundary.
features: [triage]
tags: [security, never]
files: [.claude/agents/triage-proposer.md, docs/design/triage-hardening.md]
tests: []
refs: [docs/history/spec-changelog.md, docs/design/triage-hardening.md, kb:adr/triage-program-not-model-between-github-and-todo]
supersedes: []
---
**Context.** The natural hardening reflex for a process that reads hostile text is to isolate it: a container, or Claude Code's own sandbox around the subagent that summarises an issue.

**Options.** (A) Run the proposer inside a sandbox or container. (B) Give the proposer no capabilities to contain: a tools field holding only Read, a tiny enum-constrained reply, and validation by the program that spawned it.

**Decision.** A is rejected; B stands. Containment is for execution and the proposer has none. The platform sandbox's strict network allowlist is user or managed scope only, so project settings cannot make a hard boundary, and it would add permission prompts, which is added involvement for no added safety.

**Consequences.** The one residual is that the proposer's reply enters the main session's context unconditionally; it is bounded by the reply's shape, not by isolation, and is recorded as not closed.
