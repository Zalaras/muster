# Maintainability review: Usage Bar Consistency

**Plan**: usage-bar-consistency
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 12166 words (budget 30000)
**Scope**: 19 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (15 code files, 4 generated or hand-edited `CLAUDE.md` files). This is a full review: cycle 1 had a Major open, so delta re-review does not apply. Each cycle-1 finding was checked again on its own file below.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/main.go | (one flag help string changed) | n/a | filelen 540; funlen `parseFlags` 53 and `run` 47. All pre-existing: 540 lines on main too | pass (Note 1) |
| internal/claudecode/usageapi.go | status.go (`StatusBucket`, `statusBucket`), interpret.go (`modelID(json.RawMessage)`), its own `parseResetsAt` and `usageAPILimit` | yes (reuse `StatusBucket`); cycle-1 fix gives `ceilToSecond` its ADR | none | pass: `rg "Truncate\(time.Second\)\|Round\(time.Second\)\|ceilTo\|roundUp"` finds no other rounding helper (renderfix.go:328 is a sleep). `interpretWindow` follows the skip-don't-fail shape of the `limits[]` loop |
| internal/claudecode/status.go | usageapi.go | n/a (comment-only change) | none | pass |
| internal/claudecode/claudecodetest/claudecodetest.go | promptreply.go, transcripts.go, statusline.go, usageapi.go | daemon-tests fix 1 `design:` | none (was filelen 710 in cycle 1, now 448) | pass. Cycle-1 Minor 4 resolved |
| internal/claudecode/claudecodetest/statusline.go | claudecodetest.go, promptreply.go, transcripts.go | daemon-tests fix 1 `design:` | funlen `statusLineFullPayload` 68: pre-existing, moved verbatim (main claudecodetest.go:572) | pass: a comment-stripped diff against main's lines 440–700 shows only gofmt realignment |
| internal/claudecode/claudecodetest/usageapi.go | same | daemon-tests fix 1 `design:` | none | pass: moved code plus the `UsageAPIBucketsBody` extension. `UsageAPIBody` now delegates to it, so there is no second body builder |
| internal/server/ingest.go | usagepoll.go, usagewire.go | cycle-1 fix `design:` (one mapping) | none | pass. Cycle-1 Minor 1 resolved: `rg -n "usage\.Bucket\{" internal cmd --glob '!*_test.go'` finds only usagepoll.go:163 |
| internal/server/usage.go | usagewire.go, usagepoll.go, themepoll.go | yes (`notifyPoller` from both `OnChange`) | none | pass |
| internal/server/usagepoll.go | bgloop.go, themepoll.go, shellactivity.go, reporefresh.go, updatemanager.go, claudeversion.go | yes (watcher as a second `bgLoop`; one mapping) | none | pass (Notes 2, 5) |
| internal/server/renderfix_scenarios.go | renderfix_scenarios_usage.go | n/a (fixture epochs) | none | pass |
| internal/server/renderfix_scenarios_usage.go | renderfix_scenarios.go | n/a (one constructor arg) | funlen `driveCacheWarmthHover` 62: pre-existing, untouched; Decisions names it | pass |
| internal/usage/aggregator.go | modelscoped.go, usage.go | yes (two writers, `writeMu` + `mu`; cycle-1 fix: `snap` is a `Snapshot`) | none | pass. Cycle-1 Major 1 resolved: `aggregateState`, `arrival` and `snapshotOf` are gone, and `Current()` returns the held `Snapshot` with no hand-copy (Notes 3, 4) |
| internal/usage/modelscoped.go | aggregator.go | n/a (comment-only change) | none | pass (Note 6) |
| internal/usage/usage.go | aggregator.go, modelscoped.go | n/a | none | pass. Cycle-1 Minor 2 resolved: `Sample.SampledAt` removed (Note 7) |
| web/src/sessions/usage.ts | format.ts, cache.ts, context.ts | yes (rule inside the one derivation; cycle-1 fix reuses `remainingSeconds`) | none | pass. Cycle-1 Minor 3 resolved: `resetHasPassed` is now `remainingSeconds(...) < 0` and imports the helper `format.ts` owns |
| internal/claudecode/CLAUDE.md, internal/server/CLAUDE.md, internal/usage/CLAUDE.md, web/src/sessions/CLAUDE.md | — | n/a | none | doc text and generated trailers belong to review-work; no shape question here |

