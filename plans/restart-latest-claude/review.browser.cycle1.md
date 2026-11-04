# Browser review: Restart Latest Claude

**Plan**: restart-latest-claude
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 14061 words (budget 30000)
**Rig**: `make web-build build` at 18a79b48 (`v0.27.3-28-g18a79b48-dirty`, dirty = orchestration-state.json only); per-test scratch `bin/musterd` from `helpers/fixtures.ts` on `$TMPDIR/muster e2e-55a1b6f1-*` (space-bearing data dir), private `-tmux-socket` at `<data dir>/tmux.sock` (removed by the fixture's teardown, `kill-server` included), harness stub `claude` answering `--version` with `2.1.318` (one test with `stubClaudeVersionFails`); headless Chromium 1280×900 (one cell at 900×700). Throwaway spec deleted; no daemon or scratch dir left behind.

Gates log read (not re-run): `21-e2e.log` is red on `e2e/cache-warmth.spec.ts:204` (7 upserts where 6 were expected); `02-test.log` timeouts. The `web-build` line is green, so the dashboard driven here is the one that ships.

Installed `2.1.318` is above the verified range on this tree, so the readout always carried the `⚠` glyph. That is the realistic case: the auto-updater installs a version newer than the verified range and leaves sessions behind. Every cell below was measured with the glyph present.

## Matrix

Hosts: **focus** and **tiles** (the masthead is shared, so the readout, panel and dialog were measured in both views). The **pop-out** (`/doc.html`) has no `#claude-version` and no masthead, so every pop-out cell is N/A: the plan gives the surface no pop-out host.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| States: no data | focus | no data (no sessions) | plain readout, no notice | pass | `#claude-version` text `claude 2.1.318 ⚠`, no `<button>`; box 1104.72–1242 (w 137.28) |
| States: no data | focus | no data (session on installed version) | not behind → no notice | pass | wire `{running:"2.1.318",behind:false}`; readout plain, w 137.28 |
| States: no data / Edge 13 | focus | no data (installed unknown) | no notice; `claude unknown` | pass | stub `--version` fails; session posts 2.1.200 → wire `behind:false`; readout `claude unknown`, no button, no glyph, w 137.28 |
| REQ-7 | focus | data | readout is a button: oldest→installed patch | pass | button `aria-label="Claude Code update"`, text `claude 2.1.316→318` (sessions on 2.1.317 ×3 and 2.1.316) |
| REQ-7 / Edge 32 | tiles | data | cross-minor label | pass | session on 2.0.9 → `claude →2.1.318` |
| REQ-7 | focus, tiles | data | neutral dot visible | pass | `.update-dot` display block, opacity 1, bg `rgb(178,182,195)`, 6px, box 1243,12.5 6×6; clear of the health dot (1249 < 1250) |
| REQ-11 | focus, tiles | no data / data / queued / ignored / down | readout keeps one width | pass | host w 137.28 and right edge 1242 in all 8 states measured; Settings x 1018.53 and health dot x 1250 unchanged throughout |
| REQ-11 | focus, tiles | data / queued | glyph clear of neighbours | FAIL | in the notice shape the `⚠` box is 1093.31–1100.72 and Settings is 1018.53–1096.72, so they overlap by 3.41px; `elementFromPoint` at x 1094.3 returns the glyph, which sits on top of Settings' right edge (Minor 1) |
| REQ-11 / R7 | focus | data | readout uses neutral tokens only | pass | computed color/bg/border/outline audit against `--amber`/`--rose`/`--violet`: 0 hits |
| REQ-7 | focus | data | panel anchored under the readout, right-aligned | pass | panel 862–1242 × 33.5–212.84; right edge = readout right 1242; top below readout bottom 29.5; inside 1280×900 |
| REQ-7 | tiles | data | panel anchored, right-aligned | pass | panel 862–1242 × 33.5–212.84 (15 sessions) |
| REQ-7 | focus | data | panel content | pass | head textContent `Claude Code 2.1.318`; intro `4 live sessions run an older version and pick it up only when restarted.`; rows `Restart now`/`2`, `Restart when free`/`2` (separate spans); Ignore and Restart… display block, opacity 1, visibility visible |
| REQ-7 / R7 | focus | data | panel neutral except one `.btn.key` | pass | token audit: only hits are `#restart-open-button.btn.key` bg and border = amber |
| Panel close | focus | data | Escape closes and restores focus | pass | after Escape the panel is `display:none` and activeElement is the notice button |
| Panel close | focus | data | outside click / second click closes | pass | `display:none` after a click at 640,600, and again after a second click on the readout |
| Keeps focus | focus | data | keyboard focus survives render ticks | pass | Enter on the button → `#restart-open-button`, the same after 1.5 s; Shift+Tab → `#restart-ignore-button`, the same after 1.5 s |
| Hidden | focus | data / queued | `[hidden]` parts are `display:none` | pass | `#restart-panel-queued` none (data); `#restart-panel-behind` none (queued-only); `#restart-panel` none when closed |
| REQ-8 | focus | data | dialog named, two open sections, rows with reasons | pass | dialog `Restart sessions on Claude Code 2.1.318`; `<details open>` ×2, summaries `Restart now · 2`, `Restart when free · 2`; rows `rb-a-idle`/`idle`, `rb-c-working`/`working`, `rb-d-bgtask`/`idle · 1 background task` in separate spans |
| REQ-8 | focus | data | dialog placement | pass | dialog 380–900 (w 520) × 275.66–624.34, centred, inside the viewport; panel closed (`display:none`) while it is open |
| REQ-8 / R4 | focus | data | sections collapse independently (pointer) | pass | clicking summary 0: ul0 `checkVisibility()` false, ul1 true, list box 96→68 px, dialog 312.7→284.7; both collapsed 40 px; re-expand restores |
| REQ-8 / R4 | focus | data | sections toggle by keyboard | pass | Enter on summary 1 → `[open,closed]`; Space → `[open,open]` |
| Keeps focus | focus | data | dialog focus across a tick | pass | `#restart-cancel-button` at open and after 1.5 s |
| REQ-13 | focus | data | confirm label states the mix | pass | `Restart 2, queue 2`; tiles `Restart 11, queue 4` |
| R7 | focus | data | dialog neutral except one `.btn.key` | pass | token audit: only hits are `#restart-confirm-button.btn.key` bg and border = amber |
| REQ-8 | focus | data | confirm posts the listed ids; free ones come back resumed | pass | POST ids `[2,3,4,5]` → `{done:[2,3],queued:[4,5],skipped:[],failed:[]}`; tmux pane identity replaced for 2 and 3, wire alive, `claudeVersion:null`, `restartPending:false`; cards `s-idle` (settled after 1.5 s) |
| Edge 29 / R3 | tiles | data (15 sessions) | list box scrolls at 280px, both summaries reachable | pass | `.rscroll` h 280, `overflow-y:auto`, scrollHeight 328 > clientHeight 278; mouse wheel → scrollTop 50 (max); scrolled to the end, `Restart when free · 4` summary at 495–514 inside the box 317–597 |
| Edge 29 | tiles | data | long titles contained | pass | 45-char titles: span scrollWidth 333 = clientWidth 333; li 472 wide; dialog 520 |
| Edge 28 | tiles | data | a session ends while the dialog is open → its row stays, daemon decides | pass | `POST /end` on one listed session; after 1.2 s the dialog is unchanged; confirm → `skipped:[2]`, 10 done, 4 queued |
| Action-error line | tiles | data | skipped is reported there | pass | `#action-error` visible (display block) at 0,59.34 1280×32: `Not every session was handled — some were skipped or failed.`; hidden after a clean batch in focus |
| §7.1 one live client | focus | data | after a restart, one client per session | pass | tmux `list-clients` before and after: `{muster-1:1}`; 1 `.xterm` |
| Edge 25 / §7.1 | focus | data | the focused session restarts; its terminal reattaches once | pass | focused `rb-g-focused` restarted (`done:[1]`); tmux clients before `{muster-1:1}`, after `{muster-1:1}`; 1 `.xterm` |
| §7.1 one live client | tiles | data | after a 10-session restart, at most one client per session | pass | before `{muster-1..4:1}`; after `{muster-1:1,muster-3:1,muster-4:1}` (muster-2 was the ended one); 3 `.xterm` |
| REQ-9 | focus | queued | label `claude ↻N queued` | pass | `claude ↻2 queued`, w 137.28; tiles `claude ↻4 queued` |
| REQ-9 | focus | queued | panel lists pending sessions, no buttons, no cancel | pass | `#restart-panel-behind` display none; heading textContent `Restart when free · 2` (one text node); rows `rb-c-working`/`working`, `rb-d-bgtask`/`idle · 1 background task`; visible buttons in the panel: `[]`; focus goes to the panel itself and holds for 1.5 s |
| REQ-9 / E2 | focus | queued | queue fires on free, readout returns | pass | Stop with 0 tasks on c → restarted, `claude ↻1 queued`; then d → restarted, readout plain `claude 2.1.318 ⚠`, no button |
| REQ-6 | focus | daemon restarted | pending survives a daemon restart in the UI | pass | after SIGTERM and respawn: `claude ↻2 queued`, wire `restartPending:true` for both, enabled again |
| REQ-12 | focus | daemon-down | button disabled, open panel closes | pass | SIGTERM with the panel open: panel `display:none`, button `disabled:true`, color `--disabled-fg` rgb(90,96,112), w 137.28; banner `musterd unreachable — hook output in open panes is Muster's absence, not session failure.` visible at y 46 |
| REQ-12 | focus | daemon-down | clicking while down opens nothing | pass | forced click → panel stays `display:none` |
| REQ-12 | tiles | daemon-down | — | N/A | the masthead is the same element in both views, and the down state was measured once (focus) |
| REQ-10 | focus | data | Ignore hides the behind part | pass | readout plain `claude 2.1.318 ⚠`, no button |
| REQ-10 / E3 | focus | data | reload keeps hidden; a new page shows it | pass | after reload: plain; new page in the same context: `claude 2.1.317→318` button |
| REQ-10 | focus | queued | pending shows regardless of Ignore | pass | ignored page, after another page queued the session: `claude ↻1 queued` |
| Edge 27 / storage unavailable | focus | data | throwing `sessionStorage` reads as not ignored | pass | getter throws `SecurityError`: notice `claude 2.1.316→318` shows; Ignore still hides the behind part in memory (`claude ↻1 queued` remains for the pending one); 0 page errors |
| Keeps focus | focus | data | focus after Ignore | FAIL | after Ignore by pointer, activeElement is `<body>`: Ignore restores focus to the notice button, which the next render removes, so the keyboard position is lost (Minor 2) |
| REQ-11 | focus | narrow (900×700) | readout and panel at a narrow width | note | see Note 2 |
| All | pop-out | all | — | N/A | `/doc.html` has no masthead or Claude readout |
| Dialog reasons `failed`, `planning`, `waiting on you`, `starting` | focus | data | reason words | not measured | see Note 3 |

## Issues

### Critical

### Major

### Minor
1. **[web-impl]** In the notice shape the warning glyph hangs outside the readout box and overlaps the Settings button. At 1280×900 with a behind session and installed above the verified range, the `⚠` box is x 1093.31–1100.72 and `#settings-button` is x 1018.53–1096.72, a 3.41px overlap. `elementFromPoint` at the overlapped strip returns the glyph, so it sits on top of Settings' border and takes its clicks there. In the plain shape the glyph sits inside the box (x 1234.6) and touches nothing. `web/src/style.css` `.claude-notice ~ .version-warn`. A fix must make the glyph's box clear of `#settings-button` (with the masthead gap kept), while the readout box keeps its 137.28px width and right edge in every state.
2. **[web-impl]** Ignore drops keyboard focus to `<body>`. When Ignore leaves no notice (no pending sessions), `closePanel(true)` focuses the notice button, and `app.render()` then replaces it with the plain span, so `document.activeElement` is `body`. `web/src/features/restart.ts` `ignore()`. A fix must leave focus on an element in the masthead (or another deliberate target) after Ignore, measured as `document.activeElement !== document.body` once the render has run.

### Notes
1. **[note]** The gate run's red `e2e/cache-warmth.spec.ts:204` gets one extra `sessionUpsert` (7 vs 6) on a status post. That is consistent with a version-bearing post now changing `claudeVersion`, but the spec and the gate are `review-work`'s to rule on. I did not reproduce it.
2. **[note]** At 900×700 the masthead's right cluster already runs past the viewport: the readout box is at x 993.7–1130.98 in a 900px window, `documentElement.scrollWidth` is 900, and the overflow is clipped. The panel is then clamped into the viewport (x 497.98–877.98) instead of under its anchor. This plan widened the box from `17ch + 4px` to `18ch + 4px`, but the masthead overflows below about 1150px with or without that change. I measured only 1280 and 900, and request no change.
3. **[note]** I did not drive the dialog reason words for `failed`, `planning`, `waiting on you` and `starting` in the live rig: it would need StopFailure, plan-mode and permission-prompt sessions per cell. The `claude-restart` render fixture (R2/R3) and the W3 unit criterion cover them.
4. **[note]** The `#restart-dialog-note` hidden state (a dialog with no busy rows) was not opened. Every dialog I drove had busy rows, and the note was visible (display block, 523–574) there. The `.modal.restart [hidden]` rule covers it, and no author `display` rule targets `p.restart-note`.
5. **[note]** The token audit ran in the default (dark) theme only.
6. **[note]** When behind and pending sessions coexist, the readout shows the behind label (`claude 2.1.316→318`), and the queued count appears only inside the panel. That matches the plan's Views, which keep `↻N queued` for "only pending sessions".
