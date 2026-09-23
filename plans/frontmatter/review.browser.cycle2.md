# Browser review: Frontmatter

**Plan**: frontmatter
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 6697 words (budget 8000) — rules 1340 · features 2408 · diagrams 0 · decisions 2465 · proposed 0 · facts 2 · lessons 474 · runbooks 2
**Rig**: `make web-build build` at ff52e37 (clean tree); `bin/musterd` via the committed `daemon` fixture: space-bearing data dir `$TMPDIR/muster e2e-XXXX`, `-tmux-socket` at `<dataDir>/tmux.sock`, shared stub `claude` (`$TMPDIR/muster e2e-stub-47b61c41d12a7b17/claude`); headless Chromium 1280×720; throwaway `web/e2e/zz-review-browser-probe.spec.ts` (4 probes, all ran to completion) deleted. No musterd or tmux left running, and `git status --porcelain` shows nothing of mine. Gates log c2: 0 failed lines (e2e 432 passed, web-build green).

Fixtures, the same set as cycle 1: `kb.md` (the real `docs/adr/reader-plan-sticky-once-named.md`, 11 keys, plus 40 filler paragraphs and `## Tail Heading`), `skill.md` (`disable-model-invocation`, `allowed-tools`, a one-sentence `description`), `fact.md` (`verified_claude_code_version`), `long.md` (400-char unbroken value, 250-char URL, 60-char key), `raw.md` (block list, a `|` scalar holding `# Not a heading`, a 300-char line), `empty.md` (comments only), `crlf.md` (BOM, CRLF, trailing space/tab on the fences), `unclosed.md`, `nofm.md` (no frontmatter, a later `---`), `xss.md`.

Hosts:
- Focus: `article.md` is 744×598 at 300,122.
- 3×2 tile: tile 425×316 at 1,85. `article.md` is 233 wide with the explorer open and 423 with it closed. I measured it with 6 live sessions and again with 1 session, and the geometry is identical.
- Pop-out: `article.md` is 1044×690.

