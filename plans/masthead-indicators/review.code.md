# Correctness review: masthead-indicators

**Plan**: masthead-indicators
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 31494 words (budget 30000)

Scope: full review (cycle 1 had Majors open, so this is not a delta cycle). Since the cycle-1 review commit `b09a5047`, the only changes under `web/src/`, `internal/`, `cmd/` and `web/e2e/` are `internal/server/usagebroadcast_test.go` and the hand-written line in `web/src/features/CLAUDE.md` (`git diff --stat b09a5047..HEAD -- web/src internal cmd web/e2e web/index.html`). The cycle-1 findings on the unchanged source therefore still hold. I re-read the changed files, the two new ADRs, the amended ADRs and the plan amendments against the code.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 no `#usage-model` | Yes: `web/index.html`, `features/usage.ts`, `render/masthead.ts` (unchanged since cycle 1) | Yes: E4, gauges E5/E7, layout E7 | pass |
| REQ-2 no `model` key on the wire | Yes: `internal/server/usagewire.go` | Yes: `TestToWireUsage_NeverCarriesAModelKey`, `TestIngestStatusLine_ModelOnlyChangeBroadcastsNoModelAndLeavesWireUnchanged`, `…KeepsStateSnapshotFreeOfModel`, `state_test.go`, D1 e2e, `usage.test.ts` W1 | pass |
| REQ-3 history unchanged | Yes: `internal/usage`, `internal/store` and `ingest.go` untouched | Yes: `TestIngestStatusLine_ModelOnlyChangeRecordsRowCarryingModel`, D2 e2e | pass |
| REQ-4 `(HH:MM)` / `(HH:MM Ddd)` | Yes: `sessions/format.ts`, `sessions/usage.ts` | Yes: format.test W2, usage.test W3, e2e E1, usage-model E1 | pass |
| REQ-5 unknown shows no reset | Yes | Yes: E3, usage.test | pass |
| REQ-6 dot health | Yes: `features/connectionhealth.ts` returns `down` for reconnecting with the neutral override, which matches amended INV-1 | Yes: connectionhealth.test W4 (the row `["reconnecting", { neutral: true }, DOWN]` and the real-`computeBannerOverride` row "confirmation showing" → `down`), e2e E5/E6 | pass |
| REQ-7 `role="status"`, hidden word | Yes | Yes | pass |
| REQ-8 `title` per state | Yes: four titles verbatim | Yes: W5, e2e | pass |
| REQ-9 `data-health` | Yes | Yes | pass |
| REQ-10 three tokens, every theme | Yes | Yes: `style.test.ts` W6 | pass |
| REQ-11 one row at 1512/1440 | Yes | Yes: masthead-layout E7 | pass |
| REQ-12 reset `title` | Yes | Yes: format.test, e2e E8 | pass |
| INV-1 (amended) | Yes: `ok` iff connected; `pending` iff connecting, or reconnecting with the updating override; otherwise `down`, the confirmation window included (kb:adr/connection-dot-red-during-update-confirmation) | Yes: W4 table, `healthViolations` in the e2e runs | pass |
| INV-2 | Yes | Yes | pass |
| Edge case 2 (amended: identical apart from `sampledAt`) | Yes | Yes: Go test now drops `sampledAt` before the comparison and asserts it does not go backwards, the same form as the e2e repair; `go test -count=10 -run TestIngestStatusLine_ModelOnly ./internal/server/` → `ok` | pass |
| DIAG | `kb:diagram/web-components`, `kb:diagram/daemon-components`: no source module, import or package changed since cycle 1, when both were checked true | — | pass |

## Build & Tests

E2E tests: pass (737 passed) · Daemon tests (race): pass (24 packages ok, no FAIL) · Web tests: pass (2492 in 91 files) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues; biome clean) · Contrast: pass (46 pairs × 3 themes, 0 failures) · e2e-lint: clean · check-kb: 542 records, 0 problems · features-scope, comments, comment-ledger: clean · WARN size: 0 hits. All read from `$GATES_LOG_DIR` (`gates-masthead-indicators-c2`).

