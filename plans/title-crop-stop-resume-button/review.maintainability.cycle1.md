# Maintainability review: Title crop, stop/resume button

**Plan**: title-crop-stop-resume-button
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 13628 words (budget 30000)
**Scope**: 6 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (2 of them generated kb trailers); `web/index.html` read alongside because `.idrow` and `.stop-resume` are declared there

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| web/src/sessions/card.ts | sessions/context.ts; consumers render/actionbutton.ts, render/dead.ts, render/tiles.ts, render/sessions.ts | yes (`stopResumeButton` in `sessions/card.ts`) | none (size-warn: 0 hits) | Major 1 |
| web/src/render/mainhead.ts | render/dead.ts, render/tiles.ts, render/sessions.ts, render/actionbutton.ts, render/reader.ts | yes (`fitMainheadMeta` extended; `stackMeta`) | none | Minor 1, Minor 2 |
| web/src/features/focus.ts | features/launch.ts, features/rename.ts, features/actions.ts | yes (click listener mirrors group control) | none | pass (Note 2) |
| web/src/style.css | itself: `.btn` (:2693), `.mainhead .meta` (:747), `.ended-at` rules (:844-856), group-control section (:4326-4374) | yes (`.idrow`, `.stacked`, `.repo-only`, the two container queries) | none | Minor 2, Minor 3, Minor 4 |
| web/src/features/CLAUDE.md | — (generated kb trailer) | n/a | none | pass |
| web/src/render/CLAUDE.md | — (generated kb trailer) | n/a | none | pass |
| web/index.html (outside Scope, read) | render/tiles.ts's `.tfoot .acts` markup | yes (`.idrow` wrapper) | none | pass |

## Issues

### Critical

None.

### Major

1. **[web-impl]** `StopResumeButton` restates the label-to-action map that `render/actionbutton.ts` already owns. See `web/src/sessions/card.ts:130-147`. This breaks conventions § Design "Reuse before add" ("A second implementation of an existing idea is a defect even when both work") and "One owner per concept". The new view-model hard-codes `label: "Stop"` with `action: "end"` and `label: "Resume"` with `action: "resume"` (`card.ts:141`, `:143-144`). It also types `label` as a fresh `"Stop" | "Resume"` literal (`card.ts:131`) beside the existing vocabulary. The existing owners, quoted:
   ```
   web/src/sessions/card.ts:16:   export type CardAction = "Stop" | "Resume" | "Remove";
   web/src/render/actionbutton.ts:7: const ACTION_BY_LABEL: Record<CardAction, SessionAction> = {
   web/src/render/actionbutton.ts:8:   Stop: "end",
   web/src/render/actionbutton.ts:9:   Resume: "resume",
   ```
   `rg -n "CardAction|ACTION_BY_LABEL" web/src --glob '!*.test.ts'` shows the map has exactly one other home, `render/actionbutton.ts`. `sessions/` cannot import `render/`, which is why the map was written a second time. A fix must make two things true:
   - The label-to-`SessionAction` pairing is written once, in `sessions/` beside `CardAction`, and both `buildActionButton` and `stopResumeButton` read it.
   - `StopResumeButton["label"]` is typed from `CardAction`.

### Minor

1. **[web-impl]** One row test is written two ways in one file. See `web/src/render/mainhead.ts:77` and `:84-88`. This breaks § Design "Reuse before add". `onOneRow(root)` is a named helper for "element A starts above element B's bottom, with a 1 px tolerance", applied to `.acts` and `.idrow`. Six lines above it, `stackMeta` re-inlines the same comparison with the same unexplained `- 1` for `.meta` and `.name`: `metaEl.getBoundingClientRect().top < title.getBoundingClientRect().bottom - 1`. `fitMainheadMeta` now makes three layout decisions, and only one of them goes through a named predicate. A fix must make the "same row" test one named predicate over two elements, used at both sites, so the tolerance has one home.

2. **[web-impl]** The readout-floor length is now spelled out three times, once of them as a CSS string in TypeScript. This contradicts the stylesheet's own rule at `web/src/style.css:739` ("The lengths the give-way layout shares are declared once, here, and derived everywhere else") and § Design "One owner per concept".
   - `min(calc(var(--floor) + var(--sep-gap)), var(--loc-cap, 100vw))` appears at `style.css:753` (the grid track) and again, verbatim, at `style.css:837` (`.meta.stacked .loc`).
   - `web/src/render/mainhead.ts:81` writes `calc(var(--floor) + var(--sep-gap))` into `--loc-cap` from TypeScript. That composes the stylesheet's private variables in a second language, and gives `--loc-cap` a second meaning: "hold at floor", next to "the repo block's measured width", which is the only meaning its declaration comment names (`style.css:744-746`).

   A fix must make three things true:
   - The floor-plus-gap length is one named custom property declared on `.mainhead .meta`.
   - The grid track and the stacked `.loc` both derive from it.
   - The TypeScript write names that property (or toggles a state the CSS maps to it) instead of re-composing the calc.

