---
id: launch-form-seeds-model-and-permission-mode
type: decision
status: accepted
date: 2026-08-16
summary: The launch form asks for model and starting permission mode; the mode seeds a last-known latch that the first hook corrects.
features: [launch, lifecycle]
tags: [ux, state-machine, claude-code-format]
files: [internal/claudecode/launch.go, internal/session/machine.go, web/src/features/launch.ts]
tests: [TestLatchPermissionMode_SeedThenHookInvariant, TestLauncher_AutoPermissionModeSeedsLatchAndRepoDefault, web/e2e/permission-mode.spec.ts]
refs: [docs/history/spec-changelog.md, kb:fact/permission-mode-presence-split, kb:fact/permission-mode-flag-on-wire, kb:anchor/sessions.create, kb:anchor/state.transitions, kb:adr/launch-permission-modes-offered-four-tabbed]
supersedes: []
---
**Context.** The Planning state derives from the permission mode, but the mode reaches Muster only on some hook payloads and never on the status line, and a manual mode change in the terminal fires nothing. Between launch and the first prompt Muster had no honest value to show.

**Options.** (A) Show the mode as unknown until the first hook that carries it. (B) Ask for the starting mode on the launch form, pass it to the CLI, and seed the session with it. (C) Read the mode from the pane. C is forbidden by the no-terminal-parsing rule.

**Decision.** B. The launch form carries directory, optional title, model and starting permission mode. Launch is the one moment Muster can honestly seed the mode, because it chose the flag itself.

**Consequences.** The seed is rendered as last known, never authoritative, and is corrected by the first hook that carries the field. A manual change in the terminal stays invisible until the next such hook. The set of offered modes tracks what the CLI accepts and is amended when that set changes.
