# Review: settings-update-failures

**Plan**: settings-update-failures
**Verdict**: needs-changes
**Cycle**: 2
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser needs-changes, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Settings Update Failures

**Plan**: settings-update-failures
**Part verdict**: needs-changes
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

## Browser review

# Browser review: Settings Update Failures

**Plan**: settings-update-failures
**Part verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 11348 words (budget 8000) — WARN pack exceeds budget of 8000 words
**Rig**: tree at b137429. I ran `make web-build build`, and the helpers built `musterd` 0.1.0 and 0.2.0 from the same tree. Every cell got its own daemon from `helpers/fixtures.ts` `startDaemon`/`daemon`, each with:
- a space-bearing data dir `$TMPDIR/muster e2e-*`
- a private `<data dir>/tmux.sock`
- the helpers' stub `claude` (`$TMPDIR/muster e2e-stub-635d9c3a50837164/claude`)

The release host was the helpers' `FakeReleaseServer`. Headless Chromium ran at 1280×720, plus 800×600 and 390×844 where noted, driven by a throwaway `web/e2e/zz-rbprobe.spec.ts` that I have since deleted. `git status --porcelain` shows none of my files. No `musterd` or `tmux` process is left.

The gates log (`-c2`, 0 failed lines; web-build green, e2e 453 passed) says the app I drove is the one that will ship.

I used the same instruments as cycle 1. A context-level `MutationObserver` recorder logs each `#banner` mutation with a `Date.now()` timestamp. Each entry holds the text, `hidden`, class, the computed display/background/foreground/border colours, the resolved `--banner-*` and neutral tokens, and the boxes of the banner, masthead and view. The recorder also logs `/ws` frames (`hello`, the `restarting` update) and `load` events across reloads.

"Routed" cells proxy `/ws` through `page.routeWebSocket` to the real daemon. That let me inject an `update` message (`apply.phase: "restarting"`), hold the socket down, rewrite the hello's `protocolVersion`, or hold the first snapshot. Oracles: `/api/state` `update` (install, remedy, `apply.error`), the 502 body of `POST /api/update/check`, and tmux `totalAttachedClients`.

The daemon a plain `daemon` fixture runs reports `running: "v0.18.3-30-gb137429"`, which carries its own `v`. So routed confirmation text reads `Updated to vv0.18.3-….` That is an artifact of the dev ldflags. GoReleaser's `{{.Version}}` has no `v`, and the real-restart cells (R1, R2) read exactly `Updated to v0.2.0.`.

## Cycle-1 issues re-measured

