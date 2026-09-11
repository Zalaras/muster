---
id: actions
type: spec
status: draft
date: 2026-09-11
summary: End, Resume and Remove a session, the pane snapshot for dead sessions, confirm dialogs.
features: [actions]
tags: [ux]
go: [internal/server/sessions*.go]
web: [web/src/features/actions.ts, web/src/render/confirm.ts, web/src/render/dead*.ts]
e2e: [web/e2e/actions.spec.ts]
protocol: [sessions.end, sessions.resume, sessions.remove, sessions.pane, ws.session-removed]
---
TODO (Track 3 batch 7): current behaviour of the actions feature, present tense, no dates, no rationale.
