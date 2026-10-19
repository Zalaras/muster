# E2E Test Specs: launch-dialog-fixes

**Plan**: launch-dialog-fixes
**Mode**: fix (attempt 1, review cycle 2)
**Pack**: kb: pack 14319 words (budget 30000)
**Verdict**: pass
**Tests created**: 5
**Live run**: launch-defaults.spec.ts 8/8 passing (fix attempt 1; soak 60/60 at 6 tests, N=10, validate); the two red-first tests' live runs are in the web-implementation Handoff (17 passed across launch-model-check + launch-defaults)

## Tests

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/launch-defaults.spec.ts | a launch made through the dialog refreshes what the next open restores, with no reload in between (REQ-2) | REQ-2 ("refreshed after every successful launch from the dialog") | Page loads knowing one recent (opus / acceptEdits / low); dialog launch (New tab) into a child dir with haiku / manual / max; after the launch's own GET /api/repos lands, every later GET /api/repos and /api/browse is held; reopened dialog shows haiku, manual, max checked while held and after release | ran-green-at-validate — `6 passed (3.6m)`; soak `60 passed (49.5s)` |
| web/e2e/launch-model-check.spec.ts | a late refusal of a model no longer selected leaves focus where it is (REQ-1) | REQ-1 | A refused, B submitted and held, selection back to A, Title clicked, B's refusal released: Title (same node) stays focused, A's mark stays, B is still marked when reselected | ran-red-at-authoring |
| web/e2e/launch-defaults.spec.ts | the dialog opens showing the first recent's remembered model, mode and effort before its own fetch returns (REQ-2) | REQ-2 | With the open's GET /api/repos and /api/browse held, haiku, manual and high are checked; they stay checked once released | ran-red-at-authoring (green after web-impl: web-implementation.md Handoff) |
| web/e2e/launch-defaults.spec.ts | a vanished first recent's held model, mode and effort return to the defaults once its directory fails to open (REQ-3, E3) | REQ-3 (`failed` branch) | Init fetch knows a haiku / manual / high recent; its directory is deleted; with the open's GET /api/browse held, haiku / manual / high are checked; after release and the browse-root fallback, sonnet / auto / effort default are checked | ran-green-at-fix — `8 passed (2.9m)` |
| web/e2e/launch-defaults.spec.ts | a vanished first recent resets only the fields the user did not touch while its directory was still opening (REQ-3, E3, E4) | REQ-3, edge case 4 (touched half) | Same setup; opus picked with the browse held; after release opus stays checked while mode returns to auto and effort to default | ran-green-at-fix — `8 passed (2.9m)` |

Red output (`npx playwright test launch-model-check.spec.ts launch-defaults.spec.ts -g 'late refusal|before its own fetch'`):

```
1) launch-defaults.spec.ts:192 › the dialog opens showing the first recent's remembered ... (REQ-2)
   expect(locator).toBeChecked() failed
   Locator:  getByRole('dialog', { name: 'New session' }).getByRole('radio', { name: 'haiku' })
   Expected: checked   Received: unchecked
   > 237 |     await expect(dialog.getByRole("radio", { name: "haiku" })).toBeChecked();

2) launch-model-check.spec.ts:537 › a late refusal of a model no longer selected leaves focus where it is (REQ-1)
   expect(locator).toBeFocused() failed
   Locator:  dialog.locator('[data-e2e-kept-focus="1"]')   (the tagged Title input)
   Expected: focused   Received: inactive
   > 602 |   await expect(dialog.locator('[data-e2e-kept-focus="1"]')).toBeFocused();
2 failed
```

## Deleted Tests

None

## Fixture Changes

