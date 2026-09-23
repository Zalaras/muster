# Browser review: Frontmatter

**Plan**: frontmatter
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 6697 words (budget 8000) — rules 1340 · features 2408 · diagrams 0 · decisions 2465 · proposed 0 · facts 2 · lessons 474 · runbooks 2
**Rig**: `make web-build build` at 8918842 (tree dirty only by orchestration-state.json), `bin/musterd` via the `daemon` fixture: data dir `$TMPDIR/muster e2e-XXXX` (space-bearing), `-tmux-socket` path inside it, shared stub `claude` (`$TMPDIR/muster e2e-stub-47b61c41d12a7b17/claude`); headless Chromium 1280×720; throwaway `web/e2e/zz-review-browser-probe.spec.ts` deleted, no musterd/tmux left, `git status` shows nothing of mine. Gates log c1: 0 failed lines (e2e 431 passed, web-build green).

Fixtures used: a real kb record (`docs/adr/reader-plan-sticky-once-named.md`, 11 keys) plus 40 filler paragraphs and a `## Tail Heading`; a skill-shaped block (`disable-model-invocation`, `allowed-tools`, `argument-hint`, long `description`); a fact-shaped key (`verified_claude_code_version`); `long.md` (400-char unbroken value, 250-char URL, 60-char key); `raw.md` (block list, `|` scalar holding `# Not a heading`, 300-char line); `empty.md` (comments-only); `crlf.md` (BOM, CRLF, trailing space/tab on fences); `unclosed.md`; `nofm.md` (no frontmatter, later `---`); `xss.md`. Hosts: Focus (article 744×598), a 3×2 tile with 6 live sessions (tile 425×316; article 233 wide with the file explorer open, 423 with it closed), and the pop-out (article 1044×691).

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1/2/5 | focus | data | flat block → table, first child, rows in order, verbatim | pass | kb.md: first=`TABLE.frontmatter`, 11 rows `id=…`…`supersedes=[]`, `tags=[claude-code-format, user-decision]`; hr=0 |
| REQ-1/2/5 | tiles 3×2 | data | same | pass | same 11 rows, first=`TABLE`; also plan file's own frontmatter `status=draft` |
| REQ-1/2/5 | pop-out | data | same | pass | same 11 rows, first=`TABLE`, table box 32,57–1012,386 inside article 0,29–1044,720 |
| REQ-1 (CRLF/BOM/trailing ws) | focus / tiles / pop-out | data | recognised; body unaffected | pass | crlf.md rows `id=crlf`,`status=ok`; headings `H1:CRLF Body`; hr=0 in all three |
| REQ-3 | focus / tiles / pop-out | data | nested YAML → one `pre.frontmatter`, inner text verbatim | pass | textContent byte-equal to inner block incl. `notes: \|\n  # Not a heading\n`; tables=0 |
| REQ-4 | focus / tiles / pop-out | data | empty/comments-only block renders nothing, stripped | pass | empty.md first=`H1` (Empty Body), tables=0, pres=0, hr=0 |
| REQ-5 | focus / tiles / pop-out | data | `<img onerror>` / `<script>` values literal | pass | td text `<img src=x onerror="window.__fmXss=1">`; img=0, script=0, `window.__fmXss` undefined |
| REQ-6 | focus / tiles / pop-out | data | no outline entry / heading from frontmatter | pass | kb.md outline=`["Tail Heading"]`, headings=`["H2:Tail Heading"]`; raw.md outline=`["Raw Body"]`, only 1 heading |
| REQ-6 | focus | data | outline click lands on first real heading (ids unaffected by prepend) | pass | pointer click on `Tail Heading`: article scrollTop 0→761, h2#tail-heading top 122 = article top 122 |
| REQ-7 | focus / tiles | data | no frontmatter / unclosed fence render as before | pass | nofm.md first=`H1`, later `---` kept (hr=1); unclosed.md first=`HR`, `foo: bar` paragraph, H1 kept |
| REQ-7 | pop-out | data | same | N/A — covered in two hosts; same `renderMarkdown` call, no host-specific path | |
| REQ-8 | focus | data | after `/clear` pair, plan slot keeps plan + badge | pass | `/api/state` plan `{path:…/probe-plan.md, exists:true}`; slot=1, badge=1, noplan=0, file `probe-plan.md` |
| REQ-8 | tiles 3×2 | data | same | pass | badge=1, noplan=0, file `probe-plan.md` after settle 1.5 s |
| REQ-8 | pop-out | data | same, and opening it renders it | pass | slot=1, noplan=0; pointer click → body `Probe Plan`, badge=1, frontmatter `status=draft` first |
| REQ-8 | focus | data | both transcripts deleted, reader listing scans → retained | pass | listing plan `{path:…/probe-plan.md, exists:true}`; slot=1 |
| REQ-8 | focus | data | plan file deleted → path kept, `exists:false`, slot `no plan yet` | pass | listing and `/api/state` both `{path:…, exists:false}`; slot=0, `no plan yet` shown |
| REQ-9 | any | data | straggler hook never moves plan | [note] not driven by me (Notes 1) | |
| REQ-10 | focus | data | table styling reused; values wrap; no horizontal scroll | pass | th nowrap/mono/uppercase/bg-raised, td `overflow-wrap:anywhere`; long.md article scrollW 744 = clientW 744 |
| REQ-10 | pop-out | data | same | pass | long.md scrollW 1044 = clientW 1044 |
| REQ-10 / W16 | tiles 3×2, explorer closed | data | no horizontal scroll | pass | fact.md / skill.md article scrollW 423 = clientW 423; table 16–411 |
| REQ-10 / W16 | tiles 3×2, explorer open | data | no horizontal scroll, values wrap | **FAIL** | skill.md scrollW 256 > clientW 233, table 2310px tall; fact.md 286 > 233; long.md 525 > 233, table 9637px tall (Major 1) |
| REQ-10 | tiles 3×2 | data | kb record (11 short keys) wraps | pass | kb.md scrollW 233 = clientW 233; th 93px |
| Visible | all hosts | data | table/pre computed visible | pass | display `table`/`block`, visibility visible, opacity 1 in every host |
| Settled / live re-render | tiles 3×2 | data | routed Write re-renders one table with new values | pass | after Write hook: tables=1, rows `status=two`,`extra=added`, first=`TABLE` |
| W17 / INV-FM-OUT | focus / pop-out | data | no heading contains frontmatter text (flat, raw, empty) | pass | headings lists above contain only body headings in every shape |
| States: no data | focus | no data | placeholder only until a render | pass | body `loading…` on first mount; no frontmatter node before a file renders |
| States: no data | tiles / pop-out | no data | same | N/A — frontmatter exists only after a render (plan § States); host placeholder logic unchanged by this plan | |
| States: daemon-down | focus | daemon-down | last render incl. table kept; down surfaced | pass | after SIGTERM: tables=1, 11 rows, display table; banner `musterd unreachable — hook output in open panes is Muster's absence…`, masthead `reconnecting…`, reader `musterd unreachable — showing last render` |
| States: daemon-down | tiles 3×2 | daemon-down | same | pass | tables=1, 11 rows, visible; reader status `musterd unreachable — showing last render` |
| States: daemon-down | pop-out | daemon-down | same | pass | tables=1, 11 rows; `musterd unreachable — showing last render` |
| Keeps focus | all | data | — | N/A — the frontmatter path adds no focusable element | |
| Hidden | all | data | — | N/A — no `[hidden]` toggling added by this plan | |
| §6/§7 honesty & terminal | all | all | — | pass | no new gauge, cost, "Done" or pane styling; plan slot `exists:false` renders `no plan yet` as the contract says |

