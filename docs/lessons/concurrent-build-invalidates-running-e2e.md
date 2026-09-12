---
id: concurrent-build-invalidates-running-e2e
type: lesson
status: active
date: 2026-09-07
summary: A build beside make e2e rewrites the served bundle mid-sweep; 2 'element not found' reds vanished on a clean re-run. Re-run clean before believing a red.
features: []
tags: [testing]
roles: [orchestrator, e2e-validate, review, web-impl]
files: []
tests: []
refs: [docs/history/design/test-strategy.md, plan:post-worktree-spike-issues, Makefile]
---
**What happened.** `make e2e` serves the prebuilt bundle in `internal/webui/assets/`. During a review a sweep reported 279 passed and 2 failed in the rail-order spec while a `web-build` was running alongside it; the assets were rewritten under the running tests. A clean re-run was 281/281 and the plan's gate passed independently twice more.

**Cost.** A red that was indistinguishable from a UI regression until someone asked what else was running.

**What changed.** A red of this shape is re-run with nothing else going before it is believed. The gates script runs its checks sequentially, so the pipeline itself is safe; the exposure is a human or an agent running a sweep beside a build, and an agent that builds while another sweeps.
