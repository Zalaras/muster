---
id: subagent-never-woken-by-harness
type: lesson
status: active
date: 2026-09-10
summary: An agent slept and polled for a backgrounded gate; the harness re-invokes only the main session when a task finishes, so the wait never ended. 60 minutes lost.
features: [canary]
tags: [pipeline]
roles: [orchestrator, daemon-impl, web-impl, daemon-tests, web-tests, e2e-specs, e2e-validate, review]
files: []
tests: []
refs: [CLAUDE.md, plan:canary-full-coverage, kb:fact/background-completion-new-prompt-id]
---
**What happened.** A subagent started a long gate in the background and then slept and polled, waiting to be told it had finished. A finished background task re-invokes the **main** session as a new prompt; a subagent is never woken, so the poll loop was waiting for a notification that cannot arrive.

**Cost.** Sixty minutes of a canary run lost to a wait with no exit condition, on a gate that had finished long before.

**What changed.** Agents run gates in the foreground and read the result when the command returns. Only the main session may wait on a background task, and it never sleeps or polls for a subagent either; the harness delivers the completion.
