---
id: process-render-fixtures-record-reader-documents
type: decision
status: accepted
date: 2026-10-20
summary: A render fixture also records each session's reader listing and documents, and the harness serves the reader's two GETs from it.
features: [reader, reader-find, connection]
tags: [testing, pipeline]
files: [internal/server/renderfix.go, internal/server/renderfix_normalise.go, web/render/helpers/harness.ts, web/render/harness.spec.ts, web/render/fixtures/*.json]
tests: [TestRenderfixNormalise_Rules, TestRenderfixScenarios_GenerateDeterministically]
refs: [kb:adr/process-render-fixtures-generated-from-daemon, kb:adr/process-test-levels-journey-property-logic, kb:anchor/sessions.reader, kb:anchor/sessions.reader-file, plans/_audit/test-audit-2026-10-20-relevel.md]
supersedes: []
---
**Context.** kb:adr/process-test-levels-journey-property-logic names the find bar and the reader's
display as properties, yet a render fixture carried only `hello`, `snapshot` and `/api/repos`,
and the harness answered every other `/api/**` with 404. The reader needs two more GETs
(`kb:anchor/sessions.reader`, `kb:anchor/sessions.reader-file`), so 105 reader tests could not
leave E2E.

**Options.** (A) Keep the reader E2E. (B) A render spec that mocks the two GETs with
hand-written listings and markdown. (C) Record them from the daemon into the fixture, like
the frames.

**Decision.** C. The generator calls `GET /api/sessions/{id}/reader` for every session
before it reads the `/ws` frames (the listing's transcript scan may upsert a plan the snapshot
should carry), then `GET …/reader/file` for each document the listing names and the plan when
it exists, and records `reader: [{sessionId, listing, files: [{path, body}]}]`; a 409
(directory gone) leaves the session out. The normaliser treats `writtenAt` as a time key and
rewrites the temp root in the listing and the paths. The harness answers the two GETs from the
recording and keeps the daemon's own `not_found` shape for a document it lacks. B fails the
same way the frames would: a hand-written listing drifts from the wire silently
(kb:lesson/stale-fixture-reshaped-the-wire).

**Consequences.** Every fixture gains a `reader` key, and `check-render-fixtures` fails when the
reader's wire or a scenario's documents change. Scenarios write their documents into the
checkout with the rig's `writeDoc`. The reader's journeys — a write hook refreshing the cue,
a listing error from a live daemon — stay E2E.
