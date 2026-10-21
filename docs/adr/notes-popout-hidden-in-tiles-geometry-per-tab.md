---
id: notes-popout-hidden-in-tiles-geometry-per-tab
type: decision
status: accepted
date: 2026-10-21
summary: The popped-out note panel hides in Tiles and returns in Focus; its form, position and size persist per browser tab in session storage.
features: [notes]
tags: [ux, user-decision]
files: []
tests: []
refs: [plan:session-notes]
supersedes: []
---
**Context.** The popped-out panel floats over the Focus main slot and follows the focused session.
Tiles has no main slot and no focused session. The spec asks that the panel's form and geometry be
remembered per window across reloads.

**Decision.** In Tiles the popped-out panel is not shown. Returning to Focus shows it again at the
same rectangle, clamped into the main slot. Whether it is popped out, and its position and size,
are kept in the tab's session storage, never as a daemon preference.

**Consequences.** A reload keeps the panel where it was, while a new tab or window starts anchored
at the default size. Two windows can hold different panel layouts.
