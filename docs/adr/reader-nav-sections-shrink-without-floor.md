---
id: reader-nav-sections-shrink-without-floor
type: decision
status: accepted
date: 2026-09-14
summary: The nav's tree and outline shrink proportionally with no minimum height; a one-row tree in a dense tile is accepted because both sections stay scrollable.
features: [reader]
tags: [ux, user-decision]
files: [web/src/style.css]
tests: []
refs: [plan:markdown-viewing, kb:adr/reader-docs-is-third-surface-segment]
supersedes: []
---
**Context.** The reader's right-hand nav is a column flex container holding a file tree and an
outline, each `overflow-y: auto` so its content scrolls inside it. Nothing allocates space between
the two beyond default proportional flex-shrink. Measured in a 2x2 tile with a 30-heading file open
(review cycle 3, 2026-09-13): the tree gets a `clientHeight` of **20px** against a `scrollHeight` of
315 — one visible row of twenty-one — and the outline 41px against 651. The full Focus pane leaves
both sections comfortably usable.

Both stay fully reachable by scrolling, so this is not the clipping defect the nav had before
`overflow-y: auto` replaced `overflow: hidden`. The question is only how much of each section a
dense tile shows at once.

**Decision.** Leave the proportional shrink as it is, with **no `min-height` floor** on either
section. A dense tile may show a one-row file tree when a long file is open.

Rejected for now: floor each section at roughly three rows, letting the nav's own
`overflow: hidden auto` take the remainder. It costs one CSS rule, but moves the scrolling boundary
— in a 3x2 tile the nav itself would scroll, which the per-section model was chosen to avoid — and
trades a small tree for a nav whose sections can both sit partly off-screen.

The mockups are static single-screen renders and settle neither option, so no design authority
applies. This is a density judgement, not a correctness one, and daily use answers it better than a
measurement: ship the simpler behaviour, add the floor if the dense tile proves uncomfortable.

**Consequence.** No code change; both sections keep `overflow-y: auto` with no minimum height.
Revisiting needs only the rule above plus a re-measure of both tile densities. Decided by Damian,
2026-09-13 — `plans/markdown-viewing/decisions/nav-sections-no-height-floor/decision.md`.
