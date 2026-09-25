# Review: settings-update-failures

**Plan**: settings-update-failures
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser needs-changes, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Settings Update Failures

**Plan**: settings-update-failures
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: `kb: pack 19804 words (budget 8000)` — WARN exceeds budget; sections rules 1984 · features 5124 · diagrams 4293 · decisions 3642 · proposed 1001 · facts 71 · lessons 3039 · runbooks 644

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 unwritable-dir remedy | Yes — `install.go` `unwritableRemedy` | Yes — `TestReclassify_UnwritableDirectory*`, E2 | pass |
| REQ-2 git-checkout remedy | Yes — `gitTreeRemedy`, `gitRootBelowHome` | Yes — `TestReclassify_GitTreeRemedy`, E1 | pass |
| REQ-3 Homebrew remedy unchanged | Yes | Yes — E9 regression pin, `TestClassify_Table` | pass |
| REQ-4 recheck at the start of every check | Yes — `checkAvailability` → `reclassify()` before `CheckNewer` | Yes — `…RunsBeforeEveryCheck`, E1/E2 | pass |
| REQ-5 broadcast once on change, never on no-change | Yes | Yes | pass |
| REQ-6 dev/homebrew never re-derived | Yes | Yes | pass |
| REQ-7 refusal and may-apply read the current kind | Yes — `install` under `mu`; handler reads `Remedy()` | Yes — D12 test | pass |
| REQ-8 502 wording | **Partly** — three classes right; the fourth ("anything else") reads `update check failed: update check failed: …` on the wire | Pure table only; the fourth class isn't tested through the handler | **fail** (Major 1, Major 2) |
| REQ-9 apply.error wording | Yes | Yes — pure table, HTTP layer, E4 | pass |
| REQ-10 no URL | **Partly** — a malformed `Location` puts the URL in the transport cause | INV-2 tests cover typed classes only | **fail** (Minor 1) |
| REQ-11 warn/debug logging | Yes | Yes | pass |
| REQ-12 `exe` on `musterd starting` | Yes | Yes — `TestLogStartup_*` | pass |
| REQ-13 restart record | Yes — `updaterestart.ts` | Yes | pass |
| REQ-14 restarting banner text | Yes — `computeBannerOverride` | Yes — W1 (review-browser watches it live, W11) | pass |
| REQ-15 30 s fallback | Yes | Yes — W2 at 30000 ms and 120000 ms | pass |
| REQ-16 reload on first hello, mismatch included | Yes — `onHelloArrived` fires before the version gate | Yes — `ws.test.ts`, W6/W7, E5 | pass (see Minor 3 on test assertions) |
| REQ-17 handoff confirmation for 3 s | Yes | Yes — INV-3 cases, E5 | pass |
| REQ-18 non-restarting phase drops the record | Yes | Yes | pass |
| REQ-19 neutral confirmation style | Yes — `.banner.neutral` uses only tokens | review-browser (W10) | pass (code) |
| DIAG | `kb:diagram/web-components` (stale, see Major 4), `kb:diagram/daemon-components`, `kb:diagram/containers` (both still true); the plan's inline state diagram matches `updaterestart.ts` | — | **fail** |

## Build & Tests

E2E tests: pass (451/451) · Daemon tests (race): pass (23 ok packages, 0 FAIL) · Web tests: pass (74 files / 1801) · Daemon build: pass · Web build: pass · Lint: pass (golangci 0 issues, Biome clean) — all read from $GATES_LOG_DIR

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D20 | `make test` | pass (deduped to baseline `make test-race`, 02-test.log) |
| D21 | `make lint` | pass (deduped to baseline, 03-lint.log) |
| D22 | `make test-race` | pass (deduped to baseline, 02-test.log) |
| D23 | `! rg -n "not installed by the muster installer" internal cmd web/src web/e2e` | pass (16-D23.log, empty) |
| W20 | `make web-build` | pass (deduped, 04-web-build.log) |
| W21 | `make web-test` | pass (deduped, 05-web-test.log) |
| W22 | `make web-lint` | pass (deduped, 06-web-lint.log) |
| W23 | `make contrast` | pass (deduped, 07-contrast.log — 43 pairs × 3 themes, 0 failures) |
| E20 | `make e2e` | pass (deduped, 15-e2e.log — 451 passed) |
| K1 | `make check-kb` | pass (deduped, 10-kb-check.log) |
| baseline | build, versions, e2e-honest, dead-refs, e2e-lint, features | pass (01, 08, 09, 11, 12, 13) |
| baseline | size-warn | WARN, 6 hits (14-size.log). That line belongs to review-maintainability |
| DOC | doc upkeep + Doc Delta vs what shipped | pass with drift. Four `proposed` ADRs exist with `refs: plan:settings-update-failures`; `update-install-rechecked-on-every-check` supersedes `update-install-kinds-decide-who-may-apply`. No `deviation:` lines need an ADR. No `doc-delta:` line is missing from the Doc Delta. The design-system §1/§6.7 upkeep landed in b63e4f8. The `TODO.md` move is scheduled for Completion, per the plan. Every Doc Delta sentence holds except protocol.md's "never a URL, a transport chain", which Major 1 and Minor 1 break (tagged to the code). `kb:diagram/web-components` is stale (Major 4) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W8 | no `any` in new web code | pass | `git diff af7a8dc..HEAD -- web/src` added lines: the only matches for `any` are the English word in a test title and a comment |
| W9 | `#banner` has one writer, `features/connection.ts` | pass | `rg '#banner\|bannerEl' web/src` (non-test): only `connection.ts:74,129,130`; `updaterestart.ts` returns data only |
| W10 | restarting banner keeps `--banner-*`; confirmation neutral | pass (code). Themes are review-browser's to check | `.banner` sets `--banner-bg/-line/-fg`; `.banner.neutral` (style.css:491) sets `--bg-raised`/`--line-control`/`--fg-muted` and is toggled only when `neutral: true`, which only the confirmation returns |
| W11 | restarting banner is seen during a real restart | code path present; observing it is review-browser's | `computeBannerOverride` returns the REQ-14 text while `record && status !== "connected" && < 30 s` |
| D14 | `install` read under `mu` everywhere; `make test-race` covers a recheck racing `Current` and `RequestApply` | **half fails** | Reads: every `m.install` access (`updatemanager.go:340,347,363,495`, `updatereclassify.go:21,30,31`) holds `mu` — pass. Racer: no test runs `reclassify` concurrently with `RequestApply`. `TestUpdateManager_Reclassify_DuringInFlightApplyLeavesItRunning` calls `reclassify()` only after `RequestApply` returns. It does overlap the apply goroutine's `emit → Current`. daemon-tests' own log says it left the racer to review ("not a substitute for D14's own targeted racer"). See Major 3 |
| D15 | no Go file outside `internal/selfupdate` composes release-host failure text or remedy wording | pass | `rg "couldn't reach\|install\.sh\|not a redirect\|release host\|couldn't download\|no signature\|can't update" internal cmd` (non-test, outside selfupdate): one hit, a comment at `updatemanager.go:21` |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: no Claude Code field names in the diff |
| 2 | Terminal-output state parsing | pass |
| 3 | Blocking hook handler | pass: not touched |
| 4 | Bare tmux / resize-pane | pass: no tmux invocation added |
| 5 | Payload logging | pass: new warn lines log update errors only |
| 6 | Empty-gauge dishonesty | pass: the confirmation shows only on a matching `update.running`; absent data gives `null` → nothing |
| 7 | Identity on `session_id` | pass: n/a |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary | pass |

