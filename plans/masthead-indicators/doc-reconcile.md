# Doc Reconcile: masthead-indicators

**Verdict**: reconciled
**Pack**: kb: pack 12638 words (budget 30000)
**Features derived**: usage, connection (plan header: usage, connection; touches rail, surfaces)

Changed files mapped through the spec globs: every one lands in usage, connection, or a Touches feature
(`web/src/sessions/format.ts` -> rail, `web/e2e/shell.spec.ts` -> surfaces). `web/index.html`,
`web/src/style.css` and `web/scripts/contrast-pairs.json` map to no feature (not required by check-kb).

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| usage | Five-hour and seven-day bars each show used % and reset `(HH:MM)` today / `(HH:MM Ddd)` otherwise; same format on the model-week bar | `web/src/sessions/format.ts:formatResets`, `web/src/sessions/usage.ts:buildUsageBucketViewModel`, `web/src/render/masthead.ts` (shared bucket renderer) | edited |
| usage | Reset hover is the full local date and time (`Resets Tue, Oct 13, 15:59`) | `format.ts:formatResetsTitle`, `masthead.ts:99` (`refs.resets.title`) | added |
| usage | Masthead shows no model; model per session only; model still recorded in history and still in change detection | `internal/server/usagewire.go:UsageInfo` (no model field), `internal/usage/aggregator.go:unchanged`, `web/src/protocol/usage.ts` | edited |
| usage | Masthead holds one row at 14"; bars narrow below 1840px | `web/src/style.css` `@media (max-width: 1840px)` (gap, `.bar` 40px) | edited |
| usage | "current model" readout, freshest-sample model, model-name truncation with hover | no `#usage-model` element in `web/index.html` / `web/src`; no model on wire | deleted |
| connection | Status readout is a health dot: yellow connecting-before-hello and own update restart, green connected, red lost; word is sr-only, detail on hover | `web/src/features/connectionhealth.ts:describeConnectionHealth`, `web/src/render/masthead.ts:renderConnectionStatus`, `web/index.html:47` | edited |
| connection | Dot colours are `--health-ok/-pending/-down` | `web/src/style.css:71-73,115-117,159-161,355-364` | added |
| connection | Dot agrees with banner except a socket lost in the <= 3 s post-update confirmation is red beside the neutral banner | `connectionhealth.ts` (`override.neutral` -> DOWN), `web/src/features/updaterestart.ts:88,95` | added |
| connection | Visible `connecting` / `connected` / `reconnecting` text readout | replaced by the dot; reader pop-out clause kept (`web/src/reader/notice.ts:29`) | deleted |
| protocol | A model-only change sends a `usage` message identical to the previous one apart from `sampledAt`, re-stamped per recorded sample | `internal/usage/aggregator.go:55`, `internal/server/usagebroadcast_test.go:90-99` | edited (`docs/protocol.md` ws.usage) |

Frontmatter `refs` updated: usage drops `usage-masthead-model-from-freshest-sample` and
`usage-masthead-narrow-width-shrinks-bars-truncates-model`, adds `usage-masthead-shows-no-model` and
`usage-masthead-narrow-width-shrinks-bars`; connection adds `connection-health-dot`,
`connection-health-dot-hues-kept`, `connection-dot-red-during-update-confirmation`.

## Contradictions
None. One note, not a contradiction: `--health-down` is #ee6a32 (orange-red); the spec says "red" as the ADRs do (kb:adr/connection-health-dot-hues-kept).

## For the orchestrator
- [orchestrator] The cited ADRs (`usage-masthead-shows-no-model`, `usage-masthead-narrow-width-shrinks-bars`, `connection-health-dot`, `connection-health-dot-hues-kept`, `connection-dot-red-during-update-confirmation`) are still `proposed`; flip to `accepted` at Completion (and mark the two superseded usage ADRs superseded).
- [orchestrator] The doc delta's claim against touched features changed no rail or surfaces behaviour in a spec-visible way (`formatResets` is shared with the rail's context reset text; its output changed to the bracketed form). Check the rail spec for any wording of "resets HH:MM" at Completion; none was found in the pack's rail/surfaces specs by this run's edits (not modified).
- design-system §1/§5 deltas were applied by the orchestrator (00831eb5); untouched here. No SPEC.md change needed from this run.

## Checks
```
kb: regenerated 2 file(s): docs/features/connection/contract.md, docs/features/usage/contract.md
kb: 542 records, 27 features, 0 problem(s)
kb: all checks pass
```
Word counts (incl. frontmatter): usage/spec.md 613, connection/spec.md 653 (budget 800).
Commits: 01e6be46 (connection), a61d2d7d (usage + protocol.md).
