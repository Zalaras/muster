---
id: network-mode-covered-by-http-errors-only
type: lesson
status: active
date: 2026-08-31
summary: A requirement named network among failure modes; specs covered only routed HTTP errors, and an unguarded fetch surfaced as a Critical two cycles later.
features: [launch]
tags: [testing]
roles: [e2e-specs, plan-work]
files: []
tests: []
refs: [plan:new-session-dialog, .claude/agents/e2e-specs.md]
---
**What happened.** A launch-dialog requirement named `network` among its failure modes. The specs covered only routed HTTP errors, a fulfilled 500 or 404, which the code handled. A connection-level failure takes a different path, and an unguarded `fetch` rejection surfaced as a Critical two cycles later.

**Cost.** A Critical found by the reviewer that the criteria had named from the start.

**What changed.** When a requirement names failure modes, each named mode is covered distinctly. `network` means an aborted request, `route.abort()` or a killed daemon, not an error status.
