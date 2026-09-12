---
id: sanctioned-test-break-blinds-lint
type: lesson
status: active
date: 2026-09-01
summary: golangci-lint stops at the first typecheck failure; a handed-off test break hid 2 real govet shadows in cmd/musterd until the next step. Run --tests=false too.
features: []
tags: [pipeline, testing]
roles: [daemon-impl, web-impl, orchestrator]
files: []
tests: []
refs: [plan:tmux-installation, plan:m2-terminal, .claude/agents/daemon-impl.md, .claude/skills/orchestrate/SKILL.md]
---
**What happened.** A wave-1 daemon change legitimately broke a test file the tester would repair next step. `go build ./...` does not compile test files, and `golangci-lint` stops at the first `typecheck` failure and reports nothing else in the repo. At the offending commit `go build` exited 0 and `make lint` showed exactly one issue, the handed-off break, while `--tests=false` showed two real `govet` shadows in `cmd/musterd/main.go` introduced by that same commit. The web side had the same shape earlier: a sanctioned Vitest break hid build errors until wave 2.

**Cost.** A full impl-fix plus test-rerun cycle to find findings that were already on disk.

**What changed.** An implementer whose Handoff names a test break also runs `golangci-lint run --tests=false ./...` (or a standalone `vite build`) and pastes the output; both must be clean. The wave-2 gate, `make test` plus the full `make lint`, then proves the handoff was honoured.
