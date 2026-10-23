---
id: construction-option-change-reached-a-never-shown-terminal
type: lesson
status: active
date: 2026-10-23
summary: A fix changed every terminal's construction rows and measured the visible ones; the shell kept behind Docs, built but never shown, broke twice, two cycles.
features: [surfaces]
tags: [pipeline]
roles: [web-impl, review-browser]
files: [web/src/terminal/pane.ts]
tests: [web/e2e/shell-scroll.spec.ts]
refs: [plan:bugs-one-batch-1, plans/bugs-one-batch-1/review.code.cycle2.md, plans/bugs-one-batch-1/review.browser.cycle3.md]
---
**What happened.** Cycle 1's fix for the swallowed wheel notch set `rows: 2` on every `new Terminal`
and re-measured Claude and the shell in Focus and Tiles. The one consumer never on screen, a shell
surface kept alive behind Docs, opened its socket unmounted, sent the construction size and was
clamped to 80×5 (cycle 2, Major). The cycle-2 fix stopped that send but left xterm opened on a
detached body, so the same shell, once reselected, held a scroll range and ate the wheel again
(cycle 3, Major). The root cause, opening xterm into an element with no layout, was found in cycle 3.

**Lesson.** The blast radius of a shared constructor option or a change to `refit()` includes the
surfaces that exist without ever being shown: measure a terminal built while its host is unmounted,
then mounted, before calling a `pane.ts` fix done, and a browser review re-drives that path too.
