---
id: rail-activity-line-turn-aware-default-with-pref
type: decision
status: accepted
date: 2026-09-22
summary: The activity line is turn-aware by default — your prompt while a turn is open, Claude's reply once it closes — with a pref for prompt, reply or both.
features: [rail, settings, lifecycle]
tags: [ux, user-decision, claude-code-format]
files: [internal/claudecode/interpret.go, internal/session/machine.go, internal/server/prefs.go, web/src/sessions/card.ts, web/src/features/settings.ts]
tests: []
refs: [plan:rail-card-improvements, "#42", "#17", kb:fact/hook-payload-fields, kb:fact/background-completion-new-prompt-id]
supersedes: []
---
**Context.** The activity line showed Claude's closing message, set only when a turn ended, so during a turn it showed the previous reply and on a planning card nothing at all. The developer finds their own last prompt more useful, since it is shorter and names the task, and asked for it to be customisable ahead of a future summary.

**Options.** (A) Keep Claude's reply. (B) Always the user's prompt. (C) Both on two lines. (D) Turn-aware: the prompt while a turn is open, the reply once it closes. (E) A preference offering these with one as the default.

**Decision.** D as the default, behind E. The daemon keeps the user's most recent prompt from the prompt-submit hook, truncated like the reply, skipping the synthetic prompt a finished background task injects. The pref lives in the Settings dialog as Turn-aware, Your prompt, Claude's reply and Both.

**Consequences.** A working card now says what it is working on and is never stale. The daemon stores prompt text in a session column; it is already in the event table, and the rule that it is never logged extends to the new field. A future summary option slots into the same pref. Only the adapter reads the prompt field or the task-notification tag.
