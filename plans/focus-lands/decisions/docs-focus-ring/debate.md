# Debate: docs-focus-ring

### Turn 1 — advocate-a (argument)

Option B has two variants; they fail for different reasons, so I take each in turn.

**1. The amber variant contradicts §3.** `docs/design/design-system.md:120` — "A state colour may **only** mean that state. Amber is never 'highlight'"; `:111` binds `--amber` to Needs-Input, including "tile border". `:242` goes further: "Blocked and failed tiles take a coloured border (`--amber-line` / `--rose-line`); nothing else does." The reader root mounts inside a tile too (`web/src/features/tiles.ts:187-189`, `mountSlotRoot(refs.bodySlot, readerRoot)`), so `.md:focus-visible { outline: 1px solid var(--amber) }` draws an amber rectangle round a whole tile body — the exact signal §3 reserves for a session that needs you. The segmented-control precedent (`:322`, `style.css:3269-3271`) is an amber ring on an 11px control label, which does not read as a pane border; a 904×773 body (the measured size, review.browser.md:77) does. In my reading, the amber variant is ruled out by an accepted doc, not by taste.

**2. The `outline: none` variant defeats REQ-2's observable purpose.** REQ-2 (`plans/focus-lands/plan.md:63-66`) exists so that a keyboard switch "moves keyboard focus into the surface switched to". The terminal shows that with its cursor; the reader body has no cursor, so the ring is the only visible evidence focus landed there. The reviewer said so when stating B: "Suppressing it hides where focus went" (review.browser.md:79). The ring also only appears on a keyboard switch — a pointer switch gives `:focus-visible` false and no ring (review.browser.md:77) — so the one user it shows to is the one who needs it.

**3. The UA ring is already the dashboard's keyboard-focus idiom.** `.btn` (`style.css:2710-2723`) has no `:focus-visible` rule, so every button — Stop, Remove, the surface switch's neighbours — already shows Chrome's ring on keyboard focus. Design-system §5 names an amber focus treatment only for the segmented control (`:322`); everything else falls through to the UA ring. Option A keeps `.md` consistent with that; B makes the reading body the one non-control with bespoke focus styling.

**4. Cost and scope.** A is zero CSS and zero doc change. B's amber variant would need §3/§5 amended to permit a state hue as a pane highlight; `outline: none` would need a sentence somewhere justifying hiding focus. `kb:adr/nongoal-accessibility-i18n-multiuser-other-platforms` keeps keyboard-audit work out of scope — which in my reading argues against adding a focus-styling rule at all, not for one.

A's measured cost: a thin blue hairline at the pane edge (screenshot), on keyboard switches only.

### Turn 1 — advocate-b (concession)

Steelman: neither B variant survives the docs. The amber ring, drawn round a body that also mounts inside a tile (`tiles.ts:187-189`), is a pane-sized amber border, and §3 reserves that for Needs-Input (`design-system.md:120`, `:242` "nothing else does"). `outline: none` takes away the only visible sign that a keyboard switch landed in the reader, which has no cursor. And the UA ring is already what every unstyled control shows on keyboard focus.

I checked the facts B would have rested on. The surface switch's own `.seg-btn` segments have no `:focus-visible` rule (`style.css:256-290`), so a keyboard user already sees Chrome's ring on the `docs` segment just before focus moves to the body. Keeping it on the body continues that same signal. My strongest remaining point was that the blue is a colour no theme defines and the contrast gate never measures. Against `--well` (`.reader` background, `style.css:1080`), the computed `rgb(0,95,204)` measures 3.20:1 on Instrument, 3.08:1 on Dark and 5.98:1 on Light. Every theme clears the 3:1 non-text floor (`design-system.md:73-74`), so no rule is broken; the point is only taste. I am not claiming those ratios for the rendered two-tone ring, only for the computed colour.

I concede: the amber variant breaks §3's state-colour reservation at tile-border scale, `outline: none` removes the only focus evidence REQ-2 produces for the reader, and the UA ring is already the focus idiom of the switch that leads into it. Option A.
