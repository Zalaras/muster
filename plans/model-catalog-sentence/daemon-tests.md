# Daemon Tests: model-catalog-sentence

**Plan**: model-catalog-sentence
**Verdict**: authored
**Pack**: kb: pack 10951 words (budget 30000)

## Summary

Red-first. Tests created: 3 new rows plus 1 static needle | Passing: 1 new row (both sentences together, Edge Case 2) | Failing: 2 (the plan's Proof, red on assertions).

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/claudecode/modelcheck_test.go` | TestStderrSaysUnrecognised/the_2.1.299+_line | the 2.1.299+ stderr line, verbatim from Findings, is unrecognised | red (expected true, actual false) |
| `internal/claudecode/modelcheck_test.go` | TestCheckModel_VerdictFollowsStderr/unrecognised_by_the_2.1.299+_line | CheckModel returns ModelUnrecognised for that line | red (expected 1, actual 0) |
| `internal/claudecode/modelcheck_test.go` | TestStderrSaysUnrecognised/both_sentences_together | Edge Case 2: either sentence is enough | pass (holds today) |
| `test/canary/static_test.go` | TestInstalledBinaryCarriesInterfaceStrings (needle "model catalog sentence 2.1.299+") | REQ-2: `Claude Code doesn't recognize the model` is in the installed bundle | compiles, `go vet -tags canary ./test/canary/` clean; not run (canary tier) |

## Handoff Received

None (red-first; no implementation log).

## Notes

None

## Test Run Output

```
--- FAIL: TestStderrSaysUnrecognised (0.00s)
    --- FAIL: TestStderrSaysUnrecognised/the_2.1.299+_line (0.00s)
        modelcheck_test.go:67: Not equal: expected: true actual  : false
--- FAIL: TestCheckModel_VerdictFollowsStderr (0.00s)
    --- FAIL: TestCheckModel_VerdictFollowsStderr/unrecognised_by_the_2.1.299+_line (0.00s)
        modelcheck_test.go:115: Not equal: expected: 1 actual  : 0
FAIL	github.com/Zalaras/muster/internal/claudecode
```

`go build ./...` ok, `make lint` 0 issues, `go vet -tags canary ./test/canary/` clean. `make test`: only the two rows above fail.
