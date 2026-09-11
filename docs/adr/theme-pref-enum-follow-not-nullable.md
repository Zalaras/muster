---
id: theme-pref-enum-follow-not-nullable
type: decision
status: accepted
date: 2026-09-02
summary: The theme pref is an enum with a follow default, not a nullable; the daemon validates a pattern and treats the value as opaque, the client owns the registry.
features: [theme, settings]
tags: [envelope, ux]
files: [internal/server/prefs.go, web/src/theme.ts]
tests: [TestLoadPrefs_DefaultThemeIsFollow, TestHandlePutPrefs_ThemeAcceptsTheOpaquePattern, TestLoadPrefs_InvalidThemeInKVFallsBackToFollowIndependently]
refs: [docs/history/spec-changelog.md, docs/history/protocol-changelog.md, plan:new-ui-design-colors, kb:anchor/prefs.put, kb:anchor/conventions, kb:adr/theme-pref-follows-claude-until-picked]
supersedes: []
---
**Context.** The spec said the theme pref is unset until the user picks. On the wire, unset could be a null or a value, and the protocol's conventions already give null one meaning: unknown.

**Options.** (A) A nullable string, null meaning not yet chosen. (B) An enum whose default is the word follow, the same shape as the view, density and rail-sort prefs.

**Decision.** B, taken at planning. Following is a chosen behaviour, not an absence of knowledge, so it deserves a value; null keeps meaning unknown everywhere.

**Consequences.** The daemon checks the value against a short slug pattern and otherwise stores and echoes it opaquely, so adding a theme is client-only. An invalid stored value falls back to follow independently of the other prefs. The pattern is the only theme knowledge the daemon holds.
