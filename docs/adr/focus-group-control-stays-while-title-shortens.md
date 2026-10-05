---
id: focus-group-control-stays-while-title-shortens
type: decision
status: accepted
date: 2026-10-05
summary: Above the 640 px breakpoint the Focus header's group control stays while a long title shortens beside it; the title gives way first, the control goes whole.
features: [focus]
tags: [ux, consensus]
files: [web/src/style.css, web/src/render/mainhead.ts]
tests: []
refs: [plan:groups, plans/groups/decisions/control-hide-rule/decision.md, kb:adr/focus-group-control-hides-below-640px-container-width, kb:adr/focus-mainhead-title-keeps-a-floor, kb:adr/focus-repo-block-keeps-floor-beside-group-control]
supersedes: []
---
**Context.** The groups plan said the control "hides before the title shortens" and also fixed its hide point at a 640 px container breakpoint. Review-browser measured a 29-character title clipped to 123–227 px across header widths 760–864 px while the control showed; with the control hidden the title read whole there. The two sentences could not both hold.

**Options.** (A) Keep the breakpoint; above it the title may shorten beside the control, never below its 6rem floor; reword REQ-10. (B) Also hide the control whenever showing it would ellipsize the title — a measure in the mainhead render; a 65-character title then hides the control at every width up to about 1160 px.

**Decision.** A, by consensus. The locked design sentence orders both: "the first thing dropped on a narrow pane — title first to a 22ch floor" — the title gives up width first and the control is the first item removed *whole*; the mockup's CSS is a pure container query. The control's distinct value is a one-click move of the focused session; the title's full text survives on its hover `title` and on the rail card.

**Consequences.** REQ-10 reads "the control hides below a 640 px content box; above it the title may shorten beside it". The hide boundary is strict: `@container (width < 640px)`. Option B stays recorded as the alternative if title loss proves costly in use.
