# Doc Reconcile: shell-pane-fixes

**Verdict**: reconciled
**Pack**: kb: pack 6461 words (budget 30000)
**Features derived**: surfaces (plan header: surfaces)

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| surfaces | Shell busy spinner stands still under prefers-reduced-motion: reduce; busy shape and done tick still show | `web/src/style.css` `@media (prefers-reduced-motion: reduce) { .shellact[data-act="busy"] { animation: none } }`; shape rules and `done` untouched | added |

## Contradictions
None

## For the orchestrator
None

## Checks
make gen-kb && make check-kb: 610 records, 28 features, 0 problem(s); all checks pass.
surfaces/spec.md: 773 words (budget 800).
