---
id: usage
type: spec
status: draft
date: 2026-09-11
summary: Masthead usage bars, per-model weekly bar, per-session context gauge, usage poll and Keychain read.
features: [usage]
tags: [claude-code-format]
go: [internal/server/usage*.go, internal/server/gauges_test.go, internal/usage/**, internal/claudecode/status*.go, internal/claudecode/usageapi*.go, internal/claudecode/credentials*.go, internal/store/usage*.go]
web: [web/src/features/usage.ts, web/src/render/masthead*.ts, web/src/render/context*.ts, web/src/sessions/context*.ts]
e2e: [web/e2e/gauges.spec.ts, web/e2e/usage-model.spec.ts, web/e2e/helpers/gauges.ts, web/e2e/helpers/usageapi.ts]
protocol: [usage.refresh, ws.usage]
---
TODO (Track 3 batch 7): current behaviour of the usage feature, present tense, no dates, no rationale.
