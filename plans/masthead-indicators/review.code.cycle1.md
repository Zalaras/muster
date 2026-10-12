# Correctness review: masthead-indicators

**Plan**: masthead-indicators
**Verdict**: needs-changes
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
