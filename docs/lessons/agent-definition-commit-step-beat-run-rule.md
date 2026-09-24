---
id: agent-definition-commit-step-beat-run-rule
type: lesson
status: active
date: 2026-09-24
summary: Three impl agents committed despite a run-level no-commit rule, because their definitions say to commit; each commit was broken alone.
features: []
tags: [pipeline]
roles: [orchestrator, daemon-impl, web-impl]
files: [.claude/agents/daemon-impl.md, .claude/agents/web-impl.md, .claude/agents/daemon-tests.md, .claude/agents/web-tests.md]
tests: []
refs: [plan:maintainability-cleanup, plans/maintainability-cleanup/findings.md]
---
**What happened.** A main-session-driven run told every agent not to commit, because the main session committed each unit after gating the whole tree. The agent definitions tell them to commit their own files by pathspec "even when your gate is red". In the fix wave that won three times, once even after a direct mid-run override. Each commit was broken on its own, because other units' uncommitted edits shared its files.

**Cost.** Three mixed `git reset HEAD~1` undos and re-gating.

**What changed.** The definitions need an explicit run mode for runs the main session sequences. The alternative is for such runs to accept per-agent commits and squash at landing. A louder prompt is not the fix.
