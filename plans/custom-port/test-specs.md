# E2E Test Specs: custom-port

**Plan**: custom-port
**Mode**: authoring (harness-only)
**Pack**: kb: pack 14213 words (budget 30000)
**Verdict**: harness-only
**Tests created**: 0
**Live run**: not run (authoring; the daemon does not accept `-port` yet)

## Tests

No new spec. The harness edit now exercises every existing spec (all 59 files start daemons through `helpers/fixtures`, which reaches `buildArgs`):

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/*.spec.ts (all 59 files, 644 tests) | every existing test | REQ-1 (harness) | Scratch daemon starts with `-port <n>` and the suite still reaches it at `daemon.dashboardUrl` | collection-only |
| web/e2e/update.spec.ts | INV-7 restart test (comment wording only) | REQ-8 | Non-default `-port` survives the update re-exec | collection-only |

## Deleted Tests

None

## Fixture Changes

- `web/e2e/helpers/daemon.ts` `buildArgs()`: `"-addr", "127.0.0.1:<port>"` replaced by `"-port", String(this.port)`. The port is still allocated by the harness; no behaviour change.
- `web/e2e/update.spec.ts:671`: comment wording `-addr` to `-port`.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| E2E Scope harness-only | none authored; whole suite exercises the argv change |

## E2E Implementation Bugs

None

## Handoff

- The edit to `web/e2e/helpers/daemon.ts` fell to e2e-specs (the plan lists it under web-impl); it is in `helpers/`, not in the gate-integrity set (`fixtures.ts`, `gatelock.ts`, `playwright.config.ts`, `e2e-lint.sh`), so within my remit. web-impl need not repeat it.
- The suite will fail at daemon start until daemon-impl lands `-port`; expected.

## Test Run Output

```
npx playwright test --list  ->  Total: 644 tests in 59 files
web/scripts/e2e-lint.sh     ->  e2e-lint: clean
rg -- '-addr' web/e2e web/scripts -> no matches
```

## Notes

Collection only, per the orchestrator's instruction.
