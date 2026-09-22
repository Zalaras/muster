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
**What happened.** `wheelDeltaToScrollLines` rounds to 0 below 10 px and `flushWheelScroll` zeroed its accumulator before the `lines === 0` return, so every sub-line remainder was discarded and a slow trackpad scroll — the gentlest and likeliest gesture — did nothing at all. Three E2E specs exercised the wheel and every one used deltas of 300 or more; no unit test touched the threshold. The defect survived 394 green tests and was found only because a reviewer drove a real browser: 60 x `deltaY = -4` left `#{pane_in_mode} = 0` where one `deltaY = -120` scrolled 6 lines.

**Cost.** A review cycle, three fix waves, and a near-miss — the plan's headline fix shipping dead for the first gesture a user would try.

**The lesson.** A rounding, clamp, debounce or minimum in the code is a **boundary**, and a suite that only ever drives values far from it proves nothing about the case a user hits first. Test immediately either side of the threshold rather than at one comfortable magnitude, and prefer the shape real input has (a trackpad emits ~4 px per event, not 300). A test written *after* the fix earns its place only if it discriminates: reintroduce the defect and watch it go red, because a unit test that mirrors the arithmetic instead of calling the shipped code stays green against a revert.
