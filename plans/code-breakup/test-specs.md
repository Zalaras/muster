# E2E Test Specs: Code Breakup

**Plan**: code-breakup
**Mode**: validate (attempt 1)
**Verdict**: pass
**Tests created**: 0 (pure file split — no new test bodies; see plan.md's UI Specifications →
E2E split table)
**Live run**: 40/40 passing at authoring; 40/40 passing at validate against the real daemon/web/tiles-launch/rail-cards/tiles/views implementation; 302/302 passing full-suite sweep (see Validate Attempt 1 below)

## Tests

This plan is a pure refactor with no new E2E coverage. Per plan.md's "UI Specifications → E2E
split" table, 40 pre-existing tests were moved verbatim (title, body, helper imports) out of
`web/e2e/actions.spec.ts` (23 tests) and `web/e2e/views.spec.ts` (17 tests) into two new files,
`web/e2e/tiles.spec.ts` and `web/e2e/rail-cards.spec.ts`, with the two source files trimmed to
what the table says they keep.

| File | Tests | Fixture | Source |
|------|-------|---------|--------|
| web/e2e/actions.spec.ts | 13 (kept) | mixed (`sharedDaemon()`/`daemon`, per test, unchanged) | unchanged |
| web/e2e/rail-cards.spec.ts | 5 (new file) | `fileDaemon()` | moved from actions.spec.ts, unchanged |
| web/e2e/tiles.spec.ts | 17 (new file) | `daemon` | 5 moved from actions.spec.ts (already on `daemon`, no plumbing change) + 12 moved from views.spec.ts (already on `daemon`) |
| web/e2e/views.spec.ts | 5 (kept) | `daemon` | unchanged |

No test's title, body, or assertions changed. No test's fixture needed conversion: every test
moving into `tiles.spec.ts` from `actions.spec.ts` already destructured the `daemon` fixture
(not `sharedDaemon()`), so the "fixture plumbing" case the plan anticipated for that direction
did not actually arise in this codebase — verified per-test against the original file (see
Notes). File-level header comments were rewritten in all four files to describe only what each
file now contains and why it uses its fixture, with pointers to the sibling file(s) holding the
rest of each plan's original coverage; no test-level comment was altered, only whether it
travelled with its test.

## Coverage

Requirement coverage is unchanged from before this plan — this split moves existing tests, it
does not add or remove requirement coverage. The plan's own requirements (REQ-1 through REQ-14)
are process/structure requirements for the daemon-impl and web-impl agents; code-breakup's own
E2E-facing acceptance is REQ-9 (E3: total `test(` count stays 299) and REQ-9 (E4: both new files
exist), both verified below.

| Requirement | Verification |
|-------------|---------------|
| E3 (`test(` count stays 299 across `web/e2e/*.spec.ts`) | `grep -rE "^\s*test\(" e2e/*.spec.ts \| wc -l` → 299, before and after this split (unchanged; per-file split is a zero-sum move: 23+17=40 became 13+5+17+5=40) |
| E4 (both new files exist) | `web/e2e/tiles.spec.ts` and `web/e2e/rail-cards.spec.ts` created |
| No test deleted, weakened, skipped, or retitled beyond its file move | Every moved test's title/body diffed byte-for-byte against the pre-split file via the extraction script; see Notes |

## Fixture Changes

No changes needed. No new payload/fixture builders — this plan reuses every existing helper
(`helpers/session.ts`, `helpers/terminal.ts`, `helpers/payloads.ts`, `helpers/railorder.ts`,
`helpers/theme.ts`, `helpers/fixtures.ts`) exactly as the two source files already did. No
grab-bag-local helper existed in either source file (both `actions.spec.ts` and `views.spec.ts`
imported every helper from `./helpers/*`; the only module-level value was `const sharedDaemon =
fileDaemon();`, which now exists in both `actions.spec.ts` and the new `rail-cards.spec.ts`,
since both contain tests that read it), so nothing needed moving to `helpers/<feature>.ts`.

Per-file imports were trimmed to only what each file's surviving tests use (verified by grepping
every helper name's call sites against the test-boundary line ranges before splitting):

- `actions.spec.ts` dropped `dragTileOnto`, `expectAllTileGeometrySettled`, `liveTile`,
  `stripCard`, `tilesGridOrder` (all Tiles-only helpers, used exclusively by the 5 tests that
  moved to `tiles.spec.ts`). Kept `TerminalSocketTracker`, `terminalRegion`, `resolvedCssVar`,
  and all `session.ts`/`payloads.ts` imports (still used by kept tests).
