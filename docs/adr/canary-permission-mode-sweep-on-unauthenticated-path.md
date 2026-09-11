---
id: canary-permission-mode-sweep-on-unauthenticated-path
type: decision
status: accepted
date: 2026-09-10
summary: Every permission-mode value is swept on the zero-token unauthenticated run and cross-checked once on the authenticated run, not a turn per mode.
features: [canary]
tags: [claude-code-format, testing]
files: [test/canary/harness_test.go, test/canary/canary_test.go]
tests: [TestLaunchFlags]
refs: [docs/history/spec-changelog.md, plan:canary-full-coverage, kb:fact/permission-mode-flag-on-wire, kb:fact/hooks-not-awaited-on-failure-exit, kb:adr/launch-permission-modes-offered-four-tabbed]
supersedes: []
---
**Context.** The launcher offers four permission modes, but the canary only exercised whichever one its runs happened to use, so a rename of an unexercised value would fail nothing. Every authenticated run burns real subscription.

**Options.** (A) One authenticated run per mode. (B) Sweep all four values on the unauthenticated path, which reaches the hook that reports the mode before the authentication failure ends the session, and cross-check the flag once on the authenticated run that also carries the name flag.

**Decision.** B. The unauthenticated path is zero-token and already proven to fire the early hooks.

**Consequences.** Three extra zero-token runs and no extra turns. The cross-check on the authenticated run guards the assumption that the unauthenticated path reports the mode the same way. Adding a fifth offered mode is one more row in the sweep.
