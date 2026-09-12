---
id: process-go-lint-complexity-ceiling-fifteen
type: decision
status: accepted
date: 2026-09-12
summary: The Go lint gate adds five linters and a cyclomatic ceiling of fifteen, cleared by refactoring rather than suppression; the state machine is the one exemption.
features: []
tags: [testing]
files: [.golangci.yml, docs/conventions.md, internal/session/machine.go]
tests: []
refs: [kb:lesson/sanctioned-test-break-blinds-lint, kb:adr/release-no-ci-test-job-yet, kb:adr/lifecycle-prompt-ordering-guards, docs/conventions.md]
supersedes: []
---
**Context.** The linter set had grown by accretion and enforced nothing about the shape of a function. A probe found 107 findings behind five candidates, two of which paid for themselves at once: `exhaustive` caught a switch over `VersionStatus` missing a case, and `testifylint` caught assertions running on a polling goroutine, where `require`'s FailNow is a `runtime.Goexit` that kills the poller instead of failing the test. Counting at all needed care — golangci-lint caps identical issues at three by default, reporting 28 where the true number was 146.

**Options.** (A) Add the linters and grandfather the existing violations behind `//nolint`, leaving the gate honest for new code and the debt visible. (B) Add them and clear the tree underneath, so the gate has nothing behind it.

**Decision.** B, settled with Damian. A gate with a standing backlog of suppressions teaches people to add another one. Seventeen functions exceeded the ceiling, topping out at sixty-four, and sixteen reduced mechanically. No assertion was traded for a number: the two test functions came down by moving phase bodies into named helpers. Wrapping a phase in a `t.Run` closure does nothing, because gocyclo walks a nested function literal as part of its enclosing declaration.

**Consequences.** Two carve-outs are deliberate. `applyInput` keeps the only `//nolint`: its arms are one per wire Kind and its invariant comments cross-reference between adjacent arms, so a split would strand half an invariant where no test could catch it — `nolintlint` now forces that reason to stay written. `float-compare` is off; its thirty-nine hits compare float64s that are exact JSON literals. No CI job runs lint, so `make check` is where this binds.
