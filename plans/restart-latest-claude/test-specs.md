# E2E Test Specs: Restart Latest Claude

**Plan**: restart-latest-claude
**Mode**: fix (attempt 1, review cycle 1)
**Pack**: kb: pack 28920 words (budget 30000)
**Verdict**: pass
**Tests created**: 10
**Live run**: scoped gate 49/49 passing (claude-restart, cache-warmth, effort-header); soak claude-restart 100/100, cache-warmth 70/70

## Tests

Every test opens on an assertion the current tree cannot satisfy (the readout is a plain span today, with no `Claude Code update` button), so none is a regression pin; all are collection-only. `npx playwright test --list` prints `Total: 659 tests in 61 files` (9 in `claude-restart.spec.ts`), `tsc --noEmit` is clean and `sh scripts/e2e-lint.sh` prints `e2e-lint: clean`.

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/claude-restart.spec.ts | two idle behind sessions restart in place from the readout panel and a current bystander is untouched (E1, ...) | E1, REQ-4, REQ-7, REQ-8, REQ-13, D11 | Status posts at 2.1.316/2.1.317 against a stub installed at 2.1.318: readout button reads the oldest version, panel counts, dialog section and `Restart 2` label, POST ids and `done` result, both panes replaced with row and title kept, `claudeVersion` null then `behind:false` after new posts, notice gone, bystander pane untouched | ran-green: 9 passed; soak 90 passed |
| web/e2e/claude-restart.spec.ts | a working behind session confirmed in the dialog is queued, then restarted when its Stop reports no background tasks (E2, ...) | E2, REQ-4, REQ-5, REQ-9, REQ-13 | `Queue 1` label, `queued` result, `claude ↻1 queued`, panel lists the pending session with reason and has no Ignore / Restart… / cancel, Escape closes it; a Stop with no tasks restarts it once in place and the readout returns to `claude 2.1.318` | ran-green: 9 passed; soak 90 passed |
| web/e2e/claude-restart.spec.ts | a mixed batch restarts the free session at once and queues the busy ones, each restarting only when its own session is free (...) | REQ-4, REQ-5, REQ-8, REQ-9, REQ-13, D7, D11 | Free, working and idle-with-task sessions: sections, reasons, `Restart 1, queue 2`, done/queued split, panel queue list, B's Stop restarts only B, C stays pending until a Stop reports no tasks | ran-green: 9 passed; soak 90 passed |
| web/e2e/claude-restart.spec.ts | a pending restart survives a daemon restart, stays off the wire until the first installed-version result, then shows as queued and fires when the session becomes free (...) | REQ-2, REQ-6 (as amended), REQ-9, D10 | Stub `--version` held 6 s: after `daemon.restart()` the readout is `claude unknown`, the session is alive with `claudeVersion {running, behind:false}`, `restartPending:false`, no notice; on the first installed result the notice reads `claude ↻1 queued`, `behind:true`, `restartPending:true`, pane untouched; a Stop then restarts it in place | ran-green (fix 1): 49 passed scoped; soak 100 passed |
| web/e2e/claude-restart.spec.ts | a pending session that becomes free while its mark is held is not restarted until the first installed-version result, which then restarts it (REQ-6, REQ-9) | REQ-6 (as amended), REQ-9 | Same held window; the session's Stop arrives inside it: state idle, `restartPending:false`, pane unchanged after a 1 s hold; on release the free session restarts in place, notice gone, readout shows the installed version | ran-green (fix 1): 49 passed scoped; soak 100 passed |
| web/e2e/claude-restart.spec.ts | Ignore from the keyboard hides the behind notice, a reload in the tab keeps it hidden and a new tab shows it again (E3, REQ-10) | E3, REQ-10 | Ignore via focus + Enter, reload keeps hidden, a new page in the same context shows the notice | ran-green: 9 passed; soak 90 passed |
| web/e2e/claude-restart.spec.ts | Ignore hides only the behind part: a pending session's queued notice shows regardless (REQ-10, REQ-9) | REQ-10, REQ-9 | With one pending and one newly behind session, Ignore turns the label to `claude ↻1 queued`, kept across reload, panel has no Ignore/Restart… | ran-green: 9 passed; soak 90 passed |
| web/e2e/claude-restart.spec.ts | the whole restart is drivable from the keyboard and focus survives a render tick in the panel and the dialog (REQ-7, REQ-8) | REQ-7, REQ-8 | Focus + Enter on readout, Restart… and the confirm; tagged nodes survive a >1 s tick, the panel stays open, focus stays live and inside the dialog | ran-green: 9 passed; soak 90 passed |
| web/e2e/claude-restart.spec.ts | a session that goes idle while the dialog is open keeps its Restart when free row and is restarted at once on confirm (edge case 28, D5) | REQ-8, edge 28, D5 | Dialog keeps its predicted sections after a Stop; the daemon classifies at confirm (`done`, not `queued`) | ran-green: 9 passed; soak 90 passed |
| web/e2e/claude-restart.spec.ts | stopping or removing a queued session clears its pending mark with no restart, and a queued neighbour still restarts when free (REQ-5, D8, D11) | REQ-5, D8, D11 | Three queued sessions: Stop one (pending and version cleared, not resumed), Remove one (row gone), the third stays queued and restarts when freed | ran-green: 9 passed; soak 90 passed |