Soak: this cycle repairs no flaky spec. The Go flake fix is a unit test, and the targeted `-count=10` run above passed. The e2e twin was soaked 10/10 in cycle 1.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D4 | `make build` | pass (`17-D4.log`) |
| D5 | `make lint` | pass (deduped, `03-lint.log`) |
| D6 | `make test` | pass (deduped to test-race, `02-test.log`) |
| W7 | `make web-build` | pass (deduped, `04-web-build.log`) |
| W8 | `make web-lint` | pass (deduped, `06-web-lint.log`) |
| W9 | `make web-test` | pass (deduped, `05-web-test.log`) |
| E9 | `make e2e` | pass (deduped, `16-e2e.log`, 737 passed) |
| X1 | `! rg -n "usage-model\"\|#usage-model([^-[:alnum:]_]\|$)\|renderUsageModel\b\|mastheadModelReadout" web/src web/index.html web/e2e` | pass (`18-X1.log` empty) |
| X2 | `! rg -n -F "· resets" web/src web/e2e` | pass (`19-X2.log` empty) |
| X4 | `! rg -n -F 'resets ${' web/src` | pass (`20-X4.log` empty) |
| X3 | `make check-kb` | pass (deduped, `10-kb-check.log`) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. Six `proposed` ADRs carry `refs: plan:masthead-indicators`, including the two new user-decision ADRs. The `usage-masthead-shows-no-model` Consequences now says "apart from its re-stamped `sampledAt`". `connection-health-dot` names the confirmation exception. The plan's Protocol Contract, Edge Case 2, INV-1 and W11 are amended. No `deviation:` lines. Both `doc-delta:` lines (design-system) were applied in cycle 1. The Doc Delta's connection line now names the confirmation exception, which matches `connectionhealth.ts:31`. `TODO.md` ticks are deferred until approval. `docs/protocol.md:1342` still says "identical to the previous one"; the plan's corrected Protocol Contract prose is merged there at Step 7 (doc-reconcile's). |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W10 | No `any` in new or changed web code | pass | Web code is unchanged since cycle 1, where `git diff main...HEAD -- web/src web/e2e` found no `any`. |
| W11 (amended) | Tokens outside the state hue bands; ≥ 3:1 on `--bg-raised`; "same alarm" through the banner beside the dot | pass | Hues from cycle 1: down ≈ 18°, pending ≈ 47–49°, ok ≈ 123°, all outside the §1 bands. `make contrast`: 0 failures in each theme. The amendment (kb:adr/connection-health-dot-hues-kept) accepts the shipped hues. |
| W12 | 6px round dot in all three themes | pass (CSS); the in-browser measurement is review-browser's | One `style.css` rule for every theme: `width/height: 6px`, `border-radius: 50%`. |
| D7 | Aggregator and store still read and persist the model | pass | `internal/usage/**`, `internal/store/**` and `ingest.go` are unchanged on the branch. `TestIngestStatusLine_ModelOnlyChangeRecordsRowCarryingModel` reads `model_id`/`model_display_name` back. |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: the only Go source change is the field removal in `usagewire.go`; this cycle's Go change is test-only |
| 2 | Terminal-output state parsing | pass |
| 3 | Blocking hook handler | pass: ingest untouched |
| 4 | Bare tmux | pass: no tmux invocation added |
| 5 | Payload logging | pass |
| 6 | Empty-gauge dishonesty | pass: an unknown bucket keeps `unknown` and gets no reset text or title |
| 7 | Session identity on `session_id` | pass: n/a |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary | pass: synthesized status-line posts only |

## Cycle-1 items

| Prior item | Fix commit | Verified how |
|------------|------------|--------------|
| correctness Major 1 `[orchestrator]` "identical on the wire" is false for `sampledAt` | `206afa7b` | The ADR Consequences, the plan's Protocol Contract and Edge Case 2 all now say "apart from `sampledAt`". `docs/protocol.md` is doc-reconcile's, at Step 7. |
| correctness Major 2 `[daemon-tests]` Go whole-frame `JSONEq` includes `sampledAt` | `9a533a41` | Diff read: `sampledAt` is unmarshalled from both frames, `secondAt.Before(firstAt)` must be false, and the key is deleted before `assert.Equal` on the remaining keys. 10× run green. |
| correctness Minor 1 `[web-impl]` `connectionhealth.ts` missing from the pure-helper list | `d93ddaf0` | `web/src/features/CLAUDE.md` lists it alphabetically. Only the hand-written line and the regenerated trailer changed. |
| correctness Decision 1 (red dot during confirmation) | `206afa7b` | User decision A. INV-1, the Doc Delta, `connection-health-dot` and the new `connection-dot-red-during-update-confirmation` all state the exception. No code change, as decided. |
| browser Decision 1 (dot hues) | `206afa7b` | User decision A. W11 is amended and `connection-health-dot-hues-kept` is recorded. No code change, as decided. |
| maintainability Minor 1 `[daemon-tests]` funlen on the broadcast test | `9a533a41` | Split into three tests by effect (WS frames / `usage_sample` rows / `/api/state`) over a shared `modelOnlyScenario` helper. `15-size.log`: 0 hits. Whether the split shape holds is maintainability's to confirm. |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** The frontmatter `summary` of `kb:adr/connection-health-dot` still reads "a dot … that agrees with the banner". The body now names the confirmation exception and links the new ADR, so the summary overstates by ≤ 3 s. This summary feeds INDEX listings. An `[orchestrator]` wording touch is optional.
2. **[note]** `docs/protocol.md:1342` ("`usage` message identical to the previous one") is still the false sentence from cycle 1. It is doc-reconcile's to replace at Step 7 from the plan's corrected Protocol Contract prose, as the orchestrator stated.
3. **[note]** The three split Go tests each run the full two-post scenario (`modelOnlyScenario`), so the server spins up three times where it used to spin up once. The cost is negligible (`-count=10` took 2.8 s), and each test now names one effect.
4. **[note]** Cycle-1 notes 1–2 still stand, unchanged and not routed. `web/src/protocol/usage.ts:74`'s `biome-ignore` reason no longer describes the code, and `render/masthead.ts` lost its §6.1 module header to the comment pass.
