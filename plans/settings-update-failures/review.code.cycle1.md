# Correctness review: Settings Update Failures

**Plan**: settings-update-failures
**Verdict**: needs-changes
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
