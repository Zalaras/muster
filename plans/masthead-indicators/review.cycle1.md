# Review: masthead-indicators

**Plan**: masthead-indicators
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser approved, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: masthead-indicators

**Plan**: masthead-indicators
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 31168 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 no `#usage-model` | Yes: `web/index.html`, `features/usage.ts`, `render/masthead.ts` (renderer removed) | Yes: E4 spec, gauges E5/E7, layout E7 x2 | pass |
| REQ-2 no `model` key on the wire | Yes: `internal/server/usagewire.go` (field and mapping removed); `protocol/usage.ts` ignores a stray key | Yes: `TestToWireUsage_NeverCarriesAModelKey` (exact key set, 6 states), `usagebroadcast_test.go`, `state_test.go`, D1 e2e (snapshot, `/api/state`, every `usage` frame), shell.spec, `usage.test.ts` W1 | pass |
| REQ-3 history unchanged | Yes: `internal/usage` and `ingest.go` untouched (`git diff main...HEAD -- internal/usage` is empty) | Yes: Go broadcast test reads `usage_sample` rows; D2 e2e | pass |
| REQ-4 `(HH:MM)` / `(HH:MM Ddd)` | Yes: `sessions/format.ts:81`, `sessions/usage.ts:45` (no `· ` prefix) | Yes: format.test W2 (midnight, a week on, past), usage.test W3, e2e E1 (same day, just after midnight, +7 days, past), usage-model E1 | pass |
| REQ-5 unknown shows no reset | Yes (unchanged; `resetsText`/`resetsTitle` null) | Yes: E3 spec, usage.test | pass |
| REQ-6 dot health | Yes: `features/connectionhealth.ts`, evaluated per render tick in `connection.ts:144` from the same `restartBanner` result as the banner | Yes: connectionhealth.test W4 (every status x override, plus real `computeBannerOverride`), e2e E5, first-hello, 30 s fallback, update-dot E6 | pass, see decision 1 for the one pair INV-1 leaves open |
| REQ-7 `role="status"`, hidden word | Yes: `.sr-only` child, words unchanged | Yes: masthead.test, e2e REQ-7 (box ≤ 24px) | pass |
| REQ-8 `title` per state | Yes: four titles match the Testable UI Elements table verbatim | Yes: W5, e2e (all four titles) | pass |
| REQ-9 `data-health` | Yes | Yes: every dot test | pass |
| REQ-10 three tokens, every theme, no state token | Yes: `style.css:71-73, 115-117, 159-161`; dot rules use only `var(--health-*)` | Yes: `style.test.ts` W6, e2e colour test | pass |
| REQ-11 one row at 1512/1440 | Yes (CSS: `.model` elasticity removed) | Yes: masthead-layout E7 x2 (other-day resets on all three bars, selector showing) | pass |
| REQ-12 reset `title` | Yes: `formatResetsTitle`, `render/masthead.ts:99` | Yes: format.test, e2e E8, usage-model E1 | pass |
| INV-1 dot agrees with banner | Yes, except reconnecting while the neutral confirmation shows (decision 1) | Yes: `healthViolations` over recorded runs in four e2e tests; W4 table | see decision 1 |
| INV-2 no model on masthead or wire | Yes | Yes | pass |
| Edge case 2 model-only change | Behaviour yes; the "identical on the wire" claim is false for `sampledAt` | Go test asserts whole-frame equality (Major 2) | fail |
| DIAG | `kb:diagram/web-components` (features/ now 34 modules, 12 DOM-free helpers; counted 34 non-test `.ts` files) and `kb:diagram/daemon-components` (no package or import change) | — | pass |

## Build & Tests

