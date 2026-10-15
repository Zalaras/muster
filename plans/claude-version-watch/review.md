# Review: claude-version-watch

**Plan**: claude-version-watch
**Verdict**: approved
**Cycle**: 3
**Gates**: 0 failed
**Parts**: code, browser | skipped: maintainability
**Part verdicts**: code approved, browser approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: claude-version-watch

**Plan**: claude-version-watch
**Part verdict**: approved
**Cycle**: 4
**Pack**: kb: pack 25552 words (budget 30000)

Scope: this cycle reviews the delta `1e14392b..HEAD`. Cycle 3 left one open item, browser Major 1 `[orchestrator:decision]`. It was not a Minor, so this is not a Minors-only delta re-review. The diff touches `web/src/` (`connectionversion.ts`, `masthead.ts`, `style.css`), so §3–§6 were run on that area. The delta contains:
- the developer's decision B (1485175f: ADR, design-system.md, protocol.md, plan REQ-5 amendment);
- the web fix (ed92e882), the unit tests (c2ceaf6c) and the e2e specs (876f619d);
- the doc-delta update (0ac01793), the comment pass (2a4c7199), the **Touches** header (1c5d820d) and the formatter-only test commit (bfe9af41).

REQ-1 to REQ-4 and REQ-6 have no code in the delta. Their rows rest on cycles 1–3 plus this cycle's green gate run.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes (cycles 1–3; daemon untouched) | Yes: E1 `claude-version.spec.ts:187`. It now waits for "connected" (the hello) before asserting `claude unknown` plus the hint, then the flip. | pass |
| REQ-2 | Yes (cycles 1–3) | Yes: E1 `:187` (live flip, no reload) | pass |
| REQ-3 | Yes (cycles 1–3) | Yes: D2 | pass |
| REQ-4 | Yes (cycles 1–3) | Yes: D1 / E1 | pass |
| REQ-5 (amended) | Yes. `connectionversion.ts:22-24`: pre-hello, `status:"unknown"` and the defensive `installed === null` all return `{text:"claude unknown", hint: VERSION_UNKNOWN}`. Every other state returns `hint:null`. `masthead.ts:320`: `el.title = hint ?? ""`, so the title is set while unknown and cleared on a version. `style.css:337`: `min-width: calc(17ch + 4px)`, right-aligned. That is "claude 2.10.300" (15ch) + space (1ch) + glyph (1ch) + `.version-warn`'s `margin-left: 4px` (`style.css:373`), which is the widest realistic version plus glyph, as the decision says. "Fits wherever it fitted before": web-impl's control table shows 0 overflow at 1512/1440/1366/1280 (full gauges) and 1280/1000 (empty). 900 px overflowed before and still does (38 vs 31 px), which the orchestrator accepted as recorded. | Yes. Unit: 7 `describeClaudeVersion` rows carry text plus `hint`; `masthead.test.ts:450` checks that the title is set on unknown and cleared on a later version. E2E: `claude-version.spec.ts:211` holds Settings x and the readout's own width across unknown → version+glyph, and checks title = hint before and `""` after. E4 `:127` checks text plus hint. `masthead-layout.spec.ts` gains 1280 px and asserts `#connection-status` right ≤ viewport. test-specs.md records it red against the cycle-3 `27ch+1px` (1327.89 > 1280), and the REQ-5 test red with no reservation (4 px shift). All passed in 18-E1 and 17-e2e. | pass |
| REQ-6 | Yes (cycle 3; untouched) | Yes: D2 | pass |
| DIAG | `kb:diagram/web-components` (from `kb for` on `style.css`, `connectionversion.ts` and `masthead.ts`). It is module-level, and a new optional field and a CSS value change neither modules nor edges. | — | pass |

## Build & Tests

E2E tests: pass (850 passed, 8.0m, 17-e2e.log) · Daemon tests (race): pass (02-test.log, 25 packages ok) · Web tests: pass (2623 in 93 files, 05-web-test.log) · Daemon build: pass (01-build.log, empty) · Web build: pass (04-web-build.log, chunk-size warning only) · Lint: pass (03-lint.log 0 issues; 06-web-lint.log 323 files clean). All read from `$GATES_LOG_DIR` = `gates-claude-version-watch-c7`, 0 failed lines.

