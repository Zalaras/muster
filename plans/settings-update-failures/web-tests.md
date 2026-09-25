# Web Tests: Settings Update Failures

**Plan**: settings-update-failures
**Verdict**: pass
**Pack**: `kb: pack 11182 words (budget 8000)` — WARN exceeds budget; sections rules 885 · features 5124 · diagrams 0 · decisions 3642 · proposed 0 · facts 71 · lessons 810 · runbooks 644

## Summary

Tests created: 31 (25 in a new file, 6 added to two existing files) | Passing: 31 | Failing: 0
Full suite after these changes: 74 files / 1801 tests passing (was 73/1770 before this step).

`web/src/features/updaterestart.ts` is the only web-tests-owned file the plan names (its
Affected Files § Tests routing), and it is entirely pure/DOM-free: `computeBannerOverride`
(exported, pure) and `initUpdateRestart`'s stateful wiring driven through a real `createApp()`
and a fake `StorageLike` (no jsdom, matching `reader/memory.test.ts`'s established shape). I
also extended two existing, in-scope test files for the plan's other new *logic* (not
rendering): `ws.test.ts` for `WsClient.dispatch`'s new `onHelloArrived` ordering (REQ-16's
wire guarantee that every hello, matched or mismatched, reaches the feature before the
protocol-mismatch gate), and `render/banner.test.ts` for the new `renderBannerContent`
function (a two-line text/class write, tested the same way its sibling `renderBanner` already
was — a duck-typed fake element, not a DOM simulation).

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `updaterestart.test.ts` | W1: shows the restarting text while the socket is down, under 30s | REQ-14 text/neutral at 29999ms | pass |
| `updaterestart.test.ts` | treats any non-connected status ... as socket down | "connecting" counts same as "reconnecting" | pass |
| `updaterestart.test.ts` | W2: falls through to null ... at exactly the 30s boundary | `< RESTART_FALLBACK_MS` boundary at 30000ms | pass |
| `updaterestart.test.ts` | W2: stays null well past the 30s fallback ... | 120000ms still null | pass |
| `updaterestart.test.ts` | never shows the restarting text once the socket reads connected | REQ-14's "while the socket is down" gate | pass |
| `updaterestart.test.ts` | W3: no record and no confirmation returns null regardless of status | fallthrough case | pass |
| `updaterestart.test.ts` | W5: shows the confirmation text for a fresh confirmation | REQ-17 text/neutral:true | pass |
| `updaterestart.test.ts` | W5: confirmation expires at exactly the 3s boundary | `< CONFIRMATION_MS` boundary | pass |
| `updaterestart.test.ts` | the confirmation takes priority over a held restart record | precedence order in `computeBannerOverride` | pass |
| `updaterestart.test.ts` | arms a record from an update message whose apply.phase is restarting | REQ-13 wiring via `app.on("update", ...)` | pass |
| `updaterestart.test.ts` | degrades a null apply.version to the empty string rather than throwing | defensive `?? ""` on a wire invariant | pass |
| `updaterestart.test.ts` | REQ-18: a non-restarting update while connected drops the held record | REQ-18 | pass |
| `updaterestart.test.ts` | REQ-18 is gated on being connected: ... leaves the record held | REQ-18's connected-only gate | pass |
| `updaterestart.test.ts` | W6: the first hello ... writes the handoff then reloads | REQ-16 handoff write + `location.reload()` | pass |
| `updaterestart.test.ts` | W3: a hello with no record held never reloads ... | no-op path | pass |
| `updaterestart.test.ts` | W7: a second hello before the page unloads does not reload twice | `reloaded` latch | pass |
| `updaterestart.test.ts` | still reloads when the handoff write throws | best-effort storage tolerance | pass |
| `updaterestart.test.ts` | reads and consumes the handoff at construction | `takeHandoffVersion`'s read-once/remove | pass |
| `updaterestart.test.ts` | arms the confirmation when the first snapshot's update.running matches | REQ-17/INV-3 match case | pass |
| `updaterestart.test.ts` | INV-3: never confirms when the first snapshot's running differs | INV-3 mismatch | pass |
| `updaterestart.test.ts` | INV-3: never confirms when no handoff was ever written | INV-3 absent handoff | pass |
| `updaterestart.test.ts` | INV-3: never confirms when the first snapshot has no update object yet | measured-absence "no data yet" state (`snapshot.update === null`) | pass |
| `updaterestart.test.ts` | INV-3: never confirms from a throwing storage | INV-3 throwing storage | pass |
| `updaterestart.test.ts` | INV-3: a foreign/malformed handoff shape (no version field) is treated as absent | `isHandoff` type guard | pass |
| `updaterestart.test.ts` | only the first snapshot of the page's life may arm the confirmation | `handoffChecked` latch (W5's "consumed handoff" case) | pass |
| `ws.test.ts` | REQ-16: fires onHelloArrived for a supported hello, alongside onHello | matched-hello case | pass |
| `ws.test.ts` | REQ-16: fires onHelloArrived for a protocol-mismatched hello too, before the mismatch gate | the exact ordering REQ-16 depends on | pass |
| `ws.test.ts` | does not fire onHelloArrived for a non-hello message | negative case | pass |
| `render/banner.test.ts` | writes the given text verbatim | `renderBannerContent`'s text write | pass |
| `render/banner.test.ts` | adds the .neutral class when neutral is true | REQ-19 modifier | pass |
| `render/banner.test.ts` | removes the .neutral class when neutral is false | toggle back to the alarm tokens | pass |

