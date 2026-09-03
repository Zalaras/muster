# Review: file-drop-fix

**Plan**: file-drop-fix
**Cycle**: 2
**Verdict**: approved

Every cycle-1 blocker is closed and closed properly. `make e2e` is green across four
full-suite runs I ran this cycle (214 passed each, zero skipped), on top of the three the
e2e-specs agent ran and the orchestrator's gates run. All eight authored acceptance checks
pass, including `make test`, which was red last cycle. I re-drove the whole gesture in a
real browser and re-measured the outline colour, the notice, focus, the tty round trip and
the on-disk invariant — all hold. No implementation code changed this cycle, so the code
review below is confined to the four test/doc commits plus a re-verification of the
cycle-1 findings.

Three Minors carry over unfixed by design (their agents were tagged with Minors only and
so were not spawned). They do not block; they belong in `TODO.md` at completion.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 foreign drag never navigates away | Yes | Yes (E5 + dropguard unit) | pass |
| REQ-2 files → locate → paste escaped + space | Yes | Yes (E1, E2, browser-verified) | pass |
| REQ-3 exactly-one-match or 404/409, no writes | Yes | Yes (D4–D6, D15, D16 now complete) | pass |
| REQ-4 Terminal.app escaping | Yes | Yes — `*` now pinned in W4 | pass |
| REQ-5 Spotlight then walk, byte-compare, dedupe | Yes | Yes (D7–D9, D11) | pass |
| REQ-6 notice per outcome | Yes | Yes (E3, E4, in-flight test) | pass with Minor 1 |
| REQ-7 50 MiB cap both sides | Yes | Yes (E7, D13) | pass |
| REQ-8 dead / not-connected surfaces | Yes | Yes — E9 clause now falsifiable | pass |
| REQ-9 internal reorder drags untouched | Yes | Yes (rail-order + views, real `dragTo`) | pass |
| REQ-10 text drop pastes verbatim | Yes | Yes (E6) | pass |
| REQ-11 focus into xterm after paste | Yes | Yes (E1/E11, browser-verified) | pass |
| REQ-12 drop-target class + copy cursor | Yes | Not tested (Nice to Have) | pass (browser-verified) |

## Build & Tests

E2E tests: **pass** — 214 passed, 0 skipped, 0 failed, in each of 4 full-suite runs
Daemon tests: **pass** — every package `ok`, including `internal/locate` and `internal/server`
Web tests: **pass** (711 in 24 files)
Daemon build: pass
Web build: pass
Lint: pass (0 issues)

## Acceptance Checks

Run verbatim from the repo root.

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | **pass** (was red in cycle 1 — see Note 1) |
| D2 | `go build ./...` | pass |
| D3 | `make lint` | pass — 0 issues |
| D17 | `! rg -n -e '"github.com/Zalaras/muster/internal/(server\|session\|claudecode)"' internal/locate/` | pass |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass (711) |
| W3 | `make contrast` | pass — 43 pairs × 3 themes, 0 failures |
| E1 | `make e2e` | pass — 214 passed (plus 3 further `npm run e2e` sweeps, all 214) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D4–D15 | each has a dedicated daemon test | pass | carried from cycle 1; unchanged by the delta |
| D16 | data dir **and** walk root unchanged after every outcome | **pass** (was partial) | `dataDirSnapshot` added and asserted in all four `OutcomesMatchLocatorResult` subtests and in `NeverWritesUploadToDisk`; the different-bytes subtest gained its before/after pair; `dirSnapshot` now keys on a SHA-256 of file contents, so an in-place same-size rewrite fails it. The data-dir snapshot is non-vacuous — `newTestServer` puts a real `muster.db` in a temp dir and the session row is written before the snapshot is taken, so WAL/SHM exist on both sides |
| W4 | `escapePath` escapes every listed character and nothing else | **pass** (was partial) | the hand-typed `raw` literal is now `` ` \\!"#$&'()*,;<=>?[]^\`{|}~` `` — 25 characters, matching REQ-4's list and the implementation's `ESCAPED_CHARS` exactly, with `*` restored between `)` and `,` |
| W5 | `classifyDrop` precedence | pass | unchanged |
| W6 | notice strings exact | pass | unchanged; re-confirmed in the browser this cycle |
| W7 | no `any` in new web code | pass | unchanged |
| W8 | `pasteText` false + sends nothing when socket not OPEN | pass | `canPasteNow()` still gates before `term.paste`; no unit test, defensible (cycle-1 Note 1) |
| W9 | guard never re-prevents | pass | unchanged |
| E2–E11 | each has a dedicated E2E test | **pass** (was partial) | E9's dead clause replaced with a page-wide `getByText("anything.png")` count-0 check plus a `role="status"` text sweep against this plan's own notice phrases |
| INV-1 | nothing pasted except from a 200; no candidate skips byte-compare | pass | `verifyCandidates` remains the single producer of returned paths; `Locate` falls through to the walk only when a finder yields zero *verified* candidates |
| INV-2 | no `os.WriteFile`/`os.Create`/`os.MkdirAll` in locate code | pass | grep clean, now also pinned by the data-dir snapshot, and re-measured on disk this cycle |
| REQ-9/INV-3 | guard and surface both bail on internal drags | pass | guard checks `defaultPrevented`; surface checks `types.includes(DRAG_MIME)` |
| Design-system §7.5 | notice in the frame, never restyles pane contents | pass | re-measured: `position: absolute`, `--scrim` on `--fg`, 11px, a sibling of `.terminal-body`, no xterm selectors |
| Hard rule | no Claude Code knowledge in locate/handler | pass | no `claudecode` import; the feature reads no hook or status-line data |