Baseline lines: contrast 0 failures ×3 themes; versions fresh; kb check 592 records, 0 problems; e2e-lint clean; features-scope ok (connection, issue; Touches usage); comment-checks clean; comment ledger 4/4 kept; e2e-honest and features-inventory pass with empty output. The `WARN size` line (7 hits) belongs to review-maintainability, which is skipped this cycle.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| E1 | `cd web && npx playwright test e2e/claude-version.spec.ts` | pass (8 passed, 18-E1.log) |
| D1 | `go test -count=1 ./cmd/musterd/ ./internal/server/` | pass (19-D1.log) |
| D2 | `go test -count=1 -run 'ClaudeVersion' ./internal/server/` | pass (20-D2.log) |
| D3 | `make lint` | pass (deduped to 03-lint) |
| W1 | `make web-lint` | pass (deduped to 06-web-lint) |
| W2 | `make web-test` | pass (deduped to 05-web-test) |
| DOC | doc upkeep + Doc Delta vs what shipped | FAIL (`[orchestrator]`, non-blocking). Correctness Major 1 covers the plan.md § Doc Delta gap. The connection spec still carries the old unknown text and the old unresolved-binary message, which is known pending work for doc-reconcile. What passes: every claim in `doc-delta.md` matches the code (text, hint string verbatim, one right-aligned width). The ADR `connection-claude-version-readout-short-unknown-fixed-width` exists, describes what shipped, and refs `plan:claude-version-watch`. `design-system.md:186-189`, `protocol.md:1149` and the generated canary/connection `contract.md` all say "claude unknown", which is true. The delta logs carry no `deviation:` line. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | No `claude` subprocess runs on the request path or before `Listen`; the identity look is a stat. | pass | The delta touches no Go file. Unchanged from cycle 3's verification. |
| RV2 | The new feature follows `themepoll.go`: registered in `New`, no logic in `server.go`. | pass | The delta touches no Go file. |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. The delta is web-only and adds no Claude-Code wire knowledge. |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hooks | pass (not touched) |
| 4 | tmux via `-L muster` / sizing | pass (not touched) |
| 5 | No payload logging | pass (not touched) |
| 6 | Empty-gauge honesty | pass. Every absent or unknown branch (`null`, `status:"unknown"`, `installed === null`) renders the words "claude unknown" plus hover text, never an empty or `claude null` readout. |
| 7 | Identity on tmux target | pass (not touched) |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary | pass. The specs use the stub (`stubClaudeVersionDelaySeconds: 7`, `stubClaudeVersion`). |

## Delta (delta re-review only)

| Prior item | Fix commit | Verified how |
|------------|------------|--------------|
| cycle 3 browser Major 1 `[orchestrator:decision]` "The reserved width makes the masthead overflow … at widths where it fitted before" | decision 1485175f; fix `ed92e882`, `c2ceaf6c`, `876f619d`, `bfe9af41` | Decision B was read against the diff. The unknown text is "claude unknown" with hover hint, and the reservation is `17ch + 4px` (widest version + glyph + its 4 px margin). `masthead-layout.spec.ts` now pins the 1280 px case red→green, and the REQ-5 spec pins Settings x and the readout width across the flip. bfe9af41 is formatter-only: `git diff` shows only line wrapping of the `toEqual` literals, with no assertion value changed. The 900 px residual (38 vs 31 px) is the orchestrator's recorded acceptance. Browser measurement of the result is review-browser's. |
| cycle 3 correctness Major 1 `[orchestrator]` (REQ-6 doc delta) | plan.md § Doc Delta, doc-delta.md | Resolved in the plan and doc-delta.md. Both carry the new unresolved-binary message. Promotion to the connection spec is still pending (DOC row). |

## Issues

### Critical

None.

### Major

1. **[orchestrator]** plan.md § Doc Delta does not reflect the new unknown text. `web-implementation.md:60` carries a `doc-delta:` line saying the unknown state now reads "claude unknown" with hover text. `doc-delta.md:10` has it, but `plans/claude-version-watch/plan.md` § Doc Delta (lines 189-196) does not. Its REQ-5 bullet also lacks the "widest realistic version plus its glyph" qualifier that `doc-delta.md:9` carries. Fix: add the "claude unknown" + hover-text line to plan.md § Doc Delta so the two agree. When doc-reconcile runs, it must also replace `docs/features/connection/spec.md:68` ("Claude installation unknown") and `:74-76` (the old "could not determine claude code version" for the unresolved binary). Both are known pending and do not block approval.

### Minor

None.

### Notes

1. **[note]** `web/e2e/masthead-layout.spec.ts:107-109`: the comment still names "the transient 'connecting…' + 'Claude installation unknown' combination that only shows briefly pre-hello". The pre-hello text is "claude unknown", and the long text no longer exists anywhere. The comment is stale.
2. **[note]** `docs/adr/usage-masthead-narrow-width-shrinks-bars-truncates-model.md:20` (accepted) measures an overflow for "`Claude installation unknown` with `reconnecting…`" at 1512 px. The text no longer exists, and the reservation is now ~130 px instead of ~201 px. An accepted ADR's text is history and is not edited. If the usage spec repeats that overflow claim, doc-reconcile may want to drop it. No change is requested here.
3. **[note]** The amended REQ-5 says "the masthead fits wherever it fitted before". The e2e pins 1512, 1440 and 1280 px (full gauges). The 1000 px empty-gauge case that browser cycle 3 also flagged rests only on web-impl's measurement table (0 overflow, dot right edge at 984). That is enough for this cycle, and review-browser re-measures it.

