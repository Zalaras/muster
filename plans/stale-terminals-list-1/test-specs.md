# E2E Test Specs: stale-terminals-list-1

**Plan**: stale-terminals-list-1
**Mode**: validate (attempt 1, after authoring red-first)
**Pack**: kb: pack 21516 words (budget 30000)
**Verdict**: pass
**Tests created**: 0 new (2 amended in place)
**Live run**: 30/30 passing (scoped set); soaks green

## Tests

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/terminals.spec.ts | ending one terminal leaves a sibling attached in another window and the Claude pane untouched (INV-1, D3) | DELETE shells/{n} answers 200 `{rev}` (protocol.md sessions.shell § Revisions) | status 200, `rev` integer >= 1; rest of the test unchanged | ran-red-at-authoring: `Expected: 200 Received: 204` at terminals.spec.ts:725 |
| web/e2e/terminals.spec.ts | the terminal endpoints answer as the contract says for spawn, rename, close and an unauthenticated caller (REQ-4, REQ-12, REQ-19, D2, D4) | same | status 200, `rev` integer >= 1 on the first DELETE; the 404 branches unchanged | ran-red-at-authoring: `Expected: 200 Received: 204` at terminals.spec.ts:1220 |

Run: `npm run e2e -- e2e/terminals.spec.ts -g "INV-1, D3|the terminal endpoints answer as the contract says"` after `make web-build build`: `2 failed, 1 passed`. The one pass is an unamended test (line 754) that the `-g` also matched.

## Deleted Tests

None.

## Fixture Changes

No changes needed.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| DELETE answers 200 with `rev` | the two tests above |

## Handoff

None. The session-removal 204 (about line 888) is a different route and is untouched.

## Validate (attempt 1) — bringing four gate reds up to the contract

Context: the orchestrator's scoped gate (22-e2e.log, 26-E1.log) was red on four tests. Three were exact-equality pins that the committed contract (docs/protocol.md sessions.shell § Revisions, ws.snapshot `terminalsRev`) changes; the plan's "Existing tests this breaks" list missed them. The fourth was a timeout.

### Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | web/e2e/terminals.spec.ts "New terminal from the panel spawns shell 2 …" (:111) | `toEqual({target,n,name})` received also `rev: 3` | Pin predated the contract's `rev` on every terminal reply | `rev` split off, the rest still `toEqual({ target, n: 2, name: "shell 2" })`; `replyRev(rev, 1)` asserts integer >= 1 | REQ-1/REQ-12 reply body, unchanged field-for-field, plus the contract's `rev` |
| 2 | web/e2e/terminals.spec.ts "the terminal endpoints answer as the contract says …" (:1160) | `POST …/shell` replies compared to `{target,n,created}`; received `rev: 1` | Same | Every reply (shell created / not created, shells x2, rename x2, reuse after close) splits `rev` off and keeps the exact `toEqual` on the rest. Rev checks: integer >= 1 each; a no-change `POST /shell` answers a rev >= the call before (not `===`: a poll broadcast between the two legitimately raises it); every change (spawn, rename to a new name, spawn after DELETE) answers strictly greater than the reply before; DELETE body keys are exactly `["rev"]` | REQ-4, REQ-12, REQ-19, D2, D4 and the contract's monotonic rev |
| 3 | web/e2e/shell.spec.ts "GET /api/state returns exactly the empty-daemon snapshot object …" (:12) | exact snapshot received also `"terminalsRev": 0` | Pin predated `snapshot.terminalsRev` | Added `terminalsRev: 0` to the exact expected object (a fresh daemon has broadcast no list) | Every other key unchanged, still `toEqual`; the new key pinned at its exact value |

Helper edits (additive, my own files): `helpers/terminals.ts` gains `replyRev(body, floor)` and `newTerminal`'s return type gains `rev`; `helpers/shell.ts` `createShellViaApi`'s return type gains `rev` (type only). No other helper compares a reply exactly (`rg "toEqual\(\{ ?(target|n)" web/e2e` hits only the lines above).

No assertion was deleted, skipped, or weakened.

### 4. masthead-update-dot.spec.ts:33 — measured, not edited

Run alone after `make web-build build`, load average 9-15 (it was ~76 in the gate run): `1 passed (14.2s)`, the test itself 12.2 s; in the scoped set 14.9 s. The banner's `toBeHidden()` was reached well inside the 60 s test timeout. This branch does not touch the update feature (`rg` of the diff: no `internal/update*` or `update` web module changes). Consistent with the orchestrator's load hypothesis; not edited.

### Scoped gate, foreground

`make e2e SPECS='e2e/terminals.spec.ts e2e/shell.spec.ts e2e/masthead-update-dot.spec.ts'`: `30 passed (33.4s)`.
Soaks: `make e2e-soak SPEC=e2e/terminals.spec.ts N=10`: `280 passed (7.8m)`; `make e2e-soak SPEC=e2e/shell.spec.ts N=10`: `10 passed (7.5s)`.
`npx playwright test --list`: `Total: 719 tests in 63 files`; `npx biome check` on the four touched files clean.

## Handoff

None.
