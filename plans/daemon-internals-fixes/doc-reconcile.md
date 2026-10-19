# Doc Reconcile: daemon-internals-fixes

**Verdict**: reconciled
**Pack**: kb: pack 11115 words (budget 30000)
**Features derived**: ingest, update, launch (plan header: ingest, update, launch)

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| ingest | Body over 20 MiB answered 200, dropped with warn naming kind and limit, never the body | `internal/server/ingest.go:maxIngestBodyBytes`, `handleIngest` (MaxBytesReader, Warn kind+limitBytes, WriteHeader 200) | edited spec.md and protocol.md |
| update | Fixed temp name gone; no doc names it | no doc mentions it; spec sentence still true | no edit |

## Contradictions
None

## For the orchestrator
None

## Checks
`make gen-kb && make check-kb`: 610 records, 28 features, 0 problem(s), all checks pass. ingest/spec.md is 986 words by `wc -w` (frontmatter and fences included); check-kb budget passes.
