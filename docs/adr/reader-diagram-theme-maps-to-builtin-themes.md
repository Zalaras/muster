---
id: reader-diagram-theme-maps-to-builtin-themes
type: decision
status: accepted
date: 2026-09-15
summary: Diagrams use mermaid's dark theme under instrument and dark, default under light, and re-render from retained source on a theme change; token theming deferred.
features: [reader, theme]
tags: [ux, deferred, user-decision]
files: [web/src/features/reader.ts, web/src/theme.ts, web/src/render/diagrams.ts, web/src/reader/mermaid.ts]
tests: [web/e2e/reader-mermaid.spec.ts]
refs: [plan:mermaid-support, kb:adr/theme-pref-enum-follow-not-nullable, docs/design/design-system.md]
supersedes: []
---
**Context.** The dashboard has three themes — instrument, dark, light — chosen in Settings or followed from Claude Code's family, applied as `data-theme` on the root. A rendered diagram bakes its colours into the SVG, so it cannot follow a theme change through CSS alone.

**Options.** (A) mermaid's `base` theme fed `themeVariables` read from the dashboard's CSS tokens at render time. (B) Map the three themes onto mermaid's built-in `dark` (instrument, dark, anything unrecognised) and `default` (light), record the choice on the figure, and re-render every diagram from its retained source when `data-theme` changes. (C) Adopt mermaid 12's new redux-colour and neo defaults regardless of the dashboard theme.

**Decision.** B, at Damian's call. A is the fidelity ceiling but needs a token-to-variable mapping maintained per theme; C ignores the dashboard's light theme entirely. The re-render is driven by a `MutationObserver` on the root's `data-theme`, the one mechanism that works on both the dashboard and the pop-out page without new wiring, and it never re-fetches the file.

**Consequences.** Diagram text uses the dashboard's `--sans` stack via mermaid's `fontFamily`, so typography still follows the design system. The pop-out reads its theme once at load and has no live sync, so a theme change there takes effect on the next open. Moving to A later is a change to one pure mapping function and this record.
