# Web Tests: auto-update

**Plan**: auto-update
**Verdict**: pass

## Summary

Tests created: 1 new file (`web/src/render/update.test.ts`, 303 cases) + 3 modified files
(`web/src/protocol.test.ts` +16 tests, `web/src/ws.test.ts` +2 tests, `web/src/api.test.ts`
+23 tests) | Passing: 1424/1424 (full `npm test` run) | Failing: 0

Also fixed the three pre-existing-fixture breakages web-impl's handoff named (`ws.test.ts`'s
`snapshot`/`prefsMessage` literals and `protocol.test.ts`'s `validSnapshot`-derived literals,
all missing `prefs.updateCheck`/top-level `update` now that both are required on the parsed
type) — these were test-fixture updates, not implementation changes, squarely within scope.

## Tests

| File | Test Name (representative) | What It Tests | Status |
|------|-----------|---------------|--------|
| `protocol.test.ts` | `parsePrefs — updateCheck` (5 cases) | REQ-1: default-true, explicit true/false, rejects non-boolean/null | pass |
| `protocol.test.ts` | `parseSnapshot — update` (13 cases) | edge case 32 default-to-null on missing key, full UpdateInfo round-trip, each install kind, each apply phase, malformed-field rejection (whole snapshot, not just the field), additive-evolution tolerance | pass |
| `protocol.test.ts` | `parseMessage — update` (4 cases) | W6: decodes a bare `update` message, rejects missing/malformed `update`, ignores unknown top-level fields | pass |
| `ws.test.ts` | dispatch/full-lifecycle `update` routing (2 cases) | `onUpdate` fires with the bare `UpdateInfo`, not `onSnapshot`, both via `dispatch()` directly and via a fake-socket message frame | pass |
| `api.test.ts` | `applyUpdate` (11 cases) | `POST /api/update/apply`: `restart:false` default, `restart:true`, 202-in-flight tolerance (REQ-20), every documented error code (400/401/404/409×3), generic-error/non-JSON fallbacks | pass |
| `api.test.ts` | `fetchRestartImpact` (7 cases) | `GET /api/update/restart-impact`: empty/one/multiple shells, null title, malformed `sessionId`/`shells` rejection, 401 | pass |
| `api.test.ts` | network-error short-circuit | extended the existing rejected-`fetch` matrix to cover `applyUpdate`/`fetchRestartImpact` | pass |
| `render/update.test.ts` | `buildUpdateViewModel` — Running/Available/Toggle/Buttons-visible/Buttons-enabled/restartLabel/Status-line/Badge/busy (W5, ~55 focused cases) | every Text-rules row, including the `update === null` "no data yet" honesty state (renders `unknown`, no badge, no empty gauge) | pass |
| `render/update.test.ts` | `buildUpdateViewModel` full grid (224 cases) | W5's literal "each install kind x pref on/off x available null/set x installed null/set x each apply.phase" — no-throw plus badge/buttonsVisible/toggleChecked/toggleDisabled internal consistency across the whole cross-product | pass |
| `render/update.test.ts` | `renderUpdateSection`, `renderSettingsBadge`, `renderRestartImpact`, `initRestartConfirm` | DOM-application logic (text/disabled/hidden/aria-busy writes, badge dot show/hide, restart-impact copy singular/plural/untitled, confirm open/close/Confirm/Cancel wiring) against plain fakes (no jsdom, matching `render/dead.test.ts`/`render/dropguard.test.ts` precedent) | pass |

## Coverage decisions

- **`render/settings.ts`'s new wiring** (`onToggleUpdateCheck`/`onUpdate`/`onUpdateAndRestart`,
  `setChecked`'s `updateCheck` param) is **not** covered here. `render/settings.ts` has never
  had a Vitest file (checked: no `settings.test.ts` exists anywhere in the tree, before or
  after this plan) — its click/change-listener wiring is interaction, not logic, same category
  as `render/confirm.ts` (also untested at this layer). `plans/auto-update/test-specs.md`
  confirms this is Playwright's job: E1–E4's flows drive the toggle and both buttons through
  the real dialog, and E5/E6 assert the confirm body text end-to-end. Declining per the
  "declined coverage item cites the specific existing test" rule: e2e-specs' own
  `test-specs.md` rows for `web/e2e/update.spec.ts` (User Flows 1–4 in `plan.md`) are the
  source, not an assumption.
- **`buildUpdateViewModel`'s full cross-product** (W5's literal wording) is exercised as a
  224-case grid in addition to the column-by-column tests, rather than relying on the
  column tests alone to imply full coverage — the plan's Automated Checks note explicitly
  names W5 as "table-tested over every ... x every ...", so the literal grid is asserted, not
  just each rule in isolation.
- **`main.ts`'s dispatch wiring** (the `Update`/`Update and restart`/confirm-Restart click
  handlers that call `applyUpdate`/`fetchRestartImpact` and drive `renderUpdateSection`/
  `renderSettingsBadge`/`initRestartConfirm` from `WsClient` events) is also not unit-tested:
  `main.ts` has no existing `.test.ts` file in this codebase at all (it's the composition
  root — every other `main.ts`-adjacent behavior is Playwright-covered), and W10's "no
  optimistic local state" claim is a Reviewer-Verified item per the plan's own Automated
  Checks table, not a Vitest item.

## Test Run Output

```
$ npx tsc --noEmit
(no output — clean)

$ npm test
 RUN  v4.1.10 /Users/damian/Documents/code/Projects/muster/web
 Test Files  30 passed (30)
      Tests  1424 passed (1424)

$ npm run build
> tsc --noEmit && vite build
✓ 44 modules transformed.
../internal/webui/assets/index.html                  16.06 kB │ gzip:   3.90 kB
../internal/webui/assets/assets/index-B9UVH72K.css   30.63 kB │ gzip:   6.28 kB
../internal/webui/assets/assets/index-ClEamnqR.js   405.09 kB │ gzip: 105.38 kB │ map: 1,115.13 kB
✓ built in 647ms
```

No `any` in any new/modified test file (grepped `\bany\b` in the four touched files — only
prose hits: "any further", "any other version", "any hook", "any one session", "any
interaction").
