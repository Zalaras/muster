# Debate: row-age-text

### Turn 1 — advocate-a (argument)

**1. The dashboard already has a rule, and it puts this row on A's side.** B's case says `ageAgo` "matches the dashboard's other relative times". Read by call site, the code splits cleanly:
- *A column in a list row beside a name* takes bare `formatAge`: the launch MRU entry, "name · branch · age" (`web/src/render/launch.ts:27-28`); the past-sessions row's `.age` (`web/src/render/launchpast.ts:95`); the tile header's ended timer (`web/src/sessions/card.ts:251`).
- *A readout led by a verb* takes `ageAgo`: `changed …` (`web/src/reader/freshness.ts:12`), `ended …` (`card.ts:239,258`), `captured …` (`card.ts:311`), `checked …` (`web/src/features/updateview.ts:39`).
A scratch row is badge · path · age in a `.when` column (`web/src/render/reader.ts:300-318`, `web/src/style.css:1887`), no verb. That is the first group. In my reading, a verbless `2m ago` is the odd one out.

**2. The two specific specs agree; the general one is a hint.** The Testable UI table gives literal values: "age last (`now`, `2m`, `1h`, `2d`)" (`plan.md:174`). The design authority (`plan.md:137`) renders `2m`, `6m`, `41m` (`mockups/opt-b-summary.html:23`), and V2 requires "row ages match `mockups/opt-b-summary.html`" (`plan.md:292`). REQ-9 says "`ageAgo` buckets" (`plan.md:60-62`). The buckets (`now`/m/h/d) are the same in both functions. Only the suffix differs. The Implementation Notes put `ageAgo` under "Hints (non-binding)" (`plan.md:318,322`). I read REQ-9 as naming the bucket scheme and the table as fixing the visible text. A changes one word in REQ-9 and W4 (`plan.md:259`). B amends the table, the mockup and V2.

**3. Space, where the panel is already short.** `.reader.compact .rnav` is 190px (`style.css:1780-1782`). The row has 12px padding each side, two 6px gaps, a `tmp` badge, and the age (`style.css:1924-1937`, `1347-1357`). Only `.nm` shrinks (`style.css:1956-1962`). A correction to the brief: the suffix is ` ago`, so it adds **four** characters (`format.ts:61`), not three. At `--fs-2xs` (0.68rem) in a mono font, that is roughly 26px (my arithmetic, ~0.6em advance assumed; not measured). It comes straight out of the path, and the path is the only part of the row that tells files apart. R5 already exists because nested paths ellipsize at 3×2 (`plan.md:266`).

**4. Another brief correction, which cuts toward A.** The reader readout is `changed 2m ago` (`freshness.ts:12`, `docs/features/reader/spec.md:34`), not `written 2m ago`. That readout has a verb, so it fits rule 1. It is not a precedent for a verbless row.

**Cost is symmetric.** A rewrites the regexes and literals at `web/render/reader-scratch.spec.ts:98,109,138,141` and edits REQ-9/W4. B rewrites the table, the mockup and V2. Neither touches the protocol.

### Turn 1 — advocate-b (concession)

Steelman: the dashboard already splits its relative times by shape. A verbless age in a list row's column takes bare `formatAge` (launch MRU, past-sessions `.age`, tile ended timer), and a readout led by a verb takes `ageAgo` (`changed`, `ended`, `captured`, `checked`). A scratch row is badge · path · `.when`, with no verb, so it belongs to the first group. The two specific specs (Testable UI table `plan.md:174`, and V2 `plan.md:291` "row ages match `mockups/opt-b-summary.html`") fix the visible text, while REQ-9's "`ageAgo` buckets" names a bucket scheme both functions share.

I checked each citation and could not break any of them. Three more facts point the same way:
- `docs/design/ux-flows.md:33-35` draws the canonical list row as `muster   main 2m`, a bare age at the row's end.
- The browser reviewer measured the cost instead of estimating it: "In a 3x2 tile the suffix costs the path about 30 px" (`review.md:188`). In that tile the nested-path `.nm` already shows only 88px (`review.md:152`).
- The `ageAgo` hint sits under "Hints (non-binding)" (`plan.md:318,322`). B's best remaining point was REQ-9 naming the function, and that point rested on reading a non-binding hint as binding.

Your correction to the brief holds: the reader readout is `changed 2m ago` (`web/src/reader/freshness.ts:12`), which follows the verb rule rather than contradicting A.

One fact for whoever applies A, which is not a new option: the mockup's scratch row shows `just now` (`mockups/opt-b-summary.html:23`), but `formatAge` renders the sub-minute bucket as `now` (`web/src/sessions/format.ts:49`). V2 has to read that cell as `now`.

I concede: rows in a list column take bare `formatAge` across the dashboard (`launch.ts:27`, `launchpast.ts:95`, `card.ts:251`, `ux-flows.md:33-35`). With the table and V2 fixing the text and about 30px of path measured at stake in a 190px compact nav, `ageAgo` would be the odd one out. The decision is A.
