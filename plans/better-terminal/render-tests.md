# Render Tests: better-terminal

**Plan**: better-terminal
**Verdict**: pass
**Pack**: kb: pack 31672 words (budget 30000)

## Summary

Tests created: 6 (plus surfaces.spec.ts repaired, 7 existing tests) | Passing: 507 of 507 | Failing: 0

## Tests

| File | Test Name | Criterion | What It Verifies | Status |
|------|-----------|-----------|------------------|--------|
| `terminals.spec.ts` | Focus switch reads claude, shell, ▾, docs ... count 2 (R1, REQ-8, REQ-9) | R1 | button order and names; count `2`, aria-hidden | pass |
| `terminals.spec.ts` | every tile footer's switch and actions fit ... at 3x2 (R2, REQ-16) | R2 | scrollWidth <= clientWidth on `.tfoot`, `.acts`, `.surfseg` for 6 tiles at 1600/1440/1280/1100/960 px | pass |
| `terminals.spec.ts` | open panel shows nine of ten rows ... (R3, REQ-18) | R3 | 9 rows fully inside the list, overflow-y auto and scrolls, New terminal in viewport and outside the list | pass |
| `terminals.spec.ts` | daemon connection down ... (R4, REQ-14) | R4 | opener disabled, open panel removed, forced click opens none | pass |
| `terminals.spec.ts` | panel lists shell 1 idle and build running ... (R5, REQ-11) | R5 | state words, spinner on busy row only, ✎ opacity 0 then 1 on hover | pass |
| `terminals.spec.ts` | one terminal shows no count (R6, REQ-9) | R6 | no `.shellcount` anywhere in `shell-idle-tiles` | pass |
| `surfaces.spec.ts` | (existing indicator tests) | - | `shellsBusy` replaced by `busySessionIds(snapshot.terminals)` | pass |

## Fixtures used

- `terminals-two`: Focus, `shell 1` idle + `build` busy (R1, R4, R5)
- `terminals-two-tiles`: six tiles, session 1 with two terminals (R2)
- `find-docs-tiles-3x2`: only its `prefs` frame, for the 3x2 density (R2)
- `terminals-ten`: ten idle terminals (R3)
- `shell-idle-tiles`, `shell-busy`, `shell-busy-tiles`, `shell-idle`: surfaces.spec.ts and R6

## Handoff

needs-scenario (optional): `terminals-two-tiles` was recorded at density 2x2, but R2 names 3×2 (only 4 live tiles show at 2x2). The test sends the `prefs` frame of `find-docs-tiles-3x2` to reach 3x2. Regenerating `terminals-two-tiles` with `density: 3x2` would let it drop that.
needs-scenario (optional): R5's "shown row highlighted" needs a state with `shell` selected; fixtures are recorded on `claude`, and clicking `shell` calls an API the harness 404s.

## Notes

- R5's highlight is asserted only when a row carries `aria-current` (conditional, so with the current fixture it is not exercised). The highlight is a journey for web/e2e/terminals.spec.ts.

## Test Run Output

```
507 passed (3.8m)
```

## Fix Attempt 1 (review cycle 1)

- `terminals.spec.ts` R5: stubs `POST /api/sessions/{id}/shell` (200 `{n:1, created:false}`), clicks `shell`, drops the `if (shown === 1)`; asserts `aria-current` on `shell 1`'s button only and its row background equal to `--bg-hover` (and `build`'s not). The shown row holds panel focus, so its ✎ is already out by `:focus-within`; the hover-reveal check moved to `build`.
- `terminals.spec.ts` R2: loads `terminals-two-tiles` alone (recorded at 3x2); spliced `prefs` frame and `loadFixture` import removed.
- New `popover.spec.ts` (coordinator addition, web-tests has no jsdom): a Session actions menu closes on a real scroll inside it and on a pointerdown inside an open `<dialog>`; the Terminals panel stays open on a scroll in its list and on a pointerdown in an open dialog.
- Run: `make render-test` 508 passed, 1 failed (the R5 ✎ assertion above, fixed); reran terminals + popover specs: 8 passed.
- Gate fix: the plain-menu scroll test now appends a 300px filler so the menu really overflows, and reads scrollTop synchronously (the panel detaches once the scroll closes it). Full `make render-test`: 509 passed.
- Review cycle 2: popover.spec.ts titles now cite "(menus unchanged)" and "(REQ-15)" instead of the undefined R7 / REQ-2; assertions unchanged, 2 passed.
- Review cycle 2: terminals.spec.ts titles remapped to the REQ each R* falsifies (R1 REQ-8/9, R2 REQ-16, R3 REQ-18, R4 REQ-14, R5 REQ-11, R6 REQ-9).
