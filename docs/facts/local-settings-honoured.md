---
id: local-settings-honoured
type: fact
status: active
date: 2026-09-11
summary: Project-scoped .claude/settings.json and settings.local.json alone each honour hooks, statusLine and allowedHttpHookUrls.
features: [launch, ingest]
tags: [claude-code-format, security]
files: [internal/claudecode/settings.go]
tests: [TestMergeSettings_FreshFileRegistersCommandEntryOnAllElevenEvents]
refs: [spikes/FINDINGS.md]
verified: 2.1.237..canary
guard: TestLocalSettingsHonoured
---
A project-scoped `<repo>/.claude/settings.json` honours `hooks`, `statusLine` and
`allowedHttpHookUrls`; `allowedHttpHookUrls` defined only at project scope authorised the hook
URLs (2.1.233). `.claude/settings.local.json` alone honours all three too: with `settings.json`
removed entirely, the command-wrapped `SessionStart`, http `UserPromptSubmit`/`Stop` and the
status line all delivered (2.1.237, 2026-08-20). Claude Code gitignores the local file.

Evidence: 2.1.233 spikes (FINDINGS §8) and the 2.1.237 probe. Guarded since 2026-09-12 by
`TestLocalSettingsHonoured`: the canary's scratch repo has no `.claude/settings.json` at all,
and both the command-wrapped hooks and the status line declared only in `settings.local.json`
deliver on every run.
