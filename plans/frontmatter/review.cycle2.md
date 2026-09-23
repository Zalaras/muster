# Review: frontmatter

**Plan**: frontmatter
**Verdict**: needs-changes
**Cycle**: 2
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser approved, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Frontmatter

**Plan**: frontmatter
**Part verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 14375 words (budget 8000) — sections: rules 1876 · features 2408 · diagrams 3882 · decisions 2465 · proposed 695 · facts 2 · lessons 3039 · runbooks 2 (WARN: pack exceeds budget of 8000)

Full review (cycle 1 had Majors, so §9 does not apply). Diff read: `git diff 8918842..HEAD` (the cycle-1 review's commit to HEAD `ff52e37`), plus the source of every file it touches.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 fence split (BOM, LF/CRLF, trailing ws) | Yes, unchanged since cycle 1 | unit + E3 | pass |
| REQ-2 flat form → table | Yes, unchanged | unit + E3/E4 | pass |
| REQ-3 non-flat → raw `pre` | Yes, unchanged | unit + E5 | pass |
| REQ-4 empty/comments-only → nothing | Yes, unchanged | unit | pass |
| REQ-5 first child, DOM APIs + `textContent` only | Yes, unchanged | E3, E4 | pass |
| REQ-6 no outline entry | Yes, unchanged | E3, E5 | pass |
| REQ-7 no/unclosed fence → as today | Yes, unchanged | unit + E6 pins green in the sweep | pass |
| REQ-8 sticky plan | Yes. The rule moved to `Manager.ApplyPlanScan` (`internal/session/manager.go:1039`). The retain-or-replace choice, the `os.Stat` and the write all happen under one `m.mu` hold. `scanPlan` (`reader.go:237`) now only forwards `pf.Path`. | `TestScanPlan_StickyOnceNamed` (12 rows, now with broadcast assertions: 8 broadcast-once rows, 4 no-broadcast rows) covers D1/D2/D3/D5. D6 has a new two-session test. D4 has a new SessionStart-first ingest test (Minor 1). | pass |
| REQ-9 straggler gate unchanged | Yes. `ApplyPlanScan` repeats `SetPlan`'s `ClaudeSessionID` gate before it reads anything | `TestIngestRouting_StragglerFromBeforeAClearNeverMovesTranscriptOrPlan`'s straggler ExitPlanMode reaches `ApplyPlanScan` with the stale id. Without the gate, it would re-stat the never-written `planB` to `exists:false`, and the test's `assert.True(got.PlanExists)` would go red. So the new copy of the gate is pinned, though only indirectly. E2 is green. | pass |
| REQ-10 metadata styling, wraps | Yes. `.md table.frontmatter { table-layout: fixed }`, key `th { width: 40%; overflow-wrap: anywhere }` (`style.css:1049-1057`) | New E2E (`reader.spec.ts:2329`) polls `article.md` `scrollWidth <= clientWidth` in a 3×2 tile with the explorer open, for a 28-char key and a 60-char key. test-specs.md records it going red when the pre-fix CSS is injected. Green in 14-e2e.log #260. | pass |
| DIAG | `kb:diagram/web-components` (style.css; `reader/` now says "10 modules", matching the 10 non-test modules) and `kb:diagram/daemon-components` (reader.go, manager.go; no import edge changed, since `session` gained only stdlib `os`) | — | pass |

## Build & Tests

E2E tests: pass (432) · Daemon tests (race): pass (20 packages ok) · Web tests: pass (1822, 44 files) · Daemon build: pass · Web build: pass · Lint: pass (golangci 0 issues; biome 179 files clean). All read from `$GATES_LOG_DIR` (`gates-frontmatter-c2`, 0 failed lines). Also green there: contrast (43 pairs × 3 themes, 0 failures), versions fresh, e2e-honest (empty log = exit 0), kb check (402 records, 0 problems), dead-refs (2883 checked, 0 missing), e2e-lint clean. The `WARN size` line (8 hits, including `TestScanPlan_StickyOnceNamed` 131 > 60) is review-maintainability's.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D0 | `go build ./...` | pass (01-build.log, empty = exit 0) |
| D8 | `make test` | pass (deduped to test-race, 02-test.log) |
| D9 | `make lint` | pass (03-lint.log, 0 issues) |
| D10 | `make test-race` | pass (02-test.log, `go test -race -count=1 ./...`, 20 ok) |
| W11 | `make web-build` | pass (04-web-build.log, built) |
| W12 | `make web-test` | pass (05-web-test.log, 1822 passed) |
| W13 | `make web-lint` | pass (06-web-lint.log) |
| E7 | `make e2e` | pass (14-e2e.log, 432 passed) |
| K1 | `make check-kb` | pass (10-kb-check.log) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass, with one `[orchestrator]` Major (Major 1). Checked: the new `kb:adr/reader-frontmatter-key-column-may-break` is `proposed` with `refs: plan:frontmatter` and `files: [web/src/style.css]`. The sticky ADR's `files` now names `manager.go`. The plan's Affected Files carries the *Amended* note. No `deviation:` or `doc-delta:` line appears in any log. Doc Delta: "null until a transcript names one, and never null again once it has" holds. The only production `SetPlan` caller left is `observeWrite` (`reader.go:192`), and it passes `sess.PlanPath` only when that equals a non-empty cleaned write path. `ApplyPlanScan` writes `""` only when both `foundPath` and the retained path are empty. The frontmatter sentence is unchanged and still true. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D7 | retention rule in exactly one function, named in Decisions | pass | `daemon-implementation.md` § Fix Attempt 1 Decisions names `Manager.ApplyPlanScan`. `rg "PlanPath\s*="` outside tests finds only `SetPlan` (1013), `ApplyPlanScan` (1068) and the row load (1654). `SetPlan` is a plain setter and makes no retain decision. |
| W10 | frontmatter DOM via `createElement` + `textContent` only | pass | `markdown.ts` and `frontmatter.ts` are untouched this cycle, and the cycle-1 evidence stands |
| W15 | no `any` in new web code | pass | the web diff this cycle is two comments, CSS and one E2E test. There is no `any` |
| W16 | table wraps in a 3×2 tile, no horizontal scroll | pass | `table-layout: fixed` makes the 40% key width binding. The new E2E pins `scrollWidth <= clientWidth` on `article.md` in exactly the failing host browser Major 1 found, and it is shown to go red on the old CSS. What it looks like on screen is review-browser's |
| W17 | no heading holds frontmatter text | pass | render path unchanged since cycle 1 |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. `ApplyPlanScan` takes a plain path and stats it with `os`. Transcript knowledge stays in `claudecode.LocatePlanFile` |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass. `scanPlan` still runs in the async observer. The `os.Stat` under `m.mu` is off the HTTP receipt path |
| 4 | tmux socket / sizing | pass. No tmux in the diff |
| 5 | No payload logging | pass. The only log line is the existing `session_id`-keyed Warn |
| 6 | Empty-gauge honesty | pass. `plan:null` / `exists:false` still render `no plan yet` |
| 7 | Identity on tmux target | pass. The gate keys on the row's current binding |
| 8 | Settings trespass | pass |
| 9 | Real `claude` | pass. None |

## Cycle-1 findings, verified

| Prior finding | Fix commit | Verified how |
|---------------|------------|--------------|
| correctness Major 1 `[daemon-impl]` stale plan:null comments (4 sites) | `a0125c2` | Read all four: `sessionwire.go:35-38`, `readerwire.go:36-38`, `session.go:111-117`, `store/session.go:69-74`. Each now says null until named, kept once set |
| correctness Major 2 `[web-impl]` reversed `/clear` comments | `ad98454` | `protocol.ts:112-118` matches `docs/protocol.md`, including the deleted-file `exists:false` case. `reader.ts:449-453` no longer claims `/clear` must drop the badge |
| correctness Major 3 `[daemon-tests]` D2–D6 coverage | `7f22a8f` | Broadcast assertions were added per row. `before` is read via `Get`, so the deleted-file row correctly expects a broadcast. There are new D6 and D4 tests. D4's fixture has a comment defect (Minor 1) |
| correctness Major 4 `[e2e-specs]` `has`-locator comment | `bb4dc7b` | `helpers/reader.ts:205-207` now says to root the locator at `page`, never at any ancestor of the `tr` |
| correctness Major 5 `[orchestrator]` diagram count | `0c95574` | `web-components.md:53` reads "10 modules" |
| browser Major 1 `[web-impl]` tile horizontal scroll | `ad98454` + E2E `bb4dc7b` | CSS read, and the new E2E is green. Re-measuring is review-browser's |
| maintainability Major 1 `[daemon-impl]` check-then-act | `a0125c2` | The decide, stat and write now run in one critical section (`manager.go:1039-1079`). Whether `SetPlan` still accepting `""` is acceptable is review-maintainability's (Note 2) |

## Issues

### Critical
None.

### Major
1. **[orchestrator]** `docs/adr/reader-frontmatter-key-column-may-break.md` describes a cap, but what shipped is a fixed width. Its summary and Option B say the key column is "capped", meaning its share is limited and a key breaks only "when it would overflow". The shipped rule is `table-layout: fixed` with `th { width: 40% }`. That makes the key column exactly 40% of the table for every table, so a table of two-letter keys also gives 40% of the width to the key column. `style.css`'s own comment says why: under auto layout, `max-width` was only a hint and did not fix the overflow. "Short keys still sit on one line" is true. The ADR is missing the consequence that the key column no longer shrinks to fit its content. Restate the Decision and Consequences as "the key column is fixed at 40% of the table width (`table-layout: fixed`) and a key breaks inside it". The plan's *Amended* note says "capped" too. This does not block approval.

### Minor
1. **[daemon-tests]** `TestIngestRouting_SessionStartClearAppliedBeforeLateSessionEndPlanRetained` (`internal/server/reader_test.go` ~L1049-1113) says three times that the rebind's scan runs "against a transcript naming no plan" / "(transcriptB names no plan)". But `transcriptB` is the literal `/tmp/transcript-clear-before-late-end-b.jsonl` and is never written: `ls` shows it does not exist. So the scan takes `LocatePlanFile`'s missing-file branch, not the planless-transcript branch that a real `/clear` produces (kb:fact/clear-mints-new-session-id: the new transcript exists and names no plan). Both branches reach `foundPath == ""`, so D4's assertion still holds. But the test claims to exercise a route it does not. Fix: write a planless transcript into `t.TempDir()` for B, for example `claudecodetest.RawSessionEnd(claudeB, "other")` as the D6 test does. Otherwise, change the three statements to say the transcript does not exist.

### Notes
1. **[note]** `style.css:1045` says "a 29-char and a 60-char key". `verified_claude_code_version` is 28 characters, which is what the E2E and test-specs.md say. It is a trivial count slip, so no change is requested.
2. **[note]** For review-maintainability: `observeWrite` (`reader.go:176-193`) still reads `sess.PlanPath` via `Get` and then calls `SetPlan(sess.PlanPath, true)` under a second lock. A handler-goroutine scan that replaces X with Y in between would be reverted to X with `exists:true`. That pattern predates this plan and is not the retention rule. `SetPlan` also still accepts `""`, although its doc comment now steers scans to `ApplyPlanScan`. Whether either needs a guard is maintainability's call.
3. **[note]** No manager-level unit test calls `ApplyPlanScan` directly, for example a refusal on a stale `claudeSessionID`. Its gate is pinned only indirectly, through the straggler ingest test (see REQ-9 row). daemon-impl's log records a 2000-iteration race stress test that was proved red on a reintroduced split and then deleted. The atomicity is therefore argued rather than guarded by a committed test. No change is requested, since the plan's D-criteria do not ask for one.
4. **[note]** The sticky ADR (`kb:adr/reader-plan-sticky-once-named`) says "the rule has one owner in the daemon" and does not name the function. That stays true after the move from `scanPlan` to `ApplyPlanScan`. Its `files` now lists both.

## Browser review

# Browser review: Frontmatter

**Plan**: frontmatter
**Part verdict**: approved
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

## Maintainability review

# Maintainability review: frontmatter

**Plan**: frontmatter
**Part verdict**: needs-changes
**Cycle**: 2
**Pack**: `kb: pack 10993 words (budget 8000)`, over budget (WARN)
**Scope**: 14 files from `git diff main...HEAD -- cmd internal web/src` (tests excluded). 10 are code or CSS: `internal/server/{reader,readerwire,sessionwire}.go`, `internal/session/{manager,session}.go`, `internal/store/session.go`, `web/src/{protocol.ts,features/reader.ts,reader/frontmatter.ts,reader/markdown.ts,style.css}`. The other 3 are generated `CLAUDE.md` trailers. This cycle's delta against cycle 1 (`29580c7..HEAD`) was read line by line.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/session/manager.go | `SetPlan`, `SetTranscript`, `MarkSeen`, `SetTitle` in the same file; `mu`/`idLocks` declarations | yes (Fix Attempt 1: rule lives only in `ApplyPlanScan`; stat under the lock, with the reason) | filelen 1810 (1751 on main) | pass, Notes 1–3 |
| internal/server/reader.go | readerwire.go, sessionwire.go, `observeWrite`/`handleReaderList` in the same file | yes | none | pass, Note 1 |
| internal/server/readerwire.go, sessionwire.go | each other | n/a (comment only) | none | pass |
| internal/session/session.go, internal/store/session.go | manager.go | n/a (comment only) | none | pass |
| web/src/style.css | the surrounding `.md table` rules | yes (cycle 1 layout line; the fix adds no tokens) | n/a | Minor 1 |
| web/src/features/reader.ts | reader/*.ts | n/a (comment only) | filelen 611 (610 on main) | Minor 1, Note 4 |
| web/src/protocol.ts | — | n/a (comment only) | none | pass |
| web/src/reader/frontmatter.ts, markdown.ts | slug.ts, paths.ts, mermaid.ts (checked in cycle 1, unchanged since) | yes | none | pass |

**Cycle 1 Major 1 is resolved.** The retain-or-replace decision now happens inside one `Manager.mu` critical section in `Manager.ApplyPlanScan` (`internal/session/manager.go:1039-1079`). That section reads the live `sess.PlanPath`, runs the stat, checks for no change and writes. `scanPlan` (`reader.go:227-240`) only passes on what the scan found. `rg` finds exactly one place that reads `PlanPath` and then decides to retain it:

```
$ rg -n "SetPlan\(|ApplyPlanScan\(" internal cmd -g '!*_test.go'
internal/session/manager.go:1001:func (m *Manager) SetPlan(...)
internal/session/manager.go:1039:func (m *Manager) ApplyPlanScan(...)
internal/server/reader.go:192:  f.manager.SetPlan(ctx, sessionID, claudeSessionID, sess.PlanPath, true)   <- observeWrite, real path only
internal/server/reader.go:237:  f.manager.ApplyPlanScan(ctx, sessionID, claudeSessionID, pf.Path)          <- scanPlan
```

`ApplyPlanScan` has the same shape as its sibling setters: lock, `ErrUnknownSession`, a `claudeSessionID` gate that returns a snapshot, a no-change short-circuit, `sessionToRow` + `Clone`, unlock, then `UpdateSession` wrapped as `"persisting plan for session %d: %w"` and `broadcast`. Compare `func (m *Manager) SetPlan(ctx context.Context, id int64, claudeSessionID, path string, exists bool) (*Session, bool, error)` with `func (m *Manager) ApplyPlanScan(ctx context.Context, id int64, claudeSessionID, foundPath string) (*Session, bool, error)`. All 53 `Manager` methods live in `manager.go`, so placing it beside `SetPlan` also matches the package.

## Issues

### Critical

### Major

### Minor

1. **[web-impl]** Two comments added in the cycle-1 fix narrate history instead of stating the current reason. This breaks conventions § Comments: "don't narrate history".
   - `web/src/style.css:1035-1048` gives the whole measurement story: the first attempt that failed, "measured with Playwright", `scrollWidth 525 > clientWidth 233`, "This supersedes the plan's Affected Files instruction … (review cycle 1, browser Major 1 …)". A newcomer will never see the plan or the review it refers to.
   - `web/src/features/reader.ts:451-453` says: "Since REQ-8 a `/clear` keeps the retained plan …, so this fallback is no longer about surviving a `/clear`; E5 now asserts the badge stays after one". That describes what the code used to be for, not what it does.

   A fix must leave each comment stating only the constraint that is true now. For the CSS: auto table layout treats a cell width as a hint, so `table-layout: fixed` is what makes the key column's 40% a hard cap that long keys wrap inside. For reader.ts: the listing's plan is a fallback only while `session` is unknown. The measurement and review-cycle story already lives in `plans/frontmatter/web-implementation.md` Fix Attempt 1.

### Notes

1. **[note]** One check-then-act on `PlanPath` remains, it predates this branch, and its code is unchanged here. `main:internal/server/reader.go` has the identical `SetPlan(ctx, sessionID, claudeSessionID, sess.PlanPath, true)` line. In `observeWrite` (`internal/server/reader.go:176-195`), ingest worker I reads `sess.PlanPath == X` through `Get` (lock released). Handler goroutine H, in `handleReaderList` → `scanPlan` → `ApplyPlanScan`, then commits plan Y. Then I calls `SetPlan(X, true)`, which writes X back over Y because `X != Y`. That reverts a newer plan. This is the same revert shape cycle 1 named for `scanPlan`. It is not the sticky-once-named rule, and this branch did not introduce it. I suggest the orchestrator add it to `TODO.md`: the exists-flip should commit only if `PlanPath` still equals the path it read.
2. **[note]** `ApplyPlanScan` calls `os.Stat` while holding `Manager.mu`. No sibling does I/O under `mu`: `SetPlan`, `MarkSeen` and the others release it before `UpdateSession`, and `idLocks` is documented as "never held across tmux I/O". The `design:` line states this trade-off (a local stat, only during a scan, with no read-decide-write gap), and the reason holds for a single-user, local-disk tool. This is also the first `os` import in `internal/session`.
3. **[note]** Size: `internal/session/manager.go` filelen grew from 1751 to 1810 lines. That was already far over the 500-line threshold before this branch. The only reason given in Decisions is "pre-existing … unchanged in kind", which is thin. The placement is still right, because every `Manager` method lives in this file, so no split is asked. `TestScanPlan_StickyOnceNamed` funlen grew from 106 to 131 lines. The reason in `plans/frontmatter/daemon-tests.md:36-41` (one crossed table) still holds.
4. **[note]** `web/src/features/reader.ts` filelen went from 610 to 611 lines, and the extra line is a comment. The warning predates the branch.
5. **[note]** No test calls `ApplyPlanScan` concurrently or directly. It is exercised only through the `scanPlan` table. The implementer's stress test was a throwaway and was deleted. Whether to pin atomicity with a test is `review-work`'s coverage call. The race detector could not see this lost update in any case.
6. **[note]** `readerManager` (`reader.go:105-110`) grew to four methods for a single consumer with no fake (`rg -n readerManager -g '*_test.go'` finds no hits). This matches how the interface already stood, so no change is asked.
