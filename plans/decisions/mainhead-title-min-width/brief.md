# Decision brief: mainhead-title-min-width

**Question**: Should the Focus mainhead's title keep a 6rem minimum width, or be allowed to collapse to zero?
**Source**: user question (2026-09-29, follow-up to plan `resume-and-dangerously-allow`, commit 4c77300 on `plan/resume-followups`)
**Option A**: keep `min-width: 6rem` on `.mainhead .name` (with `flex: 0 1000 auto`), so the title never collapses below about 90px at narrow widths, at the cost of a very short title (e.g. "hi") reserving about 90px and leaving a visible gap before the bypass chip and meta line.
**Option B**: use `min-width: 0` (the title can collapse to nothing when the row is crowded, e.g. a 900px viewport with a 600px main column), so there's never a gap after a short title.

## Pinned reading list (both advocates read all of it before turn 1)
All paths are relative to `/Users/damian/Documents/code/Projects/muster-resume-followups`.
- `web/src/style.css` lines 631-730: the `.mainhead` rules as shipped on this branch.
- `web/index.html` lines 77-86: the mainhead markup (h2.name > button.rename, chip-danger, meta, then .surfseg and .acts).
- `web/src/render/mainhead.ts`: what the title and meta contain.
- `web/e2e/rename.spec.ts` around :766: the geometry test the fix must keep passing.
- `docs/features/focus/spec.md` lines 16-30: the mainhead's contents, and "a title too long for the row ends in an ellipsis, so the action row always stays in view".
- `docs/design/design-system.md` lines 90-100 and 175-225: title typography, what truncates, and rail-card title behaviour.
- `docs/adr/usage-masthead-narrow-width-shrinks-bars-truncates-model.md`: the precedent for what truncates at narrow widths.
- `docs/adr/rail-card-title-leads-and-density-ramp-corrected.md`: the rail card always shows the full title (it wraps).

## Existing measurements (web-impl, real CSS, 300-char unbroken title, bypass chip, meta "muster · main · claude-haiku-4-5-20251001")
| viewport | `.acts` right / limit | title clientWidth | meta clientWidth / full |
|---|---|---|---|
| 900 (A, 6rem) | 886 / 886 | 90 | 29 / 278 |
| 1400 (A, 6rem) | 1386 / 1386 | 342 | 277 / 278 |
| 900 (earlier `min-width: 0`, shrink weight 1000) | 886 / 886 (derived) | ~0 | ~118 / 278 (derived, not measured) |

The root font size is 15px, so 6rem = 90px. A short title narrower than 90px leaves the rest empty, and the chip and meta start after it. Safari support rules out `calc-size()`. The rail card beside the pane shows the full title.

## Rules
Up to 3 turns each, at most 400 words per turn, and advocate-a opens. Argue from the pinned docs and measurable consequences, cite file:line, steelman before rebutting, and concede when convinced. A hybrid that keeps the tested behaviour, e.g. a smaller floor, is allowed if you both agree on it. Append each turn to `debate.md` before sending it. The author of the ending turn reports once to `main`. Agent names: advocate-a (Option A), advocate-b (Option B).
