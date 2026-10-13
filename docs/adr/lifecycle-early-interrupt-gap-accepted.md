---
id: lifecycle-early-interrupt-gap-accepted
type: decision
status: accepted
date: 2026-10-13
summary: An Esc before any output, API retries included, and an interrupted compaction are not detected; the card reads working until the next prompt.
features: [lifecycle]
tags: [state-machine]
files: [internal/session/interrupt.go]
tests: []
refs: [plan:state-issues, kb:fact/interrupt-before-output-leaves-no-trace, kb:fact/compact-hook-sequence, kb:adr/lifecycle-interrupt-read-from-transcript, "#78"]
supersedes: []
---
**Context.** An Esc before the turn's first output, including during API retries, puts the prompt
back in the input box. So does an Esc during compaction. Neither leaves any hook, transcript line,
`idle_prompt`, status-line change or pane-title change. Only the rendered terminal shows it, and
the hard rule bars terminal output as a state source (#78; 3 cases in the developer's live log on
2026-10-12).

**Options.** (A) Accept the gap. (B) Read the TUI's input box through tmux. (C) Time out a turn
with no events.

**Decision.** A, chosen by the developer 2026-10-12. #78 closes with plan state-issues.

**Consequences.** The card reads `working` until the next prompt, whose `UserPromptSubmit` starts a
fresh turn. The canary guards the absence (`TestInterruptBeforeOutputLeavesNoTrace`), so a Claude
Code release that starts marking it is noticed.
