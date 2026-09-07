# E2E Test Specs: v1 Cleanup

**Plan**: v1-cleanup
**Mode**: validate (attempt 2)
**Verdict**: pass
**Tests created**: 0 (harness-only plan — see `test-specs.cycle1.md`, archived from attempt 1, for the
authoring-mode edits: REQ-16/17/18 comment, variable-rename and cleanup-guard corrections across
`subagent-status.spec.ts`, `shell.spec.ts`, `helpers/picker.ts`, `views.spec.ts`, `rail-order.spec.ts`,
`terminal.spec.ts` and `plain-shell.spec.ts`, commit 3753530)
**Live run**: 281/281 passing

## Context

This plan's `E2E Scope` is `harness-only`. No new spec exists to run in isolation; per the agent
definition this validate step is the **full-suite sweep**. Both implementation tracks have landed
since the cycle-1 authoring log:

- web-impl (a89efa3): extracted `web/src/terminal/notice.ts`; in-flight `Locating <name>…` notices no
  longer auto-hide at 5s (only outcome notices do, REQ-13); `.card.pinned-last` moved to `--edge`
  (REQ-15).
- daemon-impl (b18a1eb, fix eb35cba): `internal/server` `paneSpawner`/`paneConn` seams, nil-Locator
  guard returns `500 internal_error` instead of panicking.
- daemon-tests (99b5bbf, c98b651): 20 named tests moved off real tmux onto fakes, shared socket
  helper adopted at all eight sites, nil-Locator regression pinned directly.

None of this touches a Playwright spec — the harness-only edits from cycle 1 are the entire E2E
deliverable. This run exists to confirm the full suite still passes green against the real
implementation, not to author anything new.

## Steps taken

1. **Rebuild** (`make web-build build` from project root, in that order so the binary embeds the
   current dashboard): clean build, `tsc --noEmit` and `vite build` both succeeded, `bin/musterd`
   rebuilt (`v0.4.0-41-gc98b651-dirty`).
2. **Collection gate** (`npx playwright test --list` from `web/`): `Total: 281 tests in 25 files`, no
   errors, no duplicate titles — same count as the cycle-1 authoring log, confirming no spec was
   added or removed since.
3. **Full live run** (`npm run e2e` from `web/`, no file filter — this is the full-suite sweep the
   harness-only mode requires): **281 passed (1.2m)**, exit 0. I ran this myself rather than relying
   on the orchestrator's report of the same result on this tree.

No repair was needed at any point — no locator, regex, wait, or fixture in any spec needed touching.

## E1 — full suite passes with no new spec added

Confirmed directly: 281/281 passing, 25 files, same file/test count as cycle 1's authoring gate
(`Total: 281 tests in 25 files`). No spec file was added under `web/e2e/`.

## E2 — no E2E comment names a keyboard chord the app does not bind