## Browser review

# Browser review: claude-version-watch

**Plan**: claude-version-watch
**Part verdict**: approved
**Cycle**: 4
**Pack**: kb: pack 7408 words (budget 30000)
**Rig**: `bin/musterd` built by `make web-build build` at bfe9af41 (embedded dashboard), driven through the committed `startDaemon` fixture: per-test data dir `$TMPDIR/muster e2e-XXXXXX` (space-bearing), tmux socket `<data dir>/tmux.sock` (killed by the fixture's teardown), the e2e stub `claude` with `MUSTER_E2E_STUB_VERSION_DELAY_SECONDS` 10 (empty gauges) or 25 (full gauges); headless Chromium through one throwaway spec, run twice in the foreground (24 + 8 tests, all passed), then deleted. No real `claude` was run. No daemon or tmux server of mine is left, and `git status` shows nothing of mine.

Gates log c7: 0 failed lines. `17-e2e` is 850 passed, including `masthead-layout.spec.ts:76` at 1512, 1440 and 1280, and `claude-version.spec.ts:211` (REQ-5).

Delta scope: this cycle covers my cycle-3 Major 1 only. The fix is ed92e882:
- the unknown state reads "claude unknown" and carries the hover text "The Claude Code version check failed or hasn't completed yet";
- `.claude-version` reserves `calc(17ch + 4px)` (129.9 px computed), right-aligned.

REQ-1–4 and the cycle-1 rows are unchanged, and I did not re-measure them. REQ-6 is a daemon log line: N/A.

## Matrix

Hosts: the readout sits in the masthead, which Focus and Tiles share. Tiles was selected by a pointer click (`aria-pressed=true`) before the flip. `/doc.html` has no masthead, so the pop-out is N/A.

States:
- **pre-hello**: the "claude unknown" placeholder, `data-health=pending`.
- **unknown**: "claude unknown" from the hello's `status: unknown`, held while the stub's `--version` sleeps.
- **version**: "claude 2.1.300", verified, no glyph.
- **version+glyph**: "claude 2.0.0 ⚠", below the floor.
- **daemon-down**: the scratch daemon SIGTERMed.

Two masthead loads:
- **Empty gauges**: no session.
- **Full gauges**: the `masthead-layout.spec.ts` load. That is 5h at 100% and 7d, each with an other-day reset, plus the model-week bar and its selector, with a verified version.

Every x is a `getBoundingClientRect().left`.
- **Seen**: a MutationObserver on `#claude-version`, installed by an init script before the page script ran, recorded the layout at every text change of one live, never-reloaded page: pre-hello, then hello, then the flip.
- **Control**: the same page with `.claude-version{min-width:0 !important}` injected after the flip, then removed. That is the pre-REQ-5 layout with a version shown. It reproduces my cycle-3 control numbers exactly (900 px: 916/900 with the glyph, 912/900 without; 1280 full: `.masthead-right` 894).

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-5 | focus | pre-hello → unknown → version+glyph, empty gauges, 1900/1512/1440/1366/1280/1000/900/640 | Settings, Issue and refresh hold their x across the live flip | pass | Seen: one (Settings, Issue, refresh) x triple per width across all three texts. 1900: 1629.9/1556.1/1515.9. 1512: 1257.9/1192.1/1159.9. 1440: 1185.9/1120.1/1087.9. 1366: 1111.9/1046.1/1013.9. 1280: 1025.9/960.1/927.9. 1000: 745.9/680.1/647.9. 900 and 640: 699.8/634/601.8. The readout box is 129.9 px in every state. Control: with the rule removed, Settings moves +22.2 px (glyph) or +26.2 px (no glyph) at every width ≥ 1000, so the spec's assertion can fail |
| REQ-5 | tiles | same, the same eight widths | same | pass | every x is identical to the Focus row at each width |
| REQ-5 | focus, tiles | pre-hello → unknown → version, empty gauges, the same eight widths | same | pass | same x values as with the glyph. Inside the readout, the text's left edge moves from 1138.3 (unknown) to 1134.3 (glyph) or 1138.3 (version) at 1280. Right edge 1242 in every state |
| REQ-5 | focus, tiles | unknown → version, full gauges, 1512/1440/1366/1280 | same | pass | Settings/Issue/refresh unchanged across the flip: 1257.9/1192.1/1159.9, 1185.9/1120.1/1087.9, 1111.9/1046.1/1013.9, 1025.9/960.1/927.9. `#usage-5h` unchanged too (1280: 343.8) |
| REQ-5 | focus, tiles | every state | readout right-aligned, text inside its box | pass | computed `text-align: right`, min-width 129.889 px. The text range's right edge equals the readout's right edge in every state. The text sits inside the box with 22–26 px to spare |
| REQ-5 | focus, tiles | every state, every width where the masthead fits | legible: visible, on screen | pass | opacity 1, visibility visible, colour rgb(178,182,195), 12.3 px ui-monospace. The glyph shows opacity 1, inline, visible, and keeps its own title/aria-label. The masthead is 46 px tall (one row) in every cell |
| REQ-5 | focus, tiles | unknown + pre-hello, every width | hover hint shown while unknown | pass | `#claude-version[title]` = "The Claude Code version check failed or hasn't completed yet" in the pre-hello and the hello-unknown snapshots, at every width, both hosts, after a real pointer hover over the readout. Headless Chromium draws no native tooltip, so the attribute is the instrument (Note 2) |
| REQ-5 | focus, tiles | after the flip (glyph and no glyph), every width | hover hint gone | pass | `title` = "" at the flip's own mutation and 1.2 s later. The glyph's own title is unaffected |
| REQ-5 | focus, tiles | version / version+glyph, full gauges, 1512/1440/1366/1280 | masthead fits as before; `#connection-status` in the viewport | pass | `.masthead` scrollWidth/clientWidth 1512/1512, 1440/1440, 1366/1366, 1280/1280. `.masthead-right` 920/920 (control 894/894). `#connection-status` right edge 1496/1424/1350/1264, the same as the control. 1280 is cycle 3's failing cell: then 1328/1280 with the dot at 1313.9–1327.9. New session ends at 322.6 and `.masthead-right` starts at 343.8 (control 370), so nothing overlaps |
| REQ-5 | focus, tiles | every state, empty gauges, 1900/1512/1440/1366/1280/1000 | same | pass | masthead w/w at every width. `.masthead-right` 601/601 (control 579 glyph / 575 version). 1000 is cycle 3's failing cell: then 1009/1000 with the dot half off. Now 1000/1000, dot 970–984 |
| REQ-5 | focus, tiles | every state, empty gauges, 900 | worse only by the accepted amount | pass (accepted) | 938/900 in every state, a 38 px overflow. Control 916/900 (glyph) and 912/900 (version). The dot is off-screen either way: 923.9–937.9 now, 901.7–915.7 or 897.7–911.7 in the control. The version text now ends at 915.9, so its last ~16 px are past the viewport. It ended at 893.7/889.7 before (Note 1). This is the overflow the orchestrator accepted |
| REQ-5 | focus, tiles | every state, 640 | no change that matters | pass (no change) | 938/640 vs control 916/912. Settings at 699.8 is off-screen in both, so the masthead was already unusable at this width |
| REQ-5 | focus, tiles | daemon-down, every width | controls hold still; outage surfaced | pass | after SIGTERM, `#banner` is `display: block` ("musterd unreachable — …"). The readout keeps its last text with no hint. Settings and the readout box are unchanged from the flipped state at every width, e.g. 1280: Settings 1025.9, readout 1112.1–1242 |
| REQ-5 | pop-out | any | — | N/A — `/doc.html` has no masthead or readout | |
| Keeps focus | focus, tiles | any | — | N/A — the flip replaces only `#claude-version`'s children and its `title`. Nothing in it is focusable, and Settings is not re-rendered | |
| REQ-6 | — | — | — | N/A — a daemon log line, nothing rendered (review-work's) | |
| §6 / §7 | — | — | no new honesty or terminal surface | pass / N/A | the change is the readout's text, title and min-width. The unknown state still says *unknown*; it does not show a blank or a guessed version |

## Issues

### Critical

None.

### Major

None. Cycle-3 Major 1 is resolved: the 1280 (full gauges) and 1000 (empty gauges) cells fit again, and the 1366–1900 cells keep fitting.

### Minor

None.

### Notes

1. **[note]** At 900 px the 38 px overflow (accepted) also clips the version text. It is right-aligned, so about its last two characters ("…00" of "claude 2.1.300") fall past the viewport edge. Before REQ-5 the whole text was visible at 900, and only the dot was off-screen. This follows from the accepted overflow. It is written down so the acceptance covers it knowingly, and no change is requested.
2. **[note]** The hover hint was checked as the `title` attribute after a real pointer hover. Headless Chromium does not render native tooltips, so no tooltip pixels were seen.
3. **[note]** In my first run, the hover itself (Playwright's scroll-into-view) scrolled the overflowing masthead at 900 and 640 px. That made Settings appear to move 16 px and 298 px across the flip. The second run measured without the hover and recorded `scrollLeft` = 0: Settings holds 699.8 across pre-hello, unknown, the flip and daemon-down. The shift was my instrument, not the app. It only happens at widths where the masthead already overflowed before this plan.
