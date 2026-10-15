
## Fix Attempt 3 (review cycle 3, REQ-5)

**Failures addressed**: REQ-5, `#claude-version` readout changing width live (review.browser.cycle1.md Note 2: 200 -> 108 px, Settings 956 -> 1048).
**Changes made**: `web/src/style.css` - `.claude-version { display: inline-block; min-width: calc(27ch + 1px); text-align: right; }`. 27ch is the length of "Claude installation unknown" in the masthead's mono face (`ch` tracks the font); `+ 1px` because the first measurement showed 27ch alone reserved 199.9375 px against the text's natural 199.953 px (sub-pixel advance rounding), which moved Settings by 0.016 px. No TS change. Blast radius: `rg claude-version web/src web/index.html` -> one element (`#claude-version`), one CSS rule.
**Measurement** (real Chromium, built dashboard from `internal/webui/assets`, readout text swapped through the real DOM; `.claude-version` natural width of the unknown text = 199.953 px):

| text | 1512 / 1440 / 1280 viewport: readout width, Settings x |
|---|---|
| Claude installation unknown | 200.9375 px; 1186.875 / 1114.875 / 954.875 |
| claude 2.1.300 | 200.9375 px; same x |
| claude 2.1.300 + warn glyph | 200.9375 px; same x |
| claude 10.22.333-rc.1 + warn glyph | 200.9375 px; same x |
| claude unknown (pre-hello) | 200.9375 px; same x |

Reserved 200.94 >= 199.95; Settings x identical across all five texts at each width; `.masthead` scrollWidth - clientWidth = 0 at each width.
**Decisions**: design: reuses the existing `.claude-version` selector beside its tabular-nums rule; no new module; `min-width` (not `width`) so a version string longer than the reservation still grows rather than clips. No Testable UI Elements row changed.

**Build status**: `npx tsc --noEmit`, `npm run build`, `make contrast` exit 0.
**E2E smoke**: `npx playwright test e2e/masthead-layout.spec.ts e2e/claude-version.spec.ts` -> 10 passed (33.1s).

## Fix Attempt 4 (review cycle 4, REQ-5 amended: readout-reserved-width decision B)

**Failures addressed**: browser review cycle 3 Major 1 - the 27ch reservation overflowed the masthead at 1280 (full gauges), 1000 and 900.
**Changes made**:
- `web/src/features/connectionversion.ts` - pre-hello and `status: "unknown"` (and the defensive `installed === null`) both produce text `claude unknown`, plus `hint: "The Claude Code version check failed or hasn't completed yet"`; every other state `hint: null`.
- `web/src/render/masthead.ts` - `ClaudeVersionDescription` gains optional `hint`; `renderClaudeVersion` sets `el.title = hint ?? ""` (the readout's native tooltip, the same mechanism the warning glyph uses; cleared when a state has none). No new colour.
- `web/src/style.css` - `.claude-version { min-width: calc(17ch + 4px) }`, right-aligned: 15ch ("claude 2.10.300") + 1ch space + 4px glyph margin + 1ch glyph = the widest version text plus glyph.

**Measurement** (real Chromium, fresh `make web-build build`; readout DOM forced to each state; CTRL = same page with `min-width: 0`, i.e. pre-REQ-5 natural width; REQ5 = shipped). Readout box is 129.9 px in every state under REQ5.
Settings x identical across pre-hello, "claude unknown", "claude 2.1.300", "claude 2.1.300"+glyph (also 2.10.300 and +glyph):

| viewport | gauges | Settings x, all 6 states (REQ5) | CTRL Settings x range |
|---|---|---|---|
| 1512 | full | 1257.9 | 1257.9-1284.1 |
| 1440 | full | 1185.9 | 1185.9-1212.1 |
| 1366 | full | 1111.9 | 1111.9-1138.1 |
| 1280 | full | 1025.9 | 1025.9-1052.1 |
| 1280 | empty | 1025.9 | 1025.9-1052.1 |
| 1000 | empty | 745.9 | 745.9-772.1 |
| 900 | empty | 699.8 | 699.8 (pinned) |

Masthead overflow (scrollWidth - clientWidth) and `#connection-status` right edge vs viewport (REQ5; the same under every state):

| viewport | gauges | overflow | conn right | conn inside viewport | CTRL overflow (2.1.300 / 2.1.300+glyph / 2.10.300+glyph) |
|---|---|---|---|---|---|
| 1512 / 1440 / 1366 | full | 0 | 1496 / 1424 / 1350 | yes | 0 |
| 1280 | full | 0 | 1264 | yes | 0 |
| 1280 | empty | 0 | 1264 | yes | 0 |
| 1000 | empty | 0 | 984 | yes | 0 |
| 900 | empty | 38 | 937.9 | **no** | 12 / 31 / 38 |

The full-gauge rig seeded 5h 100% with other-day resets, 7d 10%, and model-week 15% (Fable) as in `masthead-layout.spec.ts`; the model select was visible.
900 px: pre-REQ-5 already overflowed (12 px, 31 px with the glyph on 2.1.300; the review's 16 px was "claude 2.0.0"+glyph, 2 characters shorter) and its dot was already off-screen (911.7-930.5 > 900). Reserving a width wider than the current text necessarily adds the difference: 38 px under REQ5 vs 31 px (2.1.300+glyph) / 12 px (2.1.300). This is the one place REQ-5 is worse than pre-REQ-5; 1280 (full gauges) and 1000 now fit as before. Narrowing the reservation to "claude 2.1.300"+glyph (-7.4 px) would give 31 px at 900 but then a two-digit-minor version shifts the controls.
Real flip at 1280 (7 s stub, no reload): "claude unknown" (title "The Claude Code version check failed or hasn't completed yet") -> "claude 2.0.0 ⚠" (readout title empty, glyph title/aria-label the warning): Settings x 1025.9375 both, readout width 129.875 both. The truly pre-hello frame was measured through forced DOM only (WS blocking broke app init); it renders from the same description as unknown.

**Decisions**:
- design: `hint` is optional on `ClaudeVersionDescription` so existing masthead render tests, whose literals lack it, still type-check; the one producer always sets it. `el.title = hint ?? ""` rather than `removeAttribute` because the masthead tests' `FakeVersionElement` has no `removeAttribute` (test-double limit, kept off shipped code).
- design: precedent grep - `rg "\.title =" web/src/render/masthead.ts` shows the glyph and the connection status use `title`; reused rather than a custom tooltip.
- doc-delta: `docs/features/connection/spec.md:68` still says unknown renders as "Claude installation unknown"; it is now "claude unknown" with hover text. plan.md Edge Case 1 / line 25 / line 148 and the `claude-version.spec.ts` / `connectionversion.test.ts` assertions carry the old text.

## Handoff

**Build status**: `npx tsc --noEmit`, `npm run build`, `npm run lint` exit 0.
**E2E smoke**: `npx playwright test e2e/claude-version.spec.ts e2e/masthead-layout.spec.ts` -> 3 failed, 8 passed; the 3 failures assert the old text "Claude installation unknown" (claude-version.spec.ts lines 132, 191, 211).
Sanctioned failures for web-tests / e2e-specs: `web/src/features/connectionversion.test.ts` (7 cases: text "Claude installation unknown" -> "claude unknown", and `toEqual` now carries `hint`); `web/e2e/claude-version.spec.ts` tests at :120, :178, :199 (text; the :199 REQ-5 test should also compare Settings x across pre-hello/unknown/version+glyph, and add a hover-text assertion on `#claude-version[title]` for the unknown state). `masthead.test.ts` passes unchanged.