## Deleted Tests

None.

## Fixture Changes

- New `web/e2e/helpers/claude-restart.ts`: session setup (`openSession`: launch, enveloped `SessionStart`, status post at an older version, then idle / working / idle-with-task), `postRunningVersion`, `stopTurn`, wire/pane oracles and the readout, panel and dialog locators. Nothing existing was edited.
- The status post is `envelopedStatusLineFull` with its top-level `version` overridden. The `version` key's shape traces to kb:fact/status-version-matches-installed (status-line top-level string) and kb:fact/running-session-version-sources (carried on every post, including the pre-prompt ones). No new field is invented.
- The stub's installed version uses the existing `stubClaudeVersion` daemon option (`2.1.318`), via `test.use({ daemonOptions })`.
- The pane id is read fresh with `daemon.tmuxDisplay(target, "#{pane_id}")` rather than the memoised `tmuxPaneId`, because a restart replaces the pane under the same target.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1, REQ-3 | Daemon-level (D1, D3, D4). The wire and readout effects are exercised by every test's setup; a changing installed version cannot be induced in E2E (the stub's reply is fixed per daemon; the watch polls every 30 s) |
| REQ-2 | the two-idle-sessions test (null after restart), the daemon-restart test (kept) |
| REQ-4 | the two-idle test, the working-session test, the mixed batch, the idle-while-open test |
| REQ-5 | the working-session test, the mixed batch, the stop-or-remove test |
| REQ-6 | the daemon-restart test (held off the wire, released, queued, fires) and the held-then-free test (no fire inside the window, restart on release); "became free while the daemon was down" is Go-only, hooks cannot reach a dead daemon |
| REQ-7 | the two-idle test, the keyboard test |
| REQ-8 | the two-idle test, the mixed batch, the keyboard test, the idle-while-open test |
| REQ-9 | the working-session test, the mixed batch, the daemon-restart test, the Ignore-with-pending test |
| REQ-10 | E3 test, the Ignore-with-pending test (a newer installed version re-showing: W4 in Vitest) |
| REQ-11, REQ-12 | Render tests (R1, R6, R7) |
| REQ-13 | the two-idle (`Restart 2`), working (`Queue 1`), mixed (`Restart 1, queue 2`) tests |
| E1, E2, E3 | the first three tests named for them (E1, E2, E3) |

## Handoff

- Locators the plan does not pin are guesses to be checked at validate: the panel is found as the nearest ancestor of the head text `Claude Code 2.1.318` that mentions "Restart"; a panel count row and a dialog row are the parent of their label/title element (so label and count, or title and reason, must share one parent); a dialog section is `details` containing a `summary` with the text. Web-impl should keep title and reason as siblings in one row element, and the count beside its label in one row element.
- The notice button's visible text is matched by prefix (`^claude 2\.1\.316→318`, `^claude ↻1 queued`) because the installed 2.1.318 is above the verified range and the existing readout appends a status glyph.
- The keyboard test asserts that focus is live and, in the dialog, inside it. The plan does not say where focus goes when the panel opens, so it does not assert that the readout stays focused.
- No `/interface-probe` needed: the only wire field the specs synthesize beyond the existing builders is the status line's `version`, already measured.
- No change needed to `playwright.config.ts`, `fixtures.ts`, `gatelock.ts` or `e2e-lint.sh`.

## Notes

- Not covered at E2E, with the reason: a Resume half that fails or a Stop half that fails (D6, Go), the first-run delay (edge case 24), a newer installed version re-showing an ignored notice (W4, Vitest).
- Validate should run `make web-build build` first; the soak targets are `claude-restart.spec.ts` only (no existing spec was changed).


## Validate Attempt 1

Rebuilt (`make web-build build`), then `npm run e2e -- e2e/claude-restart.spec.ts`. First live run: 3 passed, 6 failed, all six being spec-helper defects (no product defect found). Both impl-reported defects were verified, and three more were found.

## Repairs

