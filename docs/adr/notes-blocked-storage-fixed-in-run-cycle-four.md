---
id: notes-blocked-storage-fixed-in-run-cycle-four
type: decision
status: accepted
date: 2026-10-21
summary: Every dashboard localStorage access goes through the guarded accessor, so blocked storage cannot abort an event listener; fixed in a fourth review cycle.
features: [notes, theme, reader]
tags: [consensus]
files: []
tests: []
refs: [plan:session-notes, plans/session-notes/decisions/review-cycle-exhaustion-theme-storage/decision.md, kb:adr/notes-unsaved-text-kept-in-browser-until-acknowledged]
supersedes: []
---
**Context.** Review cycle 3 of 3 measured REQ-10 failing with browser storage blocked so that
reading `window.localStorage` throws: `theme.ts`'s `writeThemeHint` default parameter read the bare
global inside the theme feature's `snapshot` listener, and the throw aborted every later listener
of that emit, notes' re-send among them. `reader.ts` had five more bare reads, one inside
`sessionRemoved` ahead of notes' cleanup. The run's review budget was spent and the developer was
away, having asked for the run to be completed.

**Options.** (A) Grant a fourth review cycle and fix it in the run. (B) Stop blocked and leave it
for a separate `/fix`.

**Decision.** A, by consensus. The six bare `localStorage` reads in `web/src` outside `storage.ts`
move onto `safeLocalStorage()`; the event bus's failure semantics are unchanged. The check is that
`rg '\blocalStorage\b' web/src` outside tests and `storage.ts` finds no access.

**Consequences.** With storage blocked, the theme hint and reader memory fall back to the guarded
accessor's no-op storage and every listener still runs. A regression journey covers re-send on
reconnect and Remove with storage blocked.
