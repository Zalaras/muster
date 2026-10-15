# Review: claude-version-watch

**Plan**: claude-version-watch
**Verdict**: needs-changes
**Cycle**: 2
**Gates**: 0 failed
**Parts**: code, browser | skipped: maintainability
**Part verdicts**: code approved, browser needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: claude-version-watch

**Plan**: claude-version-watch
**Part verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 18569 words (budget 30000)

Scope: this cycle reviews the delta `6790b78a..HEAD`. That covers REQ-5 (065eade5 CSS, c72e3184 E2E), REQ-6 (b9d41560 fix, 80ba1741 tests), the plan additions in eb893278 (plus TODO.md and proposed-backlog.md), and the doc-reconcile commits 9969bce0 and 00c0137b, which landed after cycle 2 approved. REQ-1 to REQ-4 were verified in cycles 1 and 2, and the delta does not touch their code. Their rows below rest on those cycles plus this cycle's green gate run.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes (cycles 1–2; untouched by delta) | Yes: E1 `claude-version.spec.ts:178` | pass |
| REQ-2 | Yes (cycles 1–2; untouched) | Yes: E1 `:178` | pass |
| REQ-3 | Yes (cycles 1–2; `tick`'s identity/check path unchanged apart from the unresolved log call) | Yes: D2 | pass |
| REQ-4 | Yes (cycles 1–2; untouched) | Yes: D1 / E1 `:136` | pass |
| REQ-5 | Yes. `web/src/style.css:335-339`: `.claude-version { display: inline-block; min-width: calc(27ch + 1px); text-align: right; }`. The reservation is the 27-character "Claude installation unknown" in the masthead's mono face, with content right-aligned. Because it is `min-width`, a longer version string grows rather than clips. | Yes: `claude-version.spec.ts:199`. It waits for the exact unknown text, takes Settings x, waits for the live flip with no reload, then asserts `toBeCloseTo(before.x, 2)`. test-specs.md records it red without the rule (92.27 px shift). It passed in 18-E1 and 17-e2e. | pass |
| REQ-6 | Yes. `internal/server/claudeversion.go:118,148-158`: when the identity cannot be resolved, the line warns "could not resolve the claude binary; keeping the last claude code version result" with the held `status`, `floor` and `verified`, adds `installed` only when the held value has one, and carries the resolution error. It still logs once per unresolved stretch. | Yes: `TestClaudeVersion_UnresolvableIdentityLogsOncePerUnresolvedStretch`. The first stretch has `status:"unknown"` and no `installed`. The second stretch has `status:"verified"` and `installed:<floor>`. The old message never appears on this path. `_UnknownOutcomeNeverFailsStartup/missing_binary` expects the new message, and the two `--version` failure cases still expect the old one. | pass |
| DIAG | `kb:diagram/web-components`, `kb:diagram/daemon-components` (from `kb for` on `style.css` and `claudeversion.go`). Both are module/package level. A CSS rule and a log-line function change neither. | — | pass |

## Build & Tests

E2E tests: pass (849, 8.9m, 17-e2e.log) · Daemon tests (race): pass (02-test.log, 25 packages ok) · Web tests: pass (2622 in 93 files, 05-web-test.log) · Daemon build: pass (01-build.log, empty) · Web build: pass (04-web-build.log; chunk-size warning only) · Lint: pass (03-lint.log 0 issues; 06-web-lint.log clean). All read from `$GATES_LOG_DIR` (`gates-claude-version-watch-c5`, 0 failed lines). Baseline lines: contrast 0 failures on all three themes; versions fresh; kb check 0 problems; e2e-lint clean; features-scope ok; comment-checks clean; comment ledger 3/3 kept; e2e-honest and features-inventory pass with empty output. The `WARN size` line belongs to review-maintainability, which is skipped this cycle.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| E1 | `cd web && npx playwright test e2e/claude-version.spec.ts` | pass (8 passed, 18-E1.log; includes REQ-5 test `:199`) |
| D1 | `go test -count=1 ./cmd/musterd/ ./internal/server/` | pass (19-D1.log) |
| D2 | `go test -count=1 -run 'ClaudeVersion' ./internal/server/` | pass (20-D2.log) |
| D3 | `make lint` | pass (deduped to 03-lint) |
| W1 | `make web-lint` | pass (deduped to 06-web-lint) |
| W2 | `make web-test` | pass (deduped to 05-web-test) |
| DOC | doc upkeep + Doc Delta vs what shipped | FAIL. The REQ-6 `doc-delta:` line (`daemon-implementation.md:75`) is not in plan.md § Doc Delta. `doc-delta.md` still asserts the old message, and doc-reconcile already promoted that wording to `docs/features/connection/spec.md:74-76`, which is now false (correctness Major 1, `[orchestrator]`, known pending). Everything else passes. #81/#89 are in `todo-done.md`. The third proposal is filed in `TODO.md:186`, and all three decisions are recorded in `proposed-backlog.md`. The delta logs carry no `deviation:` line. Cycle 2 Note 3 is resolved by 9969bce0: the connection spec's `refs:` names `kb:adr/connection-claude-version-watched-and-pushed` and its `protocol:` names `ws.claude-code`. The issue-spec sentence from 00c0137b ("the daemon's latest result at capture time") holds against `issuesnapshot.go`. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | No `claude` subprocess runs on the request path or before `Listen`; the identity look is a stat. | pass | Delta changes only the log call in `tick`'s identify-error branch (`claudeversion.go:118`); `identify` remains `claudecode.ResolveBinaryIdentity`, `check` runs only from `tick` on the bg loop. Unchanged from cycle 2's verification. |
| RV2 | The new feature follows `themepoll.go`: registered in `New`, no logic in `server.go`. | pass | `server.go:222` unchanged in the delta; the new `logUnresolvedClaudeCode` lives in the feature file. |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. The delta adds no Claude-Code wire knowledge outside `internal/claudecode/`. The log fields are Muster's own `ClaudeCodeInfo`. |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hooks | pass (not touched) |
| 4 | tmux via `-L muster` / sizing | pass (not touched) |
| 5 | No payload logging | pass. The new warn line logs version fields and a path-resolution error, never a hook payload. |
| 6 | Empty-gauge honesty | pass. REQ-6 logs `installed` only when held, so the line never carries an empty string. The readout's unknown text is still rendered as the words. |
| 7 | Identity on tmux target | pass (not touched) |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary | pass. The REQ-5 E2E uses the stub with `stubClaudeVersionDelaySeconds: 7`. |

## Delta (delta re-review only)

Not a Minors-only delta re-review. Cycle 2 closed with no Minors. This cycle reviews the new REQ-5/REQ-6 work and the post-approval doc-reconcile commits, as listed in the scope line above.

| Prior item | Fix commit | Verified how |
|------------|------------|--------------|
| cycle 2 correctness Note 1 (unresolved warn says `status: unknown` while a value is held), promoted to REQ-6 | `b9d41560`, `80ba1741` | diff read. The new message carries the held status and installed version. The test asserts both stretches. |
| cycle 2 correctness Note 3 (connection spec `refs:`/`protocol:` missing the ADR/anchor) | `9969bce0` | diff read. Both lists updated. kb check is green. |
| cycle 1 browser Note 2 (masthead shifts ~92 px on a live flip), promoted to REQ-5 | `065eade5`, `c72e3184` | diff read. The E2E pins Settings x across the flip and is recorded red without the rule. |

## Issues

### Critical

None.

### Major

1. **[orchestrator]** The Doc Delta still promises the old unresolved-binary message. `daemon-implementation.md:75` carries a `doc-delta:` line for REQ-6 that plan.md § Doc Delta does not reflect. `plans/claude-version-watch/doc-delta.md` still asserts: A daemon that cannot resolve `claude` logs "could not determine claude code version" once per unresolved stretch. doc-reconcile already promoted that sentence to `docs/features/connection/spec.md:74-76`, and since b9d41560 it is false. The daemon now logs "could not resolve the claude binary; keeping the last claude code version result" with the held result's `status`, plus `installed` when one is held. Fix: replace that line in `doc-delta.md` (and add it to plan.md § Doc Delta), then re-run doc-reconcile so the connection spec matches. You listed this as known pending work. It does not block approval.

### Minor

None.

### Notes

1. **[note]** Nothing in the Doc Delta covers REQ-5. No spec sentence becomes false, because the connection spec does not describe the readout's width. If the reconcile pass wants the behaviour recorded, add one clause to the connection spec's readout paragraph: "the readout holds the width of its widest text, so the masthead controls do not move when it changes". No change is requested.
2. **[note]** `internal/server/claudeversion.go:68`: the comment says "seen and haveSeen belong to the loop goroutine alone", but `unresolved` (line 71) is also loop-only and sits under the same comment. The comment is incomplete rather than false, and this delta did not introduce it.

## Browser review

# Browser review: claude-version-watch

**Plan**: claude-version-watch
**Part verdict**: needs-changes
**Cycle**: 3
**Pack**: kb: pack 6774 words (budget 30000)
**Rig**: `bin/musterd` built by `make web-build build` at 52881104 (embedded dashboard), driven through the committed `startDaemon` fixture: per-test data dir `$TMPDIR/muster e2e-XXXXXX` (space-bearing), tmux socket `<data dir>/tmux.sock` (killed by the fixture's teardown), the e2e stub `claude` with `MUSTER_E2E_STUB_VERSION_DELAY_SECONDS` 7 or 25; headless Chromium through two throwaway specs (30 tests, all run in the foreground, both deleted). No real `claude` was run. `git status` shows nothing of mine.

Gates log c5: 0 failed lines. `17-e2e` is 849 passed, including `masthead-layout.spec.ts:74` at 1512 and 1440 px.

Delta scope: this cycle covers REQ-5 only (065eade5, `.claude-version { display:inline-block; min-width: calc(27ch + 1px); text-align:right }`), the one web change since my cycle-1 approval. REQ-1–4 and the cycle-1 matrix rows are unchanged, and I did not re-measure them. REQ-6 is a daemon log line with no browser consequence: N/A.

## Matrix

Hosts: the readout sits in the masthead, which Focus and Tiles share. `/doc.html` has no masthead, so every pop-out cell is N/A. States:
- **pre-hello**: the "claude unknown" placeholder.
- **unknown**: "Claude installation unknown", the widest text.
- **version**: "claude 2.1.300", verified, no glyph.
- **version+glyph**: "claude 2.0.0 ⚠", below the floor.
- **daemon-down**: the scratch daemon SIGTERMed.

Two masthead loads:
- **Empty gauges**: no session, so the usage readouts are empty.
- **Full gauges**: the same load as `masthead-layout.spec.ts:74`. 5h at 100% and 7d, each with an other-day reset, plus the model-week bar and its selector.

Every x below is a `getBoundingClientRect().left`. "Seen" rows come from a MutationObserver on `#claude-version`, installed before the page script ran. It recorded Settings' x at every text change of a live, never-reloaded page.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-5 | focus | pre-hello → unknown → version+glyph, empty gauges, 1900/1512/1280/1000/900/640 | Settings, Issue and refresh hold their x across the live flip | pass | Seen: one Settings x per width across all three texts. Settings 1558.9 / 1186.9 / 954.9 / 699.8 / 699.8 / 699.8. Issue 1485 / 1121 / 889 / 634 and refresh 1444.8 / 1088.8 / 856.8 / 601.8, identical before and after. Pre-REQ-5 control (the rule overridden in the same page): Settings 955.9 → 1048.1 at 1280, the cycle-1 Note 2 movement |
| REQ-5 | tiles | same, empty gauges, the same six widths | same | pass | after a pointer click on Tiles (`aria-pressed=true`) before the flip, every x is identical to the Focus row |
| REQ-5 | focus | pre-hello → unknown → version, empty gauges, the same six widths | same | pass | the same x values as with the glyph. The version text is 4 px narrower, and that only moves the text inside the readout |
| REQ-5 | tiles | unknown → version, empty gauges | same | pass | identical |
| REQ-5 | focus, tiles | unknown → version, full gauges, 1512 / 1440 / 1400 / 1366 / 1280 | same | pass | Settings 1186.9 / 1114.9 / 1074.9 / 1040.9 / 1018.8, unchanged after the flip. Issue, refresh and `#usage-5h` were unchanged too (1512: 1121 / 1088.8 / 504.8) |
| REQ-5 | focus, tiles | every state | readout right-aligned | pass | computed `text-align: right`, `display: inline-block`. The text range's right edge equals the readout's right edge in every state. At 1280 the readout is 1041.1–1242. unknown text 1042–1242, version+glyph 1134.3–1242, version 1138.3–1242, placeholder 1138.3–1242 |
| REQ-5 | focus, tiles | every state, width ≥ 1366 (full) or ≥ 1280 (empty) | legible: whole text on screen, visible | pass | opacity 1, visibility visible, colour rgb(178,182,195), 12.3 px ui-monospace. The glyph shows opacity 1, inline, visible. The text range sits inside the readout box (unknown: 1 px slack at the left), inside the viewport, and the masthead stays 46 px tall |
| REQ-5 | focus, tiles | version / version+glyph, full gauges, 1280 | nothing overflows that didn't before | **FAIL** | with REQ-5, `.masthead` scrollWidth/clientWidth is 1328/1280 and `.masthead-right` 991/927. `#connection-status` sits at 1313.9–1327.9, entirely past the 1280 viewport. The readout text at 1202.2–1305.9 is cut at 1280. The same page with the rule overridden gives 1280/1280 and 894/894, with `#connection-status` at 1250–1264, flush with the padding edge (Major 1) |
| REQ-5 | focus, tiles | version / version+glyph, empty gauges, 1000 | same | **FAIL** | with REQ-5: 1009/1000, `#connection-status` at 995–1009, so its 6 px dot (≈999–1005) is half off-screen. Without the rule: 1000/1000, fits (Major 1) |
| REQ-5 | focus, tiles | version / version+glyph, empty gauges, 900 | same (cycle-1 Note 3's pre-existing overflow) | **FAIL — worse** | the overflow grew from 16 px (glyph) / 12 px (no glyph) to 109 px: 1009 vs 916/912 against 900. The right-aligned version text now spans 879.3–987, so only its first ~21 px ("cl") is on screen. Before, it spanned 786–894 and was fully visible (Major 1) |
| REQ-5 | focus, tiles | any, 640 | same | pass (no change) | 1009/640 with REQ-5. Without it, 916/640 with a version. Settings at 699.8 is off-screen either way, so the masthead was already unusable at this width |
| REQ-5 | focus, tiles | unknown, every width | same | pass (no change) | unknown text with and without the rule gives the same layout (±1 px, the `+1px`). The unknown state's overflow at ≤ 1000 px and at 1280 with full gauges existed before |
| REQ-5 | focus, tiles | full gauges, 1512 / 1440 / 1400 / 1366 | same | pass | masthead fits in every case (1512/1512, 1440/1440, 1400/1400, 1366/1366). `#connection-status` right equals the padding-box right (1496, 1424, 1384, 1350). Zero slack: `.masthead-right` is 991/991 |
| REQ-5 | focus, tiles | daemon-down, 1280 and 900 | controls hold still; outage surfaced | pass | after SIGTERM the `#banner` is `display: block` ("musterd unreachable — …"). The readout keeps its text, Settings stays at 954.9 / 699.8, and the readout box is unchanged |
| REQ-5 | pop-out | any | — | N/A — `/doc.html` has no masthead or readout | |
| Keeps focus | focus, tiles | any | — | N/A — the flip replaces only `#claude-version`'s children, which hold nothing focusable. Settings is not re-rendered | |
| REQ-6 | — | — | — | N/A — a daemon log line, nothing rendered (review-work's) | |
| §6 / §7 | — | — | no new honesty or terminal surface | pass / N/A | REQ-5 is one CSS rule on an existing readout |

## Issues

### Critical

None.

### Major

1. **[orchestrator:decision]** The reserved width makes the masthead overflow, with a version held, at widths where it fitted before. `web/src/style.css` `.claude-version` reserves ~201 px against the version text's ~104 px, so `.masthead-right` grows by ~97 px.
   - **1280 px, full gauges** (the cycle-1 rig width): the connection-status dot moves fully off-screen and the readout's text is cut mid-version. It fitted exactly before.
   - **1000 px, empty gauges**: half the dot is clipped. It fitted before.
   - **900 px**: the cycle-1 Note 3 overflow grew from 16 px to 109 px, and the version text is pushed almost entirely off-screen.

   REQ-5 as written ("reserves the width of its widest text") requires this. The shipped code matches the plan, and the plan's consequence is what I measured. The layout specs only assert one-row fit at 1512 and 1440, and those still pass, with zero slack.
   - **Option A (keep REQ-5 as is):** accept the overflow below ~1366 px with every gauge known, and below ~1009 px with none. Record the narrow-width trade in the plan or an ADR.
   - **Option B (shrink what is reserved):** make the widest text shorter, so the reservation costs only a few `ch` over "claude 2.1.300 ⚠" (16 ch). For example, the unknown state could read "claude unknown" (14 ch), which is the existing pre-hello text. Or reserve only the version-text width (`16ch`) and accept a one-time shift when the unknown state is shown. The controls still hold still across version ↔ version changes.

### Minor

None.

### Notes

1. **[note]** The REQ-5 e2e (`claude-version.spec.ts`, Settings x before/after the flip) does what the plan's Automated Checks ask, and it would have failed on the pre-REQ-5 CSS: my control measured a 92 px shift at its 1280 viewport. It checks no overflow, and REQ-5 does not ask it to.
2. **[note]** The pre-hello placeholder "claude unknown" was seen live in every run. Settings held its x through it too, at every width.
3. **[note]** My first spec run waited about 9 minutes on the machine-wide gate lock, held by another worktree's (`muster-effort`) gate run. Nothing was measured under contention.
