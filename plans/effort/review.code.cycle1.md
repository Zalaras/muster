# Correctness review: Effort

**Plan**: effort
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 70584 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes — `web/index.html` Effort `fieldset.seg`, six radios named `effort` after the custom-model input, before Start in | Yes — effort-launch E2 form/order, arrow-key, pointer, Resume-tab hide | pass |
| REQ-2 | Yes — `claudecode.BuildArgv` appends `--effort` after `--permission-mode`; `launch.ts` sends `effort` only for a level | Yes — `TestBuildArgv_Effort`, `TestLauncher_LaunchEffort`, E3 argv oracles | pass |
| REQ-3 | Yes — `validateLaunchRequest` checks effort after permissionMode, before the model pre-check; exact contract message | Yes — `TestHandleCreateSession_InvalidEffortIs400AndWritesNothing`, check-order tests, D3 E2E (auto/ultracode/HIGH) | pass |
| REQ-4 | Yes — `UpsertRepo` writes `last_effort` (nil clears), `TouchRepo` leaves it; `repoRestore`/`initialRestore` with `touched.effort` | Yes — `TestRepo_LastEffort`, launchrestore 8-combination table, E4 + touched-race E2E | pass |
| REQ-5 | Yes — `InterpretStatus` returns a non-nil `Effort` reading on every post; `adoptEffort` adopts on change; `ApplyStatus` broadcast gains both pointer terms | Yes — `TestApplyStatus_EffortAdoption`, upsert-count E2E, verbatim `ultra` | pass |
| REQ-6 | Yes — `effortBrackets` (`(…)` alive+null, none dead+null or null level); `.eff` child span | Yes — `sessions/effort.test.ts`, mainhead tests, E5/E6/E7 | pass |
| REQ-7 | Yes — `checkLaunchedEffort` on the first reading while `effortRequested` is set; model is the display name after the post | Yes — D6/D7 tables (144 + 60 cells), E8–E10, bystander | pass |
| REQ-8 | Yes — `#effort-strip role="status"`, `.eff.warn` | Yes — E8/E9 sentences, theme tests | pass (gate run: one theme case red, see Critical 1) |
| REQ-9 | Yes — `internal/server/effort.go` DELETE route, `Manager.ClearEffortWarning` persist+broadcast only when set | Yes — `TestHandleDismissEffortWarning_*` (204/204-no-broadcast/404/401), E12 two pages | pass |
| REQ-10 | Yes — `Resume` passes `sess.EffortLevel()`; `RecordResume`/`RepairOwnedSession` clear only the pending check | Yes — `TestLauncher_Resume_*`, E15/E17, D7 Resume-button cells | pass |
| REQ-11 | Yes — transcript scan keeps the last `assistant` line's `effort` (a later key-less line resets it); `EffortSeed` with no check | Yes — `TestPastSessions_Effort`, `TestLauncher_LaunchResume_Effort`, E16 + last-line E2E | pass |
| REQ-12 | Yes — four `--warn*` tokens in all three theme blocks; contrast pairs + `--warn` hue band 46–65° | Yes — `make contrast` 50 pairs ×3, 0 failures; theme E2E | pass |
| REQ-13 | Yes — no own code: `renderMainhead` toggles the strip, then `mountTerminalSurface` refits in the same pass | Yes — E14 size-note vs `#{window_height}` | pass |
| REQ-14 | Yes — `needles["--effort flag"] = "--effort"` in `test/canary/static_test.go` | Ran green offline on 2.1.300 (red direction not run; existing `assert.Empty(misses)` path) | pass |
| DIAG | `store-schema` (columns present, but summary and body still say "0001-0015"/"0003-0015"); `one-launch-end-to-end` (validate and BuildArgv steps omit effort); `web-components` (updated, true); `daemon-components` (no import change) | — | fail (Major 1) |

## Build & Tests

E2E tests: fail (903 passed, 1 failed of 904 — `effort-header.spec.ts:893` Dark theme) · Daemon tests (race): pass (every package `ok`) · Web tests: pass (95 files, 2702 tests) · Daemon build: pass · Web build: pass · Lint: pass (`0 issues.`; web lint clean; e2e-lint clean) — all read from $GATES_LOG_DIR

