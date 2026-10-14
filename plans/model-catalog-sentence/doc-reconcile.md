# Doc Reconcile: model-catalog-sentence

**Verdict**: reconciled
**Pack**: kb: pack 7102 words (budget 30000)
**Features derived**: launch, canary (plan header: launch, canary)

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| launch | Unrecognised = stderr carries either the pre-2.1.299 or 2.1.299+ sentence; version never consulted | `internal/claudecode/modelcheck.go:stderrSaysUnrecognised` (two substrings, no version input) | added |
| launch | concurrent-requests-share-one-run sentence; "so the card appears before any hook arrives" | n/a, trimmed for the 800-word budget | deleted |
| protocol | `recognized`: binary printed neither sentence | `modelcheck.go:stderrSaysUnrecognised` | edited |
| protocol | `unrecognized`: stderr carried either sentence (replaces "the catalog sentence") | same | edited |
| canary | no delta claim; static needle for the 2.1.299+ sentence is test code | `test/canary/static_test.go` | none |

## Contradictions
None

## For the orchestrator
- [orchestrator] To fit the budget I cut two existing launch sentences (single-flight per model, card-before-hook rationale). Single-flight is still shown in the diagram ("in parallel, one run per model"); restore elsewhere if wanted.
- [orchestrator] `plans/model-catalog-sentence/proposed-backlog.md` is untracked and not mine; left alone.

## Checks
make gen-kb && make check-kb: 567 records, 27 features, 0 problem(s), all checks pass. launch spec body now under 800 words.
