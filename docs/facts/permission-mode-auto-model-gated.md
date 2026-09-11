---
id: permission-mode-auto-model-gated
type: fact
status: active
date: 2026-09-11
summary: --permission-mode auto is model-gated: on haiku the TUI prints "auto mode unavailable for this model" and every hook reports default.
features: [launch, lifecycle]
tags: [claude-code-format]
files: [internal/claudecode/launch.go, internal/session/session.go]
tests: [TestLatchPermissionMode_SeedThenHookInvariant]
refs: [spikes/FINDINGS.md, plan:fix-auto-mode-select]
verified: 2.1.259..2.1.267
guard: none
---
With `--model claude-haiku-4-5-20251001`, `--permission-mode auto` prints `auto mode
unavailable for this model`, silently falls back to `⏸ manual mode on`, and every hook reports
`permission_mode: "default"` (2/2 sessions, headless and interactive). Auto was available on
the `sonnet`, `opus` and `fable` presets (footer check, zero tokens via the fail-proxy).
Headless `-p` honours `acceptEdits`, so the fallback is the model gate, not `-p`. The gate is
evaluated before authentication: the unauthenticated `auto` run on 2.1.267 reported
`"default"`, and the banner still prints for haiku.

Evidence: 2.1.259 probe 2026-09-03; 2.1.267 canary run C. `TestLaunchFlags` accepts either
`"auto"` or `"default"` for that run and logs the observed value, so this is not guarded.
