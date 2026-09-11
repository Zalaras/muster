---
id: surfaces-detach-on-destroy-on
type: decision
status: accepted
date: 2026-08-23
summary: Muster's tmux server runs detach-on-destroy on; the spike's off setting hops a client to another session and misroutes keystrokes.
features: [surfaces]
tags: [tmux]
files: [internal/tmux/tmux.go]
tests: [TestAttach_KillingOneOfTwoSessionsNeverMisroutesTheClientToTheOther, TestHandleTerminal_KillingOneSessionAmongMultipleNeverMisroutesToAnother]
refs: [docs/history/spec-changelog.md, plan:m2-terminal, spikes/FINDINGS.md]
supersedes: []
---
**Context.** The spike's carry-over configuration set detach-on-destroy off, which was harmless with one tmux session. Under one tmux session per Muster session, review measured that destroying a session hopped its attached client onto another session, and the next keystrokes landed in the wrong Claude.

**Options.** (A) Keep off and guard in the bridge. (B) Set on, so a destroyed session's client detaches, and the bridge reads end-of-file.

**Decision.** B. The destroy-unattached option was re-examined at the same time and kept off.

**Consequences.** The bridge maps the resulting I/O error to a clean end-of-file, the terminal socket closes with its dedicated code and nudges liveness. A test kills one of two sessions and asserts the surviving client never receives the other's bytes.
