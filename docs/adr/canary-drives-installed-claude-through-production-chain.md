---
id: canary-drives-installed-claude-through-production-chain
type: decision
status: accepted
date: 2026-08-29
summary: The canary launches the installed claude through the production settings, shell, wrapper and enveloped POST chain; previously skipped field tests are binding.
features: [canary]
tags: [claude-code-format, testing]
files: [test/canary/harness_test.go, test/canary/canary_test.go]
tests: [TestHookTransport, TestHookFields, TestCommandHooksCarryEnvelopeOnEveryEvent]
refs: [docs/history/spec-changelog.md, docs/claude-code-versions.md, kb:adr/process-interface-probe-rig-in-repo, kb:fact/hooks-not-awaited-on-failure-exit]
supersedes: []
---
**Context.** The canary suite existed but most of its field and behaviour assertions were skipped, waiting for a harness that could produce real hook traffic. The wire-format facts the daemon depends on were therefore guarded by captures, not by a test that fails when the installed binary changes.

**Options.** (A) Keep asserting against recorded captures and re-probe by hand when something looks wrong. (B) Drive the installed claude through the same chain production uses, settings to shell to wrapper to enveloped POST, with a few cheap turns and one zero-token run, and make every skipped assertion binding.

**Decision.** B. The run costs real subscription usage, so it uses the cheapest model and trivial prompts.

**Consequences.** A version bump is gated on this run, not on reading release notes. Behaviours that need an interactive dialog stay outside the harness, recorded separately as an accepted residual. The run also surfaced that hooks are not awaited on an authentication-failure exit, which the best-effort delivery stance already tolerated.
