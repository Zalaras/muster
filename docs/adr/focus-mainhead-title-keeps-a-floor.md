---
id: focus-mainhead-title-keeps-a-floor
type: decision
status: accepted
date: 2026-09-29
summary: The mainhead title shrinks first and ellipsises but never below 6rem, so Focus keeps a visible, clickable rename trigger; a short title leaves a small gap.
features: [focus]
tags: [consensus]
files: [web/src/style.css]
tests: []
refs: [plans/decisions/mainhead-title-min-width/decision.md, kb:adr/usage-masthead-narrow-width-shrinks-bars-truncates-model, kb:spec/rename]
supersedes: []
---
**Context.** A long unbroken title pushed End, Resume and Remove out of view. The fix gives the title a shrink weight of 1000, so it gives up width before the meta line does. That left the question of how narrow the title may go.

**Options.** (A) A `6rem` floor. At 900px the title keeps 90px, but a title shorter than that leaves the rest of the 90px empty. (B) `min-width: 0`. No gap ever appears, but in a crowded row the title collapses to nothing, and at 900px even a short title does.

**Decision.** A, by consensus. The title is the only rename trigger in Focus, because the rail card's title is plain text. A title at zero width has no hit area, and it would satisfy "ends in an ellipsis" only by erasing the title.

**Consequences.** A title narrower than 6rem leaves up to about 70px of empty space before the chip and meta. `calc-size()` would remove that gap, but Safari lacks it.
