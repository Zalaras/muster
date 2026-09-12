---
id: settings
type: spec
status: active
date: 2026-09-12
summary: Settings dialog and the prefs it edits.
features: [settings]
tags: [ux]
go: [internal/server/prefs*.go]
web: [web/src/features/settings.ts]
e2e: []
protocol: [prefs.put]
refs: [kb:adr/theme-pref-follows-claude-until-picked, kb:adr/theme-pref-enum-follow-not-nullable, kb:adr/update-check-pref-governs-checking-only, kb:adr/rail-user-owned-manual-order-default, kb:adr/usage-masthead-one-selectable-model-window]
---
Preferences are one JSON object in the daemon's kv table, edited through
`kb:anchor/prefs.put` and echoed to every window as a full `prefs` message; the broadcast
is the only thing that moves a control, never its own click. The fields are view, density,
usage model, rail sort, theme and update check, each with a daemon default.

The Settings dialog, opened from the masthead, holds two sections. Theme offers Follow
Claude Code, Instrument, Dark and Light as radios; until the user picks, the dashboard
follows Claude Code's family (kb:adr/theme-pref-follows-claude-until-picked,
kb:adr/theme-pref-enum-follow-not-nullable, kb:spec/theme). Updates shows the running and
available versions, a "Check for updates daily" toggle that governs checking only, and
Update and Update-and-restart buttons (kb:adr/update-check-pref-governs-checking-only,
kb:spec/update). Changes apply immediately; there is no Save.

The other preferences are edited where they are used: the rail sort toggle in the rail head
(kb:adr/rail-user-owned-manual-order-default), the model selector in the masthead
(kb:adr/usage-masthead-one-selectable-model-window), and the view and density controls
(kb:spec/views).
