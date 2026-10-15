# Correctness review: Effort

**Plan**: effort
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 70723 words (budget 30000)

This is a full cycle, not a delta: cycle 1 had a Critical and Majors. Requirements, contract and
hard rules were re-checked against the whole branch (`git diff main...HEAD`). The cycle 1 → 2 diff
(`12c84dd5..HEAD`, 35 files) was read line by line.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes. `web/index.html` has the Effort `fieldset.seg` with six radios named `effort`, after the custom-model input and before Start in | Yes. effort-launch E2: form and order, arrow keys, pointer, hidden on the Resume tab | pass |
| REQ-2 | Yes. `claudecode.BuildArgv` appends `--effort` after `--permission-mode`. `launch.ts` sends `effort` only for a level | Yes. `TestBuildArgv_Effort`, `TestLauncher_LaunchEffort`, E3 argv oracles | pass |
| REQ-3 | Yes. `validateLaunchRequest` checks effort after permissionMode and before the model pre-check, with the exact contract message | Yes. `TestHandleCreateSession_InvalidEffortIs400AndWritesNothing`, the check-order tests, D3 E2E | pass |
| REQ-4 | Yes. `UpsertRepo` writes `last_effort` and `TouchRepo` leaves it. `repoRestore` and `initialRestore` honour `touched.effort` | Yes. `TestRepo_LastEffort`, the launchrestore table, E4 and the touched-race E2E | pass |
| REQ-5 | Yes. `InterpretStatus` gives an `Effort` reading on every post. `adoptEffort` adopts on change. The `ApplyStatus` broadcast includes both fields | Yes. `TestApplyStatus_EffortAdoption`, the upsert-count E2E | pass |
| REQ-6 | Yes. `effortBrackets` produces the `.eff` child. `writeEffort` now keeps that node across render passes (`web/src/render/mainhead.ts:73-84`) | Yes. `sessions/effort.test.ts`, mainhead "across render passes" tests, E5/E6/E7, and the new node-identity E2E (`effort-header.spec.ts:489`) | pass |
| REQ-7 | Yes. `checkLaunchedEffort` runs on the first reading while `effortRequested` is set | Yes. D6/D7 tables, E8–E10 | pass |
| REQ-8 | Yes. `#effort-strip role="status"` and `.eff.warn` | Yes. E8/E9 sentences. Colour reads are now polled; all three theme cases are green in the gate and in a ×10 soak | pass |
| REQ-9 | Yes. The `DELETE` route now goes through `parseSessionID` and `writeUnknownSession` (`internal/server/effort.go:27-35`). The Dismiss listener moved to `features/focus.ts:159` | Yes. `TestHandleDismissEffortWarning_*`, two new rows in `TestUnknownSessionEnvelope_ByteIdenticalAcrossMigratedCallSites`, E12, and the keyboard and two-page E2Es | pass |
| REQ-10 | Yes. `Resume` passes `sess.EffortLevel()`. `RecordResume` and `RepairOwnedSession` clear only `effortRequested` | Yes. `TestLauncher_Resume_*`, E15/E17 | pass |
| REQ-11 | Yes. The transcript scan keeps the last `assistant` line's `effort`; `EffortSeed` creates no pending check | Yes. `TestPastSessions_Effort`, `TestLauncher_LaunchResume_Effort`, E16 | pass |
| REQ-12 | Yes. Four `--warn*` tokens in all three theme blocks | Yes. `make contrast`: 50 pairs × 3 themes, 0 failures; theme E2E | pass |
| REQ-13 | Yes. The strip toggles in `renderMainhead`, then the same pass refits | Yes. E14: the size note agrees with tmux `#{window_height}` | pass |
| REQ-14 | Yes. `needles["--effort flag"] = "--effort"` (`test/canary/static_test.go:93`) | Yes. It is now the `guard:` of `kb:fact/effort-flag-values` | pass |
| DIAG | `store-schema`: now reads 0001-0016 and 0003-0016. `one-launch-end-to-end`: validate and BuildArgv now name effort. `web-components`: still true (37 `features/` modules, import edges unchanged). `daemon-components`: no import change (`effort.go` only dropped `strconv`) | — | pass |

## Build & Tests

All results below were read from `$GATES_LOG_DIR` (`gates-effort-c2`).

