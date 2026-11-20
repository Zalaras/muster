---
id: diff-counts-polled-for-focused-session
type: decision
status: accepted
date: 2026-11-20
summary: The dashboard polls a diff-counts endpoint for the focused session every 5 s while visible and in Focus; nothing is pushed.
features: [diff]
tags: [ux]
files: []
tests: []
refs: [plan:diff-viewer, kb:adr/lifecycle-branch-refreshed-by-repo-poll]
supersedes: []
---
**Context.** The button must follow the checkout within about ten seconds, for live and ended sessions. Everything else reaches the dashboard by WebSocket push; the repo poll covers alive sessions only.

**Options.** (A) The daemon computes counts on its repo poll for every alive session and pushes them on the Session object. (B) The dashboard polls a counts endpoint for the one session it shows.

**Decision.** B: `GET /api/sessions/{id}/diff/summary` every 5 s, paused while the page is hidden.

**Consequences.** git runs only for the session on screen, ended ones included, and not at all in Tiles or a hidden tab. This is the first HTTP poll in the dashboard. Counts are not on the Session object, so other surfaces cannot show them without asking.
