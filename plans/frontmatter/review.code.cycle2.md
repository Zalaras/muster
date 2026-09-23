# Correctness review: Frontmatter

**Plan**: frontmatter
**Verdict**: needs-changes
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
