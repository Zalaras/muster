---
id: update
type: spec
status: draft
date: 2026-09-11
summary: Release check, minisign-verified apply, in-place restart with sessions re-adopted.
features: [update]
tags: [security]
go: [internal/server/update*.go, internal/selfupdate/**]
web: [web/src/features/update.ts, web/src/render/update*.ts]
e2e: [web/e2e/update.spec.ts, web/e2e/helpers/update.ts, web/e2e/helpers/releases.ts]
protocol: [update.apply, update.restart-impact, ws.update]
---
TODO (Track 3 batch 7): current behaviour of the update feature, present tense, no dates, no rationale.
