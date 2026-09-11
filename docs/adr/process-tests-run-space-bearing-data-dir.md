---
id: process-tests-run-space-bearing-data-dir
type: decision
status: accepted
date: 2026-08-25
summary: Tests execute the generated hook and status-line command strings through sh from a data dir with a space, against a live handler.
features: [ingest]
tags: [testing]
files: [internal/server/settings_shell_test.go, web/e2e/helpers/daemon.ts, test/canary/canary_test.go]
tests: [TestWrapperScriptsShellRoundTrip, TestWrapperScriptsShellRoundTrip_UnmanagedSessionProducesZeroRequests]
refs: [docs/history/spec-changelog.md, plan:m4-hook-quoting, kb:fact/hook-commands-are-shell-lines, kb:adr/ingest-shell-quote-at-write-boundary]
supersedes: []
---
**Context.** A gauges milestone shipped green while no real status-line data had ever reached the daemon, because every test used a space-free scratch directory and none executed the wrapper scripts the settings referenced.

**Options.** (A) Add a unit test of the quoting function and leave the chain untested. (B) Take both command strings verbatim from the generated settings file, run them through the shell from a space-bearing directory against a live handler, and give the E2E harness a scratch data dir whose name carries a space.

**Decision.** B.

**Consequences.** A regression in quoting, script permissions or the envelope fails a test that reads exactly what Claude Code would read. The E2E suite runs on the production path shape by construction. The canary carries the same assertion against the real binary at each version bump.
