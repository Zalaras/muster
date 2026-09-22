---
id: surfaces-scrollback-affordance-claude-pane-only
type: decision
status: accepted
date: 2026-09-22
summary: The won't-fix on scroll affordances narrows to the Claude pane; its premise was re-measured and does not hold for the plain shell.
features: [surfaces]
tags: [ux, tmux]
files: [web/src/terminal/pane.ts, docs/design/design-system.md]
tests: []
refs: [plan:terminal-fixes-cleanup, spikes/S6-scroll-bandwidth.md, kb:adr/surfaces-shell-scroll-via-daemon-copy-mode, kb:adr/surfaces-shell-is-attach-target-not-session, "#13", "#45"]
supersedes: [surfaces-scrollback-affordance-not-built]
---
**Context.** `kb:adr/surfaces-scrollback-affordance-not-built` recorded scroll affordances as won't-fix, not deferred. Its premise was that Claude Code emits the alternate-screen switch itself, so tmux retains no history and copy-mode would open onto an empty buffer. That ADR is dated 2026-09-03. The plain shell surface landed two days later in plan `plain-terminal-session` and was never in its scope.

**Options.** (A) Read the won't-fix as covering every surface, and decline #45. (B) Re-measure the premise against the shell and narrow the ADR to where it still holds.

**Decision.** B. Re-measured 2026-09-21 on the same rig: a Claude pane retains nothing, exactly as recorded; a plain shell's tmux pane accumulated 179 lines of real history. The premise is true where it was measured and false for the shell, so the conclusion narrows rather than reverses.

**Consequences.** Neither claim the original ADR forbade is reintroduced. The wheel still does not reach copy-mode by itself — measured again: with `mouse off`, tmux swallows injected SGR mouse sequences and does nothing. No design pass on a copy-mode surface is proposed; the daemon issues copy-mode commands and the browser receives an ordinary redraw. The Claude pane gains no scroll affordance and `scrollback: 0` stays, now for a second measured reason: `tmux attach-session` puts the browser terminal on the alternate buffer regardless of which surface is attached, so xterm-side scrollback is unreachable either way.
