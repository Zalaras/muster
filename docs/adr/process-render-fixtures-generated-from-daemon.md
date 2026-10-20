---
id: process-render-fixtures-generated-from-daemon
type: decision
status: accepted
date: 2026-10-20
summary: Render-test fixtures are recorded from the real daemon in process by a tagged Go generator; a check in make check and the gates fails when the wire changes.
features: [connection]
tags: [testing, pipeline]
files: [internal/server/renderfix.go, internal/server/renderfix_scenarios.go, internal/server/renderfix_normalise.go, tools/renderfix/main.go, web/render/fixtures/*.json, web/render/helpers/harness.ts, web/render/harness.spec.ts, web/playwright.render.config.ts, web/scripts/render-lint.sh, Makefile]
tests: [TestRenderfixScenarios_GenerateDeterministically, TestRenderfixNormalise_Rules, TestGenThenCheck_StaleMissingAndUnexpected]
refs: [kb:adr/process-test-levels-journey-property-logic, kb:adr/process-playwright-runs-exclusive-on-machine, kb:adr/process-e2e-explicit-fixtures, kb:lesson/stale-fixture-reshaped-the-wire, kb:lesson/two-wire-shapes-accepted-hides-disagreement]
supersedes: []
---
**Context.** A render test drives the dashboard without a daemon, so something must stand in for
the `hello` and `snapshot` frames and `GET /api/repos`. A hand-written state drifts from the wire
silently and once reshaped a gauge to fit a fake (kb:lesson/stale-fixture-reshaped-the-wire). The
developer's condition: a daemon change must regenerate or verify the mock.

**Options.** (A) Typed hand-built fixtures checked by `tsc`. (B) Record from a live scratch daemon
under the exclusive lock. (C) Generate in process from the real server code.

**Decision.** C. `internal/server/renderfix*.go`, behind the `renderfix` build tag so the shipped
binary is unchanged, builds a server with a deterministic fake pane spawner, the model pre-check
off and no liveness poll, drives named scenarios through the real handlers, ingest and store, and
records the raw `hello`, `snapshot` and repos. A normaliser makes the output stable: sessions
sorted by id; every RFC3339 value mapped to `2026-01-01T00:00:00Z` plus one minute per distinct
value in first-seen order; temp roots rewritten to `/home/bob/projects`; the daemon and Claude
Code versions fixed. `go run -tags renderfix ./tools/renderfix gen` writes
`web/render/fixtures/<scenario>.json`; `check` regenerates in memory and fails on any difference,
in `make check` and every gate, so a wire change fails until the fixtures are regenerated and
their diff reviewed. Scenarios are daemon-impl's; render-tests asks for one in its Handoff. The
harness loads fixtures only through `loadFixture`, answers every unmocked `/api/**` with 404, pins
the clock to the fixture epoch, and runs under its own Playwright config holding the gate lock
shared — beside unit tests, never beside a sweep.

**Consequences.** Fixtures are never edited by hand (`render-lint` refuses a snapshot literal). The
UI parses strictly, so a fixture that stops parsing is a real wire break the check surfaces.
Liveness-dependent states come from the store path the tests use, not a poll.
