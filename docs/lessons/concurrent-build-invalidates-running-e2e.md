---
id: concurrent-build-invalidates-running-e2e
type: lesson
status: active
date: 2026-09-07
summary: A stale prebuilt daemon and a build running beside a sweep each produced reds that read as implementation bugs. Rebuild, run alone, then blame.
features: []
tags: [testing]
roles: [orchestrator, e2e-validate, review, web-impl, e2e-specs]
files: []
tests: []
refs: [docs/history/design/test-strategy.md, plan:post-worktree-spike-issues, plan:m3-gauges, Makefile, .claude/agents/e2e-specs.md]
---

**What happened.** Ten of twelve specs failed at validate and looked like implementation bugs: the harness serves the prebuilt binary and assets and never rebuilds, so a bare `npm run e2e` had tested a daemon older than the implementation. In another run a sweep reported 2 failed while a `web-build` was rewriting the served bundle under it; a clean re-run was 281/281. Both review Criticals of the first run were pre-existing specs asserting the wire shape the approved delta had changed.

**Cost.** An Opus cycle on two things that were not defects, and a red indistinguishable from a UI regression until someone asked what else was running.

**What changed.** Rebuild before a targeted run — `web-build` before `build`, because the binary embeds the assets; `make e2e` orders both, `npm run e2e -- <file>` does not. A red is re-run with nothing else going before it is believed; the gates script runs sequentially, so the exposure is a human or an agent building beside a sweep. Pre-existing specs asserting the old way are the E2E agent's too, and every non-plan failure is triaged against the approved protocol delta before anyone is blamed.
