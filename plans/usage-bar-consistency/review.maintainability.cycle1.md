# Maintainability review: Usage Bar Consistency

**Plan**: usage-bar-consistency
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 11351 words (budget 30000)
**Scope**: 16 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (12 code files, 4 generated `CLAUDE.md` trailers)

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/main.go | (one help string changed; no sibling question) | n/a | filelen 540, funlen `parseFlags`, `run`: all pre-existing, size unchanged (540 lines on main too) | pass (Note 1) |
| internal/claudecode/usageapi.go | status.go (`StatusBucket`, epoch→UTC), usageapi.go's own `parseResetsAt` | yes (reuse `StatusBucket`) | none | pass: `interpretWindow` reuses `parseResetsAt` and `StatusBucket`, and follows `InterpretUsageReport`'s skip-don't-fail shape |
| internal/claudecode/status.go | usageapi.go | n/a (comment-only change) | none | pass |
| internal/claudecode/claudecodetest/claudecodetest.go | promptreply.go, transcripts.go | daemon-tests table row | filelen 710 (694 on main), funlen `statusLineFullPayload` (untouched); no reason given | Minor 4 |
| internal/server/usage.go | usagewire.go, usagepoll.go, themepoll.go, shellactivity.go | yes | none | pass |
| internal/server/usagepoll.go | bgloop.go, themepoll.go, shellactivity.go, reporefresh.go, ingest.go (`processStatus`) | yes (watcher as second `bgLoop`; `toUsageBucket`) | none | Minor 1 |
| internal/server/renderfix_scenarios.go | renderfix_scenarios_usage.go | n/a (fixture epochs) | none | pass |
| internal/server/renderfix_scenarios_usage.go | renderfix_scenarios.go | n/a (one constructor arg) | funlen `driveCacheWarmthHover`: pre-existing, untouched, named in Decisions | pass (Note 2) |
| internal/usage/aggregator.go | modelscoped.go, usage.go | yes (two writers, `writeMu` + `mu`) | none | Major 1 |
| internal/usage/modelscoped.go | aggregator.go | n/a (comment-only change) | none | pass |
| internal/usage/usage.go | aggregator.go, modelscoped.go | n/a (comment-only change) | none | Minor 2 |
| web/src/sessions/usage.ts | format.ts, cache.ts, context.ts | yes (rule inside the one derivation) | none | Minor 3 |
| internal/claudecode/CLAUDE.md, internal/server/CLAUDE.md, internal/usage/CLAUDE.md, web/src/sessions/CLAUDE.md | — | n/a | none | generated trailer and doc text belong to review-work; nothing about shape here |

**Shared state (question 3).** `Aggregator.state` now has two writers: the ingest worker through `Record` and the poller goroutine through `RecordFetch`. The `design:` line names both writers and the guard. `writeMu` serialises a whole `adopt`. `state` is written only while both locks are held, so `adopt` can read `prev := a.state` under `writeMu` alone (aggregator.go:77), and `Current()` reads it under `mu` alone. Every writer holds the guard. `TestAggregator_ConcurrentWritersLoseNothingAndRowsMatchBroadcasts` (aggregator_sources_test.go:366) runs 20 + 20 concurrent writers, and the gates' `test` line runs `go test -race -count=1 ./...` (02-test.log:1). Lock order is acyclic: `adopt` holds `writeMu` while `OnChange` takes `ModelScoped.mu`; `ModelScoped.onChange` runs with no lock held and takes only `Aggregator.mu`. `hub.broadcast` never blocks (ws.go:104). The poller's `changed` channel is buffered (size 1), so a holder change between `nextReset`'s read and the `select` is not lost (usagepoll.go:67–76). I found no unguarded interleaving introduced by this branch.

**Layers (question 4).** The composition roots are untouched. `handleUsageRefresh` is unchanged (decode/delegate/encode). Only `internal/claudecode` names `five_hour`/`seven_day`/`utilization`; `rg -n "five_hour|seven_day|utilization" internal web/src` outside it finds only the store's column names.

## Issues

### Critical

### Major

1. **[daemon-impl]** Two new private types, one a field-for-field copy of an existing type — `internal/usage/aggregator.go:42-54`. This goes against conventions § Design, "Reuse before add", and question 7 (every new type has a `design:` line). The Decisions `design:` line says "no new type for the second writer", but the branch adds `aggregateState` and `arrival`. `aggregateState` is `Snapshot` (usage.go:35-41) minus `Source`, which `snapshotOf` (aggregator.go:132-134) fills with a constant:
   ```
   internal/usage/aggregator.go:42  type aggregateState struct { fiveHour *Bucket; sevenDay *Bucket; model *Model; sampledAt *time.Time }
   internal/usage/usage.go:35       type Snapshot struct       { FiveHour *Bucket; SevenDay *Bucket; Model *Model; SampledAt *time.Time; Source string }
   ```
   As written, any field added to the account snapshot must change three places: `Snapshot`, `aggregateState` and `snapshotOf`. Neither new type has a `design:` line. A fix must make one of these true: (a) the Aggregator holds its state in one existing type, so `Current()` needs no hand-copy; or (b) a `design:` line for each of `aggregateState` and `arrival` states why `Snapshot`/`Sample` cannot serve, with a reason the code bears out.

### Minor

