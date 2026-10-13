# Maintainability review: Title crop, stop/resume button

**Plan**: title-crop-stop-resume-button
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 13628 words (budget 30000)
**Scope**: 7 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (2 of them generated kb trailers). This is a full review, not a delta: cycle 1 carried a Major. `web/index.html` was read alongside, because `.idrow`, `.stop-resume` and the `.ended-at` markup are declared there.

## Cycle 1 issues, re-checked

| Cycle 1 issue | Fix commit | Verified how |
|---|---|---|
| Major 1: label-to-action map written twice | 65467313 | `rg -n "ACTION_BY_LABEL\|CardAction\b" web/src --glob '!*.test.ts'` returns one definition (`sessions/card.ts:25-29`, `as const satisfies Record<CardAction, SessionAction>`). Its readers are `render/actionbutton.ts:5,19` and `card.ts:148,151`. `StopResumeButton["label"]` is `Extract<CardAction, "Stop" \| "Resume">` (`card.ts:137`). |
| Minor 1: "same row" test written two ways | 65467313 | `render/mainhead.ts:90-92` `sharesRow(el, other)` is the one place the 1 px tolerance lives. `onOneRow` (`:84`) and `stackMeta` (`:77`) both call it. |
| Minor 2: readout floor spelled out three times | 65467313 | `--loc-floor` and `--loc-min` are declared once (`style.css:754-755`). The grid track (`:760`) and `.meta.stacked .loc` (`:839`) read `--loc-min`, and `stackMeta` writes `var(--loc-floor)` (`mainhead.ts:81`). `rg "calc\(var\(--floor\) \+ var\(--sep-gap\)\)"` has one hit, the declaration. |
| Minor 3: padding literals in `.stop-resume` width | 65467313 | `style.css:901-904` sets `box-sizing: content-box; min-width: 6ch`. `rg "6ch \+"` has no hits. |
| Minor 4: `< 460px` query filed far from its rules | 65467313 | Fixed by removing the query: `rg "460px" web/src/style.css` has no hits. The only container query left in the section, `< 316px`, sits right after the `.mainhead .acts` rules it tightens (`style.css:908`). |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| web/src/sessions/card.ts | consumers render/actionbutton.ts, render/dead.ts, render/tiles.ts, render/sessions.ts, render/mainhead.ts, features/focus.ts | yes (`stopResumeButton` in `sessions/card.ts`; `ACTION_BY_LABEL` move in Fix Attempt 2) | none (`size-warn: 0 hits`) | pass (Note 1) |
| web/src/render/actionbutton.ts | render/sessions.ts, render/tiles.ts | yes (Fix Attempt 2, Major 1) | none | pass |
| web/src/render/mainhead.ts | render/dead.ts, render/tiles.ts, render/sessions.ts, render/actionbutton.ts, render/masthead.ts, the module-header line of every `render/*.ts` | yes (`fitMainheadMeta` extended; `stackMeta`; `sharesRow`) | none | pass (Notes 2, 6) |
| web/src/features/focus.ts | features/launch.ts:776, features/rename.ts:36, its own group-control listener at `:153-156` | yes (click listener mirrors the group control) | none | pass (Note 3) |
| web/src/style.css | itself: `.mainhead` (:641), the `[hidden]` companion rules (:207-1774), the `.acts-row` opacity rationale (:1637-1646), `.surfseg` (:925) | yes (`.idrow`, `.stacked`, `.repo-only`, the ended-clause slot, `:has()`, `--ended-w`, the `< 316px` query) | none | pass (Notes 4, 5, 7, 8) |
| web/src/features/CLAUDE.md | (generated kb trailer) | n/a | none | pass |
| web/src/render/CLAUDE.md | (generated kb trailer) | n/a | none | pass |
| web/index.html (outside Scope, read) | render/tiles.ts's `.tfoot .acts` markup | yes (`.idrow` wrapper) | none | pass |

