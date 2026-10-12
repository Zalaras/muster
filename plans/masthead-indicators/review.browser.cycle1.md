# Browser review: Masthead indicators

**Plan**: masthead-indicators
**Verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 8317 words (budget 30000)
**Rig**: `make web-build build` at 2e678971 (`bin/musterd` v0.20.2-43-g2e678971-dirty; the only dirty file is `orchestration-state.json`). Each scratch daemon came from the committed `helpers/fixtures.ts` (`daemon` / `startDaemon`), with a space-bearing data dir `$TMPDIR/muster e2e-*`, a private `-tmux-socket` inside it, and the shared stub `claude` from `helpers/daemon.ts`. RB-3 used a staged `0.1.0` binary, a `0.2.0` binary and `FakeReleaseServer`. The run was headless Chromium, in the foreground, with 5 throwaway tests (all passed). The spec is deleted and fixture teardown killed every scratch daemon and tmux server. `git status --porcelain` shows nothing of mine.

Gates log (cycle 1): 0 failed lines. `16-e2e`: 737 passed. `04-web-build` is green. `07-contrast`: 46 pairs, 0 failures in each theme. So the app I drove is the one that ships.

## Matrix

Hosts: the masthead is page chrome shared by **Focus** and **Tiles**. The pop-out (`/doc.html`) has no masthead and no `#connection-status`. I grepped `web/doc.html`, and its connecting text is the reader notice, which this plan does not touch. So every pop-out cell is `N/A — no masthead in /doc.html`, and I list that once here instead of on each row.

States: **no data** (connected, no status post), **pending** (WebSocket held by `routeWebSocket` so no hello arrives; measured 2.5 s after load), **data**, **down** (scratch daemon SIGKILLed via `daemon.kill()`), **reconnect** (`daemon.restart()`), **update** (a real Update and restart, and a restart window outlasted in real time).

