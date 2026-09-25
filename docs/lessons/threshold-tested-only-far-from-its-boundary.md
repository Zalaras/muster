---
id: threshold-tested-only-far-from-its-boundary
type: lesson
status: active
date: 2026-09-22
summary: Three wheel specs drove deltas 30x the rounding threshold, so a discarded sub-line remainder survived 394 green tests and only a reviewer caught it.
features: []
tags: [testing, pipeline]
roles: [e2e-specs, web-tests, daemon-tests, web-impl, review]
files: []
tests: []
refs: [plan:terminal-fixes-cleanup, plans/terminal-fixes-cleanup/review.cycle1.md, kb:adr/surfaces-shell-scroll-via-daemon-copy-mode]
---

**What happened.** `wheelDeltaToScrollLines` rounds to 0 below 10 px and `flushWheelScroll` zeroed its accumulator before the `lines === 0` return, so every sub-line remainder was discarded and a slow trackpad scroll did nothing. Three E2E specs drove the wheel with deltas of 300 or more; no unit test touched the threshold. The defect survived 394 green tests until a reviewer drove a real browser: sixty events of `deltaY = -4` scrolled nothing.

**Cost.** A review cycle, three fix waves, and the plan's headline fix nearly shipping dead for the first gesture a user would try.

**The lesson.** A rounding, clamp, debounce or minimum is a boundary; a suite that only drives values far from it proves nothing about the case a user hits first. Test either side of the threshold with the shape real input has (a trackpad emits ~4 px per event). A test written after the fix earns its place only if reintroducing the defect turns it red.
