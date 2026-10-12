# Review: masthead-indicators

**Plan**: masthead-indicators
**Verdict**: approved
**Cycle**: 2
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code approved, browser approved, maintainability approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: masthead-indicators

**Plan**: masthead-indicators
**Part verdict**: approved
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

## Browser review

# Browser review: Masthead indicators

**Plan**: masthead-indicators
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 8317 words (budget 30000)
**Rig**: `make web-build build` at 2c3efbd3 (`bin/musterd` v0.20.2-48-g2c3efbd3, clean tree). The scratch daemon came from the committed `daemon` fixture (`helpers/fixtures.ts`), with a space-bearing data dir `$TMPDIR/muster e2e-*`, a private `-tmux-socket` inside it, and the shared stub `claude` from `helpers/daemon.ts`. The run was one throwaway test in headless Chromium, in the foreground (passed in 31.6 s, run twice). The spec is deleted and fixture teardown killed the daemon and its tmux server. `git status --porcelain` shows nothing of mine; the two untracked files are the other reviewers' parts.

Gates log (cycle 2): 0 failed lines. `16-e2e`: 737 passed. `04-web-build` is green. `07-contrast`: 46 pairs, 0 failures in each theme. So the app I drove is the one that ships.

**What changed since cycle 1.** `git diff --stat 2e678971..HEAD` outside `plans/` and `docs/` touches only `web/src/features/CLAUDE.md` (it adds `connectionhealth.ts` to a list), `.claude/rules/connection.md` (generated) and `internal/server/usagebroadcast_test.go`. No shipped source changed, so the dashboard and daemon are the cycle-1 artifact. I re-drove the core cells against a fresh build anyway. The cells I did not re-drive are listed under Notes with the cycle-1 evidence they rest on.

## Matrix

Hosts: the masthead is page chrome shared by **Focus** and **Tiles**. The pop-out (`/doc.html`) has no masthead and no `#connection-status`, so every pop-out cell is `N/A — no masthead in /doc.html`. I list that once here instead of on each row.

States: **pending** (WebSocket held by `routeWebSocket` so no hello arrives; measured 2.5 s after load), **no data** (connected, no status post), **data** (a real `statusLineFull` POST to `/ingest/<token>/status`), **down** (scratch daemon SIGTERMed via `daemon.kill()`), **reconnect** (`daemon.restart()`).

