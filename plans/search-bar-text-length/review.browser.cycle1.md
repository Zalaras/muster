# Browser review: search-bar-text-length

**Plan**: search-bar-text-length
**Verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 6982 words (budget 30000)
**Rig**: `make web-build build` at 69adc095, `bin/musterd` started per test by the committed `helpers/daemon.ts` fixture (data dir `$TMPDIR/muster e2e-2f6c12ee-*`, which has a space in it; tmux `-S <data dir>/tmux.sock`; stub `claude` from `$TMPDIR/muster e2e-stub-953c0b15a8cc21d6/claude`). Headless Chromium 1280×720, throwaway spec `web/e2e/zz-review-browser-rig.spec.ts` run in the foreground and then deleted; `git status --porcelain` shows only the orchestrator's `orchestration-state.json`.

Gates log: one red line, `02-test` (`internal/server` › `TestWrapperReply_PrintsTheBodyOnlyOnA2xx/200_with_a_body`: `signal: killed` after 10.6 s, a Go test). The plan changes only `web/`, and `04-web-build`, `17-e2e`, `18-W1` and `19-E1` are green, so the app I drove is the one that ships.

Fixture: `rig.md` holds `needle` 3 times, `alphaword` 999 times and `betaword` 1234 times. Each host went through these states: empty → `needle` (1 of 3) → Enter (2 of 3, then a 1.2 s wait) → `alphaword` (1 of 999) → Shift+Enter (999 of 999) → `zzzz` → `betaword` → Shift+Enter (1234 of 1234) → cleared. Every query was typed with real keys, and the old query was replaced with Meta+A. "Bar" means the nearest ancestor holding both the query box and Close. Deltas are measured against the empty-query state of the same host.

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | focus | data | empty query reads `No results`, visible | pass | text `No results`; count computed `block/visible/1`; text range 867–934.7 fills count box 867–934.7 (sw68/cw68, no clip) |
| REQ-1 | tile 2×2 (compact) | data | same | pass | `No results`, `block/visible/1`, range 298.8–360.2 = box, sw61/cw61 |
| REQ-1 | tile 3×2 (compact) | data | same | pass | `No results`, `block/visible/1`, range 275.6–337 = box, sw61/cw61 |
| REQ-1 | pop-out | data | same | pass | `No results`, `block/visible/1`, range 867–934.7 = box |
| REQ-1 | focus | daemon-down | same, after SIGTERM | pass | banner `musterd unreachable — …` visible; reopened bar still `No results`, `block/visible/1` |
| REQ-1 | all | no data | empty query reads `No results` | N/A: with no `.md` in the directory the body reads `nothing open — pick a file` and the Search document icon is not in the DOM (count=0), so the bar cannot open | |
| REQ-2 | focus / 2×2 / 3×2 / pop-out | data | miss reads `No results`; matches read `<i> of <n>` | pass | `zzzz` → `No results` in all four hosts; `1 of 3`, `2 of 3`, `1 of 999`, `999 of 999`, `1234 of 1234` read exactly; the totals match the fixture's known counts (3/999/1234 written into the file) |
| REQ-2 | focus | daemon-down | same | pass | `needle` → `1 of 3`, `zzzz` → `No results` after SIGTERM |
| REQ-3 | focus | data | bar width and left edge constant across empty / 1 of 3 / 1 of 999 / 999 of 999 / miss / cleared | pass | bar 737.0–1024 w287.0 in every state; max \|dx\| 0.02, \|dw\| 0.02 |
| REQ-3 | tile 2×2 | data | same | pass | bar 226.2–430.5 w204.3; max \|dx\|, \|dw\| 0.02 |
| REQ-3 | tile 3×2 | data | same | pass | bar 203.0–407.3 w204.3; max \|dx\|, \|dw\| 0.02 |
| REQ-3 | pop-out | data | same | pass | bar 737.0–1024 w287.0; max \|dx\|, \|dw\| 0.02 |
| REQ-3 | focus | daemon-down | same | pass | bar x 737.05 / 737.06 / 737.05 for empty / 1 of 3 / miss; w287 |
| REQ-3 | all hosts | data | bar contained in its host and not overflowing | pass | bar inside `article.md` and the reader box in every state (e.g. focus 737–1024 inside article 300–1044; 3×2 203–407.3 inside 2–425.3); bar scrollWidth = clientWidth (285/285, 202/202) |
| Reviewer-verified (issue #102 gap) | focus / pop-out | data | opened bar shows `No results` between query box and ↑ with no blank gap | pass | query box right → text left 4 px, text right → ↑ left 4 px (the bar's `gap`), the same as the spacing between the arrows; screenshot confirms `[query] No results ↑ ↓ ×` |
| Reviewer-verified | tile 2×2 / 3×2 | data | same in compact | pass | 2 px / 2 px (compact `gap: 2px`) |
| Keeps focus | all 4 hosts | data | query box keeps focus across count changes and a ≥1.1 s tick | pass | `document.activeElement === input` after Enter plus 1.2 s, and in every measured state |
| Edge 1 (closed bar) | all | data | count not shown | N/A: plan marks it untested; the bar is `[hidden]` with its `.find-bar[hidden] { display: none }` companion, unchanged by this plan | |
| Edge 2 (≥1000 count) | focus / pop-out | data | bar widens a little and stays contained | pass, see Note 2 | `1234 of 1234`: dw +13.55 (2 ch at 6.77 px), left edge moves to 723.5, still inside article; sw = cw |
| Edge 2 | tile 2×2 / 3×2 | data | same | pass | dw +12.28, left edge 213.9 / 190.8, still inside the tile's reader |
| §6 honesty | focus | daemon-down | daemon-down is surfaced prominently | pass | the full-width `role="alert"` banner and the reader's `musterd unreachable — showing last render` line both appear; the find bar keeps working over the last render |
| §7 terminal | — | — | — | N/A: the plan touches no pane, xterm or geometry | |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** With a short count (`1 of 3`) right-aligned in its 10 ch slot, the query box is followed by 31.1 px of blank space in Focus (26.5 px in compact) before the count text. This is the trade-off REQ-3 chose: one fixed width means short counts leave space. It is smaller than the 56 px gap in the #102 symptom, and there is no gap at all while the bar opens empty. I am not asking for a change.
2. **[note]** The wording of plan Edge Case 2 (review-work's area): `1 of 1234` is 9 characters and fits in 10 ch. The bar first widens when the ordinal reaches 1000 (`1000 of 1234`, 12 characters), and it widens by 2 ch (13.55 px measured), not by one character.
3. **[note]** The new E1 width tests step only through `1 of 3`, never `999 of 999`. In this monospace font the `No results` state also takes exactly 10 ch, so the tests still pin the reserved width. They would miss a font change that made digits wider than letters.
4. **[note]** The light theme was not measured separately. The count keeps its existing `--fg-muted` colour, and `07-contrast` is green for dark, light and instrument.