## Issues

### Critical

None.

### Major

1. **[daemon-impl]** REQ-8's fourth class ("`update check failed: <message>` for anything else, e.g. no `Location` header") reaches the wire with the prefix twice. `checkAvailability` returns `fmt.Errorf("%w: %w", errCheckFailed, err)`, where `errCheckFailed` is `"update check failed"` (`updatemanager.go:27,235`). `handleCheckUpdate` passes that wrapped error to `selfupdate.DescribeCheckFailure` (`update.go:156`). The fallback branch (`failure.go` `return fmt.Sprintf("update check failed: %s", err.Error())`) then adds the prefix a second time.

   Measured against this tree with a `go test -overlay` scratch test (nothing written to the repo). A `/latest` that answers 302 with no `Location` returns:
   `status=502 message="update check failed: update check failed: latest release redirect carried no Location header"`.

   This contradicts REQ-8, D8 and the protocol.md 502 description. Fix: compose the fallback from the release-side error, not the server's wrapper. For example, unwrap past `errCheckFailed`, or have `handleCheckUpdate` hand `DescribeCheckFailure` the unwrapped selfupdate error.
2. **[daemon-tests]** D8 ("matches REQ-8 exactly for each named failure class") is tested through the HTTP layer for three of the four classes only (`TestHandleCheckUpdate_ExactREQ8Message`: transport, status, tag). The fourth class is tested only in `failure_test.go:108`, with a bare `errors.New(...)` that never goes through `checkAvailability`'s `errCheckFailed` wrap. That is why Major 1 passed a green suite. Add the no-`Location` case to `TestHandleCheckUpdate_ExactREQ8Message`, asserting the exact single-prefix sentence.
3. **[daemon-tests]** D14's second half is missing. No test runs `reclassify` concurrently with `RequestApply` and `Current` under `make test-race`: the D6 test calls `reclassify()` after `RequestApply` has returned. The plan makes this racer a criterion, and daemon-tests deferred it to review, which cannot write it. Add a racer: goroutines looping `checkAvailability`/`reclassify`, `RequestApply` and `Current` against a flipping `Reclassify` seam, run with `-race`.
4. **[orchestrator]** `kb:diagram/web-components` is stale after this plan. Its `features/` node reads "22 modules, 16 stateful per-feature controllers…", and `updaterestart.ts` makes 23 and 17. It draws `storage.ts` as reached only by `reader/` and `theme` ("by the reader's per-session memory and the first-paint theme hint only"). `features/updaterestart.ts` now imports `../storage` directly for the `sessionStorage` handoff: a new `features → storage` edge, and a second storage kind the prose doesn't mention. `docs/diagrams/` is the orchestrator's (orchestrate SKILL.md § doc-reconcile).
5. **[daemon-impl]** `internal/selfupdate/CLAUDE.md`'s hand-written **Exemplar** line is now false. It says ``release.go` — … sentinel errors whose text doubles as UI status``. After this plan, `release.go` returns typed `TransportError`/`StatusError`/`TagError` whose `Error()` text goes only to the log. The UI text is composed in `failure.go` (`DescribeCheckFailure`), which **Owns** also doesn't mention. The plan told daemon-impl to update this part if the package's responsibilities changed. Reword the exemplar and add failure-sentence composition to **Owns**.

### Minor

1. **[daemon-impl]** REQ-10 / INV-2: a malformed `Location` puts the URL, twice, into the transport-failure sentence. `net/http` fails the HEAD itself with a plain `fmt` error that has nothing to unwrap. `networkCause` → `innermostCause` returns that text verbatim.

   Measured with the same overlay scratch test, using `Location: https://github.com/Zalaras/muster/releases/tag/v1%zz`:
   `update check failed: couldn't reach the release host (failed to parse Location header "https://github.com/…/v1%zz": parse "https://github.com/…/v1%zz": invalid URL escape "%zz")`.

   GitHub is unlikely to send one, but REQ-10 is absolute. The innermost-cause fallback needs a guard against URL-bearing text, plus a failure_test case for it.
