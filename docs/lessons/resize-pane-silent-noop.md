---
id: resize-pane-silent-noop
type: lesson
status: active
date: 2026-08-16
summary: tmux resize-pane exits 0 and does nothing on a single-pane window; sizing needs pty.Setsize and resize-window together, measured zero-diff at five widths.
features: [surfaces]
tags: [tmux]
roles: [daemon-impl, daemon-tests, plan-work]
files: []
tests: []
refs: [CLAUDE.md, spikes/S4-findings.md, spikes/FINDINGS.md]
---
**What happened.** The spec originally said `tmux resize-pane` must be driven to match the rendered size. The spike measured it: on a single-pane window it exits 0 and silently does nothing, because a pane is bounded by its window and cannot grow it. `pty.Setsize` alone resized the client but not the window, leaving clipping or padding; `resize-window` alone truncated, a 130-column window painted into a 100-column PTY lost 24 columns.

**Cost.** A spec line falsified before any code existed. Had it shipped, terminal geometry would never have matched the rendered size and no exit code would have said so.

**What changed.** Sizing drives `pty.Setsize` **and** `resize-window`, which was correct at 60, 80, 100, 120 and 200 columns with zero diff every time. `resize-pane` is never relied on, and a zero exit from tmux is not evidence that anything happened; the tester asserts the resulting window size.