Every value is a computed style or a `getBoundingClientRect()` read at least 1.2 s after the event (2.5 s after a kill), which is at least one render tick past it.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 / INV-2 | focus | pending / no data / data / down / reconnect | `#usage-model` absent | pass | `querySelectorAll('#usage-model').length` = 0 in all 8 Focus snapshots |
| REQ-1 / INV-2 | tiles | no data / data / down / reconnect | `#usage-model` absent | pass | count 0 in all 5 Tiles snapshots |
| REQ-2 / INV-2 | — | data | wire `usage` has no `model` | pass | `GET /api/state` `usage` keys: fiveHour, sevenDay, sampledAt, source, modelScoped, modelScopedAt, modelScopedError, modelScopedSource |
| REQ-3 | — | — | history unchanged | N/A — not visible in the UI. This is daemon history (review-work) | |
| REQ-4 | focus | data | same-day `(HH:MM)` | pass | 5h `.resets` = `(19:05)`; oracle `new Date(resetsAt)` = Mon Oct 12 19:05:12 local (today) |
| REQ-4 | focus | data | other-day `(HH:MM Ddd)` | pass | 7d `.resets` = `(15:59 Wed)`; oracle Wed Oct 14 15:59 local |
| REQ-4 | tiles | data | same / other day | pass | identical texts in Tiles at 1512 and 1440 |
| REQ-4 | focus, tiles | data | no `resets` word or `·` | pass | readout texts `5h61%(19:05)`, `7d23%(15:59Wed)` |
| REQ-4 | focus, tiles | data | visible | pass | `.resets` display block, visibility visible, opacity 1 |
| REQ-4 | focus, tiles | data (model-week) | model-week bracketed | not re-driven (note 1) | cycle 1: `(20:08 Wed)` against the fake API's `resetsAt` |
| REQ-4 | tiles | down | gauges keep values and resets | pass | down-tiles at 1440 and 1512: `61%(19:05)`, `23%(15:59 Wed)`, bars 1 each |
| REQ-5 / §6.1 | focus, tiles | pending / no data | unknown shown as a word, with no track and no reset | pass | `5hunknown`, `7dunknown`, `Fableunknown`; `.bar` count 0; `.resets` absent |
| REQ-5 / edge 1 | focus, tiles | reconnect (daemon restart) | buckets back to unknown | pass | after `daemon.restart()`: all three `unknown`, bars 0, no `.resets` |
| REQ-6 / REQ-9 | focus | pending (first connect) | `data-health=pending`, yellow | pass | `pending`, `::before` bg rgb(227,198,74), banner `display:none` with `hidden` set |
| REQ-6 / REQ-9 | focus, tiles | no data / data | `ok`, green | pass | `ok`, rgb(123,196,127) (Instrument theme) |
| REQ-6 / REQ-9 / §6.7 | focus | down | `down`, red-orange, banner showing | pass | `down`, rgb(238,106,50); `role=alert` banner `display:block`, `hidden=false`, box 0,46–1512,78 (full width under the 46 px masthead), text `musterd unreachable — …` |
| REQ-6 / REQ-9 / §6.7 | tiles | down | `down` plus banner | pass | `down`, rgb(238,106,50); banner block 0,46–1440,78 at 1440 and 0,46–1512,78 at 1512 |
| REQ-6 | focus, tiles | reconnect | back to `ok` | pass | `ok`, title `Connected to musterd`, banner `display:none` |
| Hidden | focus, tiles | pending / no data / data / reconnect | hidden banner not drawn | pass | banner `[hidden]`, computed `display:none`, box 0×0 |
| INV-1 | focus, tiles | pending / ok / down / reconnect | dot agrees with banner | pass | `down` iff the banner is shown with the unreachable text, in all 13 snapshots |
| INV-1 / edges 7, 9, 10 / E6 | focus | update (restart in window, past the 30 s fallback, confirmation) | pending, then down; ok beside the confirmation | not re-driven (note 1) | cycle 1: per-mutation recorder, no INV-1 violation |
| REQ-7 | focus, tiles | all | `role=status`, word visually hidden | pass | `role="status"`; text `connecting…` / `connected` / `reconnecting…` per state; host 14×14 |
| REQ-7 | tiles | data | no re-announcement on every tick | pass | MutationObserver on `#connection-status` over 3.2 s while connected: 0 mutations |
| REQ-8 | focus, tiles | pending / ok / down | titles exactly as in the table | pass | `Connecting to musterd…`, `Connected to musterd`, `musterd unreachable — reconnecting…` |
| REQ-8 | focus | update | `Restarting musterd for an update…` | not re-driven (note 1) | cycle 1 |
| REQ-10 / W11 | focus, tiles | all × theme | `--health-*` tokens, ≥ 3:1 contrast | pass | computed colours above match cycle 1's token values. Gate `07-contrast`: 0 failures in each theme. Hue question settled by kb:adr/connection-health-dot-hues-kept (Option A) |
| W12 | focus, tiles | all | 6 px round dot | pass | `::before` 6px × 6px, `border-radius: 50%`; host box 1482,16–1496,30 at 1512 |
| REQ-11 | focus, tiles | data (both buckets known, other-day 7d reset, model-week selector showing) | one row, no wrap at 1512 | pass | masthead 0,0–1512,46; `.masthead-right` 739,10–1496,35 (r ≤ 1512 − 16); scrollWidth 757 = clientWidth 757; document scrollWidth 1512 = viewport |
| REQ-11 | focus, tiles | data | one row, no wrap at 1440 | pass | masthead h 46; right 667–1424; sw = cw = 757; doc 1440 = viewport |
| REQ-11 | focus | data | (beyond the plan) 1280 | pass | masthead h 46; right 507–1264; sw = cw = 757 |
| REQ-11 | tiles | down @1440 | row holds with the banner | pass | masthead h 46; banner is a separate row at 46–78 |
| REQ-11 | focus, tiles | data, all three gauges known | one row with model-week known | not re-driven (note 1) | cycle 1: h 46 at 1512 / 1440 / 1366 / 1280 |
| REQ-12 | focus, tiles | data | reset `title` with the full date and the `HH:MM` shown | pass | `Resets Mon, Oct 12, 19:05` / `Resets Wed, Oct 14, 15:59` |
| Edge 2 | — | — | a model-only change leaves the masthead unchanged | N/A — the masthead has no model left to change; daemon-side D2 is review-work's | |
| Edge 8 | — | — | protocol-mismatch screen | N/A — plan: the mismatch screen covers the masthead, not asserted | |
| Edge 11 | — | — | old tab without `model` | N/A — plan: a version-skewed client is the reload banner's job | |
| §7 terminal rules | focus, tiles | data | one live client, scrollback 0 | N/A — this plan touches no terminal surface; e2e 737/737 green, including the surfaces specs | |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** Not re-driven this cycle: the model-week readout with data (it needs `startDaemon` with a fake usage API), the real update and restart path (inside the window, past the 30 s fallback, and the post-restart confirmation), and the stale model-week readout. The shipped source is byte-identical to the cycle-1 artifact: the only changes outside `plans/`/`docs/` are a `CLAUDE.md` list entry, a generated rule file and a Go test. So those cycle-1 measurements still describe this build. They are also covered by the cycle-2 gate's green `masthead-update-dot`, `masthead-layout` and `usage-model` specs. The amended INV-1 (the dot is `down` while `reconnecting` during the ≤ 3 s confirmation, kb:adr/connection-dot-red-during-update-confirmation) is a change to the plan, not to the code, so it is not a regression cell.
2. **[note]** Cycle-1 decision 1 (dot hues) is settled as Option A, keep as shipped (kb:adr/connection-health-dot-hues-kept). I measured the same colours (ok rgb(123,196,127), pending rgb(227,198,74), down rgb(238,106,50) in Instrument) and do not raise it again.
3. **[note]** Carried from cycle 1 with no change requested: the reset `title` shadows a stale model-week readout's error `title` on the suffix only; the health `title` is reachable by pointer only (`#connection-status` is not focusable); native tooltips do not render headless, so the hover claims are measured on the `title` attribute.

