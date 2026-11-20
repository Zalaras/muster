# Web Tests: terminal-ended-rule-1

**Plan**: terminal-ended-rule-1
**Verdict**: authored
**Pack**: kb: pack 12673 words (budget 30000)

## Summary

Red-first. Tests created: 3 | Passing: 0 | Failing: 3 (assertion failures). The other 11 in the file pass.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `web/src/features/surfacesrev.test.ts` | a rename reply first still shows the spawned terminal | rename reply rev 7 before spawn reply `{n:2, rev:6}` → shell 2 | red |
| `web/src/features/surfacesrev.test.ts` | a close reply first still shows the spawned terminal | same, with a close reply | red |
| `web/src/features/surfacesrev.test.ts` | a rename reply first still shows the terminal select('shell') made | same via `select('shell')` | red |

## Handoff Received

None. The header citation now reads `kb:adr/surfaces-terminal-ended-read-from-lists`.

## Notes

No new state helper exists yet, so `terminalsrev.test.ts` is untouched.

## Test Run Output

```
Expected { selected: 'shell', shell: 2 } / Received { selected: 'claude', shell: 1 }
Expected { selected: 'shell', shell: 1 } / Received { selected: 'claude', shell: null }
Tests  3 failed | 11 passed (14)
```
