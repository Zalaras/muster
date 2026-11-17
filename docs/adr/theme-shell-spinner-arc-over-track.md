---
id: theme-shell-spinner-arc-over-track
type: decision
status: accepted
date: 2026-11-17
summary: The shell busy spinner is one --fg-dim arc over a faint full --line-control ring, so its drawn ring stays centred as it turns.
features: [theme, surfaces]
tags: [ux, user-decision]
files: [web/src/style.css]
tests: [web/render/surfaces.spec.ts]
refs: [plan:sweep-2026-11-17-1, kb:adr/theme-shell-pip-retired-for-activity-indicator, docs/design/design-system.md, "#126"]
---
**Context.** The busy spinner was a `--fg-dim` ring with its top quarter transparent. Rotating a ring with one empty quarter moves its visible ink around the centre, about 1.2 px on a 9 px glyph, so the spinner looked as if it slid around instead of turning in place (#126).

**Options.** Both were mocked against the shipped CSS at both sizes (`plans/sweep-2026-11-17/mockups/spinner.html`): (a) two opposite `--fg-dim` arcs, which is balanced and keeps one grey but repeats every half turn; (b) one `--fg-dim` arc over a faint full ring in `--line-control`, which keeps the single-arc look.

**Decision.** (b), the developer's choice.

**Consequences.** The busy glyph now uses two neutral tokens, `--fg-dim` for the arc and `--line-control` for the track. This refines the "monochrome" consequence of `kb:adr/theme-shell-pip-retired-for-activity-indicator` but does not reverse it: `--line-control` is an existing neutral line token, not a state hue, and no token is added. The tick stays `--fg`. A render test measures the ring's ink bounds at four angles on both hosts and fails on a ring with a missing quarter.
