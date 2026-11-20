# Web Implementation: stale-terminals-list-1

**Plan**: stale-terminals-list-1
**Mode**: initial
**Pack**: kb: pack 30006 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/terminal/terminalsrev.ts` | created | Pure per-session seen-rev state: seenRev, raiseSeenRev, resetSeenRev, forgetSeenRev, isStaleList |
| `web/src/protocol/terminals.ts` | modified | `rev` on TerminalsMessage (required); exported `parseRev` |
| `web/src/protocol/messages.ts` | modified | optional `terminalsRev` on Snapshot, rejected if malformed |
| `web/src/ws.ts`, `web/src/wsapp.ts`, `web/src/app.ts` | modified | `rev` travels through onTerminals and the `terminals` app event |
| `web/src/api/sessions.ts` | modified | `rev` on createShell/createTerminal results; rename and close decode `200 {rev}` |
| `web/src/features/surfaces.ts` | modified | owns revState; stale `terminals` ignored; replies and snapshot raise/reset it; ended spawn replies not shown |

## Decisions

design: seen-rev state is a pure immutable module in `terminal/` beside `terminals.ts` and `shellactivity.ts` (same Map-in-state pattern); owner is `initSurfaces`' `revState`, touched by the terminals handler, the four replies, the snapshot handler and sessionRemoved. Nothing existing handled revisions (`rg -n 'rev' web/src/terminal` found none).
design: `Snapshot.terminalsRev` is optional in the type like `terminals`, an absent key reading as 0, so older fixtures still type-check; a malformed value rejects the snapshot.
design: a spawn reply is "ended" when its rev was already seen and the list lacks its n; the seen rev is raised before the newer-selection guard, so a dropped reply still raises it.
Selection of `select('shell')` with a non-empty list keeps the last-shown fallback (`shell ?? n`), unchanged.
No REQ left undone; no deviation.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` fail on sanctioned test files only: `web/src/features/surfaces.test.ts` (spawn mocks lack `rev`, rename/close mocks resolve `null`, `app.emit("terminals", ...)` calls need the `rev` argument).
**E2E smoke**: no spec authored
Vitest after change: 16 failed, 3363 passed; surfacesrev.test.ts 10/10 green. Failing, all expected: `web/src/api/sessions.test.ts` (bodies without rev, closeTerminal 204), `web/src/features/surfaces.test.ts`, `web/src/protocol/terminals.test.ts` (messages without rev). `ws.test.ts` and `wsapp.test.ts` still pass and type-check. `web/render/terminals.spec.ts:121` stub lacks `rev` in the POST shell reply (not run by me).

## Fix Attempt 1

**Failures addressed**: code Major 1 — `parseTerminalsMessage` accepted `rev: 0`.
**Changes made**: `web/src/protocol/terminals.ts` `parseTerminalsMessage` now returns null when `rev < 1`. `parseRev` is unchanged (floor 0), so the three reply decoders in `web/src/api/sessions.ts` and `snapshot.terminalsRev` in `messages.ts` still accept 0. Sweep: `rg parseRev web/src` finds five call sites; only the `terminals` message is a message `rev`, the others are replies or the snapshot.
**Verification**: `npx tsc --noEmit` exit 0, `npm run build` exit 0, lint clean. Vitest: 2 failed, 3402 passed.
**Decisions**: none new.

**Handoff**: tests turned red by this change (code Major 2, web-tests, not edited): `web/src/protocol/terminals.test.ts` "parseTerminalsMessage > decodes the empty list sent once the last terminal ends" and `web/src/features/surfacesrev.test.ts` "a snapshot without terminalsRev > resets every session's seen rev to 0" (both send a `terminals` message at `rev: 0`). `web/src/features/surfaces.test.ts` emits the app-level event directly, so it does not go red.
