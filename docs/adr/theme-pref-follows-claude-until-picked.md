---
id: theme-pref-follows-claude-until-picked
type: decision
status: accepted
date: 2026-09-02
summary: A Settings dialog offers Follow Claude Code, Instrument, Dark and Light as a theme pref; until the user picks, the dashboard follows Claude Code's family.
features: [theme, settings]
tags: [ux, user-decision]
files: [web/src/features/settings.ts, web/src/features/theme.ts, internal/server/prefs.go]
tests: [TestLoadPrefs_DefaultThemeIsFollow, TestHandlePutPrefs_ThemeFollowRoundTripsAfterAnOverride, web/e2e/theme.spec.ts]
refs: [docs/history/spec-changelog.md, plan:new-ui-design-colors, kb:anchor/prefs.put, kb:anchor/ws.prefs, docs/design/ux-flows.md, kb:adr/theme-claude-theme-read-only-poll, kb:adr/theme-pref-enum-follow-not-nullable]
supersedes: []
---
**Context.** Three themes needed a chooser and a sensible default. The dashboard sits beside a Claude Code TUI that already has a light or dark look, and a fresh install should not open dark next to a light terminal.

**Options.** (A) Instrument as a fixed default, chosen only from a dialog. (B) Follow Claude Code's theme family automatically with no override. (C) A basic Settings dialog off the masthead with exactly four choices, where the default is to follow Claude Code's family, light to Light and dark or unknown to Instrument, and choosing a theme sets an override that Follow Claude Code clears.

**Decision.** C, settled with Damian. Following is the default because it needs no decision on first run; the override exists because a theme is a preference, not an inference.

**Consequences.** The pref rides the existing prefs path and echo, so no new persistence. Following is live: a change in Claude Code's theme moves an unset dashboard. The Settings dialog is deliberately minimal and becomes the home for later preferences such as text size.
