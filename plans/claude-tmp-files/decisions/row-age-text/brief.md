# Decision brief: row-age-text

**Question**: Should a scratch file row in the reader nav's claude section show its age as a bare bucket (`2m`) or as `ageAgo` text (`2m ago`)?
**Source**: plans/claude-tmp-files/review.md, correctness Decisions item 1, cycle 1
**Option A**: bare `formatAge` (`2m`). Matches the table and the mockup; shorter in a 3×2 tile; differs from the reader's existing `written 2m ago` readout.
**Option B**: keep `ageAgo` (`2m ago`). Matches REQ-9's named function and the dashboard's other relative times; three more characters per row in compact tiles; the table and mockup need amending.

## Pinned reading list (both advocates read all of it before turn 1)
- plans/claude-tmp-files/review.md — correctness Decisions item 1 (quoted below); browser Major 1 (nav height starvation in compact tiles) for the space context
- plans/claude-tmp-files/plan.md — REQ-9 (around line 60-62), Testable UI Elements "Scratch file row" (around line 174), W4 (around line 259), the Implementation Notes hint on `ageAgo` (around line 322)
- plans/claude-tmp-files/mockups/opt-b-summary.html and its mockup.css
- docs/design/design-system.md (typography, density and compact tile rules)
- docs/design/ux-flows.md (any relative-time wording rules)
- web/src/render/reader.ts and web/src/features/reader.ts — where `ageAgo`/`changedText` and `formatAge` are used today (`rg "ageAgo|formatAge" web/src`)
- `go tool kb pack --plan claude-tmp-files --role planner` — the reader ADRs (accepted ones bind)
- web/render/reader-scratch.spec.ts:98,138 — the render tests currently asserting `ageAgo`

## The issue, verbatim
1. **[orchestrator:decision]** Row age text. The plan's Testable UI Elements table ("age last (`now`, `2m`, `1h`, `2d`)") and the design-authority mockup (`opt-b-summary.html`: `2m`, `6m`, `41m`) show bare buckets. REQ-9 says "`ageAgo` buckets", and the implementation renders `ageAgo` (`2m ago`), which the render tests assert (`web/render/reader-scratch.spec.ts:98,138`).
   - A: bare `formatAge` (`2m`). Matches the table and the mockup; shorter in a 3×2 tile; differs from the reader's existing `written 2m ago` readout.
   - B: keep `ageAgo` (`2m ago`). Matches REQ-9's named function and the dashboard's other relative times; three more characters per row in compact tiles; the table and mockup need amending.

## Rules
Up to 3 turns each, ≤400 words per turn, advocate-a opens. Argue from the pinned docs and
measurable consequences; cite file:line; steelman before rebutting; concede when convinced.
Append each turn to debate.md before sending it. The ending turn's author reports once to
`main`. Agent names: advocate-a (Option A), advocate-b (Option B).
