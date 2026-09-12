---
id: shift-tab-mode-cycle-fires-no-hook
type: fact
status: active
date: 2026-09-12
summary: Cycling the permission mode with Shift+Tab fires no hook and adds no status-line field, so Muster cannot observe a manual mode change.
features: [launch, lifecycle]
tags: [claude-code-format]
files: [internal/session/machine.go, internal/claudecode/interpret.go]
tests: []
refs: [spikes/FINDINGS.md, SPEC.md, kb:adr/launch-form-seeds-model-and-permission-mode, kb:fact/permission-mode-presence-split]
verified: 2.1.233..2.1.267
guard: none
---
Pressing Shift+Tab in an interactive session cycles the permission mode and changes the TUI
footer (for example from `⏵⏵ accept edits on` to `⏸ plan mode on`), but no hook of any kind
fires and the status-line payload carries no mode field. The only mode signal Muster ever
receives is the `permission_mode` field on the hooks that carry it.

Consequence: a displayed mode is always *last known*. Muster seeds it from its own launch flag
and corrects it from the first hook that carries the field; between those points a manual cycle
is invisible.

Evidence: the step-1 spikes against 2.1.233 (FINDINGS "Manual mode cycling is invisible"),
sending Shift+Tab into a driven session and watching the capture: footer changed, no hook,
no status-line field. Not re-measured by the canary — a guard would need an interactive
keystroke and an assertion of absence.
