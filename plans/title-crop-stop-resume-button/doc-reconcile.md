# Doc Reconcile: title-crop-stop-resume-button

**Verdict**: reconciled
**Pack**: kb: pack 11946 words (budget 30000)
**Features derived**: focus, actions, rail, card-location (via card.ts/actionbutton.ts, test files) (plan header: focus, actions; touches: card-location, groups, rename, rail, theme)

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| focus | readout as wide as its text, no 30ch/44ch caps | `web/src/style.css` `.mainhead .meta .repo` (max-content, no cap) | edited |
| focus | fixed give-way order, title last, 6rem floor, 8ch readout floor | `style.css` `.mainhead`, `.idrow`, `.name` (min-width 6rem), `--floor: 8ch` | edited |
| focus | `↳` drawn only when whole header fits one row | `mainhead.ts:fitMainheadMeta`, `onOneRow` | added |
| focus | model stacks under readout in narrowest headers | `mainhead.ts:stackMeta`, `.meta.stacked` | added |
| focus | ended age under model, no `·`, reserved slot | `style.css` `.ended-at`, `.ended-at[hidden]` visibility | edited |
| focus | cluster tightens below ~316px | `style.css` `@container (width < 316px)` | added |
| focus | surface switch pinned in right cluster with actions | `index.html` `.acts`, `style.css` `.mainhead .acts` | edited |
| focus | one Stop/Resume button, same box | `card.ts:stopResumeButton`, `mainhead.ts:renderStopResume`, `.stop-resume` min-width 6ch | edited |
| focus | old wrap/cap/action-row sentences and superseded refs | — | deleted |
| actions | mainhead Stop/Resume one button; tile footers separate | same as above | added |
| rail, card-location | citations repointed from superseded rail-repo-line-wraps-at-slash to focus-header-readout-sized-by-text (which keeps the rail card shape) | `docs/adr/focus-header-readout-sized-by-text.md` | repointed |

## Contradictions
None

## For the orchestrator
- [orchestrator] The claim changed Touched feature `rail`'s citation only (no behaviour); `card.ts`/`actionbutton.ts` map to rail, which is a Touches feature, so no widening. Nothing to promote.
- [orchestrator] The plan's ADRs are proposed; the specs now cite them, so flip them to accepted (check-kb passes with them proposed).
- [orchestrator] The `focus-group-control-stays-while-title-shortens` ADR is no longer cited by the focus spec (its "title shortening beside it" clause went); consider superseding it.

## Checks
make gen-kb && make check-kb: `kb: 562 records, 27 features, 0 problem(s)`, `kb: all checks pass`.
Words: focus 546, actions 563, rail 706, card-location 432 (budget 800).
