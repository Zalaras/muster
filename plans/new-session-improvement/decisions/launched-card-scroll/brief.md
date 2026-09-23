# Decision brief: launched-card-scroll

**Question**: When a launch lands in Focus and the rail overflows, should the launch scroll the launched session's card into view?
**Source**: review.md browser Minor 1, cycle 1 (`[orchestrator:decision]`)
**Option A**: `onLaunched` (`web/src/features/launch.ts`) scrolls the launched card into view in the rail (`block: "nearest"`), so the marker REQ-7 names is on screen.
**Option B**: Keep rail scroll untouched, matching the number chords and ⌥⌘0. The mainhead title confirms the launch, and REQ-7's marker claim holds in the DOM.

## Pinned reading list (both advocates read all of it before turn 1)
- plans/new-session-improvement/review.browser.md: Minor 1 (quoted below) and Notes 3
- plans/new-session-improvement/plan.md: REQ-7, INV-4, UI Specifications § User Flows 3, Implementation Notes "Keyboard focus timing"
- docs/adr/launch-opens-launched-session.md (proposed, this plan)
- docs/adr/focus-rail-click-focuses-terminal.md, docs/adr/rail-current-marker-means-shown-in-focus.md
- docs/design/design-system.md and docs/design/ux-flows.md: the Focus / rail sections (grep "rail", "scroll", "current")
- docs/features/rail/spec.md, docs/features/focus/spec.md, docs/features/shortcuts/spec.md (number chords, ⌥⌘0)
- web/src/features/launch.ts `onLaunched`; web/src/features/focus.ts `focusSession`; `rg -n scrollIntoView web/src` (the reviewer measured: no focus path calls it)
- the ADRs `go run ./tools/kb pack --plan new-session-improvement --role planner` lists for launch, focus, rail

## The issue, verbatim
1. **[orchestrator:decision]** A launch into a rail that overflows puts the current marker on a card the user cannot see. REQ-7 names the marker as its visible consequence. With 10 seeds and A focused, the launched B's card lands at 0,1740–299,1906. The rail's scroll viewport is 0,85–299,720 (`#sessions` scrollHeight 1821 / clientHeight 635, `overflow-y: auto`), and scrollTop stays 0. The mainhead does show B's title. No focus path in `web/src` calls `scrollIntoView`, so number chords behave the same way today. Launch is new here because it appends the card at the bottom of manual order and then focuses it. Options:
   - **(A)** `onLaunched` (`web/src/features/launch.ts`) scrolls the launched card into view in the rail (`block: "nearest"`), so the marker REQ-7 names is on screen.
   - **(B)** Keep rail scroll untouched, matching the number chords and ⌥⌘0. The mainhead title confirms the launch, and REQ-7's marker claim holds in the DOM.

## Context the orchestrator adds
- The maintainability review (Major 2, cycle 1) is already routing web-impl to give "bring a session forward in the current view" one owner. Today `launch.ts:560-564` copies `focus.ts:108-113`'s `focusSession`. Any scroll behaviour would land in that single owner, so it would reach every caller of it, not only launch. Whether that is a feature or scope creep is part of this question.
- This plan's scope: #41 "Starting a new session should open the new session". Scope changes are never debated. If an option would widen scope beyond #41, say so; the orchestrator then asks the developer.

## Rules
Up to 3 turns each, ≤400 words per turn, scroll-a opens. Argue from the pinned docs and
measurable consequences; cite file:line; steelman before rebutting; concede when convinced.
Append each turn to debate.md before sending it. The ending turn's author reports once to
`main`. Agent names: scroll-a (Option A), scroll-b (Option B).
