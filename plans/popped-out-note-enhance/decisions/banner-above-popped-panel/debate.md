# Debate: banner-above-popped-panel

### Turn 1 — advocate-a (argument)

No B turn yet, so I steelman B's case first: the developer chose the placement, one drag fixes it, the banner's tail and the masthead readout still show the outage, and A adds a z-index the plan never asked for.

My case for A:

1. **§6.7 is a correctness rule, not taste.** `docs/design/design-system.md:392` heads §6 "Honesty rules — these are correctness, not taste"; rule 7 (`:409`) says the UI *must* explain the pane noise. review-browser measured a FAIL against it (`review.md:154`): the covered words are exactly `musterd unreachable — hook output in open`; the visible tail does not say musterd is down.

2. **The panel has nothing else to say it.** Panels are unchanged on daemon-down (`plan.md:151`); the measured panel status during the outage is `""` (`review.md:153`). This plan's own ADR says "the panel inside the dashboard keeps relying on the banner" (`docs/adr/notes-window-says-musterd-unreachable-while-reconnecting.md`, Consequences). B lets the panel hide the thing that ADR says it relies on.

3. **Correction to the brief: the masthead readout shows no words.** `#connection-status` is a 14px box drawing a 6px dot (`web/src/style.css:359-385`); `reconnecting…` is an `.sr-only` span (`web/index.html:53`, `style.css:2244`), and the planner pack says "Its word … is screen-reader text and its detail is on hover". With the banner's head covered, what is visible is a 6px red dot and a sentence fragment — not "loudly", nor the "full-width banner" of `docs/design/ux-flows.md:254`.

4. **Same class, same fix, already accepted.** Cycle 1 Major 1 (`review.browser.cycle1.md:72`) ruled that surfaces the panel can now reach must draw above it, fixed by layering (`.npanel` 45 < `.menu` 50 < `.pop` 55). REQ-5 (`plan.md:50`) is about *where the panel can be dragged*, not that it outranks the outage alarm; A keeps every placement REQ-5 allows.

5. **Cost is small.** `#app` makes no stacking context (`style.css:218-223`: flex, height, overflow only) and the panel is appended to `body` (`features/notes.ts:166`), so `position: relative; z-index: 46` on `#banner` lifts it above the panel: one rule, one render test. The banner is `hidden` outside an outage or update restart, so normal use is unchanged.

A's trade — a 32px strip of the panel hidden only while musterd is down, when no save reaches it anyway — is cheaper than hiding the honesty rule's message.

### Turn 1 — advocate-b (argument)

Steelman: §6 is "correctness, not taste" (`design-system.md:392`); this plan's own ADR says the dashboard panel "keeps relying on the banner"; and with the banner's head covered the only other visible signal is a 6px dot. I accept A's correction: I verified `reconnecting…` is `.sr-only` (`index.html:53`, `style.css:2244`).

My answer is that A does not remove the defect; it moves it onto the panel, and onto the part that matters most.

1. **A covers the panel's header, which is its only drag handle and holds every control.** The header is 7 + 20 + 6 px padding/control plus a 1px rule, ≈34px (`style.css:4795-4865`); the banner is 46–78 (`review.md:154`). Move is wired on the header alone (`render/notespanel.ts:148`). Under A, a panel whose top lies around 44–46 has its whole header under the banner: no drag, and Pop in, Open in window and Close are hidden; a top anywhere in ≈12–78 loses part of it, and the `n` resize handle with it. Only Escape from inside (`notes.ts:222`) and the glyph remain. That is cycle-1 Major 1's defect class exactly — "those items cannot be clicked" because another layer draws over them (`review.browser.cycle1.md:73`) — re-created, not avoided.

2. **It strikes when the panel is busiest, not idle.** A says "no save reaches it anyway". But typed text is kept in the browser until acknowledged (kb:adr/notes-unsaved-text-kept-in-browser-until-acknowledged), editing continues, and the panel's own `unsaved, musterd unreachable` status renders in that header (`design-system.md` § Note panel). A hides it.

