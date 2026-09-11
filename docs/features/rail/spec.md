---
id: rail
type: spec
status: draft
date: 2026-09-11
summary: Rail cards, attention versus manual order, pin, drag reorder, session count.
features: [rail]
tags: [ux]
go: [internal/server/sessions*.go, internal/session/railorder*.go]
web: [web/src/features/rail.ts, web/src/render/sessions*.ts, web/src/render/dragreorder.ts, web/src/sessions/card*.ts, web/src/sessions/railorder*.ts, web/src/sessions/format*.ts, web/src/sessions/sort*.ts]
e2e: [web/e2e/rail-order.spec.ts, web/e2e/rail-cards.spec.ts, web/e2e/helpers/railorder.ts]
protocol: [sessions.pin, sessions.order]
---
TODO (Track 3 batch 7): current behaviour of the rail feature, present tense, no dates, no rationale.
