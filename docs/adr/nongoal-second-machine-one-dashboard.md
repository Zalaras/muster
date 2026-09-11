---
id: nongoal-second-machine-one-dashboard
type: decision
status: rejected
date: 2026-08-16
summary: One machine per dashboard, never a second machine or distributed sessions; remote viewing of the same machine is a separate, unbuilt question.
features: []
tags: [never, user-decision]
files: []
tests: []
refs: [SPEC.md, docs/history/interview-notes.md, kb:adr/stack-frontend-web-app-served-by-daemon, kb:adr/lifecycle-session-identity-is-tmux-target]
supersedes: []
---
**Context.** A daemon that manages tmux sessions could in principle federate over several hosts and show them in one dashboard.

**Options.** (A) Design the daemon and protocol for multiple hosts from the start. (B) One daemon, one machine, sessions identified by local tmux targets.

**Decision.** B, marked never.

**Consequences.** Session identity is a local tmux target with no host component, the daemon binds localhost, and nothing in the protocol names a machine. Viewing this one machine's dashboard from a phone is a different question, kept possible by the browser-served frontend but not built.
