# Doc Reconcile: frontmatter

**Verdict**: reconciled
**Features derived**: reader, lifecycle (plan header: reader, lifecycle)

This is the re-run after cycle1's block. The developer widened the plan header to
`reader, lifecycle` (commit `fa3132b`) and review cycle 4 re-reviewed with lifecycle in the pack
(`plans/frontmatter/review.md`, approved). Step 1 was redone from scratch against the full branch
diff (`git diff 66960aa..HEAD --name-only`), not assumed from the prior blocked report.

## Step 1 — feature mapping

Every changed `internal/`/`web/src/`/`web/e2e/` file maps to `reader` or `lifecycle` via each
feature's `go:`/`web:`/`e2e:` globs (`go run ./tools/kb for <path>`):

| File | Owning feature |
|------|------|
| `internal/server/reader.go`, `reader_test.go`, `readerwire.go` | reader (`internal/server/reader*.go`) |
| `web/src/reader/*`, `web/src/features/reader.ts`, `web/e2e/reader.spec.ts`, `web/e2e/helpers/reader.ts` | reader |
| `internal/session/manager.go`, `internal/session/session.go` | lifecycle (`internal/session/**`) |
| `internal/server/sessionwire.go` | lifecycle (`internal/server/sessionwire*.go`) |
| `internal/store/session.go` | lifecycle (`internal/store/session*.go`) |

One file needed a closer look: `web/src/protocol.ts` is glob-owned by **connection**
(`web/src/protocol*.ts`, `docs/features/connection/spec.md`), a feature not in the plan header.
I did not treat this as a Step-1 block. Reasoning, recorded here rather than silently waived:
the only change in that file (commit `ad98454`) is the `SessionPlan` doc comment, and it exists
to mirror `docs/protocol.md`'s `plan` comment at the `ws.session` anchor — an anchor both
`reader` and `lifecycle` claim in their own `protocol:` frontmatter list (`connection`'s
`protocol:` list is `[transport, ws, ws.hello, ws.snapshot]` — it does not claim `ws.session`).
Ownership of the *file* (connection, for version-bump/envelope governance) and ownership of the
*content changed* (reader/lifecycle, via the anchor) diverge here; every review cycle (1-4)
independently re-verified this exact comment against `docs/protocol.md` and the code, and found
no defect that connection's spec/ADRs (auth, tokens, banner) could plausibly have caught or
missed. See **For the orchestrator** below — I flag the glob-vs-anchor gap for future
consideration, but it is not a block for this run.

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| reader | § Locating the plan: "…the path and whether the file exists — null until a transcript names one, and never null again once it has; a scan that finds nothing keeps the last plan." | `internal/session/manager.go:Manager.ApplyPlanScan` (foundPath=="" falls back to `sess.PlanPath`; a never-set path stays `""`/null, a set path is never overwritten to empty) | added, replacing the old sentence |
| reader | § Locating the plan: "…null when the latest transcript names none." | — | deleted (contradicted by `ApplyPlanScan`; the old null-on-clear behaviour no longer exists) |
| reader | § The reader: "A leading YAML frontmatter block renders as a key/value table above the body (raw when not flat) and never reaches the outline." | `web/src/reader/frontmatter.ts:splitFrontmatter/parseBlock` (entries → table, else raw), `web/src/reader/markdown.ts:30-46` (outline built from `headings` before `frontmatterNode` is prepended) | added |
| `docs/protocol.md` | Session `plan` comment per plan's Protocol Contract | `docs/protocol.md:926-938` | verified, already merged at approval — no edit (matches `ApplyPlanScan` exactly) |
| lifecycle | No sentence added — lifecycle spec never mentions `plan` today and `ApplyPlanScan` writes no state-machine field, touches no transition, and isn't part of `## Wire`'s broadcast-scope sentence (which is specifically about status posts) | `docs/features/lifecycle/spec.md` (full read), `internal/session/manager.go:ApplyPlanScan` | verified true, no edit |

## Contradictions

None.

## For the orchestrator

- `[orchestrator]` `web/src/protocol.ts` is glob-owned by `connection`
  (`web/src/protocol*.ts`), but the anchor it carries for `SessionPlan` (`ws.session`) is claimed
  in the `protocol:` frontmatter of `reader` and `lifecycle`, not `connection`. This plan's four
  review cycles all reviewed and correctly verified this file's change without connection context,
  because the change is a doc-comment mirroring `docs/protocol.md` rather than anything about
  auth/tokens/the banner. No harm materialized this run, but the glob is coarser than the
  anchor list: a future plan touching `protocol.ts` for an anchor owned by a feature *not* in its
  header will hit the same ambiguity doc-reconcile hit here, without the benefit of four review
  cycles already having independently checked it. Worth a planning-process note (not a spec I may
  write): either fold `protocol.ts` into a genuinely cross-cutting/ungoverned category the way
  `docs/protocol.md` itself is treated, or accept that a shared wire-types file will periodically
  read as "scope creep" when only one anchor in it changes.
- `[orchestrator]` The four Notes in `review.code.md` name a pre-existing setter persist-order
  issue and a pre-existing `observeWrite` revert race, both already logged in
  `plans/frontmatter/proposed-backlog.md`. Not mine to act on; noted only so it isn't lost if
  this plan lands before the backlog is triaged.

## Checks

```
$ make gen-kb
go run ./tools/kb gen
kb: all generated files fresh

$ make check-kb
go run ./tools/kb check
kb: 402 records, 23 features, 0 problem(s)
kb: all checks pass
```

`git status --porcelain` after both: clean (my commit already landed).

Word count of every spec touched: `docs/features/reader/spec.md` body = **725 words** (687
before, +38; under the 800 cap — doc-delta estimated ~724, actual 725). No other spec was
edited (`docs/features/lifecycle/spec.md` needed no sentence, verified above).

## Git

One commit, reader only (lifecycle needed no edit):

- `c81ca6f` — `docs(frontmatter): reconcile reader spec with what shipped`

`plans/frontmatter/orchestration-state.json` was left untouched, as instructed.
