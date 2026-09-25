# Correctness review: Settings Update Failures

**Plan**: settings-update-failures
**Verdict**: needs-changes
**Cycle**: 2
**Pack**: `kb: pack 19808 words (budget 8000)` — WARN pack exceeds budget of 8000 words; sections rules 1984 · features 5124 · diagrams 4297 · decisions 3642 · proposed 1001 · facts 71 · lessons 3039 · runbooks 644

Full re-read (no §9 delta line in the spawn prompt). Tree: `b137429`. Cycle-1 correctness items re-checked against the code:
- Majors 1, 2, 3 and 5 and Minors 2 and 3 are fixed.
- Major 4 (`[orchestrator]`, diagram) is fixed.
- Minor 1 (URL in the check-failure text) is fixed on the transport path only. The same leak still exists through the fourth-class fallback; see Major 1.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 unwritable-dir remedy | Yes — `install.go` `unwritableRemedy` via `Reclassify` | Yes — install_test, E2 (now also contained) | pass |
| REQ-2 git-checkout remedy | Yes — `gitTreeRemedy`, `gitRootBelowHome` | Yes — install_test, E1 | pass |
| REQ-3 Homebrew remedy unchanged | Yes — `HomebrewRemedy` | Yes — `TestClassify_Table`, E9 | pass |
| REQ-4 recheck at the start of every check | Yes — `checkAvailability` → `m.reclassify()` before `CheckNewer`, both callers | Yes — `…RunsBeforeEveryCheck`, E1/E2 | pass |
| REQ-5 one broadcast on change, none on no-change | Yes — `reclassify` emits only on `next != m.install` | Yes | pass |
| REQ-6 dev/homebrew never re-derived | Yes — early return in `reclassify` | Yes — `…NeverRerunsForDevOrHomebrew` | pass |
| REQ-7 refusal / may-apply read the current kind | Yes — `install` under `mu`; handler reads `Remedy()` | Yes — D12 test | pass |
| REQ-8 502 wording | Yes, all four classes; the prefix is no longer doubled (`errCheckFailed` removed, `return err`) | Yes — `TestHandleCheckUpdate_ExactREQ8Message`, now four subtests through the HTTP layer | pass |
| REQ-9 apply.error wording | Yes — `DescribeApplyFailure`; minisig sentence has one home | Yes — table, HTTP layer, E4 | pass |
| REQ-10 no URL | **Partly.** The transport path is guarded (`networkCause`). The fourth-class fallback `update check failed: <err.Error()>` is not, and it leaks the URL for a 300/304/305/306 with a malformed `Location` and for a malformed base URL (measured, Major 1) | INV-2 test covers three of D8's four classes (Major 2) | **fail** |
| REQ-11 warn/debug logging | Yes — manual check warn, automatic debug, `finishApplyFailed` warn | Yes | pass |
| REQ-12 `exe` on `musterd starting` | Yes | Yes — `logstartup_test.go` | pass |
| REQ-13 restart record | Yes — `updaterestart.ts` | Yes | pass |
| REQ-14 restarting banner text | Yes — `computeBannerOverride` + `DAEMON_ABSENCE_CLAUSE` | Yes — W1 (live display is review-browser's W11) | pass |
| REQ-15 30 s fallback | Yes | Yes — W2 | pass |
| REQ-16 reload on first hello, mismatch included | Yes — `onHelloArrived` fires before the version gate | Yes — W6 (order now load-bearing), W7 (`setItemCalls`), edge-18 accessor case, E5 | pass |
| REQ-17 handoff confirmation for 3 s | Yes — plus a one-shot `setTimeout(render, 3050)` | Yes — INV-3 cases, fake-timer case at 3049/3050, E5 duration window 2.7–3.4 s | pass (see Major 3 on its comment) |
| REQ-18 non-restarting phase drops the record | Yes | Yes — W4 | pass |
| REQ-19 neutral confirmation style | Yes — `.banner.neutral` uses tokens only | review-browser (W10) | pass (code) |
| DIAG | `kb:diagram/web-components` is now true: 23 modules = 17 `init*(app` registrations in `main.ts` + 6 helpers; `features → storage` "restart handoff" edge drawn; `sessionStorage` named. `kb:diagram/daemon-components` still true: no new package edge (`ws.go`'s zerolog import already existed in the package). The plan's inline state diagram matches `updaterestart.ts` | — | pass |

## Build & Tests

E2E tests: pass (453/453) · Daemon tests (race): pass (23 ok packages, 0 FAIL) · Web tests: pass (1803) · Daemon build: pass · Web build: pass · Lint: pass (golangci 0 issues, Biome clean on 251 files). All read from $GATES_LOG_DIR (`gates-settings-update-failures-c2`, 0 failed lines).

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D20 | `make test` | pass (deduped to baseline `go test -race -count=1 ./...`, 02-test.log) |
| D21 | `make lint` | pass (deduped, 03-lint.log: 0 issues) |
| D22 | `make test-race` | pass (02-test.log) |
| D23 | `! rg -n "not installed by the muster installer" internal cmd web/src web/e2e` | pass (16-D23.log empty) |
| W20 | `make web-build` | pass (04-web-build.log; only the pre-existing chunk-size warning) |
| W21 | `make web-test` | pass (05-web-test.log: 1803 passed) |
| W22 | `make web-lint` | pass (06-web-lint.log) |
| W23 | `make contrast` | pass (07-contrast.log: 43 pairs × 3 themes, 0 failures) |
| E20 | `make e2e` | pass (15-e2e.log: 453 passed) |
| K1 | `make check-kb` | pass (10-kb-check.log: 435 records, 0 problems) |
| baseline | build, versions, e2e-honest, dead-refs, e2e-lint, features | pass (01, 08, 09, 11 — 0 missing, 12, 13) |
| baseline | size-warn | WARN, 9 hits (14-size.log). That line belongs to review-maintainability |
| DOC | doc upkeep + Doc Delta vs what shipped | **FAIL** — two problems. (1) `daemon-implementation.md:201` has a `deviation:` line with no `→ kb:adr/…` (Major 5). (2) The Doc Delta line and protocol.md's 502 description say the message never contains a URL, and the code doesn't support that (Major 1). Everything else holds:<br>• the four `proposed` ADRs exist with `refs: plan:settings-update-failures`;<br>• `update-install-rechecked-on-every-check` supersedes `update-install-kinds-decide-who-may-apply`;<br>• design-system §1/§6.7 upkeep landed and matches the shipped text;<br>• the web-components diagram is updated;<br>• the `TODO.md` move is scheduled for Completion, per the plan;<br>• no `doc-delta:` line is missing from the Doc Delta. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W8 | no `any` in new web code | pass | Added lines in `git diff main...HEAD -- web/src`: the only `any` matches are the English word in a test title and in comments |
| W9 | `#banner` has one writer, `features/connection.ts` | pass | `rg '#banner\|bannerEl' web/src -g '!*.test.ts'` finds only `connection.ts:73,142,147`, plus comments. `updaterestart.ts` returns data through `ConnectionDeps.restartBanner` |
| W10 | restarting banner keeps `--banner-*`; confirmation is neutral | pass (code) | `.banner` sets the `--banner-*` tokens. `.banner.neutral` (style.css:491) uses `--bg-raised`/`--line-control`/`--fg-muted`, and only the confirmation returns `neutral: true`. Themes are review-browser's |
| W11 | restarting banner seen during a real restart | code path present; observation is review-browser's | `computeBannerOverride` returns the REQ-14 text while a record is held, the socket is not connected, and less than 30 s has passed |
| D14 | `install` read under `mu` everywhere; `make test-race` covers a recheck racing `Current` and `RequestApply` | pass | Every `m.install` access (`updatemanager.go:286,295-296,386,393,409,542`) holds `mu`. `TestUpdateManager_ReclassifyRacesRequestApplyAndCurrent` loops `checkAvailability` (and so `reclassify`), `RequestApply` and `Current` concurrently, 200 times each, against a flipping seam. It runs in the gate's `go test -race` (02-test.log `internal/server ok`) |
| D15 | no Go file outside `internal/selfupdate` composes release-host failure text or remedy wording | pass | `rg "couldn't reach\|install\.sh\|not a redirect\|release host\|couldn't download\|no signature\|can't update\|not writable" internal cmd -g '!*_test.go' -g '!internal/selfupdate/**'` finds comments only (`updatemanager.go:21,252`) |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: no Claude Code field names in any changed non-test file |
| 2 | Terminal-output state parsing | pass: none added |
| 3 | Blocking hook handler | pass: hooks untouched |
| 4 | Bare tmux / resize-pane | pass: no tmux invocation added |
| 5 | Payload logging | pass: the new warn lines log update and drain errors only |
| 6 | Empty-gauge dishonesty | pass: the confirmation shows only when `update.running` matches the handoff; an absent handoff or snapshot gives `null`, so nothing shows |
| 7 | Identity on `session_id` | pass: n/a |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary | pass |

## Issues

### Critical

None.

### Major

1. **[daemon-impl]** REQ-10 / INV-2 still fail through `DescribeCheckFailure`'s fourth-class fallback (`failure.go`: `return fmt.Sprintf("update check failed: %s", err.Error())`), which has no `://` guard. Cycle 1's fix guarded only `networkCause`.
   - **How the URL gets in:** `LatestTag` builds two plain errors that embed a URL:
     - `parsing redirect location %q: %w` (`release.go`), which quotes `loc`;
     - `building latest-release request: %w`, whose `url.Parse` error quotes the URL.
   - **When it happens:** net/http only parses `Location` for the statuses it follows (301/302/303/307/308). A 300, 304, 305 or 306 carrying a malformed `Location` therefore reaches `LatestTag`'s own `url.Parse` and falls through to the fallback.
   - **Measured** with a `go test -overlay` scratch test (nothing written to the repo), driving the real `LatestTag` → `DescribeCheckFailure`:
     - `300 -> "update check failed: parsing redirect location \"https://github.com/Zalaras/muster/releases/tag/v1%zz\": parse \"https://github.com/Zalaras/muster/releases/tag/v1%zz\": invalid URL escape \"%zz\""`. 304, 305 and 306 give the identical text.
     - For contrast, 301 and 302 give `…couldn't reach the release host (an unreadable response)`, which is correct.
     - A malformed base URL gives `update check failed: building latest-release request: parse "http://exa mple.test/%zz/latest": invalid character " " in host name`.
   - **Why Major:** this breaks REQ-10 and the plan's Protocol Contract. It also breaks the sentence the Doc Delta promotes verbatim into protocol.md ("never a URL, a transport chain or the response body"), which §2 makes a Major on the code owner. GitHub's real redirect is a 302, so it is not Critical.
   - **Fix:** a `check_failed` message never contains `://` for any error `LatestTag`/`CheckNewer` can return. For example, guard the fallback as `networkCause` does. Or stop quoting `loc` and the URL in those two plain errors, while the full chain still reaches the warn log.
2. **[daemon-tests]** D11 ("INV-2 holds across D8's and D9's failure classes") is tested against three of D8's four classes. `TestDescribeCheckFailure_NeverContainsAURL` (`failure_test.go:142-155`) says so in its own doc comment ("across D8's three typed failure classes"). The fourth, unclassified class has no INV-2 case, which is why Major 1 is green.
   - **Add:** a case driven through the real `LatestTag` and an `httptest` server answering **300** (not 302) with `Location: …/v1%zz`, asserting `DescribeCheckFailure` contains no `://`. A no-`Location` case as well, so every class of the four is covered.
   - This test goes red until Major 1 lands.
3. **[web-impl]** A false comment in `web/src/features/updaterestart.ts:150-151`: "`app.onRender`'s 1 s tick alone can leave the confirmation showing for up to ~2x CONFIRMATION_MS depending on tick phase".
   - **What is actually true:** with `setInterval(app.render, 1000)` (`main.ts:97`), the tick alone overshoots by less than one tick, so the confirmation shows for at most about CONFIRMATION_MS + 1 s = 4 s. That matches cycle 1's measured 3.96–3.99 s, and e2e-specs' repro of 3990.6 ms. "~2x" would be 6 s.
   - **Fix:** the comment states the real bound, roughly "up to one extra 1 s tick past CONFIRMATION_MS".
4. **[web-impl]** The hand-written `web/src/features/CLAUDE.md` heading and **Owns** line say "controllers, one per feature" / "one controller per feature". As shipped, the update feature has two controllers: `initUpdate` and `initUpdateRestart`, both registered in `main.ts`.
   - The orchestrator's own diagram update now says so: web-components reads "the update feature has two".
   - web-impl's cycle-1 design line concedes the file "has no name for" this case.
   - **Fix:** the hand-written part states what is true, i.e. names the update feature's second controller as the exception.
   - This overlaps maintainability's cycle-1 Major 2 (placement and naming). If that part's re-review ends in a fold into `update.ts`, this goes away with it. Otherwise the sentence is false as shipped, and the orchestrator should route both together.
5. **[orchestrator]** `plans/settings-update-failures/daemon-implementation.md:201`'s `deviation:` line ends with "→ ADR: pending only if review wants one" and has no `→ kb:adr/…`.
   - **What it records:** `MissingSignatureError.Error()`'s log text changed. It is not a plan deviation: the wire sentence is REQ-9's, and `Error()` is log-only under `kb:adr/update-failure-one-sentence-chain-in-log`.
   - **Fix:** relabel it `design:`, or point it at that proposed ADR, so the deviation-to-ADR audit holds. This does not block approval.

### Minor

1. **[daemon-impl]** Three comments misdescribe the reclassification this plan shipped:
   - `internal/server/update.go:31-34`, `UpdateConfig.Install`, says installer/unmanaged "are re-derived **from it**". They are re-derived from exePath/home/the write probe by the `Reclassify` closure; `Install` only decides whether that runs.
   - `cmd/musterd/main.go` `logStartup`'s doc calls the exe path "the one thing an unmanaged/installer classification is computed from". `home` and the write probe also decide it.
   - `updatemanager.go`'s `install` field comment and `reclassify` doc both list "RequestApply's MayApply/Remedy checks". `RequestApply` checks only `MayApply`; the remedy is read by `handleApplyUpdate` via `Remedy()`.
   - **Fix:** each comment names the inputs and readers that actually exist.

### Notes

1. **[note]** Cycle 1's correctness Minor 1 fix (`networkCause`'s `://` guard) holds for every status net/http follows. `TestDescribeCheckFailure_MalformedLocationNeverLeaksTheURL` pins it through the real `LatestTag`. Major 1 is the remaining path, not a regression.
2. **[note]** `update.spec.ts`'s new "window.sessionStorage accessor itself throws" test takes the plain `daemon` fixture, while the plan's **Fixture plan** header names `startDaemon` for the file. `docs/conventions.md`'s decision rule gives `daemon` to a test that kills its daemon and needs no computed spawn options. The file header documents the exception, and `make e2e-lint` is clean (12-e2e-lint.log). No change requested.
3. **[note]** No soak by me. The diff strengthens E1/E2/E5 and adds two specs; it repairs no named flake, so §1's soak trigger isn't met. e2e-specs pasted `make e2e-soak` runs of 260/260 (`update.spec.ts`) and 40/40 (`resilience.spec.ts`) with the new E5 2.7–3.4 s window. The Repairs table's three rows only add assertions; I read each diff and none deletes or weakens one.
4. **[note]** `internal/selfupdate/CLAUDE.md`'s hand-written invariant "Install kind decides who may apply …" still cites `kb:adr/update-install-kinds-decide-who-may-apply`, which this plan's `update-install-rechecked-on-every-check` supersedes at Completion. The sentence stays true. Re-pointing the citation is a Completion or doc-reconcile concern.
5. **[note]** For review-maintainability:
   - The reclassify seam is root-injected (`cmd/musterd` → `UpdateConfig.Reclassify`). The plan's Implementation Notes asked for the constructor-default seam, while its Affected Files allowed `main.go` to build the production reclassifier. The shipped code follows Affected Files and its comment now states its own reason. That is shape, so it is maintainability's call.
   - Some new test titles and comments cite review items by cycle label, e.g. `updaterestart.test.ts` "(browser Minor 1)".
6. **[note]** `computeBannerOverride` checks the confirmation before the record/status branch. If the daemon dies within the 3 s confirmation, the neutral "Updated to" text shows for the rest of those 3 s before the unreachable banner. REQ-17 doesn't contradict this. It is review-browser's to observe if it wants.
