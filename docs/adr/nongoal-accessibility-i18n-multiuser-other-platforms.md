---
id: nongoal-accessibility-i18n-multiuser-other-platforms
type: decision
status: rejected
date: 2026-08-16
summary: Accessibility, i18n, multi-user and non-macOS platforms are non-goals for a single-user tool; the one bounded exception is the WCAG AA contrast gate.
features: [theme]
tags: [ux, user-decision]
files: []
tests: []
refs: [SPEC.md, kb:adr/theme-aa-contrast-gated-in-check, kb:adr/ingest-separate-token-in-url-path]
supersedes: []
---
**Context.** Muster is a personal tool for one user on one macOS machine. Each of these concerns would add surface area the tool's only user would never exercise.

**Options.** (A) Build to a general product bar: screen-reader support, keyboard audit, translations, accounts and roles, Linux support. (B) Hold every one of them out of scope and accept a bounded exception where a piece falls out of other work for free.

**Decision.** B. The one exception is contrast: every built-in theme meets WCAG AA for text and non-text UI because a script could measure it once the theme tokens existed. Screen-reader, keyboard-audit and i18n work remain non-goals.

**Consequences.** Auth is a single token exchanged for a cookie with no notion of users. tmux and the Keychain reader are assumed present and macOS-shaped. Strings are English literals in the source. A second user or platform is a rewrite of assumptions, not a feature.
