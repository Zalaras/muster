---
id: usage-call-resets-rounded-up-to-the-second
type: decision
status: accepted
date: 2026-10-26
summary: The usage call's resets_at is rounded up to the whole second at the adapter and percentages compare with a float tolerance, so both sources de-dup.
features: [usage]
tags: [claude-code-format]
files: [internal/claudecode/usageapi.go, internal/usage/aggregator.go]
tests: [TestParseResetsAt_RoundsRFC3339UpToTheSecond, TestAggregator_PercentTolerance_FloatNoiseDedupsRealChangeAdopts, TestMeasuredForms_OneWindowFromBothSourcesIsOneChange]
refs: [plan:usage-bar-consistency, kb:fact/rate-limit-resets-differ-in-precision-across-sources, kb:adr/usage-sample-dedup-by-value, kb:adr/usage-all-windows-polled-and-refetched-at-reset]
supersedes: []
---
**Context.** Review cycle 1 of `usage-bar-consistency` (correctness Major 1) showed the
cross-source de-dup (REQ-9) never fires on real data: the status line states a window's reset on
a whole 10-minute boundary and the usage call states it with microseconds just under a second
earlier, and the percentages differ by float noise
(kb:fact/rate-limit-resets-differ-in-precision-across-sources). Each arrival from the other
source then reads as a change, writes a `usage_sample` row and broadcasts. The same gap would
flip a reset suffix between `(13:39)` and `(13:40)`, and put the reset-time call a fraction of a
second before the boundary the status line names.

**Decision.** `internal/claudecode` rounds the usage call's `five_hour`/`seven_day` (and per-model
window) `resets_at` up to the whole second, which meets the status line's value for the same
window. The aggregator's same-value test compares percentages within a small float tolerance;
resets stay an exact comparison of whole-second instants.

**Consequences.** Values that agree to the second and within the tolerance de-dup across sources,
as kb:adr/usage-sample-dedup-by-value intends. Rounding up can only move the reset-time call
later, never before the API's own instant. The rule rests on one API sample; a probe pairing both
sources for one window would confirm it.
