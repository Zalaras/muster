# Decision brief: banner-above-popped-panel

**Question**: When a popped-out note panel is placed over the daemon-down banner (or the masthead's connection readout), which draws on top?
**Source**: review.md (cycle 2) browser Major 1, `[web-impl] [orchestrator:decision]`
**Option A**: Banner above the panel: give `#banner` (and, for consistency, the masthead's connection readout) a z-index above 45. The outage message then always shows over a panel the developer has placed there.
**Option B**: Accept: the developer placed the panel, can move it in one drag, and the banner's right side plus the masthead readout (unless it is also covered) still show the outage. Record this in design-system §6.7 or the plan's Edge Cases as an accepted placement.

## Pinned reading list (both advocates read all of it before turn 1)
- plans/popped-out-note-enhance/review.md — browser part, Major 1 (quoted below) and its Matrix rows for §6.7
- plans/popped-out-note-enhance/review.browser.cycle1.md — cycle 1 Major 1 (menus under the panel) and how it was fixed (z-index ordering: `.npanel` 45, `.menu` 50, `.pop`/`.cardtip` 55)
- plans/popped-out-note-enhance/plan.md — REQ-5, REQ-1, INV-2, States (incl. the *Amended* Daemon down line), Edge Cases
- docs/design/design-system.md — line 409 "Surface daemon-down loudly" (principle 7 / §6.7), line 40 banner tokens, § Note panel
- docs/design/ux-flows.md — around line 254 (the daemon-down banner)
- docs/adr/notes-popout-per-session-anywhere-in-window.md, docs/adr/notes-window-says-musterd-unreachable-while-reconnecting.md
- web/src/style.css — `#banner`, `.npanel`, `.menu`, masthead connection readout rules
- `go tool kb pack --plan popped-out-note-enhance --role planner` — ADRs for notes/connection

## The issue, verbatim
1. **[web-impl] [orchestrator:decision]** A popped panel dragged to the top of the window covers the daemon-down banner's message (design-system §6.7, "daemon-down surfaced prominently"). `.npanel` is `position: fixed; z-index: 45` and `#banner` is `z-index: auto`. Measured with the panel at 0,0–360,300: the words `musterd unreachable — hook output in open` lie under the panel. Only the tail `panes is Muster's absence, not session failure.` shows, and the tail does not say musterd is down. The masthead `reconnecting…` readout (1250,16) is still visible at this placement, but a panel placed at the top right would cover it too. Before this plan the panel was clamped below the mainhead (slot top 95) and could not reach the banner (46–78). REQ-5 now lets it reach both. This is the same class as cycle-1 Major 1 (menus), which the z-index 45 fix resolved for `.menu` (50) and `.cardtip` (55) but not for the banner.
   - **Option A — banner above the panel:** give `#banner` (and, for consistency, the masthead's connection readout) a z-index above 45. The outage message then always shows over a panel the developer has placed there.
   - **Option B — accept:** the developer placed the panel, can move it in one drag, and the banner's right side plus the masthead readout (unless it is also covered) still show the outage. Record this in design-system §6.7 or the plan's Edge Cases as an accepted placement.

## Rules
Up to 3 turns each, ≤400 words per turn, advocate-a opens. Argue from the pinned docs and
measurable consequences; cite file:line; steelman before rebutting; concede when convinced.
Append each turn to debate.md before sending it. The ending turn's author reports once to
`main`. Agent names: advocate-a (Option A), advocate-b (Option B).
