# Doc Reconcile: frontmatter

**Verdict**: blocked
**Features derived**: reader, lifecycle (plan header: reader)

## Claims

Not evaluated — Step 1 stopped before any claim in `plans/frontmatter/doc-delta.md` was checked
against code. No edit was made to any spec.

## Step 1 finding — feature set widened beyond the plan header

`plans/frontmatter/plan.md` line 8: `**Features**: reader`.

Mapping the full branch diff (`git diff $(git merge-base main HEAD)..HEAD --name-only`) through
each feature's `go:`/`web:`/`e2e:` frontmatter globs (`go run ./tools/kb for <path>`), four
changed source files resolve to the **lifecycle** feature, not reader:

| File | Matches glob | Owning feature (`docs/features/lifecycle/spec.md` frontmatter) | Change |
|------|--------------|------|--------|
| `internal/session/manager.go` | `internal/session/**` | lifecycle | substantive: new method `Manager.ApplyPlanScan(ctx, id, claudeSessionID, foundPath string) (*Session, bool, error)` added in review-cycle-1 Fix Attempt 1 (daemon-impl), moving the sticky-once-named retention decision from `internal/server/reader.go`'s `scanPlan` into this lifecycle-owned file, under `m.mu` |
| `internal/session/session.go` | `internal/session/**` | lifecycle | doc-comment rewrite on `Session.TranscriptPath`/`PlanPath`/`PlanExists` (`internal/session/session.go:111-116`) |
| `internal/server/sessionwire.go` | `internal/server/sessionwire*.go` | lifecycle | doc-comment rewrite on `sessionWire.Plan` (`internal/server/sessionwire.go:35-38`) |
| `internal/store/session.go` | `internal/store/session*.go` | lifecycle | doc-comment rewrite on `SessionRow.TranscriptPath`/`PlanPath`/`PlanExists` (`internal/store/session.go:69-73`) |

`internal/server/reader.go`, `internal/server/reader_test.go` and `internal/server/readerwire.go`
match `internal/server/reader*.go` (reader's own glob) and are correctly in-scope. The four files
above are not — `docs/features/lifecycle/spec.md`'s frontmatter (`go: [internal/session/**,
internal/server/sessionwire*.go, internal/store/session*.go, ...]`) unambiguously governs them,
and "lifecycle" appears nowhere in `plan.md`'s `**Features**` header, `plans/frontmatter/doc-delta.md`,
or `plans/frontmatter/orchestration-state.json`. `kb:adr/reader-plan-sticky-once-named` (the ADR
recording this decision) tags itself `features: [reader]`, but that tag categorizes which spec
*discusses* the decision — it does not relocate which spec's globs *own* the files the decision
was implemented in. `docs/features/connection/contract.md` and `docs/features/lifecycle/contract.md`
also appear in the branch diff, but both are `make gen-kb`-generated ripples from the shared
`docs/protocol.md` `ws.session` comment edit (a protocol anchor lifecycle's frontmatter also lists)
— not evidence of a second source-level touch.

This is the condition my role definition calls out by name: "If a changed file maps to a feature
outside the plan's `**Features**` header, your verdict is `blocked`. That is not a doc problem you
may fix: it means every agent's `kb pack` was missing that feature's records for the whole run."
Concretely: daemon-tests, e2e-specs, and all three review agents ran with `kb pack --plan
frontmatter --role ...`, which is scoped to `--plan frontmatter`'s declared `reader` feature — none
of them would have been handed lifecycle's spec, ADRs (e.g.
`kb:adr/lifecycle-session-identity-is-tmux-target`, `kb:adr/ingest-monotonic-rebind`) or the
existing `observeWrite` race note that `proposed-backlog.md` itself says "predates this branch" —
while a review-cycle-1 fix was adding a new locking method to lifecycle's own concurrency-control
file in response to a maintainability finding about exactly that kind of race.

I made no spec edits and no commit. Per the boundary rules, I do not decide whether the plan
header should have said `reader, lifecycle`, whether `Manager.ApplyPlanScan` belongs on
`internal/session/manager.go` at all, or whether it should move — those are planning/review
calls for a human, not a doc-promotion call for me.

## Contradictions

Not reached.

## For the orchestrator

- `[orchestrator]` The plan's `**Features**` header (`plans/frontmatter/plan.md:8`, `reader`
  only) undercounts the branch's real footprint: review-cycle-1's maintainability fix
  (`internal/session/manager.go`: new `ApplyPlanScan`) and its four doc-comment follow-ups
  (`internal/session/session.go`, `internal/server/sessionwire.go`, `internal/store/session.go`,
  plus `internal/server/reader.go` which *is* in-scope) touch **lifecycle**-owned files. Every
  `kb pack --plan frontmatter --role ...` call this run made ran without lifecycle's spec/ADRs in
  context. Needs a human decision: amend the plan header to `reader, lifecycle` (and re-run the
  parts of the pipeline that would have packed lifecycle context — at minimum, review would want
  lifecycle's spec available for the `ApplyPlanScan` locking change), or confirm the touch was
  narrow enough that no review, in hindsight, needed lifecycle's records and accept it as a
  documented gap. Either way this is a `SPEC.md`/planning-process call, not something I can settle
  by editing `docs/features/lifecycle/spec.md` on my own authority.
- `[orchestrator]` Once the feature-set question above is resolved, doc-reconcile still needs to
  run for real: `plans/frontmatter/doc-delta.md`'s two reader claims (the `plan` retention
  sentence and the frontmatter-table sentence) are unverified and unpromoted, and if lifecycle
  is added to scope, `Manager.ApplyPlanScan` and the doc-comment rewrites in the four files above
  may themselves warrant a `docs/features/lifecycle/spec.md` sentence (the spec currently says
  nothing about plan retention at all — it's entirely a reader-spec concept today, which is
  itself a hint the plan header may have been right and the *code placement* is what crossed the
  boundary, not the docs). I did not make that call either way.

## Checks

Ran `make gen-kb && make check-kb` against the current tree (no edits made, since the run stopped
at Step 1) as a baseline/diagnostic only — not tied to any promotion:

```
go run ./tools/kb gen
kb: all generated files fresh

go run ./tools/kb check
kb: 402 records, 23 features, 0 problem(s)
kb: all checks pass
```

`git status --porcelain` after both commands: empty. No files touched, nothing committed.
No spec was edited, so no word count changed.
