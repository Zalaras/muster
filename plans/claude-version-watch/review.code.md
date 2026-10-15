# Correctness review: claude-version-watch

**Plan**: claude-version-watch
**Verdict**: approved
**Cycle**: 4
**Pack**: kb: pack 25552 words (budget 30000)

Scope: this cycle reviews the delta `1e14392b..HEAD`. Cycle 3 left one open item, browser Major 1 `[orchestrator:decision]`. It was not a Minor, so this is not a Minors-only delta re-review. The diff touches `web/src/` (`connectionversion.ts`, `masthead.ts`, `style.css`), so §3–§6 were run on that area. The delta contains:
- the developer's decision B (1485175f: ADR, design-system.md, protocol.md, plan REQ-5 amendment);
- the web fix (ed92e882), the unit tests (c2ceaf6c) and the e2e specs (876f619d);
- the doc-delta update (0ac01793), the comment pass (2a4c7199), the **Touches** header (1c5d820d) and the formatter-only test commit (bfe9af41).

REQ-1 to REQ-4 and REQ-6 have no code in the delta. Their rows rest on cycles 1–3 plus this cycle's green gate run.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes (cycles 1–3; daemon untouched) | Yes: E1 `claude-version.spec.ts:187`. It now waits for "connected" (the hello) before asserting `claude unknown` plus the hint, then the flip. | pass |
| REQ-2 | Yes (cycles 1–3) | Yes: E1 `:187` (live flip, no reload) | pass |
| REQ-3 | Yes (cycles 1–3) | Yes: D2 | pass |
| REQ-4 | Yes (cycles 1–3) | Yes: D1 / E1 | pass |
| REQ-5 (amended) | Yes. `connectionversion.ts:22-24`: pre-hello, `status:"unknown"` and the defensive `installed === null` all return `{text:"claude unknown", hint: VERSION_UNKNOWN}`. Every other state returns `hint:null`. `masthead.ts:320`: `el.title = hint ?? ""`, so the title is set while unknown and cleared on a version. `style.css:337`: `min-width: calc(17ch + 4px)`, right-aligned. That is "claude 2.10.300" (15ch) + space (1ch) + glyph (1ch) + `.version-warn`'s `margin-left: 4px` (`style.css:373`), which is the widest realistic version plus glyph, as the decision says. "Fits wherever it fitted before": web-impl's control table shows 0 overflow at 1512/1440/1366/1280 (full gauges) and 1280/1000 (empty). 900 px overflowed before and still does (38 vs 31 px), which the orchestrator accepted as recorded. | Yes. Unit: 7 `describeClaudeVersion` rows carry text plus `hint`; `masthead.test.ts:450` checks that the title is set on unknown and cleared on a later version. E2E: `claude-version.spec.ts:211` holds Settings x and the readout's own width across unknown → version+glyph, and checks title = hint before and `""` after. E4 `:127` checks text plus hint. `masthead-layout.spec.ts` gains 1280 px and asserts `#connection-status` right ≤ viewport. test-specs.md records it red against the cycle-3 `27ch+1px` (1327.89 > 1280), and the REQ-5 test red with no reservation (4 px shift). All passed in 18-E1 and 17-e2e. | pass |
| REQ-6 | Yes (cycle 3; untouched) | Yes: D2 | pass |
| DIAG | `kb:diagram/web-components` (from `kb for` on `style.css`, `connectionversion.ts` and `masthead.ts`). It is module-level, and a new optional field and a CSS value change neither modules nor edges. | — | pass |

## Build & Tests

E2E tests: pass (850 passed, 8.0m, 17-e2e.log) · Daemon tests (race): pass (02-test.log, 25 packages ok) · Web tests: pass (2623 in 93 files, 05-web-test.log) · Daemon build: pass (01-build.log, empty) · Web build: pass (04-web-build.log, chunk-size warning only) · Lint: pass (03-lint.log 0 issues; 06-web-lint.log 323 files clean). All read from `$GATES_LOG_DIR` = `gates-claude-version-watch-c7`, 0 failed lines.

