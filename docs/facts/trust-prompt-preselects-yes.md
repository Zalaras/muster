---
id: trust-prompt-preselects-yes
type: fact
status: retired
date: 2026-09-11
summary: Retired: through 2.1.246 the workspace-trust prompt preselected "Yes", so a bare Enter accepted it.
features: [launch, canary]
tags: [claude-code-format, testing]
files: [test/canary/harness_test.go]
tests: []
refs: [spikes/FINDINGS.md, kb:fact/trust-prompt-preselects-exit]
verified: 2.1.233..2.1.246
guard: none
---
The workspace-trust prompt preselected `Yes` (option 1), so a bare Enter accepted it and let
startup continue.

Evidence: 2.1.233 spikes (FINDINGS §9); the 2026-08-29 canary harness on 2.1.246 answered
the prompt with a blind Enter and went green. By 2.1.259 the preselection had flipped to `No,
exit` — see kb:fact/trust-prompt-preselects-exit.
