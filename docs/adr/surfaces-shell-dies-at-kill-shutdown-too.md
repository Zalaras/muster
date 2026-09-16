---
id: surfaces-shell-dies-at-kill-shutdown-too
type: decision
status: accepted
date: 2026-09-16
summary: A shell dies on exit, Remove, reconcile or a daemon shutdown with kill, which also counts shells in its prompt; leave leaves shells as it leaves sessions.
features: [surfaces, lifecycle]
tags: [tmux, user-decision]
files: [cmd/musterd/main.go, internal/session/manager.go, internal/server/server.go]
tests: [TestKillAllShells_KillsEveryShellAndNoClaudeSessions, TestOnExit_Kill_LiveSessionAndShellAreBothKilled, TestOnExit_Kill_ShellOnlyNoLiveSessionsStillKillsIt, TestOnExit_Leave_LiveSessionAndShellBothSurvive, TestAskKillPrompt_NamesBothCountsPluralFixed]
refs: [plan:general-cleanup, kb:adr/surfaces-shell-lifetime-until-exit-remove-or-reconcile, kb:adr/lifecycle-shutdown-leaves-sessions-running, kb:adr/surfaces-shell-pane-carries-no-session-env]
supersedes: [surfaces-shell-lifetime-until-exit-remove-or-reconcile]
---
**Context.** `-on-exit=kill` ended every Claude session and never touched the shell registry, so every `muster-<n>-shell` stayed on the socket until the next daemon start's reconcile — indefinitely if there was none — including any nested `claude` inside one firing unrouted hooks. The `ask` prompt counted live sessions only and did not mention the shells it would leave. The whole on-exit path was skipped when zero Claude sessions were alive, so shells alone never triggered it.

**Options.** (1) `kill` kills every shell too; the prompt counts them; `leave` leaves them. (2) Keep the behaviour and make the prompt say shells survive.

**Decision.** 1, the developer's ruling on 2026-09-16. "Kill" means nothing left on the socket; reconcile already kills shells on the next start, so this only moves that earlier. The on-exit path now runs when either sessions or shells are alive.

**Consequences.** After a kill shutdown no shell survives; under `leave` a shell lives until the next start's reconcile, as before. A long-running command in a shell dies under `kill` — the user asked for that. The shell's lifetime list is exit, Remove, reconcile and kill shutdown. `kb:adr/lifecycle-shutdown-leaves-sessions-running` still holds: leave is the default and leaves everything.