No changes needed.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | a late refusal of a model no longer selected leaves focus where it is (REQ-1) |
| REQ-2 | the dialog opens showing the first recent's remembered model, mode and effort before its own fetch returns (REQ-2); a launch made through the dialog refreshes what the next open restores, with no reload in between (REQ-2) |
| REQ-3 | a vanished first recent's held model, mode and effort return to the defaults once its directory fails to open (REQ-3, E3); a vanished first recent resets only the fields the user did not touch while its directory was still opening (REQ-3, E3, E4); plus the existing deleted-recent (E12), model-race (E9) tests |

## Handoff

- Plan defect: the Proof says to "wait for its first GET /api/repos response" after the reload,
  but today the controller makes no repos fetch at page load (`fetchRepos` is called only from
  `initOpen`, `web/src/features/launch.ts:478`), so that wait would hang today. The test instead
  reloads and waits for `networkidle`, then holds every later GET /api/repos and /api/browse; it
  works before and after the init fetch exists. It asserts the open's own repos request is held
  (`heldRepos > 0`) so the check cannot pass on a fetch that never happened.
- Both specs use the per-test `daemon`/`startDaemon` fixtures as already used in their files.

## Notes

The REQ-1 test uses `settleFor(1_000)` after B's response: a correctly dropped refusal changes nothing visible.

## Added Test: post-launch refresh (validate)

The added test would fail without `refreshKnownRepos()` in `finishLaunch` (reasoned from `web/src/features/launch.ts`, no implementation edit): the page's init fetch leaves `knownRepos = [seed]` (opus / acceptEdits / low); the open's own `initOpen` fetch is held, and `knownRepos` is written only by `refreshKnownRepos` (init, `finishLaunch`) and `initOpen`. With the `finishLaunch` call removed nothing writes it while held, so the reopened dialog restores opus and the `haiku` assertion fails. The seed differing from the launched level (not merely an empty init list) is what makes the check discriminating; the first open also asserts `opus` is checked to prove the init fetch knew the seed. The launch's own GET /api/repos is awaited (`waitForResponse`) before holding, so the refresh itself is never held. Clock-tick wait separates the seeded launch from the dialog launch so recents ordering cannot tie.

No assertion was deleted, skipped, or weakened. No repairs. Soak and runs hit the gate lock several times (exit 75, busy); reruns were green.

## Fix Attempt 1 (review cycle 2)

Issue 1 `[e2e-specs]`: REQ-3's `failed` branch had no test that fails without the reset (`applyRestore(defaultRestore(touched))` in `initOpen`, `web/src/features/launch.ts:520`). E12 seeds through `launchSession` after `page.goto`, so at its open `knownRepos` is still the empty list from page load, `resetForm` already shows the defaults, and they stay on screen whether or not line 520 exists. E12 is left as it is.

Added two tests to `web/e2e/launch-defaults.spec.ts` (shared setup in the local `openOntoVanishedRecent`): seed a recent with haiku / default (manual) / high, reload and wait for `networkidle` so the init fetch knows it, delete its directory, hold only GET /api/browse, open the dialog and wait for the held navigate. Held values (haiku, manual, high) are asserted first, which also proves the init fetch knew the recent. Then:

- all untouched: release; the browse-root fallback lands; sonnet, auto and effort default are checked.
- touched variant: opus is checked while the browse is held; after release opus stays checked and auto / default are restored.

Why they fail without line 520 (reasoned from the code, no implementation edit): the held values are applied by `resetForm`'s `restoreFromKnownRepos`; on `failed` the only other thing `initOpen` does is `navigate(undefined)`, which touches the listing and not the radios. With line 520 removed haiku / manual / high would stay checked after the fallback, failing the `sonnet` / `auto` / `default` assertions (and `auto` / `default` in the touched variant).

Run (`npm run e2e -- e2e/launch-defaults.spec.ts` from `web/`, after `make web-build build`; gate lock was busy for several reruns, held by another plan's gates run): `8 passed (2.9m)`. Collection: `Total: 966 tests in 59 files`. Soak skipped per the orchestrator's instruction.

No assertion was deleted, skipped, or weakened. No repairs.
