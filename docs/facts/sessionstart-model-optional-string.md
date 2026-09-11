---
id: sessionstart-model-optional-string
type: fact
status: active
date: 2026-09-11
summary: SessionStart.model, when present, is a plain model-ID string, never an object; it is absent on headless startups and on /clear.
features: [ingest, lifecycle]
tags: [claude-code-format]
files: [internal/claudecode/interpret.go]
tests: [TestInterpret_SessionStart]
refs: [spikes/FINDINGS.md]
verified: 2.1.237..canary
guard: TestHookFields
---
`SessionStart.model` is a plain model-ID string when present (e.g.
`"claude-haiku-4-5-20251001"`), never the status line's `{id, display_name}` object
(kb:fact/status-model-is-object). It is optional: present on 2 of 5 captured `SessionStart`s
(both `source:"startup"`, 2.1.237), absent on one 2.1.237 startup, absent on `source:"clear"`
(2.1.237), absent on fresh headless startups (2.1.240 probe; 2/2 on the 2.1.246 canary).

Evidence: 2026-08-20 and 2026-08-22 probes. The guard asserts the string type whenever the
field is present on the managed run's `SessionStart` and logs its absence.
