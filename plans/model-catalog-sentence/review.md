# Review: model-catalog-sentence

**Plan**: model-catalog-sentence
**Verdict**: approved
**Cycle**: 1
**Gates**: 0 failed
**Parts**: code | skipped: browser, maintainability
**Part verdicts**: code approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: model-catalog-sentence

**Plan**: model-catalog-sentence
**Part verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 21642 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes. `internal/claudecode/modelcheck.go:15-18` adds `unknownModelWindowSentence`. `stderrSaysUnrecognised` (`:124-127`) returns true on either substring and does not read the installed version. | Yes. `TestStderrSaysUnrecognised` has the 2.1.299+ line copied verbatim from the Findings and a both-sentences row (Edge Case 2). `TestCheckModel_VerdictFollowsStderr` has the 2.1.299+ row giving `ModelUnrecognised`. The log shows these rows were red before the change, and D1 is green after it. Live tier: the 2.1.300 canary (`canary-2.1.300-fix2.log:76-81`) passes both `TestModelCatalogPrecheck` subtests. | pass |
| REQ-2 | Yes. `test/canary/static_test.go:66` adds the needle `"Claude Code doesn't recognize the model"`. | Yes. `TestInstalledBinaryCarriesInterfaceStrings` passes on 2.1.300 in the canary log, and D3 vets the canary tag. | pass |
| DIAG | `kb:diagram/daemon-components`, named by `kb for` on both changed files. It shows package imports only; nothing changed at that level. The plan has no `## Diagrams` delta. | — | pass |

## Build & Tests

E2E tests: skipped (E2E Scope none; no `make e2e` line in the run) · Daemon tests (race): pass (24 `ok` packages, no FAIL, `02-test.log`) · Web tests: pass (2511, `05-web-test.log`) · Daemon build: pass (`01-build.log` empty, exit 0) · Web build: pass (`04-web-build.log`; chunk-size advisory only) · Lint: pass (`03-lint.log` 0 issues; web-lint clean) — all read from $GATES_LOG_DIR. Other gate lines: contrast pass (0 failures in 3 themes), features-inventory pass, versions pass ("all fragments fresh"), e2e-honest pass, kb-check pass (567 records, 0 problems), e2e-lint pass, features-scope pass, comments pass, comment-ledger pass (1 block, kept), size pass (0 hits).

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `go test -count=1 -run 'TestStderrSaysUnrecognised\|TestCheckModel' ./internal/claudecode/` | pass (`17-D1.log`: `ok internal/claudecode`) |
| D2 | `make lint` | pass (deduped to the baseline `make lint`, `03-lint.log` 0 issues) |
| D3 | `go vet -tags canary ./test/canary/` | pass (`18-D3.log` empty, exit 0; the orchestrator reports 0 failed lines) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. No `TODO.md` entry exists to tick (a fix born of a red canary, with no issue). The logs have no `deviation:` or `doc-delta:` lines. The plan's departure from the red ritual is recorded as `kb:adr/launch-model-check-matches-either-catalog-sentence` (`proposed`, `refs: plan:model-catalog-sentence`), and that ADR describes what shipped. `kb:fact/unknown-model-warning-names-assumed-window` is active with a guard. `kb:fact/model-catalog-precheck-zero-token` is retired (verified up to 2.1.296). The Doc Delta claim, that the pre-check reads both sentences, is true of the code. See correctness Minor 1 for a gap in the delta. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV-1 | The new sentence constant matches the 2.1.299+ stderr in the Findings exactly, and both constants stay unexported inside `internal/claudecode`. | pass | `"Claude Code doesn't recognize the model"` is a byte-exact prefix of the Findings line. The apostrophe is ASCII `'` (checked with `od -c`). The 2.1.300 static tier finds the same bytes in the bundle. Both names are lower-case, and `modelCatalogSentence`/`unknownModelWindowSentence` appear only in `internal/claudecode/modelcheck.go`. The canary mirrors the strings and does not import them (`static_test.go:63-66`). |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. The sentence knowledge lives in `internal/claudecode/`. The only other copy is the canary's mirrored needle, which is the static tier's job. |
| 2 | Terminal-output state parsing | pass. The pre-check reads the stderr of a `-p ""` subprocess, not pane text. No session state is derived. |
| 3 | Blocking hook handler | pass (not touched) |
| 4 | Bare tmux | pass (not touched) |
| 5 | Payload logging | pass (not touched) |
| 6 | Empty-gauge dishonesty | pass (not touched) |
| 7 | Session identity on `session_id` | pass (not touched) |
| 8 | Settings trespass | pass (not touched) |
| 9 | Real `claude` outside canary/probes | pass. Unit tests reach the binary through the `modelCheckRun` seam. Only the canary runs the real binary. |

## Issues

### Critical
None.

### Major
None.

### Minor
1. **[orchestrator]** The Doc Delta has two gaps. (a) It covers only **launch**. `docs/protocol.md:222-223`, the verdict legend for the model-catalog endpoint, still says `recognized` is grounded in the now-retired `kb:fact/model-catalog-precheck-zero-token`, and that `unrecognized` means "its stderr carried the catalog sentence", which is now either of two sentences. (b) The delta cites the successor fact as "its successor", not by ID. Since `doc-reconcile` promotes the delta verbatim, fix the delta: add a protocol.md line, and name `kb:fact/unknown-model-warning-names-assumed-window` in place of "its successor". This is a plan defect and does not block approval.

### Notes
1. **[note]** `internal/claudecode/modelcheck.go:20-21`: the `ModelVerdict` comment says the caller "never sees modelCatalogSentence itself". Two sentences now feed the verdict, so the comment names only half of what is hidden.
2. **[note]** `internal/claudecode/modelcheck.go:15-18`: the comment pass removed the doc comments on the constants and on `stderrSaysUnrecognised`. The constants no longer cite the facts they come from. `kb for` still finds them through the records' `files:`.
3. **[note]** The static tier now asserts both needles. The 2.1.300 bundle still carries the old string, but a later bundle that drops it will turn the static tier red on the old needle, even though the pre-check would still be correct. The ADR's last sentence anticipates retiring the old sentence. Its needle should be retired at the same time.
4. **[note]** The first canary attempt (`canary-2.1.300-fix.log`) failed at `TestStatusLineVersionMatchesInstalled` (174 s) and the tests after it, which matches the reported harness timeout. The re-run (`canary-2.1.300-fix2.log`) has 0 FAILs on pinned 2.1.300. It ran after the implementation commit `605df381` (log mtime 22:09 vs commit 21:55).
