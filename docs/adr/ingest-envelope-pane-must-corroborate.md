---
id: ingest-envelope-pane-must-corroborate
type: decision
status: accepted
date: 2026-09-16
summary: An enveloped event routes only when its tmuxPane is present and equals the stored pane; absent or mismatched persists unrouted; empty stored pane routes.
features: [ingest]
tags: [envelope, consensus]
files: [internal/server/ingest.go, internal/claudecode/claudecodetest/claudecodetest.go, web/e2e/helpers/payloads.ts]
tests: [TestIngestRouting_CorroborationTable, TestIngestRouting_EmptyStoredPaneRoutesOnMusterSessionAlone, TestIngestRouting_EnvelopeNamingAnUnknownMusterSessionPersistsUnrouted]
refs: [plan:general-cleanup, plans/general-cleanup/decisions/envelope-pane-corroboration/decision.md, kb:anchor/ingest.envelope, kb:adr/ingest-envelope-authoritative-binding, kb:adr/lifecycle-session-ids-monotonic-never-reused, kb:fact/command-hooks-inherit-pane-env]
supersedes: []
---
**Context.** The envelope's `musterSession` was trusted on bare map membership; `session.tmux_pane` had been labelled "envelope corroboration" since the sessions migration and compared nowhere. Monotonic ids closed the severe case, leaving a straggler from before a resume on the same row. Every test fixture on both sides filled `tmuxPane` with a fake `%12` that no real pane could match.

**Options.** (A) Lenient: a pane-less envelope routes as today, a matching pane routes, a mismatch persists unrouted; fixtures default to no pane. (B) Strict: an envelope routes only with a present, matching pane; absent or mismatched persists unrouted; fixtures state the real pane at every call site.

**Decision.** B, by consensus. A would have had to flip both fixture defaults to no pane, routing every enveloped fixture through the uncorroborated branch and leaving the check load-bearing in two tests, against the convention that fixtures carry the shapes the fact records measured — the managed shape always carries a pane. The measured cost of reading the real pane is about ten milliseconds per query, one per session when memoised. An empty *stored* pane, the window between spawning the pane and recording it, is "cannot corroborate" and routes on `musterSession` alone; it is never a mismatch.

**Consequences.** A straggler from a pane the session has left is persisted unrouted rather than applied. Headless posts that carry `MUSTER_SESSION` without `TMUX_PANE` no longer route, which no managed session produces. Fixture helpers lose their pane default, so the field must be stated; e2e reads it through a scratch-socket tmux query.
