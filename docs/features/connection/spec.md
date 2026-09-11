---
id: connection
type: spec
status: draft
date: 2026-09-11
summary: Token and cookie auth, the /ws hello and snapshot, protocol version, connection banner, Claude version readout.
features: [connection]
tags: [auth, security]
go: [cmd/musterd/**, internal/server/server*.go, internal/server/auth*.go, internal/server/ws*.go, internal/server/state*.go, internal/server/staticserve_test.go, internal/server/fakes_test.go, internal/server/helpers_test.go, internal/webui/**]
web: [web/src/features/connection.ts, web/src/ws*.ts, web/src/protocol*.ts, web/src/api*.ts, web/src/app*.ts, web/src/dom.ts, web/src/main.ts, web/src/render/banner*.ts]
e2e: [web/e2e/auth.spec.ts, web/e2e/resilience.spec.ts, web/e2e/claude-version.spec.ts, web/e2e/embedded.spec.ts, web/e2e/type-scale.spec.ts, web/e2e/helpers/daemon.ts, web/e2e/helpers/db.ts, web/e2e/helpers/fixtures.ts]
protocol: [transport, ws, ws.hello, ws.snapshot]
---
TODO (Track 3 batch 7): current behaviour of the connection feature, present tense, no dates, no rationale.
