---
id: sessionend-reason-ambiguous
type: fact
status: active
date: 2026-09-11
summary: SessionEnd.reason is "other" for both a killed pane and a normal exit; only "clear" is distinguishable, and kill -9 emits nothing.
features: [lifecycle]
tags: [claude-code-format]
files: [internal/session/machine.go]
tests: [TestApplyInput_DeathHint]
refs: [spikes/FINDINGS.md]
verified: 2.1.233..2.1.267
guard: none
---
`SessionEnd.reason` values observed: `"other"` and `"clear"` (2.1.237). `"other"` covers both a
killed pane and ordinary termination, so only `"clear"` carries information. `SessionEnd` does
not fire at all on `kill -9`.

Evidence: 2.1.233 spikes (FINDINGS §5d) and the 2.1.237 probe. Not asserted by the canary;
automatable — the managed run's `SessionEnd` could assert `reason == "other"`.