| Cycle 1 | Result now | Evidence |
|---|---|---|
| Major 1: Settings dialog overflows with an unmanaged remedy | fixed | S1–S3: `#update-status` 437–843 inside dialog 420–860. Dialog `scrollWidth 438 == clientWidth 438` at 1280 and 800, `356 == 356` at 390. Status line `overflow-wrap: anywhere`, `scrollWidth == clientWidth`. No button, input, label, legend, `.hint`, `dt` or `dd` past the dialog's edge, even with a 285-character space-bearing path |
| Major 2: dashboard fails to boot when the `sessionStorage` accessor throws | fixed | X5 accessor-throw: status `connected`, 0 page errors. A routed restart still reloads (2 loads, marker gone). After SIGTERM the banner is `display:block` with the unreachable text |
| Minor 1: confirmation up ~4 s | fixed | Six cells measured 3.043–3.053 s (R1 3043, R2 3052/3051, X1 3053/3052, X3 3053, X5 3051 ms) |
| Minor 2: E5/E1/E2 could not fail for those | fixed | E5 now bounds the duration at 2.7–3.4 s from its own observer. E1 and E2 call `expectRemedyContained`, which checks the box and `scrollWidth` |
| Minor 3: banner rewritten every second | fixed | X2: 1 mutation at the drop, **0** over 15.5 s down (including a Focus→Tiles switch), 1 at the return. X1: 0 mutations between the restarting display and the 30 s fallback (1349 → 30799 ms) |

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-14 / W11 | focus | daemon-down (real Update and restart) | restarting banner seen, exact text, alarm tokens | pass | R1: `restarting` frame at 444 ms, banner shown at 447 ms, hidden at the hello at 1957 ms (1.5 s). Text `Updating musterd to v0.2.0 — restarting; hook output…` is exact. Dark theme bg `rgb(59,32,32)`, fg `rgb(244,185,185)`, border `rgb(92,47,47)` equal the resolved `--banner-bg/-fg/-line` |
| REQ-14 | focus | daemon-down | placed under masthead, above view, no page overflow | pass | banner 0,46–1280,78; masthead bottom 46; view top 78; scrollWidth 1280 = clientWidth |
| REQ-14 | focus, tiles | daemon-down at 390×844 | placed, wraps, no horizontal scroll | pass | X1 in both views: banner 0,46–390,108 under masthead 46; banner and page `scrollWidth 390 == clientWidth 390` |
| REQ-14 / W11 | tiles | daemon-down (real restart, two windows) | restarting banner in each window | pass | R2: p0 and p1 both shown at 458/459 ms. Light theme `rgb(251,232,232)/(122,31,31)/(229,182,182)` equal the tokens. Box 0,46–1280,78 over tiles view top 78 |
| REQ-14 | pop-out | any | — | N/A — `doc.html` has no `#banner`, and `doc.ts` never relays `helloArrived` (only `wsapp.ts:88` does) | |
| REQ-14 | focus, tiles | data (record held, still connected) | banner stays hidden | pass | X1: 1.3 s after injection, `hidden=true`, computed `display:none`, in both views |
| REQ-14 | any | no data yet | — | N/A — no record can exist before an `update` message (plan § States) | |
| REQ-15 | focus | daemon-down (routed, instrument theme) | unreachable text at 30 s, record still held | pass | X1: record at 0, restarting text at 1349 ms, unreachable at 30799 ms. Alarm tokens `rgb(58,30,30)/(243,183,183)` equal instrument `--banner-*`. The return at 40.9 s still reloaded and confirmed |
| REQ-15 | tiles | daemon-down (routed, light) | same | pass | X1 tiles: unreachable at 30759 ms, light alarm tokens, reload and confirmation on return at 40.9 s (this closes cycle 1's Note 3 gap) |
| REQ-16 | focus | real restart | reloads on first hello | pass | R1: hello at 1956 ms, `load` at 1978 ms. Pre-click `window.__m` is gone afterwards |
| REQ-16 | tiles | real restart, two windows | each window reloads, view kept | pass | R2: p0 hello 1968 → load 1993; p1 hello 1979 → load 2005. Both markers gone, both still in Tiles |
| REQ-16 / edge 17 | focus | routed, hello `protocolVersion: 99` | reloads *rather than showing* the mismatch screen | **FAIL** | X5 proto99 (4 runs): `#protocol-mismatch` is unhidden 3–4 ms after the hello, and `load` follows 33–40 ms later. In 2 of 4 runs a double-`requestAnimationFrame` fired with the mismatch screen shown, so at least one frame was produced (Minor 1) |
| W7 | focus, tiles | reconnect | one reload per restart | pass | exactly one `load` per window per restart (R1, R2, X1 ×2, X5 ×4) |
| REQ-17 | focus | data (after real restart) | `Updated to v0.2.0.` for 3 s, then hidden | pass | R1: text exact, shown 2001 ms, hidden 5044 ms = 3.043 s |
| REQ-17 | tiles | data (after real restart, two windows) | confirmation in both windows, 3 s | pass | R2: p0 2003 → 5055 (3.052 s); p1 2014 → 5065 (3.051 s) |
| REQ-17 | focus | no data yet (routed, first snapshot held 3 s) | handoff waits for the first snapshot | pass | X3: banner `display:none` through the 3 s hold. Confirmation 3 ms after the snapshot was released, hidden 3.053 s later |
| REQ-17 / INV-3 / edge 19 | focus, tiles | second load of the same tab | nothing shown | pass | X1 in both views: `page.reload()`, banner hidden for 4.5 s |
| REQ-17 / edge 16 | focus | routed, record `9.9.9`, daemon runs another version | reload, no confirmation | pass | X5 ver-mismatch: 2 loads, banner hidden for 4.5 s |
| REQ-17 / edge 18 | focus | `sessionStorage` methods throw | reload still happens, no confirmation | pass | X5 methods-throw: 2 loads, marker gone, banner hidden, 0 page errors |
| REQ-17 / edge 18 | focus | `window.sessionStorage` accessor throws | dashboard boots, reload intact, daemon-down surfaced | pass | X5 accessor-throw: see cycle-1 table, Major 2 |
| REQ-18 / edge 20 | focus | routed: `restarting`, then `failed` while connected, then drop | record dropped, ordinary banner, no reload | pass | X4: unreachable text exact; `window.__m` survives the reconnect |
| REQ-19 / W10 | focus | data | neutral tokens, dark | pass | R1: bg `rgb(31,34,40)` = `--bg-raised`, fg `rgb(193,197,204)` = `--fg-muted`, border `rgb(58,63,73)` = `--line-control`; class `banner neutral` |
| REQ-19 / W10 | tiles | data | neutral tokens, light | pass | R2 and X1 tiles: `rgb(251,250,247)/(65,69,79)/(203,201,194)` equal the light tokens |
| REQ-19 / W10 | focus | data | neutral tokens, instrument | pass | X1 and X3: `rgb(23,26,36)/(178,182,195)/(52,58,74)` equal the instrument tokens |
| REQ-19 / W10 | focus, tiles | daemon-down | restarting and fallback keep `--banner-*` in all three themes | pass | R1 dark, R2 and X1 tiles light, X1 focus instrument (values above) |
| Banner daemon-down (unchanged) / INV-4 / edges 14, 23 | focus → tiles | daemon-down (SIGTERM, no record) | ordinary text, visible, placed; no reload on return | pass | X2: text exact, `display:block`, 0,46–1280,78 under masthead 46, view top 78. Marker kept after `restart()` |
| Banner daemon-down | focus, tiles | daemon-down | written only on change | pass | X2: 0 mutations over 15.5 s of steady down |
| Banner hidden | focus, tiles | data (connected) | `[hidden]` resolves to `display:none` | pass | every connected-state record: `hidden=true`, `display:none` |
| Edge 21 | tiles | real restart | each window reloads and confirms | pass | R2 (above) |
| Edge 22 | focus, tiles | routed drop | Settings dialog closes on the drop | pass | X1 in both views: `dialog.open` true before the drop, false 1 s after |
| §7 one live client | focus | after the real reload | one tmux client per session | pass | R1: `totalAttachedClients` = 1 five seconds after the confirmation |
| REQ-2 | Settings over focus | data | git-tree remedy exact, equals oracle, buttons disabled | pass | S1: text equals `/api/state` `update.remedy` (`can't update <space-bearing path>/musterd: it is inside the git checkout <root> — install with: curl …`); both buttons disabled |
| REQ-2 | Settings over focus | data at 1280, 800 and 390 | status line contained, no clipped control, dialog reachable | pass | S1: status 437–843 / 197–603 / 33–357 inside dialog 420–860 / 180–620 / 16–374. `scrollWidth == clientWidth` at each size. At 800×600, `scrollHeight 681 > clientHeight 562` with `overflow-y:auto` |
| REQ-1 | Settings over tiles | data (285-character space-bearing path) | not-writable remedy exact, `(permission denied)` | pass | S2: text = `/api/state` remedy = expected string |
| REQ-1 | Settings over tiles | data at 1280, 800 and 390 | contained, reachable | pass | S2: 437–843 / 197–603 / 33–357 inside the dialog. Dialog `sw == cw`. At 1280×720, `sh 749 > ch 682` with `overflow-y:auto` |
| Edge 1 | Settings over focus | data | `.git` removed + Check now (pointer) enables Update, clears the line | pass | S1: both buttons enabled, text `""`, oracle `install: installer`, `remedy: null` |
| Edge 2 | Settings over tiles | data | `chmod 0755` + Check now (keyboard Enter) enables Update | pass | S2: enabled, text `""`, oracle `installer` / `null` |
| Edge 3 | Settings over focus | data | installer → `chmod 0555` → Check now flips to unmanaged, contained | pass | S3: oracle `installer` → `unmanaged`, REQ-1 remedy exact, buttons disabled, contained (437–843) |
| REQ-3 / edge 7 | Settings over focus | data | Homebrew remedy unchanged, contained, survives Check now | pass | S4: `installed by Homebrew — run brew upgrade musterd`, 437–843 inside 420–860, oracle `homebrew`, unchanged after Check now |
| REQ-8 | Settings over focus | data | each check-failure class exact, equal to the 502 body, contained | pass | S5, each 502 `check_failed` equal to `#update-status`, all contained: `…couldn't reach the release host (connection refused)`, `(host not found)`, `(timed out)` (10.3 s), `…the release host answered 404, not a redirect`, `…the latest release tag "nightly-build" is not a release version` |
| REQ-9 | Settings over focus | data | apply failures with the `Update failed: ` prefix, equal to the oracle | pass | S6: `couldn't download musterd_0.2.0_darwin_amd64.tar.gz (connection refused); nothing was installed`, `…musterd_0.3.0_darwin_amd64.tar.gz (status 404); nothing was installed`, `couldn't download checksums.txt.minisig (status 404) — this release has no signature, refusing to apply`. Each equals `/api/state` `apply.error` and is contained |
| REQ-10 | Settings | data | no `://` in any check or apply failure | pass | all 8 classes above: `hasURL=false` |
| Status line | Settings | daemon-down | — | N/A — the dialog closes on every drop (edge 22, measured) | |
| Status line | Settings | no data yet | — | [note] not measured — Note 3 | |
| REQ-4–7, 11–13 | — | — | — | N/A — daemon-side (review-work). Their visible effects are the edge 1–3 and REQ-8/9 rows | |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[web-impl]** When the daemon comes back speaking another protocol version, a window holding a restart record briefly shows the protocol-mismatch screen before it reloads. `ws.ts` `dispatch` calls `onHelloArrived()`, and `updaterestart.ts` then calls `location.reload()`. `reload()` only schedules the navigation, so `dispatch` keeps going into `onProtocolMismatch`, and `connection.showProtocolMismatch()` hides `#app`, unhides `#protocol-mismatch` and focuses it.
   - Measured over 4 runs of X5 proto99: the mismatch screen was unhidden 3–4 ms after the hello, and the reload's `load` came 33–40 ms later. In 2 of the 4 runs a double-`requestAnimationFrame` fired with the screen shown, so a frame was produced.
   - REQ-16 and edge 17 say the protocol bump "reloads rather than showing the mismatch screen". Cycle 1 recorded this cell as a pass, with an instrument that did not look for a painted frame.
   - A fix must keep `#protocol-mismatch` hidden and `#app` shown from the hello through the unload whenever the reload fires. For example, the reloading path could suppress the mismatch gate for that hello. W6 covers only that `reload` is called, so it could not fail for this.

### Notes

1. **[note]** REQ-15 fallback timing: the unreachable text appeared 30.76–30.80 s after the record arrived (X1, both views), which is the 1 s render tick's granularity. The confirmation now has its own timer; the fallback does not. No change requested, since the plan states no precision here.
2. **[note]** In X5 proto99 the route kept rewriting the hello after the reload, so the fresh page showed the mismatch screen. That is the correct steady state for a real protocol bump against a stale bundle; the real flow serves a matching bundle. It is not a defect.
3. **[note]** I did not measure the Settings dialog before the first snapshot. The plan changes nothing about the dialog's no-data rendering.
4. **[note]** I did not re-measure keyboard focus retention on Check now. Cycle 1's Note 2 (focus goes to `BODY` while the button disables itself) predates this plan, and `render/update.ts` is untouched.
5. **[note]** Pop-out (`/doc.html`) has no banner and no hello relay, so a pop-out open across an update restart keeps its old bundle. That is outside this plan and unchanged since cycle 1.
6. **[note]** I did not re-measure E4's on-disk byte identity. It is a filesystem fact, and E4 is green in the gates log. The download-failure text itself was measured (S6).

## Maintainability review

# Maintainability review: Settings update failures

**Plan**: settings-update-failures
**Part verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 16076 words (budget 8000) — WARN pack exceeds budget; sections rules 1938 · features 5124 · diagrams 4297 · decisions 3642 · proposed 0 · facts 71 · lessons 354 · runbooks 644
**Scope**: 22 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`. 17 are code. Of the 5 `CLAUDE.md` files, 4 changed only their generated trailer; `internal/selfupdate/CLAUDE.md` has hand edits to Owns and Exemplar and was read. `internal/server/updatereclassify.go` from cycle 1 is gone: it was merged back into `updatemanager.go`.

## Cycle 1 findings, re-checked

| Cycle 1 | State now | Evidence |
|---|---|---|
| Major 1: plan-ID comments | resolved | `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts' \| grep '^+' \| grep -nE "REQ-[0-9]\|\bW[0-9]+\b\|settings-update-failures\|soak\|web-tests\|daemon-tests"` prints nothing. |
| Major 2: `updaterestart.ts` is a controller with a helper's name | resolved | The web Fix Attempt 1 `design:` line and the file's header comment (`updaterestart.ts:1-13`) both say why the update feature has two controllers. `kb:diagram/web-components` now says "17 stateful per-feature controllers (the update feature has two…)". See Note 1 for the remaining doc sentence. |
| Minor 1: `drainOutboxes` gave up silently | resolved | It now logs at warn (`ws.go:169`), and `closeDrainTimeout`'s comment (`ws.go:127-136`) says why the bound is fixed rather than taken from ctx. It still has its own wait loop; see Minor 2. |
| Minor 2: reclassify seam claimed constructor-default | resolved | The comment (`updatemanager.go:38-48`) no longer claims that model. The reason it gives, that the closure reuses the `home` value `Classify` resolved, holds. |
| Minor 3: two homes for one failure sentence | resolved | `MissingSignatureError.Error()` (`apply.go:72-74`) is now log-only. `DescribeApplyFailure`'s doc says which shape a new failure takes, and the package CLAUDE.md Exemplar is updated. |
| Minor 4: file split vs size reason | resolved | Reclassification is merged back into `updatemanager.go`. The filelen 551 warning's reason (Decisions, Fix Attempt 2) now agrees with the layout. |
| Minor 5: `onHelloArrived` / `"helloReceived"` | resolved | The name is `helloArrived` end to end (`ws.ts:41`, `wsapp.ts:88`, `app.ts:64`). |
| Minor 6: daemon-absence clause written twice | resolved | It has one home, `render/banner.ts:16` (`DAEMON_ABSENCE_CLAUSE`). Text constants in `render/` have a precedent: `render/issue.ts:12-13` `DASHBOARD_SCOPE_TEXT`/`DASHBOARD_SCOPE_VALUE`. |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/main.go | preflight.go, onexit.go | n/a (plumbing) | filelen 502, reason holds; funlen `parseFlags` 41 / `run` 44 were already over on main | pass |
| internal/selfupdate/apply.go | verify.go, lock.go, release.go | yes | — | pass |
| internal/selfupdate/failure.go (new) | verify.go, release.go, apply.go | yes (typed errors; `://` guard placement) | — | pass (Note 5) |
| internal/selfupdate/install.go | exeversion.go, semver.go | yes (via reclassify lines) | — | pass |
| internal/selfupdate/release.go | apply.go, CLAUDE.md exemplar | yes | — | pass |
| internal/selfupdate/CLAUDE.md | — | n/a | — | pass |
| internal/server/server.go | usage.go, ingest.go, update.go, and 20 `new*(…, log zerolog.Logger)` constructors | yes (Fix Attempt 2, `wsHub.log` zero value) | funlen `New` 42 (41 on main); the doc-comment reason does not cover the added statement | Minor 1 |
| internal/server/update.go | updatewire.go, usage.go | yes | — | pass (Note 4) |
| internal/server/updatemanager.go | updatewire.go, usagepoll.go, ingest.go, bgloop.go | yes | filelen 551, reason holds (Fix Attempt 2) | pass |
| internal/server/ws.go | ingest.go (`drainAck`, `Stop`), terminal.go `closeAll`, bgloop.go, internal/boundedwait | partial (drain marker yes; no line on not reusing `boundedwait.Wait`) | — | Minor 1, Minor 2 |
| web/src/app.ts | wsapp.ts | yes | — | pass |
| web/src/features/connection.ts | connectionrestore.ts, connectionversion.ts, tiles.ts, focus.ts, rail.ts | yes | — | pass |
| web/src/features/updaterestart.ts (new) | update.ts, updateview.ts, usage.ts, theme.ts, storage.ts | yes (Fix Attempt 1) | — | pass (Notes 1-3) |
| web/src/main.ts | (composition root) | n/a | — | pass |
| web/src/render/banner.ts | render/masthead.ts, render/issue.ts | yes | — | pass |
| web/src/style.css | (itself) | n/a | — | pass |
| web/src/ws.ts | wsapp.ts | yes | — | pass |
| web/src/wsapp.ts | ws.ts, app.ts | yes | — | pass |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[daemon-impl]** `wsHub` gets its logger by a patch after construction, not through its constructor: `internal/server/server.go:154-157` sets `s.hub.log = cfg.Logger` after `hub: newWSHub()`.
   - **Sibling shape:** every other logger-bearing type in the package takes the logger as a constructor parameter. `rg -n "func new[A-Z][a-zA-Z]*\(" internal/server -g '!*_test.go' | rg -i "log"` lists 20 of them, for example:
     - `ingest.go:67` `newIngestQueue(st *store.Store, log zerolog.Logger, …)`
     - `shells.go:82` `newShellRegistry(tmuxClient paneSpawner, log zerolog.Logger)`
     - `themepoll.go:47` `newThemeFeature(cfg ThemeConfig, hub *wsHub, log zerolog.Logger)`
   - **Why it stands out:** `rg -n "^\s+s\.[a-zA-Z]+\.[a-zA-Z]+ = " internal/server/server.go` finds exactly one line, this one. It is the only post-construction field patch in the composition root, whose rule is "build dependencies and register each feature in one line" (`docs/conventions.md` § Composition roots, first bullet).
   - **Why the stated reason doesn't hold:** the Decisions reason (Fix Attempt 2, "`newWSHub()`'s signature could stay untouched for `shellactivity_test.go`'s existing bare call") keeps one test call site compiling. The same wave changed `drainOutboxes`' signature and accepted breaking `wshub_drain_test.go:154,175` to do it.
   - **Cost of the zero-value default:** a hub built by `newWSHub()` drops the "ws outbox drain did not finish" warning without a trace. That warning is what cycle 1's Minor 1 asked to make observable.
   - **Size:** the patch also grows `New`'s funlen from 41 to 42. `New`'s own size reason (`server.go:136-142`) lists exactly what its length consists of: one line per feature plus four Config overrides. This statement is in neither group.
   - **A fix must make true:**
     - `wsHub` receives its logger at construction, like its siblings.
     - `New` holds no post-construction field patch.
     - The one bare call at `shellactivity_test.go:439` is updated with it. That line is the `[daemon-tests]` half of this fix.

2. **[daemon-impl]** `drainOutboxes` has its own bounded-wait-with-warn loop (`internal/server/ws.go:152-183`: `time.After(closeDrainTimeout)` plus a warn on expiry). The package already has one shared shape for this.
   - **What the code and docs claim:** the function's doc comment (`ws.go:148-151`) names `boundedwait.Wait`'s ingest/apply/bgloop callers as its siblings. `internal/boundedwait/boundedwait.go:1-3` calls itself "the one piece of a background-loop shutdown that crosses package boundaries: bounded-wait-with-warn". `rg -n "boundedwait\.Wait" internal/server -g '!*_test.go'` shows three callers: `ingest.go:113`, `updatemanager.go:194` and `bgloop.go:37`.
   - **Why not reusing it may be right:** `boundedwait.Wait`'s contract is "the caller is responsible for making wg eventually reach zero". That fails here. A peer whose `handleWS` loop returns on `ctx.Done()` never reads its marker, so a WaitGroup-based drain would leave `Wait`'s watcher goroutine blocked forever.
   - **What's missing:** neither the comment nor Decisions says this. A newcomer who reads "like every other bounded shutdown wait in this package" will ask why it doesn't call the helper, and may "fix" it into a leak.
   - **Rule broken:** `docs/conventions.md` § Design, "reuse before add". A divergence needs its stated reason.
   - **A fix must make true:** either `drainOutboxes` uses `boundedwait.Wait` and every marker it enqueues is guaranteed to complete (including when `handleWS` exits first), or the code comment or a `design:` line says why the shared helper's contract does not fit here.

### Notes

1. **[note]** For review-work (doc truth): `web/src/features/CLAUDE.md`'s hand-written Owns line still defines `<owner><concern>.ts` files as "a pure decision with exactly one controller caller". `updaterestart.ts` is the one file with that name shape that is a controller. The diagram and the file header now say so, but this sentence does not. It is a doc-reconcile edit, not a code change.
2. **[note]** `safeSessionStorage()` sits in `features/updaterestart.ts:35-51`, while `web/src/storage.ts:1` calls itself "the one localStorage seam and safe-JSON helper pair".
   - The same throwing-accessor hazard applies to `theme.ts:49` (`= localStorage`) and `features/reader.ts:165` (`window.localStorage`). A second caller would look for the helper in `storage.ts`.
   - No change is requested while there is one caller.
   - For review-work: the web log's Fix Attempt 1 Changes table says the helper was added to `storage.ts`, but the diff does not touch that file.
3. **[note]** `initUpdateRestart(app, storage = safeSessionStorage())` (`updaterestart.ts:118-121`) is the only controller whose second parameter is a test seam rather than a named `<Name>Deps` (features/CLAUDE.md Gotcha "One `init<Name>(app, deps)` shape"). It's harmless: `main.ts` never passes it.
4. **[note]** For review-work: `UpdateConfig.Install`'s comment (`internal/server/update.go:33`) still says installer/unmanaged are "re-derived from it". They are re-derived by `Reclassify` from exePath/home, not from `Install`. This is carried over from cycle 1's Note 2.
5. **[note]** `networkCause`'s `strings.Contains(cause, "://")` (`failure.go:29`) is the one string check in a classifier whose `design:` line says "`errors.As` rather than string-matching". It guards the fallback text against a URL leak rather than classifying anything, and the Fix Attempt 2 `design:` line explains where it sits. No change requested.
6. **[note]** Concurrency:
   - `wsHub.log` is written once in `New`, before `Start` launches any goroutine.
   - `updateManager.install` is under `m.mu` at every read and write, and the guard is named at its declaration (`updatemanager.go:95-100`).
   - The gates' `go test -race -count=1 ./...` passed `internal/server` (152.1s, `02-test.log`).
   - `drainOutboxes` sends only on channels `closeAll` has already removed from `h.clients` under `h.mu`, and outbox channels are never closed, so the send cannot panic.
   - `reclassify`'s probe outside the lock can still finish out of order, as in cycle 1's Note 4. That is last-writer semantics shared with `available`/`checkedAt`, not a race.
7. **[note]** `ConnectionDeps.restartBanner` is wired to `updateRestart.bannerOverride` (`main.ts:85`). Renaming a method when passing it as a dep has a precedent in the same file: `promoteTile: tiles.promote`, `tilesLive: tiles.liveIds`.
8. **[note]** Size warnings on this branch (`14-size.log`), besides Minor 1:
   - `main.go` filelen 502: reason holds.
   - `updatemanager.go` filelen 551: reason holds now that reclassification is back inside the machine it belongs to.
   - `parseFlags`/`run` funlen: already over on main.
   - Test funlen hits (`TestClassify_Table`, `TestBuildServerConfig_…`, and two in `updatereclassify_test.go`) are outside this diff. No `dupl` hit.
   - For review-work: the test name `TestHandleCheckUpdate_ExactREQ8Message` (`updatereclassify_test.go:441`) carries a plan ID.