2. **[daemon-tests]** D10 / INV-1 names source states the cross-product in `TestUpdateManager_Reclassify_INV1HoldsAcrossSourceStates` never builds:
   - a startup kind of `unmanaged`: the constructed `Install` is always `installer`;
   - `done` with `installed` set: `installed` is never set.
   
   Add both dimensions.
3. **[web-tests]** W6/W7 assertions are weaker than their titles and the criteria:
   - W6 ("triggers the reload with the handoff written first") checks that the handoff was written and that `reload` was called, but not the order. A `reload` stub that records `storage.data` at call time would.
   - W7's title says "does not write the handoff again", but only `reload`'s call count is asserted. Count `setItem` calls on the fake storage.

### Notes

1. **[note]** Flake-fix soak not re-run. `2ea779e` fixed a daemon race, not a spec (no Repairs row, no TODO/plan flake entry), so §1's soak trigger isn't literally met. Evidence on the fix, all pasted in the logs:
   - two post-fix 250-execution soaks of `update.spec.ts`, by daemon-impl and by validate attempt 2;
   - `TestWSHub_CloseAllDeliversQueuedBroadcastBeforeClosing`, which fails 4/4 on the pre-fix `ws.go` and now runs in the gate's `make test-race`.
   
   Only `test-specs.md` changed after the soak.
2. **[note]** For review-browser. On a protocol-mismatch hello, `ws.ts` fires `onHelloArrived` (which calls `location.reload()`) and then still runs `onProtocolMismatch`. The mismatch screen is therefore rendered until navigation replaces the document, so it may flash. W6 as written is met.
3. **[note]** For review-browser. `connection.ts`'s new render phase rewrites `#banner.textContent` on every 1 s tick, even when the text is unchanged. The element is `role="alert"`, so while the daemon is down a screen reader may re-announce it every second. Before this plan the text was static markup.
4. **[note]** `initUpdateRestart(app, storage = sessionStorage)` reads the global in a default parameter, so a browser that throws on the `sessionStorage` accessor itself would throw at startup. That is the same precedent as `theme.ts`'s `= localStorage`, which already runs at first paint, so nothing new breaks.
5. **[note]** `wsapp.ts`'s one-line `onHelloArrived` relay has no direct unit test. Both ends are tested (`ws.test.ts`, `updaterestart.test.ts`), and E5 covers the full chain live.
6. **[note]** No `## Repairs` rows: validate found nothing to repair, and the E5 assertions are unchanged since authoring.

## Browser review

# Browser review: Settings Update Failures

**Plan**: settings-update-failures
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 11348 words (budget 8000) — WARN pack exceeds budget of 8000 words
**Rig**: tree at 73c3a09 (`make web-build build`, then helper-built `musterd` 0.1.0/0.2.0 from the same tree). Each cell got its own daemon from `helpers/fixtures.ts` `startDaemon`, with a space-bearing data dir `$TMPDIR/muster e2e-*`, a private `<data dir>/tmux.sock` and the helpers' stub `claude` (2.0.0-e2e-stub). The release host was the helpers' `FakeReleaseServer`. Headless Chromium ran at 1280×720, driven by a throwaway `web/e2e/zz-rbprobe.spec.ts`, since deleted. `git status` shows none of my files, and no `musterd` or tmux server is left running.

The gates log (0 failed lines: web-build, e2e 451 passed) says the app driven here is the one that will ship.

