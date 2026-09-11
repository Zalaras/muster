---
id: name-flag-reaches-title
type: fact
status: active
date: 2026-09-11
summary: claude --name X yields SessionStart.session_title == X and status-line session_name == X; the title survives --resume.
features: [launch, rename]
tags: [claude-code-format]
files: [internal/claudecode/launch.go, internal/claudecode/status.go]
tests: [TestStatusLineFields, TestInterpretStatus_PreFirstResponse_SessionNameSurfacesAsTitle]
refs: [plan:canary-full-coverage]
verified: 2.1.267..canary
guard: TestLaunchFlags
---
A session launched with `--name "Muster Canary"` reports `SessionStart.session_title` equal to
the flag value and a status-line `session_name` equal to it. `session_title` is absent when no
`--name` was passed (kb:fact/status-session-name-source covers that case).

The resumed session (run E, launched without `--name`) still carried `session_name: "Muster
Canary"` in its status line — the title persists across resume (1/1, logged not asserted).

Evidence: 2.1.267 canary run D, 2026-09-10, asserted on both surfaces (`TestLaunchFlags`,
`TestStatusLineFields`). The harness never launched with `--name` before 2.1.267, so lower
versions are covered by inference only.