Checked every chord comment left by the REQ-17 edits against `web/src/shortcuts.ts`'s binding table
(the source of truth — `matchShortcut`'s `BINDINGS` array and its `SHORTCUT_HELP` export):

```
web/src/shortcuts.ts BINDINGS: ⌥⌘N (new-session), ⌘\ (toggle-view), ⌘↑ (launch-parent-dir),
⌥⌘0 (focus-neediest), ⌥⌘1-9 (focus-nth, one binding per digit)
```

Every chord named in an E2E comment:

| File:line | Chord in comment | Bound in shortcuts.ts? |
|---|---|---|
| `views.spec.ts:98` | ⌥⌘1 | yes (focus-nth n=1) |
| `rail-order.spec.ts:537` | ⌥⌘1–9 | yes (focus-nth) |
| `rail-order.spec.ts:539` | ⌥⌘1 | yes (focus-nth n=1) |
| `terminal.spec.ts:395` | ⌥⌘1–9 | yes (focus-nth) |
| `shell.spec.ts:21` | ⌥⌘N | yes (new-session) |
| `helpers/picker.ts:11` | ⌥⌘N | yes (new-session) |

`grep -rn '⌘N\|⌘1-9\|⌘1[^0-9]' web/e2e --include="*.ts" | grep -v '⌥⌘'` (re-run this validate pass)
returns nothing — no bare-modifier (pre-`shortcut-fixes`) chord remains anywhere in `web/e2e`. E2
holds.

## E3 — plain-shell.spec.ts's DEAD-tile-with-directory-removed test cannot leak its scratch dir

Read the guard directly (`web/e2e/plain-shell.spec.ts:397-436`, the tile-path variant REQ-18 names):

```ts
let dirACleaned = false;
try {
  ...
  await expect(deadTileSurface).toBeVisible({ timeout: 15_000 });   // can throw before dirA.cleanup()

  await dirA.cleanup();
  dirACleaned = true;

  await tileSurfaceButton(page, deadSession.id, "shell").click();
  ...                                                                 // every later assertion can throw too
} finally {
  await Promise.all([dirACleaned ? Promise.resolve() : dirA.cleanup(), dirB.cleanup()]);
}
```

This is the same `cleaned`-guard-plus-`finally` shape as the Focus-variant neighbour immediately
above it (`plain-shell.spec.ts:349-388`, which uses `cleaned`/`cleanup()` on its single directory).
Two throw windows exist relative to `dirA`:

- **Before** `await dirA.cleanup()` (e.g. the `deadTileSurface` visibility check, or either
  `launchSession` call): `dirACleaned` is still `false`, so `finally` calls `dirA.cleanup()` — no
  leak.
- **After** `dirACleaned = true` (every assertion from the `shell` click onward): `finally` runs
  `Promise.resolve()` instead of `dirA.cleanup()` — no double-cleanup, which would itself throw
  (`scratchDirectory`'s `cleanup` is not documented idempotent).

Both directories are guaranteed cleaned exactly once regardless of where an assertion throws. This
was authored in cycle 1 (commit 3753530) and is unchanged since; I re-read it against the merged
tree rather than trusting the prior log. I did not additionally break-and-restore the guard, because
this is not a repair I am making this pass (no edit was needed) — the "prove it red" rule in my
instructions applies to a repair I log in the `## Repairs` table below, and that table is empty.

## Tests

No new tests. Full existing suite re-run; see `test-specs.cycle1.md`'s Tests table for the seven
files REQ-16/17/18 touch, and the `Coverage` table below for the current REQ mapping.

## Fixture Changes

None this pass. Cycle 1 made no fixture changes (harness-only, comment/variable/guard edits only).

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-16 | `subagent-status.spec.ts` E7 test ("a failed turn's note is cleared once the next turn starts, not carried into working (E7)") — variable/comment only, no new assertion |
| REQ-17 | six comment sites across `shell.spec.ts`, `helpers/picker.ts`, `views.spec.ts`, `rail-order.spec.ts` (×2), `terminal.spec.ts` — verified against `shortcuts.ts` this pass (E2 above) |
| REQ-18 | `plain-shell.spec.ts`'s DEAD-tile-with-directory-removed (tile path) test — guard verified this pass (E3 above) |
| E1 | full suite, 281/281 |
| E2 | chord audit above |
| E3 | guard read above |

## Repairs

No repairs needed — no locator, regex, wait, or fixture required a change this validate pass.

No assertion was deleted, skipped, or weakened.

## Test Run Output

```
$ npx playwright test --list
Total: 281 tests in 25 files

$ npm run e2e
...
  281 passed (1.2m)
```

## Notes

- Team lead's message reported the same 281/281 result from a run on this tree minutes earlier; I
  re-ran independently rather than taking it on trust, per the mode's own rule ("re-run it yourself
  to confirm").
- `plans/v1-cleanup/orchestration-state.json` (untracked) and the uncommitted Status edit in
  `plans/v1-cleanup/plan.md` are the orchestrator's/team lead's respectively — left untouched, not
  staged.
- `test-specs.cycle1.md` (the archived attempt-1 authoring log) is left in place as the record of
  what was authored; this file is the fresh validate-mode log the orchestrator asked for.