## Repairs Table Verification

`test-specs.md`'s `## Repairs (fix attempt 1)` claims "No assertion was deleted, skipped,
or weakened." Verified against the diff:

- **Repair 1** is `test.describe.configure({ mode: "serial" })` and touches no assertion.
  Every one of the 11 tests still asserts what it asserted before.
- **Repair 2** strictly strengthens: the replaced clause was true by construction, the new
  one fails on a real leak. `getByText` matches hidden elements too, so a notice that
  leaked but stayed `hidden` still trips it.

Swept the whole diff for the failure modes that make a green suite lie: no `test.skip`,
no `test.fixme`, no assertion collapsed into a container-level `toBeVisible()`, no fixture
payload drift. The E9 regex's apostrophes are ASCII, matching the notice strings in
`web/src/terminal/drop.ts` — it would really match a leak, not silently miss one.

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass (no hook changes) |
| 4 | tmux always on a dedicated socket | pass (no tmux in new code) |
| 5 | No payload logging | pass |
| 6 | No empty-gauge dishonesty | pass |
| 7 | Session identity on the tmux target | pass |
| 8 | No settings trespass | pass |
| 9 | No real `claude` outside canary | pass (`-claude-bin` stub) |

## Manual Verification

Drove the feature in a real Chromium against a real scratch `musterd`, real tmux and the
stub `claude`, through a temporary harness I created, ran and deleted (the tree is clean).
Measured, not inferred:

**REQ-12, mid-drag.** After `dragover` alone, the surface carried `.drop-target` with a
computed outline of `rgb(52, 58, 74)` at 1px. That is `--line-control`, the neutral token
the design system names for drag/drop outlines, not a state colour.

**REQ-2 / REQ-4 / REQ-11, full gesture.** Dropped `review copy (2).txt`. The pane received

```
/private/var/folders/.../muster-e2e-repo-DIFd4q/review\ copy\ \(2\).txt
```

with the space and both parentheses backslash-escaped, exactly REQ-4's set.
`activeElementInsideTerminal` was true afterwards, and the page URL was unchanged.
Pressing Enter produced the `stub-echo:` round trip, so the paste really went out over the
socket as typed input.

**REQ-6, notice lifecycle.** On success the notice went back to `hidden` with empty text.
Its computed style: `position: absolute`, background `rgba(8, 9, 13, 0.72)` (`--scrim`),
colour `rgb(232, 230, 225)` (`--fg`), 11px, `role="status"`. Then dropped a file whose
bytes exist nowhere; the notice read exactly

```
Can't locate ghost-review.png on disk — paste its path instead
```

matching the Testable UI Elements row glyph for glyph, em dash included.

**INV-2 on disk.** The session directory listed `[".claude", "review copy (2).txt"]` both
before and after the locate requests. The upload was never staged.

