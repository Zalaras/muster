# Correctness review: claude-version-watch

**Plan**: claude-version-watch
**Verdict**: approved
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
