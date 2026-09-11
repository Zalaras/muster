---
id: background-completion-new-prompt-id
type: fact
status: active
date: 2026-09-11
summary: A finished background task re-invokes the main agent as a UserPromptSubmit with a new prompt_id whose prompt begins <task-notification>.
features: [lifecycle]
tags: [claude-code-format]
files: [internal/session/machine.go]
tests: []
refs: [spikes/FINDINGS.md, "#14"]
verified: 2.1.259..2.1.267
guard: none
---
When a background task (subagent or shell) finishes, the main agent is re-invoked as a
`UserPromptSubmit` with a new `prompt_id` whose `prompt` begins `<task-notification>`; that
turn is closed by its own `Stop`. 3/3 completions, one per finished task.

Evidence: 2.1.259 probe 2026-09-03 (capture-6), issue #14. Ritual-only (needs a backgrounded
subagent).
