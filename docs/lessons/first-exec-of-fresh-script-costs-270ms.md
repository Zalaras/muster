---
id: first-exec-of-fresh-script-costs-270ms
type: lesson
status: active
date: 2026-09-06
summary: macOS charges ~270 ms, serialised across processes, for the first exec of a freshly written executable; one stub per test run, never one per daemon or test.
features: []
tags: [testing]
roles: [e2e-specs, daemon-tests, web-impl]
files: [web/e2e/helpers/daemon.ts, cmd/musterd/onexit_test.go]
tests: []
refs: [docs/history/design/test-strategy.md, plan:v1-cleanup, plan:post-worktree-spike-issues, kb:adr/process-faked-subprocess-boundary]
---
**What happened.** After the fixture migration the full E2E suite took 112–118 s and did not move with the worker count. Bisecting put it in daemon startup: a scratch daemon took 0.8–2.3 s to become healthy under six-way concurrency against 0.15 s at HEAD. `claude --version` runs the harness's stub, a freshly written script per daemon, and macOS charges the first exec of a new executable about 270 ms (fresh file 258–311 ms, the same file again 5 ms) and serialises those assessments across processes. The daemon package's tests paid the same tax, writing a fresh stub per spawn, about seven per run, and went red one run in three.

**Cost.** Roughly forty seconds on every suite run, and a load-flaky Go package that read like a shutdown bug.

**What changed.** The harness writes one stub per run at a content-hashed path (`ensureSharedStubClaude`); the daemon package writes one in `TestMain`. Startup median fell to 0.17 s and both packages ran 5/5 green. Never write an executable per test.