"oldcss" below is an in-page counterfactual. On the live table I restored cycle 1's rules (`table-layout: auto`, key `width: 1%; white-space: nowrap`), measured, then removed them again.

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1/2/5 | focus | data | flat block → table as first child, rows in file order, verbatim | pass | kb.md first=`TABLE.frontmatter`, 11 rows `id=reader-plan-sticky-once-named` … `supersedes=[]`, `tags=[claude-code-format, user-decision]`; hr=0 |
| REQ-1/2/5 | tiles 3×2 | data | same | pass | same 11 rows, first=`TABLE.frontmatter`; table 16–221 inside article 2–235 inside tile 1–426 |
| REQ-1/2/5 | pop-out | data | same | pass | same 11 rows; table 32,57–1012,405 inside article 0,30–1044,720 |
| REQ-1 (CRLF/BOM/trailing ws) | focus / tiles / pop-out | data | recognised; body unaffected | pass | crlf.md rows `id=crlf`,`status=ok`; headings `H1:CRLF Body`; hr=0 in all three |
| REQ-3 | focus / tiles / pop-out | data | nested YAML → one `pre.frontmatter`, inner text verbatim | pass | textContent byte-equal to the inner block incl. `notes: \|\n  # Not a heading\n`; tables=0; only heading `H1:Raw Body` |
| REQ-4 | focus / tiles / pop-out | data | empty/comments-only → nothing, stripped | pass | empty.md first=`H1` (Empty Body), tables=0, pres=0, hr=0 |
| REQ-5 | focus / tiles / pop-out | data | `<img onerror>` / `<script>` values literal | pass | td text `<img src=x onerror="window.__fmXss=1">`, `<script>window.__fmXss=2</script>`; img=0, script=0, `window.__fmXss` unset |
| REQ-6 / W17 | focus / tiles / pop-out | data | no outline entry or heading from frontmatter (flat, raw, empty) | pass | kb.md outline=`["Tail Heading"]`, headings=`["H2:Tail Heading"]`; raw.md outline=`["Raw Body"]`; empty.md outline=`["Empty Body"]` |
| REQ-6 | focus | data | outline pointer click reaches the body heading (ids unaffected by the prepend) | pass | click `Tail Heading`: scrollTop 0→1624 = max (scrollH 2222 − clientH 598); `h2#tail-heading` top 627, inside article 122–720 |
| REQ-7 | focus / tiles / pop-out | data | no frontmatter / unclosed fence render as before | pass | nofm.md first=`H1`, later `---` kept (hr=1); unclosed.md first=`HR`, `foo: bar` paragraph, `H1:Unclosed Body` kept, in all three hosts |
| REQ-10 / W16 | tiles 3×2, explorer open | data | no horizontal scroll; values wrap (cycle 1 Major 1) | **pass** (fixed) | article scrollW = clientW = 233 for kb, skill, fact, long, xss, crlf; th 82 / td 123; no th overflows (`scrollWidth ≤ clientWidth` on every th). oldcss on the same nodes: long 525 > 233, fact 286 > 233, skill 257 > 233 |
| REQ-10 / W16 | tiles 3×2, explorer open | data | value column keeps a readable share | pass | skill.md table 393px tall (was 2542 under oldcss); long.md 854 (was 9548); fact.md 147 (was 670); kb.md 757 (was 813) |
| REQ-10 | tiles 3×2, explorer closed | data | no horizontal scroll | pass | kb, skill, fact, long: scrollW = clientW = 423; th 158 / td 237 |
| REQ-10 | focus | data | no horizontal scroll; `th` treatment reused | pass | scrollW = clientW = 744 for every fixture; th mono, uppercase, bg `rgb(23,26,36)`, `overflow-wrap:anywhere`; `table-layout: fixed` |
| REQ-10 | pop-out | data | same | pass | scrollW = clientW = 1044 for every fixture |
| REQ-10 | focus / pop-out | data | density on wide hosts | pass, see Note 1 | the key column is now a fixed 40%: th 272 (focus), 392 (pop-out). kb.md table 386 vs 348 under oldcss in focus, 348 vs 329 in the pop-out |
| Raw fallback reach | all hosts | data | long raw line is reachable | pass | `pre.frontmatter` `overflow-x:auto` (scrollW 1924–2342 > clientW); article itself never scrolls horizontally |
| Visible | all hosts | data | table/pre computed visible | pass | display `table`/`block`, visibility visible, opacity 1 in every host |
| Settled / live re-render | tiles 3×2 | data | routed Write re-renders one table with the new values | pass | after the Write hook and a 1.5 s settle: tables=1, rows `id=some-fact`,`status=two`,`extra=added`, first=`TABLE.frontmatter`, scrollW = clientW = 233 |
| REQ-8 (E1) | focus | data | after a `/clear` pair (End first), slot keeps the plan with its badge | pass | `/api/state` plan `{path:…/probe-plan.md, exists:true}`; slot=1 `PLAN probe-plan.md`, badge=1, noplan=0 |
| REQ-8 | focus | data | opening the retained plan from the slot renders it | pass | pointer click on the slot: body `H1:Probe Plan`, its own frontmatter `status=draft` first |
| REQ-8 | tiles 3×2 | data | same retention | pass | slot=1, badge=1, noplan=0, bar `probe-plan.md`; `/api/state` agrees |
| REQ-8 | pop-out | data | same retention, and opening it renders it | pass | slot=1, badge=1, noplan=0; picked `notes.md` then the slot by pointer → `Probe Plan`, badge=1 |
| REQ-9 (E2) | focus | data | straggler Write from the pre-clear id (old transcript) leaves the plan | pass | after straggler + 1.5 s: `/api/state` and slot unchanged (`probe-plan.md`, exists:true, badge=1). Driven this cycle (cycle 1 Note 1) |
| REQ-8 (ec 6, D1) | focus | data | both transcripts deleted, then a reader-listing scan → retained | pass | listing plan `{path:…/probe-plan.md, exists:true}`; slot=1, badge=1 |
| REQ-8 (ec 9) | focus | data | daemon restart after a retained-plan `/clear` → plan loads from the row | pass | after `restart()` + reload: `/api/state` and slot `probe-plan.md`, badge=1 |
| REQ-8 (ec 3, D4) | focus | data | out-of-order `/clear`: SessionStart(new) before the late SessionEnd(old) → retained | pass | slot and `/api/state` unchanged (`probe-plan.md`, exists:true) |
| REQ-8 (ec 2, D3) | focus | data | a new plan named after `/clear` replaces the retained one | pass | `/api/state` `{…/probe-plan-two.md, exists:true}`; slot `PLAN probe-plan-two.md`. The bar keeps the still-open old file `probe-plan.md`, so badge=0, which is correct (it is no longer the plan) |
| REQ-8 (ec 7, D2) | focus | data | retained plan file deleted, then a planless scan → path kept, `exists:false`, `no plan yet` | pass | listing and `/api/state` `{…/probe-plan-two.md, exists:false}`; slot=0, noplan=1 |
| States: no data | focus | no data | placeholder only until a render; no frontmatter node before one | pass | no frontmatter node exists before a file renders (the rendering is built only inside `renderMarkdown`); the existing loading-cue specs are green in the gate run |
| States: no data | tiles / pop-out | no data | same | N/A — plan § States: frontmatter exists only after a render; the host placeholder logic is not changed by this plan | |
| States: daemon-down | focus | daemon-down | last render incl. table kept; down surfaced | pass | after SIGTERM: tables=1, 11 rows, display table; banner `musterd unreachable — hook output in open panes is Muster's absence, not session failure.`; reader status `musterd unreachable — showing last render` |
| States: daemon-down | tiles 3×2 | daemon-down | same | pass | tables=1, 11 rows, visible; article 233×186 with the status line; scrollW = clientW = 233; status `musterd unreachable — showing last render` |
| States: daemon-down | pop-out | daemon-down | same | pass | long.md table kept (3 rows), scrollW = clientW = 1044; status `musterd unreachable — showing last render` |
| Keeps focus | all | data | — | N/A — the frontmatter path adds no focusable element | |
| Hidden | all | data | — | N/A — this plan adds no `[hidden]` toggling | |
| §6/§7 honesty & terminal | all | all | — | pass | no new gauge, cost, "Done" or pane styling; a plan with `exists:false` renders `no plan yet` as the contract says; daemon-down is surfaced by the banner and the reader status line |