Baseline lines: contrast 0 failures ×3 themes; versions fresh; kb check 592 records, 0 problems; e2e-lint clean; features-scope ok (connection, issue; Touches usage); comment-checks clean; comment ledger 4/4 kept; e2e-honest and features-inventory pass with empty output. The `WARN size` line (7 hits) belongs to review-maintainability, which is skipped this cycle.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| E1 | `cd web && npx playwright test e2e/claude-version.spec.ts` | pass (8 passed, 18-E1.log) |
| D1 | `go test -count=1 ./cmd/musterd/ ./internal/server/` | pass (19-D1.log) |
| D2 | `go test -count=1 -run 'ClaudeVersion' ./internal/server/` | pass (20-D2.log) |
| D3 | `make lint` | pass (deduped to 03-lint) |
| W1 | `make web-lint` | pass (deduped to 06-web-lint) |
| W2 | `make web-test` | pass (deduped to 05-web-test) |
| DOC | doc upkeep + Doc Delta vs what shipped | FAIL (`[orchestrator]`, non-blocking). Correctness Major 1 covers the plan.md § Doc Delta gap. The connection spec still carries the old unknown text and the old unresolved-binary message, which is known pending work for doc-reconcile. What passes: every claim in `doc-delta.md` matches the code (text, hint string verbatim, one right-aligned width). The ADR `connection-claude-version-readout-short-unknown-fixed-width` exists, describes what shipped, and refs `plan:claude-version-watch`. `design-system.md:186-189`, `protocol.md:1149` and the generated canary/connection `contract.md` all say "claude unknown", which is true. The delta logs carry no `deviation:` line. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | No `claude` subprocess runs on the request path or before `Listen`; the identity look is a stat. | pass | The delta touches no Go file. Unchanged from cycle 3's verification. |
| RV2 | The new feature follows `themepoll.go`: registered in `New`, no logic in `server.go`. | pass | The delta touches no Go file. |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. The delta is web-only and adds no Claude-Code wire knowledge. |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hooks | pass (not touched) |
| 4 | tmux via `-L muster` / sizing | pass (not touched) |
| 5 | No payload logging | pass (not touched) |
| 6 | Empty-gauge honesty | pass. Every absent or unknown branch (`null`, `status:"unknown"`, `installed === null`) renders the words "claude unknown" plus hover text, never an empty or `claude null` readout. |
| 7 | Identity on tmux target | pass (not touched) |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary | pass. The specs use the stub (`stubClaudeVersionDelaySeconds: 7`, `stubClaudeVersion`). |

## Delta (delta re-review only)

| Prior item | Fix commit | Verified how |
|------------|------------|--------------|
| cycle 3 browser Major 1 `[orchestrator:decision]` "The reserved width makes the masthead overflow … at widths where it fitted before" | decision 1485175f; fix `ed92e882`, `c2ceaf6c`, `876f619d`, `bfe9af41` | Decision B was read against the diff. The unknown text is "claude unknown" with hover hint, and the reservation is `17ch + 4px` (widest version + glyph + its 4 px margin). `masthead-layout.spec.ts` now pins the 1280 px case red→green, and the REQ-5 spec pins Settings x and the readout width across the flip. bfe9af41 is formatter-only: `git diff` shows only line wrapping of the `toEqual` literals, with no assertion value changed. The 900 px residual (38 vs 31 px) is the orchestrator's recorded acceptance. Browser measurement of the result is review-browser's. |
| cycle 3 correctness Major 1 `[orchestrator]` (REQ-6 doc delta) | plan.md § Doc Delta, doc-delta.md | Resolved in the plan and doc-delta.md. Both carry the new unresolved-binary message. Promotion to the connection spec is still pending (DOC row). |

## Issues

### Critical

None.

### Major

1. **[orchestrator]** plan.md § Doc Delta does not reflect the new unknown text. `web-implementation.md:60` carries a `doc-delta:` line saying the unknown state now reads "claude unknown" with hover text. `doc-delta.md:10` has it, but `plans/claude-version-watch/plan.md` § Doc Delta (lines 189-196) does not. Its REQ-5 bullet also lacks the "widest realistic version plus its glyph" qualifier that `doc-delta.md:9` carries. Fix: add the "claude unknown" + hover-text line to plan.md § Doc Delta so the two agree. When doc-reconcile runs, it must also replace `docs/features/connection/spec.md:68` ("Claude installation unknown") and `:74-76` (the old "could not determine claude code version" for the unresolved binary). Both are known pending and do not block approval.

### Minor

None.

### Notes

1. **[note]** `web/e2e/masthead-layout.spec.ts:107-109`: the comment still names "the transient 'connecting…' + 'Claude installation unknown' combination that only shows briefly pre-hello". The pre-hello text is "claude unknown", and the long text no longer exists anywhere. The comment is stale.
2. **[note]** `docs/adr/usage-masthead-narrow-width-shrinks-bars-truncates-model.md:20` (accepted) measures an overflow for "`Claude installation unknown` with `reconnecting…`" at 1512 px. The text no longer exists, and the reservation is now ~130 px instead of ~201 px. An accepted ADR's text is history and is not edited. If the usage spec repeats that overflow claim, doc-reconcile may want to drop it. No change is requested here.
3. **[note]** The amended REQ-5 says "the masthead fits wherever it fitted before". The e2e pins 1512, 1440 and 1280 px (full gauges). The 1000 px empty-gauge case that browser cycle 3 also flagged rests only on web-impl's measurement table (0 overflow, dot right edge at 984). That is enough for this cycle, and review-browser re-measures it.