- `views.spec.ts` dropped `dragTileOnto`, `expectAllTileGeometrySettled`,
  `expectTileGeometryMatchesTmux`, `liveTile`, `stripCard`, `TerminalSocketTracker`,
  `tileDragHandle`, `tileStateDot`, `tilesGridOrder`, `settleFor`, and the `SessionObject` type
  (all used exclusively by the 12 tests that moved to `tiles.spec.ts`). Kept `terminalRegion`
  (still used by the E7 chord test) and `railOrderIds`.
- `rail-cards.spec.ts` imports `fileDaemon`, `settleFor`, `test`, `expect` from fixtures;
  `envelopedSessionStart`, `rawNotification`, `rawUserPromptSubmit` from payloads; `findSession`,
  `getState`, `launchSession`, `scratchDirectory`, `SessionObject`, `sessionCard`, `stateBadge`
  from session — no terminal.ts or theme.ts imports needed (none of its 5 tests touch Tiles or
  computed CSS vars beyond what `expect(...).toHaveCSS` already covers via `expect` itself).
- `tiles.spec.ts` imports `settleFor`, `test`, `expect` from fixtures; `envelopedSessionStart`,
  `rawNotification`, `rawUserPromptSubmit` from payloads; `getState`, `launchSession`,
  `scratchDirectory`, `SessionObject` from session (no `sessionCard`/`stateBadge`/`findSession` —
  none of its 17 tests use rail-card locators); the full terminal.ts Tiles helper set
  (`dragTileOnto`, `expectAllTileGeometrySettled`, `expectTileGeometryMatchesTmux`, `liveTile`,
  `stripCard`, `TerminalSocketTracker`, `terminalRegion`, `tileDragHandle`, `tileStateDot`,
  `tilesGridOrder`).

## Repairs

None. No test failed at authoring, so no repair was needed.

## Test Run Output

Collection (from `web/`):

```
$ npx playwright test --list
Total: 302 tests in 29 files
```

(302 runtime tests vs. 299 literal `test(` call sites is pre-existing and unrelated to this
split: `permission-mode.spec.ts` has one `test(` call inside a `for` loop over 4 cases, net +3.
Confirmed unchanged before/after this split.)

`make e2e-lint` (from repo root): `e2e-lint: clean`.

Since every moved/kept test pins unchanged behaviour (this plan makes no product change yet),
all four affected files were run live per the authoring-mode "regression pins run live" rule,
after `make web-build build`:

```
$ npx playwright test e2e/actions.spec.ts
Running 13 tests using 4 workers
  13 passed (6.8s)

$ npx playwright test e2e/views.spec.ts
Running 5 tests using 4 workers
  5 passed (2.2s)

$ npx playwright test e2e/rail-cards.spec.ts
Running 5 tests using 3 workers
  5 passed (4.0s)

$ npx playwright test e2e/tiles.spec.ts
Running 17 tests using 4 workers
  17 passed (7.9s)
```

40/40 passing, 0 failures, across all four affected files.

## Notes

- Extraction method: every test's exact line range in the pre-split `actions.spec.ts` (1653
  lines) and `views.spec.ts` (780 lines) was located via `awk '/^test\(/{...} /^});$/{...}'`
  (test-body boundaries never span into a comment block, so this is exact) and cross-checked
  against the plan's own line numbers in the E2E split table — every one matched exactly. Each
  test's preceding file-level comment block (a `// review ...` or `// Plan ...` note documenting
  that specific test or a small group of adjacent tests) was carried with its test(s) to the
  destination file; only the four files' top-of-file header comments were rewritten, to describe
  each file's new scope and fixture rationale rather than its pre-split one.
- `SessionObject` type import: dropped from `views.spec.ts` (only ever used by the test at old
  line 525, now in `tiles.spec.ts`) and from `rail-cards.spec.ts`'s sibling `tiles.spec.ts`
  neither needed `sessionCard`/`stateBadge`/`findSession` — verified by grepping each helper's
  call sites against the exact test-boundary ranges before assembling the new files, not by
  inspection alone.
- No `.md`/config file outside `plans/code-breakup/` was touched. `TODO.md`'s tick-and-move for
  this plan and any `docs/design/test-strategy.md` update are outside e2e-specs' scope per
  plan.md's own Affected Files list (§ "Doc & Process", assigned elsewhere in the pipeline).
- `plans/code-breakup/orchestration-state.json` was left untouched (orchestrator-owned).

## Validate Attempt 1

