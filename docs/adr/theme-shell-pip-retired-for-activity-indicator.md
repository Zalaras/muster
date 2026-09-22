---
id: theme-shell-pip-retired-for-activity-indicator
type: decision
status: accepted
date: 2026-09-22
summary: The running-shell pip and its colour token are removed; a monochrome spinner and tick carrying real progress replace a dot that only meant the shell existed.
features: [theme, surfaces]
tags: [ux, user-decision]
files: [web/src/style.css, web/src/terminal/surfaceswitch.ts, web/scripts/contrast-pairs.json]
tests: []
refs: [plan:terminal-fixes-cleanup, kb:adr/theme-shell-pip-own-token, kb:adr/theme-state-hues-fixed-across-themes, kb:adr/surfaces-shell-busy-from-tmux-process-state, docs/design/design-system.md, "#31"]
supersedes: [theme-shell-pip-own-token]
---
**Context.** The shell segment carried a coloured pip whenever a shell was running. It sat where every other status dot in the UI sits, so it read as "needs your attention" when it only meant "a shell exists" — which the user already knows, having started it.

**Options.** Five were mocked against the real component at both shipped sizes (`plans/terminal-fixes-cleanup/mockups/pip-options.html`): (0) keep the coloured pip; (1) no indicator at all; (2) the label brightens from dim to full; (3) a thin underline under the label; (4) the same dot in neutral grey; (5) a prompt glyph prefix.

**Decision.** 1, extended by the developer at review: no indicator for mere existence, and in its place an indicator that carries real information — a spinner while the shell is running work, and a tick once that work finishes. The tick clears when the shell surface is next selected, or after ~3 s if that surface is already showing.

**Consequences.** The pip's dedicated colour token is removed from all three theme blocks and from both of its `contrast-pairs.json` entries, retiring `kb:adr/theme-shell-pip-own-token`'s consequence that a new theme must supply it. The spinner and tick are **monochrome** — `--fg-dim` and `--fg` — so no state hue acquires a second meaning and no replacement token is introduced, which is the same rule that produced the superseded ADR. Nine existing E2E assertions keyed on the pip are retired with it. The indicator's accessible name contract is unchanged: it is `aria-hidden`, so the button is still named exactly `shell`. What "running work" means is `kb:adr/surfaces-shell-busy-from-tmux-process-state`.
