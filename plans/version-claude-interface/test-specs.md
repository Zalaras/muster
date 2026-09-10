# E2E Test Specs: version-claude-interface

**Plan**: version-claude-interface
**Mode**: validate (attempt 1)
**Verdict**: pass
**Tests created**: 6
**Live run**: 6/6 passing (own spec); 287/287 passing (full suite sweep)

## Tests

| File | Test Name | Requirement | What It Verifies |
|------|-----------|-------------|------------------|
| web/e2e/claude-version.spec.ts | default stub answers below the verified floor: readout reads claude 2.0.0 with the update-remedy glyph (E1, Edge Case 9) | E1 | Default stub (`STUB_CLAUDE_VERSION`, no knob) classifies `below`; `#claude-version` starts `claude 2.0.0`; the `role=img` glyph is visible with the "please update Claude Code" name/title |
| web/e2e/claude-version.spec.ts | stub answering the verified ceiling: readout reads claude \<ceiling\> with no glyph in the readout (E2, Edge Case 9) | E2 | `stubClaudeVersion` set to `observedVersionRange().verified` classifies `verified`; readout text is exactly `claude <ceiling>`; no `img` role inside the readout |
| web/e2e/claude-version.spec.ts | stub answering one patch above the verified ceiling: the not-tested glyph is visible and its name does not mention updating (E3, Edge Case 9) | E3 | `stubClaudeVersion` = ceiling+1 patch classifies `above`; glyph visible with the shorter "not been tested" name/title, no "update" wording |
| web/e2e/claude-version.spec.ts | stub whose --version fails: the dashboard still serves and the readout reads exactly Claude installation unknown, no glyph (E4, Edge Case 1) | E4, INV-3 | `stubClaudeVersionFails` yields `status: unknown`; daemon still serves (`connection-status` reaches "connected"); readout text exactly `Claude installation unknown`; no glyph |
| web/e2e/claude-version.spec.ts | POST /api/issue/captures snapshot carries exactly the four claudeCode keys, status below, matching hello (E5) | E5, INV-1, INV-2 | Issue-capture snapshot's `claudeCode` key set is exactly `installed,floor,verified,status`; `status` is `below`, `installed` is the parsed leading version, `floor`/`verified` match `observedVersionRange()` |
| web/e2e/claude-version.spec.ts | the readout holds no button or link, and clicking the glyph leaves it visible and unchanged (E6) | E6, REQ-5 "no dismiss" | `#claude-version button, #claude-version a` matches nothing; clicking the glyph does not hide/remove/change it |

## Fixture Changes