## Coverage decisions (not gaps)

- **`W4` (non-restarting phase while connected drops the record) and `W11`** are covered
  above under REQ-18's two tests, which is the same requirement pair the plan's acceptance
  table cross-references (W4 = REQ-18's connected branch, tested both ways: connected drops
  it, still-disconnected doesn't).
- **`connection.ts`'s `app.onRender` banner phase** (reading `deps.restartBanner(frame.now,
  frame.connection)` and falling back to the ordinary daemon-down text when it's `null`) is
  DOM wiring inside an existing controller, not new decision logic — `computeBannerOverride`
  is the decision, fully covered above; the render-phase plumbing itself is
  `e2e/update.spec.ts`'s job (plan's own routing: E5/E6), and `review-browser`'s W10/W11.
- **`wsapp.ts`'s new `onHelloArrived: () => app.emit("helloReceived")` line** is a one-line,
  branchless relay — I left it untested directly. `wsapp.ts` has no test file at all (a
  pre-existing gap, not introduced by this plan: none of its other handler lines —
  `onSessionRemoved`, `onUsage`, `onShellActivity`, `onUpdate`, `onProtocolMismatch` — are unit
  tested either, all following the identical one-line-relay shape). Both ends of this one
  line are directly tested: `ws.test.ts`'s new cases prove `WsClient` calls
  `handlers.onHelloArrived()` on every hello, and `updaterestart.test.ts` proves
  `app.on("helloReceived", ...)` does the right thing once emitted. Flagging this rather than
  silently building a new `wsapp.test.ts` scoped only to my one line, which would be
  inconsistent with the file's existing (untested) sibling lines.
- **REQ-1–REQ-12 (daemon-side classification/failure-text) and the E2E flows (E1–E6)** are
  out of this role's scope per the plan's own Affected Files split (`web-implementation.md`
  confirms the web side renders the daemon's text as-is, unchanged).

## Test Run Output

```
$ npx tsc --noEmit
(clean, no output)

$ npm test
 RUN  v5.0.0 /Users/damian/Documents/code/Projects/muster/web
 Test Files  74 passed (74)
      Tests  1801 passed (1801)
   Duration  3.63s

