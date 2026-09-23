# Debate: launched-card-scroll

### Turn 1 — advocate-a (argument)

Option B's strongest form, as I read it: every other focus path (`focus.ts:108-113` `focusSession`, used by ⌥⌘1–9 and ⌥⌘0) leaves rail scroll alone, and `rg -n scrollIntoView web/src` finds nothing. The mainhead names B and `aria-current` is on B's card, so REQ-7's words are met. A scroll would make launch the odd one out, and if it landed in the shared owner Major 2 is building, it would quietly change the chords too.

Why I think A is right anyway:

1. **The launch ADR already rejected the chord analogy.** `docs/adr/launch-opens-launched-session.md` (Decision): launch "takes the pointer-click treatment of the rail-click record rather than the select-only treatment of chords." Matching the chords is the precedent this plan set aside. A pointer click on a card always ends with the marked card on screen, because the user just clicked it. Launch is the one pointer-class path whose target the user never saw.

2. **Launch puts the card where it is guaranteed hidden.** Manual order is the default and puts sessions "in the order they were opened" (`ux-flows.md:221-223`), so a launch appends at the bottom. Measured: card B at y=1740–1906, viewport 85–720, scrollTop 0. A chord picks a card by a rail position the user chose. Launch lands on a position nobody chose.

3. **The card carries what the mainhead does not.** The mainhead shows name, repo, model and ended age (`web/src/render/mainhead.ts:42-49`). The state badge and the §1.4 caveat "first launch here — likely waiting on Claude Code's trust prompt" (`ux-flows.md:118-120`, `web/src/sessions/card.ts:126`) render only on the card, which must show "immediately" at launch (`ux-flows.md:102-103`). After an overflowing launch that caveat sits about 1000 px below the fold. The terminal usually shows the prompt itself, so this point supports the case rather than deciding it.

4. **Cheap, and no invariant moves.** `block: "nearest"` does nothing when the card is already visible, which covers every rail that doesn't overflow. No card moves, so "no state change ever moves a card" (`ux-flows.md:223`) holds. It is not keyboard focus, so "Render ticks, reconcile and view switches still never move focus" (ADR, Consequences) holds too.

5. **Scope.** Option A names `onLaunched`. The call would sit beside `deps.surfaces.focusSelected(session.id)` (`launch.ts:570`), after `render()`. That makes it launch-only by construction. Major 2's single "bring forward" owner does not need to hold it, so the chords are unchanged and nothing goes beyond #41.

### Turn 2 — advocate-b (argument)

Steelman: a launch is a pointer-class "go there". In the default manual order it always puts its target below an overflowing rail's fold, while a chord's target is at least a position the user picked. A `block: "nearest"` scroll is one call. It moves no card and no keyboard focus, does nothing when the card is already visible, and stays launch-only if it sits beside `focusSelected` (`launch.ts:570`). Your points 3 and 4 check out in the code (`mainhead.ts:42-49`, `card.ts:126`, `style.css:515-516`).

1. **"Pointer-click treatment" means keyboard focus, not a visible marker.** The launch ADR's options are "(A) Select the launched session only. (B) Select it and put keyboard focus in its terminal". The pointer/chord split it borrows from `focus-rail-click-focuses-terminal` concerns keyboard focus only. Neither ADR says anything about scroll. A clicked card is on screen because the user just clicked it, not because either ADR says so.

2. **An off-screen current marker is already shipped behaviour.** The reviewer measured scrollHeight 1821 for 11 cards, about 166 px each. clientHeight 635 holds about 3.8 of them. So at scrollTop 0 in comfortable density, ⌥⌘5–9 always mark a hidden card. ⌥⌘0 marks the neediest card wherever it sits, which the chord does not choose by position. "The current card is on screen" is not a property of the rail today. A adds it for one path, so how the rail's viewport behaves would depend on how the user got there. I read that as the diverging-paths shape Major 2 exists to remove, just one line outside the owner. If a visible marker is right, it is right for every selection path. That goes beyond #41 and is the developer's call.

3. **The §1.4 caveat is for a pane nobody is watching.** The prompt "blocks startup … The session looks merely slow" (`ux-flows.md:108-110`), so the card offers a "Focus pane" action (`:118-120`). After a launch the pane is focused, live, and holds keyboard focus (review: `activeElement` in `Terminal: p5-b`), so the prompt itself is on screen. You concede this point is not decisive.

4. **REQ-7 is met by what the user sees.** #41's complaint was being left "on the running one instead of navigating to the one you just started" (`TODO.md:267-268`). The mainhead, the live pane and the cursor all move to B. The marker is on B's card, and `aria-current` is the plan's own Testable UI Element.

### Turn 3 — advocate-a (concession)

I concede: your point 2. The reviewer's own figures (scrollHeight 1821 for 11 cards, clientHeight 635) mean ⌥⌘5–9 already mark an off-screen card at scrollTop 0. So "the current marker is on screen" is not a rail property today that launch alone breaks. Adding a scroll only in `onLaunched` would make the rail's viewport depend on which path selected the card, which is the divergence Major 2 is removing. A visible marker on every selection path would be a new rule and goes beyond #41, so it is a backlog item for the developer, not this plan. Your point 1 also stands: the launch ADR's pointer/chord split concerns keyboard focus, not scroll, so my reading of it went too far. #41's complaint is met by the mainhead, the live pane and keyboard focus moving to B (`TODO.md:266-267`).
