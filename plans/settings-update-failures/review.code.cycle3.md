# Correctness review: Settings Update Failures

**Plan**: settings-update-failures
**Verdict**: approved
**Cycle**: 3
**Pack**: `kb: pack 26048 words (budget 8000)` — WARN pack exceeds budget of 8000 words; sections rules 1984 · features 7186 · diagrams 4297 · decisions 7251 · proposed 1221 · facts 168 · lessons 3291 · runbooks 644

This is a full re-read: the spawn prompt has no §9 delta line. Tree: `8520a5c`. I checked every cycle-2 item (all three parts) against `git diff 7af3044..HEAD` and the code:

- **Correctness Major 1** (fourth-class URL leak): fixed. `DescribeCheckFailure`'s fallback now returns `update check failed: the release host's response couldn't be read` whenever the message would contain `://`. I measured it with a `go test -overlay` scratch test that writes nothing to the repo. A 300 or 304 with `Location: https://github.com/x/v1%zz`, and a malformed base URL, both give that sentence.
- **Correctness Major 2** (D11 coverage): fixed. `TestDescribeCheckFailure_FourthClassNeverLeaksTheURL` drives the real `LatestTag` against a 300 with a malformed `Location` and against a 300 with no `Location`. `…MalformedBaseURLNeverLeaksTheURL` covers the request-build source. daemon-tests.md records the red run on the pre-fix code.
- **Correctness Major 3**: fixed. `updaterestart.ts:158-164` now says "up to one extra 1 s tick past CONFIRMATION_MS", which matches `setInterval(app.render, 1000)`.
- **Correctness Major 4**: fixed. The heading and **Owns** in `web/src/features/CLAUDE.md` now name update's two controllers. They also name `updaterestart.ts` as the one `<owner><concern>.ts` file that is a controller. `ls features/*.ts` shows 23 modules, and `main.ts` has 17 `init*(app` calls.
- **Correctness Major 5** (`[orchestrator]`): fixed. `daemon-implementation.md:201` is relabelled `design:` and points to `kb:adr/update-failure-one-sentence-chain-in-log`.
- **Correctness Minor 1**: fixed. The three comments in `update.go:31-35`, `main.go` `logStartup` and `updatemanager.go` (the `install` field and the `reclassify` doc) now name the real inputs and readers.
- **Browser Minor 1** (mismatch-screen flash): fixed in code. `UpdateRestartHandle.reloading()` gates `wsapp.ts`'s `onProtocolMismatch`. It is pinned by a new E2E test that e2e-specs showed going red on the reverted gate. Its display is for review-browser to observe.
- **Maintainability Minors 1 and 2**: `newWSHub(log)` now takes the logger at construction, and `server.go` no longer has a post-construction patch. The `drainOutboxes` comment now says why `boundedwait.Wait` does not fit. That claim is true: `boundedwait.Wait`'s watcher goroutine blocks on `wg.Wait()` until the counter reaches zero (`internal/boundedwait/boundedwait.go`). The shape ruling belongs to maintainability.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 unwritable-dir remedy | Yes — `install.go` `unwritableRemedy(path, dir, innermostCause(probeErr))` via `Reclassify` | Yes — `TestReclassify_UnwritableDirectoryRemedy`, `…_RealFilesystem`, E2 | pass |
| REQ-2 git-checkout remedy | Yes — `gitTreeRemedy`, `gitRootBelowHome` returns the `.git`-holding dir | Yes — `TestReclassify_GitTreeRemedy`, E1 | pass |
| REQ-3 Homebrew remedy unchanged | Yes — `HomebrewRemedy`, `classifyHomebrew` runs before the probe | Yes — `TestClassify_Table`, `TestClassify_HomebrewChecksBeforeWritability` | pass |
| REQ-4 recheck at the start of every check | Yes — `checkAvailability` calls `m.reclassify()` before `CheckNewer`, on both the manual and automatic paths | Yes — `TestUpdateManager_Reclassify_RunsBeforeEveryCheck`, E1/E2 | pass |
| REQ-5 one broadcast on change, none on no-change | Yes — `emit()` only when `next != m.install` | Yes — `…BroadcastsOnceOnChangeNeverOnNoChange` | pass |
| REQ-6 dev/homebrew never re-derived | Yes — early return in `reclassify` | Yes — `…NeverRerunsForDevOrHomebrew` | pass |
| REQ-7 refusal / may-apply read the current kind | Yes — `RequestApply` checks `m.install.MayApply()` under `mu`. `handleApplyUpdate` sends `f.um.Remedy()` | Yes — `TestHandleApplyUpdate_UnsupportedUsesTheCurrentRemedyAfterARecheck` | pass |
| REQ-8 502 wording | Yes — `DescribeCheckFailure` covers all four classes. `checkAvailability` returns the error unwrapped | Yes — `TestDescribeCheckFailure_Table`, and `TestHandleCheckUpdate_ExactREQ8Message` through HTTP | pass |
| REQ-9 apply.error wording | Yes — `DescribeApplyFailure`, `DownloadError`/`MissingSignatureError`/`FetchStatusError` | Yes — table, HTTP layer, E4 | pass |
| REQ-10 no URL | Yes — both the `networkCause` path and the fallback are guarded on `://`. Measured above | Yes — INV-2 now covers all four check classes and every apply class | pass (see Note 1 for relative-path `Location` values, which do not break INV-2) |
| REQ-11 warn/debug logging | Yes — warn for a manual check, debug for an automatic one; `finishApplyFailed` warns | Yes — `…LogsAtWarnForManualDebugForAutomatic`, `…FinishApplyFailed_LogsAtWarn` | pass |
| REQ-12 `exe` on `musterd starting` | Yes — `Str("exe", exePath)`. The remedy line carries `install.Remedy` | Yes — `logstartup_test.go` | pass |
| REQ-13 restart record | Yes — `updaterestart.ts`, in memory only | Yes | pass |
| REQ-14 restarting banner text | Yes — `restartingText` + `DAEMON_ABSENCE_CLAUSE` | Yes — W1 unit test. The live display (W11) is review-browser's | pass |
| REQ-15 30 s fallback | Yes — `RESTART_FALLBACK_MS`. The record stays held | Yes — W2 | pass |
| REQ-16 reload on first hello, mismatch included; handoff written first | Yes — `onHelloArrived` fires before the version gate. `writeJson` runs before `location.reload()`. `reloading()` suppresses the mismatch screen for that hello | Yes — W6/W7, `ws.test.ts` mismatch-hello case, E5, plus the new E2E "reloads on a mismatched-protocol reconnect without ever showing the mismatch screen" | pass |
| REQ-17 handoff confirmation for 3 s | Yes — read and removed at construction, decided on the first snapshot, `setTimeout(render, 3050)` | Yes — INV-3 cases, fake-timer case, E5 window of 2.7–3.4 s | pass |
| REQ-18 a non-restarting phase drops the record | Yes — gated on `connected` | Yes — W4 | pass |
| REQ-19 neutral confirmation style | Yes — `.banner.neutral` uses `--bg-raised`/`--fg-muted`/`--line-control` only | The rendered style is review-browser's (W10) | pass (code) |
| DIAG | `kb:diagram/web-components`: still true. It shows 23 feature modules and 17 controllers, update's two controllers, the `features → storage` "restart handoff" edge, and `sessionStorage` named on the storage seam. `kb:diagram/daemon-components`: no new package edge (`ws.go`'s zerolog import already existed in the package, and `failure.go` imports only stdlib). `kb:diagram/containers`: no new external wire. The plan's inline state diagram matches `updaterestart.ts` | — | pass |