$ npm run build
✓ built in 1.68s
(pre-existing >500kB chunk-size warnings only, unrelated to this plan's files)

$ npm run -s lint
Checked 251 files in 220ms. No fixes applied.
```

## Fix Attempt (review cycle 1)

**Verdict**: pass

### Wave-1 sanctioned break (event rename)

web-impl renamed the app-bus event `helloReceived` → `helloArrived` (maintainability
Minor 5, matching `wsapp.ts`'s `onHelloArrived` → `"helloArrived"` on-prefix-stripped
convention) and correctly declined to edit my test bodies, leaving 5 `tsc` errors
(`updaterestart.test.ts:205,216,228,229,239`) documented in `web-implementation.md`'s
Handoff. Fixed by renaming all 5 `app.emit("helloReceived")` calls to
`app.emit("helloArrived")` — a plain rename, no assertion changed by it.

### My issue: `[web-tests]` Minor 3 — W6/W7 assertions weaker than their titles

Both fixed in `web/src/features/updaterestart.test.ts`, same describe block
(`initUpdateRestart — reload handoff (REQ-16, W6/W7)`):

- **W6** ("triggers the reload with the handoff written first"): the `reload` stub now
  captures `storage.data["muster.update-restart"]` *at the moment it is called*
  (`reload.mockImplementation(() => { handoffAtReloadTime = storage.data[...] })`), then
  asserts that captured value is the expected JSON — not a read-back after both calls
  returned. A `reload` that fired before the write landed would see `undefined` here.
  Re-ran the reviewer's own counter-example mentally: a hypothetical `helloArrived`
  handler that called `location.reload()` before `writeJson(...)` would now fail this
  test (`handoffAtReloadTime` would be `undefined`, not the expected object) — confirmed
  by reading `updaterestart.ts:164-169`, where `writeJson` precedes `location.reload()`
  in program order, and temporarily swapping that order locally reproduces the new
  test's failure (reverted, not committed).
- **W7** ("does not write the handoff again"): `fakeStorage` now counts `setItem` calls
  (`setItemCalls`), and the test asserts `storage.setItemCalls === 1` after two
  `helloArrived` emissions, in addition to the existing `reload` call-count assertion.

### Coverage task (not a tagged issue)

- **Edge 18, throwing accessor**: added a case that defines `globalThis.sessionStorage`
  as a getter that throws (not a stubbed value with throwing methods — that was already
  covered by the pre-existing `throwingStorage()` case) and calls `initUpdateRestart(app)`
  with no storage argument, so the default parameter's `safeSessionStorage()` runs against
  the throwing global. Asserts construction doesn't throw and a subsequent `helloArrived`
  still reloads once. Restores the original property descriptor in a `finally`.
- **Confirmation's scheduled hide (~3s)**: added a fake-timers case asserting the
  `setTimeout(() => app.render(), CONFIRMATION_MS + 50)` scheduled in the snapshot handler
  fires exactly once, at 3050ms (not 3049ms, not again at +10s) — spying on `app.render`
  via `vi.spyOn(app, "render")`.
- **Banner writer, write-only-on-change (browser Minor 3)**: declined. The dedup state
  (`lastBannerText`/`lastBannerNeutral`/`lastBannerVisible`) lives entirely inside
  `initConnection`'s closure in `web/src/features/connection.ts` (its `app.onRender`
  callback), which looks up five real DOM elements via `requireElement` and is never
  exported. `render/banner.test.ts`'s existing tests ("writes the given text verbatim",
  "adds the .neutral class when neutral is true") already show `renderBanner`/
  `renderBannerContent` themselves write unconditionally on every call, by design — the
  comment at `render/banner.ts:1-8` confirms `renderBanner` "still only ever toggles
  visibility", never diffing. There is no existing `features/connection.test.ts` in this
  tree (only its pure-helper siblings `connectionrestore.test.ts`/
  `connectionversion.test.ts` are unit-tested), consistent with `features/CLAUDE.md`'s
  controller/pure-helper split: `connection.ts` is the DOM controller, not reachable from
  a unit test without instantiating a DOM harness this role's test strategy rules out.
  review-browser already measured this fix directly (X1/X2, "0 mutation records" per
  `web-implementation.md`'s Minor 3 remeasurement) — that is the right-layered coverage
  for DOM-wiring behaviour, not a Vitest unit test.

### Verification

```
$ npx tsc --noEmit
(clean, no output)

$ npx vitest run src/features/updaterestart.test.ts
 Test Files  1 passed (1)
      Tests  27 passed (27)

$ npm test
 Test Files  74 passed (74)
      Tests  1803 passed (1803)

$ npm run build
✓ built in 1.67s
(pre-existing >500kB chunk-size warnings only, unrelated to this plan's files)

$ npm run -s lint
Checked 251 files in 210ms. No fixes applied.
```

`git status --porcelain` at the end of this wave shows only
`web/src/features/updaterestart.test.ts` under my ownership (daemon-tests' concurrent
edits to two `internal/server/*_test.go` files in the same worktree are untouched and
not staged by me).
