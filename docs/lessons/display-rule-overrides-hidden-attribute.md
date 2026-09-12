---
id: display-rule-overrides-hidden-attribute
type: lesson
status: active
date: 2026-08-22
summary: An author display rule overrides the UA [hidden] default regardless of specificity; six elements had the companion rule, the seventh was the validate failure.
features: []
tags: [ux, testing]
roles: [web-impl, review, e2e-specs]
files: []
tests: []
refs: [plan:m1-sessions, .claude/agents/web-impl.md, .claude/agents/review-work.md]
---
**What happened.** The dashboard toggles elements with the `hidden` attribute. An author-origin `display` declaration overrides the UA's `[hidden] { display: none }` default regardless of specificity, so an element styled `display: flex` stays visible when `hidden` is set. Six elements had a compensating `[hidden]` rule; the seventh did not, and the implementer's log had claimed it was hidden, from the diff.

**Cost.** The only validate failure of the run, and a rule that had to be found rather than known.

**What changed.** Any `display` rule on a conditionally hidden element gets its `[hidden] { display: none }` companion in the same edit, followed by a sweep: every `.hidden =` site in `web/src` maps to a covered element. The reviewer's checklist carries the sweep, and a rendered-outcome claim is verified by observation.
