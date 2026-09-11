---
id: process-e2e-lint-mechanises-fixture-rules
type: decision
status: accepted
date: 2026-09-06
summary: A lint before every E2E run and in the gates fails a spec that spawns its own daemon, imports Playwright directly or sleeps; the web implementer owns it.
features: []
tags: [testing, pipeline]
files: [web/scripts/e2e-lint.sh, web/package.json, .claude/skills/orchestrate/scripts/gates.sh, .claude/agents/e2e-specs.md]
tests: []
refs: [docs/history/spec-changelog.md, docs/design/test-strategy.md, docs/conventions.md, kb:adr/process-e2e-explicit-fixtures, kb:adr/process-e2e-one-load-policy]
supersedes: []
---
**Context.** The rules the fixture decision introduced had been broken before in prose form: specs spawned daemons directly and slept. The retro rule for a rule that was broken is to mechanise it, not re-word it.

**Options.** (A) State the rules in the conventions and the E2E author's brief and rely on review. (B) A shell lint over the spec files, run by the E2E script and by the pipeline gates, that fails on a direct daemon spawn, a direct Playwright import bypassing the fixtures, or a sleep.

**Decision.** B. Ownership of the lint, the config and the fixtures module sits with the web implementer, never the E2E author, so the agent whose specs are gated cannot loosen the gate.

**Consequences.** A spec that needs something the fixtures do not offer changes the fixtures module through the implementer, which is a visible change. A later rule about transient displays was added to the same lint rather than to prose. The lint is cheap enough to run on every E2E invocation, not only in the pipeline.
