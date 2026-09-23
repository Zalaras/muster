---
id: hook-await-per-event
type: fact
status: active
date: 2026-09-23
summary: SessionStart, UserPromptSubmit, PreToolUse, PostToolBatch and Stop hooks are awaited; PostToolUse does not hold the next tool; StopFailure is fire-and-forget.
features: [ingest, lifecycle]
tags: [claude-code-format]
files: [internal/claudecode/settings.go, internal/session/machine.go]
tests: []
refs: [test/rig/captures/capture-8.jsonl, kb:fact/hooks-not-awaited-on-failure-exit, kb:fact/permission-request-races-terminal-prompt, kb:adr/lifecycle-prompt-ordering-guards]
verified: 2.1.280..canary
guard: TestPostToolUseNotAwaited
---
Which hooks hold Claude Code up, measured by delaying one event's command hook (sh + curl, the
production transport) and timing the next event's start:

- **`SessionStart`** — `UserPromptSubmit` waits for it: a 1.8 s hook moved it from ~2.15 s to
  3.5–3.8 s after startup.
- **`UserPromptSubmit`** and **`PostToolBatch`** — the next API request leaves 87 ms and
  67 ms after the delayed hook exits.
- **`PreToolUse`** — each tool waits for its own hook, but the hooks of one batch's parallel
  calls overlap: eight 1 s `PreToolUse` hooks all started before the first finished.
- **`PostToolUse`** — does **not** hold the next tool. With 1 s hooks, the next tool's
  `PreToolUse` arrived before the previous tool's `PostToolUse`, 7 of 8 times. `PostToolBatch`
  still waits for every `PostToolUse`.
- **`Stop`** — `SessionEnd` waits for it.
- **`StopFailure`** — fire-and-forget. Interactive, a 1 s hook still arrived. Headless, the
  process exited without it: `SessionEnd` arrived and `StopFailure` never did.

So arrival order within one tool is always `Pre` before `Post`. Across the tools of a batch it
can invert. Without injected delay, eight parallel `Read`s ran strictly Pre→Post in turn, in
3 of 3 runs. Every inverting pair maps to the same state-machine input, so
kb:adr/lifecycle-prompt-ordering-guards absorbs it. Not measured: `Notification`,
`SubagentStop`, `PreCompact`. `PermissionRequest` runs alongside the terminal prompt
(kb:fact/permission-request-races-terminal-prompt).

Evidence: interface probe 2026-09-23, instance 8. 10 headless sessions (3 undelayed, 7
delayed), plus 1 interactive session through the fail-proxy. Guarded since 2026-09-23 by
`TestPostToolUseNotAwaited` (canary run H), for the `PostToolUse` bullet only: in a 4-call
parallel `Read` batch, the next `PreToolUse` came 0.50–0.53 s after a `PostToolUse` whose hook
lasted 1 s, and 0.22–0.25 s after one that lasted 1.5 s. The other rows stay probe-measured.
