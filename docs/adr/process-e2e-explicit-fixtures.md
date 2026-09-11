---
id: process-e2e-explicit-fixtures
type: decision
status: accepted
date: 2026-09-06
summary: Every E2E spec declares its daemon fixture from one helpers module: fresh per test by default, per-file only when title-scoped; plans record the choice.
features: []
tags: [testing, pipeline, user-decision]
files: [web/e2e/helpers/fixtures.ts, web/e2e/helpers/daemon.ts, docs/conventions.md, .claude/skills/plan-work/SKILL.md]
tests: []
refs: [docs/history/spec-changelog.md, docs/design/test-strategy.md, docs/conventions.md, kb:adr/process-e2e-one-load-policy, kb:adr/process-e2e-lint-mechanises-fixture-rules, kb:adr/process-tests-run-space-bearing-data-dir]
supersedes: []
---
**Context.** Every E2E test started its own scratch daemon and tmux server, so a handful of workers meant a handful of daemons being created and torn down at any moment, and the suite had begun to flake under that load. The obvious cure, one daemon per spec file, was audited against every spec.

**Options.** (A) One daemon per file as a rule. (B) Fresh daemon per test everywhere, as before. (C) An explicit, lintable choice per spec: a fresh daemon per test whenever any test asserts daemon-global state or restarts the daemon; a per-test daemon with options when spawn flags depend on a computed value; one per file only when every test is title-scoped.

**Decision.** C, settled with Damian. The audit found that most per-test files legitimately need a fresh daemon because they assert rail or grid order, counts, prefs, usage, theme, recents or auto-focus on the only session, so the per-file rule would have been wrong for most of them.

**Consequences.** The fixture module is the only way a spec gets a daemon; the plan template requires the Fixture plan header and the plan lint checks for it. Migrating surfaced real hidden couplings, a spec asserting on the machine's real Claude Code version and an invariant that only held with one session, both fixed. The harness writes one stub Claude Code per run at a content-hashed path, because the operating system taxes the first execution of every freshly written script.