Other gate lines: contrast pass · features-inventory pass · versions pass (`all fragments fresh`) · e2e-honest pass · kb check pass (597 records, 0 problems) · features-scope pass · comment-checks clean · comment ledger pass (6 blocks kept) · size WARN (4 file-length hits — review-maintainability's).

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass (deduped to the gate's `go test -race -count=1 ./...`) |
| D2 | `make lint` | pass (`0 issues.`) |
| D15 | `go build ./...` | pass (gate build line) |
| W1 | `make web-test` | pass (2702/2702) |
| W2 | `make web-build` | pass |
| W3 | `make web-lint` | pass |
| W4 | `make contrast` | pass (instrument/dark/light: 50 pairs, 0 failures) |
| E1 | `make e2e` | **FAIL** — `effort-header.spec.ts:893:3` "in the Dark theme …": `expect(await computed(headerEff(page), "color")).toBe(warn)` received `""` (Critical 1) |
| K1 | `make check-kb` | pass (deduped to the gate's kb check: 0 problems) |
| DOC | doc upkeep + Doc Delta vs what shipped | **FAIL** — `docs/design/design-system.md` §1/§3 not given the `--warn` row and rule (plan § Doc upkeep, § Doc Delta "Outside the feature specs"); `docs/facts/effort-flag-values.md` still `guard: none` (plan: gains the canary static test); `store-schema` prose still says 0001-0015. Doc Delta assertions themselves all hold against the code (see Major 2 for log `doc-delta:` lines it does not carry). ADRs: five `proposed`, each `refs: plan:effort`, no `deviation:` line needs one. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| R1 | status-line `effort` read only in `internal/claudecode/` | pass | `statusEffort` in `internal/claudecode/status.go:27`; transcript `effort` in `launchtranscripts.go:177`. `rg '"effort\|effort\.level\|perTurnEffort'` outside claudecode finds only Muster's own request/wire structs (`launcher.go:82`, `sessionwire.go:54-55`) |
| R2 | no E2E launches a real `claude` | pass | effort specs read argv through `paneStartCommand` on the stub; no `claude` binary reference in `effort-*.spec.ts` / `helpers/effort.ts` |
| R3 | strip and tint match `opt-a-segmented.html`, three themes, reworded sentence | pass at token level | Instrument values equal `mockup.css:93` byte for byte; strip rules (bg, bottom line, inset bar, fg, ghost Dismiss) match `mockup.css:94-100`; sentence is the plan's reworded one. Dark/Light values are new (mockup gave Instrument only). Pixels are review-browser's |
| R4 | `.model` with `.eff` never truncates; Dismiss in view 316px → full | pass, with a plan-wording note | width E2E at windows 1280/800/700/616/600 green; card-location fit sweeps green. The spec reads "316px" as the header width (616px window) — see Note 3 |
| R5 | no `any` in new web code | pass | `rg ': any\|as any\|<any>'` over the new/changed web files: none |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass |
| 2 | Terminal-output state parsing | pass — effort comes from the status line only |
| 3 | Blocking hook handler | pass — no hook path changed |
| 4 | Bare tmux / resize-pane | pass — no tmux call added |
| 5 | Payload logging | pass — the one new log line (`internal/server/effort.go:45`) logs the error and session id only |
| 6 | Empty-gauge dishonesty | pass — null effort renders `(…)` (alive) or nothing (dead), never `0`/blank-as-value; null model still reads `unknown` |
| 7 | Session identity on `session_id` | pass — dismiss and all effort state key on the Muster id |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass — the canary change is a static bundle-string needle, no launch |

## Merge resolution (3e5da467)

Read `git show 3e5da467 --cc` for `internal/session/row.go`, `internal/store/session.go`,
`internal/store/migrate_test.go`, `internal/store/store_test.go`: both sides' columns are kept in
`UpdateSession`'s SET list, its argument list, `sessionColumns` and `scanSession` in the same order
(`cache_requests, cache_reported_expires_at` then the six effort columns); `sessionToRow` carries
both `cacheHeldToRow` and the two effort helpers; migration counts are 16 with `0015_cache_keepalive`
then `0016_effort` in the lineage comments. `TestUpdateSession_RoundTripsEveryField` asserts the six
effort columns and the cache-held tests assert `cache_requests`/`cache_reported_expires_at`; the gate's
store and session packages are green. Resolution correct.

## Issues

### Critical

1. **[e2e-specs]** Gate E1 `make e2e` failed: `web/e2e/effort-header.spec.ts:924` (Dark theme case of the `:893` loop) read `computed(headerEff(page), "color")` as `""`. `renderModel` (`web/src/render/mainhead.ts:564-574`) replaces the `.eff` span on every render pass (each tick and WS message), and `computed()` (`web/e2e/helpers/effort.ts:329-334`) is a one-shot `locator.evaluate` — Playwright resolves the handle and then evaluates in a second round trip, so a node the renderer replaces in between is detached and Chrome's `getComputedStyle` returns `""` for it. The markup is what the plan asks for (`.eff` child of `.model`, class `warn`); the read cannot reliably sample a node that is rebuilt every frame. The same unpolled read is at `:282` (E8) and `:440`, and `:440` is worse than flaky: `expect(…).not.toBe(warnColour)` **passes vacuously** on `""` from a detached node, so the "tint gone after Dismiss" check can pass without measuring anything. Fix: put the three computed-colour reads in `expect.poll(…)` (as the spec's other DOM reads already are), and make `:440` assert a positive value — the resolved colour `.model` itself has — rather than `not warn`. The E2E Validate step ran this spec live and soaked it ×10 (`400 passed`), so it neither skipped the live run nor misclassified a failure; the race is rare enough to survive a 10-run soak. Repair it and soak it again.

### Major

1. **[orchestrator]** DIAG — two diagrams are stale against what shipped. `docs/diagrams/store-schema.md:7` (summary) and `:14` still say "after migrations 0001-0015" / "ALTER TABLEs of 0003-0015", while its body already lists the `0016` columns. `docs/diagrams/one-launch-end-to-end.md` still shows `validateLaunchRequest — directory, model, permissionMode` and `BuildArgv — model, --name, permission mode`; the code checks `effort` after permissionMode (`internal/server/launcher.go:198`) and passes `--effort` (`internal/claudecode/launch.go:85`). Also `plans/effort/plan.md:406` still says "gains the 0015 columns".
2. **[orchestrator]** `doc-delta:` lines in the logs that the plan's `## Doc Delta` does not carry (it is promoted verbatim): (a) `daemon-implementation.md`: a Resume-button resume also cancels a still-pending first-report check (edge case 11; `internal/session/actions.go:301`, `reconcile.go:240`) — nothing under **actions** says so; (b) `web-implementation.md`: a dead, never-reported session keeps the width of ` (…)` reserved invisibly (`.model.holds-eff::after`, `web/src/style.css` — the INV-6 fix), where **focus**'s Doc Delta says only "no brackets"; (c) `web-implementation.md`: design-system §3/§5 — the strip's Dismiss is a ghost `.btn.sm` in `--warn-fg` on `--warn-line`, never disabled — absent from the "Outside the feature specs" design-system line.

### Minor

1. **[orchestrator]** `ingest` is under **Touches**, but this plan adds a status-line signal to its territory: `docs/features/ingest/spec.md:26`'s Signals table ("Context, model, title, account usage | the status-line payload") no longer lists everything the status line feeds, and effort is read from the status line on every routed post. Promote `ingest` to **Features** with a Doc Delta line, or add the row to the existing card-location delta's scope.

### Notes

1. **[note]** For review-maintainability: `.eff` is a fresh `<span>` on every render pass (`web/src/render/mainhead.ts:570-573`), while its sibling `render/effortstrip.ts` memoises on a signature. That churn is what Critical 1's spec races against. The fix there is the spec's; whether the renderer should also stop churning the node is your call.
2. **[note]** The dismiss route's 404 serves `no session with that id` (`internal/server/effort.go:14`), as the Protocol Contract pins, while every other route serves the shared `unknown session id`. It is contract-correct; doc-reconcile may want to note the divergence in `docs/protocol.md`.
3. **[note]** R4 / the Warning-strip row say "316px" without saying whose width. With the rail fixed at 300px, a 316px *window* leaves a 16px header where the existing model already overflows, so the spec reads it as the header's 316px container width (a 616px window), per Repair 5. That reading is honest, and I verified the repair's assertions are unchanged in strength. The plan wording should name the header width next time.
4. **[note]** Repairs 1–4 (`test-specs.md`) are honest. A bind or `/clear` `SessionStart` without `model` is the measured shape (kb:fact/sessionstart-model-optional-string). The restart moved before Stop because ended rows are swept at the next start (kb:adr/lifecycle-ended-rows-swept-next-start). Every value assertion is kept.
5. **[note]** At failure time the gate's page snapshot showed the dashboard's connection-gated controls disabled (rename, Stop, Usage model, Select). It also showed the strip and `.model` "Opus 4.5 (high)" still present. I could not re-read the artifact afterwards (`web/test-results` was cleared by a later run), so I make no claim about why the socket was down. It would explain an extra render pass during the read.
