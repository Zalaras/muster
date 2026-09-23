# Review: frontmatter

**Plan**: frontmatter
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser needs-changes, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Frontmatter

**Plan**: frontmatter
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 14176 words (budget 8000) — sections: rules 1876 · features 2408 · diagrams 3882 · decisions 2465 · proposed 496 · facts 2 · lessons 3039 · runbooks 2 (WARN: pack exceeds budget of 8000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 fence split (BOM, LF/CRLF, trailing ws) | Yes — `frontmatter.ts` `OPEN_FENCE`/`CLOSE_FENCE`, body starts after the closing line ending | unit (BOM, CRLF, BOM+CRLF, trailing space/tab) + E3 | pass |
| REQ-2 flat form → table | Yes — `FLAT_LINE` matches the plan's regex exactly; value trimmed, `""` when absent, duplicates kept | unit (order, dupes, empty, `:` in value, list-shaped, comments) + E3/E4 | pass |
| REQ-3 non-flat → raw `pre` | Yes — any non-flat line returns `{kind:"raw", text: inner}` | unit (block list, `\|` scalar, unkeyed, `key:value`, mixed) + E5 (exact `textContent`) | pass |
| REQ-4 empty/comments-only → nothing, stripped | Yes — `parseBlock` returns `null` | unit (empty, comments-only, whitespace-only) | pass |
| REQ-5 first child, DOM APIs + `textContent` only | Yes — `buildFrontmatterTable`/`Fallback` use `createElement`/`textContent`/`setAttribute`, `fragment.prepend` | E3 (`firstElementChild` = TABLE), E4 | pass |
| REQ-6 no outline entry, ids over body only | Yes — prepend happens after the heading walk; `marked` only sees `body` | E3, E5 | pass |
| REQ-7 no/unclosed fence → as today | Yes — returns the original `text` (BOM included) | unit (W1/W2, `----`, `--- x`) + E6 pins (E15/E16/E17/ec26) green in the sweep | pass |
| REQ-8 sticky plan | Yes — `scanPlan` falls back to the retained `PlanPath` and re-stats | `TestScanPlan_StickyOnceNamed` (12 subtests) + E1/E2 — but D2/D3/D4/D5/D6 as stated are only partly covered (Major 2) | pass (impl) / coverage gap |
| REQ-9 straggler gate unchanged | Yes — `SetPlan`'s `claudeSessionID` gate untouched | existing `TestIngestRouting_StragglerFromBeforeAClearNeverMovesTranscriptOrPlan` + E2 | pass |
| REQ-10 metadata styling, wraps | Yes — `.md table.frontmatter` width 100%, key `nowrap`, value `overflow-wrap: anywhere`; inherits `.md table/th/td` | reviewer-verified (W16) | pass (by CSS reading; render is review-browser's) |
| DIAG | `kb:diagram/web-components` (for frontmatter.ts, markdown.ts, style.css), `kb:diagram/daemon-components` (reader.go) | — | fail — web-components still says `reader/` "9 modules"; there are now 10 (Major 3) |

## Build & Tests

E2E tests: pass (431) · Daemon tests (race): pass (20 packages ok) · Web tests: pass (1822, 44 files) · Daemon build: pass · Web build: pass · Lint: pass (golangci 0 issues; biome clean) — all read from $GATES_LOG_DIR (`gates-frontmatter-c1`, 0 failed lines). Also green there: contrast (43 pairs × 3 themes, 0 failures), versions fresh, e2e-honest, kb check (401 records, 0 problems), dead-refs (2880 checked, 0 missing), e2e-lint clean. `WARN size` (2 funlen hits in `reader_test.go`) left to review-maintainability.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D0 | `go build ./...` | pass (01-build.log, empty = exit 0) |
| D8 | `make test` | pass (deduped to test-race, 02-test.log) |
| D9 | `make lint` | pass (03-lint.log, 0 issues) |
| D10 | `make test-race` | pass (02-test.log, `go test -race -count=1 ./...`, 20 ok) |
| W11 | `make web-build` | pass (04-web-build.log) |
| W12 | `make web-test` | pass (05-web-test.log, 1822 passed) |
| W13 | `make web-lint` | pass (06-web-lint.log) |
| E7 | `make e2e` | pass (14-e2e.log, 431 passed) |
| K1 | `make check-kb` | pass (10-kb-check.log) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass — both ADRs `proposed` with `refs: plan:frontmatter`, and each describes what shipped; `frontmatter.ts` added to the flat-table ADR's `files`; no `deviation:` or `doc-delta:` lines in any log; the `TODO.md` move of #35/#46 is correctly held until Completion (orchestrate: no tick before `approved`). Doc Delta: both "becomes true" sentences hold. The only `SetPlan(…, "")` call site is `scanPlan` when there is no retained path either, so "never null again" is true, and the frontmatter never reaches `marked` or the outline. `docs/protocol.md`'s `plan` comment matches the code. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D7 | retention rule in exactly one function, named in Decisions | pass | `daemon-implementation.md` Decisions names `scanPlan`; `SetPlan` unchanged (`git diff main...HEAD -- internal/session` empty); the only `sess.PlanPath =` assignment is still `SetPlan` (manager.go:1009) plus the row load (1595) |
| W10 | frontmatter DOM via `createElement` + `textContent` only | pass | `markdown.ts` `buildFrontmatterTable`/`buildFrontmatterFallback`: `createElement`, `className`, `setAttribute("aria-label")`, `th.scope`, `textContent`, `append`. `frontmatter.ts` is DOM-free. No `innerHTML`/`DOMParser`/`insertAdjacentHTML` in the diff (grepped) |
| W15 | no `any` in new web code | pass | grepped the added lines under `web/`: none (the E4 spec uses `as unknown as {…}`) |
| W16 | table wraps in a 3×2 tile, no horizontal scroll | pass (code) | `.md table` has no `display:block`/`overflow`; the new rules set `width:100%`, key `width:1%; white-space:nowrap`, value `overflow-wrap:anywhere`. What it measures on screen belongs to review-browser |
| W17 | no heading holds frontmatter text (flat/raw/empty) in Focus and the pop-out | pass (code) | only `body` reaches `marked`. The frontmatter node is table/tbody/tr/th/td or pre/code and is prepended after the heading walk. Both hosts go through `features/reader.ts:285` `renderMarkdown`. E5 asserts exactly one `h1–h6` |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — `reader.go` reaches the transcript only via `claudecode.LocatePlanFile`; no Claude-Code field names in the added lines |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass — ingest path untouched; `scanPlan` still runs in the async feature observer |
| 4 | tmux socket / sizing | pass — no tmux in the diff |
| 5 | No payload logging | pass — only the existing `session_id`-keyed Debug/Warn lines |
| 6 | Empty-gauge honesty | pass — `plan: null` / `exists:false` still render `no plan yet`; REQ-4's empty block renders nothing rather than an empty table |
| 7 | Identity on tmux target | pass — plan retention keys on the Muster session id (row), gated by the current `claudeSessionID` |
| 8 | Settings trespass | pass |
| 9 | Real `claude` | pass — none |

## Issues

### Critical
None.

### Major
1. **[daemon-impl]** Four daemon doc comments still say the plan is null, or derived from the latest transcript, when the latest transcript names none. This plan made that false: after `/clear` the plan is retained from an earlier transcript. The plan's Affected Files asked for "the doc comments that say plan: null on a planless scan" to be updated. The implementation log checked only `manager.go` and `session.go`:
   - `internal/server/sessionwire.go:35-36` — "the session's derived plan file, null when the latest known transcript names none"
   - `internal/server/readerwire.go:36-37` — "Null when the session's latest known transcript names no plan."
   - `internal/session/session.go:111-113` and `internal/store/session.go:68-69` — "the latest transcript path a routed hook named and the plan derived from it". The plan may now come from an earlier transcript.

   Fix: restate each one as "null until a transcript has named a plan; once set, a planless scan keeps it" (kb:adr/reader-plan-sticky-once-named).
2. **[web-impl]** Two web comments describe the reversed `/clear` behaviour:
   - `web/src/protocol.ts:112-115` — "`null` when the session's latest known transcript names no plan at all (never entered plan mode, or `/clear` minted a fresh planless transcript)". Since REQ-8, `/clear` no longer nulls it. Also, "`exists: false` means plan mode was entered but nothing has been written yet" leaves out the deleted-file case that `docs/protocol.md` now names.
   - `web/src/features/reader.ts:449-452` — "(E5: a `/clear` must not resurrect the old plan's badge just because the listing hasn't been re-fetched)". E5 was rewritten to assert the opposite: the badge stays after `/clear`.

   Fix: match both to `docs/protocol.md`'s new `plan` comment. The `session`-is-authoritative rule in reader.ts still stands; only the `/clear` justification is false.
3. **[daemon-tests]** Several daemon acceptance criteria have no test that asserts what they state. `TestScanPlan_StickyOnceNamed` checks only the final `PlanPath`/`PlanExists` after a direct `scanPlan` call:
   - **D2** "broadcast once" and **D3** "broadcasts it": no broadcast is observed.
   - **D5** "broadcasts nothing": only the pre-existing no-transcript listing test covers it. The planless-transcript case has no broadcast assertion.
   - **D4** (SessionStart{clear} applied before the late SessionEnd{clear}, plan retained, edge case 3): no test anywhere. E1 delivers SessionEnd first.
   - **D6** (a planless scan of one session leaves another session's plan untouched, edge case 10): no test anywhere.

   Fix: add a broadcast-counting assertion to the existing table, or a sibling test using the file's existing sessionUpsert-reading helpers. Add one SessionStart-first rebind test through the ingest path, and one two-session test.
4. **[e2e-specs]** `web/e2e/helpers/reader.ts` `frontmatterRow` doc comment says the `has` locator "must be rooted at `page` (or `region`) rather than at `table`". The "(or `region`)" half is false for the same reason the comment itself gives: Playwright re-applies the inner chain inside each `tr`. I measured it with `page.setContent` of the same markup and `table.locator("tr").filter({has: X}).count()`: `page`-rooted → 1, `region`-rooted → 0, `table`-rooted → 0. A future author who follows the comment reintroduces the Repairs-row-1 defect. Fix: drop "(or `region`)", and say any locator whose chain includes an ancestor of the `tr` fails.

5. **[orchestrator]** Diagram drift: `docs/diagrams/web-components.md:53` still says `Component(reader, "reader/", "9 modules", …)`. `web/src/reader/` now has 10 non-test modules; `frontmatter.ts` is new, and main had 9. Update the count in the doc-upkeep commit (`docs/diagrams/` records are the orchestrator's). This does not block approval.

### Minor
None.

### Notes
1. **[note]** `scanPlan` reads the retained path with `manager.Get` and writes it with `SetPlan` under separate locks. A planless scan interleaved with a concurrent plan-naming scan for the same binding can write the old path back over the new one. The same interleaving on `main` wrote `""`, so this is not a regression. Whether it needs a guard is review-maintainability's call.
2. **[note]** Rewritten E1 (`reader.spec.ts` ~L269) uses a 1 s `settleFor` for a "stays unchanged" check. On the pre-fix tree it would go red, because the old clear was prompt, so it is not vacuous today. It carries no positive signal that the rebind's scan has actually run.
3. **[note]** Repairs row 1 (`frontmatterRow` re-rooted at `page`) strengthens the lookup; it weakens nothing. E3/E4 still assert per-key value text, and the `toHaveCount(3)` row count stands alongside. It fixes a locator defect, not a flake, so no extra soak is owed; e2e-validate's own 10× soak is recorded. The defect was caught in the pipeline by web-impl's handoff, before e2e-validate ran it live.
4. **[note]** `web/src/reader/CLAUDE.md`'s invariant "The sanitized fragment `markdown.ts` returns is the only thing ever inserted" still holds. The fragment is now sanitized body plus the textContent-built frontmatter node. It could say so, but the claim is not false.

## Browser review

# Browser review: Frontmatter

**Plan**: frontmatter
**Part verdict**: needs-changes
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

## Maintainability review

# Maintainability review: frontmatter

**Plan**: frontmatter
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: `kb: pack 10993 words (budget 8000)`, over budget (WARN): rules 1874 · features 2408 · diagrams 3882 · decisions 2465 · proposed 0 · facts 2 · lessons 354 · runbooks 2
**Scope**: 6 files from `git diff main...HEAD -- cmd internal web/src` (tests excluded); 4 are code (`internal/server/reader.go`, `web/src/reader/frontmatter.ts`, `web/src/reader/markdown.ts`, `web/src/style.css`), 2 are generated or ownership CLAUDE.md files

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/server/reader.go | readerwire.go, ingest.go, sessions.go; `internal/session/manager.go` (`SetPlan`, `SetTranscript`, `Get`) | yes ("no new seam; chose `scanPlan` over `SetPlan`") | none | Major 1 |
| web/src/reader/frontmatter.ts | slug.ts, paths.ts, mermaid.ts, markdown.ts | yes (follows `slug.ts`; `rg -il frontmatter web/src` found no hits beforehand) | none | pass |
| web/src/reader/markdown.ts | render/mermaid.ts, render/diagrams.ts, features/reader.ts | yes (DOM builders stay in the existing DOM exception, not a new `render/` module) | none | pass |
| web/src/style.css | the surrounding `.md table`/`.md pre` and mermaid blocks | yes (layout only, no new tokens) | n/a | pass |
| internal/server/CLAUDE.md | — (generated trailer) | n/a | n/a | pass |
| web/src/reader/CLAUDE.md | — | n/a | n/a | pass |

Duplicate search for the new web helpers:

```
$ rg -n -i "frontmatter|\\uFEFF|FEFF|^---" web/src --glob '!*.test.ts' | grep -v reader/frontmatter.ts
web/src/render/mermaid.ts:46:  // frontmatter may still ask for it or override it (REQ-2/W23).   <- a comment about mermaid config, not a splitter
(the other hits are the new call sites in markdown.ts, style.css and reader/CLAUDE.md)
$ rg -n "^export function (el|h|make|create)\w*\(|function el\(" web/src --glob '!*.test.ts'
(no shared createElement helper exists; the other render modules also build nodes inline with createElement + textContent)
```

No second implementation exists. `frontmatter.ts` has the same shape as its siblings `slug.ts`, `paths.ts` and `reader/mermaid.ts`: a leading purpose comment, pure exported functions, and a doc comment on each. The pure-split, DOM-build pair repeats the `reader/mermaid.ts` / `render/mermaid.ts` split, with `markdown.ts` as the documented DOM exception.

## Issues

### Critical

### Major

1. **[daemon-impl]** The retention rule is a check-then-act split across the manager's lock, and two goroutines run it — `internal/server/reader.go:237-250`. `scanPlan` reads `sess.PlanPath` through `f.manager.Get` (it takes `Manager.mu` and releases it), then decides, then calls `f.manager.SetPlan` (it takes `Manager.mu` again). `SetPlan` (`internal/session/manager.go:997`) still stores whatever it is given, and its own doc comment says `path == "" is the wire plan:null`. `scanPlan` has two callers on different goroutines. One is the single ingest worker, through `Observe` (`reader.go:168`). The other is every `GET /api/sessions/{id}/reader` request goroutine, through `handleReaderList` (`reader.go:276`). One concrete interleaving:
   - (a) The handler goroutine H runs `LocatePlanFile` while the transcript does not yet name a plan, so `pf.Path == ""`.
   - (b) H calls `Get`, which returns `PlanPath == ""`.
   - (c) The ingest worker I handles the `PlanMaybeReady` hook, finds plan X, and `SetPlan(X, …)` commits.
   - (d) H calls `SetPlan("", false)`. Because `"" != X`, it changes the plan, persists, and broadcasts `plan:null`.
   The plan was named and then cleared, which is exactly what the new comment at `reader.go:221-226` says "never" happens. A second interleaving has the same gap: H retains X from `Get`, I replaces it with Y, and H writes X back, which reverts a newer plan. `make test-race` (the gates' `go test -race -count=1 ./...`) cannot see either one. Every field access happens under `Manager.mu`, so there is no data race, only a lost update. This breaks conventions § Design "One owner per concept": the rule "a planless scan never clears a named plan" lives in the caller, while the setter it guards still allows the clear. The `design:` line explains why the rule is not in `SetPlan`: `observeWrite` would not need it. That reason does not address atomicity. A fix must make the retain-or-replace decision under the same `Manager.mu` critical section that writes `PlanPath`. Then no scan can clear or revert a plan that was set after the scan read its retained value. It must also leave only one place that states the rule, so no other caller can bypass it by passing `""`.

### Minor

### Notes

1. **[note]** The component diagram's `reader/` node still says "9 modules" (`docs/diagrams/web-components.md:53`); with `frontmatter.ts`, `web/src/reader/` now has 10 non-test modules. That is `review-work`'s DIAG row.
2. **[note]** Two size warnings, both on test files. `TestScanPlan_StickyOnceNamed` (106 > 60, funlen) is new. `plans/frontmatter/daemon-tests.md:36-41` gives the reason: it is one crossed table of named `t.Run` rows, cited against kb:lesson/invariant-missed-by-per-transition-tests. The reason holds. `TestIngestRouting_StragglerFromBeforeAClearNeverMovesTranscriptOrPlan` (46 > 40 statements) was already on `main`, and this branch does not touch it.
3. **[note]** Putting `buildFrontmatterTable`/`buildFrontmatterFallback` in `markdown.ts` rather than in a `render/` module is a real choice, and the `design:` line explains it. `render/mermaid.ts` is the precedent for the other placement. The explanation holds because `markdown.ts` already builds DOM and is its only caller.
