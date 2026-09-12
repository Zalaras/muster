---
id: process-web-lint-format-biome
type: decision
status: accepted
date: 2026-09-12
summary: The web gate is Biome — three rule groups, a cognitive ceiling of fifteen, and the first formatter — cleared by refactoring; two wire validators are exempt.
features: []
tags: [testing]
files: [web/biome.json, web/package.json, Makefile, docs/conventions.md, web/src/protocol.ts]
tests: []
refs: [kb:adr/process-go-lint-complexity-ceiling-fifteen, kb:adr/process-e2e-explicit-fixtures, kb:adr/release-no-ci-test-job-yet, kb:lesson/plan-gave-no-single-owner, docs/conventions.md]
supersedes: []
---
**Context.** `web/` had no linter and, more to the point, no formatter: wrapping and spacing
drifted with whoever typed last. A strict tsconfig plus `contrast`, `e2e-lint` and
`e2e-fixture-leak-check` already covered correctness. Measured uncapped — Biome's
`--max-diagnostics` defaults to 20, the same trap golangci-lint's cap set on the Go side.

**Options.** (A) Adopt Biome's `correctness`, `suspicious` and `complexity` groups and
grandfather what they find. (B) Adopt them and clear the tree. (C) Formatter only, on the
evidence that strict TS leaves the lint half little to catch.

**Decision.** B. The lint half is genuinely thin — 7 findings across ~36,000 lines, none a
bug — but the cognitive ceiling of 15, mirroring the Go gocyclo number, found 15 functions
worth splitting, and a gate with a standing backlog teaches people to add to it.
`useLiteralKeys` is off: 175 hits, 123 of them `value["field"]` reads off a
`Record<string, unknown>`, where bracket access deliberately marks an untrusted wire field.
Width 100 follows what the tree is already authored to — 5,903 comment lines, which Biome
never reflows, wrap at p95 91. knip was rejected: it flags the Playwright type re-exports
that exist *because* `e2e-lint` forbids specs importing `@playwright/test`. The assist
(import sorting) is off as unmeasured scope.

**Consequences.** Two `biome-ignore`s, both in `protocol.ts`, both with reasons written:
`parseSession` (35) and `parseUsage` (33) score on flat per-field guards, so the number
tracks wire field count, not tangle, and a split strands the all-or-nothing invariant.
Biome's `suppressions/unused` keeps those reasons honest, so no `nolintlint` equivalent is
needed. `style.css` stays the contrast gate's alone. `make check` gains `web-lint` and — a
separate gap this closed — `web-test`, which it never ran. No CI job runs either.
