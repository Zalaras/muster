# E2E Test Specs: file-drop-fix

**Plan**: file-drop-fix
**Mode**: fix (attempt 1)
**Verdict**: pass
**Tests created**: 11
**Live run**: 11/11 passing (own file); 214/214 passing (full suite)

## Tests

| File | Test Name | Requirement | What It Verifies |
|------|-----------|-------------|------------------|
| web/e2e/drop.spec.ts | dropping a file that exists in the session directory pastes its escaped path, echoes it after Enter, and moves focus into the pane (E1, E11, REQ-2, REQ-11) | E1, E11, REQ-2, REQ-11 | Full locate→paste→Enter→echo round trip; focus follows a successful paste |
| web/e2e/drop.spec.ts | a dropped filename containing a space is pasted backslash-escaped (E2, REQ-4) | E2, REQ-4 | Escaped path (space -> `\ `) appears in the pane |
| web/e2e/drop.spec.ts | dropping a file with no match anywhere on disk shows the not-located notice and pastes nothing (E3) | E3 | 404 not_located notice text; no paste; Enter echoes nothing path-like |
| web/e2e/drop.spec.ts | dropping a file that matches two identical on-disk copies shows the ambiguous notice with the count (E4) | E4 | 409 ambiguous notice text with count 2; no paste |
| web/e2e/drop.spec.ts | shows a transient 'Locating …' notice while the locate request is in flight, then clears it on success (REQ-6) | REQ-6 | In-flight notice text, then cleared on success, using a gated `page.route` |
| web/e2e/drop.spec.ts | dropping a file on the masthead never navigates away and leaves the rail visible (E5, REQ-1) | E5, REQ-1 | Document-level drop guard swallows a foreign drag+drop outside any terminal surface |
| web/e2e/drop.spec.ts | dropping text/plain with no files pastes the text verbatim (E6, REQ-10) | E6, REQ-10 | Text-only drop pastes unescaped text |
| web/e2e/drop.spec.ts | a file over 50 MiB shows the too-large notice and issues no locate request (E7) | E7 | Size-only fixture triggers client-side rejection with zero network requests |
| web/e2e/drop.spec.ts | in Tiles, a drop on one live tile pastes only into that tile, leaving the other tile's content unchanged (E8, INV-4) | E8, INV-4 | Two-tile Tiles setup; drop on B leaves A's terminal content byte-for-byte unchanged |
| web/e2e/drop.spec.ts | a drop on a dead session's surface is swallowed silently — no notice, no request, no navigation (E9, REQ-8) | E9, REQ-8 (dead-session half) | `#dead-surface` drop is a no-op: no notice, no `/locate` request, no navigation |
| web/e2e/drop.spec.ts | a drop on a live pane whose socket is not open shows the not-connected notice and issues no request (REQ-8) | REQ-8 (not-open-socket half) | Daemon-down fixture closes the terminal WS; drop shows "Pane isn't connected" and issues no request |

REQ-9/E10/INV-3 (internal rail/tile reorder drags keep working with the guard installed)
is **not** re-authored here — see Coverage below.

## Fixture Changes

- `web/e2e/helpers/terminal.ts` — added `DropFileSpec`, `dropFiles`, `dropText`,
  `dragoverThenDropFiles`, `dropNotice` (the three named in the plan's Affected Files
  entry, plus `dragoverThenDropFiles` for E5's guard-`dragover` exercise, additive per the
  e2e-specs brief). All build a `DataTransfer` in-page via `page.evaluateHandle` and
  `new File([...])`/`dt.setData`, then `dispatchEvent`, matching the plan's own
  Implementation Notes and the documented Playwright drag-and-drop pattern (reusing one
  `DataTransfer` handle across `dragover` then `drop`, mirroring Playwright's own
  `dragstart`+`drop` example). `DropFileSpec.size` (no `bytes`) builds a zero-filled
  `Uint8Array` of that length directly in the page — used only by E7's 50 MiB+1 fixture, so
  the harness never serializes tens of megabytes of literal content across the CDP wire for
  a request that must never even reach the network.
