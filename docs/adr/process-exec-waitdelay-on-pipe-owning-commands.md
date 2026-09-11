---
id: process-exec-waitdelay-on-pipe-owning-commands
type: decision
status: accepted
date: 2026-09-07
summary: Every subprocess call that reads a child's output through a pipe sets a wait delay beside its timeout, so a grandchild holding the pipe cannot hang the daemon.
features: []
tags: [testing]
files: [internal/claudecode/version.go, internal/tmux/preflight.go, docs/conventions.md]
tests: [TestInstalledVersion_DescendantHoldingStdoutDoesNotHangStartup]
refs: [docs/history/todo-done.md, plan:post-worktree-spike-issues, docs/conventions.md, kb:adr/process-faked-subprocess-boundary]
supersedes: []
---
**Context.** Startup ran the Claude Code version check with a context timeout and read its output through a pipe. The timeout killed the child, but the read still waited for end of file, so any descendant left holding the pipe hung the daemon before its first log line. A census of worktree runs found a whole E2E suite red and a scratch daemon still unresponsive twenty minutes later; a stub that happened to answer the version flag had masked it rather than fixed it.

**Options.** (A) Fix the one site. (B) Set the wait delay on every pipe-owning command in the tree, add discriminating tests with a stub that exits while a backgrounded child still holds standard output, and write the rule into the conventions so the next site gets it by default.

**Decision.** B. Seven sites had the same shape, and the failure is silent until it is total.

**Consequences.** The delay starts when the context is done or the child exits, whichever is first, then force-closes the pipes; the grandchild case needs no context at all. One line next to each command's own timeout. The same census motivated a landing queue with a verify gate, which stays post-release work.