## Build & Tests

- E2E tests: pass (454/454, `15-e2e.log`)
- Daemon tests (race): pass (23 packages ok, 0 FAIL, `02-test.log`)
- Web tests: pass (1803, `05-web-test.log`)
- Daemon build: pass (`01-build.log` empty)
- Web build: pass (`04-web-build.log`; only the existing chunk-size warning)
- Lint: pass (golangci-lint 0 issues; Biome clean on 251 files)

All of these are read from `$GATES_LOG_DIR` (`gates-settings-update-failures-c3`, 0 failed lines). The `WARN size` line (`14-size.log`) is maintainability's.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D20 | `make test` | pass (deduped to the baseline `go test -race -count=1 ./...`, `02-test.log`) |
| D21 | `make lint` | pass (deduped; `03-lint.log`: 0 issues) |
| D22 | `make test-race` | pass (`02-test.log`) |
| D23 | `! rg -n "not installed by the muster installer" internal cmd web/src web/e2e` | pass (`16-D23.log` empty) |
| W20 | `make web-build` | pass (`04-web-build.log`) |
| W21 | `make web-test` | pass (`05-web-test.log`, 1803 passed) |
| W22 | `make web-lint` | pass (`06-web-lint.log`) |
| W23 | `make contrast` | pass (`07-contrast.log`: 43 pairs × 3 themes, 0 failures) |
| E20 | `make e2e` | pass (`15-e2e.log`, 454 passed) |
| K1 | `make check-kb` | pass (`10-kb-check.log`: 436 records, 0 problems) |
| gates | versions, e2e-honest, dead-refs, e2e-lint, features-scope | pass (`08`, `09` empty, `11` 0 missing, `12` clean, `13` names update/connection/surfaces) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. Details below |

