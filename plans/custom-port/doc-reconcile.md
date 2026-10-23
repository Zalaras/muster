# Doc Reconcile: custom-port

**Verdict**: reconciled
**Pack**: kb: pack 11963 words (budget 30000)
**Features derived**: connection, update (e2e `web/e2e/update.spec.ts` only) (plan header: Features connection; Touches update)

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| connection | Binds 127.0.0.1 on `-port`, else saved `<data-dir>/port`, else 8765 | `cmd/musterd/port.go:resolvePort`, `savedPortPath`, `defaultPort`; `main.go` listen at serving setup | edited |
| connection | On a terminal, offers to save a differing flag-given port; `-port default` clears it | `port.go:maybeOfferSavePort` (tty gate), `resolvePort` (offerSave), `savePort` (removes file at default) | edited |
| connection | "binds on one port (`-addr`)" | `-addr` flag gone; `main.go` registers `-port` only | deleted |

## Contradictions
None

## For the orchestrator
- The update feature's only change is an e2e file (`web/e2e/update.spec.ts`); no claim touched update behaviour, so no promotion to `**Features**` is needed.
- The connection spec was already over the 800-word budget (821 by `wc -w`); it is now 837 by `wc -w`, because I traded the delta's required replacement against trims and could only cut to there. `check-kb` passes (it counts differently), but a later change there needs a feature-split decision.

## Checks
`make gen-kb && make check-kb`: kb: all generated files fresh; 643 records, 29 features, 0 problem(s); all checks pass.
Word count: docs/features/connection/spec.md 837 (was 821).
