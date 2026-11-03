# Doc Reconcile: sweep-2026-11-03-1

**Verdict**: reconciled
**Pack**: kb: pack 19877 words (budget 30000)
**Features derived**: lifecycle, actions, notes, focus (web/e2e/effort-header.spec.ts), connection (internal/server/server.go, cmd/musterd/onexit.go) (plan header: Features lifecycle, actions, notes; Touches focus, connection)

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| lifecycle | A start deletes no row; ended rows stay resumable until Remove | `internal/session/reconcile.go:Reconcile`, `actOnReconcile` (no sweep path; `Swept` field gone); only `removeSessionRecord` callers are Remove and launch rollback | edited |
| lifecycle | "ended rows are deleted" / "kept for one resume" | same | deleted |
| protocol | Note deleted by Remove only | `internal/session/manager.go:removeSessionRecord` | edited |
| protocol | sessionRemoved: no startup-sweep sentence, "until removed" | same | edited/deleted |
| protocol | Reconcile bullets: absent alive=1 kept; absent alive=0 kept as is, `endedAt` unchanged; swept bullet gone | `reconcile.go:classifySessionsByOwnership` (absent+alive -> toEnd, else skipped) | edited |
| protocol | `-on-exit kill`: next startup shows it ended and resumable | same | edited |
| actions | Dead session resumable until removed | same | edited |
| notes | Note kept until Remove; restart keeps every row and note | same | edited |

## Contradictions
None

## For the orchestrator
- [orchestrator] `cmd/musterd/onexit.go:29-31` still says a racing tick would "race a restart's Reconcile into sweeping a row it should have kept". It is product code, outside my boundary; reword it (the row is kept either way, the race only changes `endedAt`).
- [orchestrator] `connection` and `focus` are Touches features; no delta claim changed their behaviour, so no promotion to Features needed.
- [orchestrator] `docs/adr/lifecycle-reconcile-converges-with-the-socket` is still cited in protocol.md beside the new ADR (it still governs ownership classification).

## Checks
`make gen-kb && make check-kb`: `kb: 657 records, 29 features, 0 problem(s)` / `all checks pass`.
Word counts: lifecycle 1145, actions 711, notes 838 (check-kb passes, so within configured budgets).
