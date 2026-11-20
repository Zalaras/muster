# Doc Reconcile: stale-terminals-list-1

**Verdict**: reconciled
**Pack**: kb: pack 14339 words (budget 30000)
**Features derived**: surfaces, connection (plan header: surfaces, connection)

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| surfaces | A window ignores a terminals list older than a spawn, close or rename reply it has already acted on | `web/src/terminal/terminalsrev.ts:isStaleList`; `web/src/features/surfaces.ts` (observeSpawnReply, observeReply on rename/close, terminals handler) | added |
| connection | nothing to promote; protocol already carries `terminalsRev` | `docs/protocol.md` untouched | none |

## Contradictions
None

## For the orchestrator
None

## Checks
make gen-kb && make check-kb: 711 records, 29 features, 0 problem(s); all checks pass.
surfaces spec: 957 words.
