# Decision: launched-card-scroll

**Outcome**: B. Keep rail scroll untouched, matching the number chords and ⌥⌘0. The mainhead title confirms the launch, and REQ-7's marker claim holds in the DOM.
**Reached by**: consensus (scroll-a conceded in turn 3)
**Decisive argument**: From scroll-a's concession in turn 3: "The reviewer's own figures
(scrollHeight 1821 for 11 cards, clientHeight 635) mean ⌥⌘5–9 already mark an off-screen card at
scrollTop 0. So 'the current marker is on screen' is not a rail property today that launch alone
breaks. Adding a scroll only in `onLaunched` would make the rail's viewport depend on which path
selected the card, which is the divergence Major 2 is removing." The launch ADR's pointer/chord
split is about keyboard focus, not scroll.
**Dissent to honour**: A visible marker on *every* selection path would be a new rule and goes
beyond #41. It is a backlog item for the developer, not this plan (proposed-backlog.md).
**Landed in**: plans/new-session-improvement/plan.md (an *Amended* note on REQ-7),
docs/adr/rail-launch-leaves-rail-scroll-untouched.md, plans/new-session-improvement/proposed-backlog.md.
No code change.