1. **[daemon-impl]** The `claudecode.StatusBucket` → `usage.Bucket` mapping now exists twice — `internal/server/usagepoll.go:162-167` (`toUsageBucket`, new) and `internal/server/ingest.go:204-205` (inline, already there). This goes against conventions § Design, "Reuse before add" and "One owner per concept". The `design:` line says the new helper "mirrors `processStatus`": it found the existing mapping and copied it rather than reusing it.
   ```
   internal/server/usagepoll.go:166:	return &usage.Bucket{UsedPct: b.UsedPct, ResetsAt: b.ResetsAt}
   internal/server/ingest.go:204:		FiveHour: usage.Bucket{UsedPct: acct.FiveHour.UsedPct, ResetsAt: acct.FiveHour.ResetsAt},
   internal/server/ingest.go:205:		SevenDay: usage.Bucket{UsedPct: acct.SevenDay.UsedPct, ResetsAt: acct.SevenDay.ResetsAt},
   ```
   Graded Minor, not Major, because each copy is one struct literal with no logic to drift. A fix must make true: both seams convert through one mapping, so a field added to `Bucket` changes one place.

2. **[daemon-impl]** `Sample.SampledAt` is now a dead field — `internal/usage/usage.go:31`. On main, `Record` wrote it (`s.SampledAt = time.Now().UTC()`, main aggregator.go:55) and `snapshotLocked` read it (main aggregator.go:110). After this branch nothing in non-test code reads or writes it: `rg -n "SampledAt" internal cmd --glob '!*_test.go'` shows only the field declaration, `Snapshot.SampledAt`, `aggregateState.sampledAt` and the wire. No test sets or reads `Sample.SampledAt` either: aggregator_test.go:92 reads a `Snapshot`. Every caller now builds a `Sample` with a field it cannot use. A fix must make true: `Sample` carries no field without a reader.

3. **[web-impl]** `resetHasPassed` reimplements an existing helper — `web/src/sessions/usage.ts:33-35`. This goes against conventions § Design, "Reuse before add". `sessions/format.ts:20` already owns "seconds from now to an ISO instant", and `sessions/cache.ts:18` uses it to decide expiry. `usage.ts` already imports from `./format` (line 10).
   ```
   web/src/sessions/format.ts:20:  export function remainingSeconds(untilIso: string, now: Date): number { return (Date.parse(untilIso) - now.getTime()) / 1000; }
   web/src/sessions/usage.ts:34:     return Date.parse(bucket.resetsAt) < now.getTime();
   ```
   The two agree today, NaN case included: both compare false. A future fix to one, such as NaN handling, will not reach the other. Graded Minor for the same reason as Minor 1. A fix must make true: the past-reset test is expressed through the one ISO-instant helper `format.ts` owns.

4. **[daemon-tests]** File-length warning on a grown file with no reason — `internal/claudecode/claudecodetest/claudecodetest.go:1`, 710 lines (694 on main; this branch's `UsageAPIBucketsBody`/`UsageBucketOpt` add 16). Gates log 19-size.log names it, alongside the pre-existing `statusLineFullPayload` funlen at :572. `daemon-tests.md` line 55 says "no `dupl` warning names my files", but its check was `make size-warn | grep -i "usage\|dupl"`, which cannot match a `filelen` line for this path. This is kb:adr/process-size-linters-warn-never-fail and question 6: no reason means Minor. A fix must make true: Decisions gives a reason that holds for keeping this helper file over 500 lines, or the file is restructured along a real seam. A split that only silences the count does not count.

### Notes

1. **[note]** `cmd/musterd/main.go`: filelen (540) and funlen (`parseFlags` 53 statements, `run` 47) are all pre-existing; this branch changes one flag's help string, and the file is 540 lines on main too. The daemon-impl Decisions line "No size warning on a file I touched" is inaccurate for this file. Nothing got worse, so no change is requested.
2. **[note]** `internal/server/renderfix_scenarios_usage.go:277` `driveCacheWarmthHover` funlen is pre-existing and untouched (the branch changes only line 406's constructor call). Decisions names it as such, and that reason holds.
3. **[note]** Pre-existing, not introduced here: the two holders' `OnChange` closures each read the *other* holder's `Current()` (usage.go:49, :61, unchanged context). That allows this interleaving. The ingest worker commits aggregator A3 and its `OnChange` reads `modelScoped.Current()` = M1. The poller's `ModelScoped.Record` then commits M2 and broadcasts (A3, M2). The ingest worker resumes and broadcasts (A3, M1) last, so clients show M1 until the next change. `writeMu` orders the aggregator's own broadcasts, not broadcasts across holders. Main has the same shape, so this is recorded here and not filed.
4. **[note]** `snapshotOf` (aggregator.go:133) hands readers the state's own `*Bucket`/`*Model` pointers, where main's `snapshotLocked` copied into fresh locals. This is safe today: `adoptBucket` copies every adopted bucket, and nothing mutates one in place. `ModelScoped.snapshotLocked` (modelscoped.go:137) aliases its slice the same way, so the two siblings now match.
5. **[note]** `fetchSource = defaultModelScopedSource` (aggregator.go:22) labels the aggregator's call-sourced rows with a constant named for the per-model holder. The `design:` line states the reuse, and the value is one concept, "came from the OAuth call". Only the name reads oddly from the aggregator's side.
6. **[note]** `watchResets` (usagepoll.go:65) allocates a one-hour timer on every pass, even when no reset is known and `wake` stays nil. Correct, just a shape a reader has to stop and check.
7. **[note]** `UNKNOWN_VIEW_MODEL` (web/src/sessions/usage.ts:25) is one shared object returned to every caller. Its one production caller, `renderUsageBucket` (render/masthead.ts:68), only reads it, so this is fine as long as that stays true.
8. **[note]** No new package-level dependency edge: `internal/server` → `internal/usage`/`internal/claudecode` already exist, so `kb:diagram/daemon-components` and `kb:diagram/web-components` need no change from this diff.
