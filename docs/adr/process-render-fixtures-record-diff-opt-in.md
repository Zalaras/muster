---
id: process-render-fixtures-record-diff-opt-in
type: decision
status: accepted
date: 2026-11-20
summary: A render fixture records a session's diff and review only for scenarios that opt in; every other fixture answers the diff GETs 404 and shows no button.
features: [diff, connection]
tags: [testing, pipeline]
files: [internal/server/renderfix.go, internal/server/renderfix_normalise.go, internal/server/renderfix_scenarios_diff.go, web/render/helpers/harness.ts, web/render/fixtures/*.json]
tests: []
refs: [plan:diff-viewer, kb:adr/process-render-fixtures-generated-from-daemon, kb:adr/process-render-fixtures-record-reader-documents]
supersedes: []
---
**Context.** The plan said each fixture records a `diff` entry for every git-backed session, as
reader listings are recorded (kb:adr/process-render-fixtures-record-reader-documents). Doing so
rewrites about 115 existing fixtures that no render test reads a diff from.

**Options.** (A) Record for every git-backed session. (B) Record only for scenarios that set
`recordDiff`.

**Decision.** B. The `diff*` scenarios set it; every other fixture stays byte-identical, and the
harness answers the diff GETs `404` for a session with no entry, so no button shows.

**Consequences.** A render test that needs the diff button in a non-diff scenario sets `recordDiff`
on that scenario and regenerates its fixture.
