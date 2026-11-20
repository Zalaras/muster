# Web Tests: stale-terminals-list-1

**Plan**: stale-terminals-list-1
**Verdict**: pass
**Pack**: kb: pack 12545 words (budget 30000)

## Summary

Tests created: 31 new or updated rows | Passing: 3404 (whole suite) | Failing: 0

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `web/src/terminal/terminalsrev.test.ts` | 5 tests (base, raise, stale boundary, reset, forget) | pure seen-rev module | pass |
| `web/src/protocol/terminals.test.ts` | rev missing/null/string/negative/fractional rows; snapshot terminalsRev absent/valid/malformed | REQ-9 parser rows | pass |
| `web/src/api/sessions.test.ts` | createShell/createTerminal/rename/close with rev; missing/invalid rev falls back to unknown_error | REQ-9 reply decode, close 200 {rev} | pass |
| `web/src/features/surfaces.test.ts` | existing tests, contract updated | rev on mocks and emits | pass |
| `web/src/features/surfacesrev.test.ts` | a snapshot without terminalsRev resets seen rev to 0 | absent key reads as 0 | pass |

## Handoff Received

- `surfaces.test.ts`: spawn mocks gain `rev: 1`, rename/close mocks resolve `{rev: 1}`, `app.emit("terminals", id, 0, list)`.
- `sessions.test.ts`: reply bodies carry `rev`; closeTerminal decodes `200 {rev}` (was 204/null); the existing malformed-body rows got `rev` so they still fail for their own reason.
- `terminals.test.ts`: messages carry `rev`; malformed rows got `rev: 1` for the same reason.

## Notes

sessionRemoved forgetting the seen rev: the module's `forgetSeenRev` is unit-tested in `terminalsrev.test.ts` ("forget returns a session to the base ..."); no wire-level test, since a removed session's terminals messages are ignored by the existing `app.store` check, so the effect is not observable. `web/render/terminals.spec.ts` is render-tests' file.

## Test Run Output

```
tsc --noEmit: clean
make web-test: Tests  3404 passed (3404)
make web-lint: Checked 457 files, No fixes applied.
npm run build: ok
```

## Fix Attempt 1 (review cycle 1)

Review Major 2 (rev 0 pinned valid). Changes:

- `web/src/protocol/terminals.test.ts`: the empty-list decode row now uses `rev: 1`; a `rev zero` row joins the rejection table.
- `web/src/features/surfacesrev.test.ts`: "a snapshot without terminalsRev resets every session's seen rev to 0" now sends its post-snapshot message at `rev: 1` (below the earlier 20, so the reset is the only reason it applies).

```
tsc --noEmit: clean
make web-test: Tests  3405 passed (3405)
make web-lint: Checked 457 files in 478ms. No fixes applied.
```