`web/e2e/helpers/daemon.ts` (REQ-13 — this file is explicitly e2e-specs' under this
plan's Affected Files, unlike the gate-integrity files):

- `STUB_CLAUDE_SCRIPT`'s `--version` branch now reads two environment variables at run
  time instead of answering a value baked into the script's bytes:
  `MUSTER_E2E_STUB_VERSION_FAIL` (set to anything → exit 1, print nothing — a broken
  install) and `MUSTER_E2E_STUB_VERSION` (defaults to the existing `STUB_CLAUDE_VERSION`
  constant when unset). This keeps the shared, content-hash-keyed stub file
  (`ensureSharedStubClaude`) unchanged while letting per-run env vary the reply —
  required because the stub file is shared across every scratch daemon in the run.
- `ScratchDaemonOptions` gained `stubClaudeVersion?: string` and
  `stubClaudeVersionFails?: boolean`; threaded through the `ScratchDaemon` constructor
  and `start()` exactly like the existing `claudeThemePoll`/`usagePoll` knobs.
- `spawnAndWait()` builds an `env` object (`{ ...process.env, MUSTER_E2E_STUB_VERSION?,
  MUSTER_E2E_STUB_VERSION_FAIL? }`) only when one of the two knobs is set, else passes
  `env: undefined` (functionally identical to omitting the key — Node falls back to
  `process.env`), so every daemon that doesn't use the new knobs spawns with byte-for-byte
  the same environment as before this change.
- New exported `observedVersionRange(): Promise<{ floor: string; verified: string }>` —
  reads `internal/claudecode/observed_versions.txt` directly off the repo checkout
  (never through a running daemon, and never the embedded copy — mirrors the plan's
  Implementation Notes on why `tools/versions` also reads from disk), parses
  `<major.minor.patch> <date> <note>` rows (skipping `#` comments/blanks), and returns
  the semver min/max exactly as `Floor()`/`Verified()` will derive them in
  `internal/claudecode/version.go`. Used by the spec so a future `bump` moving the
  ceiling needs no edit here.
- Doc-comment wording that said "drift check" / "pinned" was updated to "version check" /
  "version classification" per REQ-13's "comments stop saying drift check/pin".

No other spec file changed, matching the plan's Fixture plan header.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-4 (hello.claudeCode shape) | all six (each reads/derives from it) |
| REQ-5 (masthead states) | E1, E2, E3, E4, E6 |
| REQ-13 (harness knobs) | all six (every test depends on the new knobs or `observedVersionRange()`) |
| Edge Case 1 (unknown: --version fails) | "stub whose --version fails…" (E4) |
| Edge Case 9 (stub knobs land below/verified/above/unknown) | E1, E2, E3, E4 |
| INV-1 (installed null iff unknown) | E5 (populated, non-null path); E4 covers the DOM rendering of the null/unknown case, not the wire field directly (that's D9/D13's job) |
| INV-2 (floor/verified always present) | E5 |
| INV-3 (no version outcome stops serving) | E4 |

## Repairs

Not applicable — authoring mode, no prior run to repair.

## Notes

- **Why these are collection-only.** `internal/claudecode/observed_versions.txt` does
  not exist yet (REQ-1, daemon-impl's job), and the daemon still ships the pre-plan
  pinned/drift wire shape. I ran E1 once by hand to confirm the test fails for the
  *right* reason — no such glyph exists yet — not a locator defect in my spec:
  ```
  Error: expect(locator).toBeVisible() failed
  Locator: locator('#claude-version').getByRole('img', { name: 'This Claude Code
    version has not been tested with Muster — please update Claude Code' })
  Error: element(s) not found
  ```
  This is expected per the authoring-mode contract ("your tests are expected to fail if
  executed") and I left it exactly as written rather than weakening it.
- **Regression-pin check for the harness edit.** `web/e2e/helpers/daemon.ts` is shared by
  every spec in the suite, so a change there is a harness-wide risk even though my new
  spec file is entirely new-behaviour. Per "Regression pins run live at authoring" I
  rebuilt (`make web-build build`) and ran the two files most exposed to the stub-script
  rewrite and the new `env` passthrough live against the current (pre-implementation)
  tree:
  - `web/e2e/shell.spec.ts` — 4/4 passed, including "shows the Claude Code version
    reported by hello" (the file's own `/claude\s+2\./i` regression pin, E7's named
    survivor).
  - `web/e2e/auth.spec.ts` — 7/7 passed (a plain sanity check that ordinary daemon
    startup/auth is unaffected by the `env` key now present on every `spawn()` call).
  Both green, confirming the shared-stub env-var rewrite and the conditional `env`
  object are backward compatible with every daemon that doesn't pass the new knobs.
- **Unmeasured shape flag:** none. Every field asserted (`installed`, `floor`,
  `verified`, `status`, the glyph's `role="img"`/`aria-label`/`title`) comes directly
  from the plan's own Protocol Contract and UI Specifications tables, not a wire capture
  — this plan introduces the shape rather than observing an existing one, so there is no
  `canary-fields.md` entry to trace it to; the daemon-tests/web-tests unit suites are the
  first line of defense on the exact wire bytes, and this file's job is the rendered DOM
  and the end-to-end wire round trip.
- Edge Case 16 (daemon restart after Claude Code auto-updates mid-session) is explicitly
  named "untested" by the plan itself (the harness cannot change the stub's `--version`
  reply between a daemon's start and its `restart()`) — no test here attempts it, matching
  the plan.

## Validate Attempt 1

Rebuilt (`make web-build build` from the project root — both tracks, daemon-impl and
web-impl, were already committed on this branch), then ran `npm run e2e -- e2e/claude-version.spec.ts`
live from `web/`. All 6 tests passed on the first run, no locator or fixture repair
needed — every assertion in the authoring-mode spec matched the real markup and wire
shapes exactly as built.

```
Running 6 tests using 4 workers
  ✓  default stub answers below the verified floor: readout reads claude 2.0.0 with the update-remedy glyph (E1, Edge Case 9) (1.6s)
  ✓  stub answering the verified ceiling: readout reads claude <ceiling> with no glyph in the readout (E2, Edge Case 9) (1.5s)
  ✓  stub answering one patch above the verified ceiling: the not-tested glyph is visible and its name does not mention updating (E3, Edge Case 9) (1.5s)
  ✓  stub whose --version fails: the dashboard still serves and the readout reads exactly Claude installation unknown, no glyph (E4, Edge Case 1) (1.5s)
  ✓  POST /api/issue/captures snapshot carries exactly the four claudeCode keys, status below, matching hello (E5) (434ms)
  ✓  the readout holds no button or link, and clicking the glyph leaves it visible and unchanged (E6) (416ms)

6 passed (3.0s)
```

Re-ran `npx playwright test --list` from `web/` after this file's run (no edits made, so
this is a no-op check, but confirms collection is still clean suite-wide): 287 tests in
26 files, no error.

**Full-suite sweep.** Grepped every other spec file for `pinned`/`drift`/`claudeCode`/
`protocolVersion` (the fields this plan's protocol delta touches) — no other file asserts
the old `hello.claudeCode.{pinned,drift}` shape or a hardcoded `protocolVersion: 1`, and
`shell.spec.ts`'s pre-existing `/claude\s+2\./i` regression pin (E7's named survivor)
still matches the default stub's `claude 2.0.0-e2e-stub` reply unchanged. Then ran the
full suite from the project root:

```
make e2e
...
287 passed (1.2m)
```

Every test passed, including the full pre-existing suite (rail-order, terminal, views,
theme, usage-model, launch, sessions, subagent-status, tiles-launch, shortcuts,
type-scale) — none of it needed updating for this plan's protocol 2 delta.

### Repairs

None. No test needed a locator, regex, wait, or fixture-value change. No assertion was
deleted, skipped, or weakened.

### Verdict

`pass` — the spec file and the full suite both ran green with zero repairs.