All in `web/e2e/helpers/claude-restart.ts` (plus the spec's pane-comparison calls); the product was not touched.

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | E1, mixed batch, idle-while-open, E2 | `dialogSection(...)` never matched (web-impl's report, confirmed: every section lookup timed out) | `has: dialog.locator("summary")` is evaluated relative to each `details`, so it searched for a dialog inside the details | `has: dialog.page().locator("summary", { hasText: label })` | REQ-8/REQ-13: section labels and counts. The absence assertions `dialogSection(dialog, "Restart when free").toHaveCount(0)` (E1) and `"Restart now"` (E2) were vacuously true before; proven red by temporarily changing E1's to `"Restart now"`: `Expected: 0, Received: 1`, then restored (status shows only the two spec files modified) |
| 2 | every test calling `expectRestartedInPlace` | `tmux display-message` threw `no server running` while a lone session's tmux server was gone between Stop and Resume (daemon-impl's report, confirmed) | the poll let the throw escape | the poll treats a tmux error as "not alive yet" | REQ-4/D11: the restart replaces the pane and the row comes back alive |
| 3 | E1, E2, mixed, idle-while-open, stop-or-remove | poll stuck on "not alive yet" / "pane missing" for 15 s although the row was alive (`tmuxTarget` `muster-1:@0` became `muster-1:@3`) | Resume mints a new tmux window id, and my helper kept polling the stale target from launch | the poll reads the row's current `tmuxTarget` and stores it back on the helper's session object for later oracles | the pane really is replaced and alive again |
| 4 | daemon-restart test | `Received: "same pane"` | after a lone session's restart the tmux server is new and its first pane is `%0` again, so pane id equality could not see the restart | new `paneIdentity` (`#{pane_id}/#{pane_pid}`) is the before/after oracle; the spec's pane snapshots use it | the pane process was replaced, strictly stronger than the id alone |
| 5 | mixed batch | `rs-mix-c: a restart clears the running version` received `{running:"2.1.316", behind:true}` | mid-restart (other sessions on the socket) tmux answers a killed target with empty fields instead of an error, so identity `"/"` differed from the old one and the poll declared "restarted" before the Stop ran | identity must match `/^%\d+\/\d+$/`, else "not alive yet" | the version and pending mark are asserted cleared only after a real new pane exists |

No assertion was deleted, skipped, or weakened.

## Handoff (validate)

- No request for web-impl's harness files; no plan defect found.
- Observation, no action needed: Resume mints a new window id (`muster-N:@a` to `muster-N:@b`), so any spec oracle must read the row's current `tmuxTarget` after a restart.

## Test Run Output

```
9 passed (9.3s)
90 passed (1.5m)   [make e2e-soak SPEC=e2e/claude-restart.spec.ts N=10]
npx playwright test --list: Total: 659 tests in 61 files
```

## Fix Attempt 1 (review cycle 1)

**Issues addressed**: code Critical 2 `[e2e-specs]` (cache-warmth upsert count); coverage of the Option B decision (pending marks held until installed known).

### Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | cache-warmth.spec.ts "a changed cache is broadcast as exactly one session upsert and an unchanged or absent one as none (REQ-21, REQ-23)" | 7 upserts where 6 expected | `postStatus` in `helpers/cache-warmth.ts` set `payload.version` only on posts carrying a cache; the final cache-less post carried the builder default `2.1.233`, which changed `claudeVersion.running` and, per REQ-1/D1, is one upsert. The fixture was dishonest: one process never changes version mid-life (kb:fact/running-session-version-sources) | `postStatus` sets `version` on every post (`2.1.296`, or `2.1.299` for a `5m` cache), with or without `prompt_cache` | REQ-21/REQ-23 unchanged: one upsert for a changed cache, none for a repeated or absent one, and the wire cache untouched after the absent post. The test body is not edited |

The sweep the reviewer asked for: `rg -n "sessionUpsert|framereceived" web/e2e` finds upsert counting only in `cache-warmth` (via `trackUpserts`) and `effort-header` (via `trackEffortUpserts`); the others (`terminal`, `reader`, `card-location`, `masthead-indicators`) do not count session upserts per status post. Every status post in `effort-header` goes through `postEffort`, which sets `2.1.300` on all of them (`rg -n 'ingestURL\("status"\)|envelopedStatusLine|postStatus' e2e/effort-header.spec.ts e2e/helpers/effort.ts` shows only that one builder), so it does not mix versions. `effort-header.spec.ts` ran in the scoped gate: all passed. `cache-warmth.spec.ts`'s other tests do not count upserts and passed too.

No assertion was deleted, skipped, or weakened.

### Coverage added (Option B, REQ-6 as amended)

`claude-restart.spec.ts`: the daemon-restart test now asserts the journey as it is, held then released then fired (it previously asserted `behind:true` and `restartPending:true` straight after the restart, which the hold makes false), and a second test covers a session that frees inside the window. Both use `startDaemon({ stubClaudeVersion, stubClaudeVersionDelaySeconds: 6 })` (existing seam) so the hold window is observable; `claude unknown` on the readout is the oracle that the window is still open, so a late assertion fails rather than passing vacuously. The first daemon start is also delayed 6 s, which the session setup waits out through web-first expects (tests take about 13 s).

### Handoff

None. (`MUSTER_GATELOCK_WAIT` is not read by `bin/gatelock`; the wait is its `--wait` flag, which `make e2e` does not pass, so a held lock was waited out with `bin/gatelock run --exclusive --wait 9m -- make e2e-run ...`.)

### Test Run Output

```
scoped (claude-restart + cache-warmth + effort-header): 49 passed (35.0s)
make e2e-soak-run SPEC=claude-restart.spec.ts N=10: 100 passed (2.1m)
make e2e-soak-run SPEC=cache-warmth.spec.ts N=10: 70 passed (1.3m)
npx playwright test --list: Total: 660 tests in 61 files
```
