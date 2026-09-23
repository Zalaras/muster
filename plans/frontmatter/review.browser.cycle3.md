# Browser review: Frontmatter

**Plan**: frontmatter
**Verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 6697 words (budget 8000) — rules 1340 · features 2408 · diagrams 0 · decisions 2465 · proposed 0 · facts 2 · lessons 474 · runbooks 2
**Rig**: `make web-build build` at 70e6306 (clean tree); `bin/musterd` started by the committed `daemon` fixture, with the space-bearing data dir `$TMPDIR/muster e2e-XXXX`, `-tmux-socket` at `<dataDir>/tmux.sock` and the shared stub `claude` (`$TMPDIR/muster e2e-stub-47b61c41d12a7b17/claude`); headless Chromium at 1280×720; a throwaway `web/e2e/zz-review-browser-probe.spec.ts` (2 probes, both ran to completion), since deleted. No musterd or tmux process is left, and `git status --porcelain` shows nothing of mine. Gates log c3: 0 failed lines (e2e 432 passed, web-build green).

## What changed since cycle 2, and the check that nothing rendered moved

Since cycle 2's measured tree (ff52e37), `web/src` changed only in two comments (3e25e62: `web/src/style.css` lines above `.md table.frontmatter`, and `web/src/features/reader.ts` `buildBarVM`). The daemon change is `internal/server/reader_test.go` only.