Both tracks were already committed on `plan/code-breakup` when this run started: daemon-impl
(`322c855` + fix attempt 1 `b819ee8` reordering lifecycle registration to ingest/usage/theme/update
per REQ-11) and web-impl (`0e9f32f`), plus daemon-tests (`1c17d37`) and web-tests (`c50a825`,
`cfa2c76`, `fdcb9e3`). Both implementation logs report their own smoke runs of these four spec
files green (web-impl: "40 passed (15.3s)"). This run independently rebuilt and re-executed them
rather than trusting those self-reports.

**Rebuild** (from the project root, in order — `web-build` before `build` since the binary embeds
the dashboard):

```
$ make web-build build
...
✓ built in 254ms
go build -ldflags "-X main.version=v0.12.1-29-gade3e31" -o bin/musterd ./cmd/musterd
```

Exit 0, no errors.

**My four spec files, live** (from `web/`):

```
$ npm run e2e -- e2e/actions.spec.ts e2e/views.spec.ts e2e/rail-cards.spec.ts e2e/tiles.spec.ts
e2e-lint: clean
Running 40 tests using 4 workers
...
  40 passed (15.2s)
```

All 40 tests (13 actions.spec.ts + 5 rail-cards.spec.ts + 17 tiles.spec.ts + 5 views.spec.ts) pass
against the rebuilt binary and dashboard, first run, no repairs needed. This is one run, not three
— no locator or timing defect surfaced, so no iteration was required.

**Full-suite sweep** (`make e2e` from the project root, which rebuilds again then runs the whole
suite):

```
$ make e2e
...
Running 302 tests using 4 workers
...
  302 passed (1.6m)
```

All 302 tests across all 29 spec files pass, including every test outside this plan's four touched
files (the refactor's implicit regression surface). No pre-existing spec needed a delta-sanctioned
update — the plan carries no protocol delta (`## Protocol Contract`: "No protocol changes"), so
there was nothing for an old expectation to contradict.

**Collection re-check** (post-run, from `web/`):

```
$ npx playwright test --list
Total: 302 tests in 29 files
```

Matches the pre-existing count (authoring-mode collection also reported 302 runtime tests / 299
literal `test(` sites, the +3 explained by `permission-mode.spec.ts`'s loop). No duplicate titles,
no collection error.

**Automated Checks this agent owns:**

| Check | Command | Result |
|---|---|---|
| E1 | `make e2e` | 302 passed, 0 failed |
| E2 | `make e2e-lint` (also runs as the `npm run e2e` prehook) | `e2e-lint: clean` |
| E3 | `cat web/e2e/*.spec.ts \| grep -cE '^\s*test\('` | `299` |
| E6 | `grep -rnE '\btest\.(skip\|fixme\|only)\b' web/e2e/*.spec.ts` | no matches — none introduced |

## Repairs

None. Every test in my four files passed on the first live run against the rebuilt implementation;
no locator, wait, regex, or fixture needed changing. `git status`/`git diff --stat -- web/e2e/`
show zero changes to any spec file from this validate pass.

No assertion was deleted, skipped, or weakened.

## Test Run Output (Validate Attempt 1)

```
$ npm run e2e -- e2e/actions.spec.ts e2e/views.spec.ts e2e/rail-cards.spec.ts e2e/tiles.spec.ts
e2e-lint: clean
Running 40 tests using 4 workers
  40 passed (15.2s)

$ make e2e
Running 302 tests using 4 workers
  302 passed (1.6m)

$ npx playwright test --list
Total: 302 tests in 29 files
```

## Notes (Validate Attempt 1)

- No implementation-bug surfaced. Both `main.ts`'s composition-root rewrite and `server.go`'s
  feature-type breakup preserved every observable behaviour the moved and kept tests pin — grid
  membership/order, socket counts, drag reorder, density promotion, action-button state, rail
  sort, and the prefs/state protocol shape (views.spec.ts's two protocol tests: E2/E3) all still
  hold.
- Confirmed via the implementation logs (not re-derived here) that daemon-impl's Fix Attempt 1
  (lifecycle registration order) was already reviewed and re-tested by daemon-tests
  (`TestNew_RegistersLifecycleFeaturesInStartOrder`) before this validate run started; this run's
  full-suite green is consistent with that fix holding.
- This is a pre-review validate pass (no review cycle has run yet), so this commit's suffix is
  `(pre-review fix)` per the orchestrator's instruction, even though no fix to any spec file was
  actually needed — the commit only carries this log update.