3. **The banner appears under a placement the developer already made.** It is `hidden` until a lost hello (planner pack, connection spec). Under A the panel is cut when the outage begins; under B the banner is fully visible except where the developer chose to put a panel, which they see covering it and can move in one drag — the drag A would take away.

4. **Cycle 1's rule was about transient surfaces.** Its wording: "every transient popover opened from those areas … must draw above the floating panel" (`review.browser.cycle1.md:73`). A menu closes in a click; the banner lasts the whole outage. The precedent does not reach it.

5. **What B leaves visible.** At the measured placement the shown tail is `panes is Muster's absence, not session failure.` — rule 7's stated purpose (`design-system.md:409-410`), plus the red dot.

I grant B's worst case: a panel wider than the text hides all of it.

### Turn 2 — advocate-a (argument)

Steelman: under A the banner draws over the panel's header — its only drag handle, its three controls and its `unsaved` status — recreating cycle-1's "cannot be clicked" defect on the panel for the whole outage, while B leaves rule 7's purpose sentence and the dot visible.

I accept point 4: cycle 1's wording is "transient popover" (`review.browser.cycle1.md:72`). I drop the precedent and rest on §6.7 itself.

1. **The failure regions differ in size.** On B's figures (header ≈34px, banner 46–78): A loses the whole header only for a panel top ≈44–46, part of it for ≈12–78. B loses the banner's head for *every* panel overlapping x 16–313 in y 46–78 — including top 0, where a drag to the top clamps, which is the measured placement (`review.md:154`). There A loses nothing in the header (header 0–34, banner 46–78). B's own grant — a panel wider than the text — leaves no words saying musterd is down at all.

2. **A's loss is recoverable and self-explaining; B's is silent.** With the header covered, Escape from inside still closes the panel (`features/notes.ts:222`, `leaveOrClose` → `closeByUser`), the glyph still toggles it, the rectangle is kept, and the header returns on the first hello. What covers it is the banner, which says why. Under B the banner appears *after* the panel was placed, beneath it; nothing tells the developer a banner is there, so "move it in one drag" assumes they know what B hides.

3. **The `unsaved` status is duplicated under A, not lost.** Its content — musterd unreachable — is what the banner on top says. And before anything is typed, the panel status during the outage is `""` (`review.md:153`): the header carries no outage signal to protect.

4. **The visible tail does not meet rule 7, in my reading.** Rule 7 (`design-system.md:409-410`) requires the UI to *explain the noise*; `panes is Muster's absence, not session failure.` starts mid-clause and never names what is absent. ux-flows promises a "full-width banner explaining" it (`ux-flows.md:254`).

So: A — a usability loss in a narrow band, recoverable by keyboard, explained by what covers it; B — an honesty-rule failure across the whole top-left band, unexplained. Both last the outage. §6 ranks honesty as correctness (`design-system.md:392`); I find nothing ranking a 32px strip's usability above it.

### Turn 2 — advocate-b (concession)

Steelman: the two failure bands are about the same height, but they differ in kind. A's is a usability loss over panel tops ≈12–78 (whole header only ≈44–46). It can be recovered by Escape from inside or by the glyph, and the thing covering the header says why. B's is an honesty-rule failure for every top 0–78 overlapping the text, the measured clamp-to-top placement included, and nothing on screen explains it.

I concede: B's failure falls on a §6 rule that `design-system.md:392` ranks as correctness, and it hides the words "musterd unreachable" that this plan's own ADR says the dashboard panel relies on. A's cost is a narrower usability loss that can be undone and that the covering banner itself explains. At the measured placement (top 0) A costs the header nothing. I checked my point 1 against A's figures, and the band where the header is wholly lost is ≈2px of panel top. For a top of ≈12–44 a strip of the header stays above the banner and can still be dragged. I also accept that the visible tail, which starts mid-clause, does not by itself meet "explain that noise".

Residue for the implementer, not a new option: as A's turn 1 notes, A's z-index needs `position: relative` on `#banner` to take effect, and a render test should pin it.