- `web/e2e/helpers/dropfiles.ts` (new) — `uniqueContent()` (random bytes per the plan's own
  Implementation Notes: "each dropped file's content is unique random bytes"; no assertion
  in the suite depends on which bytes were chosen, only on the locate outcome),
  `writeFixtureFile()` (writes + returns the `fs.realpath`-resolved path, matching the
  daemon's `EvalSymlinks`-deduped return value), `expectedEscapedPath()` (an INDEPENDENT
  reimplementation of REQ-4's escaping rule — not an import of `web/src/terminal/drop.ts`'s
  `escapePath`, which stays Vitest's job per W4), `MAX_DROP_BYTES`.

No `web/playwright.config.ts` change needed or requested.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | "dropping a file on the masthead never navigates away…" |
| REQ-2 | "dropping a file that exists in the session directory…" |
| REQ-3 | (daemon-only; D-series) — indirectly exercised by E1/E3/E4's outcomes |
| REQ-4 | "a dropped filename containing a space is pasted backslash-escaped…" |
| REQ-5 | "in Tiles, a drop on one live tile pastes only into that tile…" (per-session directory routing) |
| REQ-6 | "shows a transient 'Locating …' notice…"; failure-notice text asserted in E3/E4/E7/E9/not-connected tests |
| REQ-7 | "a file over 50 MiB shows the too-large notice…" |
| REQ-8 | "a drop on a dead session's surface is swallowed silently…" (dead half); "a drop on a live pane whose socket is not open…" (not-open-socket half) |
| REQ-9 | existing `rail-order.spec.ts` (22 tests) + `views.spec.ts` move-tiles reorder tests (6 tests) — run live below, unmodified |
| REQ-10 | "dropping text/plain with no files pastes the text verbatim…" |
| REQ-11 | folded into E1's test (focus assertion before and after the paste) |
| REQ-12 | not tested (Nice to Have; no acceptance ID names it) |
| INV-1 | covered by D-series unit tests (daemon-tests' job); E1/E3/E4 each observe one outcome (found / not-located / ambiguous) from the UI side |
| INV-2 | daemon-tests' job (filesystem snapshot assertions) |
| INV-3 | existing `rail-order.spec.ts` + `views.spec.ts` move-tiles tests, run live this session (see below) — **not** re-authored |
| INV-4 | "in Tiles, a drop on one live tile pastes only into that tile…" |

## Regression Pins (run live at authoring)

Per the e2e-specs brief ("regression pins run live at authoring") and the plan's own
E10 wording ("the existing rail reorder and tile reorder specs pass unmodified with the
guard installed"), these pre-existing spec files/tests are this plan's proof for
REQ-9/E10/INV-3. They assert **unaffected** behaviour (no drop guard exists on the tree
yet, so nothing has changed for them today) and were run live before authoring drop.spec.ts:

```
make web-build build   # fresh dashboard + musterd binary embedding it
npm run e2e -- e2e/rail-order.spec.ts
  22 passed (8.8s)

npm run e2e -- e2e/views.spec.ts -g "reorders forward|reorders backward|places the promoted tile into the demoted tile|leaves the tile order unchanged|reorders the grid while the daemon is down|state dot title tracks"
  6 passed (4.4s)
```

All 28 pass on the current tree. No locator defects found; no edits were needed to either
file. This is not new authored coverage — it is the pre-existing regression pin the plan's
Affected Files section already designates for INV-3, confirmed green before the feature
lands.

## Collection Gate

```
npx playwright test --list
Total: 214 tests in 18 files
```

No errors, no duplicate titles. The 11 new drop.spec.ts tests appear at their expected
locations; `web/e2e/helpers/terminal.ts` compiles clean (`npx tsc --noEmit -p .` — no
output).

## Notes

- No real `claude` binary is ever launched; the daemon, tmux, and the `-claude-bin`
  echo-loop stub are all real, matching terminal.spec.ts's established pattern. Nothing in
  this file synthesizes a hook or status-line payload — the feature reads no Claude Code
  wire data.
- Every test uses a fresh per-test scratch daemon (`beforeEach`/`afterEach`), mirroring
  terminal.spec.ts's documented rationale: most tests here depend on a single launched
  session being "top of sort" so Focus auto-focuses it with no rail click.
- The ambiguous-file fixture (E4) places two byte-identical files at the same basename in
  two different subdirectories of the session directory, since a single directory cannot
  hold two entries of the same name — this is the walk's own ambiguity case (Spotlight
  never runs against E2E's `os.tmpdir()`-rooted scratch directories per the plan's
  Implementation Notes).
- REQ-6's in-flight "Locating …" notice is asserted with a gated `page.route` (holding the
  real request open, not fabricating a response) — the same technique
  `actions.spec.ts`'s "loading last screen…" Minor-9 regression test already uses for an
  analogous otherwise-sub-second window.
- The two REQ-8 halves are deliberately split into two tests: the dead-session half (no
  surface ever mounts, E9) and the not-open-socket half (surface mounts but its WS is
  closed, via the same daemon-kill fixture terminal.spec.ts's E13 uses) — the plan
  describes them as genuinely distinct states with distinct expected UI, so one test could
  not honestly cover both.
- Every notice-text assertion (`dropNotice(region).toHaveText(...)`) uses the exact strings
  from the plan's Testable UI Elements table, including the literal Unicode ellipsis
  (U+2026) and em dash (U+2014) characters — copied verbatim from the plan, not typed as
  ASCII approximations.
- `expectedEscapedPath` in `helpers/dropfiles.ts` is a deliberately independent
  reimplementation of REQ-4's escaping table, not an import of the implementation module
  (which doesn't exist yet, and wouldn't be an independent oracle even once it does).
- Handoff to validate mode: none of the wire shapes here are unmeasured probes-needed
  guesses — the `/locate` request/response shapes come directly from the plan's own
  Protocol Contract (already merged into `docs/protocol.md` §3.14), not from an invented
  shape. The one thing validate mode should watch for: whether `region.click()` in the E3
  test (clicking into the pane before Enter, to give it keyboard focus for the manual
  Enter-press) is still necessary once the real implementation exists, or whether it
  conflicts with any focus behavior REQ-11/INV-3 impose on a failed drop — repair the
  locator/sequence there first if E3 fails on an otherwise-correct implementation.

## Validate Attempt 1

**Rebuild**: `make web-build build` (project root) — `tsc --noEmit && vite build` then
`go build ./...`, both exit 0.

**First run** (`npm run e2e -- e2e/drop.spec.ts`): 9/11 passed, 2 failed. Both failures
were locator defects in my own spec, not implementation bugs — see Repairs below.
`region.click()` before `Enter` in the E3 test (the one thing flagged for validate-mode
attention in the authoring handoff) turned out fine as-is: a failed drop genuinely leaves
focus outside the pane (confirmed by the `activeElementInsideTerminal(...) === false`
assertion two lines above it), so the manual click is still required and does not
conflict with REQ-11/INV-3 — no change needed there.

**After repairs**: `npm run e2e -- e2e/drop.spec.ts` → 11/11 passed (9.9s).

**Collection re-check**: `npx playwright test --list` → `Total: 214 tests in 18 files`,
no errors, no duplicate titles.

**Full suite sweep** (`make e2e` from project root, full rebuild + `npm run e2e` with no
file filter): **214/214 passed (54.3s)**. In particular `rail-order.spec.ts` (this plan's
designated INV-3 regression pin) and `views.spec.ts`'s move-tiles reorder tests all passed
unmodified — the `DRAG_MIME` value rename (`text/plain` →
`application/x-muster-drag-id`, web-implementation.md's Decisions) and the 409 `ambiguous`
body's standard `{"error":{...}}` envelope wrap (daemon-implementation.md's Decisions)
broke nothing pre-existing. No sanctioned-breakage repairs were needed on any file outside
`drop.spec.ts`.

## Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | dropping a file with no match anywhere on disk shows the not-located notice and pastes nothing (E3) | `not.toContainText(/stub-echo:.*ghost\.png/)` failed: received `"...stub-echo: Can't locate ghost.png on disk — paste its path instead"` | The assertion was scoped to the whole `.terminal-surface` region, which also contains the sibling `.terminal-notice` (REQ-6's still-visible ~5s failure notice legitimately says "ghost.png"). xterm pads each row to full column width with trailing spaces, and Playwright's normalized `textContent` collapses that padding plus the adjacent notice text into a single space, producing `"stub-echo: Can't locate ghost.png…"` — which the regex's `.*` innocently spans into. Not a case of nothing being pasted; my regex was reading the wrong element. | Introduced `const terminalBody = region.locator(".terminal-body")` (the pre-existing, stable xterm-container class set in `web/src/terminal/pane.ts`) and scoped both the positive (`toContainText("stub-echo:")`) and negative (`not.toContainText(/stub-echo:.*ghost\.png/)`) assertions to it instead of `region` | E3/REQ-8-adjacent: still asserts the pty received an empty line (no path) after a failed locate — now against only the terminal's real rendered content, so it can no longer be defeated (in either direction) by the notice's own text |
| 2 | a drop on a dead session's surface is swallowed silently — no notice, no request, no navigation (E9, REQ-8) | `deadSurface.getByRole("status")` expected count 0, got 1 | The dead-surface markup (`web/index.html`'s `#dead-surface` and `#dead-surface-template`, plan m4-reconcile, pre-existing and untouched by this plan) contains `<b role="status">session ended</b>` — a legitimate, unrelated status element that has nothing to do with file-drop-fix's own notice. A bare role-based locator can't tell the two apart. | Changed to `deadSurface.locator(".terminal-notice")` — file-drop-fix's own notice class, which `TerminalSurface` never mounts inside `#dead-surface` (a completely separate component/DOM subtree) | E9/REQ-8: still asserts "no notice element inside the dead surface at all, not merely a hidden one" per the plan's own wording — now scoped to the element the plan actually means |

No assertion was deleted, skipped, or weakened.

## Test Run Output

```
Running 11 tests using 6 workers
  ✓ dropping a file on the masthead never navigates away and leaves the rail visible (E5, REQ-1)
  ✓ shows a transient 'Locating …' notice while the locate request is in flight, then clears it on success (REQ-6)
  ✓ dropping a file that exists in the session directory pastes its escaped path, echoes it after Enter, and moves focus into the pane (E1, E11, REQ-2, REQ-11)
  ✓ dropping a file that matches two identical on-disk copies shows the ambiguous notice with the count (E4)
  ✓ dropping a file with no match anywhere on disk shows the not-located notice and pastes nothing (E3)
  ✓ dropping text/plain with no files pastes the text verbatim (E6, REQ-10)
  ✓ a dropped filename containing a space is pasted backslash-escaped (E2, REQ-4)
  ✓ a file over 50 MiB shows the too-large notice and issues no locate request (E7)
  ✓ in Tiles, a drop on one live tile pastes only into that tile, leaving the other tile's content unchanged (E8, INV-4)
  ✓ a drop on a live pane whose socket is not open shows the not-connected notice and issues no request (REQ-8)
  ✓ a drop on a dead session's surface is swallowed silently — no notice, no request, no navigation (E9, REQ-8)
  11 passed (9.9s)

Full suite: 214 passed (54.3s)
```

## Notes (validate)

- No implementation code was touched. Both repairs are locator/scoping fixes confined to
  `web/e2e/drop.spec.ts`.
- No config changes needed; `web/playwright.config.ts` untouched.

## Fix Attempt 1 (review cycle 1, wave 3)

Two issues tagged `[e2e-specs]` in `plans/file-drop-fix/review.md`: one Critical, one
Major. No implementation code changed this cycle (impl agents were tagged only with
Minors, routed to `TODO.md`), so this attempt touches only `web/e2e/drop.spec.ts`.

### Critical 1 — `make e2e` flaky (~50%) due to added peak load

**Every code path that reaches the defect:** there is exactly one — `drop.spec.ts`'s 11
tests each spawn their own scratch `musterd` plus a real tmux session in `beforeEach`,
and with `fullyParallel: true` and no serial/describe grouping, Playwright's default
scheduler could run up to 6 of them concurrently (one per worker) on top of whatever
other spec files were also mid-run in their own workers at the same moment. That raised
peak process/tmux-session contention enough to tip three unrelated, already-marginal
assertions in `terminal.spec.ts`, `theme.spec.ts`, and `actions.spec.ts` (none of them
this plan's) into failure in 3 of 6 measured full-suite runs. This door is closed by
serializing this file's own 11 tests so they never contribute more than one scratch
daemon/tmux pair to the peak at a time — there is no second path (no other describe
block, no other parallel grouping) in this file to also close.

**Fix**: added `test.describe.configure({ mode: "serial" });` near the top of
`web/e2e/drop.spec.ts`, before the `let daemon` declaration, with a comment explaining
why (chosen over the "shared scratch daemon" alternative the review also offered,
because several tests here depend on being the sole session on their daemon for
Focus-view "top of sort" auto-focus, per the file's own existing header comment — sharing
a daemon across them would require restructuring that invariant, which is more invasive
than necessary to fix a scheduling problem). Each test still gets a fully independent
`beforeEach`/`afterEach` scratch daemon; serial mode only changes *when* those 11 tests
run relative to each other and to other files (one at a time, in one worker), not what
each test does or shares.

**Verification**: confirmed the live run now uses 1 worker for this file ("Running 11
tests using 1 worker") instead of fanning out, then ran the **full** suite three
consecutive times per the fix-mode brief (a flake-rate defect needs more than one green
run as proof):

```
make e2e  (run 1): 214 passed (53.5s)
make e2e  (run 2): 214 passed (53.9s)
make e2e  (run 3): 214 passed (53.8s)
```

No implementation or config file was touched; `web/playwright.config.ts` is unchanged.

### Major 3 — E9's "no notice" clause was unfalsifiable

**Defect**: `deadSurface.locator(".terminal-notice")` having count 0 can never be
false — `.terminal-notice` is created only inside `TerminalSurface`'s constructor
(`web/src/terminal/pane.ts:79`), which never runs for `#dead-surface`'s static markup
(`web/index.html:78-92`) regardless of what the implementation does. Confirmed by
re-reading both files: there is no other place `.terminal-notice` is instantiated, and no
code path that would attach a `TerminalSurface` instance to `#dead-surface`.

**Fix**: replaced that one clause with two assertions that check the whole page, not just
the dead surface's own static subtree, for the concrete symptom a real leak of REQ-8's
guard would produce — per the review's own suggested direction ("no element anywhere on
the page carries any of the drop notice strings after the drop"):

1. `expect(page.getByText("anything.png")).toHaveCount(0)` — the dropped file's own name
   is exactly what a leaked notice would mention (see every other outcome-notice string
   in this file, e.g. "Can't locate ghost.png…", "dup.png matches 2…"), so this fails if
   the drop reached any live surface's notice anywhere on the page instead of being
   swallowed.
2. A loop over every `role="status"` element's text on the whole page (not scoped to
   `deadSurface`), asserting none match `/locating|can't locate|matches \d+
   identical|over 50 mib|isn't connected/i` — the fixed notice-outcome phrases this
   plan's own notices use elsewhere in this file. Deliberately does not match the
   pre-existing, unrelated "session ended" label inside `#dead-surface`
   (`web/index.html`, plan m4-reconcile) so that legitimate status text can't produce a
   false failure here, which is exactly what made the review flag a bare role-only query
   as the wrong tool in the first place (test-specs.md's original Repair 2).

This is genuinely falsifiable: temporarily changing the guard to *not* bail on a dead
surface (verified by hand, not committed) makes both new assertions fail, where the old
`.terminal-notice`-count-0 clause would have stayed green throughout. The other two
assertions in the test (`page.url()` unchanged, `locateRequests === 0`) were already
genuine and are untouched.

## Repairs (fix attempt 1)

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | (whole file — scheduling, not a single test) | `make e2e` red in ~half of full-suite runs, failure landing in unrelated specs each time | 11 tests in this file each spawning their own scratch daemon + tmux session with no serial/describe grouping let up to 6 run concurrently, raising peak machine contention past the point where three already-marginal assertions elsewhere would hold | `test.describe.configure({ mode: "serial" })` | No requirement's assertion strength changed; this is a scheduling fix, not a locator fix — every one of the 11 tests still asserts exactly what it did before, now just one at a time |
| 2 | a drop on a dead session's surface is swallowed silently — no notice, no request, no navigation (E9, REQ-8) | Reviewer identified the `.terminal-notice`-count-0 clause as unfalsifiable (true by construction; `TerminalSurface`'s constructor, the only place that creates that class, never runs for `#dead-surface`) | The clause asserted absence of an element that structurally cannot exist in that subtree regardless of behaviour, so it could never catch a real REQ-8 regression | Replaced with a page-wide `getByText("anything.png")` count-0 check plus a page-wide `role="status"` text loop against the plan's own fixed notice-outcome phrases | REQ-8's "no notice" clause: now genuinely fails if a leaked notice (mentioning the dropped filename or any of this plan's fixed outcome phrases) appears anywhere on the page, which the old clause could never detect regardless of implementation behaviour |

No assertion was deleted, skipped, or weakened.

## Test Run Output (fix attempt 1)

```
npm run e2e -- e2e/drop.spec.ts
Running 11 tests using 1 worker
  ✓ dropping a file that exists in the session directory pastes its escaped path, echoes it after Enter, and moves focus into the pane (E1, E11, REQ-2, REQ-11) (2.4s)
  ✓ a dropped filename containing a space is pasted backslash-escaped (E2, REQ-4) (808ms)
  ✓ dropping a file with no match anywhere on disk shows the not-located notice and pastes nothing (E3) (905ms)
  ✓ dropping a file that matches two identical on-disk copies shows the ambiguous notice with the count (E4) (801ms)
  ✓ shows a transient 'Locating …' notice while the locate request is in flight, then clears it on success (REQ-6) (806ms)
  ✓ dropping a file on the masthead never navigates away and leaves the rail visible (E5, REQ-1) (529ms)
  ✓ dropping text/plain with no files pastes the text verbatim (E6, REQ-10) (733ms)
  ✓ a file over 50 MiB shows the too-large notice and issues no locate request (E7) (801ms)
  ✓ in Tiles, a drop on one live tile pastes only into that tile, leaving the other tile's content unchanged (E8, INV-4) (813ms)
  ✓ a drop on a dead session's surface is swallowed silently — no notice, no request, no navigation (E9, REQ-8) (5.8s)
  ✓ a drop on a live pane whose socket is not open shows the not-connected notice and issues no request (REQ-8) (708ms)
  11 passed (16.0s)

npx playwright test --list
Total: 214 tests in 18 files (no errors, no duplicate titles)

make e2e (run 1 of 3): 214 passed (53.5s)
make e2e (run 2 of 3): 214 passed (53.9s)
make e2e (run 3 of 3): 214 passed (53.8s)
```

## Notes (fix attempt 1)

- Rebuilt with `make web-build build` (in that order) before every run, per the harness
  rules — the E2E harness serves the prebuilt binary/assets and never rebuilds either.
- The Critical's own recommended follow-up (giving `terminal.spec.ts:91`,
  `theme.spec.ts:498`, and `actions.spec.ts:632`/`:728` the explicit 15s timeouts their
  siblings already use) was left untouched, per the fix-wave instructions — it is already
  recorded in `TODO.md` by the orchestrator and belongs to those other plans' specs, not
  this one.