- **E2E:** pass, 905 passed, 0 failed, 0 skipped
- **Daemon tests (race):** pass, 25 packages `ok`, no `FAIL`
- **Web tests:** pass, 95 files, 2713 tests
- **Daemon build:** pass (empty log)
- **Web build:** pass
- **Lint:** pass (`0 issues.`; web lint clean; e2e-lint clean)

Other gate lines:

- contrast: pass
- features-inventory: pass
- versions: pass
- e2e-honest: pass
- kb check: pass (598 records, 0 problems)
- features-scope: pass (ingest now under **Features**)
- comment-checks: clean
- comment ledger: pass (6 blocks kept)
- size: WARN, 11 hits. These belong to review-maintainability; the reasons are in daemon-implementation.md Fix Attempt 2.

**Flake soak (§1).** This cycle repairs the flaky `effort-header.spec.ts`, and the ```checks block does not soak it, so I ran the soak myself: `make e2e-soak SPEC=effort-header.spec.ts N=10`, in the foreground, on this tree. Result: `410 passed (3.3m)`. That includes all 30 theme-case runs and 10 runs of the new node-identity test.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass (deduped to the gate's `go test -race -count=1 ./...`) |
| D2 | `make lint` | pass (`0 issues.`) |
| D15 | `go build ./...` | pass (gate build line) |
| W1 | `make web-test` | pass (2713/2713) |
| W2 | `make web-build` | pass |
| W3 | `make web-lint` | pass |
| W4 | `make contrast` | pass (instrument, dark and light: 50 pairs each, 0 failures) |
| E1 | `make e2e` | pass (905 passed) |
| K1 | `make check-kb` | pass (deduped to the gate's kb check: 0 problems) |
| DOC | doc upkeep, and the Doc Delta against what shipped | pass. Details below the table. |

Details for the DOC row:

- **design-system.md:** now has the `--warn` row in §1, the "warning uses `--warn`, never `--amber`" rule in §3, and the effort-mismatch strip paragraph in §5. The §5 paragraph matches `style.css:913-953`: inset 3px `--warn`, `--warn-fg` on `--warn-line`, Dismiss never disabled, and the reserved ` (…)` width.
- **Fact guard:** `kb:fact/effort-flag-values` has `guard: TestInstalledBinaryCarriesInterfaceStrings`, and that test checks `--effort`.
- **Diagrams:** both fixed.
- **ADRs:** six are `proposed`, each with `refs: plan:effort`. The new `kb:adr/focus-effort-dismiss-404-uses-shared-body` describes what shipped. The one `deviation:` line in the logs says none.
- **`plans/effort/doc-delta.md`:** carries cycle 1's three log `doc-delta:` lines and daemon-impl Fix Attempt 2's superseding line. Every assertion holds against the code:
  - Resume and repair clear only `effortRequested` (`actions.go:301`, `reconcile.go:240`), and a restart keeps a pending check (D11, E2E `:628`).
  - `.model.holds-eff::after` is at `style.css:905`.
  - The ingest Signals row being replaced reads exactly as quoted (`docs/features/ingest/spec.md:27`).
  - The 404 body in `docs/protocol.md:1034` and the regenerated `focus/contract.md` match `effort.go`.
- **TODO.md:** the tick is a Completion step and not yet due.

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| R1 | The status-line `effort` key is read only in `internal/claudecode/` | pass | Unchanged since cycle 1. `statusEffort` is in `internal/claudecode/status.go` and the transcript `effort` in `launchtranscripts.go`. Outside the package, only Muster's own request and wire structs name `effort`. This cycle touches no daemon code beyond `effort.go`'s 404 path. |
| R2 | No E2E test launches a real `claude` | pass | The new node-identity test uses `warnedSession` and `postEffort`, which are synthesized posts. Argv is read through the stub's `paneStartCommand`. |
| R3 | The strip and the tint match `opt-a-segmented.html` in all three themes, with the reworded sentence | pass, at token level | The tokens and strip rules are unchanged since cycle 1, where they matched `mockup.css`. The theme E2E now polls each computed colour against the live token. Pixels are review-browser's. |
| R4 | `.model` with `.eff` never truncates; Dismiss stays in view from 316px | pass | The width E2E (`:874`, five widths) is green in the gate and in the ×10 soak. The 316px header-width reading is as in cycle 1, Note 3. |
| R5 | No `any` in new web code | pass | Searching the full branch diff for `: any`, `as any` and `<any>` finds nothing. |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. Searching the added lines for `hook_event_name`, `rate_limits` and `permission_mode` finds only the store's `last_permission_mode` column. |
| 2 | Terminal-output state parsing | pass. Effort comes from the status line only. |
| 3 | Blocking hook handler | pass. No hook path changed. |
| 4 | Bare tmux / `resize-pane` | pass. No tmux call was added. |
| 5 | Payload logging | pass. The one new log line (`effort.go`, 500 path) logs the error and the Muster session id only. |
| 6 | Empty-gauge dishonesty | pass. A null effort renders `(…)` when alive and nothing when dead; a null model still reads `unknown`. |
| 7 | Session identity on `session_id` | pass. Dismiss and all effort state key on the Muster id. |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass. The canary change is a static string needle. |

## Cycle 1 follow-up

| Cycle 1 item | Fix commit | Verified how |
|--------------|------------|--------------|
| correctness Critical 1 `[e2e-specs]`: unpolled `computed()` reads; `:440` passed vacuously | `d9042f33` | Diff read. `computed()` now throws on `""` (`helpers/effort.ts:337`) and every call site is inside `expect.poll`; a search finds no unpolled caller. `:440` now asserts the positive value (`.eff` colour === `.model` colour, `.model` matching `^rgb`). Repair 7 records a deliberate breakage turning it red. Gate green and ×10 soak green. |
| correctness Major 1 `[orchestrator]`: DIAG | `700e4a56` | Both diagrams read; see the DIAG row. `plan.md:406` now says 0016. |
| correctness Major 2 `[orchestrator]`: log `doc-delta:` lines missing from the delta | `700e4a56` | `plans/effort/doc-delta.md` § Amendments carries (a), (b) and (c); each is checked against the code in the DOC row. |
| correctness Minor 1 `[orchestrator]`: promote ingest | `700e4a56` | `plan.md:8-9`; the features-scope gate line is green. |
| browser Major 1 `[web-impl]`: `.eff` rebuilt every pass | `dd377598` | `writeModelText` and `writeEffort` keep the text node and `.eff` span and write only on a difference. Unit tests assert node identity and zero writes across passes. The E2E node-identity test (`:489`) was red against `dd377598~1`, per the Repairs row. |
| maintainability Major 1 `[orchestrator:decision]`: dismiss 404 | `3474b867`, `4a4cb649` | User decision B (`kb:adr/focus-effort-dismiss-404-uses-shared-body`). `effort.go` uses `parseSessionID` and `writeUnknownSession`, and the route has joined the byte-identical envelope table. The contract, protocol.md and the E2E all expect `unknown session id`. |
| maintainability Minors 1–3 | `dd377598`, daemon log | Their part to verify. In passing: `isNullableString` lives in `protocol/decode.ts` with a table test; Dismiss is wired in `focus.ts:159` through `deps.effort`; the size reasons are in daemon-implementation.md Fix Attempt 2. |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** `internal/server/CLAUDE.md`'s **Owns** line lists how the `/api/sessions` routes are split by feature: `launchcreate.go`, `actions.go`, `rail.go` and `rename.go`. It does not name `effort.go`, which owns `DELETE /api/sessions/{id}/effort-warning`. The list already left out `locate.go`, `reader.go` and `shells.go` before this plan, so this omission is not new. Whoever next edits that line could make it say "e.g." or make it complete.
2. **[note]** `docs/diagrams/web-components.md:51` counts "20 stateful per-feature controllers". After this cycle, `features/effort.ts` attaches no listener and holds no state; it only returns a `{dismiss}` handle that `focus.ts` wires. The module count (37) and the import edges are still true. Only the "stateful" label is now loose for this one module, so I am not raising it as DIAG drift.
3. **[note]** Repairs 6–8 (`test-specs.md`) are honest. Repair 6 keeps every value assertion and only polls it; repair 7 replaces a negative check that could pass vacuously with a positive one; repair 8 follows the user decision. Nothing was deleted, skipped or weakened.