All values below are computed styles or `getBoundingClientRect()` read after ≥ 1.2 s, which is at least one render tick past the event.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 / INV-2 | focus | no data / pending / data / down / reconnect / update | `#usage-model` absent | pass | `querySelectorAll('#usage-model').length` = 0 in all 30 snapshots |
| REQ-1 / INV-2 | tiles | no data / data / down | `#usage-model` absent | pass | count 0 (nodata-tiles, data-tiles ×3 themes, layout-*-Tiles, down-tiles) |
| REQ-2 / INV-2 | — | data | wire `usage` has no `model` | pass | in-page `fetch('/api/state')`. `usage` keys: fiveHour, sevenDay, sampledAt, source, modelScoped, modelScopedAt, modelScopedError, modelScopedSource. No `model` |
| REQ-3 | — | — | history unchanged | N/A — not visible in the UI. This is daemon history (review-work / D2, D3) | |
| REQ-4 | focus | data | same-day `(HH:MM)` | pass | 5h `.resets` = `(18:30)`, oracle `new Date(resetsAt)` = Mon 12 Oct 18:30:23 local (today) |
| REQ-4 | focus | data | other-day `(HH:MM Ddd)` | pass | 7d `.resets` = `(15:59 Wed)`, oracle Wed 14 Oct 15:59 local; `toLocaleDateString(weekday:short)` = `Wed` |
| REQ-4 | tiles | data | same / other day | pass | identical texts in Tiles × instrument/dark/light |
| REQ-4 | focus, tiles | data | model-week bracketed | pass | `#usage-model-week .resets` = `(20:08 Wed)`, fake API `resetsAt` next Wed 20:08 |
| REQ-4 | focus | data (stale model-week, 401) | stale keeps bracketed reset (E2, edge 6) | pass | readout `.stale`, title `unauthorized`, `.resets` `(20:08 Wed)` still shown |
| REQ-4 | focus, tiles | data | no `resets` word or `·` | pass | readout texts `5h61%(18:30)`, `7d23%(15:59 Wed)`, `FableOpus15%(20:08 Wed)` |
| REQ-4 | focus, tiles | data | visible | pass | `.resets` display block, visibility visible, opacity 1, colour = `--fg-dim` in each theme (166,171,188 / 180,184,192 / 73,77,92) |
| REQ-4 | focus | down | gauges keep values + reset | pass | down-focus ×3 themes and down-tiles: `61%(18:30)`, `23%(15:59 Wed)` kept |
| REQ-5 / §6.1 | focus, tiles | no data | unknown → word, no track, no reset | pass | `5hunknown`, `7dunknown`: `.bar` count 0, `.resets` absent |
| REQ-5 / edge 1 | focus | reconnect (daemon restart) | buckets back to unknown | pass | after `daemon.restart()`: `5hunknown`, bars 0, no `.resets` |
| REQ-5 | focus | pending | unknown before hello | pass | pending-held: all three readouts `unknown`, bars 0 |
| REQ-6 / REQ-9 | focus | pending (first connect) | `data-health=pending`, yellow | pass | `pending`, `::before` bg rgb(227,198,74) = `--health-pending`, banner `display:none` (no banner before the first hello) |
| REQ-6 / REQ-9 | focus, tiles | no data / data | `ok`, green | pass | `ok`, rgb(123,196,127) instrument / (108,192,122) dark / (31,122,58) light = `--health-ok` per theme |
| REQ-6 / REQ-9 / §6.7 | focus | down | `down`, red, banner showing | pass | `down`, rgb(238,106,50) (light rgb(194,65,12)) = `--health-down`; banner block 0,46–1512,78 full width, text `musterd unreachable — …` |
| REQ-6 / REQ-9 / §6.7 | tiles | down | `down` + banner | pass | down-tiles: `down`, rgb(238,106,50), banner block 0,46–1512,78 |
| REQ-6 | focus | reconnect | back to `ok` | pass | `ok`, title `Connected to musterd`, banner `display:none` |
| REQ-6 / INV-1 / E6 | focus | update (real restart) | pending during updating banner, then ok | pass | per-mutation recorder with computed colour: `pending` rgb(227,198,74), title `Restarting musterd for an update…`, word `reconnecting…`, banner `Updating musterd to v0.2.0 — restarting…`; after reload `connecting…`/pending → `ok`; no sample broke INV-1 |
| INV-1 / edge 9 | focus | update (post-restart confirmation) | neutral banner beside ok | pass | sample: banner `Updated to v0.2.0.` `.neutral`, health `ok`, rgb(123,196,127) |
| INV-1 / edge 7 | focus | update window outlasted (real 31 s wait, no fake clock) | pending → down with fallback banner | pass | at +1.5 s: `pending`, `Restarting musterd for an update…`, banner `Updating musterd…`. At +32.5 s: `down`, rgb(238,106,50), title `musterd unreachable — reconnecting…`, banner `musterd unreachable — …`. On restart: `ok` |
| INV-1 / edge 10 | focus | down (kill, no update) | a crash reads red, never yellow | pass | after kill: `down`, never `pending` (title `musterd unreachable — reconnecting…`) |
| REQ-7 | focus, tiles | all | `role=status`, word visually hidden | pass | `role="status"`; text `connected`/`connecting…`/`reconnecting…` per state. `.sr-only` is position absolute, 1×1 px, clip `rect(0,0,0,0)`, overflow hidden. Host is 14×14 with no visible glyph |
| REQ-7 | focus | data, down | no per-tick re-announcement | pass | MutationObserver on `#connection-status` over 3.2 s: 0 mutations connected, 0 down |
| REQ-8 | focus, tiles | pending / ok / down / update | titles exactly as the table | pass | `Connecting to musterd…`, `Connected to musterd`, `musterd unreachable — reconnecting…`, `Restarting musterd for an update…` |
| REQ-10 | focus | data / down × 3 themes | dot colour = a `--health-*` token, never a state token | pass (numerically) | the dot resolves to `--health-*` in every theme and to none of `--amber/--rose/--teal/--violet/--idle`. Hues: ok 123/130/138°, pending 49/49/47°, down 18/18/17°. Bands: amber 25–45°, rose 345–15°. See decision 1 |
| W11 | focus | data / down × 3 themes | ≥ 3:1 against masthead ground | pass | masthead bg = `--bg-raised`. CR ok 8.30/7.18/5.15, pending 10.29/9.44/4.71, down 5.57/5.12/4.96 (instrument/dark/light) |
| W11 | focus, tiles | down × 3 themes | down reads as the banner's alarm, not a session state | **decision** | down hue 17–18° vs banner hue 0°; ΔE76 down↔`--amber` 31.0/35.9/30.7, pending↔`--amber` 25.1/19.8/22.7 (light pending #8a6d00 vs amber #844800). Side-by-side 6px swatches: down and amber look alike in instrument, pending and amber in light (decision 1) |
| W12 | focus, tiles | all × 3 themes | 6px round dot | pass | `::before` 6px × 6px, `border-radius: 50%`, host 14×14. Vertical centre 23.0 = `#usage-5h` centre 23.0 |
| REQ-11 | focus, tiles | data (all three known, other-day resets, selector showing) | one row, no wrap at 1512 | pass | masthead h 46. Every right-group child sits on one band (readouts 16–30, buttons 10–35, refresh 13–32), with no overlapping boxes. `.masthead-right` r 1496 ≤ masthead r 1512 − 16 padding; scrollWidth 579 = clientWidth; doc scrollWidth = viewport |
| REQ-11 | focus, tiles | data | one row, no wrap at 1440 | pass | masthead h 46, right r 1424, same bands, no overlap |
| REQ-11 | focus, tiles | data | (beyond plan) 1366 / 1280 | pass | masthead h 46 at both. Right r 1350 / 1264. No overlap |
| REQ-11 | focus | down @1440 | row holds with the banner | pass | masthead h 46, banner a separate 32 px row below it, dot r 1424 |
| REQ-11 | focus | update @1280 | row holds while pending | pass | masthead h 46, `.masthead-right` sw = cw = 579 |
| REQ-12 | focus, tiles | data | reset `title` with full date and the shown `HH:MM` | pass | `Resets Mon, Oct 12, 18:30` / `Resets Wed, Oct 14, 15:59` / `Resets Wed, Oct 14, 20:08` (model-week) |
| REQ-12 | focus | data (stale model-week) | reset title present | pass | `.resets` title `Resets Wed, Oct 14, 20:08`, while the readout's title is `unauthorized` (note 1) |
| Edge 2 | — | — | model-only change leaves masthead unchanged | N/A — needs a model-only status post. Daemon-side D2 is review-work's. The masthead has no model left to change | |
| Edge 8 | — | — | protocol-mismatch screen | N/A — plan: the mismatch screen covers the masthead, not asserted | |
| Edge 11 | — | — | old tab without `model` | N/A — plan: a skewed client is the reload banner's job | |
| §7 terminal rules | focus, tiles | data | one live client, scrollback 0 | N/A — this plan touches no terminal surface; e2e 737/737 green, including the surfaces specs | |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[orchestrator:decision]** Whether the health-dot colours read as a session state at 6px. All three tokens sit outside the §1 hue bands, but each hugs a band edge: down is 17–18°, 2–3° past rose (345–15°) and 7–8° below amber (25–45°); pending is 47–49°, 2–4° past amber. I measured them against the theme tokens (ΔE76 above) and screenshotted them as 6px dots beside 6px `--amber`/`--rose` dots. In Instrument and Dark, `--health-down` (#ee6a32) and `--amber` read as the same orange. In Light, `--health-pending` (#8a6d00) and `--amber` (#844800) read as the same brown. The down dot is also not the banner's red (hue 18° vs 0°), so W11's "reads as the same alarm as the daemon-down banner" holds only through the banner shown beside it. The web-impl notes flagged this for the reviewer's eye.
   - **Option A — keep as shipped.** Every token is outside the bands, contrast is ≥ 4.7:1, and down and update-pending are always accompanied by a banner that names the state. The dot is never the only signal for down. Cost: none.
   - **Option B — move the tokens away from the band edges.** Pending goes to a distinctly yellow, lighter value, roughly 55–60°, in every theme. Light needs special care: its pending reads brown today. Down either moves to the banner's red, which needs a §1 / `connection-health-dot` exception because red lies in the rose band, or is accepted as orange and the "same alarm as the banner" wording comes out of W11 and the ADR. Cost: a token edit, re-running `make contrast`, and an ADR or design-system wording change.
2. **[note]** On a stale model-week readout, the new reset `title` (REQ-12) shadows the readout's error `title`. Hovering the `(20:08 Wed)` suffix shows `Resets Wed, Oct 14, 20:08`; the rest of the readout still shows `unauthorized`. The suffix is 81 px of the 200 px readout. The visible stale cue (the dotted, dimmed `.num`) and its hover are intact, so I'm not requesting a change.
3. **[note]** The health detail is pointer-only. `#connection-status` is not focusable (`tabIndex` −1), so a keyboard user never gets the `title` text. Screen-reader users get the word through `role="status"`, and the banner carries the down and updating detail visibly. This matches the plan's "hover gives the detail".
4. **[note]** While the daemon is down, `Cmd+\` did not switch to Tiles. This is consistent with "masthead controls are disabled while down" and is pre-existing. I measured the down state in Tiles by switching before the kill.
5. **[note]** Native tooltips do not render in headless Chromium, so every hover claim (REQ-8, REQ-12) is measured on the `title` attribute, the source the browser renders from.
