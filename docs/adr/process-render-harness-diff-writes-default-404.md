---
id: process-render-harness-diff-writes-default-404
type: decision
status: accepted
date: 2026-11-20
summary: The render harness serves a fixture's recorded diff GETs but leaves the review writes at its default 404; a test that saves routes them to 204.
features: [diff, connection]
tags: [testing, pipeline]
files: [web/render/helpers/harness.ts, web/render/helpers/diff.ts]
tests: []
refs: [plan:diff-viewer, kb:adr/process-render-fixtures-record-diff-opt-in, kb:adr/process-render-fixtures-record-reader-documents]
supersedes: []
---
**Context.** The plan had the harness answer the comment PUT and DELETE and the ticks POST with
`204`. The render tests for a failed save rely on the harness's default `404` for any unserved
`/api/**` route.

**Options.** (A) The harness answers the writes `204`, and failure tests override it. (B) The
harness serves only the three recorded GETs; a test that needs a save to succeed routes the writes
to `204` itself.

**Decision.** B. A write that succeeds is the case a test opts into, so a test that forgets cannot
pass on a save that never happened.

**Consequences.** `web/render/helpers/diff.ts` owns the `204` write route; the harness stays
read-only like the reader's two GETs.
