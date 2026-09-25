# Review: settings-update-failures

**Plan**: settings-update-failures
**Verdict**: approved
**Cycle**: 4
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code approved, browser approved, maintainability approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Settings Update Failures

**Plan**: settings-update-failures
**Part verdict**: approved
**Cycle**: 4
**Pack**: `kb: pack 26048 words (budget 8000)` — WARN pack exceeds budget of 8000 words

This is a §9 delta re-review. Cycle 3's only open agent-tagged issues were maintainability Minors 1 and 2. I read `git diff 8f0dc8e..HEAD` (the cycle-3 review commit to `218b109`). Outside `plans/`, the diff touches:

- `internal/selfupdate/failure.go`: one comment.
- `web/src/features/connection.ts`, `web/src/features/updaterestart.ts`, `web/src/main.ts`, `web/src/wsapp.ts`: Minor 1's stated scope.
- `web/e2e/update.spec.ts`: one comment.

Nothing touches non-test code under `web/src/`, `internal/` or `cmd/` beyond a Minor's scope, so I skipped the §3–§6 re-read. The cycle-3 correctness tables still hold. Below I re-check only what the diff could affect.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 – REQ-15, REQ-17 – REQ-19 | Unchanged since cycle 3. No behavioural diff in their code. `failure.go` changed a comment only | Unchanged | pass (as in cycle 3) |
| REQ-16 reload on first hello, mismatch included; no mismatch screen | Yes. The suppression moved from `wsapp.ts` into `connection.ts` `showProtocolMismatch()` (`if (deps.reloading()) return;`, `:175`). `main.ts:85-88` passes `reloading: updateRestart.reloading`. That is a closure over `reloaded` (`updaterestart.ts:185-187`) with no `this`, so passing it unbound is safe, like `bannerOverride`. `doc.ts` still registers `coreWsHandlers`, which has no mismatch handler, so the pop-out is unaffected | Yes. E2E `update.spec.ts:1386` "reloads on a mismatched-protocol reconnect without ever showing the mismatch screen" passes in `15-e2e.log` | pass |
| DIAG | `kb:diagram/web-components`, the only record `kb for` names for `wsapp.ts`/`connection.ts`. The change removes `wsapp.ts`'s type import of `UpdateRestartHandle` and adds no module or directory edge. The diagram still draws `main → wsapp`, `wsapp → app`, `wsapp → ws`. The plan's inline state diagram doesn't name which module gates the mismatch | — | pass |

## Build & Tests

E2E tests: pass (454/454, `15-e2e.log`) · Daemon tests (race): pass (every package `ok`, `02-test.log`) · Web tests: pass (74 files / 1803, `05-web-test.log`) · Daemon build: pass (`01-build.log` empty) · Web build: pass (`04-web-build.log`, which includes `tsc --noEmit`; only the existing chunk-size warning) · Lint: pass (golangci-lint 0 issues; Biome 251 files clean). All read from `$GATES_LOG_DIR` = `gates-settings-update-failures-c4`, 0 failed lines. The `14-size.log` WARN lines are maintainability's.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D20 | `make test` | pass (deduped to baseline `go test -race -count=1 ./...`, `02-test.log`) |
| D21 | `make lint` | pass (deduped; `03-lint.log` 0 issues) |
| D22 | `make test-race` | pass (`02-test.log`) |
| D23 | `! rg -n "not installed by the muster installer" internal cmd web/src web/e2e` | pass (`16-D23.log` empty) |
| W20 | `make web-build` | pass (`04-web-build.log`) |
| W21 | `make web-test` | pass (`05-web-test.log`, 1803 passed) |
| W22 | `make web-lint` | pass (`06-web-lint.log`) |
| W23 | `make contrast` | pass (`07-contrast.log`: 43 pairs × 3 themes, 0 failures) |
| E20 | `make e2e` | pass (`15-e2e.log`, 454 passed) |
| K1 | `make check-kb` | pass (`10-kb-check.log`: 436 records, 0 problems) |
| gates | versions, e2e-honest, dead-refs, e2e-lint, features-scope | pass (`08` fresh, `09` empty, `11` 0 missing, `12` clean, `13` update/connection/surfaces) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. The cycle-3 fix logs add no `deviation:` or `doc-delta:` line. Web Fix Attempt 3 has one `design:` line, and daemon Fix Attempt 4 has none. Both cited ADRs exist, are `proposed`, and carry `refs: plan:settings-update-failures`: `kb:adr/update-restart-reloads-dashboard` and `kb:adr/update-failure-one-sentence-chain-in-log`. No Doc Delta sentence names which module gates the mismatch, so every sentence stays true |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W8 | no `any` in new web code | pass | The cycle-4 web diff adds no `any`; it adds one boolean method and one guard |
| W9 | `#banner` has one writer, `features/connection.ts` | pass | The diff doesn't touch banner writes. `updaterestart.ts` still crosses only as data through `ConnectionDeps` |
| W10 | restarting keeps `--banner-*`; confirmation neutral | pass (unchanged; `style.css` untouched) | — |
| W11 | restarting banner seen during a real Update and restart | review-browser's | — |
| D14 | `install` read under `mu`; race test | pass (unchanged; `updatemanager.go` untouched; `internal/server` ok under `-race`) | — |
| D15 | no Go file outside `internal/selfupdate` composes release-host failure text | pass (unchanged; the only Go change is a comment inside `internal/selfupdate`) | — |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: diff adds no Claude Code field names |
| 2 | Terminal-output state parsing | pass: none |
| 3 | Blocking hook handler | pass: no hook code touched |
| 4 | Bare tmux / `resize-pane` | pass: no tmux touched |
| 5 | Payload logging | pass: no log lines added |
| 6 | Empty-gauge dishonesty | pass: no rendering branch added besides the no-op guard |
| 7 | Session identity on `session_id` | pass: not touched |
| 8 | Settings trespass | pass: none |
| 9 | Real `claude` outside canary/probes | pass: none |