## Issues

### Critical

None.

### Major

1. **[web-impl]** REQ-10 / W16: the frontmatter table forces horizontal scroll in a 3×2 tile when the file explorer is open, for keys that real files carry. `web/src/style.css` `.md table.frontmatter th { width: 1%; white-space: nowrap }`, plus the inherited `.md th` uppercase and 0.06em letter-spacing, sizes the key column to the whole key. In a 233px-wide `article.md` that leaves the value column about 30px wide. Measured: `disable-model-invocation` (a Claude Code skill key) gives a 228px table, article `scrollWidth 256 > clientWidth 233`, and a one-sentence `description` wraps one or two characters per line into a **2310px-tall** table. `verified_claude_code_version` gives 286 > 233. A 60-char key gives 525 > 233 and a 9637px table. With the explorer closed (423px) the same files fit. The plan's own Affected Files asks for `white-space: nowrap` on the key column, which conflicts with REQ-10's "never forces horizontal scroll in a compact tile", and REQ-10 is the requirement. A fix must make these true: in a 3×2 tile with the explorer open, `article.md` `scrollWidth == clientWidth` for keys of at least ~30 chars; and the value column keeps a readable share of the width. For example, cap the key column (`max-width` around 40%) and let it break (`overflow-wrap: anywhere`) when it would overflow.

### Minor

None.

### Notes

1. **[note]** REQ-9 (straggler hook after the rebind leaves the retained plan) was not driven in my probe. The gate's e2e run passed the rewritten E2 (formerly E29), which asserts exactly that display. The browser cells I did measure for REQ-8 (focus, tiles, pop-out) all hold.
2. **[note]** Keys render uppercased (`ID`, `TYPE`, `SUPERSEDES`) because the table inherits `.md th { text-transform: uppercase }`, as the plan asked ("key column in the existing `th` treatment"). The DOM text is verbatim. A camelCase or case-sensitive key would read differently from the file. No change requested; mentioned in case the developer wants keys shown as written.
3. **[note]** Density: an 11-key kb record in a 3×2 tile with the explorer open is a 777px table, about 3.5 tile-heights of metadata before the first body line. It wraps correctly and is reachable (article `overflow-y: auto`, scrollH 2483 / clientH 224). No change requested, since the plan puts collapsing or nesting out of scope.
4. **[note]** The raw fallback `pre.frontmatter` scrolls horizontally inside itself (`overflow-x: auto`, scrollW 1937 / clientW 203 in a tile). The article itself never scrolls horizontally, so the content is reachable. REQ-10's no-horizontal-scroll clause names the table only.
5. **[note]** "Renders exactly as today" (REQ-7) was checked by structure (unclosed fence gives `HR`, then a `foo: bar` paragraph, then the body `H1`; a later `---` stays an `hr`). I did not compare DOM against a `main` build. `splitFrontmatter` returns the input unchanged on those paths.
6. **[note]** W16 is reviewer-verified in the plan, so no spec was expected to catch Major 1. If it is fixed, a tile-hosted E2E measuring `scrollWidth` vs `clientWidth` with the explorer open and a ~25-char key would pin it (kb:lesson/surface-never-measured-against-its-host).