## Issues

### Critical

None.

### Major

None. Cycle 1 Major 1 is fixed. I measured it in the host where it failed and in both of the others (REQ-10 rows above).

### Minor

None.

### Notes

1. **[note]** The fix makes the key column a fixed 40% of the table in every host. That is how it caps a long key in a tile. On wide hosts a short key now takes the same 40%. For example, `ID` gets a 272px column in Focus and a 392px column in the pop-out. The values then wrap sooner: the 11-key kb record's table is 386px tall in Focus against 348 under cycle 1's content-sized column (+11%), and 348 against 329 in the pop-out (+6%). In the narrow tile it is shorter than before (757 against 813). No requirement is broken, and the ADR (kb:adr/reader-frontmatter-key-column-may-break) accepts the cap. I mention it only in case the developer wants the key column to shrink to short keys on wide hosts. `th { width: min(40%, <n>ch) }` under the same fixed layout is one way. No change requested.
2. **[note]** The committed W16 pin (`reader.spec.ts`, "a long frontmatter key never forces article.md to scroll horizontally…") runs in a host whose geometry is identical to cycle 1's failing host: a one-session 3×2 tile at 425×316 with a 233px article. Under the cycle-1 CSS, its 28-char and 60-char keys measure 286 > 233 and 525 > 233, so the spec would have failed on the defect.
3. **[note]** Keys still render uppercased through the inherited `.md th` treatment. The DOM text is verbatim, as cycle 1 Note 2 recorded. No change requested.
