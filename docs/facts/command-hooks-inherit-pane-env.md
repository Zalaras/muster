---
id: command-hooks-inherit-pane-env
type: fact
status: active
date: 2026-09-11
summary: Command hooks and the status-line script inherit the pane environment on every event, ~50 ms per event; an unmanaged session posts nothing.
features: [ingest]
tags: [claude-code-format]
files: [internal/claudecode/settings.go]
tests: [TestParseIngestBody_EnvelopedVsRaw]
refs: [spikes/FINDINGS.md, plan:m4-hook-lifetime]
verified: 2.1.237..canary
guard: TestCommandHooksCarryEnvelopeOnEveryEvent
---
Hook command wrappers and the status-line script see the pane environment: both `$TMUX_PANE`
and a variable injected with `tmux new-window -e MUSTER_SESSION=…` were visible to the
`SessionStart` wrapper and the status-line script, headless and interactive alike. Every event
carries it: `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `SessionEnd` wrapped in a
sh+curl hook all delivered the envelope with `$MUSTER_SESSION` (15/15 events, 3 sessions), at
about 50 ms per event — roughly 25 ms more than an http hook; the `$MUSTER_SESSION`-unset early
exit costs about 6 ms. A session without `$MUSTER_SESSION` in an instrumented directory posts
nothing.

Evidence: 2.1.237 probe 2026-08-20 (SessionStart and status line), 2.1.246 probe 2026-08-27
(every event, capture 3). The guard asserts the enveloped events of the managed run,
`tmuxPane` on the interactive `SessionStart`, and zero posts from the unmanaged run B.
