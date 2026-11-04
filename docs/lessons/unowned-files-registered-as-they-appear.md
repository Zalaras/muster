---
id: unowned-files-registered-as-they-appear
type: lesson
status: active
date: 2026-11-04
summary: New files were registered only as each gate went red on them — a refused commit and three re-run gates; check-kb and the inventory now run after each step.
features: []
tags: [pipeline]
roles: [orchestrator]
files: []
tests: []
refs: [plan:restart-latest-claude, kb:adr/process-unowned-file-globs-land-before-approval, plans/restart-latest-claude/orchestration-state.json]
---
**What happened.** The plan-lint NOTE named four new files no feature owned, and agents added three more (`internal/session/restart.go`, `web/render/restart.spec.ts`, `internal/session/main_test.go`). The orchestrator registered each only when something refused it: the pre-commit guard on its own commit, the wave-1 gate on the features `CLAUDE.md` inventory and the render spec's glob, then the 400-word budget on that inventory, then the wave-2 gate on the test template.

**Cost.** A refused commit and three gate re-runs, each queued behind another worktree's gate lock.

**Lesson.** After each impl or test step, run `make check-kb` and the features inventory before its gate, and register every new file then (spec glob, package `CLAUDE.md` inventory), so no gate goes red on registry wiring.
