---
id: surfaces-shell-busy-from-tmux-process-state
type: decision
status: accepted
date: 2026-09-22
summary: A shell is busy from its foreground command, alternate-screen flag and tty line discipline: raw mode means waiting for the user, canonical means work.
features: [surfaces]
tags: [ux, tmux]
files: [internal/tmux/tmux.go]
tests: []
refs: [plan:terminal-fixes-cleanup, spikes/S6-scroll-bandwidth.md, kb:adr/surfaces-shell-is-attach-target-not-session, kb:adr/surfaces-shell-pane-carries-no-session-env, kb:adr/theme-shell-pip-retired-for-activity-indicator, "#31"]
supersedes: []
---
**Context.** Replacing the shell pip with a spinner-and-tick needs to know when a shell is doing work. A shell has no hooks — it is not a Claude session — so the signal must come from outside the pane, and CLAUDE.md forbids deriving state by parsing terminal output.

**Options.** (A) Foreground command differs from the shell (`#{pane_current_command}`). (B) Plus an alternate-screen gate (`#{alternate_on}`). (C) Plus an output-activity gate (`#{window_activity}`). (D) Plus a CPU-time-delta gate. (E) Plus a tty line-discipline gate: `ICANON` off a `TIOCGETA` ioctl on `#{pane_tty}`. Full measurement table: `spikes/S7-shell-surface-inputs.md` §5.

**Decision.** B plus E. A program waiting for the user holds the tty in **raw** mode — zsh's zle, readline, any TUI, Claude Code's trust prompt — while a batch command leaves it **canonical**, so "is a line editor in charge" answers "is this work?" directly. Measured across seven cases with no misclassification; reading the tty does not disturb the running shell. A alone spins forever on any REPL; B alone still misses a REPL, Claude Code's trust prompt, and Claude Code under `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN`, all of which sit waiting on the normal screen.

**Consequences.** C and D are **rejected as strictly weaker** and must not be re-proposed: both exclude an idle REPL correctly, but both wrongly exclude silent zero-CPU work — `sleep 9` showed no output *and* a 0.00 s CPU delta — so a quiet `go build` would raise no indicator. One accepted false positive remains: a program reading stdin in canonical mode with no line editor (bare `cat`) reads as busy; rare, self-clearing. OSC 133 shell integration is not the better option it appears — four reasons, measured, in `spikes/S7-shell-surface-inputs.md` §6. `golang.org/x/sys` becomes a direct requirement; no new module. The gate is BSD-specific (`TIOCGETA`), which is in scope: Muster is macOS-only.
