# Correctness review: Frontmatter

**Plan**: frontmatter
**Verdict**: needs-changes
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
