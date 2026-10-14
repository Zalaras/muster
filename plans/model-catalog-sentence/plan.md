# Plan: model-catalog-sentence

**Status**: completed
**Shape**: fix
**Work Type**: daemon
**E2E Scope**: none
**Fixture plan**: none
**Features**: launch, canary
**Description**: The model pre-check reads Claude Code's new unknown-model warning (2.1.299+) as well as the old one, so an unknown model is flagged again.

## Symptom

`make canary` on Claude Code 2.1.300 (2026-10-14) is red on one assertion:

```
--- FAIL: TestModelCatalogPrecheck/an_unrecognised_custom_model_comes_back_ModelUnrecognised
canary_test.go:302: expected: 1  actual: 0
"muster-canary-unrecognized-model" must be unrecognised by the installed binary's model catalog
```

The developer sees this: for any model the installed binary does not know, the launch dialog's
model check says it is recognised, so the warning never shows.

## Findings

I probed each installed binary with `--bare --no-session-persistence --model zephyr -p "" </dev/null` and read stderr:

- 2.1.296: `"zephyr" isn't described by this version's model catalog; update Claude Code, or map it wi…`
- 2.1.299: `Claude Code doesn't recognize the model "zephyr", so it assumes a context window of 200k tokens. Update Claude Code, or see https://code.claude.com/docs/en/model-config#correct-the-window-for-a-gateway-or-custom-model-id to set the window.`
- 2.1.300: the same as 2.1.299. `muster-canary-unrecognized-model` and `claude-opus-9-9` get the same line.
- `haiku` on 2.1.300 prints no warning, only `Error: Input must be provided …`. Exit is 1 in every case, as before.

The cause is in `internal/claudecode/modelcheck.go:19`. `stderrSaysUnrecognised` matches only
`modelCatalogSentence`, the pre-2.1.299 wording, so on 2.1.299+ every model comes back
`ModelRecognised`. The 2.1.300 binary still carries the old string twice
(`grep -c -a -F` = 2), but the `-p` path no longer prints it. That is why the static tier
(`TestInstalledBinaryCarriesInterfaceStrings`) stayed green. The change point is 2.1.297, 2.1.298
or 2.1.299. Neither 2.1.297 nor 2.1.298 is installed to probe.

The developer chose to match either sentence regardless of version. It departs from the
red ritual's step 2 (`docs/claude-code-versions.md`), which keys new behaviour off the
installed version. Version keying would have to guess for 2.1.297 and 2.1.298. Matching
either sentence is exact for every version: each binary prints one or the other, and a known
model prints neither.

## Requirements

### Must Have
- **REQ-1**: `CheckModel` returns `ModelUnrecognised` when stderr carries either the pre-2.1.299 sentence (`isn't described by this version's model catalog`) or the 2.1.299+ one (`Claude Code doesn't recognize the model`). Otherwise it returns `ModelRecognised`, as before. The installed version is not consulted.
- **REQ-2**: The canary's static tier also asserts the 2.1.299+ sentence is in the installed bundle, so a later rewording is caught at the static tier.

## Affected Files

### Daemon (daemon-impl)
- `internal/claudecode/modelcheck.go` — REQ-1: the second sentence, matched alongside the first.

### Tests (daemon-tests)
- `internal/claudecode/modelcheck_test.go` — REQ-1: rows for the 2.1.299+ line, verbatim from the Findings, giving `ModelUnrecognised`.
- `test/canary/static_test.go` — REQ-2: a needle for the 2.1.299+ sentence.

### Existing tests this breaks
- none

## Proof

`internal/claudecode/modelcheck_test.go`: a `stderrSaysUnrecognised` / `CheckModel` row with the
2.1.299+ stderr line expects `ModelUnrecognised` and gets `ModelRecognised` today. daemon-tests
writes it.

## Edge Cases

1. A binary prints the new sentence for a model Muster's launch offers (e.g. `haiku`) → untested: probed on 2.1.300, `haiku` prints no warning; the canary's recognised-preset row guards it on each version bump.
2. A known-model run whose stderr carries both sentences → D1 (still `ModelUnrecognised`; either sentence is enough).

## Acceptance Criteria

### Automated Checks

```checks
D1 go test -count=1 -run 'TestStderrSaysUnrecognised|TestCheckModel' ./internal/claudecode/
D2 make lint
D3 go vet -tags canary ./test/canary/
```

### Reviewer-Verified
- The new sentence constant matches the 2.1.299+ stderr in the Findings exactly, and both constants stay unexported inside `internal/claudecode`.

## Doc Delta

**launch** — becomes true: the model pre-check reads both the old and the 2.1.299+ unknown-model sentence (kb:fact/model-catalog-precheck-zero-token and its successor).

## Out of scope
- Showing the "assumes a context window of 200k tokens" consequence in the launch dialog's warning text.
