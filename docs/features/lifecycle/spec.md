---
id: lifecycle
type: spec
status: draft
date: 2026-09-11
summary: The session state machine, liveness, reconcile on start, shutdown policy, resume to idle.
features: [lifecycle]
tags: [state-machine, store, tmux]
go: [internal/session/**, internal/server/sessionwire*.go, internal/store/session*.go, internal/store/store*.go, internal/store/migrate*.go, internal/store/migrations/**]
web: [web/src/sessions/store*.ts, web/src/sessions/live*.ts]
e2e: [web/e2e/reconcile.spec.ts, web/e2e/helpers/session.ts]
protocol: [state, state.displayed, state.tracked, state.transitions, state.ordering, state.liveness, ws.session, ws.session-upsert]
---
TODO (Track 3 batch 7): current behaviour of the lifecycle feature, present tense, no dates, no rationale.
