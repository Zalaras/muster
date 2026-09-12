---
id: process-release-bumping-types-require-shipped-change
type: decision
status: accepted
date: 2026-09-12
summary: The four bumping types are reserved for commits that change the musterd binary or web/src; the hook refuses one whose staged paths all ship nothing.
features: [release]
tags: [pipeline, user-decision]
files: [.githooks/commit-msg, docs/conventions.md]
tests: []
refs: [docs/conventions.md, kb:adr/process-release-bump-map-widened-perf-refactor, kb:adr/process-release-notes-derived-from-bumping-types, kb:adr/process-release-commitlint-eleven-types, kb:adr/process-release-breaking-marker-bang-gated]
supersedes: []
---
**Context.** The bump map widened to perf and refactor so a refactor that ships changed behaviour would reach users. It never said what "ships" means, and the type list alone cannot tell. A lint-and-formatter pass in September 2026 typed its cleanups by the shape of the edit rather than by who receives it: of the ten bullets published across v0.12.4 and v0.12.5, seven described test-only or tooling-only work. Neither `internal/kb` nor `internal/triage` is in the binary's dependency set at all.

**Options.** (A) Guidance in the conventions file, enforced by whoever writes the commit. (B) Narrow the map back to feat and fix. (C) Keep the map and add its missing precondition, machine-checked like the other commit rules.

**Decision.** C, settled with Damian. A bumping type requires a staged change to the shipped artifact: the musterd binary — any package `go list -deps ./cmd/musterd` reaches, minus its test files — and the embedded dashboard, `web/src` minus its unit tests. Tests, E2E, `tools/`, `internal/kb`, `internal/triage`, docs, plans and build config take test, chore, build or docs instead, and a releasing type scoped `test` is rejected as a contradiction. B was not taken: the fault was the unstated qualifier, not the map.

**Consequences.** The hook matches the staged paths against a list of the ones that ship nothing, so anything unrecognised counts as shipped — it can only miss a case, never block an honest release, and a new tooling package fails permissively until the list catches up. `MUSTER_RELEASE=1` overrides it for an unshipped file that does change what users receive, mirroring the breaking-marker gate. Like the length cap it binds on the default branch only, since plan-branch subjects never publish. Replayed over the repo's history it refuses exactly the seven offenders with no false positive; published notes stay as they are.
