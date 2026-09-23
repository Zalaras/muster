---
id: canary-interrupt-run-preallows-bash
type: decision
status: accepted
date: 2026-09-23
summary: The interrupt run appends --allowedTools Bash to the production argv so its sleeping Bash call never waits on a permission prompt; Esc is a keystroke.
features: [canary]
tags: [claude-code-format, testing]
files: [test/canary/harness_turns_test.go]
tests: [TestInterruptEmitsNoTurnEnd]
refs: [kb:fact/interrupt-emits-no-turn-end, kb:lesson/permission-prompt-needs-unallowlisted-tool, kb:adr/canary-interactive-dialog-rows-accepted-residual, kb:adr/canary-drives-installed-claude-through-production-chain]
supersedes: []
---
**Context.** kb:fact/interrupt-emits-no-turn-end is why an interrupted card stays `working`: Esc ends the turn with no hook. Guarding it needs a tool call that is still running when Esc arrives. A Bash `sleep` works. But in an interactive session, whether Bash asks for permission depends on the developer's own allowlist, which applies to canary sessions too (kb:lesson/permission-prompt-needs-unallowlisted-tool). An Esc at a permission prompt is a rejection, not an interrupt.

**Options.** (A) Leave it probe-only. (B) Answer the permission prompt through tmux. (C) Launch with `BuildArgv`'s argv plus `--allowedTools Bash`, so no prompt appears on any machine.

**Decision.** C. B is the dialog driving that kb:adr/canary-interactive-dialog-rows-accepted-residual keeps out of the canary. Esc itself is a single keystroke on a running turn, like run D's Shift+Tab, not a dialog. The extra flag changes only what is pre-approved, and no hook or payload the canary asserts reads it.

**Consequences.** Run G is the one run whose argv departs from production. It spends one haiku turn, then holds a 70 s quiet window, longer than the ~60 s a completed turn waits for `idle_prompt`. The pane is read only as the oracle that the Esc landed ("Interrupted"), never as session state.
