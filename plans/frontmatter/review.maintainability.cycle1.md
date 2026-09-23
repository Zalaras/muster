# Maintainability review: frontmatter

**Plan**: frontmatter
**Verdict**: needs-changes
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
