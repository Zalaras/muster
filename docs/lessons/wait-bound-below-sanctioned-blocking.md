---
id: wait-bound-below-sanctioned-blocking
type: lesson
status: active
date: 2026-09-07
summary: A 10 s wait over 7 s of sanctioned blocking failed at 10.02 s and read as a shutdown bug; a bound clears the worst case with the arithmetic written down.
features: []
tags: [testing]
roles: [daemon-tests, review]
files: [cmd/musterd/onexit_test.go]
tests: [TestOnExit_Leave_LiveSessionSurvivesShutdown]
refs: [docs/history/design/test-strategy.md, plan:post-worktree-spike-issues]
---
**What happened.** The daemon tests' "wrote `tokens.json`" waits were bounded at 10 s on a startup path containing two bounded-but-blocking steps before the write: the tmux preflight (2 s) and the `claude --version` check (5 s). Seven seconds of sanctioned blocking under a ten-second assertion is a threshold, not a margin. `TestOnExit_Leave_LiveSessionSurvivesShutdown` failed one of three full runs at 10.02 s. In the same plan a takeover test wrote its marker into a tmux attach still setting itself up, and a views spec synchronised on a `<select>`'s DOM value rather than the rail order the code under test reads.

**Cost.** A red that read as a shutdown regression and was not one, twice investigated.

**What changed.** The bound is one named constant whose comment names the two timeouts it clears and whose failure message repeats the derivation. Synchronise on the thing production reads, not a proxy that changes earlier. Every other fix in that plan removed a timing dependence instead of widening one; a timing gate on a shared machine is a flake generator.