**DOC details:**
- Five `proposed` ADRs exist with `refs: plan:settings-update-failures`: the four the plan names, plus `process-features-widened-for-a-refactor-call-site`, which matches `decisions/features-scope-shellactivity-test/decision.md` (consensus, option A).
- `update-install-rechecked-on-every-check` supersedes `update-install-kinds-decide-who-may-apply`.
- No `deviation:` line lacks an ADR. The one at `daemon-implementation.md:201` is now `design:` and cites the proposed ADR.
- No `doc-delta:` line in the logs is missing from the Doc Delta. The `design-system.md` §1/§6.7 upkeep landed. `TODO.md` is unchanged on the branch (`git diff main...HEAD`); its move is scheduled for Completion, per the plan.
- Every Doc Delta sentence holds against the code:
  - install kinds re-derived at every check, with a path-and-reason remedy;
  - any apply failure reported as one sentence, the chain logged at warn;
  - the updating banner, the 30 s fallback, the reload, and the 3 s confirmation;
  - the protocol.md `install`/`remedy`/`apply.error`/502/409 wording, whose "never a URL" now holds for every class INV-2 names;
  - the connection sentence.

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W8 | no `any` in new web code | pass | `rg ':\s*any\b\|<any>\|as any'` over `updaterestart.ts`, `connection.ts`, `render/banner.ts`, `wsapp.ts`, `ws.ts`, `app.ts`, `main.ts`: only a comment word matches |
| W9 | `#banner` has one writer, `features/connection.ts` | pass | `rg '"#banner"\|renderBanner'` in non-test `web/src`: only `connection.ts:73,142,147` looks up or writes it. `updaterestart.ts` returns data through `ConnectionDeps.restartBanner` |
| W10 | restarting keeps `--banner-*`; confirmation neutral | pass (code) | `.banner` uses the `--banner-*` tokens, and `.banner.neutral` uses only the neutral tokens. `neutral` is true only for the confirmation (`computeBannerOverride`). The per-theme rendering is review-browser's |
| W11 | restarting banner seen during a real Update and restart | review-browser's | — |
| D14 | `install` read under `mu` everywhere in `updatemanager.go`; race test | pass | Every `m.install` read or write (`:286`, `:295-296`, `:386`, `:393`, `:409`, `:542`) runs with `m.mu` held. `TestUpdateManager_ReclassifyRacesRequestApplyAndCurrent` ran under `-race` (`internal/server` ok, 152.9 s) |
| D15 | no Go file outside `internal/selfupdate` composes release-host failure text or remedy wording | pass | `rg "release host\|install\.sh\|couldn't download\|not writable\|git checkout"` over non-test `internal`/`cmd`, excluding selfupdate and comments: one unrelated hit (`session.go` "git checkout" field doc) |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: no Claude Code field names among the diff's added lines |
| 2 | Terminal-output state parsing | pass: no `capture-pane`; the banner state comes from WS messages |
| 3 | Blocking hook handler | pass: no hook code touched |
| 4 | Bare tmux / `resize-pane` | pass: no tmux invocation added |
| 5 | Payload logging | pass: the new log lines carry `exe`, an update error chain, and a pending count, never a hook payload |
| 6 | Empty-gauge dishonesty | pass: a missing `snapshot.update` or a missing handoff shows nothing (INV-3 cases) |
| 7 | Session identity on `session_id` | pass: not touched |
| 8 | Settings trespass | pass: no `settings.json`/`CLAUDE_CONFIG_DIR` among the diff's added lines |
| 9 | Real `claude` outside canary/probes | pass: none |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** Some check-failure texts still read imperfectly. None breaks INV-2 (the plan's own `://` test), and none is reachable against GitHub's real redirect, which is a 302 with a well-formed `Location`. No change requested. Measured with the overlay scratch test (nothing written to the repo):
   - **A 302 with a path-relative malformed `Location`** (`/Zalaras/muster/releases/tag/v1%zz`) gives `update check failed: couldn't reach the release host (failed to parse Location header "/Zalaras/muster/releases/tag/v1%zz": parse "/Zalaras/muster/releases/tag/v1%zz": invalid URL escape "%zz")`.
     - net/http flattens that error with `%v`, so its text *is* the innermost cause. That meets REQ-8's letter.
     - It carries a relative reference, which has no `://`, so it is not a URL under INV-2.
     - A 300 or 304 with the same relative `Location` falls through to the fallback in the same way.
   - **A malformed `-update-base-url`** gives "the release host's response couldn't be read", although no request was ever sent. Only a developer-set flag can produce this.
2. **[note]** `UpdateRestartHandle.reloading()` and `wsapp.ts`'s `onProtocolMismatch` gate have no unit test. The new E2E test in `update.spec.ts` covers them, and e2e-specs showed it failing on the reverted gate with exactly the pre-fix flash (`test-specs.md` Fix Attempt 2). No change requested.
3. **[note]** `update.spec.ts` now has two tests on the plain `daemon` fixture, while the plan's **Fixture plan** header names `startDaemon` for the file. Neither test runs a release check or apply, so `docs/conventions.md`'s decision rule gives them `daemon`. The file header names both exceptions (verified: exactly two `daemon,` destructures, at `:1354` and `:1388`). `make e2e-lint` is clean.
4. **[note]** No soak by me. This cycle's diff adds one E2E test and repairs no named flake, so §1's soak trigger isn't met. e2e-specs pasted `make e2e-soak SPEC=e2e/update.spec.ts N=10` at 270/270. The Repairs tables from Fix Attempts 1 and 2 only add assertions. None deletes or weakens one.
5. **[note]** For Completion or doc-reconcile: the invariant in `internal/selfupdate/CLAUDE.md` and the `resolveInstall`/`logStartup` comments in `cmd/musterd/main.go` still cite `kb:adr/update-install-kinds-decide-who-may-apply`, which this plan's proposed ADR supersedes. The sentences stay true, since the kinds and the "only installer may apply" rule carry forward. Only the citation target changes when the ADR flips.
6. **[note]** `kb:diagram/web-components` draws no `wsapp → features` edge, although `wsapp.ts` has type-imported `ActionsHandle` since before this plan, and now also imports `UpdateRestartHandle`. The omission predates this plan, and this plan adds no new directory edge. For maintainability: several new test titles still cite review labels, e.g. `updaterestart.test.ts` "(browser Minor 1)" and `TestHandleCheckUpdate_ExactREQ8Message`.
7. **[note]** `.claude/skills/orchestrate/scripts/plan-lint.sh` changed on the branch in the planning commit `5e4425b`, exempting `web/src/style.css` from the Features-scope parse. It is tooling, not the shipped artifact, and outside this review's requirements.
