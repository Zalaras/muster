# internal/usage — neutral usage samples and aggregators

**Owns**: the `Sample`, `Bucket` and `Model` shapes, the account-level `Aggregator` fed by status posts (`Record`) and the OAuth usage call (`RecordFetch`), and `ModelScoped` for the per-model weekly window polled from the OAuth API. Nothing here names a Claude Code key; `internal/server` maps the adapter's `StatusAccount` into a `Sample` at the seam. **Features**: usage.

**Invariants** (violations are review-Critical):
- One neutral `Sample` type and one aggregator per source shape; no Go interface until a second source forces one (kb:adr/usage-no-source-interface).
- A sample is recorded and broadcast only when bucket values or model changed; a timestamp alone is never a change (kb:adr/usage-sample-dedup-by-value).
- Snapshots start unknown after a restart; no hydration from persisted rows (kb:adr/usage-no-hydration-across-restart).
- `SampledAt` is stamped by `adopt`, never accepted from the caller.
- Each bucket takes the newest arrival from either writer; a value already past its reset is never adopted (kb:adr/usage-all-windows-polled-and-refetched-at-reset, kb:adr/usage-past-reset-reads-unknown).
- A partial bucket is never modelled: `UsedPct` and `ResetsAt` travel together.
- Rows persist for history and are never rendered (kb:adr/usage-history-persisted-not-rendered).

**Exemplar**: `aggregator.go` — mutex-guarded current sample, `Record` with value dedup, an `OnChange` callback that is nil in tests.

**Gotchas**:
- Status posts arrive in pairs with identical values; the dedup collapses them (kb:fact/status-posts-arrive-in-pairs).
- The status line carries no per-model bucket; `ModelScoped` is fed by the OAuth API only (kb:fact/status-line-has-no-model-bucket, kb:adr/usage-all-windows-polled-and-refetched-at-reset).
- Unknown renders as a word, not a zero-length track; keep nil pointers nil (kb:adr/usage-unknown-renders-word-not-track).

<!-- kb:trailer -->
<!-- kb:hash f44ef10d7f738022 -->
- **usage** — Masthead usage bars, per-model weekly bar, per-session context gauge, usage poll and Keychain read. → `docs/features/usage/INDEX.md`
- 7 records name files in this directory: `go tool kb for <path>` lists them for one file.
<!-- /kb:trailer -->
