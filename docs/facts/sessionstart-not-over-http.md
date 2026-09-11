---
id: sessionstart-not-over-http
type: fact
status: active
date: 2026-09-11
summary: SessionStart is silently never delivered over a type:"http" hook; the other nine events are. A type:"command" hook delivers it.
features: [ingest]
tags: [claude-code-format]
files: [internal/claudecode/settings.go]
tests: [TestMergeSettings_FreshFileHasNoHTTPEntry]
refs: [spikes/FINDINGS.md, plan:m4-hook-lifetime]
verified: 2.1.233..canary
guard: TestHookTransport
---
A `SessionStart` hook registered with `type:"http"` is never delivered, and nothing reports it:
no TUI warning, no log line. `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`,
`StopFailure`, `SessionEnd`, `Notification`, `SubagentStop` and `PermissionRequest` all deliver
over http. A `type:"command"` hook delivers `SessionStart`.

Evidence: step-1 spikes against 2.1.233 (FINDINGS §1, capture-1). The guard asserts the
command-wrapper half on every canary run: each event of the headless managed run,
`SessionStart` included, arrives through the command hook with the envelope and a `session_id`.
Muster has registered no http hooks since m4-hook-lifetime, so the http negative itself is not
re-driven per version.