## Maintainability review

# Maintainability review: Masthead Indicators

**Plan**: masthead-indicators
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 12169 words (budget 30000)
**Scope**: 14 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (4 of them generated or hand-written `CLAUDE.md`), plus `internal/server/usagebroadcast_test.go` because cycle 1's Minor 1 was raised on it. Since the cycle-1 review commit (`b09a5047..HEAD`), the only change to a non-test source file is `web/src/features/CLAUDE.md`, which adds `connectionhealth.ts` to the list of pure helpers.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/server/usagewire.go | sessionwire.go (`sessionWireModel` still used) | yes (field removal, rg pasted) | none | pass (Note 2) |
| web/src/features/connection.ts | connectionversion.ts, connectionrestore.ts, updaterestart.ts | yes | none | pass (Note 2) |
| web/src/features/connectionhealth.ts | connectionversion.ts, connectionrestore.ts, updateview.ts | yes (matches connectionversion.ts) | none | pass |
| web/src/features/usage.ts | connection.ts, update.ts | n/a (call removed) | none | pass (Note 2) |
| web/src/features/CLAUDE.md | — | hand-written list + generated trailer | none | pass (`connectionhealth.ts` now listed) |
| web/src/protocol/messages.ts | protocol/usage.ts, protocol/session.ts | n/a | none | pass (Note 2) |
| web/src/protocol/usage.ts | protocol/decode.ts, protocol/session.ts | n/a (removal) | none | pass (Note 1) |
| web/src/render/masthead.ts | render/tiles.ts, render/banner.ts | yes | none | pass |
| web/src/sessions/format.ts | sessions/usage.ts, features/issue.ts | yes (`clockText` shared) | none | pass |
| web/src/sessions/usage.ts | sessions/format.ts, sessions/card.ts | yes | none | pass |
| web/src/style.css | own theme blocks, `.banner.neutral` | yes (tokens, dot) | none | pass (Note 3) |
| internal/server/CLAUDE.md, web/src/{render,sessions}/CLAUDE.md | — | generated trailer | none | pass |
| internal/server/usagebroadcast_test.go (test; cycle-1 Minor 1) | reader_test.go, terminal_test.go | reason in daemon-tests.md Fix Attempt | none (`size-warn: 0 hits`) | pass |

