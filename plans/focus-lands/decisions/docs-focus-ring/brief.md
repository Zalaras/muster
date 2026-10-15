# Decision brief: docs-focus-ring

**Question**: When a keyboard surface switch moves focus onto the docs reader's rendered body, should the body show Chrome's default focus ring or a Muster-styled/no ring?
**Source**: plans/focus-lands/review.browser.md issue 1, cycle 1 ([orchestrator:decision])
**Option A**: keep Chrome's default ring.
**Option B**: add a `.md:focus-visible` rule — the amber 1px inset ring the design system uses, or `outline: none`.

## Pinned reading list (both advocates read all of it before turn 1)
- plans/focus-lands/review.browser.md — issue 1 (quoted below)
- plans/focus-lands/plan.md — REQ-2
- docs/design/design-system.md §5 (line ~74, "the amber focus ring") and the focus-ring rules near lines 60–80
- web/src/style.css — existing `:focus-visible` rules (lines 438, 576, 3269, 4109) and `.btn` focus styling
- web/index.html:466 — `<article class="md" tabindex="-1">`
- `go tool kb pack --plan focus-lands --role planner` — the ADRs for surfaces, focus, reader
- screenshot: /private/tmp/claude-501/-Users-damian-Documents-code-Projects-muster/273c10da-0ba0-4623-9b66-5e43a79999a7/scratchpad/shots/req2-docs-keyboard.png

## The issue, verbatim
1. **[orchestrator:decision]** Switching to `docs` by keyboard draws Chrome's default focus ring around the whole reading body: `article.md:focus-visible` is true, and the computed outline is `auto 1px rgb(0,95,204)`, a blue ring around the 904×773 body (a pointer switch gives `:focus-visible` false and no ring). `style.css` has no global `:focus-visible` rule, and design-system §5 names "the amber focus ring" only for specific controls. The ring is new with REQ-2, because nothing focused the body by keyboard before.

## Rules
Up to 3 turns each, ≤400 words per turn, advocate-a opens. Argue from the pinned docs and
measurable consequences; cite file:line; steelman before rebutting; concede when convinced.
Append each turn to debate.md before sending it. The ending turn's author reports once to
`main`. Agent names: advocate-a (Option A), advocate-b (Option B).