- **Byte oracle.** I built the ff52e37 `web/` tree with the same Vite into a scratch dir and ran `diff -rq -x '*.map'` against this cycle's `internal/webui/assets`. Every shipped non-sourcemap file is **identical**: `index-BrP-ENHg.css` sha1 `8c8f8268…` on both sides, and `index-CjNRDfHw.js` sha1 `cd0b49ac…` on both sides. Only the `.map` files differ, which is what a comment edit changes. The embedded dashboard is therefore byte-for-byte the one cycle 2 approved.
- **Re-measurement.** I also drove the running app again, with the same fixture set as cycles 1–2: `kb.md`, `skill.md`, `fact.md`, `long.md`, `raw.md`, `empty.md`, `crlf.md`, `unclosed.md`, `nofm.md`, `xss.md`. Every geometry figure that cycle 2 recorded for an identical fixture came back identical: focus th 272 / td 407 and kb table 386px; pop-out th 392 and kb 348px; tile th 82 / td 123 and kb 757px; outline scroll 1624 = max.

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1/2/5 | focus | data | flat block → table as first child, rows in file order, verbatim | pass | kb.md first=`TABLE.frontmatter`, 11 rows `id=reader-plan-sticky-once-named` … `supersedes=[]`; hr=0; table 332,150–1012,536 inside article 300,122–1044,720 |
| REQ-1/2/5 | tiles 3×2 | data | same | pass | same 11 rows, first=`TABLE.frontmatter`; table x 16–221 inside article 2–235 |
| REQ-1/2/5 | pop-out | data | same | pass | same 11 rows; table 32,57–1012,405 inside article 0,29–1044,720 |
| REQ-1 (CRLF/BOM/trailing ws) | focus / tiles / pop-out | data | recognised; body unaffected | pass | crlf.md rows `id=crlf`,`status=ok`; headings `H1:CRLF Body`; hr=0 in all three |
| REQ-3 | focus / tiles / pop-out | data | nested YAML → one `pre.frontmatter`, inner text verbatim | pass | textContent byte-equal to the inner block, incl. `notes: \|\n  # Not a heading\n…`; tables=0; only heading `H1:Raw Body` |
| REQ-4 | focus / tiles / pop-out | data | empty/comments-only → nothing, stripped | pass | empty.md first=`H1`, no table, no pre, hr=0 |
| REQ-5 | focus / tiles / pop-out | data | `<img onerror>` / `<script>` values literal | pass | td text `<img src=x onerror="window.__fmXss=1">`, `<script>window.__fmXss=2</script>`; img=0, script=0, `window.__fmXss` unset |
| REQ-6 / W17 | focus / tiles / pop-out | data | no heading from frontmatter (flat, raw, empty) | pass | kb.md headings=`["H2:Tail Heading"]`; raw.md `["H1:Raw Body"]`; empty.md `["H1:Empty Body"]`. Outline list text not captured, see Note 1 |
| REQ-6 | focus | data | outline pointer click reaches the body heading | pass | click `Tail Heading`: scrollTop 1624 = max 1624; `h2#tail-heading` top 627 inside article 122–720 |
| REQ-7 | focus / tiles / pop-out | data | no frontmatter / unclosed fence render as before | pass | nofm.md first=`H1`, later `---` kept (hr=1); unclosed.md first=`HR`, `H1:Unclosed Body` kept |
| REQ-10 / W16 | tiles 3×2, explorer open | data | no horizontal scroll; values and keys wrap | pass | article scrollW = clientW = 233 for all 10 fixtures; th 82 / td 123; thOverflow=0 on every th, incl. the 60-char key and `verified_claude_code_version` |
| REQ-10 | tiles 3×2, explorer closed | data | no horizontal scroll | N/A — not re-driven; the CSS/JS bundle is byte-identical to cycle 2, which measured 423 = 423 | |
| REQ-10 | focus | data | no horizontal scroll; `table-layout: fixed` | pass | scrollW = clientW = 744 for all 10 fixtures; computed `tableLayout: fixed` |
| REQ-10 | pop-out | data | same | pass | scrollW = clientW = 1044 for all 10 fixtures |
| Raw fallback reach | focus / tiles / pop-out | data | long raw line is reachable | pass | `pre.frontmatter` `overflow-x:auto`, scrollW 2342/1924/2342 > clientW 678/203/978; the article itself never scrolls horizontally |
| Visible | all hosts | data | table/pre computed visible | pass | display `table`/`block`, visibility visible, opacity 1 in every host |
| Settled / live re-render | tiles 3×2 | data | routed Write re-renders one table with the new values | pass | after the Write hook and a 1.5 s settle: rows `id=some-fact`,`status=two`,`extra=added`; first=`TABLE.frontmatter`; 233 = 233 |
| REQ-8 (E1) | focus | data | after a `/clear` pair, the slot keeps the plan and its badge | pass | `/api/state` plan `{path:…/probe-plan.md, exists:true}`; slot=1 `plan probe-plan.md`, badge=1, noplan=0 |
| REQ-8 | focus | data | opening the retained plan from the slot renders it | pass | pointer click on the slot: body first=`TABLE`, row `status draft`, `Probe Plan` |
| REQ-8 | tiles 3×2 | data | same retention | pass | slot=1, noplan=0; the bar is on `notes.md`, so badge=0 is correct; `/api/state` agrees |
| REQ-8 | pop-out | data | same retention | pass | slot=1, noplan=0; the bar is on `notes.md`, so badge=0; `/api/state` agrees |
| REQ-9 / ec 2,3,6,7,9 (daemon plan rules) | focus | data | straggler, out-of-order clear, deleted transcripts, new plan, deleted plan, restart | N/A this cycle — no daemon source changed since cycle 2 (only `reader_test.go`), and the committed E1/E2 specs are green in the c3 gate run; cycle 2 drove every one of these cells | |
| States: no data | all hosts | no data | no frontmatter node before a render | N/A — plan § States: frontmatter exists only after a render, and the host placeholder logic is unchanged | |
| States: daemon-down | tiles 3×2 | daemon-down | last render incl. table kept; down surfaced | pass | after SIGTERM: 11 rows, display table, 233 = 233; banner `musterd unreachable — hook output in open panes is Muster's absence, not session failure.`; reader status `musterd unreachable — showing last render` |
| States: daemon-down | pop-out | daemon-down | same | pass | xss.md table kept (2 rows), 1044 = 1044; status `musterd unreachable — showing last render` |
| States: daemon-down | focus | daemon-down | same | not measured — see Note 2 | |
| Keeps focus | all | data | — | N/A — the frontmatter path adds no focusable element | |
| Hidden | all | data | — | N/A — this plan adds no `[hidden]` toggling | |
| §6/§7 honesty & terminal | all | all | — | pass | no new gauge, cost, "Done" or pane styling; daemon-down is surfaced by the banner and the reader status line |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** My probe's outline-list selector did not match the nav's DOM. It returned `nav-closed` for every row, so I have no outline entry texts this cycle. REQ-6 rests on two things instead:
   - The body headings in every host: frontmatter produced no heading.
   - The focus outline click: `outlineEntry(region, "Tail Heading")` resolved and scrolled to max.

   Cycle 2 captured the lists: kb `["Tail Heading"]`, raw `["Raw Body"]`, empty `["Empty Body"]`. The bundle is byte-identical to that build, so I see no reason for them to have changed.
2. **[note]** The focus daemon-down cell was not measured. After SIGTERM, my `Meta+Backslash` did not leave Tiles. The `readerRegion(page, "probe")` I then measured was the tile's own reader: box 2,149–425,389, the same as the tiles row. So the measurement is not a focus reading, and I report nothing for that cell. Cycle 2 measured it on the identical bundle, with the table kept and the status line and banner present. Whether the view shortcut should work while the daemon is down belongs to the views feature, not to this plan.
3. **[note]** Cycle 2 Note 1 still stands, with the same geometry. The key column is a fixed 40% on wide hosts (272px in Focus, 392px in the pop-out). No change requested.
