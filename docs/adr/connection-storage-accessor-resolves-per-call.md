---
id: connection-storage-accessor-resolves-per-call
type: decision
status: accepted
date: 2026-10-21
summary: safeLocalStorage and safeSessionStorage re-resolve the storage global on every call, so callers hold one accessor from init and there is one lookup policy.
features: [connection, theme, reader, notes]
tags: [user-decision]
files: [web/src/storage.ts, web/src/features/reader.ts]
tests: []
refs: [plan:session-notes, kb:adr/notes-blocked-storage-fixed-in-run-cycle-four]
supersedes: []
---
**Context.** After session-notes, the storage callers used two lookup policies. `notes.ts` and
`updaterestart.ts` resolved the guarded accessor once at init. `reader.ts` and `theme.ts`
resolved it on every call, so that storage blocked at first use would not stay unavailable for
the page's life. Nothing told a new caller which one to use.

**Options.** (A) Write down both policies and when to use each. (B) Make every caller resolve
per call. (C) Make the accessor itself re-resolve the global on every method call.

**Decision.** C, by the developer at `/land`. Holding the accessor and calling for it per use
now behave the same, so there is one policy: resolve once at init and hold it. `reader.ts`
moved to that.

**Consequences.** Each storage operation reads the global once more. That is cheap, and a
throw still lands in the guarded path. An accessor held from a blocked start recovers once the
browser allows storage again.
