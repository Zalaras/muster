# Plan: test-levels

**Created**: 2026-10-20
**Status**: completed
**Shape**: chore
**Work Type**: full-stack
**E2E Scope**: none
**Fixture plan**: none
**Render fixtures**: new: empty, three-states, dead-session, moved-to-worktree, groups, long-names, usage-known
**Features**: connection
**Description**: Tests live at the cheapest level that can falsify them — journeys E2E, display properties in a new daemon-less render tier fed by fixtures generated from the daemon, logic in unit tests — with the pipeline's agents, skills, lints and gates updated to route by level.

## Overview

The 2026-10-19 audit (`plans/_audit/test-audit-2026-10-19.md`) showed the E2E suite's median test is
the harness floor; most of its tests assert display properties no daemon is needed to falsify. This
plan records the level rule (kb:adr/process-test-levels-journey-property-logic), builds the render
tier and its generated fixtures (kb:adr/process-render-fixtures-generated-from-daemon), and wires a
`render-tests` role through the pipeline. No existing test is edited; `e2e-lint --census` names the
candidates for a separate audit. Run direct on `main` as ordered commits, tooling and docs only.

## Requirements

### Must Have
- **REQ-1**: `go run -tags renderfix ./tools/renderfix gen` writes one fixture per scenario under `web/render/fixtures/`; `check` fails when a daemon change alters any of them; both run in `make check` and the gates.
- **REQ-2**: `make render-test` runs `web/render/*.spec.ts` in Chromium against the built bundle with no daemon, under the shared gate lock, after `render-lint`.
- **REQ-3**: A new E2E spec whose tests never touch the daemon fails `e2e-lint`; `e2e-lint --census` reports, per existing spec, how many tests touch no daemon.
- **REQ-4**: Plans carry `R*` criteria under `### Render` with a `**Render fixtures**` header; plan-lint refuses a plan with `R*` and no render section and notes one whose `E*` outnumber the rest.
- **REQ-5**: The pipeline spawns `render-tests` after web-impl beside web-tests and in fix wave 2; the orchestrate, fix, plan-work and spec skills, the reviewers and the gate scripts route by level.

## Affected Files

### Daemon (daemon-impl)
- `internal/server/renderfix.go`, `internal/server/renderfix_scenarios.go`, `internal/server/renderfix_normalise.go`, `internal/server/renderfix_test.go` — REQ-1 (build tag `renderfix`)
- `tools/renderfix/main.go`, `tools/renderfix/main_test.go` — REQ-1
- `Makefile` — REQ-1, REQ-2

### Web (web-impl)
- `web/playwright.render.config.ts`, `web/render/helpers/harness.ts`, `web/render/harness.spec.ts`, `web/render/CLAUDE.md`, `web/scripts/render-lint.sh`, `web/scripts/e2e-lint.sh`, `web/e2e/helpers/gatelock.ts`, `web/package.json`, `web/biome.json`, `web/tsconfig.json`, `web/vitest.config.ts` — REQ-2, REQ-3

### Pipeline (orchestrator)
- `.claude/agents/render-tests.md`, `.claude/skills/render-tests/SKILL.md`, `.claude/agents/{e2e-specs,web-tests,daemon-tests,review-work}.md`, `.claude/skills/{orchestrate,plan-work,spec,fix,work-status,retro}/SKILL.md`, `.claude/skills/orchestrate/{worker-rules,review-scale}.md`, `.claude/skills/orchestrate/scripts/{gates.sh,plan-lint.sh,orch-state.py,comment-checks.py,subagent-stop-hook.sh}`, `kb.yaml`, `.githooks/commit-msg` — REQ-4, REQ-5

### Existing tests this breaks
- none

## Edge Cases
None.

## Acceptance Criteria

### Automated Checks
```checks
D1 go run -tags renderfix ./tools/renderfix check
D2 go test -tags renderfix -count=1 ./internal/server/ -run Renderfix
D3 go test -tags renderfix -count=1 ./tools/renderfix/
R1 make render-test
W1 make render-lint
W2 sh web/scripts/e2e-lint.sh
K1 make check-kb
```

### Reviewer-Verified
- **V1**: a scratch new E2E spec with only `goto` and an expect fails e2e-lint rule 6; a scratch render spec with a snapshot literal fails render-lint rule 4.
- **V2**: `plan-lint.sh` fails a scratch plan carrying `**R1**` and no `### Render`.

## Doc Delta

**connection** — becomes true:
- `web/render/helpers/**`, `web/render/harness.spec.ts` and `internal/server/renderfix*.go` are owned by the connection spec's globs.

## Out of scope
- Moving any existing E2E test to a lower level (the developer's separate audit, fed by `e2e-lint --census`).
- Additional render scenarios beyond the seven this plan generates.