Duplicate checks were re-run on HEAD:

- `rg -n "describeConnectionHealth|ConnectionHealthDescription|describeClaudeVersion|ClaudeVersionDescription" web/src --glob '!*.test.ts'` finds two pairs: `connectionversion.ts:21` with `render/masthead.ts:305`, and `connectionhealth.ts:25` with `render/masthead.ts:6`. Each pair has one caller in `connection.ts` (`:88/:166` and `:147`). The new pair copies the old pair's shape. No third module works out a health state.
- `rg -n "formatResets|clockText|getHours\(\)" web/src --glob '!*.test.ts'` finds one builder of local `HH:MM` text, `sessions/format.ts:77 clockText`. Both `formatResets` (:81) and `formatResetsTitle` (:92) use it.

No shared state was added. The dot gets its value from `frame.connection` and from the same `deps.restartBanner(...)` result that the banner reads in the same `onRender` pass. `renderConnectionStatus` compares against the DOM, so it keeps no state between calls. No layer is crossed: `render/masthead.ts` imports only `../dom` and `protocol` types, and `main.ts` and `server.go` are untouched.

Cycle-1 Minor 1 (`[daemon-tests]`, funlen 47 > 40 on `usagebroadcast_test.go`) is fixed. The test now uses one scenario helper, `modelOnlyScenario` (`t.Helper()`, with its cleanups moved to `t.Cleanup`), and three tests, one per effect: the WS broadcasts, the `usage_sample` rows and the `/api/state` snapshot. Those are the three checks the old body already ran one after another. `daemon-tests.md` § Fix Attempt says the split follows the subject and not the line count, and that holds. The gates' size log reports `size-warn: 0 hits`.

## Issues

### Critical

### Major

### Minor

### Notes
1. **[note]** Carried from cycle 1, still true: the `biome-ignore` reason at `web/src/protocol/usage.ts:74` still says "present-only key blocks whose comments must stay with their fields". The comment pass removed those comments. Separately, `web-implementation.md` Decisions says the function's "doc comment now says 20", but `parseUsage` has no doc comment on HEAD. The comment pass owns comments (kb:adr/process-comment-pass-owns-code-comments), so this is not routed.
2. **[note]** Carried from cycle 1, still true: the comment pass removed comments that were there before this plan, so these files now differ from their siblings. `features/connection.ts` and `features/usage.ts` have no module header. `UsageInfo` (`usagewire.go:25`) has no doc comment. `messages.ts` `shellsBusy?` lost its additive-evolution note. This is for the orchestrator or `/retro` to weigh. It is not routed.
3. **[note]** In `style.css`, the `#connection-status[data-health="pending"]::before` rule sets the same value the base `::before` rule already sets. It does no harm and lists all three states explicitly.
4. **[note]** All three new tests in `usagebroadcast_test.go` run `modelOnlyScenario` in full, which costs two posts and two WS reads each. That is acceptable for a test, and each test stays independent.
5. **[note]** `features/connectionhealth.ts` is a new web module with the edge `connection.ts → connectionhealth.ts`. Whether `kb:diagram/web-components` shows it is `review-work`'s DIAG row.
