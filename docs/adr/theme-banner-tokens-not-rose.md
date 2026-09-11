---
id: theme-banner-tokens-not-rose
type: decision
status: accepted
date: 2026-08-22
summary: The daemon-down banner uses dedicated banner tokens; the rose token stays reserved for the Failed state.
features: [theme, connection]
tags: [ux]
files: [web/src/style.css, web/src/render/banner.ts]
tests: []
refs: [docs/history/spec-changelog.md, plan:m0-skeleton, docs/design/design-system.md]
supersedes: []
---
**Context.** The first banner borrowed the rose colour, which the design system reserves for a session in the Failed state. Review flagged that a connection problem and a failed turn would read as the same kind of event.

**Options.** (A) Keep rose for the banner and accept the overloaded meaning. (B) Add a banner token family to the design system and return rose to Failed only.

**Decision.** B.

**Consequences.** Colour roles are added by token family, never by reuse. The same discipline later produced a danger family for destructive actions. A reviewer checking colour asks which token, not which hue.
