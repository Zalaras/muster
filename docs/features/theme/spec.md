---
id: theme
type: spec
status: active
date: 2026-09-12
summary: Muster theme preference and the Claude theme family poll.
features: [theme]
tags: [ux, claude-code-format]
go: [internal/server/themepoll*.go, internal/claudecode/theme*.go]
web: [web/src/features/theme.ts, web/src/theme*.ts]
e2e: [web/e2e/theme.spec.ts, web/e2e/helpers/theme.ts]
protocol: [ws.claude-theme]
refs: [kb:adr/theme-three-builtin-themes-instrument-default, kb:adr/theme-pref-follows-claude-until-picked, kb:adr/theme-pref-enum-follow-not-nullable, kb:adr/theme-claude-theme-read-only-poll, kb:adr/theme-terminal-ground-follows-claude-family, kb:adr/theme-two-layer-tokens-not-white-label, kb:adr/theme-aa-contrast-gated-in-check, kb:adr/theme-state-hues-fixed-across-themes, kb:adr/theme-type-scale-tokens-15px-root, kb:adr/stack-system-font-stacks-only, kb:fact/theme-config-key-and-enum, docs/design/design-system.md]
---
Three built-in themes ship: Instrument, the default, a conventional Dark and a standard
Light (kb:adr/theme-three-builtin-themes-instrument-default). Theming is two token layers,
semantic tokens over per-theme palette blocks, and a theme is a source block in the
stylesheet plus an entry in the client registry (kb:adr/theme-two-layer-tokens-not-white-label,
docs/design/design-system.md "Tokens and themes"). Fonts are system stacks only
(kb:adr/stack-system-font-stacks-only); type sizes come from a rem ramp
(kb:adr/theme-type-scale-tokens-15px-root). State colours keep fixed hue families in every
theme and only ever mean their state (kb:adr/theme-state-hues-fixed-across-themes). Every
theme meets the WCAG AA contrast bar for text and non-text UI, gated by a script under
`make check` (kb:adr/theme-aa-contrast-gated-in-check).

The theme preference is an enum whose default, follow, means the dashboard resolves its theme
from Claude Code's family: light gives Light, dark or unknown gives Instrument
(kb:adr/theme-pref-follows-claude-until-picked, kb:adr/theme-pref-enum-follow-not-nullable).
The daemon treats the value as opaque beyond a pattern; the client owns the registry, and a
stored name it no longer knows resolves like follow. A head script paints the last-known
theme before any module runs, so the first frame is never the wrong theme.

The daemon polls one key of Claude Code's global config file read-only on the
`-claude-theme-poll` interval and folds it to a family, light, dark or unknown
(kb:adr/theme-claude-theme-read-only-poll, kb:fact/theme-config-key-and-enum). The family
travels in the snapshot and, only when it changes, as `kb:anchor/ws.claude-theme`. The
terminal pane's ground and foreground follow that family in every Muster theme, because
Muster cannot restyle the TUI Claude Code draws; a theme change re-themes live terminals in
place (kb:adr/theme-terminal-ground-follows-claude-family). A family change never moves the
dashboard theme while an override is set, and a preference change never moves the family.

Muster never sets Claude Code's theme.
