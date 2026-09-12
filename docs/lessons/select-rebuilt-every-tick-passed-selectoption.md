---
id: select-rebuilt-every-tick-passed-selectoption
type: lesson
status: active
date: 2026-08-30
summary: A <select> rebuilt every 1 s tick had no keyboard use, yet seven criteria stayed green via selectOption; a name-only cache key then disabled an option.
features: [usage]
tags: [ux, testing]
roles: [web-impl, e2e-specs, review]
files: []
tests: []
refs: [plan:usage-model-bar, plans/usage-model-bar/review.failed.1.md, .claude/agents/web-impl.md, .claude/agents/e2e-specs.md]
---
**What happened.** The masthead's model `<select>` was destroyed and rebuilt on every one-second render tick, so it could not be operated by keyboard and its dropdown could not stay open. Seven E2E criteria stayed green because every spec used `selectOption`, which needs no focus to survive a tick. The fix cached the node by a name-only key, which left one option permanently disabled: the next Major.

**Cost.** Two Opus review cycles on one control.

**What changed.** An interactive node persists across render passes and is rebuilt only when its option set genuinely changes; a memo key covers every input that shapes the node's attributes, not just visible text, and the inputs are listed in Decisions. E2E drives a live control through a path a real user has, focus plus keys or pointer, waits past a tick, asserts `activeElement` and node identity survive, then drives it with real keys.
