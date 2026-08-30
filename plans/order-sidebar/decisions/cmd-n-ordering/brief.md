# Decision brief: cmd-n-ordering

**Question**: After order-sidebar, should ⌘1–9 (`focusNth`) select the nth card as the rail currently displays it (`orderRail` in the active mode), or keep ranking by the attention sort (`sortSessions`) independent of rail order?
**Source**: plans/order-sidebar/review.md, issue 1 (Major), review cycle 1
**Option A**: ⌘N follows the rail: change `focusNth` to `orderRail(store.values(), railSort)`. One line. Restores "⌘N = the nth card I can see" in both modes, which is the mental model the manual order exists to create; costs the current quick jump to the most-blocked session (⌘1 no longer means "whatever needs me most").
**Option B**: ⌘N stays attention-ranked: leave `focusNth` on `sortSessions` and document it in ux-flows §3.8 as "the nth by attention, independent of rail order". Zero code; keeps a one-key jump to the neediest session; costs the correspondence between the shortcut and the visible rail, and the docs currently say otherwise.

## Pinned reading list (both advocates read all of it before turn 1)
- plans/order-sidebar/review.md — issue 1 (quoted below) and the Browser verification section
- plans/order-sidebar/plan.md — Overview, REQ-5, REQ-6 (the three named consumers), REQ-7, REQ-13, Testable UI Elements
- plans/order-sidebar/web-implementation.md — the web-impl agent's note flagging focusNth
- web/src/main.ts — focusNth (~line 288–300), the ⌘1–9 key handler (~line 748–762), promote path (~line 280)
- web/src/sessions/sort.ts — sortSessions and orderRail
- docs/design/ux-flows.md §3.4 (states and ordering), §3.7 (Tiles), §3.8 (switching views, line 283: "⌘1–9 keeps meaning in both views: focus session n")
- docs/design/design-system.md §4.1 (line 127)
- SPEC.md §2.1 (rail ordering), §11 changelog
- interview-notes.md — any rejected options on keyboard model / ordering

## The issue, verbatim
1. **[orchestrator:decision]** ⌘1–9 no longer selects the card the user sees. `focusNth`
   (`web/src/main.ts:290`) still ranks by `sortSessions`, while the rail, strip and
   default-focus pick now go through `orderRail`. Measured: rail showing `one, two, three`
   in manual order with `three` in `needs_input` — ⌘1 focused `three`. Before this plan the
   two orders were the same function, so the shortcut and the rail could not disagree;
   ux-flows §3.8 and design-system §4.1 both describe it as "focus session *n*".
   web-impl flagged this explicitly and implemented REQ-6 literally (it names exactly three
   consumers), which was the right call for an impl agent — the choice is yours:
   - **Option A — ⌘N follows the rail**: change `focusNth` to `orderRail(store.values(),
     railSort)`. One line. Restores "⌘N = the nth card I can see" in both modes, which is
     the mental model the manual order exists to create; costs the current quick jump to
     the most-blocked session (⌘1 no longer means "whatever needs me most").
   - **Option B — ⌘N stays attention-ranked**: leave `focusNth` on `sortSessions` and
     document it in ux-flows §3.8 as "the nth by attention, independent of rail order".
     Zero code; keeps a one-key jump to the neediest session; costs the correspondence
     between the shortcut and the visible rail, and the docs currently say otherwise.

## Rules
Up to 3 turns each, ≤400 words per turn, advocate-a opens. Argue from the pinned docs and
measurable consequences; cite file:line; steelman before rebutting; concede when convinced.
Append each turn to debate.md before sending it. The ending turn's author reports once to
`main`. Agent names: advocate-a (Option A), advocate-b (Option B).