Shared state: nothing new is written from more than one place except `.meta`'s `stacked` class, `.loc`'s `repo-only` class and `--loc-cap`. These have two callers, the render pass (`mainhead.ts:170`) and the pane `ResizeObserver` (`focus.ts:137-139`), and both reach them only through `fitMainheadMeta`. Every call clears all three first and recomputes them synchronously on the main thread, so no interleaving can leave a half-written state. The `design:` line names `fitMainheadMeta` as the sole owner. Layering: no new `protocol/` import in `render/` (`mainhead.ts:1`'s `Session` type import predates the branch), and `main.ts` is untouched.

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** The Resume enablement rule is still written in four places besides `stopResumeButton` (`sessions/card.ts:143-155`): `render/dead.ts:74-76`, `render/tiles.ts:291` and `render/sessions.ts:108,115`. On a dead session in Focus, the header button and the dead surface's cap button both show Resume. This predates the branch (cycle 1 Note 1), so nothing is requested. A later tidy could route the dead surface's cap through the view-model.
2. **[note]** `stackMeta` (`render/mainhead.ts:76,79`) looks up `.name` and `.rename` by selector from `root`. `MainheadElements` already holds both as `nameEl` and `renameBtn`, resolved once in `features/focus.ts:110,114`. The cause is the `(metaEl, root)` signature: the only two callers (`mainhead.ts:170`, `focus.ts:138`) both have the full `MainheadElements` in hand. This is safe today, since both are stable classes the stylesheet also keys on. The `design:` line's reason for keeping `metaEl` first is the unit-test double, and that would still hold if the function took `elements`.
3. **[note]** `features/focus.ts:148` builds the whole render view-model with a positional `true` just to read `.action`. The `design:` line explains why, and it is correct. The focused-session lookup `app.store.values().find((s) => s.id === app.state.focusedId)` now appears at `focus.ts:147`, `:154`, `launch.ts:776` and `rename.ts:36`. That predates the branch (cycle 1 Note 2).
4. **[note]** `.mainhead .meta .ended-at[hidden] { display: block; visibility: hidden; }` (`style.css:872-875`) is the only `[hidden]` rule in the stylesheet that keeps the element's layout. Every other one (`:207` through `:1774`) is the `display: none` companion that kb:lesson/display-rule-overrides-hidden-attribute prescribes. The rule is deliberate, the CSS comment at `:863-866` says why, and the reason holds: the slot must exist in both states. However, the Fix Attempt 2 `design:` line's precedent claim is false. It says "`rg -n "visibility: hidden" web/src/style.css` shows the slot-keeping idiom is already used elsewhere", but that grep has no hits on `main`. The only match in the file today is this rule and its comment. `style.css:1641`, the one nearby mention, chose `opacity` over `visibility` for a different reason. Someone running the lesson's `.hidden =` sweep will find `renderMeta`'s `endedAt.hidden = …` (`mainhead.ts:51`) mapped to a rule that does not remove the box. The CSS comment is all that explains it.
5. **[note]** The model's grid placement is set by three rules, and the base rule comes last in source. `.meta.stacked .model` (`style.css:847`, `2 / 1`) and `.meta:not(.stacked):has(.ended-at:not([hidden])) .model` (`:877`, `grid-row: 1`) both come before `.mainhead .meta .model` (`:881-886`, `1 / 2 / span 2`), and both win only by specificity. The other `.stacked` overrides in the section follow their base rule (`.meta .loc` `:779` before `.meta.stacked .loc` `:837`). It works; a reader editing `:883` has to scroll up to find what overrides it.
6. **[note]** Stale comments (the comment pass owns these, kb:adr/process-comment-pass-owns-code-comments):
   - `sessions/card.ts:124-128`: `resumeDisabledReason`'s doc says it is "shared with render/mainhead.ts and render/dead.ts" and returns `null` when "session is alive". The mainhead now reaches it only through `stopResumeButton`, and its parameter, `Pick<Session, "claudeSessionId">`, cannot see `alive`.
   - `style.css:733-735`: "the row's `min-content` is that, the model and `.ended-at`" was written for a three-column row. `.ended-at` now shares the model's column, under it.
   - `style.css:832-835`: the stacked comment says the one column is "as wide as the model (or the readout's floor, if that is wider)". The `.ended-at` slot's `min-width: var(--ended-w)` (`:869`) also applies in the stacked band, so the column is at least 14ch.
   - `fitMainheadMeta` is the most layout-dense exported function in `render/`, and the judge dropped its doc comment in both cycles.
7. **[note]** `.mainhead .idrow` (`style.css:652-660`) repeats `.mainhead`'s `display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px` (`:641-646`). The two gaps are now separate choices that happen to match. If one is retuned, the spacing between the title and the meta stops matching the spacing between the identity row and the cluster.
8. **[note]** The component diagram needs no change. `features/focus.ts` now takes a value import (`stopResumeButton`) from `sessions/card`, an edge `features` → `sessions` that kb:diagram/web-components already draws. No new module.