I timed banner behaviour with a `MutationObserver` recorder. It logs every change to `#banner`'s text, `hidden`, class and computed colours, plus the boxes of the banner, masthead and view, and the `/ws` frames, each with a timestamp, across page reloads. Cells marked "routed" proxied `/ws` through `page.routeWebSocket` to the real daemon. That let me inject an `update` message (`apply.phase: "restarting"`) and hold the socket down. The E2E suite cannot reach the 30 s, protocol-mismatch and version-mismatch paths any other way.

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-14 / W11 | focus | daemon-down (real Update and restart) | restarting banner seen, exact text, alarm tokens | pass | R1: visible from 1080 ms (`restarting` frame at 1077) to 4597 ms (hello). Text exact. bg `rgb(59,32,32)` fg `rgb(244,185,185)` border `rgb(92,47,47)` match dark `--banner-bg/-fg/-line` |
| REQ-14 | focus | daemon-down | placed between masthead and view, no overlap | pass | banner 0,46–1280,78; masthead bottom 46; `#view-focus` top 78; scrollWidth 1280 = clientWidth 1280 |
| REQ-14 / W11 | tiles | daemon-down (real, two windows) | restarting banner in each window | pass | R2: p1 visible 1341–2874 ms, p2 1342–2852 ms. Light tokens `rgb(251,232,232)/(122,31,31)/(229,182,182)` match. Banner 0,46–1280,78 over `#view-tiles` top 78 |
| REQ-14 | pop-out | any | — | N/A — `/doc.html` has no banner (`doc.ts:3`) and never wires `helloReceived` (`wsapp.ts`) | |
| REQ-14 | focus | data (record held, still connected) | banner stays hidden | pass | X1 (routed): 300 ms after injection `hidden=true`, computed `display:none` |
| REQ-14 | any | no data yet | — | N/A — no record can exist before an `update` message (plan § States) | |
| REQ-15 | focus | daemon-down (routed) | falls back to unreachable at 30 s; record still held | pass | X1: restarting shown 503 ms → unreachable at 31041 ms, i.e. 30.5 s after display. Text exact, alarm tokens. Return at 40 s still reloaded and confirmed |
| REQ-15 | tiles | daemon-down | fallback | [note] not measured separately — same view-independent `connection.ts` render phase; see Note 3 | |
| REQ-16 | focus | real restart | reloads on first hello | pass | R1: hello at 4594 ms → `load` at 4611 ms. Pre-click `window.__m` marker gone afterwards |
| REQ-16 | tiles | real restart, two windows | each window reloads | pass | R2: p2 hello 2850 → load 2863; p1 hello 2875 → load 2886; both markers gone |
| REQ-16 / edge 17 | focus | routed, hello `protocolVersion: 99` | reload happens before the mismatch screen | pass | X5: 2 loads; `#protocol-mismatch` stayed hidden until unload; marker gone |
| W7 | focus/tiles | reconnect | one reload per restart | pass | exactly one `load` per window after each restart (R1, R2, X1, X5–X7) |
| REQ-17 | focus | data (after real restart) | `Updated to v0.2.0.` shown, then hidden after 3 s | FAIL (duration) | text exact; shown 4643 ms → hidden 8623 ms = **3.98 s** (Minor 1) |
| REQ-17 | tiles | data (after real restart) | confirmation in both windows, 3 s | FAIL (duration) | p2 2902 → 6874 = **3.97 s**; p1 shown at 2937. Text exact in both (Minor 1) |
| REQ-17 | focus | no data yet (routed, first snapshot held 3 s) | handoff waits for the first snapshot | pass | X3: banner `display:none` and status `connecting…` for the 3 s hold. Confirmation 8 ms after the snapshot was released, then hidden after **3.96 s** (Minor 1) |
| REQ-17 / INV-3 | focus | second load of the same tab | nothing shown | pass | X3: `page.reload()`, banner hidden through 4 s |
| REQ-17 / edge 16 | focus | routed, record `9.9.9`, daemon runs 0.1.0 | reload, no confirmation | pass | X6: 2 loads, banner hidden through 4 s |
| REQ-17 / edge 18 | focus | `sessionStorage` get/set/remove throw | reload still happens, no confirmation | pass | X7: 2 loads, banner hidden |
| REQ-17 / edge 18 | focus | `window.sessionStorage` accessor throws (Chrome with site data blocked) | dashboard boots; reload path intact | **FAIL** | X8: no `/ws` opened (0), status line empty, one pageerror (SecurityError). With the daemon then killed, the banner stays hidden with empty text. With only `localStorage` throwing: connected, 1 `/ws` (Major 2) |
| REQ-18 / edge 20 | focus | routed: `restarting`, then `failed` while connected, then drop | record dropped; ordinary banner; no reload | pass | X4: text = unreachable; `window.__m` marker kept after reconnect |
| REQ-19 / W10 | focus | data | confirmation uses the neutral tokens — dark | pass | bg `rgb(31,34,40)` = `--bg-raised`, fg `rgb(193,197,204)` = `--fg-muted`, border `rgb(58,63,73)` = `--line-control` |
| REQ-19 / W10 | tiles | data | neutral tokens — light | pass | `rgb(251,250,247)/(65,69,79)/(203,201,194)` = light tokens |
| REQ-19 / W10 | focus | data | neutral tokens — instrument | pass | `rgb(23,26,36)/(178,182,195)/(52,58,74)` = instrument tokens |
| REQ-19 / W10 | focus | daemon-down | restarting and fallback keep `--banner-*` — instrument | pass | X1 `rgb(58,30,30)/(243,183,183)` = instrument `--banner-bg/-fg` |
| Banner, daemon down (unchanged) / INV-4 / edges 14, 23 | focus | daemon-down (SIGTERM, no record) | ordinary text, visible, placed; no reload on return | pass | X2: text exact, `display:block`, 0,46–1280,78 under masthead 0–46, view top 78. Marker kept after `restart()` |
| Banner, daemon down | focus | daemon-down | text written only on change | FAIL | X1 and X2: **11 mutation records in 5 s** with unchanged text (Minor 3) |
| Banner hidden | focus, tiles | data (connected) | `[hidden]` resolves to `display:none` | pass | R1 and R2 before the click: `hidden=true`, `display:none` |
| Edge 21 | tiles | real restart | several windows each reload and confirm | pass | R2 (see above) |
| Edge 22 | focus | real restart | Settings dialog closes on the drop | pass | R1: `dialog.open` true at 608 ms, false at the 1080 ms drop |
| §7 one live client | focus | after real reload | one tmux client per session | pass | R1: `totalAttachedClients` = 1 after 2 s; tmux `muster-1` survived the restart |
| REQ-2 | Settings over focus | data | git-tree remedy, exact text, matches oracle | pass | S1: text = `/api/state` `update.remedy`; buttons disabled |
| REQ-2 | Settings over focus | data | status line contained in the dialog | **FAIL** | S1: `#update-status` 437–957 vs dialog 420–860. Dialog scrollWidth 536 > clientWidth 438, `overflow-x:auto`. Theme and Rail-card controls clipped (Major 1) |
| REQ-1 | Settings over tiles | data (long space-bearing path) | not-writable remedy, exact text `(permission denied)` | pass | S2: text = `/api/state` remedy |
| REQ-1 | Settings over tiles | data | contained, at 1280×720 and 800×600 | **FAIL** | S2: 437–957 vs 420–860; at 800 wide 197–717 vs 180–620 (Major 1) |
| Edge 1 | Settings over focus | data | `.git` removed + Check now (pointer) enables Update and clears the line | pass | S1 after: Update/Update and restart enabled, text `""`, `/api/state` `install: installer`, `remedy: null` |
| Edge 2 | Settings over tiles | data | chmod 0755 + Check now (keyboard Enter) enables Update | pass | S2 after: enabled, text `""`, oracle `installer` |
| Edge 3 | Settings over focus | data | installer → chmod 0555 → Check now flips to unmanaged | pass (text) / FAIL (containment, Major 1) | S3: REQ-1 remedy exact, buttons disabled, oracle `unmanaged` |
| REQ-3 / edge 7 | Settings over focus | data | Homebrew remedy unchanged, contained, survives Check now | pass | S4: `installed by Homebrew — run brew upgrade musterd`; 437–843 inside 420–860; unchanged after Check now |
| REQ-8 | Settings over focus | data | each check-failure class, exact, equals the 502 body | pass | S5 and S7: `…(connection refused)`, `…(host not found)`, `…(timed out)` (10.4 s), `the release host answered 404, not a redirect`, `the latest release tag "nightly-build" is not a release version`. Each equals the 502 `check_failed` message and is contained (437–843) |
| REQ-9 | Settings over focus | data | apply failures with the `Update failed: ` prefix | pass | S6 and S7: `couldn't download musterd_0.2.0_darwin_amd64.tar.gz (connection refused); nothing was installed`, `…musterd_0.3.0_darwin_amd64.tar.gz (status 404)…`, `couldn't download checksums.txt.minisig (status 404) — this release has no signature, refusing to apply`. Each equals `/api/state` `apply.error` and is contained |
| REQ-10 | Settings | data | no `://` in any check or apply failure | pass | 8 classes above, `hasURL=false` in every one |
| Status line | Settings | daemon-down | — | N/A — the dialog closes on every drop (edge 22) | |
| Status line | Settings | no data yet | — | [note] not measured — see Note 4 | |
| REQ-4–7, 11–13 | — | — | — | N/A — daemon-side (review-work); their visible effects are the edge 1–3 rows | |

