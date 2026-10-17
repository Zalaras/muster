---
id: reader-find-overrides-cmd-f-inside-reader
type: decision
status: accepted
date: 2026-10-17
summary: Command-F opens the find bar of the reader holding keyboard focus, in every host; with focus outside any reader the browser's own find is left alone.
features: [reader-find, shortcuts]
tags: [ux]
files: [web/src/shortcuts.ts, web/src/features/readerfind.ts, web/src/render/reader.ts]
tests: [web/e2e/reader-search.spec.ts]
refs: [plan:docs-search-bar, kb:adr/shortcuts-match-event-code-in-pure-module, kb:adr/shortcuts-option-command-family-off-reserved-chords]
supersedes: []
---
**Context.** The developer reaches for Command-F to search a document. The reader's find bar is useless if Command-F still opens Chrome's find, but Command-F elsewhere on the dashboard (the rail, a terminal surface) has no reader find to go to.

**Options.** (A) Leave Command-F to the browser and open the bar only from its icon. (B) Intercept Command-F everywhere and route it to some reader. (C) Intercept it only while keyboard focus is inside a reader — Focus, tile or pop-out — and send it to that reader alone.

**Decision.** C. It matches what the developer means by the chord where a reader is in use, and leaves the browser's find wherever the reader's would not apply. With several tile readers, focus picks exactly one, so a bystander's bar never opens.

**Consequences.** Command-F is a row in the `web/src/shortcuts.ts` binding table (`KeyF`, Meta only), dispatched by the reader so the pop-out, which runs no dashboard shortcut listener, gets it too. Command-F is not a browser-reserved chord in Chrome, but per the shortcut probe ADR the E2E suite cannot prove that; it is confirmed on a real keyboard at review.
