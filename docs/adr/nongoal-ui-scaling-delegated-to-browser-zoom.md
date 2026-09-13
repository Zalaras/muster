---
id: nongoal-ui-scaling-delegated-to-browser-zoom
type: decision
status: rejected
date: 2026-09-13
summary: No in-app text-size or UI-size control; browser zoom is the scaling mechanism, and the deferred textSize pref is retired rather than built.
features: [theme, settings]
tags: [never, ux, user-decision]
files: [web/src/style.css, web/src/terminal/pane.ts]
tests: []
refs: [TODO.md, kb:adr/theme-type-scale-tokens-15px-root, kb:adr/nongoal-accessibility-i18n-multiuser-other-platforms, plan:ui-text-and-focus]
supersedes: []
---
**Context.** `kb:adr/theme-type-scale-tokens-15px-root` shipped the rem ramp and deferred a control to the backlog: a `prefs.textSize` enum, a Settings segmented control beside Theme, `<html data-text-size>` driving `--fs-root`, a first-paint hint. Picking that up in a 2026-09-13 `/spec` pass, the want turned out to be *UI* size, not text size.

**Options.** (A) Build the deferred control as filed. (B) Convert the stylesheet's pixel layer to rem first, then build it. (C) Build nothing: browser zoom is the control.

**Decision.** C. A is the wrong axis and is risky: every spacing dimension in `web/src/style.css` is a pixel literal — some 200 across padding, gap, radii and fixed widths (the 300px rail, the 560/720px dialogs), no `rem` in any spacing declaration — so a `--fs-root` pref grows type inside chrome that does not move, tightening gutters and inviting overflow in the dense rail cards. B is the honest version of A, a stylesheet-wide conversion the type-scale ADR never anticipated. C scales what neither can: browser zoom scales CSS pixels, taking spacing, radii, fixed widths and the terminal together — including `pane.ts`'s hardcoded `fontSize: 12.5`, which the ramp deliberately leaves outside itself. `musterd` binds a fixed default address, so browsers persist zoom per origin: it survives reloads and restarts with no pref, no wire field, no first-paint hint.

**Consequences.** `prefs.textSize`, `data-text-size` and the segmented control are not built, and the pre-v1 backlog loses an item. The `--fs-*` ramp stays as shipped — a consistency mechanism, not a control surface — and its negative grep check still binds. Zooming shrinks the terminal's cols and resizes tmux, as resizing the window already does. Mobile is unaffected: `style.css` has no `@media` queries at all, so a responsive pass is from-scratch work a size enum neither helps nor blocks. If that pass rem-ifies the pixel layer, revisit this then.