## Issues

### Critical

None.

### Major

1. **[web-impl]** When any `unmanaged` remedy is shown, the Settings dialog overflows horizontally and clips its other controls. The remedy's longest unbreakable tokens are wider than the form column. In the `#settings-form .hint` font (11.25px mono), the install URL is 488 px and a macOS temp-dir path is 582 px, against a 406 px column. `overflow-wrap` is `normal`, so the grid item's min-content width widens the whole form. Measured: `#update-status` 437–957 against the dialog's 420–860; dialog `scrollWidth 536 > clientWidth 438` with `overflow-x: auto`. The screenshot shows the Theme "Light" button, the Rail-card "Both" button and both hint paragraphs cut off at the dialog edge. It also happens at 800×600.
   - The URL token was in the old remedy too, so the defect predates the plan. But the URL alone exceeds 406 px, so every unmanaged remedy hits it, including #53's own `/usr/local/bin` case. This plan's new path tokens make it wider.
   - E1 and E2 assert text only, so they could not fail for this.
   - `web/src/style.css` `#settings-form .hint` (or `#update-status`). A fix must make the status line's right edge ≤ the dialog's content edge and the dialog's `scrollWidth == clientWidth` with the REQ-1/REQ-2 remedy shown, e.g. with `overflow-wrap: anywhere`.
2. **[web-impl]** The dashboard no longer boots when the `window.sessionStorage` accessor throws, which is what Chrome does when site data is blocked. `initUpdateRestart(app, storage = sessionStorage)` (`web/src/features/updaterestart.ts:87`) evaluates the global in its default parameter, and `main.ts` calls it before `new WsClient`.
   - Measured, X8: accessor throwing gives 0 `/ws` opens and an empty connection status. After the daemon was killed, the banner stayed hidden with empty text, so daemon-down is never surfaced in this configuration.
   - With only `localStorage` throwing, the same page connected (1 `/ws`, status `connected`) and showed the unreachable banner on kill. So `sessionStorage` is the new failure point: it is the only `sessionStorage` reference in `web/src`.
   - Edge 18 says a throwing `sessionStorage` still reloads. W5 covers a throwing `StorageLike` object but not a throwing accessor.
   - A fix must read the global inside a try, so a throwing accessor degrades to "no handoff" and the dashboard still connects.

### Minor

1. **[web-impl]** The `Updated to v….` confirmation stays up about 4 s, not REQ-17's 3 s. Measured 3.98 s (R1), 3.97 s (R2 p2), 3.96 s (X3) and 3.99 s (X1). The hide depends on `main.ts`'s 1 s `setInterval(app.render)`. The confirmation starts about 20–30 ms after the interval's phase, so the tick at ~3 s always sees less than 3000 ms elapsed, and the tick at ~4 s hides it. This is `web/src/features/connection.ts`'s render phase combined with `updaterestart.ts`. A fix must hide it within about 100 ms of 3 s, e.g. a render scheduled at `startedAt + 3000`.
2. **[e2e-specs]** E5 could not fail for Minor 1 or Major 1. Its `await expect(banner).toBeHidden()` inherits the 15 s expect timeout, so a confirmation lasting anywhere up to about 15 s passes. E1 and E2 assert only `toHaveText` on `#update-status`, never its box against the dialog. `web/e2e/update.spec.ts` E5, E1, E2.
3. **[web-impl]** The `role="alert"` banner is rewritten every second while its text does not change. There were 11 mutation records in 5 s during a plain daemon-down (X2) and during the restarting display (X1). Each tick sets `textContent` (a node replacement) and sets `hidden`. Before this plan the text was static markup and `renderBanner` ran only on a status change. An alert region whose text node is replaced every tick can be re-announced by assistive technology. I did not measure that here (headless, no screen reader). `web/src/features/connection.ts` onRender, `web/src/render/banner.ts`. A fix must write text, class and `hidden` only when they change, so a steady daemon-down produces 0 mutations.

