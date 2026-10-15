# Browser review: claude-version-watch

**Plan**: claude-version-watch
**Verdict**: needs-changes
**Cycle**: 3
**Pack**: kb: pack 6774 words (budget 30000)
**Rig**: `bin/musterd` built by `make web-build build` at 52881104 (embedded dashboard), driven through the committed `startDaemon` fixture: per-test data dir `$TMPDIR/muster e2e-XXXXXX` (space-bearing), tmux socket `<data dir>/tmux.sock` (killed by the fixture's teardown), the e2e stub `claude` with `MUSTER_E2E_STUB_VERSION_DELAY_SECONDS` 7 or 25; headless Chromium through two throwaway specs (30 tests, all run in the foreground, both deleted). No real `claude` was run. `git status` shows nothing of mine.

Gates log c5: 0 failed lines. `17-e2e` is 849 passed, including `masthead-layout.spec.ts:74` at 1512 and 1440 px.

Delta scope: this cycle covers REQ-5 only (065eade5, `.claude-version { display:inline-block; min-width: calc(27ch + 1px); text-align:right }`), the one web change since my cycle-1 approval. REQ-1–4 and the cycle-1 matrix rows are unchanged, and I did not re-measure them. REQ-6 is a daemon log line with no browser consequence: N/A.

## Matrix

Hosts: the readout sits in the masthead, which Focus and Tiles share. `/doc.html` has no masthead, so every pop-out cell is N/A. States:
- **pre-hello**: the "claude unknown" placeholder.
- **unknown**: "Claude installation unknown", the widest text.
- **version**: "claude 2.1.300", verified, no glyph.
- **version+glyph**: "claude 2.0.0 ⚠", below the floor.
- **daemon-down**: the scratch daemon SIGTERMed.

Two masthead loads:
- **Empty gauges**: no session, so the usage readouts are empty.
- **Full gauges**: the same load as `masthead-layout.spec.ts:74`. 5h at 100% and 7d, each with an other-day reset, plus the model-week bar and its selector.

Every x below is a `getBoundingClientRect().left`. "Seen" rows come from a MutationObserver on `#claude-version`, installed before the page script ran. It recorded Settings' x at every text change of a live, never-reloaded page.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-5 | focus | pre-hello → unknown → version+glyph, empty gauges, 1900/1512/1280/1000/900/640 | Settings, Issue and refresh hold their x across the live flip | pass | Seen: one Settings x per width across all three texts. Settings 1558.9 / 1186.9 / 954.9 / 699.8 / 699.8 / 699.8. Issue 1485 / 1121 / 889 / 634 and refresh 1444.8 / 1088.8 / 856.8 / 601.8, identical before and after. Pre-REQ-5 control (the rule overridden in the same page): Settings 955.9 → 1048.1 at 1280, the cycle-1 Note 2 movement |
| REQ-5 | tiles | same, empty gauges, the same six widths | same | pass | after a pointer click on Tiles (`aria-pressed=true`) before the flip, every x is identical to the Focus row |
| REQ-5 | focus | pre-hello → unknown → version, empty gauges, the same six widths | same | pass | the same x values as with the glyph. The version text is 4 px narrower, and that only moves the text inside the readout |
| REQ-5 | tiles | unknown → version, empty gauges | same | pass | identical |
| REQ-5 | focus, tiles | unknown → version, full gauges, 1512 / 1440 / 1400 / 1366 / 1280 | same | pass | Settings 1186.9 / 1114.9 / 1074.9 / 1040.9 / 1018.8, unchanged after the flip. Issue, refresh and `#usage-5h` were unchanged too (1512: 1121 / 1088.8 / 504.8) |
| REQ-5 | focus, tiles | every state | readout right-aligned | pass | computed `text-align: right`, `display: inline-block`. The text range's right edge equals the readout's right edge in every state. At 1280 the readout is 1041.1–1242. unknown text 1042–1242, version+glyph 1134.3–1242, version 1138.3–1242, placeholder 1138.3–1242 |
| REQ-5 | focus, tiles | every state, width ≥ 1366 (full) or ≥ 1280 (empty) | legible: whole text on screen, visible | pass | opacity 1, visibility visible, colour rgb(178,182,195), 12.3 px ui-monospace. The glyph shows opacity 1, inline, visible. The text range sits inside the readout box (unknown: 1 px slack at the left), inside the viewport, and the masthead stays 46 px tall |
| REQ-5 | focus, tiles | version / version+glyph, full gauges, 1280 | nothing overflows that didn't before | **FAIL** | with REQ-5, `.masthead` scrollWidth/clientWidth is 1328/1280 and `.masthead-right` 991/927. `#connection-status` sits at 1313.9–1327.9, entirely past the 1280 viewport. The readout text at 1202.2–1305.9 is cut at 1280. The same page with the rule overridden gives 1280/1280 and 894/894, with `#connection-status` at 1250–1264, flush with the padding edge (Major 1) |
| REQ-5 | focus, tiles | version / version+glyph, empty gauges, 1000 | same | **FAIL** | with REQ-5: 1009/1000, `#connection-status` at 995–1009, so its 6 px dot (≈999–1005) is half off-screen. Without the rule: 1000/1000, fits (Major 1) |
| REQ-5 | focus, tiles | version / version+glyph, empty gauges, 900 | same (cycle-1 Note 3's pre-existing overflow) | **FAIL — worse** | the overflow grew from 16 px (glyph) / 12 px (no glyph) to 109 px: 1009 vs 916/912 against 900. The right-aligned version text now spans 879.3–987, so only its first ~21 px ("cl") is on screen. Before, it spanned 786–894 and was fully visible (Major 1) |
| REQ-5 | focus, tiles | any, 640 | same | pass (no change) | 1009/640 with REQ-5. Without it, 916/640 with a version. Settings at 699.8 is off-screen either way, so the masthead was already unusable at this width |
| REQ-5 | focus, tiles | unknown, every width | same | pass (no change) | unknown text with and without the rule gives the same layout (±1 px, the `+1px`). The unknown state's overflow at ≤ 1000 px and at 1280 with full gauges existed before |
| REQ-5 | focus, tiles | full gauges, 1512 / 1440 / 1400 / 1366 | same | pass | masthead fits in every case (1512/1512, 1440/1440, 1400/1400, 1366/1366). `#connection-status` right equals the padding-box right (1496, 1424, 1384, 1350). Zero slack: `.masthead-right` is 991/991 |
| REQ-5 | focus, tiles | daemon-down, 1280 and 900 | controls hold still; outage surfaced | pass | after SIGTERM the `#banner` is `display: block` ("musterd unreachable — …"). The readout keeps its text, Settings stays at 954.9 / 699.8, and the readout box is unchanged |
| REQ-5 | pop-out | any | — | N/A — `/doc.html` has no masthead or readout | |
| Keeps focus | focus, tiles | any | — | N/A — the flip replaces only `#claude-version`'s children, which hold nothing focusable. Settings is not re-rendered | |
| REQ-6 | — | — | — | N/A — a daemon log line, nothing rendered (review-work's) | |
| §6 / §7 | — | — | no new honesty or terminal surface | pass / N/A | REQ-5 is one CSS rule on an existing readout |

## Issues

### Critical

None.

### Major

1. **[orchestrator:decision]** The reserved width makes the masthead overflow, with a version held, at widths where it fitted before. `web/src/style.css` `.claude-version` reserves ~201 px against the version text's ~104 px, so `.masthead-right` grows by ~97 px.
   - **1280 px, full gauges** (the cycle-1 rig width): the connection-status dot moves fully off-screen and the readout's text is cut mid-version. It fitted exactly before.
   - **1000 px, empty gauges**: half the dot is clipped. It fitted before.
   - **900 px**: the cycle-1 Note 3 overflow grew from 16 px to 109 px, and the version text is pushed almost entirely off-screen.

   REQ-5 as written ("reserves the width of its widest text") requires this. The shipped code matches the plan, and the plan's consequence is what I measured. The layout specs only assert one-row fit at 1512 and 1440, and those still pass, with zero slack.
   - **Option A (keep REQ-5 as is):** accept the overflow below ~1366 px with every gauge known, and below ~1009 px with none. Record the narrow-width trade in the plan or an ADR.
   - **Option B (shrink what is reserved):** make the widest text shorter, so the reservation costs only a few `ch` over "claude 2.1.300 ⚠" (16 ch). For example, the unknown state could read "claude unknown" (14 ch), which is the existing pre-hello text. Or reserve only the version-text width (`16ch`) and accept a one-time shift when the unknown state is shown. The controls still hold still across version ↔ version changes.

### Minor

None.

### Notes

1. **[note]** The REQ-5 e2e (`claude-version.spec.ts`, Settings x before/after the flip) does what the plan's Automated Checks ask, and it would have failed on the pre-REQ-5 CSS: my control measured a 92 px shift at its 1280 viewport. It checks no overflow, and REQ-5 does not ask it to.
2. **[note]** The pre-hello placeholder "claude unknown" was seen live in every run. Settings held its x through it too, at every width.
3. **[note]** My first spec run waited about 9 minutes on the machine-wide gate lock, held by another worktree's (`muster-effort`) gate run. Nothing was measured under contention.
