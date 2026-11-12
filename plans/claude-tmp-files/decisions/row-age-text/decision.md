# Decision: row-age-text

**Outcome**: A — bare `formatAge` (`2m`). Matches the table and the mockup; shorter in a 3×2 tile; differs from the reader's existing `changed 2m ago` readout.
**Reached by**: consensus (advocate-b conceded in turn 1)
**Decisive argument**: The dashboard already splits relative times by shape: "A verbless age in a list row's column takes bare `formatAge` (launch MRU, past-sessions `.age`, tile ended timer), and a readout led by a verb takes `ageAgo` (`changed`, `ended`, `captured`, `checked`). A scratch row is badge · path · `.when`, with no verb, so it belongs to the first group." The Testable UI table and V2 fix the visible text, `ux-flows.md:33-35` draws the canonical row with a bare age, the browser reviewer measured the suffix at about 30 px of path in the 190 px compact nav, and REQ-9's `ageAgo` was a non-binding hint naming the shared bucket scheme.
**Dissent to honour**: The mockup's scratch row shows `just now`; `formatAge` renders the sub-minute bucket as `now`, so V2 reads that cell as `now`.
**Landed in**: plans/claude-tmp-files/plan.md (REQ-9, W4 Amended notes), docs/adr/reader-scratch-row-age-bare.md