### Notes

1. **[note]** W11: the restarting banner is not sub-second in a real Update and restart. It stayed up 1.5–3.5 s (R2 and R1), until the first backoff reconnect reached the new daemon, and I observed it directly in two themes and both views.
2. **[note]** After a keyboard Enter on Check now, `document.activeElement` was `BODY` 1.2 s later. The button disables itself for the duration of the check (an earlier plan's behaviour), and `render/update.ts` is untouched by this diff. This predates the plan; no change requested here.
3. **[note]** REQ-15 was measured in focus only. The 30 s decision is `connection.ts`'s single view-independent render phase, and REQ-14's tiles cell showed the same element and box.
4. **[note]** I did not measure the Settings dialog before the first snapshot. The plan changes nothing about the dialog's no-data rendering.
5. **[note]** Pop-out (`/doc.html`): it has no banner and gets no `update` messages, so a pop-out open across an update restart keeps its old bundle. That is out of this plan's scope (and `docs/protocol.md` § hello already names it); I did not measure it.
6. **[note]** R2 had two windows open in Tiles and `totalAttachedClients` read 2, one per window. That is outside this plan, and R1 (one window) read 1.
7. **[note]** I did not re-measure E4's on-disk byte identity. That is a filesystem fact, and E4 is green in the gates log. The refused-download text itself was measured (S7).

## Maintainability review

# Maintainability review: Settings update failures

**Plan**: settings-update-failures
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 16072 words (budget 8000) — WARN pack exceeds budget; sections rules 1938 · features 5124 · diagrams 4293 · decisions 3642 · proposed 0 · facts 71 · lessons 354 · runbooks 644. The pack carried no § Design, so it was read directly from `docs/conventions.md:110-141`.
**Scope**: 22 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`. 5 of them are `CLAUDE.md` files where only the generated `kb:hash` changed, so 17 were read as code.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/main.go | preflight.go, onexit.go | n/a (plumbing) | filelen 502, reason holds; funlen `parseFlags`/`run` both on main already, statement count unchanged here | Major 1 (REQ refs) |
| internal/selfupdate/apply.go | verify.go, lock.go, release.go, CLAUDE.md | yes (typed errors) | — | Major 1, Minor 3 |
| internal/selfupdate/failure.go (new) | verify.go, release.go, apply.go | yes | — | Major 1, Minor 3 |
| internal/selfupdate/install.go | exeversion.go, semver.go | partial (Reclassify covered only by the server-side line) | — | Major 1 |
| internal/selfupdate/release.go | apply.go, CLAUDE.md exemplar line | yes | — | Major 1, Minor 3 |
| internal/server/update.go | updatewire.go, usage.go | yes (via updatereclassify line) | — | Minor 2 |
| internal/server/updatemanager.go | updatewire.go, usagepoll.go, ingest.go, bgloop.go | yes | filelen 504, reason contradicted by the extraction (Minor 4) | Major 1, Minor 4 |
| internal/server/updatereclassify.go (new) | usage.go / usagewire.go / usagepoll.go, updatemanager.go | yes | — | Major 1, Minor 2, Minor 4 |
| internal/server/ws.go | ingest.go, terminal.go (`closeAll`), server.go (`Shutdown`), internal/boundedwait | yes (drain marker) | — | Minor 1 |
| web/src/app.ts | wsapp.ts | yes (hello wiring) | — | Major 1, Minor 5 |
| web/src/features/connection.ts | connectionrestore.ts, connectionversion.ts, tiles.ts, focus.ts | yes | — | Major 1, Minor 6 |
| web/src/features/updaterestart.ts (new) | update.ts, updateview.ts, usage.ts, theme.ts, features/CLAUDE.md | partial (signature and wiring only, not the module itself) | — | Major 1, Major 2, Minor 6 |
| web/src/main.ts | (composition root) | n/a | — | pass |
| web/src/render/banner.ts | render/masthead.ts, render/update.ts | yes | — | Major 1, Note 5 |
| web/src/style.css | (itself) | n/a | — | pass (REQ-number comments already there on main) |
| web/src/ws.ts | wsapp.ts | yes | — | Major 1, Minor 5 |
| web/src/wsapp.ts | ws.ts, app.ts | yes | — | Major 1, Minor 5 |

## Issues

### Critical

None.

### Major

1. **[daemon-impl] [web-impl]** Plan-ID comments are back in production code. Last cycle's cleanup removed them from both trees on purpose.
   - **What the diff adds:** about 45 `REQ-N` / `W-N` / "plan settings-update-failures" references in comments across 12 production files:
     - `internal/selfupdate/{apply,failure,install,release}.go`
     - `internal/server/{updatemanager,updatereclassify}.go`
     - `cmd/musterd/main.go:448`
     - `web/src/{app,ws,wsapp}.ts`
     - `web/src/features/{connection,updaterestart}.ts`
     - `web/src/render/banner.ts`
     - Examples: `updatereclassify.go:14-19` "(REQ-4 …) (REQ-6) … (REQ-5) … (REQ-7)"; `updaterestart.ts:43` "table-tested directly (web-tests W1, W2, W5)"; `updaterestart.ts:91` "// W7: …".
   - **Why it matters:** `ws.go:130-132` also narrates history ("observed once in 250 soak runs"). On main, `git grep -c "REQ-[0-9]" main -- internal cmd web/src ':!*_test.go' ':!*.test.ts'` finds these only in `style.css` and two test-helper packages. Commits `49fcb2b` ("replace plan-ID comments in server and the adapters with the why or a kb citation") and `40eb7de` (the same across `web/src`) removed exactly this pattern on 2026-09-24.
   - **Why a reader can't use them:** `plans/` on main holds dozens of plans, each with its own REQ-4, so the pointer can't be followed. The sibling comments in the same files cite kb records, e.g. `updatemanager.go:149` "(kb:adr/update-install-kinds-decide-who-may-apply)".
   - **Rule broken:** `docs/conventions.md` § Comments: cite `kb:fact/<slug>` / `kb:adr/<slug>`, don't narrate history.
   - **A fix must make true:** no production Go/TS comment added by this branch names a plan REQ, a test-spec ID or a soak run. Each one either states the why or cites the kb record (four proposed ADRs exist for this plan: `update-failure-one-sentence-chain-in-log`, `update-install-rechecked-on-every-check`, `update-remedy-names-path-and-cause`, `update-restart-reloads-dashboard`).

2. **[web-impl]** `web/src/features/updaterestart.ts` is a stateful controller, but its name follows the pattern `features/` reserves for pure helpers.
   - **What `features/CLAUDE.md` says:** "one controller per feature"; `<owner><concern>.ts` files are "a pure decision with exactly one controller caller" (`actionscopy.ts`, `connectionrestore.ts`, `connectionversion.ts`, `launchcrumbs.ts`, `launchrestore.ts`, `updateview.ts`); "The name matches the server handler file, E2E spec prefix and helper (kb:adr/process-one-name-per-feature)".
   - **What the file actually is:** `updaterestart.ts` reads as update.ts's second helper beside `updateview.ts`. It is in fact a 17th controller:
     - `initUpdateRestart(app, storage)` at :85
     - three `app.on` subscriptions, one of them on `"update"` exactly as `update.ts` already has
     - module state (`record`, `confirmation`, `reloaded`, `handoffChecked`)
     - `location.reload()`
     - registered in `main.ts:45`
   - **Missing design line:** the web Decisions cover `computeBannerOverride`'s signature, the hello wiring, the deps typing and `renderBanner`. None covers the choice of a new controller rather than extending `update.ts`, or its name. A newcomer who knows the directory's convention would open the wrong file.
   - **A fix must make true:** the module's placement and name match `features/CLAUDE.md`'s controller/helper split, or a `design:` line says why the update feature has two controllers and why the second is named like a helper.

### Minor

1. **[daemon-impl]** `internal/server/ws.go:140-160`: `drainOutboxes` gives up silently when its bound expires. Every other bounded shutdown wait in the package logs a warning.
   - **Sibling shape:** `ingest.go:113` `boundedwait.Wait(ctx, &q.wg, q.log, "ingest queue drain did not finish before shutdown deadline")`, `updatemanager.go:180` and `:182` do the same. The package doc at `internal/boundedwait/boundedwait.go:1-8` names "bounded-wait-with-warn" as the shared shape.
   - **How this one differs:** `drainOutboxes` returns on `closeDrainTimeout` with no log line. It has no logger, and it ignores the `ctx` that `Server.Shutdown(ctx)` (`server.go:315`) already has.
   - **Missing design line:** the Decisions line compares it with a per-client `WaitGroup` but says nothing about `boundedwait` or the silent give-up.
   - **Why it matters:** the one failure this drain exists to prevent (a queued restarting-phase `update` not reaching a peer) took a 250-run soak to find. When the bound fires in production, it leaves no trace.
   - **A fix must make true:** a drain that hits its bound is observable in the daemon log like its siblings, or Decisions says why this one wait is silent. It must also say either that the bound comes from the shutdown ctx or why it has a fixed timeout of its own.

2. **[daemon-impl]** `internal/server/updatereclassify.go:5-10` and `updatemanager.go:52-56`: the seam claims a model it does not follow.
   - **What the comment says:** the doc comment calls `reclassifyFunc` "docs/conventions.md § Testing's constructor-default run seam", then says it is "threaded through updateManagerConfig".
   - **What that section actually says:** "The constructor sets the production run func … the composition root never passes a run func" (kb:adr/process-adapter-run-seam-constructor-default).
   - **What the code does instead:** production reclassification is built in `cmd/musterd/main.go:180-182` and passed through `resolveInstall` (now five return values) → `buildServerConfig` (now eight params) → `UpdateConfig.Reclassify` → `updateManagerConfig.Reclassify`. The nil default "returns Install unchanged", so every same-package test manager silently has no reclassification.
   - **Why the stated reason doesn't hold:** "it needs runtime values only cmd/musterd resolves" is contradicted for `exePath`, which `UpdateConfig.ExePath` (`update.go:36-38`) already carries into the manager as `m.exePath`. Only `home` is missing.
   - **A fix must make true:** either production reclassification is the constructor's default, built from values the manager already holds (plus whatever it still lacks), or the comment and `design:` line stop claiming the constructor-default model and state a reason that holds.

3. **[daemon-impl]** `internal/selfupdate` now has two ways of producing user-facing failure text, and one sentence is written twice.
   - **The two ways:**
     - verify.go's sentinels still "double as UI status" (`internal/selfupdate/CLAUDE.md:12`, the package exemplar; `DescribeApplyFailure` falls back to `err.Error()` for them at `failure.go:76`).
     - The six new typed errors carry a log-only `Error()` while `failure.go` composes a separate wire sentence.
   - **The duplicate:** "this release has no signature, refusing to apply" is spelled out in `apply.go:69` (`MissingSignatureError.Error`) and again in `failure.go:71`. That is two places that must agree (§ Design "One owner per concept").
   - **Missing design line:** the `design:` line justifies typed errors over string matching, but not the split with the package's stated exemplar. A newcomer adding a seventh failure can't tell which way to write it.
   - **A fix must make true:** each user-facing failure sentence has one home. Decisions or code say which of the two ways a new selfupdate failure takes (the stale exemplar line in `CLAUDE.md` is review-work's; see Note 2).

4. **[daemon-impl]** `internal/server/updatereclassify.go` (37 lines, one `updateManager` method plus its seam type): the reason for extracting it contradicts the reason given for not splitting `updatemanager.go` further.
   - **Reason A:** the extraction's `design:` line says it matches the `usage.go`/`usagewire.go`/`usagepoll.go` "one file per concern" split.
   - **Reason B:** the size reason for `updatemanager.go` (504 lines) says the file "holds one cohesive state machine (checks, …)" and "splitting further would fragment that machine".
   - **Why they conflict:** `reclassify()` is step one of `checkAvailability` (`updatemanager.go:226`). It writes `m.install` under `m.mu`, and its own doc points back at "every other read of m.install in updatemanager.go". It is part of that machine, not a separate concern like `usagewire.go`'s wire shape. The sibling seam type `probeVersionFunc` stays in `updatemanager.go:30-36`, so the two seam types now live apart.
   - **A fix must make true:** the file layout and the two Decisions reasons agree. This is not a request to split anything (kb:adr/process-size-linters-warn-never-fail). If reclassification belongs to the machine, it can live there and the filelen warning can stand with its reason.

5. **[web-impl]** One signal now has two names: `WsClientHandlers.onHelloArrived` (`ws.ts:41`) is relayed as `app.emit("helloReceived")` (`wsapp.ts:88`, `app.ts:62`).
   - **Sibling shape:** every other relay in `wsapp.ts` keeps one name end to end: `onUsage`→`"usage"`, `onUpdate`→`"update"`, `onPrefs`→`"prefs"`, `onClaudeTheme`→`"claudeTheme"`, `onDocChanged`→`"docChanged"`, `onShellActivity`→`"shellActivity"`.
   - **Why it matters:** grepping one name misses the other end.
   - **A fix must make true:** the handler and the event share one name (§ Design "Match the siblings").

6. **[web-impl]** The daemon-down clause "hook output in open panes is Muster's absence, not session failure." is written out in two modules: `features/connection.ts:14` (`DAEMON_DOWN_TEXT`) and `features/updaterestart.ts:40` (`restartingText`).
   - **Rule broken:** § Design "One owner per concept": two places that must agree will not.
   - **A fix must make true:** the shared clause has one home that both banner texts draw from. The "no controller imports a sibling" invariant (`features/CLAUDE.md`) constrains where that home can be.

### Notes

1. **[note]** Size warnings read against their reasons:
   - `cmd/musterd/main.go` filelen 502 (492 on main): reason holds (plumbing for the new closure and `exe` log field).
   - `main.go` funlen `parseFlags` (41) and `run` (44): both over on main already. `parseFlags` is untouched and `run` only has existing statements edited, so there's nothing to explain.
   - Test funlen `TestClassify_Table` (86 lines on main → 102) and `TestBuildServerConfig_MapsEveryFlagOntoTheServerConfig` (63 → 70): both already over on main, grown by table rows. No `dupl` hit in the size log.
2. **[note]** For review-work (doc truth), no change requested here:
   - `internal/selfupdate/CLAUDE.md:12`'s exemplar "sentinel errors whose text doubles as UI status" no longer describes `release.go`.
   - `TransportError.Error()` (`release.go:24`) drops the URL that the old `"requesting %s: %w"` put in the log chain, which kb:adr/update-failure-one-sentence-chain-in-log says the log keeps.
   - `UpdateConfig.Install`'s comment (`update.go:31-34`) says installer/unmanaged are "re-derived from it"; they are re-derived from exePath/home.
3. **[note]** For review-work's DIAG row: `kb:diagram/web-components` still says `features/` is "22 modules … 16 stateful per-feature controllers, plus 6 DOM-free helpers". It is now 23 modules / 17 controllers. The diagram also has no `features → storage` edge, though `updaterestart.ts` imports `../storage` (and `storage.ts:1` still calls itself "the one localStorage seam" while now carrying a `sessionStorage` use too).
4. **[note]** Concurrency on `updateManager.install`:
   - **What's fine:** the guard is named where the field is declared (`updatemanager.go:83-86`), and every reader and writer I found takes `m.mu` (`installKind`, `Remedy`, `RequestApply:363`, `Current`, `reclassify`). The gates' `go test -race -count=1 ./...` covers the paths.
   - **The remaining gap:** a logical ordering gap, not a data race. `reclassify` probes outside the lock (`updatereclassify.go:27`), so a manual check and a tick overlapping across a permission change can finish in reverse order. The earlier probe's stale result then wins until the next check.
   - **Why no finding:** `available`/`checkedAt` in the same function already have the same last-writer semantics.
5. **[note]** `render/banner.ts` gained `renderBannerContent` beside `renderBanner` rather than one builder taking the view-model, and the stated reason is keeping a web-tests file compiling unmodified. That's a test-ownership reason shaping a production API; it's harmless at two call sites.
6. **[note]** Reuse checks that came back clean:
   - `rg -n "errors\.Unwrap|Timeout\(\)|net\.DNSError|\"timed out\"|host not found|DeadlineExceeded" internal cmd -g '!*_test.go' -g '!internal/webui/**'` finds only `failure.go` (plus two comments in `tmux.go`). `networkCause`/`innermostCause` duplicate nothing.
   - The `wsDrainAck` marker reuses `ingest.go:27-30,98-100`'s `drainAck` shape, as its `design:` line says.
   - `updaterestart.ts` reuses `storage.ts`'s `readJson`/`writeJson`/`removeItem` and `protocol/decode.ts`'s `isRecord` rather than rolling its own.
