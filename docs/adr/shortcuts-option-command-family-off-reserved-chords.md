---
id: shortcuts-option-command-family-off-reserved-chords
type: decision
status: accepted
date: 2026-09-04
summary: Session shortcuts move to the Option-Command family, measured clear in both browsers; the digits moved for consistency, not an observed failure.
features: [shortcuts]
tags: [ux]
files: [web/src/shortcuts.ts, web/src/features/shortcuts.ts, spikes/S5-key-probe.md]
tests: [web/e2e/shortcuts.spec.ts]
refs: [docs/history/spec-changelog.md, plan:shortcut-fixes, spikes/S5-key-probe.md, docs/design/ux-flows.md, kb:adr/shortcuts-cmd-n-follows-rail-order, kb:adr/shortcuts-jump-to-neediest-option-command-zero, "#5"]
supersedes: []
---
**Context.** Safari handles Command-N above the page as New Window, so preventing the default never reaches it. The issue and the backlog suggested Shift-Command-N, which the probe measured equally reserved as New Private Window; the obvious fix would have fixed nothing. Muster has focused terminal panes, so any chord without Command competes with keystrokes meant for Claude Code.

**Options.** (A) Shift-Command-N for new session, leave the digits. (B) Plain keys or Control chords, which the terminal sees. (C) Command-Shift digits, three of which are system screenshot chords. (D) The Option-Command family for the whole session set, measured clear in both browsers with no caveat.

**Decision.** D, settled by probe rather than reasoning. The number chords were never measured broken; they moved on a consistency argument, one modifier for the whole family and a destination that is provably clear, and this record says so, so the probe is never cited as evidence of a digit bug. The view toggle and the launch dialog's parent-directory chord measured safe and were deliberately not tidied onto the family.

**Consequences.** Bare Command-N is no longer intercepted at all. Bindings are compiled in, not configurable. The rail-order contract for the digits is unchanged; only the chord moved. The invariant that no chord is browser-reserved is reviewer-verified against the probe file, never by the E2E suite.
