---
id: lifecycle-interrupt-read-from-transcript
type: decision
status: accepted
date: 2026-10-01
summary: An interrupt emits no hook, so the daemon reads the transcript's interrupt line on each liveness-poll tick while a turn is open; for interrupts only.
features: [lifecycle]
tags: [state-machine, claude-code-format]
files: [internal/claudecode/interpret_transcript.go, internal/session/interrupt.go, internal/session/machine.go]
tests: []
refs: [plan:status-inconsistencies, kb:fact/interrupt-recorded-in-transcript, kb:fact/interrupt-emits-no-turn-end, "#59"]
supersedes: []
---
**Context.** Esc mid-turn, Esc on a permission prompt and a plain "No" on one each end the turn
with no hook of any of the 31 events Claude Code 2.1.285 offers, and nothing in the status line
marks it. The card read `working` (or `needs_input`) until the next prompt. The only record is a
transcript `user` line `[Request interrupted by user…` carrying the turn's `promptId`. The hard
rule said state comes from hooks and the status line only.

**Options.** (A) Leave it as an honest gap. (B) Read the transcript's interrupt line, triggered by
status posts. (C) Read it on the liveness-poll tick (~5 s) while a turn is open.

**Decision.** C, approved by the developer 2026-09-30. The Claude Code package owns the read and
the marker text; the session package gets an injected checker and applies a neutral
turn-interrupted input for the current prompt only, landing `idle` exactly as `Stop` would, minus
`lastActivity`. The transcript is a state source for this case alone; the hard rule is amended to
say so.

**Consequences.** An interrupt shows within ~5 s. The poll reads a transcript tail per open-turn
session per tick. Plan feedback, which continues the turn, writes no such line. A Claude Code bump
that renames the marker would silently regress this, so the static canary tier asserts the string.
