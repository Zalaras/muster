---
id: process-faked-subprocess-boundary
type: decision
status: accepted
date: 2026-09-06
summary: Go tests cross a process boundary through an injectable run function, never a PATH shim; real tmux appears only for tmux-observable assertions.
features: []
tags: [testing, tmux, user-decision]
files: [internal/tmux/preflight.go, internal/locate/spotlight.go, internal/claudecode/version.go, docs/conventions.md]
tests: [TestPreflight_ProductionSeamsAreTheExecPackage, TestPreflight_TooOld, TestRunTmuxPreflight_TooOldNamesDetectedAndMinimum, TestLocate_ReturnsPathForSingleVerifiedCandidate]
refs: [docs/history/spec-changelog.md, docs/history/design/test-strategy.md, docs/conventions.md, TODO.md, kb:adr/usage-keychain-token-read-only, kb:adr/process-tests-run-space-bearing-data-dir, kb:adr/process-e2e-explicit-fixtures, plan:v1-cleanup]
supersedes: []
---
**Context.** The Go suite was intermittently red on the default branch. Eight preflight tests forked a real tmux to read its version and bounded it with the production timeout; under package-level parallelism they hit the bound exactly. The tests exercised version parsing and a fatal-or-not decision, neither of which needs a real fork. Other packages forked the real Claude Code for a version check and Spotlight for a locate.

**Options.** (A) Run the Go suite with one package at a time, which treats the load rather than the fork and doubles the runtime. (B) A PATH shim: a fake binary ahead of the real one. (C) An injectable run function on the type that owns each subprocess call, the shape the locate package already used, with real tmux kept only where the assertion is about a PTY stream, geometry, liveness, pane environment or server options.

**Decision.** C, settled with Damian. The test daemon's version check honours the binary flag so no test forks the real Claude Code; the server's locate tests use a walk-only locator.

**Consequences.** The implementer adds the seam with the call, and tests never reach around it. A fixed list of tests that are genuinely tmux-observable keeps a real server, fixed in the plan rather than left to agent judgement. The larger server creation and attach seam was left as a follow-up and closed by a later plan. No timing threshold is gated on.
