---
id: connection-dashboard-auto-opens-on-terminal
type: decision
status: accepted
date: 2026-08-31
summary: musterd opens the dashboard in the browser at startup by default, only when stdin is a real terminal; that condition, not the flag, keeps tests browser-free.
features: [connection]
tags: [ux, testing]
files: [cmd/musterd/open.go, cmd/musterd/main.go]
tests: [TestOpen_DefaultOpenWithTerminalStdinRunsStubOnce, TestOpen_DefaultOpenWithDevNullStdinNeverRunsStub, TestIsTerminal, TestResolveOnExit_AskWithNonTTYStdinIsLeave]
refs: [docs/history/spec-changelog.md, plan:tmux-installation, kb:adr/lifecycle-shutdown-leaves-sessions-running]
supersedes: []
---
**Context.** After starting the daemon the user had to find the tokenised URL in the terminal and paste it. Any automatic opening had to be impossible from a test, since the suite spawns many daemons.

**Options.** (A) An opt-in flag. (B) On by default, gated on both the flag and stdin being a real terminal, with the opener program itself a flag so tests can substitute a stub.

**Decision.** B. The terminal condition is the guarantee: every daemon spawned under test gets a null-device stdin, so no test can open a browser even if it forgets the flag.

**Consequences.** The same terminal test replaced an earlier character-device check that the null device also satisfied, which had been sending every scratch daemon into the interactive shutdown prompt and a forced kill instead of a graceful stop. A restarted daemon suppresses the auto-open. The terminal test is a POSIX fact, not a Claude Code one, so it is recorded here rather than with the wire facts.
