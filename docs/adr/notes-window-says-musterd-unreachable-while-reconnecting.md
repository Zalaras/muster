---
id: notes-window-says-musterd-unreachable-while-reconnecting
type: decision
status: accepted
date: 2026-11-04
summary: While its socket is reconnecting, the note window's status reads `musterd unreachable` in --warn; the note stays readable and editable.
features: [notes]
tags: [ux]
files: []
tests: []
refs: [plan:popped-out-note-enhance, kb:adr/notes-own-window-is-a-third-page]
supersedes: []
---
**Context.** The approved plan said only that, with musterd down, the note window keeps showing the
last known note, editable, and that a failed save reads `unsaved, musterd unreachable`. Review cycle 1
measured the result: with musterd killed and nothing typed, the window said nothing at all. It has no
banner, and the dashboard's daemon-down banner (design-system §6.7) and the docs pop-out's notice both
tell the developer what they are looking at is stale.

**Decision.** While the note window's socket is `reconnecting`, its header status reads
`musterd unreachable` in `--warn`. The note stays shown and editable, and text typed meanwhile is kept
under kb:adr/notes-unsaved-text-kept-in-browser-until-acknowledged. A plan amendment from a measured
review issue, restoring consistency with §6.7; no developer decision is contradicted.

**Consequences.** `connecting…` (before the first `hello`) and `musterd unreachable` (after it) are
the window's two connection statuses; the panel inside the dashboard keeps relying on the banner.
