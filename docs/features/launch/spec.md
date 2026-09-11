---
id: launch
type: spec
status: draft
date: 2026-09-11
summary: Launch dialog, repo browse and picker, trust prompt, project-scoped settings write, the claude argv.
features: [launch]
tags: [tmux]
go: [internal/server/browse*.go, internal/server/repos*.go, internal/server/sessions*.go, internal/claudecode/launch*.go, internal/gitutil/**, internal/store/repo*.go]
web: [web/src/features/launch.ts, web/src/render/crumbs*.ts]
e2e: [web/e2e/launch.spec.ts, web/e2e/tiles-launch.spec.ts, web/e2e/permission-mode.spec.ts, web/e2e/helpers/picker.ts]
protocol: [sessions.create, repos.list, browse.get]
---
TODO (Track 3 batch 7): current behaviour of the launch feature, present tense, no dates, no rationale.