E2E tests: pass (737) · Daemon tests (race): pass (24 packages ok, 0 FAIL) · Web tests: pass (2492 in 91 files) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues; biome clean) · Contrast: pass (46 pairs x 3 themes, 0 failures) · e2e-lint: clean · check-kb: 0 problems · WARN size: 1 funlen hit (`usagebroadcast_test.go:53`; review-maintainability's). All read from `$GATES_LOG_DIR` and the gate ledger (every line `PASS` at tree `a238a934…`).

Soak (§1, Repairs row 1 is a flake fix the checks block does not soak): `make e2e-soak` could not build because review-browser's untracked `web/e2e/zz-review-browser.spec.ts` fails `tsc` and `e2e-lint`. I ran the same soak without the build and lint, under the exclusive gate lock, against the gate's build: `npx playwright test masthead-indicators.spec.ts --repeat-each=10 -g "changing only the model broadcasts"` gave `10 passed (9.3s)`.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D4 | `make build` | pass (`17-D4.log`) |
| D5 | `make lint` | pass (deduped to baseline `03-lint.log`) |
| D6 | `make test` | pass (deduped to test-race, `02-test.log`) |
| W7 | `make web-build` | pass (deduped, `04-web-build.log`) |
| W8 | `make web-lint` | pass (deduped, `06-web-lint.log`) |
| W9 | `make web-test` | pass (deduped, `05-web-test.log`) |
| E9 | `make e2e` | pass (deduped, `16-e2e.log`, 737 passed) |
| X1 | `! rg -n "usage-model\"\|#usage-model([^-[:alnum:]_]\|$)\|renderUsageModel\b\|mastheadModelReadout" web/src web/index.html web/e2e` (amended pattern) | pass (`18-X1.log` empty, ledger PASS) |
| X2 | `! rg -n -F "· resets" web/src web/e2e` | pass (`19-X2.log`) |
| X4 | `! rg -n -F 'resets ${' web/src` (amended quoting) | pass (`20-X4.log`) |
| X3 | `make check-kb` | pass (deduped, `10-kb-check.log`) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass for upkeep: four `proposed` ADRs with `refs: plan:masthead-indicators`; design-system §1/§5 and `web-components` updated; no `deviation:` lines; both `doc-delta:` lines (design-system) already applied; `TODO.md` ticks are correctly deferred until approval (orchestrate SKILL: "no ✅ tick until review.md says approved"). Doc Delta: the connection line "its colour always agrees with the banner" is not true for one pair (decision 1). The model-only "identical" claim in `docs/protocol.md` and the ADR is false (Major 1). |

X1 and X4 were amended by the orchestrator mid-run (notes under the checks block). Both amendments restore what the check says it is for: X1 as approved matched `#usage-model-week`, and X4 as approved was a shell syntax error. I accepted the amended lines.

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W10 | No `any` in new or changed web code | pass | `git diff main...HEAD -- web/src web/e2e \| grep '^+' \| grep -E ':\s*any\b\|as any\|<any>'` found nothing |
| W11 | Tokens outside the state hue families; down reads as the banner's alarm; ≥ 3:1 on `--bg-raised` | pass for hue and contrast; "same alarm" is for review-browser to judge by eye | Computed hues: down #ee6a32 / #c2410c ≈ 18° (rose band 345–15°, amber 25–45°); pending #e3c64a ≈ 49°, #8a6d00 ≈ 47° (amber ends at 45°); ok ≈ 123°. `make contrast` has the three pairs at min 3, 0 failures in each theme. The down dot is red-orange, while the banner is pink-red (`--banner-fg` hue ≈ 0°). The impl log flags this choice openly: a banner-red hue would fall inside the rose band. |
| W12 | 6px round dot in all three themes, measured in a browser | CSS states it: `style.css:343-353` (`width/height: 6px`, `border-radius: 50%`, one rule for every theme). The in-browser measurement is review-browser's. | — |
| D7 | Aggregator and store still read and persist the model | pass | `internal/usage/**`, `internal/store/**`, `internal/server/ingest.go` unchanged on the branch; `usagebroadcast_test.go` reads `model_id`/`model_display_name` rows back; D2 e2e |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: the only Go change is `internal/server/usagewire.go`, a field removal |
| 2 | Terminal-output state parsing | pass: none |
| 3 | Blocking hook handler | pass: ingest untouched |
| 4 | Bare tmux | pass: no tmux invocation added |
| 5 | Payload logging | pass: none added |
| 6 | Empty-gauge dishonesty | pass: an unknown bucket keeps the `unknown` word and has no `resetsText`/`resetsTitle` (`sessions/usage.ts:31-38`) |
| 7 | Session identity on `session_id` | pass: n/a |
| 8 | Settings trespass | pass: none |
| 9 | Real `claude` outside canary | pass: specs use synthesized `envelopedStatusLineFull` / `envelopedSessionStart` |

## Issues

### Critical

None.

### Major

1. **[orchestrator]** The proposed ADR `kb:adr/usage-masthead-shows-no-model` (Consequences) says that a model-only change "sends a `usage` message identical on the wire to the last one". This is false. `Aggregator.Record` stamps `SampledAt = time.Now()` on every recorded sample (`internal/usage/aggregator.go:55`), so the second frame carries a new `sampledAt` whenever the two posts fall in different seconds. The e2e soak measured exactly this (`test-specs.md` Repairs 1: `…:28Z` vs `…:29Z`). The same claim also appears in three other places:
   - `docs/protocol.md` under `kb:anchor/ws.usage` ("sends a `usage` message identical to the previous one"), added at planning;
   - the plan's Protocol Contract prose;
   - plan Edge Case 2.

   Fix: change the ADR to "identical apart from `sampledAt`". doc-reconcile should make the same correction in `docs/protocol.md`, which is its file.
2. **[daemon-tests]** `internal/server/usagebroadcast_test.go:79` asserts `assert.JSONEq(t, string(first), string(second), …)` on the two whole `usage` frames, `sampledAt` included. The two status posts are stamped by the daemon's wall clock (`aggregator.go:55`), so the test fails whenever they fall in different seconds. This is the same flake the e2e twin hit 1 time in 10 and was repaired for (Repairs 1). The Go copy kept the vacuous-under-luck form. Fix: compare the frames with `sampledAt` removed, and assert that the second `sampledAt` is not earlier than the first, as `masthead-indicators.spec.ts:374-381` now does. (`TestToWireUsage_ModelOnlyChangeIsIdenticalOnTheWire` in `usagewire_test.go` passes the same `at` to both snapshots, so it is deterministic and fine.)

### Minor

1. **[web-impl]** The hand-written part of `web/src/features/CLAUDE.md` lists "the pure ones: `actionscopy.ts`, … `updateview.ts`" and does not include the new pure helper `connectionhealth.ts`. Add it to the list.

### Decisions

1. **[orchestrator:decision]** Reconnecting while the post-update `Updated to v…` confirmation shows. `computeBannerOverride` returns the neutral confirmation before it checks the connection status (`features/updaterestart.ts:87-89`). So for up to 3 s after a post-update hello, a lost socket shows the neutral banner. `describeConnectionHealth` returns `down` for that pair (`connectionhealth.ts:31`), which gives a red dot beside a neutral banner. INV-1 leaves this pair undefined: it is neither the unreachable text nor the updating text, and it is not `connected`. But the Doc Delta ("its colour always agrees with the banner") and `kb:adr/connection-health-dot` ("red exactly when the banner shows the daemon-down text") are false for it. Both logs record the choice openly; neither carries a `deviation:` line. No e2e reaches this pair. If one did, `healthViolations` would want `ok` beside a neutral banner while the code gives `down`.
   - **A: keep the red dot and amend the documents.** No code change. INV-1, the ADR and the Doc Delta name the exception: "red while the socket is lost, even during the ≤ 3 s confirmation". The dot is honest about the socket, but for ≤ 3 s it contradicts a banner that reads as all-clear.
   - **B: make the banner yield to the daemon-down text.** `computeBannerOverride` drops the confirmation when `status !== "connected"`, so the banner shows unreachable and both banner and dot read "down". INV-1 then holds as written. This is a one-line change in the update feature's `updaterestart.ts` (plus its table test), outside this plan's Features. The update feature's confirmation behaviour changes for a ≤ 3 s window.

### Notes

1. **[note]** `web/src/protocol/usage.ts:74`: the `biome-ignore` reason cites "present-only key blocks whose comments must stay with their fields", but the comment pass deleted those per-field comments, and the doc comment the impl log says now reads "20". The suppression's stated reason no longer describes the code.
2. **[note]** The comment pass removed the module header of `web/src/render/masthead.ts`, which stated the §6.1 honesty rule (an unknown bucket renders the word, no track). The rule still holds in code (`sessions/usage.ts:31-38`); only its local statement went.
3. **[note]** The review-browser part: its untracked `web/e2e/zz-review-browser.spec.ts` currently fails `tsc` (`apiToken` on `ScratchDaemon`, line 198) and `e2e-lint`. That breaks `make web-build`/`make e2e` for anyone sharing the tree until the file is removed.
4. **[note]** The plan omitted `web/e2e/shell.spec.ts` from "Existing tests this breaks". e2e-specs updated it to the delta (`model: null` removed, `not.toHaveProperty("model")` added), so it is honest.
5. **[note]** Repairs honesty: Repairs row 1 exempts only the clock-stamped `sampledAt` from the deep equality and adds a monotonicity assertion. The `model` key absence is still asserted by the rest-object equality and by the D1 test. Nothing was weakened beyond the one key the plan's claim got wrong.

## Browser review

# Browser review: Masthead indicators

**Plan**: masthead-indicators
**Part verdict**: approved
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

## Maintainability review

# Maintainability review: Masthead Indicators

**Plan**: masthead-indicators
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 12169 words (budget 30000)
**Scope**: 14 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (4 of them generated `CLAUDE.md` trailers), plus `internal/server/usagebroadcast_test.go` because the gates' `size` log names it

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/server/usagewire.go | usagewire.go's own `UsageBucket`/`UsageModelWindow`/`emptyUsageInfo`, sessionwire.go (`sessionWireModel` still used at :168) | yes (field removal, rg pasted) | none | pass (see Note 2) |
| web/src/features/connection.ts | connectionversion.ts, connectionrestore.ts, updaterestart.ts, update.ts | yes | none | pass (see Note 2) |
| web/src/features/connectionhealth.ts | connectionversion.ts, connectionrestore.ts, updateview.ts | yes (matches connectionversion.ts) | none | pass |
| web/src/features/usage.ts | connection.ts, update.ts | n/a (call removed) | none | pass (see Note 2) |
| web/src/protocol/messages.ts | protocol/usage.ts, protocol/session.ts | n/a | none | pass (see Note 2) |
| web/src/protocol/usage.ts | protocol/decode.ts, protocol/session.ts, protocol/messages.ts | n/a (removal) | none (biome-ignore kept) | pass (see Note 1) |
| web/src/render/masthead.ts | render/tiles.ts, render/sessions.ts, render/banner.ts | yes | none | pass |
| web/src/sessions/format.ts | sessions/usage.ts, features/issue.ts (`pad2` user) | yes (`clockText` shared) | none | pass |
| web/src/sessions/usage.ts | sessions/format.ts, sessions/card.ts | yes | none | pass |
| web/src/style.css | own theme blocks, `.banner.neutral`, `.sdot`-family rules | yes (tokens, dot) | none | pass (see Note 4) |
| internal/server/CLAUDE.md, web/src/{features,render,sessions}/CLAUDE.md | — | generated trailer | none | pass |
| internal/server/usagebroadcast_test.go (test; named by the size log) | reader_test.go, terminal_test.go, ws_test.go | no reason in daemon-tests.md | funlen ×1 (47 > 40), no reason | Minor 1 |

Duplicate checks run:

- `rg -n "describeClaudeVersion|ClaudeVersionDescription|describeConnectionHealth|ConnectionHealthDescription" web/src --glob '!*.test.ts'`: the only description pair is `connectionversion.ts` → `render/masthead.ts:305`, and the new pair copies it: a pure `describe*` in `features/` with one controller caller, returning a type declared beside its renderer in `render/masthead.ts:6`. Nothing else works out a health state.
- `rg -n "formatResets|pad2\(|getHours\(\)" web/src --glob '!*.test.ts'`: `clockText` (`sessions/format.ts:77`) is the only local-time `HH:MM` builder, and both `formatResets` and `formatResetsTitle` use it. `features/issue.ts:78` builds a UTC `HH:MM:SS`, which is a different idea.
- `rg -n "func readUntil" internal/server/*_test.go`: `reader_test.go:722 readUntilDocChanged`, `terminal_test.go:119/132`, `usagebroadcast_test.go:21 readUntilType` (see Note 3).

No shared state was added. `renderConnectionStatus` compares against the DOM and holds no state across calls. The dot holds no state of its own: it reads `frame.connection` and the same `deps.restartBanner(...)` result that the banner uses in the same `onRender` pass (`connection.ts:144-148`). No layer is crossed: `render/masthead.ts` imports only `../dom` and `protocol` types, and `main.ts` is untouched.

## Issues

### Critical

### Major

### Minor
1. **[daemon-tests]** The `funlen` warning (47 > 40) on `internal/server/usagebroadcast_test.go:53` `TestIngestStatusLine_ModelOnlyChangeRecordsRowCarryingModelButBroadcastsNoModel` has no reason in `plans/masthead-indicators/daemon-tests.md`. The body checks three separate things in turn: the WS `usage` broadcasts (:63-83), the `usage_sample` rows in the DB (:85-101), and the `GET /api/state` snapshot (:103-112). It cites conventions § Design "Size is read, not obeyed" and the maintainability rule that a size hit on a touched file needs a stated reason. A fix must either record a reason that holds in the test log's Decisions, or split the test where those three checks already divide. A split made only to get under 40 statements does not count (kb:adr/process-size-linters-warn-never-fail).

### Notes
1. **[note]** `web/src/protocol/usage.ts:74`: the `biome-ignore` reason still says "present-only key blocks whose comments must stay with their fields", but the comment pass removed those per-field comments and the doc comment that explained the suppression (2e678971). The reason now contradicts the code, so a newcomer would split the function. The comment pass owns comments (kb:adr/process-comment-pass-owns-code-comments), so this is not routed.
2. **[note]** The cycle-1 comment pass (2e678971, 12 of 13 candidates dropped) removed comments that existed before this plan, along with this plan's edits to them. That leaves four files out of step with their siblings:
   - `web/src/features/connection.ts:1` and `web/src/features/usage.ts:1` are now the only non-test `features/*.ts` files with no module header. All 29 others have one (checked with `head -1`).
   - `internal/server/usagewire.go:25`: `UsageInfo` is the only exported type in its file with no doc comment. The nil-vs-empty `ModelScoped` semantics it described are still true.
   - `web/src/protocol/messages.ts:43`: `shellsBusy?` lost its additive-evolution explanation, which `update` (:36-39) and `groups` (:44-46) keep. This field has nothing to do with the plan.

   These are for the orchestrator or `/retro` to weigh against the judge's edited-comment rule. They are not routed.
3. **[note]** `internal/server/usagebroadcast_test.go:21` `readUntilType` is a general version of `reader_test.go:722` `readUntilDocChanged`. Both read until a message with a given `type` arrives. One helper could serve both, but this is test code, the `dupl` check did not flag it, and no change is requested this cycle.
4. **[note]** `web/src/style.css`: the base `#connection-status::before` rule already sets `background: var(--health-pending)`, so the `[data-health="pending"]::before` rule just below it has no effect. It is harmless and reads as an explicit list of all three states.
5. **[note]** Changes for `review-work`'s DIAG row: `features/connectionhealth.ts` is a new web module with the edge `connection.ts → connectionhealth.ts`, and the `features/usage.ts → renderUsageModel` edge is gone. Whether `kb:diagram/web-components` shows either change is for that review to check.