**Shared state (question 3).** `Aggregator.snap` has two writers: the ingest worker through `Record` and the usage poller goroutine through `RecordFetch`. Both reach `adopt`, which holds `writeMu` for the whole read, persist, commit and broadcast (aggregator.go:60–61). `snap` is written only at aggregator.go:100–102, under `writeMu` and then `mu`, so `adopt` can read `prev := a.snap` (:64) under `writeMu` alone, and `Current()` (:112) reads under `mu` alone. The `design:` line names both writers and both guards.

`adopt` returns no pointer the caller still holds:
- `adoptBucket` copies every offered bucket (:122).
- `Record`'s `&s.Model` points into its own by-value parameter.

The gates' `test` line is `go test -race -count=1 ./...` (02-test.log:1). `TestAggregator_ConcurrentWritersLoseNothingAndRowsMatchBroadcasts` runs 20 + 20 concurrent writers.

The reset watcher reads both holders through their locked `Current()`. `notify` is a non-blocking send on a channel with a buffer of 1 (usagepoll.go:56–60). So a commit that lands between `nextReset`'s read (:67) and the `select` (:72) leaves a pending signal, and the watcher re-arms on the next pass. I found no unguarded interleaving introduced by this branch. Note 3 records one pre-existing cross-holder ordering.

**Layers (question 4).** The composition roots are untouched: `cmd/musterd/main.go` changes only a help string, and `internal/server/server.go` and `web/src/main.ts` are not in the diff. `handleUsageRefresh` is unchanged in shape. The wire keys `five_hour`, `seven_day` and `utilization` appear only in `internal/claudecode` and its `claudecodetest`.

**Diagram (question 8).** No new package-level edge: `internal/server` already imported `internal/usage` and `internal/claudecode`.

## Issues

### Critical

### Major

### Minor

### Notes

1. **[note]** `cmd/musterd/main.go`: the filelen 540 and the `parseFlags`/`run` funlen hits are pre-existing. This branch changes one help string, and the file size is unchanged from main. The daemon-impl line "No size warning on a file I touched" is still inaccurate for this file, but nothing got worse.
2. **[note]** `toUsageBucket` (usagepoll.go:162) is now the one `StatusBucket` to `Bucket` mapping. Its two consumers sit in different files: `processStatus` (ingest.go:204–205) and `recordBuckets` (usagepoll.go:157). One owner is satisfied. A reader of ingest.go has to know to look in the poller file. Placement only, so no change is requested.
3. **[note]** Pre-existing, as cycle-1 Note 3 recorded; the branch does not change it. Each holder's `OnChange` reads the *other* holder's `Current()` (usage.go:49, :61). `writeMu` orders the aggregator's own broadcasts. It does not order the aggregator's broadcasts against `ModelScoped`'s. This interleaving can leave clients one step stale until the next change:
   1. The poller's `ModelScoped` `OnChange` reads aggregator A1.
   2. The ingest worker commits A2 and broadcasts (A2, M2).
   3. The poller broadcasts (A1, M2) last.

   The two goroutines are the same as on main.
4. **[note]** `fetchSource = defaultModelScopedSource` (aggregator.go:23): the aggregator labels its call-sourced rows with a constant named for the per-model holder. The `design:` line states the reuse, and both mean "came from the OAuth call"; only the name reads oddly from this side.
5. **[note]** `watchResets` (usagepoll.go:65) allocates a one-hour timer on every pass, even when no reset is known and `wake` stays nil. Correct, but a reader has to stop and check it.
6. **[note]** For review-work (doc truth), not filed here: the pre-existing comment at modelscoped.go:78–79 still points at "Aggregator.Record (aggregator.go:47-90)". That logic now lives in `adopt` (aggregator.go:59–108). The comment pass did not see it because the branch did not add it, and per kb:adr/process-comment-pass-owns-code-comments reviewers file no finding on a comment.
7. **[note]** Pre-existing: no caller sets `Sample.Source`. `rg -n "Sample\{" internal cmd --glob '!*_test.go'` finds only ingest.go:203, which leaves it empty, so `Record`'s defaulting (aggregator.go:49–51) always supplies it. Main had the same shape, so nothing is filed.
8. **[note]** The comment pass removed the `Aggregator` struct's doc comment, so the declaration (aggregator.go:32–41) no longer names its two writers or what `writeMu` and `mu` each guard. The `design:` line in daemon-implementation.md is now the only place that states it. Comments are the comment pass's to own (kb:adr/process-comment-pass-owns-code-comments), so this is recorded, not filed.
9. **[note]** `UNKNOWN_VIEW_MODEL` (web/src/sessions/usage.ts:25) is one shared, unfrozen object handed to every caller. Its one production caller, `renderUsageBucket`, only reads it, so this is fine while that stays true.
