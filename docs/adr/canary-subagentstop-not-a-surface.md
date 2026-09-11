---
id: canary-subagentstop-not-a-surface
type: decision
status: accepted
date: 2026-09-10
summary: The subagent stop hook is inert to Muster and its inventory row is dropped from the canary; the only subagent dependency is the agent marker on tool hooks.
features: [canary, ingest]
tags: [claude-code-format, testing]
files: [internal/claudecode/interpret.go, test/canary/canary_test.go]
tests: [TestHookFields]
refs: [docs/history/spec-changelog.md, plan:canary-full-coverage, kb:fact/subagent-hooks-carry-agent-id, kb:adr/lifecycle-subagent-marked-events-not-stragglers]
supersedes: []
---
**Context.** The subagent stop hook had a row in the canary's skip list as an interactive residual. The interpreter classifies it as inert and nothing downstream reads a field from it.

**Options.** (A) Keep the row and find a way to produce the event. (B) Drop it: a hook Muster ignores is not part of the surface the canary inventories.

**Decision.** B. The canary is the inventory of what Muster depends on, not of what Claude Code emits.

**Consequences.** Muster's only subagent dependency is the agent marker carried on tool hooks and permission requests, which the straggler guard reads; that stays a probe ritual because producing a subagent costs turns. Should the interpreter ever read the stop hook, the row returns with the code.
