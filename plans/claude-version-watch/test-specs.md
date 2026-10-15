# E2E Test Specs: claude-version-watch

**Plan**: claude-version-watch
**Mode**: authoring (red-first)
**Pack**: kb: pack 12424 words (budget 30000)
**Verdict**: authored
**Tests created**: 1
**Live run**: 0/1 passing (red as the plan's Proof requires)

## Tests

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/claude-version.spec.ts | a stub whose --version takes 7 s: the daemon serves within 3 s and the open dashboard's readout flips to the version with no reload (claude-version-watch REQ-1, REQ-2) | REQ-1, REQ-2 | `/healthz` answers < 3 s from spawn although `--version` takes 7 s; the open page reads "Claude installation unknown", then `claude 2.0.0` with no reload | ran-red-at-authoring |

## Deleted Tests

None

## Fixture Changes

- `web/e2e/helpers/daemon.ts` (additive): `stubClaudeVersionDelaySeconds` option, passed as `MUSTER_E2E_STUB_VERSION_DELAY_SECONDS`; the shared stub's `--version` branch sleeps that long before answering. Same env-var mechanism as `stubClaudeVersion`; the stub file's content hash changes, so a new shared file is written once.
- `ScratchDaemon.startupMs` (additive): milliseconds from spawn to the first `/healthz` answer, set in `spawnAndWait`. The 3 s assertion reads this, so it measures the daemon becoming reachable and excludes harness setup (port, data dir, stub file, tokens).
- No wire payloads synthesized.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | the 7 s stub test (startupMs < 3 s; readout `unknown` until the check finishes) |
| REQ-2 | the 7 s stub test (readout flips to the version, same page, no reload) |
| REQ-3, REQ-4 | not E2E; plan's Proof assigns them to daemon-tests unit tests |

## Red output (today's tree, `make web-build build` first)

```
Error: expect(received).toBeLessThan(expected)
Expected: < 3000
Received:   7116
> 185 |   expect(daemon.startupMs).toBeLessThan(3_000);
```

Three runs gave 8308 (first, stub file creation), 7116, 7103 ms: today's startup blocks on the version check
(5 s bound, then the orphaned `sleep` holds the pipe until the 7 s elapse). `startDaemon`'s 10 s healthz wait is not
exceeded, so the failure is the assertion, not a harness timeout.

To check the second leg is also red and its locators valid, I temporarily removed the startup assertion (restored
afterwards, `git diff` shows only the intended edits): the test then failed at the readout step with
`Expected pattern: /^claude 2\.0\.0(\s|$)/` / `Received string: "Claude installation unknown"`.

## Handoff

None. Gate: `npx playwright test --list` Total 848 tests in 56 files, `e2e-lint: clean`.

## Notes

On the fixed tree the stub's 7 s sleep lands inside the 30 s bound, so the readout flips at ~7 s, inside the 15 s expect timeout.

## Fix Attempt 3 (review cycle 3: REQ-5)

Added `a stub whose --version takes 7 s: the Settings button holds its x while the readout flips from Claude installation unknown to the version, no reload (claude-version-watch REQ-5)` beside the REQ-1/REQ-2 test in `web/e2e/claude-version.spec.ts`, using the same `stubClaudeVersionDelaySeconds: 7` knob. It waits for the readout to read exactly "Claude installation unknown" (past the shorter pre-hello placeholder), records `#settings-button`'s bounding box x, waits for the flip to `claude <version>` with no reload, and asserts `after.x` `toBeCloseTo(before.x, 2)` (difference < 0.005 px).

**Proven red without the rule.** `.claude-version { display; min-width; text-align }` emptied locally in `web/src/style.css`, `make web-build build`, run:

```
Error: expect(received).toBeCloseTo(expected, precision)
Expected: 955.859375
Received: 1048.125
Expected precision:    2
Received difference:   92.265625
```

CSS restored with `git checkout web/src/style.css` (never committed), rebuilt. Green with the rule: `1 passed`.

Final run, `npx playwright test e2e/claude-version.spec.ts e2e/masthead-layout.spec.ts`: `11 passed (11.9s)`.

| File | Test Name | Requirement | Live run |
|------|-----------|-------------|----------|
| web/e2e/claude-version.spec.ts | a stub whose --version takes 7 s: the Settings button holds its x ... (claude-version-watch REQ-5) | REQ-5 | 11 passed (11.9s), red without the CSS rule |

No assertion was deleted, skipped, or weakened. No full-suite sweep or soak was run this attempt (cycle-3 prompt scoped the run to the two spec files).

## Fix Attempt 4 (review cycle 4: readout-reserved-width decision B)

Verdict stays `pass` for the files below; no implementation edited. Sanctioned by the decision and web-impl Fix Attempt 4 (unknown now reads "claude unknown" with a title hint; `.claude-version` reserves `calc(17ch + 4px)`).

**Changes** (`web/e2e/claude-version.spec.ts`, `web/e2e/masthead-layout.spec.ts`):
- `waitForHello` now waits for `#connection-status` to read "connected". `features/connection.ts`'s `connected()` flips the status and renders the hello's `claudeCode` in one synchronous call, so "connected" means the readout shows the hello's state; the text can no longer tell hello from pre-hello (same "claude unknown"). New `UNKNOWN_HINT` constant carries the hover text.
- E4 (retitled: "reads exactly claude unknown with the check-failed hover text"): `toHaveText("claude unknown")` + `toHaveAttribute("title", UNKNOWN_HINT)` (was "Claude installation unknown"). Edge Case 1.
- REQ-1/REQ-2 test: waits for hello, then asserts "claude unknown" + hint title, then the flip. Title unchanged.
- REQ-5 test (retitled: flips from claude unknown to the version and warning glyph): hello-gated unknown reading; hint title while unknown; after the flip the glyph is visible, `#claude-version` title is `""`; Settings x `toBeCloseTo` across unknown and version+glyph (kept); new: the readout's own width equal across the flip.
- masthead-layout E7 loop gains width 1280 (every gauge known, other-day resets), and every width now asserts `#connection-status` right edge <= `document.documentElement.clientWidth` (and > 0), placed before the scrollWidth checks.

**Red against the cycle-3 CSS** (`min-width: calc(27ch + 1px)` temporarily in `web/src/style.css`, `make web-build`, restored with `git checkout`, never committed):

```
✘ e2e/masthead-layout.spec.ts:76:3 › at 1280px with every gauge known ... (E7, REQ-11, issue #52)
    Error: #connection-status should sit fully inside the 1280px viewport
    Expected: <= 1280
    Received:    1327.890625
  1 failed   (the other 11 passed: the text/hint assertions do not depend on the CSS, and 27ch+1px also holds Settings x still, by design)
```

(Before the viewport assertion was moved first, the existing check failed: `masthead scrollWidth ... Expected: <= 1281, Received: 1328`.) With the reservation removed (`min-width: 0`) the REQ-5 test is red on Settings x: `Expected: 1052.125 Received: 1048.125, difference 4`.

**Final run** (`make web-build build` first; `npx playwright test e2e/claude-version.spec.ts e2e/masthead-layout.spec.ts`): `12 passed (10.8s)`. `npx playwright test --list`: 850 tests, no error. `biome check` on both files clean. No full-suite sweep or soak this attempt (prompt scoped the run to these two files).

| File | Test | Requirement | Live run |
|------|------|-------------|----------|
| web/e2e/claude-version.spec.ts | E4 stub --version fails ... claude unknown with the check-failed hover text | Edge Case 1, REQ-5 | 12 passed (10.8s) |
| web/e2e/claude-version.spec.ts | REQ-1/REQ-2 flip test | REQ-1, REQ-2 | 12 passed (10.8s) |
| web/e2e/claude-version.spec.ts | REQ-5 Settings x flips from claude unknown to the version and warning glyph | REQ-5 | 12 passed (10.8s) |
| web/e2e/masthead-layout.spec.ts | at 1280px with every gauge known ... (E7) | REQ-5 (overflow) | 12 passed (10.8s), red at 27ch+1px |

No assertion was deleted, skipped, or weakened.
