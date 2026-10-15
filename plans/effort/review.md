# Review: effort

**Plan**: effort
**Verdict**: approved
**Cycle**: 2
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code approved, browser approved, maintainability approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Effort

**Plan**: effort
**Part verdict**: approved
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

## Browser review

# Browser review: Effort

**Plan**: effort
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 14240 words (budget 30000)
**Rig**: `make web-build build` under the gate lock at 7c30b541 (dirty only in the orchestrator's `plans/effort/` files); scratch daemons from `helpers/fixtures.ts` (`$TMPDIR/muster e2e-*`, a data dir with a space, `tmux.sock` inside it, torn down per test), stub `claude` from `helpers/daemon.ts`, headless Chromium through a throwaway spec (now deleted). `git status --porcelain` shows nothing of mine, and no scratch daemon or directory is left behind.

Gate log `GATES_LOG_DIR=…/gates-effort-c2`: 0 failed lines. `17-e2e.log` reads `905 passed (9.0m)`, so the build I drove is the build that ships.

Cycle 1's browser Major 1 is fixed. I measured it below (REQ-8, node identity).

## Matrix

There are four hosts: **focus**, **tiles**, **dialog** (the launch dialog, opened from each view) and **pop-out** (`/doc.html`). The plan puts the effort readout and the strip in the Focus mainhead only (§ Out of scope, § Views), so the tiles and pop-out cells for header rows are N/A. The viewport is 1280×900 unless a cell says otherwise.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | dialog (focus) | no data | Effort row sits between Model and Start in | pass | radiogroup boxes in y order: Model 591–616, Effort 627–652, Start in 663–688; all inside dialog 280,148–1000,753 |
| REQ-1 | dialog (tiles) | no data | same | pass | identical boxes: Model 591–616, Effort 627–652, Start in 663–688 inside 280,148–1000,753 |
| REQ-1 | dialog (focus/tiles) | no data | six segments visible, in order | pass | labels `default low medium high xhigh max`, x 382–697, y 628–651; each computed `display:block; visibility:visible; opacity:1`; legend `Effort` |
| REQ-1 | dialog (focus/tiles) | 620px tall | Launch reachable | pass | `#launch-dialog` `overflow-y:auto`, scrollHeight 603 > clientHeight 582; after scrollIntoView, Launch is at 918,576–983,601, inside the viewport |
| REQ-1 | dialog (Resume tab) | data | Resume tab gains no Effort row | pass | radiogroup box 0×0, `checkVisibility()` false; ancestor chain `div.seg-track` → `fieldset.seg` (`contents`) → `div.fields[hidden]` computed `display:none` |
| REQ-1 | dialog (focus/tiles) | data | keyboard operable, keeps focus | pass | clicked `low`, pressed ArrowRight: active radio `medium`, checked; the same node is still `document.activeElement` and checked after 1.3 s, in both views |
| REQ-2 | dialog (focus/tiles) | data | the keyboard-chosen level is what spawns | pass | tmux `#{pane_start_command}` carries `--effort medium` from each view |
| REQ-4 | dialog (focus/tiles) | data | reopening on the directory restores the level | pass (settled) | 6/6 fresh runs (3 per view) read `xhigh` at open and 1.5 s later; 6/6 second launches on a remembered directory (pointer, keyboard, with and without a Recent click) restore `medium`. See Note 1 for the transient before repos arrive |
| REQ-4 | dialog (focus/tiles) | data | a Recent click restores the level over a pick | pass | picked `max`, clicked the directory's Recent: `medium` checked |
| REQ-6 | focus | no data (alive, no post) | `<model> (…)` | pass | `.model` `claude-haiku-4-5-20251001 (…)`, `.eff` ` (…)`, wire `effort:null` |
| REQ-6 | focus | no data (dead, never reported) | model with no brackets; header does not move | pass | text `claude-haiku-4-5-20251001`, 0 `.eff`; `.model` width 196.42 both alive and dead (the `holds-eff` reservation) |
| REQ-6 | focus | data | `<model> (<level>)` | pass | `Opus 4.5 (high)`, then `Opus 4.5 (medium)`, `Opus 5.5 (medium)`, `Opus 4.5 (low)` as posts change it |
| REQ-6 | focus | data (no-effort model) | bare model | pass | innerHTML `Haiku 4.5`, 0 `.eff`, `::after` content `none` |
| REQ-6 | focus | data (dead, reported) | keeps the last-known level | pass | after End: `Opus 4.5 (low)` |
| REQ-6 | focus | data (Resume tab, null model) | `unknown` then brackets | pass | `unknown (max)`; argv `--effort max`; no strip |
| REQ-6 | tiles / pop-out | any | — | N/A — plan § Out of scope: no effort on tiles; the pop-out shows the reader only | |
| REQ-6/R4 | focus | data, windows 1440/1000/800/700/640/616 | the model never truncates | pass | `.model` scrollWidth = clientWidth (102/102) at every width; `.eff` right = `.model` right (e.g. 602/602 at 616); document scrollWidth = clientWidth at every width |
| REQ-6/8 | focus | data | `.eff` node and the model text node are stable across passes (cycle 1 Major 1) | pass | MutationObserver on `.model` (childList, subtree, characterData, attributes): **0 mutations** in 2.5 s with no post, 3.5 s warned, and 1.5 s after a repeat post of the same level; the tagged `.eff` and the text node are the same and connected |
| REQ-6/8 | focus | data | each change touches only what changed | pass | level change: one childList swap inside `.eff` (` (high)` → ` (medium)`); model change: one characterData `Opus 4.5` → `Opus 5.5`; Dismiss: one attribute `eff warn` → `eff`; the node is the same in every case |
| REQ-7/8 | focus | data (clamped) | strip sentence | pass | `Asked for max — Opus 4.5 started at high.` |
| REQ-7/8 | focus | data (no effort) | strip sentence | pass | `Asked for high — Haiku 4.5 has no effort setting, so it started without one.`; header `Haiku 4.5`, no `.eff` |
| REQ-8 | focus | data | strip under the mainhead, above the slot, full width | pass | mainhead 300,46–1280,126; strip 300,126–1280,160; slot 300,160–1280,694; xterm 300,160–1280,688 |
| REQ-8 | focus | data | strip and tint visible | pass | strip computed `display:flex; visibility:visible; opacity:1`; `.eff.warn` colour rgb(232,207,90) = `--warn` (Instrument) |
| REQ-8/12 | focus | data, Instrument / Dark / Light | strip and tint use the warn tokens; `--warn` is not amber | pass | Instrument `.eff` 232,207,90 = `#e8cf5a`, bg 74,65,22 = `#4a4116`, fg 251,239,184 = `#fbefb8`; Dark 227,205,87 / 64,58,26 / 246,236,192 = `#e3cd57/#403a1a/#f6ecc0`; Light 97,83,0 / 251,241,194 / 90,74,0 = `#615300/#fbf1c2/#5a4a00`; `--warn-line` defined in all three; `--amber` differs (`#f2a33c`, `#e6a642`, `#844800`) |
| R4 | focus | data, windows 1440 → 616 | Dismiss stays in view; the strip does not overflow | pass | Dismiss x 1365–1426 at 1440 … 541–602 at 616; strip scrollWidth = clientWidth at every width (316/316 at 616); the strip wraps from 34px to 43px at ≤700 |
| REQ-8 | tiles | data (warned) | no strip outside Focus | pass | `#effort-strip` box 0×0 (its Focus container is hidden); `Asked for` absent from `innerText` |
| REQ-8 | pop-out | — | — | N/A — plan § Views: Focus only | |
| REQ-8 | focus | data, after Dismiss | the hidden strip is really hidden | pass | `hidden=true`, computed `display:none` |
| REQ-9 | focus | data | pointer Dismiss clears the strip and the tint | pass | strip `display:none`, `.eff` class `eff`, colour 166,171,188, wire `effortWarning:null`, effort `medium` kept |
| REQ-9 | focus | data | keyboard Dismiss keeps focus across a tick, then Enter clears it | pass | the tagged Dismiss is still `document.activeElement` after 1.3 s; Enter → strip `display:none`, wire `effortWarning:null` (focus then drops to `BODY`, Note 2) |
| REQ-9 | focus, second window | data | the strip goes in every window | pass | window 2's strip `Asked for xhigh — Opus 4.5 started at high.` before; count 0 after window 1's Dismiss; window 2 header `Opus 4.5 (high)`, class `eff` |
| REQ-9 | focus | data, two warned sessions | the bystander keeps its warning | pass | after B was dismissed, A reads `Asked for max — Opus 4.5 started at high.`, `.eff warn` |
| REQ-10 | focus | data (Stop → Resume) | level kept; the spawn carries it | pass | dead `Opus 4.5 (low)` → Resume → argv `--effort low`, header `Opus 4.5 (low)`, wire effort `low` |
| REQ-11 | dialog → focus | data | Resume-tab spawn and seed from the transcript's last line | pass | transcript efforts `[medium, max]` → argv `--effort max`, header `unknown (max)` before any post, no strip |
| REQ-13 | focus (claude surface) | data | the pane refits when the strip appears and goes | pass | note vs tmux `#{window_width}x#{window_height}`: 130×23/130x23 → 130×22/130x22 with the strip; a second run 24 → 23 → 24, tmux equal at each read |
| REQ-13 | focus (claude surface) | data, windows 1440 → 616 | the refit holds at width with the strip wrapped | pass | note = tmux at every width (151×26, 93×25, 93×25, 53×25, 45×24, 41×24) |
| REQ-13 | focus (shell surface) | data | same, for the shell pane | pass | shell target `muster-<id>-shell`: 130×24 → 130×23 with the strip → 130×24 after Dismiss, the note equal each time; xterm viewport 576 → 552 → 576 (closes cycle 1 Note 2) |
| REQ-13 | focus (docs surface) | data | the reader sits under the strip | pass | strip 300,95–1280,129; `section.reader` 300,129–1280,720 |
| REQ-12 | all | — | the token family is present | pass | four tokens resolve in all three themes (theme row above); `make contrast` is gate line `07`, green |
| Edge 16 / E11 | focus | data, reload and daemon restart | the warning survives | pass | after `page.reload()` and after `daemon.restart()`: `Asked for max — Opus 4.5 started at high.`, `.eff warn`, `Opus 4.5 (high)` |
| Edge 4 / E13 | focus | daemon-down (SIGTERM) | header and strip keep their state; banner is prominent | pass | `role=alert` banner 0,46–1280,78 full width, `display:block; opacity:1`: `musterd unreachable — hook output in open panes is Muster's absence, not session failure.`; header `Opus 4.5 (high)`, `.eff warn`, strip `display:flex` |
| States § daemon down | focus | daemon-down | a failed Dismiss leaves the strip and reports in the action-error line | pass | strip still `flex`; `#action-error` `display:block` reads `Could not reach musterd.` 1.5 s later |
| States § daemon down | focus | daemon back | — | note | `#action-error` still reads `Could not reach musterd.` 2 s after reconnect (Note 3) |
| REQ-1 | dialog | daemon-down | — | N/A — the plan leaves the dialog's daemon-down behaviour unchanged, and the Effort row is static markup | |
| §6 honesty | focus | all | no fake value for unknown effort; no Done; no cost | pass | unknown reads `(…)`, a placeholder rather than a fake value; a no-effort model shows no brackets rather than a guessed level |
| §7 terminal | focus | data | one live client; geometry moves on refit; scrollback 0 | pass | `totalAttachedClients()` = 1 at every read; the note says `one live client · geometry owned by this pane`; after 60 Enter presses, the xterm viewport scrollHeight 552 = clientHeight 552 (no scrollback) |

## Issues

### Critical

(none)

### Major

(none)

### Minor

(none)

### Notes

1. **[note]** For a moment after it opens, the launch dialog can show Effort `default`. Sometimes it is already on the remembered directory, sometimes no directory is pressed yet. Within 1.5 s it settles on the remembered level (seen in 4 of 6 opens in one flow, settled `medium` in all 6). This is the repos fetch arriving after the open, and REQ-4 deliberately keeps a pick made in that window. The settled state is correct, so I raise no defect (kb:adr/process-transient-displays-not-oracles). A spec that reads the checked radio straight after `toBeVisible()` without a web-first wait would flake on it.
2. **[note]** Carried from cycle 1: when a keyboard user presses Dismiss, the strip hides and focus drops to `<body>`. The plan names no place for focus to go. A candidate for a follow-up.
3. **[note]** Carried from cycle 1, measured again: after a failed daemon-down Dismiss, `#action-error`'s `Could not reach musterd.` stays up after the daemon is back (still shown 2 s after the banner hid), until the next action replaces it. The plan sets no rule for this. It is the existing action-error line's behaviour, not new in this plan.
4. **[note]** Carried from cycle 1: on a dead session the effort shows its last-known value (`Opus 4.5 (low)`) with no age. The plan defines the value as last-known and display-only, so no defect.
5. **[note]** Not measured: header widths below a 616px window. The 300px rail leaves the existing header overflowing at 400 and 316 regardless of this plan (cycle 1 Note 5).

## Maintainability review

# Maintainability review: Effort

**Plan**: effort
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 23037 words (budget 30000)
**Scope**: 43 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (full review). Nine of them changed since cycle 1's commit `12c84dd5`: `internal/server/effort.go`, `web/src/api/launch.ts`, `web/src/features/effort.ts`, `web/src/features/focus.ts`, `web/src/main.ts`, `web/src/protocol/decode.ts` (new to the diff), `web/src/render/mainhead.ts`, and two generated or hand-written CLAUDE.md files. I re-read each of those against its siblings. The other 34 files are byte-identical to cycle 1, so their cycle 1 results carry over unchanged.

## Cycle 1 items

| Cycle 1 item | Fix commit | Verified how |
|---|---|---|
| Major 1 `[orchestrator:decision]`: the dismiss route's own 404 | `ad6c01d3` (contract, option B by decision), `3474b867` | `effort.go:27-35` now calls `parseSessionID(w, r)` and `writeUnknownSession(w)`, the same as `rename.go:49`. The constant, the helper and the `strconv` import are gone. `rg -n 'msgEffortUnknownSession\|writeEffortUnknownSession' internal` finds nothing. |
| Minor 1 `[web-impl]`: local `isNullableString` | `dd377598` | `rg -n isNullableString web/src --glob '!*.test.ts'` finds one definition (`protocol/decode.ts:31`, beside `isString`). `api/launch.ts:106-175` uses it at all eight nullable-string sites, and no inline spelling is left in the file. Web lint is clean (`06-web-lint.log`: "No fixes applied"). |
| Minor 2 `[web-impl]`: Dismiss wired outside `focus.ts` | `dd377598` | `features/effort.ts` now attaches nothing and returns `{ dismiss(id) }`. `focus.ts:159-164` attaches the `.dismiss` listener beside Stop/Resume (`:147`), Remove (`:151`) and the group button (`:154`) through structural `deps.effort`. `main.ts:60` builds `effort` before `focus`, which is `rename`'s shape. The `design:` line at `web-implementation.md:80` withdraws the old one and cites `rename.ts`, which now matches. |
| Minor 3 `[daemon-impl]`: size Decisions stale or incomplete | Fix Attempt 2 in `daemon-implementation.md` | Every daemon hit in `16-size.log` is listed with main→branch numbers that match the log: `session.go` filelen 514, `UpdateSession` 64, `scanSession` 66, `claudecodetest.go` 651, `New` 49, `launcher.go` 624 / `Resume` 42, `launchResume` 69, `manager.go` 628. Each reason holds; see Note 1 for one clause that goes further than the code. |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/claudecodetest/claudecodetest.go | transcripts.go | n/a (test helper) | filelen 651 (main 641); reason given and holds (one home for the builders) | pass |
| internal/claudecode/claudecodetest/transcripts.go | claudecodetest.go | n/a | none | pass |
| internal/claudecode/launch.go | (own `PermissionModes`/`ValidPermissionMode`) | n/a | none | pass |
| internal/claudecode/launchtranscripts.go | (own `model` scan) | no | none | pass (cycle 1 Note 6 stands) |
| internal/claudecode/status.go | (own `interpretPromptCache`) | no | none | pass (Note 4) |
| internal/server/CLAUDE.md | — | n/a (generated trailer) | none | pass (Note 5) |
| internal/server/effort.go | rename.go, respond.go | yes (Fix Attempt 2: reuses `parseSessionID`/`writeUnknownSession`) | none | pass |
| internal/server/launcher.go | launcherpast.go | yes | funlen `Resume` 42, filelen 624: already over, reason holds | pass |
| internal/server/launcherpast.go | launcher.go | yes | funlen `launchResume` 69: already over, reason holds | pass |
| internal/server/repos.go | — | n/a (one field) | none | pass |
| internal/server/server.go | — | n/a (one `register` line) | funlen `New` 49: reason holds (one registration per feature, § Composition roots) | pass |
| internal/server/sessionwire.go | (own `sessionWireCache`) | n/a | none | pass |
| internal/session/CLAUDE.md | — | n/a (generated trailer) | none | pass |
| internal/session/actions.go | reconcile.go | n/a (one line) | none | pass |
| internal/session/apply.go | status.go | n/a | none | pass |
| internal/session/effort.go | manager_rail.go, status.go, row.go | yes | none | pass |
| internal/session/manager.go | — | yes | filelen 628 (main 623), reason holds | pass |
| internal/session/reconcile.go | actions.go | n/a (one line) | none | pass |
| internal/session/row.go | (own row mappers) | n/a | none | pass |
| internal/session/session.go | neighbouring field declarations | yes | none | pass (Note 3) |
| internal/session/status.go | apply.go | n/a | none | pass (Note 4) |
| internal/session/writeorder.go | — | yes | none | pass |
| internal/store/CLAUDE.md | — | n/a (generated trailer) | none | pass |
| internal/store/migrations/0016_effort.sql | — | n/a | none | pass |
| internal/store/repo.go | session.go | yes (`repoColumns`) | none | pass |
| internal/store/session.go | repo.go, store.go (`encodeTime`) | yes | filelen 514, funlen `UpdateSession` 64 (new), `scanSession` 66 (already over); reasons hold for the plan's lines | pass (Note 1) |
| web/src/api/launch.ts | protocol/decode.ts, protocol/session.ts | n/a (fix to cycle 1 Minor 1) | none | pass |
| web/src/api/sessions.ts | (own `putSessionsGroup`) | n/a | none | pass |
| web/src/features/CLAUDE.md | — | n/a | none | pass |
| web/src/features/effort.ts | rename.ts, focus.ts | yes (`web-implementation.md:80`) | none | pass |
| web/src/features/focus.ts | rename.ts, render/mainhead.ts, render/dead.ts | yes (same line) | none | pass (Note 2) |
| web/src/features/launch.ts | launchrestore.ts | yes | filelen 824 (main 796), reason holds | pass |
| web/src/features/launchrestore.ts | launch.ts, sessions/permission.ts | yes | none | pass |
| web/src/main.ts | — | n/a (one `init` line, moved before `focus`) | none | pass |
| web/src/protocol/decode.ts | api/launch.ts, protocol/session.ts | n/a (one primitive beside `isString`) | none | pass (Note 6) |
| web/src/protocol/session.ts | protocol/decode.ts | yes | none | pass (Note 6) |
| web/src/render/effortstrip.ts | render/mainhead.ts | yes | none | pass |
| web/src/render/mainhead.ts | effortstrip.ts, own `renderStopResume` | yes (`web-implementation.md:81`) | none | pass |
| web/src/sessions/CLAUDE.md | — | n/a (generated trailer) | none | pass |
| web/src/sessions/card.ts | sessions/effort.ts | yes | none | pass |
| web/src/sessions/effort.ts | sessions/permission.ts | yes | none | pass |
| web/src/sessions/testfixtures.ts | — | n/a | none | pass |
| web/src/style.css | `.banner` (style.css:488) | n/a | none | pass (cycle 1 Note 7 stands) |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** In Fix Attempt 2, the `UpdateSession` reason says "There is no logic to extract". That is true of the lines the plan added (six columns and six arguments). It is not true of the whole function: `internal/store/session.go:295-322` has five copies of the nil-check `encodeTime(*row.X)` block. The decode side already has a helper for this (`decodeRowTimePtr`, `:425`), and `rg -n 'encodeTime\(\*' internal/store` finds no encode-side twin. Those five blocks are older than the branch, and the reason holds for what this plan changed. If the warning should ever go, an encode helper that mirrors `decodeRowTimePtr` is the real restructure. That is follow-up work, not a fix for this plan.
2. **[note]** The Dismiss button is found inline at `features/focus.ts:159` (`requireElement(".dismiss", mainheadElements.effortStrip)`). The other controls focus wires are fields on `MainheadElements` (`stopResumeBtn`, `removeBtn`, `groupBtn`) or `DeadSurfaceRefs` (`resumeBtn`). This is defensible: `MainheadElements` is what `renderMainhead` writes to, and render never touches the button. The button is static markup (`index.html:120`) that `renderEffortStrip` never replaces (it rewrites only `.sentence`), so the listener survives every pass. Also, every other `FocusDeps` member has a doc line naming its init-order guarantee, and `effort` (`focus.ts:70`) now has none: comment pass cycle 2 (`7c30b541`) dropped it. Comments belong to the comment pass.
3. **[note]** Cycle 1 Note 3 still stands. The three new `Session` fields at `internal/session/session.go:206-208` (`Effort`, `EffortWarning`, `effortRequested`) have no declaration comment naming their writers and `Manager.mu`, unlike every neighbour (`:197-204`). The guard itself is sound: every writer runs under `Manager.mu`, and `make test-race` passed (`02-test.log`). This belongs to the comment pass.
4. **[note]** Cycle 1 Note 4 still stands. These are comment-pass items: `StatusUpdate`'s "every field is nil when the payload didn't carry it" is no longer true for `Effort`, because `interpretEffort` (`claudecode/status.go:198-204`) never returns nil. The immutable-snapshot lists in `session/status.go:20-22` and `Session.Clone` leave out the effort fields.
5. **[note]** The hand-written **Owns** line of `internal/server/CLAUDE.md:3` lists the `/api/sessions` routes by file, "`rail.go` (pin, order), `rename.go` (title)", and does not mention `effort.go` (the effort-warning dismiss). Doc truth belongs to review-work.
6. **[note]** `protocol/decode.ts:31` now exports `isNullableString`, but `api/launch.ts` is its only consumer. About 20 sites across `protocol/session.ts`, `protocol/update.ts`, `protocol/usage.ts`, `protocol/hello.ts`, `api/update.ts` and `api/reader.ts` still spell `x !== null && typeof x !== "string"` inline (`rg -n '!== null && typeof \w+ !== "string"' web/src --glob '!*.test.ts'`). Three of those are new on this branch (`protocol/session.ts:283,293,294`, the effort decode), and they match the inline spelling of every other site in that file. Converting only those three would split the file's spelling. A tree-wide sweep onto the helper is a follow-up the orchestrator can propose.
7. **[note]** `render/mainhead.ts`'s `writeModelText`/`writeEffort` compare against the live DOM and write only on a difference. That matches the file's own `renderStopResume` (`if (btn.textContent !== view.label)`) and the "never rebuilt" contract in `renderMeta`'s doc comment. The `design:` line (`web-implementation.md:81`) gives the reason it differs from `effortstrip.ts`'s `dataset` signature.
8. **[note]** Size log: `internal/store/session_test.go:181` `TestUpdateSession_RoundTripsEveryField` has 111 statements, which is a funlen hit in a test file. `16-size.log` has no `dupl` line, so no test-body duplication is named and nothing is filed.
