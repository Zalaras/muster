# Doc delta — plan `daemon-internals-fixes`

Seeded by the /fix session from `plan.md` § Doc Delta on 2026-10-19, then checked against the
implementation log and the approved cycle-2 review. `doc-reconcile` promotes what is true of the
code; `plan.md` stays as approved.

## From the plan

**ingest** — becomes true:
- A hook or status post whose body exceeds 20 MiB is answered `200` with an empty body and dropped
  with a warn log line naming its kind and the limit — never the body — like malformed JSON.
  Lands in two places: `docs/features/ingest/spec.md`'s handler paragraph (the sentence "Malformed
  JSON and bodies without a `session_id` are dropped with a log line and still answered `200`") and
  `docs/protocol.md` `kb:anchor/ingest`'s bullet "Malformed JSON is still `200` (logged, dropped)".

**ingest** — stops being true: nothing.

## Already handled (no reconcile needed)

- **daemon-components diagram** — updated in `docs(daemon-internals-fixes): daemon-components
  gains internal/atomicfile`; review cycle 1 checked it against `go list`.
- **update** — the impl log's `doc-delta:` line (the fixed `.musterd-<tag>.tmp` name is gone): no
  doc names that temp file, and `docs/features/update/spec.md`'s "extracts the binary beside the
  running one and renames it over the resolved path" is still true (review cycle 1, note 1). No edit.

## Reconcile notes

- Verified by `TestHandleIngest_OversizedBodyReturns200AndPersistsNothing` (hook and status),
  `TestHandleIngest_BodyAtLimitPersists` and `TestHandleIngest_OversizedBodyLogsKindAndLimitButNoPayload`
  (`internal/server/ingest_test.go`); the limit is `maxIngestBodyBytes` in `internal/server/ingest.go`.
- Cite the measurement only if the sentence needs a reason: the largest real payload seen was
  703,253 bytes over 39,415 events.
