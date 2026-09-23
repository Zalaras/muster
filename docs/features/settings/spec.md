---
id: settings
type: spec
status: active
date: 2026-09-12
summary: Settings dialog and the prefs it edits.
features: [settings]
tags: [ux]
go: [internal/server/prefs*.go]
web: [web/src/features/settings.ts, web/src/render/settings*.ts]
e2e: []
protocol: [prefs.put]
refs: [kb:adr/theme-pref-follows-claude-until-picked, kb:adr/theme-pref-enum-follow-not-nullable, kb:adr/update-check-pref-governs-automatic-checking-only, kb:adr/rail-user-owned-manual-order-default, kb:adr/usage-masthead-one-selectable-model-window, kb:adr/rail-activity-line-turn-aware-default-with-pref, kb:adr/rail-card-title-leads-and-density-ramp-corrected]
---
Preferences are one JSON object in the daemon's kv table, edited through
`kb:anchor/prefs.put` and echoed to every window as a full `prefs` message; the broadcast
is the only thing that moves a control, never its own click. The fields are view, density,
usage model, rail sort, rail density, rail activity, theme and update check, each with a
daemon default.

The Settings dialog, opened from the masthead, holds three sections. Theme offers Follow
Claude Code, Instrument, Dark and Light as radios; until the user picks, the dashboard
follows Claude Code's family (kb:adr/theme-pref-follows-claude-until-picked,
kb:adr/theme-pref-enum-follow-not-nullable, kb:spec/theme). Its Rail card shows fieldset
offers Turn-aware, Your prompt, Claude's reply and Both as radios, governing which text a
rail or Tiles-strip card's activity line renders
(kb:adr/rail-activity-line-turn-aware-default-with-pref, kb:spec/rail). Updates shows the
running and available versions, a Check now button beside a "Check for updates daily"
toggle that governs automatic checking only, and Update and Update-and-restart buttons
(kb:adr/update-check-pref-governs-automatic-checking-only, kb:spec/update). Changes apply
immediately; there is no Save.

The other preferences are edited where they are used: the rail sort toggle and the rail
density control in the rail head (kb:adr/rail-user-owned-manual-order-default,
kb:adr/rail-card-title-leads-and-density-ramp-corrected), the model selector in the masthead
(kb:adr/usage-masthead-one-selectable-model-window), and the view and density controls
(kb:spec/views).
