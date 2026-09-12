---
id: validate-red-blamed-on-implementation
type: lesson
status: active
date: 2026-08-23
summary: 10 of 12 specs failed against a stale prebuilt daemon and looked like implementation bugs; both Criticals were pre-existing specs asserting the old wire shape.
features: [usage]
tags: [testing]
roles: [e2e-specs, e2e-validate, web-impl]
files: []
tests: []
refs: [plan:m3-gauges, Makefile, .claude/agents/e2e-specs.md]
---
**What happened.** Ten of twelve specs failed at validate and looked exactly like implementation bugs. The harness serves the prebuilt binary and assets and never rebuilds, so a bare `npm run e2e` had tested a daemon older than the implementation under validation. Separately, both review Criticals were pre-existing specs asserting the wire shape the approved delta had changed: mechanical expectation updates.

**Cost.** An Opus cycle spent on two things that were not defects.

**What changed.** Rebuild before a targeted run, `web-build` before `build` because the binary embeds the assets; `make e2e` has both as ordered prerequisites and a targeted `npm run e2e -- <file>` does not. Pre-existing specs asserting the old way are the E2E agent's too, and every non-plan failure is triaged against the approved protocol delta before anyone is blamed.
