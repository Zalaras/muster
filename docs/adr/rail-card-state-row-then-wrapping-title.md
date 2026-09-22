---
id: rail-card-state-row-then-wrapping-title
type: decision
status: superseded
date: 2026-09-22
summary: The rail card leads with a small state row and lets the title wrap; a three-step density pref in the rail head trades rows for cards.
features: [rail, settings]
tags: [ux, user-decision]
files: [web/index.html, web/src/render/sessions.ts, web/src/features/rail.ts, web/src/style.css, internal/server/prefs.go]
tests: []
refs: [plan:rail-card-improvements, "#38", docs/design/design-system.md]
supersedes: []
---
**Context.** The title shared its row with the badge, timer and pin, leaving about eighteen characters before the ellipsis, so sessions with Claude's auto-generated sentence titles read as the same card. The issue asked for the title to wrap or show more, for the layout to be reviewed, and for compact and expanded options.

**Options.** (A) Clamp the title to two lines with the badge and timer holding the first. (B) Give the title its own row and drop the badge and timer beside the repo line. (C) Lead with a small state row of badge, timer and pin, then let the title wrap to whatever it needs. (D) A JavaScript-measured middle ellipsis on the existing row.

**Decision.** C, the developer's choice from side-by-side mockups, with a `railDensity` preference of compact, comfortable and expanded chosen from an icon control in the rail head. Comfortable is the reference render; compact clamps the title to one line and drops the gauge track and activity line; expanded lets the activity line run to three lines. The repo line and the title carry their full text as a hover title. The New session button leaves the rail head so the head holds the sort select, the count and the density control.

**Consequences.** Cards vary in height, so nothing on a card is positioned by a fixed row count. The Tiles strip shares the template and follows both the layout and the density. Density is a body attribute applied from the prefs echo, never from the click, so a change never rebuilds a card and keyboard focus survives it.