## Delta

| Prior Minor | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 3 maintainability Minor 1 `[web-impl]` "mismatch-screen suppression decided in two places: `wsapp.ts` and `connection.ts`" | `c829d15` (+ `6d2d505`, E2E comment) | Diff read. The review's first option was taken. `ConnectionDeps` gains `reloading()`, `showProtocolMismatch()` checks it first, and `wsapp.ts:84` is now the plain relay `onProtocolMismatch: () => connection.showProtocolMismatch()`. `dashboardWsHandlers` lost its `updateRestart` parameter and import. The headers now agree: `connection.ts:4-7` claims the decision, `updaterestart.ts:4-8` names `ConnectionDeps` as the one contact point for both methods, and `wsapp.ts:5-6` ("only calls into whatever `WsAppConnection` the caller already built") is true again. The cycle-3 maintainability Note 1 is settled by this. `rg` shows no leftover reference to the old gate in `web/src` or `web/e2e`. No other behaviour changed. The E2E guard test passes (`15-e2e.log`, test 438) |
| cycle 3 maintainability Minor 2 `[daemon-impl]` "plan-scoped `INV-2` id in `failure.go:77-78`" | `eb9aada` | Diff read. The comment now states the invariant ("no URL reaches the wire") and cites `kb:adr/update-failure-one-sentence-chain-in-log`, which exists. The review's own grep, `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts' \| grep '^+' \| grep -nE "REQ-[0-9]\|INV-[0-9]\|\bW[0-9]+\b\|\bD[0-9]+\b"`, now prints nothing. The code is unchanged |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[orchestrator]** `plans/settings-update-failures/plan.md:4` still reads `**Status**: blocked` (commit `74a256e`). Commit `e2a390c` reopened the run, and `orchestration-state.json` says `in-progress`. Flip the plan status back to match the state. This does not block approval.

### Notes

1. **[note]** Cycle 3 Note 2 still stands in its new form. The mismatch-suppression guard, now in `connection.ts` `showProtocolMismatch()`, has no unit test: no test constructs `initConnection`, and no `wsapp.test.ts` exists. The E2E at `update.spec.ts:1386` covers it. e2e-specs showed in cycle 2 that this E2E goes red with the gate reverted. No change requested.
2. **[note]** e2e-specs Fix Attempt 3 changed only the comment above the guard E2E test; its test body is byte-identical. Its Repairs section says no repairs were needed, which is correct. No flake was repaired, so §1's soak trigger doesn't apply.
3. **[note]** Cycle 3 Note 5 carries forward. The `kb:adr/update-install-kinds-decide-who-may-apply` citations in `internal/selfupdate/CLAUDE.md` and `cmd/musterd/main.go` need retargeting when the superseding ADR flips at Completion.

## Browser review

# Browser review: Settings Update Failures

**Plan**: settings-update-failures
**Part verdict**: approved
**Cycle**: 4
**Pack**: kb: pack 17586 words (budget 8000) — WARN pack exceeds budget of 8000 words
**Rig**: tree at 218b109. I ran `make web-build build`, giving `bin/musterd` v0.18.3-51-g218b109, and the helpers built `musterd` 0.1.0 and 0.2.0 from the same tree. Every cell got its own daemon from `helpers/fixtures.ts` `daemon`/`startDaemon`, each with:
- a space-bearing data dir `$TMPDIR/muster e2e-*`
- a private `<data dir>/tmux.sock`
- the helpers' stub `claude`

The release host was the helpers' `FakeReleaseServer`, plus a refused port (`127.0.0.1:1`) for the check-failure smoke test. Headless Chromium ran at 1280×720, driven by a throwaway `web/e2e/zz-rbprobe4.spec.ts`: 16 cells, all run, all passed, and the spec is now deleted. `git status --porcelain` shows none of my files; the three `??` entries are the other reviewers' parts and `doc-delta.md`. No `musterd` or `tmux` process is left.

The gates log (`-c4`, 0 failed lines; web-build green, e2e 454 passed) says the app I drove is the one that will ship.

**Scope.** The only change since cycle 3 that has a runtime effect is c829d15. It moves the check that suppresses the protocol-mismatch screen during the restart reload out of `wsapp.ts` `onProtocolMismatch` and into `connection.ts` `showProtocolMismatch`, reached through `ConnectionDeps.reloading`. `main.ts` now builds `ConnectionDeps` with two members and no longer passes `updateRestart` to `dashboardWsHandlers`. The `failure.go` change is a comment only.

I re-measured every cell that the moved check or the rebuilt deps object can reach:
- the reload-instead-of-mismatch race
- a real mismatch, which must still show the screen
- the restart banner and confirmation, which read `restartBanner` from the same deps object
- the ordinary daemon-down banner

I also ran one Settings status-line smoke test against the fresh binary. The instruments are cycle 3's:
- a context-level `MutationObserver` recorder (Node-side `Date.now()`, bound through `exposeFunction` so it survives reloads) on `#banner`, `#protocol-mismatch` and `#app`, logging computed display, colours, resolved `--banner-*` and neutral tokens, the boxes of banner, masthead and views, and `document.activeElement`
- a continuous `requestAnimationFrame` sampler that flags any frame where `#protocol-mismatch` is displayed or `#app` is not
- `load` events
- a `routeWebSocket` proxy that injects `update` messages, drops the server socket and rewrites the next hello's `protocolVersion` to 99

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-16 / edge 17 | focus | routed: record held, reconnect hello `protocolVersion: 99` | reloads *rather than showing* the mismatch screen | pass | P1 focus ×3: one `load` at 758–763 ms after the record. **0** unhidden `#protocol-mismatch`/`#app` mutations before unload (the only pre-`load` record is the fresh document's own attach report: `mmDisplay:none`, `appDisplay:flex`). **0** bad rAF frames, marker gone, no page errors. Final state: mismatch `display:none`, `#app` `display:flex` |
| REQ-16 / edge 17 | tiles | same | same | pass | P1 tiles ×3: `load` at 740–742 ms, 0 unhidden mismatch mutations, 0 bad frames, marker gone, `aria-pressed=true` on Tiles after the reload |
| REQ-16 / edge 17 | focus | record held, `sessionStorage` accessor throws, proto 99 | reloads, no mismatch frame, no page error | pass | X5: one `load` at 743 ms, 0 unhidden mismatch mutations, 0 bad frames, `pageerror` list empty |
| Protocol mismatch (moved check must not swallow it) | focus | no record, proto 99 | mismatch screen shown, keeps focus, no reload | pass | P2: `#protocol-mismatch` `display:flex`, `visibility:visible`, `opacity:1`, box 0,0–1280,720, text `protocol changed — reload the dashboard`. `#app` `display:none`, `activeElement` = `protocol-mismatch` at 3 s, 0 loads, marker kept |
| Protocol mismatch | tiles | no record, proto 99 | same | pass | P2 tiles: identical values |
| Protocol mismatch / edge 20 | focus, tiles | record, then `failed` while connected (record dropped), proto 99 | mismatch screen shown, no reload | pass | P2b ×2: `display:flex`, `#app` `display:none`, focus on `protocol-mismatch`, 0 loads, marker kept |
| REQ-14 / W11 | focus | daemon-down (real Update and restart, dark) | restarting banner seen, exact text, alarm tokens, placed | pass | R1: shown at 447 ms, text `Updating musterd to v0.2.0 — restarting; hook output in open panes is Muster's absence, not session failure.`. `display:block`, bg/fg/border `rgb(59,32,32)/(244,185,185)/(92,47,47)`, equal to the resolved `--banner-bg/-fg/-line`. Box 0,46–1280,78 under masthead 0,0–1280,46 over `#view-focus` top 78, page `scrollWidth 1280 == clientWidth` |
| REQ-14 / W11 | tiles | daemon-down (real restart, two windows, light) | restarting banner in each window | pass | R2: p0 shown at 479 ms, p1 at 478 ms. `rgb(251,232,232)/(122,31,31)/(229,182,182)` equal the light tokens. Box 0,46–1280,78 over `#view-tiles` top 78 in both |
| REQ-14 | pop-out | any | — | N/A — `doc.html` has no `#banner` and registers only `coreWsHandlers`. `onProtocolMismatch`, `onHelloArrived` and `ConnectionDeps` are dashboard-only | |
| REQ-14 / REQ-17 | any | no data yet | — | N/A — no record can exist before an `update` message (plan § States). The first-snapshot hold (cycle 3 X3) runs through `updaterestart.ts` code that c829d15 did not change, so I did not re-measure it (Note 1) | |
| REQ-15 | focus, tiles | daemon-down 30 s | unreachable fallback | not re-measured — Note 1 | |
| REQ-16 | focus | real restart | reloads on first hello, no mismatch paint | pass | R1: restarting hidden at 3960 ms, `load` at 3982 ms, marker gone, 0 unhidden mismatch mutations, 0 bad frames |
| REQ-16 / edge 21 | tiles | real restart, two windows | each reloads, view kept | pass | R2: p0 `load` 2022 ms, p1 2013 ms. Both markers gone, both `aria-pressed=true` on Tiles, 0 bad frames in either |
| W7 | focus, tiles | reconnect | one reload per restart | pass | exactly one `load` per window in P1 ×6, X5, R1 and R2 ×2 |
| REQ-17 | focus | data (after real restart) | `Updated to v0.2.0.` for 3 s, then hidden | pass | R1: shown 3989 ms, hidden (`display:none`) at 7040 ms (3.051 s). Settings Running reads `v0.2.0` afterwards |
| REQ-17 | tiles | data (after real restart, two windows) | confirmation in both, 3 s | pass | R2: p0 2031→5082 ms (3.051 s), p1 2016→5068 ms (3.052 s) |
| REQ-19 / W10 | focus | data | neutral tokens, dark | pass | R1: class `banner neutral`, `rgb(31,34,40)/(193,197,204)/(58,63,73)` equal `--bg-raised`/`--fg-muted`/`--line-control`. Box 0,46–1280,78 |
| REQ-19 / W10 | tiles | data | neutral tokens, light | pass | R2: `rgb(251,250,247)/(65,69,79)/(203,201,194)` equal the light tokens, both windows |
| Banner daemon-down / INV-4 / edges 14, 23 | focus | daemon-down (SIGTERM, no record, default theme) | ordinary text, visible, placed, written once, no reload on return | pass | X2: shown at 15 ms, text `musterd unreachable — hook output in open panes is Muster's absence, not session failure.`. `display:block`, `rgb(58,30,30)/(243,183,183)/(90,44,44)` equal the resolved `--banner-*`. Box 0,46–1280,78 under masthead over `#view-focus` top 78. **0** mutations over 8 s down, 0 loads, marker kept. After the return: `hidden`, `display:none` |
| Banner daemon-down | tiles | same | same | pass | X2 tiles: shown at 39 ms with the same text and tokens, box 0,46–1280,78 over `#view-tiles` top 78, 0 mutations, 0 loads, `display:none` after the return |
| Banner hidden | focus, tiles | data (connected) | `[hidden]` resolves to `display:none` | pass | every hidden record in R1, R2 and X2 has computed `display:none` and box 0,0–0,0 |
| REQ-8 / REQ-10 (smoke) | Settings over focus | data | check failure equals the 502 body, no URL, contained | pass | S5: status `update check failed: couldn't reach the release host (connection refused)` = the 502 `check_failed` message. Status 437–843 inside dialog 420–860, dialog `scrollWidth 438 == clientWidth 438`, no `://` |
| REQ-1–3, other REQ-8 classes, REQ-9, edges 1–3/7 | Settings | data | — | not re-measured — Note 2 | |
| Edge 22 | focus, tiles | routed drop | Settings closes on the drop | not re-measured — Note 2 | |
| §7 one live client | focus / tiles | after the real reload | — | not re-measured — Note 2 | |
| REQ-4–7, 11–13 | — | — | — | N/A — daemon-side (review-work's). Their visible effects are the Settings rows | |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** I did not re-measure three things this cycle:
   - REQ-15's unreachable fallback at 30 s
   - REQ-17's first-snapshot hold and second-load no-show (cycle 3 X3)
   - edge 16's version-mismatched record

   They go through `computeBannerOverride` and the `updaterestart.ts` snapshot/handoff paths, and c829d15 changed only comments in `updaterestart.ts`. The `restartBanner` wiring they share is measured live in R1 and R2 above.
2. **[note]** I did not re-measure the Settings status-line rows beyond one smoke test, nor edge 22 or the §7 one-live-client check. Since cycle 3 (which passed all of them at 1280/800/390 with oracles), neither `render/update.ts`, `style.css`, `index.html` nor any daemon code has changed behaviour: the `failure.go` diff is a comment. The S5 smoke test confirms the fresh binary serves the same text.
3. **[note]** Cycle 3 Notes 3 (the 390-px masthead scroll hides the banner) and 4 (Tiles can't be switched while the daemon is down) are pre-existing and unchanged. I am carrying them so they aren't lost.
4. **[note]** The committed mismatch-race spec (`update.spec.ts`, "a window holding a restart record reloads on a mismatched-protocol reconnect…") still records `#protocol-mismatch`/`#app` mutations against the reload's `load`, so it would fail if the moved check were missing or ran after the paint. Only its header comment changed in 6d2d505.

## Maintainability review

# Maintainability review: Settings update failures

**Plan**: settings-update-failures
**Part verdict**: approved
**Cycle**: 4
**Pack**: kb: pack 21844 words (budget 8000)
**Scope**: 22 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`, the same set as cycle 3. Since the cycle 3 review (`8f0dc8e`), five non-test files changed: `internal/selfupdate/failure.go` (comment only), `web/src/features/connection.ts`, `web/src/features/updaterestart.ts` (comments only), `web/src/main.ts` and `web/src/wsapp.ts`. I re-read each changed hunk in the context of its whole file. For unchanged files, cycle 3's reading still holds.

## Cycle 3 findings, re-checked

| Cycle 3 | State now | Evidence |
|---|---|---|
| Minor 1: mismatch suppression decided in two places (`wsapp.ts` and `connection.ts`) | resolved | `ConnectionDeps` gains `reloading(): boolean` (`connection.ts:33`). `showProtocolMismatch()` opens with `if (deps.reloading()) return;` (`connection.ts:175`). `wsapp.ts:84` is back to `onProtocolMismatch: () => connection.showProtocolMismatch()`, which is byte-identical to main's line 25. It has the same one-line delegation shape as `onSessionRemoved` two entries above it. `dashboardWsHandlers` drops its `updateRestart` parameter and the `UpdateRestartHandle` import. The headers now agree on one home: `connection.ts:4-7` ("Also owns whether a mismatched hello actually shows the mismatch screen … via `ConnectionDeps.reloading`"), `updaterestart.ts:4-8` ("the one cross-feature contact point … the sole decider of whether a mismatched hello shows the mismatch screen") and `wsapp.ts:5-6` ("this module only calls into whatever `WsAppConnection` the caller already built"), which is true again. `main.ts:85-88` passes both deps in one object literal. That is a composition-root registration, not logic (kb:adr/process-composition-roots-registration-only). `rg -n "initConnection\(" web/src web/e2e` finds one construction site (`main.ts:85`). The Fix Attempt 3 `design:` line states why this is a guard clause. |
| Minor 2: `INV-2` in `failure.go:77-78` | resolved | The comment now states the invariant itself ("no URL reaches the wire …") and cites `kb:adr/update-failure-one-sentence-chain-in-log`. `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts' \| grep '^+' \| grep -nE "REQ-[0-9]\|INV-[0-9]\|\bW[0-9]+\b\|\bD[0-9]+\b\|\bE[0-9]+\b"` prints nothing. |
| Note 1: `updaterestart.ts:4-6` "one contact point" untrue | resolved | The claim is true again because of the Minor 1 fix. |
| Note 3: `dashboardWsHandlers` carries two `Pick<>` feature slices | resolved | Only the `actions` slice remains (`wsapp.ts:65-69`). |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/main.go | preflight.go, onexit.go | n/a (unchanged since cycle 3) | filelen 502, reason holds; funlen `parseFlags` 41 / `run` 44 were already over on main | pass |
| internal/selfupdate/apply.go | verify.go, lock.go, release.go | yes | — | pass (unchanged) |
| internal/selfupdate/failure.go | verify.go, release.go, apply.go | yes | — | pass |
| internal/selfupdate/install.go | exeversion.go, semver.go | yes | — | pass (unchanged) |
| internal/selfupdate/release.go | apply.go | yes | — | pass (unchanged) |
| internal/selfupdate/CLAUDE.md | — | n/a | — | pass |
| internal/server/server.go | ingest.go, shells.go, themepoll.go | yes | funlen `New` 41 (41 on main), reason holds | pass (unchanged) |
| internal/server/update.go | updatewire.go, usage.go | n/a | — | pass (unchanged) |
| internal/server/updatemanager.go | updatewire.go, usagepoll.go, bgloop.go | yes | filelen 551, reason holds | pass (unchanged) |
| internal/server/ws.go | ingest.go, bgloop.go, internal/boundedwait/boundedwait.go | yes | — | pass (unchanged) |
| internal/server/CLAUDE.md | — | n/a | — | pass |
| cmd/musterd/CLAUDE.md | — | n/a | — | pass |
| web/src/app.ts | wsapp.ts | yes | — | pass (unchanged) |
| web/src/features/connection.ts | connectionrestore.ts, connectionversion.ts, updaterestart.ts | yes (Fix Attempt 3: guard clause) | — | pass |
| web/src/features/updaterestart.ts | update.ts, connection.ts, actions.ts | yes | — | pass (Note 1) |
| web/src/features/CLAUDE.md | — | n/a | — | pass |
| web/src/main.ts | (composition root) | yes (Fix Attempt 3) | — | pass |
| web/src/render/banner.ts | render/masthead.ts, render/issue.ts | yes | — | pass (unchanged) |
| web/src/render/CLAUDE.md | — | n/a | — | pass |
| web/src/style.css | (itself) | n/a | — | pass (unchanged) |
| web/src/ws.ts | wsapp.ts | yes | — | pass (unchanged) |
| web/src/wsapp.ts | ws.ts, features/connection.ts, features/actions.ts | yes | — | pass (Note 1) |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** Two comment lines this branch edited were not re-wrapped, and they run past the ~100-column width their neighbours keep:
   - `web/src/features/updaterestart.ts:9` (106 columns)
   - `web/src/wsapp.ts:4` (106 columns; main's version of the line ends at "mismatch)")

   Biome does not reflow comments, so lint stays green. No change requested.
2. **[note]** Carried over from cycle 3 Note 2: the URL-leak guard `strings.Contains(…, "://")` still appears twice in `internal/selfupdate/failure.go` (the `networkCause` path and the `DescribeCheckFailure` fallback). The two replacement phrases are deliberately different, and `design:` lines explain why. If URL detection ever gets stricter, give it one named home. No change requested now.
3. **[note]** Concurrency: nothing new this cycle. `reloading()` is still single-threaded page state. `dispatch` sets it in the `helloArrived` handler and reads it synchronously afterwards (`ws.ts:129-131`); it is now read inside `connection.ts` instead of `wsapp.ts`. The gates' `go test -race -count=1 ./...` passed `internal/server` (152.6s) and `internal/selfupdate` (5.8s) (`02-test.log`).
4. **[note]** The size warnings (`14-size.log`, 10 hits) are identical to cycle 3's. No `dupl` hit. The test funlen hits are outside this diff. For review-work: the test name `TestHandleCheckUpdate_ExactREQ8Message` (`internal/server/updatereclassify_test.go:441`) still carries a plan ID (cycle 2 Note 8).
