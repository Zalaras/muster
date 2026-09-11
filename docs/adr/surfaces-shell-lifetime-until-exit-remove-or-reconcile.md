---
id: surfaces-shell-lifetime-until-exit-remove-or-reconcile
type: decision
status: accepted
date: 2026-09-05
summary: A shell outlives End and view switches and can open on a dead session; it dies on exit, Remove or reconcile, which kills every shell rather than adopting.
features: [surfaces, lifecycle, actions]
tags: [tmux, state-machine]
files: [internal/server/shells.go, internal/session/manager.go, internal/server/sessions.go]
tests: [TestHandleEndSession_LeavesShellRunning, TestHandleCreateShell_DeadSessionSucceeds, TestReconcile_KillsEveryShellSessionUnconditionallyAndCountsThem, TestReconcile_NeverListsAnyShellSessionAsUnknown]
refs: [docs/history/spec-changelog.md, docs/history/protocol-changelog.md, plan:plain-terminal-session, kb:anchor/sessions.remove, kb:anchor/sessions.end, kb:anchor/state.liveness, kb:adr/lifecycle-reconcile-before-first-snapshot, kb:adr/actions-remove-allowed-on-live-session, kb:adr/surfaces-shell-is-attach-target-not-session]
supersedes: []
---
**Context.** A shell with no row and no state still needs a lifetime rule: what happens to it when the user looks elsewhere, when the parent Claude session ends, and when the daemon restarts and finds shells it does not remember.

**Options.** (A) Tie the shell to the parent's liveness: End kills it, and a dead session cannot open one. (B) Tie it to the parent's existence: it outlives End, may be opened on a dead session, dies with the shell process, with Remove, or at reconcile. (C) Adopt surviving shells at reconcile like sessions.

**Decision.** B, with reconcile killing rather than adopting. A shell in a finished session's directory is still useful for looking at what the session did; a shell whose parent row is gone has no home; and a shell the daemon does not remember is unattached state it cannot vouch for.

**Consequences.** Remove's contract widens to kill the sibling shell. Reconcile's unknown-session report never lists a shell, so the sweep is silent. A restart therefore loses open shells by design, which the restart-impact endpoint later lists for the user before an update applies.
