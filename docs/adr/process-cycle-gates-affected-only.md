---
id: process-cycle-gates-affected-only
type: decision
status: accepted
date: 2026-11-07
summary: Cycle and wave-2 gates test only the Go packages a change reaches; the full race suite runs once at Final Validation; check-fast parallelises check.
features: []
tags: [pipeline, testing]
files: [.claude/skills/orchestrate/scripts/affected-go-packages.py, .claude/skills/orchestrate/scripts/gates.sh, Makefile, .claude/hooks/format-on-write.sh]
tests: []
refs: [kb:adr/process-e2e-gates-scoped-full-sweep-once-at-completion, kb:adr/process-gates-run-once-by-orchestrator-before-review, kb:lesson/concurrent-e2e-across-worktrees-goes-red]
---
**Context.** Every cycle gate ran the whole Go suite (94 s plain, 161 s under the race detector)
and the `check` members serially; a fix wave was sometimes spent on formatting. The E2E gate was
already scoped per cycle with the whole suite once at Final Validation; the Go suite was not.

**Options.** (A) Keep the whole suite everywhere. (B) Scope Go tests the way E2E is scoped, keep
the full run at Final Validation, and parallelise the independent check members.

**Decision.** B. `affected-go-packages.py` lists the packages whose test build (`go list -deps`,
test imports followed transitively) reaches a package with a changed `.go` file since the
merge-base with main, including uncommitted edits; it prints `./...` when a shared file changed
(go.mod, go.sum, Makefile, embedded assets, testdata, the version record) or on any error, so a
gate never under-runs, and nothing when no Go file changed, which the gate reports as a SKIP.
`gates.sh` uses it for wave 2 and for a cycle baseline; `--full-e2e` and `--no-e2e` keep
`make test-race` over everything. `make check-fast` runs lint, web-lint, web-test, contrast,
e2e-lint, render-lint, check-versions, check-kb and hooks-test under `-j`, then test and the
render fixtures. A PostToolUse hook formats written Go and web files. Playwright's
`--only-changed` was considered and not adopted: the existing scope (specs owned by the plan's
features, changed or named, and those reached through helper edits) is a superset of changed test
files, so the flag would cut regression coverage, not time.

**Consequences.** A one-package change pays seconds instead of the suite on each wave; the
command string carries the package list, so the gate ledger reuses a PASS only for the same
scope; `make check` keeps its serial meaning and gains the hook tests.