**Not verified.** A genuine Finder drag still cannot be driven from a browser automation
harness, so the OS-to-browser leg is unverified by me or by any test. Inherent to the
feature, unchanged from cycle 1.

## Issues

### Critical

None.

### Major

None.

All five cycle-1 Majors and the one Critical are closed:

- **Critical 1 (`make e2e` flaky)** — closed. `test.describe.configure({ mode: "serial" })`
  on `drop.spec.ts` cut this file's peak scratch-daemon load. Eight consecutive green
  full-suite runs since the fix (three by e2e-specs, one by the orchestrator's gates, four
  by me), against three failures in six runs before it. The follow-up for the three
  marginal assertions in other plans' specs is recorded in `TODO.md`, correctly not fixed
  here.
- **Major 1 (`*` missing from W4's table)** — closed, character list now complete.
- **Major 2 (D16's data-dir half untested)** — closed, and the two smaller gaps I named
  alongside it (size-only snapshot, unsnapshotted different-bytes subtest) were closed too.
- **Major 3 (E9's unfalsifiable clause)** — closed with a genuinely falsifiable
  replacement.
- **Major 4 (`docs/protocol.md` §3.14 unwrapped error bodies)** — closed; both snippets now
  carry the `{"error": {…}}` envelope and match what I measured on the wire, and the same
  correction was applied to the plan's own contract section.
- **Major 5 (red `make test` gate)** — a `TODO.md` entry now owns it. See Note 1.

### Minor

1. **[web-impl]** Carried from cycle 1, unrouted. The in-flight notice auto-hides after 5 s
   while the request is still running. `web/src/terminal/pane.ts` — `showNotice` arms the
   same 5 s timer for every non-null text, including `locatingText(...)`. REQ-6 ties the
   ~5 s hide to the failure text only; the in-flight notice is meant to persist while the
   request is in flight. Reachable in real use: the Spotlight step alone can take 2 s and
   the walk can then exhaust 200 000 entries. Arm the timer only for the failure branch.
2. **[daemon-impl]** Carried from cycle 1, unrouted. `Locator.walkCap` and
   `Locator.spotlightTimeout` (`internal/locate/locate.go:43-44`) are set by `New()` and
   never read anywhere — re-grepped this cycle to confirm. The values that act are baked
   into `SpotlightFinder` and `WalkFinder` at construction. Drop the fields, or have
   `Locate` use them.
3. **[daemon-impl]** Carried from cycle 1, unrouted. A nil `Locator` panics the handler:
   `internal/server/locate.go:66` dereferences `s.locator` with no guard, and
   `Config.Locator`'s own comment invites tests to leave it nil. A two-line guard returning
   `500 internal_error` turns a panic into a diagnosable error.

### Notes

1. **[note]** `make test` passed cleanly for me this cycle, every package `ok`. Cycle 1
   measured it red on both this branch and `main`, always at exactly 2.00 s in the
   `TestPreflight_*` / `TestRunTmuxPreflight_*` families and always green under `-p 1`.
   That it passes now is consistent with the diagnosis — the failure is load-dependent
   subprocess contention against the preflight's 2 s timeout, not a deterministic break.
   The `TODO.md` entry the orchestrator added stays correct and should stay open: an
   intermittently red gate is still a broken gate. No change requested in this plan.
2. **[note]** Serial mode changes what a red `drop.spec.ts` reports. Playwright skips the
   remaining tests in a serial group after the first failure, so a future regression in the
   first of these 11 tests will mask the other 10 rather than listing them. The suite still
   goes red, so nothing is hidden from the gate. Serial is the right idiom here — Playwright
   has no per-file worker cap, and the alternative of sharing one scratch daemon would break
   the top-of-sort assumption the file documents. Recording the trade-off, not asking for a
   change.
3. **[note]** `TestHandleLocateFile_FinderErrorReturnsInternalError` builds a real
   `locate.New()`, so `make test` now shells out to the machine's actual `mdfind` — the
   first automated code path that does. It is deterministic: Spotlight can only short-circuit
   the walk by returning a candidate that is byte-identical to a 34-byte fingerprint, and a
   missing or slow `mdfind` degrades to the walk by design, which is the error path the test
   wants. Worth knowing that this one test's runtime now depends on the local Spotlight
   index. Cycle-1 Note 4 (nothing exercises real Spotlight *query syntax*) still stands —
   this test never reaches the parser.
4. **[note]** Cycle-1 Notes 2, 3 and 5 carry forward unchanged: `classifyApiFailure`'s
   unreachable "matches 0 identical files" fallback, the unreachable path-separator branch
   in the handler, and the two commendable calls (`r.MultipartReader()` making INV-2
   structural, and the `application/x-muster-drag-id` MIME change that made edge case 1
   solvable).
5. **[note]** `TODO.md`'s #8 entry is still unticked and `SPEC.md` still has no
   `file-drop-fix` changelog entry. Both are the orchestrator's Completion step and are
   expected to be outstanding at review time. `docs/protocol.md` is fully reconciled — §3.14,
   the §8 milestone-map row and the changelog line are all in place and now match measured
   behaviour.
6. **[note]** No user-facing document contradicts this plan. Searched `README.md` and
   `docs/` for drag/drop claims: the only statements about the feature are in
   `docs/protocol.md` §3.14, which I verified against the wire.

---

# History — cycle 1

**Plan**: file-drop-fix
**Cycle**: 1
**Verdict**: needs-changes

The feature itself is well built. I drove it in a real browser against a real daemon and
the whole chain works end to end: a dropped file's original path is located, escaped
Terminal.app-style, pasted at the cursor and focus lands in the pane. The daemon never
stages the upload — I verified that on disk, not just in the diff. Two things block:
`make e2e` now fails about half the time, and three acceptance criteria have gaps in the
tests that are supposed to pin them.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 foreign drag never navigates away | Yes | Yes (E5 + dropguard unit) | pass |
| REQ-2 files → locate → paste escaped + space | Yes | Yes (E1, E2, browser-verified) | pass |
| REQ-3 exactly-one-match or 404/409, no writes | Yes | Yes (D4–D6, D15, D16 partial) | pass |
| REQ-4 Terminal.app escaping | Yes | Partial — `*` unpinned in W4 | pass (impl); see Major 1 |
| REQ-5 Spotlight then walk, byte-compare, dedupe | Yes | Yes (D7–D9, D11) | pass |
| REQ-6 notice per outcome | Yes | Yes (E3, E4, in-flight test) | pass with Minor 1 |
| REQ-7 50 MiB cap both sides | Yes | Yes (E7, D13) | pass |
| REQ-8 dead / not-connected surfaces | Yes | Partial — E9 clause vacuous | pass (impl); see Major 3 |
| REQ-9 internal reorder drags untouched | Yes | Yes (rail-order + views, real `dragTo`) | pass |
| REQ-10 text drop pastes verbatim | Yes | Yes (E6) | pass |
| REQ-11 focus into xterm after paste | Yes | Yes (E1/E11, browser-verified) | pass |
| REQ-12 drop-target class + copy cursor | Yes | Not tested (Nice to Have) | pass (browser-verified) |

## Build & Tests

E2E tests: **fail** — 3 failures across 6 full-suite runs (see Critical 1); 214 tests
Daemon tests: **fail** — `make test` red, but identically red on `main` (see Major 5)
Web tests: pass (711)
Daemon build: pass
Web build: pass
Lint: pass (0 issues)

## Acceptance Checks

Run verbatim from the repo root.

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | **fail** — pre-existing, identical on `main` (Major 5) |
| D2 | `go build ./...` | pass |
| D3 | `make lint` | pass |
| D17 | `! rg -n -e '"github.com/Zalaras/muster/internal/(server\|session\|claudecode)"' internal/locate/` | pass |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass (711) |
| W3 | `make contrast` | pass (43 pairs × 3 themes, 0 failures) |
| E1 | `make e2e` | **fail** — 3 of 6 runs (Critical 1) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D4–D15 | each has a dedicated daemon test | pass | read all four test files; each criterion maps to a named test, and five were mutation-checked to prove they are not vacuous |
| D16 | data dir **and** walk root unchanged after every outcome | **partial** | walk root snapshotted in 3 of 4 outcomes; data dir never snapshotted (Major 2) |
| W4 | `escapePath` escapes every listed character and nothing else | **partial** | impl set is correct (25 chars); the unit table omits `*` (Major 1) |
| W5 | `classifyDrop` precedence | pass | 6 cases incl. files-wins-over-text and the reorder MIME |
| W6 | notice strings exact | pass | all six asserted with explicit `\u2026`/`\u2014` escapes; confirmed in the browser |
| W7 | no `any` in new web code | pass | grepped drop.ts, dropguard.ts, pane.ts, api.ts |
| W8 | `pasteText` false + sends nothing when socket not OPEN | pass | verified by reading `pane.ts:270-279`; `canPasteNow()` gates before `term.paste`. No unit test exists (Note 1) |
| W9 | guard never re-prevents | pass | dropguard.test.ts spies `preventDefault` |
| E2–E11 | each has a dedicated E2E test | pass | read drop.spec.ts; E9's third clause is vacuous (Major 3) |
| INV-1 | nothing pasted except from a 200; no candidate skips byte-compare | pass | `verifyCandidates` is the single producer of returned paths and every candidate passes `os.ReadFile` + `bytes.Equal` before `append`; UI pastes only `result.value.path` |
| INV-2 | no `os.WriteFile`/`os.Create`/`os.MkdirAll` in locate code | pass | grep clean, and confirmed on disk after six live requests (see Manual Verification) |
| REQ-9/INV-3 | guard and surface both bail on internal drags | pass | guard checks `defaultPrevented`; surface checks `types.includes(DRAG_MIME)` |
| Design-system §7.5 | notice in the frame, never restyles pane contents | pass | measured a 21 px bottom strip on a 790 px surface; a sibling of `.terminal-body`, no xterm selectors touched |
| Hard rule | no Claude Code knowledge in locate/handler | pass | no `claudecode` import; the feature reads no hook or status-line data |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass (no hook changes) |
| 4 | tmux always on a dedicated socket | pass (no tmux in new code) |
| 5 | No payload logging | pass — the new daemon code logs nothing at all |
| 6 | No empty-gauge dishonesty | pass |
| 7 | Session identity on the tmux target | pass (`parseSessionID`, numeric id) |
| 8 | No settings trespass | pass |
| 9 | No real `claude` outside canary | pass (`-claude-bin` stub) |

## Manual Verification

I ran a scratch `musterd` (own data dir, own tmux socket, stub `claude`) and drove the
dashboard in a real Chromium.

**Full gesture on a live pane.** Dispatched a real `dragover` then `drop` carrying a
`File` onto `.terminal-surface`. On `dragover` the surface gained `.drop-target` with a
computed outline of `rgb(52, 58, 74)`, which is `--line-control` — REQ-12 confirmed, and
the rule is byte-identical to the existing `.tile.drop-target`. On `drop` the pane
received `/private/.../mv/repo/my\ file.txt` with the space backslash-escaped, and
`document.activeElement` became the xterm helper textarea inside the surface (REQ-11).
The notice cleared on success. This chain is not covered by E2E, which dispatches `drop`
alone with no preceding `dragover`.

**Notice rendering.** Measured on the live surface: `position: absolute`, 21 px tall,
full surface width, flush to the bottom, `rgba(8, 9, 13, 0.72)` (`--scrim`) behind
`rgb(232, 230, 225)` (`--fg`), mono at 11 px. It is a strip, not a scrim, and the pane
stays readable. Both the in-flight and the not-located strings rendered exactly as the
Testable UI Elements table specifies.

**In-flight notice auto-hides mid-request.** Delayed `/locate` by 8 s and sampled the
notice. It read `Locating my file.txt…` at 0.5 s, 3.0 s and 4.9 s, then went `hidden`
with empty text at 5.4 s and stayed hidden at 7.0 s while the request was still pending.
See Minor 1.

**Real wire formats.** `curl` against the live endpoint for all six outcomes:

```
200  {"path":"/private/.../mv/repo/review-drop.txt"}
409  {"error":{"code":"ambiguous","message":"2 identical files named dup.txt","paths":["…/a/dup.txt","…/b/dup.txt"]}}
404  {"error":{"code":"not_located","message":"no file named ghost.txt with identical contents was found"}}
400  {"error":{"code":"invalid_request","message":"request has no file part"}}
404  {"error":{"code":"unknown_session","message":"unknown session id"}}
401  {"error":{"code":"unauthorized","message":"missing or invalid auth cookie; relaunch Muster"}}
```

`paths` came back absolute and sorted. Every error uses the standard envelope.

**INV-2 on disk.** After those six requests the data dir held only `muster.db*`,
`tokens.json`, `hook.sh` and `status-line.sh`; the session directory held only my own
fixtures; and no `multipart-*` spool file existed in `TMPDIR`. The upload never touched
disk. This is the strongest evidence for INV-2 in the whole cycle, because the daemon
tests snapshot sizes only and never look at the data dir or the temp dir.

**Real Spotlight.** No automated test ever runs the real `mdfind` — the unit tests stub
`run`/`lookPath` and E2E scratch dirs live under `os.tmpdir()`, which Spotlight does not
index. I ran the shipped `BuildQuery` output against the real binary. A plain query
returned the single correct absolute path, one per line, matching the parser. The D10
apostrophe form, `kMDItemFSName == 'it\'s-probe.txt' && kMDItemFSSize == 20`, also
returned the right file — so the escaping is correct against the real `mdfind`, not just
against the pinned string. Probe files were created on the Desktop and removed.

**Not verified.** A genuine Finder drag cannot be driven from a browser automation
harness, so the OS-to-browser leg of the gesture is unverified by me or by any test. That
is inherent to the feature, not a gap anyone can close.

## Issues

### Critical

1. **[e2e-specs]** `make e2e` fails about half the time on this branch, and the cause is
   the added test load, not the implementation. Measured over eleven full-suite runs:

   | Configuration | Runs | Failures |
   |---|---|---|
   | branch, full suite (214 tests) | 6 | 3 |
   | branch, suite minus `drop.spec.ts` (203) | 3 | 0 |
   | `main`, full suite (203) | 5 | 0 |

   A different spec failed each time, none of them this plan's, and each passes in
   isolation:
   - `web/e2e/terminal.spec.ts:77` — line 91 asserts `MUSTER-STUB-READY` on the default
     5 s expect timeout, while the same assertion at lines 64 and 111 in that file uses
     `{ timeout: 15_000 }`.
   - `web/e2e/theme.spec.ts:498` — `expect.poll` on the default 5 s; 21 of the 25 polls
     in that file carry no explicit timeout.
   - `web/e2e/actions.spec.ts:632` — a tmux geometry race, `expected "80", received
     "84"` at line 728.

   Diagnosis: `drop.spec.ts` adds 11 tests that each spawn their own scratch `musterd`
   plus tmux session, raising peak contention on a 12-core machine at 6 workers enough to
   tip assertions that were already marginal. `retries: 0` in `web/playwright.config.ts`
   means one tip is a red suite. The branch-minus-drop column exonerates the source
   changes by measurement, which is why this is not routed to `[web-impl]`/`[daemon-impl]`
   despite the failures landing in specs this plan did not author — there is no
   implementation regression for them to fix.

   Recommended fix, in scope and confined to this plan's own file: give `drop.spec.ts` a
   shared scratch daemon instead of one per test, or mark it
   `test.describe.configure({ mode: "serial" })`. Either cuts the added peak load. Giving
   the three marginal assertions the explicit 15 s timeout their siblings already use
   would fix the latent fragility for everyone, but it edits three other plans' specs, so
   raise it as a follow-up rather than doing it here.

### Major

1. **[web-tests]** W4's character table omits `*`, so the criterion is not met.
   `web/src/terminal/drop.test.ts:16` — `raw` is `` ` \\!"#$&'(),;<=>?[]^\`{|}~` ``,
   which jumps from `)` straight to `,`. The plan's set has `*` between them, the
   implementation's `ESCAPED_CHARS` has it, and the E2E oracle's hand-typed set has it —
   only this table is missing it, and `*` appears nowhere else in the file. The comment
   above the literal says it is deliberately typed out to be an independent check of
   REQ-4's list, which is exactly why a dropped character matters. Add `*` to `raw` and
   `\\*` to `expected`.

2. **[daemon-tests]** D16's data-dir half is never tested. The criterion is "the data dir
   **and** walk root contain exactly the files they did before", but `dirSnapshot` is only
   ever called on the session directory; `internal/server/locate_test.go` has
   `filepath.Dir(srv.dbPath)` available and no test looks at it. Two smaller gaps in the
   same criterion: the snapshot records relative path and size only, so an in-place
   same-size modification passes (INV-2 says "creates or modifies"), and D15's
   `404 not_located` different-bytes subtest carries no before/after snapshot while the
   other three do. Snapshot the data dir by **file set only, not sizes** — the SQLite WAL
   grows during a request and a size-keyed snapshot there would flake.

3. **[e2e-specs]** E9's "no notice" assertion cannot fail.
   `web/e2e/drop.spec.ts` asserts `deadSurface.locator(".terminal-notice")` has count 0,
   but `#dead-surface` is static markup in `web/index.html:78-90` and `.terminal-notice`
   is created only in `TerminalSurface`'s constructor, which never runs for that subtree.
   The clause is true by construction regardless of behaviour. This came out of Repair 2
   in `test-specs.md`, whose last column claims the assertion "still asserts 'no notice
   element inside the dead surface at all'" — technically true, but unfalsifiable, and
   verifying that last column is exactly what the E2E Validate step is for. The other two
   assertions in the test (URL unchanged, zero `/locate` requests) are genuine and do
   cover REQ-8's substance, so the requirement is not unverified — but this clause earns
   nothing. Replace it with something that can fail, for example asserting that no element
   anywhere on the page carries any of the drop notice strings after the drop.

4. **[orchestrator]** `docs/protocol.md` §3.14 states the wrong wire format for two error
   bodies. It shows `404 not_located` as
   `{ "code": "not_located", "message": … }` and `409 ambiguous` as
   `{ "code": "ambiguous", "message": …, "paths": [...] }`, both unwrapped. I measured the
   daemon on the wire: both come back inside the standard `{"error":{…}}` envelope (see
   Manual Verification). The unwrapped snippets also contradict §2's own global rule,
   `Errors (HTTP, non-2xx): {"error": {"code", "message"}}`. Wrap both snippets in
   `"error": { … }`. This is the contract document for a shipped endpoint, so it needs to
   be right; the daemon's behaviour is correct and should not change.

5. **[orchestrator]** `make test` (acceptance check D1) is red, and it is red on `main`
   too — this is not a defect of this plan, but the gate is broken and nothing in the
   pipeline owns it. Measured identically on both: `cmd/musterd`
   `TestRunTmuxPreflight_{TooOldNamesDetectedAndMinimum,UnrecognizedVersionIsNotFatal,OKPrintsNothing}`
   and `internal/tmux` `TestPreflight_{TooOld,ExactlyMinVersionIsOK,NewerDoubleDigitMinorIsOK,UnrecognizedVersionIsNotFatal,UppercaseProgramNamePrefixIsNotTrimmed}`,
   all failing at exactly 2.00 s under default parallelism and all passing under `-p 1`.
   Both impl agents and daemon-tests flagged this as pre-existing; the measurement against
   `main` confirms them. Worth a `TODO.md` entry rather than a fix in this plan.

### Minor

1. **[web-impl]** The in-flight notice auto-hides after 5 s while the request is still
   running. `web/src/terminal/pane.ts:281-300` — `showNotice` arms the same 5 s timer for
   every non-null text, including `locatingText(...)`. REQ-6 ties the ~5 s hide to the
   failure text only: the in-flight notice is meant to persist "while the request is in
   flight". Measured with an 8 s delayed `/locate`: the notice went hidden at 5.4 s and
   stayed hidden while the request was still pending. This is reachable in real use — the
   Spotlight step alone can take 2 s and the walk can exhaust 200 000 entries after that.
   Arm the timer only for the failure branch.

2. **[daemon-impl]** `Locator.walkCap` and `Locator.spotlightTimeout`
   (`internal/locate/locate.go:41-43`) are set by `New()` and never read — the values that
   act are the ones baked into `SpotlightFinder` and `WalkFinder` at construction. The log
   explains they exist to match the plan's literal struct shape, but a config field that
   does nothing invites a future change that sets it and expects an effect. Drop them, or
   have `Locate` use them.

3. **[daemon-impl]** A nil `Locator` panics the handler. `Config.Locator`'s comment says
   "tests that never exercise the endpoint may leave this nil", and `main` always sets it,
   but a nil pointer reaching `s.locator.Locate` dereferences on `l.finders`. A two-line
   guard returning `500 internal_error` turns a panic into a diagnosable error.

4. **[daemon-tests]** The `500 internal_error` branch has no test. The ingredients are
   both there — `TestWalkFinder_UnreadableRootIsARealError` and
   `TestLocate_WrapsAndReturnsARealFinderError` — but nothing drives the handler with a
   chmod-000 session directory to assert the status and code. It is the one Protocol
   Contract code with no server-side coverage.

5. **[daemon-tests]** `TestBuildQuery`'s "non-ASCII name is passed through unescaped" case
   feeds `"Bildschirmfoto.png"`, which is pure ASCII. It duplicates the plain-name case
   and tests nothing about non-ASCII handling, which edge case 14 does care about. Use a
   name with actual non-ASCII characters.

6. **[web-tests]** Two misleading titles in `web/src/terminal/drop.test.ts`. Line 27 reads
   "escapes ':', '@', '+', '=' per REQ-4's explicit examples" but its assertion,
   `escapePath("a:b@c+d=e") === "a:b@c+d\\=e"`, shows only `=` is escaped — the title is
   false about three of its four characters. Line 22 mentions tildes in a path that
   contains none. Both would lead a maintainer to "fix" correct code.

7. **[orchestrator]** Plan defect: REQ-4's prose contradicts its own character list. The
   list has `~` and `=` but not `:`, `@`, `+`; the sentence after it reads "`/`, `.`, `-`,
   `_`, `~` inside a name, `:`, `@`, `+`, `=` is escaped", which parses as claiming `:`,
   `@` and `+` are escaped and `~` is not. The implementation follows the list and is
   correct. The prose is what produced Minor 6's test title. Worth correcting so the next
   reader does not resolve it the wrong way.

### Notes

1. **[note]** W8 has no unit test, and that is defensible. `pasteText` lives in a DOM
   module; `web/vitest.config.ts` runs in the default node environment and its own header
   says "Vitest covers logic only … interaction and rendering are Playwright's job", so a
   `TerminalSurface` harness would cut against a settled convention. The plan's
   Reviewer-Verified section assigns W8 to "read the pane/guard code", which I did, and
   the E2E socket-not-open test covers the observable effect. No change requested.

2. **[note]** `classifyApiFailure`'s `error.paths?.length ?? 0` can render "matches 0
   identical files", which is a false statement. It needs a 409 without a valid `paths`
   array, which the daemon never sends, and web-tests deliberately pinned the fallback.
   Not worth churning two agents' files over an unreachable case — recording it in case
   the contract ever loosens.

3. **[note]** The `strings.Contains(filename, "/")` branch in
   `internal/server/locate.go:109` is unreachable: `multipart.Part.FileName()` runs
   `filepath.Base` first. daemon-tests found this, documented it honestly in the test file
   rather than papering over it, and the observable contract still holds. Keeping cheap
   defensive code is the right call.

4. **[note]** Nothing automated exercises the real `mdfind` — the primary discovery path
   in actual use. The unit tests stub the runner and E2E scratch dirs are outside
   Spotlight's index by design. I closed this by hand this cycle (see Manual
   Verification), but it will silently rot: a Spotlight query-syntax change would fail
   only into the walk fallback, with no test going red. Worth remembering, not worth a
   test that depends on the machine's index state.

5. **[note]** Two commendable calls. Reading the multipart part via `r.MultipartReader()`
   instead of `ParseMultipartForm` makes INV-2 structural rather than incidental — no
   accounting mismatch can spill the upload to a temp file. And changing `DRAG_MIME` to
   `application/x-muster-drag-id` was necessary, not cosmetic: with the old `text/plain`
   value, `dataTransfer.types` at `dragover` time cannot distinguish an internal reorder
   from a real dragged-text selection, so edge case 1 was unsolvable as the plan literally
   worded it. Nothing reads the value, and `rail-order.spec.ts` and the `views.spec.ts`
   tile tests drive real HTML5 drags via `locator.dragTo`, so the new MIME is proven in a
   genuine drag gesture, not just a synthetic dispatch.

6. **[note]** `TODO.md`'s #8 entry is still unticked and `SPEC.md` has no `file-drop-fix`
   changelog entry. Both are the orchestrator's Completion step and are expected to be
   outstanding at review time; listing them so the backstop does not lose them.
