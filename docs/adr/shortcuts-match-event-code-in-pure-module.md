---
id: shortcuts-match-event-code-in-pure-module
type: decision
status: accepted
date: 2026-09-04
summary: Chords match on the keyboard event's code, not its key, in one pure module holding the binding table; a hand-built unit test holds the Playwright gap.
features: [shortcuts]
tags: [ux, testing]
files: [web/src/shortcuts.ts, web/src/shortcuts.test.ts, web/src/main.ts, web/src/features/launch.ts]
tests: [web/e2e/shortcuts.spec.ts]
refs: [docs/history/spec-changelog.md, plan:shortcut-fixes, spikes/S5-key-probe.md, kb:adr/shortcuts-option-command-family-off-reserved-chords, kb:adr/process-web-unit-tests-vitest]
supersedes: []
---
**Context.** On macOS an Option chord transforms the key value: Option-N arrives as a tilde and Option-1 as an inverted exclamation mark, so the key property cannot express the new family at all. Playwright does not emulate that dead-key transform, so a matcher written against the key property would pass the whole E2E suite and fail on a real keyboard. Matching had also been scattered across the callers.

**Options.** (A) Match on the key property with a per-platform translation table. (B) Match on the physical code with exact-modifier comparison, in one pure module that owns the binding table and is called by the main script and the launch dialog.

**Decision.** B. The module is pure so its matcher is unit-tested by constructing events by hand, including a loop over every chord against every modifier signature that pins exact-modifier matching.

**Consequences.** The E2E suite proves dispatch, not browser reservation; Playwright injects events below the browser chrome, which is exactly why a digit chord test stayed green while Command-N was broken. A green E2E run is never cited for the no-reserved-chord invariant. Adding a binding is one table row.