3. **[web-impl]** `.stop-resume`'s fixed width bakes in `.btn`'s padding and border as literals. See `web/src/style.css:877` (`min-width: calc(6ch + 24px)`) and `:892` (`calc(6ch + 18px)`). This breaks § Design "One owner per concept". `box-sizing: border-box` is global (`style.css:177`), so the `24px` is `.btn`'s `padding: 5px 11px` (`style.css:2696`) plus its 1 px border, both sides. The `18px` is the compact `padding-inline: 8px` (`style.css:888`) plus the border. If either padding changes, the box stops matching "Resume" and nothing notices, and the label swap starts moving the cluster again (the property kb:adr/actions-mainhead-one-stop-resume-button pins). A fix must make the button's minimum width follow the padding it sits in, so changing `.btn`'s or the compact padding cannot desynchronise it. For example, size the label's content box, or derive both from one padding custom property.

4. **[web-impl]** The `< 460px` container query is filed away from the rules it overrides. See `web/src/style.css:4375-4386`. This breaks § Design "Match the siblings". The new `< 316px` query sits directly after the `.mainhead .acts` rules it tightens (`style.css:882`). The `< 460px` query re-places `.mainhead .meta .ended-at` and hides its `.sep`, but it is appended after the group control's `< 640px` query at the end of the file, about 3,500 lines below the `.ended-at` rules (`style.css:844-856`). Source order gives no reason for this: no later non-query rule sets `.ended-at`'s grid placement, and container queries do not depend on where `container-type` is declared. Someone reading the `.ended-at` layout will not find its narrow-width override. A fix must put the query beside the `.ended-at` rules, or say in Decisions why it cannot go there.

### Notes

1. **[note]** `web/src/render/dead.ts:74-76` still derives the dead surface's Resume inline (`!connected || !canResume(...)`, `resumeDisabledReason(session)`). That is exactly the rule `stopResumeButton`'s Resume branch now owns (`card.ts:142-147`). In Focus on a dead session, both Resume buttons are on screen together. The duplication predates this branch: the old mainhead had its own inline copy, and the branch moved it rather than adding one. `tiles.ts:291` and `render/sessions.ts:108,115` are the same rule again. A later tidy could route all of them through the view-model.
2. **[note]** `web/src/features/focus.ts:148` builds a whole render view-model with a positional `true` just to read `.action`. The `design:` line explains this, and it is correct, because `app.render()` is synchronous on every WS message (`web/src/app.ts:92`), so the store and the label never disagree at click time. Once Major 1 gives the map one owner, a direct `alive`-to-action lookup would read better. The `app.store.values().find((s) => s.id === app.state.focusedId)` lookup now appears at `focus.ts:147`, `:154`, `launch.ts:776` and `rename.ts:36`. A `focusedSession()` accessor on `App` would collapse all four, but that predates this branch.
3. **[note]** `fitMainheadMeta` (`web/src/render/mainhead.ts:56-73`) now alternates layout reads and class/property writes four times per call: clear, measure, add `.repo-only`, measure, set the cap, measure, add `.stacked`, measure `scrollWidth`. It runs on every render pass (the 1 s tick and every WS message) and every pane resize. Every write happens before the next measure in the same task, so nothing paints in between and no decision feeds on its own result, as the `design:` line says. The cost is up to four forced layouts per pass. No measurement shows it matters, so nothing is requested.
4. **[note]** Stale comment: `web/src/style.css:744-746` describes `--loc-cap` as set "only while the `↳` block is not drawn: the repo block's width plus its `·` room". `stackMeta` (`mainhead.ts:80-81`) now also writes a floor value. The comment pass owns this.
5. **[note]** Stale comment: `web/src/sessions/card.ts:121-123`, the `resumeDisabledReason` doc, still says it returns `null` when "session is alive". This branch narrowed the parameter to `Pick<Session, "claudeSessionId">`, so the function cannot see `alive`. The comment pass owns this.
6. **[note]** The comment pass dropped the doc comments on `fitMainheadMeta` and the `mainhead.ts` module header. `fitMainheadMeta` is now the most layout-dense exported function in `render/` and has no comment. If the next cycle's comment pass sees a candidate there, it should weigh it.
7. **[note]** For review-work: `web/src/style.css` no longer cites kb:adr/focus-mainhead-wraps-to-second-row-when-narrow, kb:adr/focus-group-control-stays-while-title-shortens or kb:adr/focus-repo-block-keeps-floor-beside-group-control, and all three are still `accepted`. Whether the new proposed ADRs supersede them is review-work's ADR/doc row.
8. **[note]** The `@container` breakpoints `316px` and `460px` (`style.css:882`, `:4377`) are measured constants of today's content: the cluster's natural width, and the width at which the ended clause fits. Container queries cannot take `var()`, so nothing re-derives them when labels or padding change. Decisions records the measurements, and the focus-header width sweeps are what guard them (kb:lesson/layout-invariant-needs-its-width-range).
9. **[note]** The component diagram is unchanged. `features/focus.ts` now has a value import from `sessions/card` where it had a type-only import, an edge `features` → `sessions` the diagram already draws. No new module.
