# Web Tests: Maintainability Cleanup (WF1)

**Plan**: maintainability-cleanup
**Unit**: WF1 only
**Verdict**: pass

## Summary

Two Vitest unit tests (`web/src/features/surfaces.test.ts`, new file) plus one Playwright
E2E test (`web/e2e/update.spec.ts`, appended to the existing file) — `check()`'s
render-on-settle behaviour is wired directly into `initUpdate(app)`'s own `requireElement`
calls (unlike `launch.ts`/`issue.ts`, it has no elements-passed-in split), and this repo's
Vitest config has no jsdom (`docs/conventions.md`: "Vitest covers logic only ... interaction
and rendering are Playwright's job"), so a DOM-free unit test of `check()` isn't an honest
oracle — Playwright is, per the task's own guidance.

Tests created: 3 (2 Vitest + 1 Playwright) | Passing: 3 | Failing: 0

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `web/src/features/surfaces.test.ts` | does not override a newer selection for the same session once the stale spawn resolves | `select`'s shell-spawn stale-response guard (Minor 8) | pass |
| `web/src/features/surfaces.test.ts` | keeps each session's spawn guard independent | per-id (not global) counter — a second session's pending spawn survives another session's newer selection | pass |
| `web/e2e/update.spec.ts` | Check now disables the button the instant it starts and shows its result the instant it settles, not on the next periodic render tick (e-note-4) | `check()` calls `app.render()` on both the start and settle side, not relying on `main.ts`'s 1 s periodic tick | pass |

## Decisions

- `initSurfaces(app, deps)` is exercised with the real `createApp()` (`app.ts`'s own doc
  comment: "pure enough to unit-test, no DOM"), not a hand-rolled fake — `select`'s shell
  branch only ever calls `app.render()`, and with `state.focusedId` left at its default
  `null`, `visibleSessionIds()` returns `[]`, so the registered render phase never reaches
  `openMissingSurfaces` (which would construct a real `TerminalSurface`, needing a DOM this
  file doesn't have — same reasoning as `render/dead.test.ts`'s header comment). `rg -n
  "createApp" web/src` showed no existing feature test doing this yet, but it's the pattern
  `app.ts`'s own comment invites.
- `../api` is mocked exactly as `render/dead.test.ts` already does for `fetchPane` (`vi.mock`
  + `vi.mocked`), scoped to `createShell` only.
- The E2E test uses `page.clock.install()` + `page.clock.pauseAt(new Date())` right before
  the click, so `main.ts`'s `setInterval(app.render, 1000)` cannot fire again during the
  test — this makes the proof deterministic instead of racing a 1 s window with a shortened
  `expect` timeout (which is what `docs/conventions.md`'s "shorten a timeout, never lengthen
  it" rule would otherwise call for, but a race here could coincidentally pass on the
  pre-fix code if the periodic tick happened to land inside the shortened window). Checked
  `rg -rn "page.clock" web/e2e` first — no existing use, so this is a new pattern; it only
  fakes `Date`/`setTimeout`/`setInterval` in the *page*, never the real fetch/WebSocket I/O
  the daemon round trip itself uses, so it doesn't fight the fixture's "no sleeps" rule (it
  freezes a competing timer, it doesn't substitute for waiting on the thing under test).
- No new fixture helpers needed; reused `startReleaseServer`/`stageInstaller` and
  `helpers/update.ts`'s existing locators verbatim.

## Proof the tests fail on the pre-fix code

**`surfaces.test.ts`** — reverted `web/src/features/surfaces.ts` to `git show
HEAD:web/src/features/surfaces.ts` (copied the working file aside first, restored after;
no `git stash`/`checkout` used):

```
 FAIL  src/features/surfaces.test.ts > initSurfaces select() — stale shell-spawn response guard (Minor 8) > does not override a newer selection for the same session once the stale spawn resolves
AssertionError: expected 'shell' to be 'docs' // Object.is equality
 FAIL  src/features/surfaces.test.ts > initSurfaces select() — stale shell-spawn response guard (Minor 8) > keeps each session's spawn guard independent — resolving one id's stale spawn never touches another id's pending one
AssertionError: expected 'shell' to be 'docs' // Object.is equality

 Test Files  1 failed (1)
      Tests  2 failed (2)
```

Restored the fixed file (byte-identical `diff` confirmed), re-ran: `Test Files 1 passed
(1)` / `Tests 2 passed (2)`.

**`update.spec.ts`'s e-note-4 test** — reverted `web/src/features/update.ts` to `git show
HEAD:web/src/features/update.ts` (same copy-aside/restore method), rebuilt (`make web-build
build`), ran `npx playwright test -g "e-note-4"`:

```
  ✘  1 [chromium] › e2e/update.spec.ts:990:1 › Check now disables the button the instant it
     starts and shows its result the instant it settles, not on the next periodic render
     tick (e-note-4) (3.0s)

    Error: expect(received).toBe(expected) // Object.is equality
    Expected: true
    Received: false
      1022 |     expect(await updateCheckButton(dialog).isDisabled()).toBe(true);

  1 failed
```

Restored the fixed file (byte-identical `diff` confirmed), rebuilt, re-ran: `1 passed
(3.6s)`.

Note on the rebuild step: at the moment this unit ran, the daemon track's concurrent
in-flight edit (`internal/server/reader.go`, `internal/session/*.go`,
`internal/store/session.go` — another agent's F1) briefly left `go build ./cmd/musterd`
failing (`f.manager.MarkPlanWritten undefined`). Rather than touch those files (not this
unit's, and impl agents/test agents never edit across that boundary) or wait/poll, the two
revert-and-rebuild proofs above were done once that file compiled again on its own — the
daemon track fixed it in the same window. No daemon file was read for content beyond
confirming compile success.

## Test Run Output

```
$ make web-lint web-test
cd web && npm run -s lint
Checked 186 files in 208ms. No fixes applied.
cd web && npm test
 Test Files  46 passed (46)
      Tests  1843 passed (1843)

$ npx tsc --noEmit
(clean, no output)

$ npx playwright test e2e/update.spec.ts
  20 passed (39.2s)
```
