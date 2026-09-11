---
id: surfaces-scrollback-affordance-not-built
type: decision
status: rejected
date: 2026-09-03
summary: No scrollbar or copy-mode surface for panes: Claude Code runs on the alternate screen by itself, so there is no buffer to scroll; tmux is not the cause.
features: [surfaces]
tags: [ux, never]
files: [web/src/terminal/pane.ts, spikes/S6-scroll-bandwidth.md]
tests: []
refs: [docs/history/todo-done.md, spikes/S6-scroll-bandwidth.md, kb:adr/surfaces-scroll-speed-via-launch-env, kb:adr/surfaces-shared-attach-single-pty, "#13"]
supersedes: []
---
**Context.** The report asking for faster scrolling also asked for a scrollback affordance. The pane's terminal is configured with no local scrollback because tmux owns it, and the obvious reading was that a design pass could surface tmux copy-mode from the browser.

**Options.** (A) A copy-mode surface driven from the dashboard. (B) Raise the terminal's local scrollback. (C) Neither: a controlled comparison showed Claude Code emits the alternate-screen switch itself on a bare PTY with no tmux in the loop, so capture with the alternate screen on returns exactly the visible screen and a copy-mode surface would open onto an empty buffer.

**Decision.** A and B are rejected; this is won't-fix, not deferred. The absence of a buffer is Claude Code's doing, and dropping tmux would change nothing.

**Consequences.** Two earlier claims must not be reintroduced: that the wheel reaches tmux copy-mode, and that a design pass on copy-mode is what is needed. Terminal bandwidth through tmux control mode is a separate later item, not a loose end of this one.
