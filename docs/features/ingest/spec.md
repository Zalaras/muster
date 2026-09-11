---
id: ingest
type: spec
status: draft
date: 2026-09-11
summary: Hook and status-line ingest endpoints, the envelope that binds an event to a Muster session, seq assigned at ingest.
features: [ingest]
tags: [envelope, claude-code-format]
go: [internal/server/ingest*.go, internal/claudecode/ingest*.go, internal/claudecode/interpret*.go, internal/claudecode/settings*.go, internal/claudecode/doc.go, internal/claudecode/claudecodetest/**]
web: []
e2e: [web/e2e/ingest.spec.ts, web/e2e/subagent-status.spec.ts, web/e2e/helpers/payloads.ts]
protocol: [ingest, ingest.transport, ingest.envelope]
---
TODO (Track 3 batch 7): current behaviour of the ingest feature, present tense, no dates, no rationale.
