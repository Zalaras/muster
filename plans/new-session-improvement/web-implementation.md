# Web Implementation: New Session Improvement

**Plan**: new-session-improvement
**Mode**: initial
**Pack**: kb pack 11786 words (budget 8000, WARN exceeds) — sections rules 1053 · features 1943 · diagrams 0 · decisions 4066 · proposed 0 · facts 2088 · lessons 2628 · runbooks 2

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/api.ts` | edited | `permissionModeToCheck`'s fallback changed from `"default"` to `"auto"` (REQ-5, W4); doc comment rewritten and its caller list extended to `launch-restore.ts`. |
| `web/src/features/launch-restore.ts` | created | Pure `initialRestore(touched, repo)` (REQ-6a, W5) and `openFallback(outcome)` (REQ-6b/c, W6), plus the `Touched`/`Restore`/`NavigateOutcome`/`OpenFallback` types. Split out of `launch.ts` so `initOpen` stays a thin dispatch and the decisions are unit-testable without a DOM. |
| `web/src/features/launch.ts` | edited | `touched` state (set on real `change`/`input` events, reset in `resetForm`, never by a programmatic `setModel`/`setPermissionMode`); `navigate()`/`navigateUp()` now return the three-way `NavigateOutcome` instead of `boolean`; `initOpen` rewritten as a thin caller of `openFallback`/`initialRestore` via a new `applyInitialRestore` helper; `resetForm` defaults the mode via `setPermissionMode(null)` (one source of truth, REQ-5); the recent-click handler checks `outcome === "ok"` instead of a boolean; `initLaunch`'s `deps` gains `surfaces: { focusSelected(id): void }`; `onLaunched` now calls `app.focus(id)` before `app.render()` in Focus (REQ-7, the #41 fix) and calls `deps.surfaces.focusSelected(id)` last in both views (REQ-7/REQ-8), after the render/promote that mounts the surface. |
| `web/src/main.ts` | edited | One-line registration change: `initLaunch(app, { tiles, surfaces })` — `surfaces` is already a real value at this point in init order (constructed at line 57, `initLaunch` called at line 81). |
| `web/index.html` | edited | The launch form's static `checked` moved from the `manual` (`default`) permission-mode radio to `auto` (REQ-5), so the form never flashes manual before its first `resetForm()`. |
| `web/src/terminal/pane.ts` | edited | `TerminalSurface.focus()`'s doc comment updated — it previously claimed rail.ts's pointer-click was its only caller path through `focusSelected`; that became false once `launch.ts` also calls it after a launch, so the comment now names both callers (comments-are-part-of-the-gate). |

## Decisions

- REQ-1 through REQ-9 (the daemon-side model-catalog check, `BuildArgv`'s explicit flag)
  are daemon-impl's; not web-impl's to implement or report on. Confirmed present on
  `main` before I started (`internal/claudecode/modelcheck.go`,
  `internal/claudecode/launch.go`, `internal/server/sessions.go`,
  `internal/server/server.go` — commit `deee788`), and the E2E smoke run against it
  (below) exercises REQ-1/REQ-2/REQ-3/INV-1 successfully end to end.
- REQ-5, REQ-6, REQ-7, REQ-8 — every web-side REQ this plan lists — are implemented, in
  Changes above.
- design: `applyInitialRestore`/`initOpen`'s split follows the plan's own Affected Files
  direction verbatim (a new pure module beside `launch.ts`, called from a thin `initOpen`)
  and the existing precedent in this same file — `navigate()`/`renderAll()` already follow
  a "one door, dumb caller" shape (module header comment: "`navigate(path)` is the one
  door"). No grep for an existing "restore decision" helper was needed; the plan named the
  exact seam.
- design: `touched: Touched` is closure state private to `initLaunchModal`, written only
  from the three real DOM listeners added at the bottom of that function and read only by
  `applyInitialRestore` — one writer set (the listeners), one reader, matching this file's
  existing pattern for `current`/`repos`/`reposErrorPersistent` (module header comment:
  "The picker's whole state").
- design: `deps.surfaces` in `initLaunch` is typed structurally (`{ focusSelected(id):
  void }`), matching `deps.tiles: { promote(id): void }` immediately above it and the
  file's own W6/INV-4 comment ("structural, not a sibling import ... from the tiles
  module") — extended verbatim to `surfaces`.
- `web/src/features/launch.ts` is now 573 lines (file-length warning, threshold 500) — it
  was already 519 lines and already over threshold before this plan (`git show
  HEAD:web/src/features/launch.ts | wc -l` → 519). The plan's own Affected Files direction
  is what keeps the growth to ~54 lines despite adding two new behaviours (REQ-6 touched
  tracking, REQ-7/8 focus wiring): the restore/fallback *decisions* went into the new pure
  `launch-restore.ts` rather than growing this file further. `make size-warn` confirms this
  is a warning, not a failure; not split further since Biome's own complexity gate
  (`initOpen`, the function the plan specifically flagged) is satisfied by the same split.
- No new runtime dependency added.
- No `any` in any new or touched web code (`npx tsc --noEmit` clean under the existing
  strict flags; grepped `git diff -- '*.ts' | grep -n ': any\|<any>\|as any'` → no hits).

## E2E smoke run (plan's own specs, per the hard-gate instructions)

`make web-build build` (project root) then, from `web/`:

```
npx playwright test e2e/launch-model-check.spec.ts e2e/launch-opens-session.spec.ts \
  e2e/launch-defaults.spec.ts e2e/permission-mode.spec.ts e2e/launch.spec.ts
```

40 passed, 3 failed (all three in `launch-opens-session.spec.ts`; every
`launch-model-check.spec.ts`, `launch-defaults.spec.ts`, `permission-mode.spec.ts` and
`launch.spec.ts` test passed, including the two regression pins e2e-specs ran live at
authoring). Re-ran the 3 failures alone with `--workers=1` — same three, so not a
parallel-run flake.

**The 3 failures are locator/test-setup defects in the newly authored spec, not
implementation bugs** — named here for validate mode per the instructions ("a locator
defect in the spec ... is not yours to edit"):

1. `launching a second session in Focus ... (REQ-7, E5, E6)` (line 32) and `in attention
   sort ... (REQ-7, E8)` (line 160): both launch a first session (`dirA`, from
   `scratchDirectory()` — *not* under the daemon's browse root) via the API helper, then
   open the dialog and immediately look for a second directory (`dirB`/`dirC`, from
   `browseScratchDirectory()` — under the browse root) as a `childEntry`, with no
   intervening navigation. But `initOpen()`'s initial restore has always navigated to the
   *first recent's own directory* first (pre-existing behaviour, unchanged by this plan —
   REQ-5/REQ-6 only change the fallback value and add the touched-guard, never which
   directory the initial navigate targets), so the listing shown is `dirA`'s own (empty)
   children, and `dirB`/`dirC` never appear — the test times out waiting for them. The
   sibling test two tests earlier (`launching from Tiles with a full grid`) has the same
   shape and gets this right: it clicks `crumbButton(dialog,
   basename(daemon.browseRoot))` to go back up to the root before descending into
   `target`. The two broken tests need the same up-then-down navigation (or a directory
   layout where the second directory is reachable without it).
   - Verified the implementation itself is correct: copied
     `launching a second session in Focus...` into a scratch spec, changed only `dirB` to
     be created as a child of `dirA` (`mkdtemp(join(dirA.path, prefix))`) so no navigation
     fix was needed, ran it (`npx playwright test ... --workers=1`) — 1 passed, including
     the keyboard-focus assertions across the 1.2s `settleFor` and the round-trip
     keystroke. Deleted the scratch file afterward (never part of the tree or a commit;
     `git status --short web/e2e/` is empty).
2. `launching from Tiles with a full grid ... (REQ-8, E7)` (line 80):
   `page.getByRole("button", { name: "Tiles" })` (no `exact: true`) is a case-insensitive
   *substring* match by default, and one of the four seeded session titles is
   `opens-tiles-seed-1` — its rename button's accessible name also contains "tiles", so
   Playwright reports a strict-mode violation with two matches before the view switcher's
   own "Tiles" button can be clicked. Needs either `exact: true` or a locator scoped to
   the view-switcher `group` (`page.getByRole("group", { name: "View"
   }).getByRole("button", { name: "Tiles" })`, matching how `views.spec.ts` does this
   elsewhere). The Tiles/free-slot test three lines below it (which seeds no session
   titled with "tiles" in it) passed cleanly using the same unscoped locator, confirming
   this is the seed-title collision and not a broader issue with that locator pattern.

None of the three point at a defect in `app.focus`, `deps.surfaces.focusSelected`,
`tiles.promote`, or the render-phase-6 default-focus guard — REQ-7/REQ-8's actual
behaviour is exercised successfully by the passing `launching from Tiles with a free
slot...` test (identical `focusSelected` call path) and by the scratch verification run
above.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0.

No test files needed an import fix (none of my renames/moves touched a symbol any test
file imports by path).

Test files needing changes I was not allowed to make:
- `web/src/api.test.ts` — its `permissionModeToCheck` describe block (lines ~80-94)
  asserts `"default"` for the future-mode/`null`/`""` cases; REQ-5 makes the real fallback
  `"auto"`. This is the plan's own named W4 change (Affected Files > Web tests), sanctioned
  breakage for web-tests, not mine to edit.
- `web/e2e/launch-opens-session.spec.ts` — the 3 locator/navigation defects above, named
  for validate mode. Not test-body edits I'm permitted to make (Constraints: import-line
  fixes only), and these aren't import breakage — they're assertion/locator-strategy
  defects in test bodies.

## Doc Delta

No web-side departure from the plan's stated Doc Delta. Everything under "**launch** —
becomes true" / "**focus** — becomes true" / "**tiles** — becomes true" that names web
behaviour (the auto fallback + touched restore, the explicit flag's UI-visible effect via
E2E, `launch-opens-launched-session`) is implemented exactly as specced above — no
additional doc-delta line needed from this side.

## Fix Attempt — review cycle 1

**Failures addressed**: maintainability Major 2, Major 3, Minor 1, Minor 2, Minor 4, and
orchestrator-forwarded Note 10 (all `[web-impl]`).

### Major 2 — `focusSession` duplicated in `launch.ts`

`focus.ts`'s `focusSession` (the shared tail of `nth`/`neediest`) is now exported on
`FocusHandle` as `bringForward(session: Session): void` — same body, renamed to describe
what it does rather than who used to call it. `launch.ts`'s `onLaunched` no longer branches
on `app.state.view` itself; it calls `deps.focus.bringForward(session)`. `initLaunch`'s
`deps` type dropped `tiles: { promote(id) }` (no longer needed — `focus.bringForward`
reaches Tiles' promote internally via its own `deps.promoteTile`) and gained
`focus: { bringForward(session): void }`, still structurally typed (no import of
`./focus`, per `web/src/features/CLAUDE.md` invariant 2). `main.ts`'s one registration
line changed: `initLaunch(app, { tiles, surfaces })` → `initLaunch(app, { focus, surfaces
})` — `focus` is already constructed above that line in init order, so this is a real
value, not a thunk.

Re-ran the reviewer's own repro after the fix:
```
$ rg -n -B1 -A4 'app\.state\.view === "(tiles|focus)"' web/src/features/launch.ts web/src/features/focus.ts
web/src/features/focus.ts-108-  function bringForward(session: Session): void {
web/src/features/focus.ts:109:    if (app.state.view === "focus") {
web/src/features/focus.ts-110-      app.focus(session.id);
web/src/features/focus.ts-111-      app.render();
web/src/features/focus.ts-112-    } else {
web/src/features/focus.ts-113-      deps.promoteTile(session.id);
```
`launch.ts` no longer matches this grep at all — the view-branch now has exactly one
copy, in `focus.ts`.

### Major 3 — `launch-restore.ts` in the wrong directory

Moved the module to `web/src/render/launchrestore.ts` (no hyphen — matches every other
filename under `web/src`, closing the `kb:adr/process-one-name-per-feature` mismatch the
review named). `web/src/features/launch-restore.ts` deleted.

Grep for precedent (asked for by § Design "Reuse before add", which the maintainability
Major 3 cited as missing from the original `design:` line):
```
$ rg -n 'from "\./' web/src/features --glob '!*.test.ts'
web/src/features/launch.ts:30:import { initialRestore, openFallback, type NavigateOutcome, type Touched } from "./launch-restore";
```
That one hit is the file being moved. Two siblings already put a controller's pure
decision under `render/`, both called directly by their one controller, same relationship
`launch.ts` has to this module:
- `web/src/render/crumbs.ts` — `splitCrumbs`, launch's own existing pure helper, called
  only from `features/launch.ts`.
- `web/src/render/focusrestore.ts` — "pure focus-restore decision" (its own header says
  "No DOM here"), called only from `features/connection.ts`.

`render/CLAUDE.md`'s "Owns" line already lists `launch` under Features (because of
`crumbs.ts`), so no CLAUDE.md edit was needed. `web/src/features/launch.ts`'s import
became `from "../render/launchrestore"`.

### Minor 1 — `openFallback` was a same-shaped relabel

Removed the exported `openFallback` function. `initOpen` now switches on `navigate()`'s
`NavigateOutcome` directly (`"ok"` → `applyInitialRestore`, `"failed"` → browse-root
fallback, `"superseded"`/default → nothing) — the exact same three-way branch `initOpen`
already had to write against `openFallback`'s return value, just with one fewer
indirection. `NavigateOutcome` itself stays exported from `render/launchrestore.ts` (it's
`navigate()`'s real return type, used at two call sites in `launch.ts`, not a relabel of
anything).

**W5/W6 testability**: `web/src/features/launch-restore.test.ts` (not mine to edit —
Constraints) imports `initialRestore, openFallback, type NavigateOutcome, type Touched`
from the module. I repointed the import path only (`./launch-restore` →
`../render/launchrestore`, the one correction the import-path exception allows). The
`describe("initialRestore (W5, REQ-6a)", …)` block (8 cases, REQ-6a's exhaustive
touched-combination coverage) still passes unchanged — `initialRestore`'s signature and
behaviour are untouched. The `describe("openFallback (W6, REQ-6b/c)", …)` block (3 cases)
now fails to compile (`TS2305: Module '"../render/launchrestore"' has no exported member
'openFallback'`) because the function it names no longer exists — sanctioned breakage,
named below in Handoff for web-tests wave 2 to fold into `initOpen`'s own coverage (REQ-6b/c
is still exercised behaviourally; only the removed pure function's direct unit test is
gone).

### Minor 2 — repo restore values computed in two places

Added `repoRestore(repo: Repo): { model: string; mode: PermissionMode }` to
`render/launchrestore.ts` — the one owner of "what would this repo's directory restore
to". `initialRestore` now calls it and applies the `touched` filter; the recent-click
handler in `launch.ts` (`buildRecentButton`'s click listener) now calls it directly and
applies both fields unconditionally (REQ-6's "always restores, touched or not").  Also
added `DEFAULT_MODEL = "sonnet"` (same module) as the one owner of the bare fallback
literal; `resetForm` (`launch.ts`) now calls `setModel(DEFAULT_MODEL)` instead of
`setModel("sonnet")`. Swept for every remaining literal:
```
$ grep -n '"sonnet"' web/src/features/launch.ts web/src/render/launchrestore.ts
web/src/features/launch.ts:38:const MODEL_PRESETS = ["sonnet", "opus", "haiku", "fable"] as const;
web/src/render/launchrestore.ts:10:export const DEFAULT_MODEL = "sonnet";
```
The one remaining literal is `MODEL_PRESETS`, the radio-button preset list — a different
concept (what the dialog offers), not a restore fallback; left alone.

### Minor 4 / Note 10 — `api.ts` filelen and its stale comment

`api.ts` is a pre-existing 500+-line file (776 lines before this fix, 777 after cycle 1's
first pass); this fix wave's only touch to it is the one doc comment above
`permissionModeToCheck`, which I also rewrote per the forwarded Note 10 — it began
"Plan fix-auto-mode-select REQ-6, fallback changed by plan new-session-improvement REQ-5",
narrating two plans' history instead of stating the current fallback rule; it now opens
"The single decision point for..." and its caller list was updated from
`features/launch-restore.ts`'s `initialRestore` to `render/launchrestore.ts`'s
`repoRestore` (the actual caller after Minor 2's fix). No split: the file predates this
plan and this plan's own net change to it is a few comment lines, not new logic; splitting
it is out of scope for a maintainability fix wave and would touch unrelated exports.

### Blast radius measured

```
$ cd web && npx tsc --noEmit
src/features/launch-restore.test.ts(5,3): error TS2305: Module '"../render/launchrestore"' has no exported member 'openFallback'.
```
Only the one sanctioned break. Confirmed by excluding that file and type-checking
everything else (including every other test file) with zero errors:
```
$ npx tsc --noEmit -p <tsconfig extending tsconfig.json, excluding only launch-restore.test.ts>
(no output — clean)
```
```
$ npx vite build   # production bundle only, no test files in its graph
✓ built in 1.69s
```
```
$ npx vitest run
Test Files  1 failed | 44 passed (45)
Tests  3 failed | 1830 passed (1833)
```
The 3 failures are exactly `openFallback`'s three cases; `initialRestore`'s 8 cases in the
same file pass unchanged, confirming `repoRestore`'s extraction preserved behaviour. No
other test file, in `web/src` or `web/e2e`, imports anything this fix wave moved or
removed:
```
$ grep -rn "launch-restore\|openFallback\|focusSession" web/src web/e2e --include="*.ts" | grep "\.test\.ts\|\.spec\.ts"
web/src/features/launch-restore.test.ts:3:import { ... openFallback ... } from "../render/launchrestore";
web/src/features/launch-restore.test.ts:79:describe("openFallback (W6, REQ-6b/c)", () => {
web/src/features/launch-restore.test.ts:84:    (outcome, expected) => {
```
(the third hit is the `%s`/`(outcome, expected)` describe-table line, not a second
reference — `web/e2e` has no hits at all).

Also ran `npm run -s lint` (Biome) clean, and `make size-warn` from the project root
— `api.ts` filelen (776→777) and `launch.ts` filelen (573→582, from `bringForward`'s
longer name and doc comments) are both unchanged-in-kind pre-existing warnings, reasons
recorded above and in the original Decisions.

## Decisions (fix attempt — review cycle 1)

- `deviation:` none. All five issues fixed as the review's "a fix must make this true"
  bars describe; no plan-level behaviour changed.
- design: `render/launchrestore.ts` is the pure-decision home for launch's open-time
  restore, alongside `render/crumbs.ts` and `render/focusrestore.ts` (grep above found no
  other candidate). Its state (`Touched`) has one writer, `launch.ts`'s own DOM listeners
  and `resetForm` — unchanged from the original design, just relocated.
- design: `FocusHandle.bringForward` is now the one owner of "bring a session forward in
  the current view"; its state touch (`app.state.focusedId` via `app.focus`) already had
  one writer (`app.focus` itself) before this fix — this fix only removed the second
  *caller path* that duplicated the decision of which branch to take, not a second writer
  of state.
- No new `doc-delta:` beyond what cycle 1's initial pass already recorded — this wave is
  an internal refactor (module location, dedup, comment wording), not a behaviour change,
  so `docs/features/*/spec.md` and `docs/protocol.md` need nothing new. One correction:
  `docs/features/launch/spec.md:10`'s `web:` glob (`web/src/features/launch.ts,
  web/src/render/crumbs*.ts`) predates this file's move and doesn't cover
  `web/src/render/launchrestore*.ts` (review-maintainability cycle 1 Note 9, filed against
  the old `features/launch-restore.ts` path but the same gap applies to the new one) —
  `doc-reconcile` should add that glob entry.

## Handoff (fix attempt — review cycle 1)

**Build status**: NOT BUILDING as a whole tree — `npx tsc --noEmit` fails on exactly one
file, `web/src/features/launch-restore.test.ts`, for the reason above (sanctioned
breakage, not an import-path defect I can repair without editing test assertions). Every
other file compiles: `npx vite build` (production bundle, excludes all `*.test.ts`) exits
0, and excluding only that one test file from `tsc --noEmit` leaves zero errors across the
rest of the tree, including every other test file.

Test file needing changes I was not allowed to make:
- `web/src/features/launch-restore.test.ts` — its `describe("openFallback (W6,
  REQ-6b/c)", …)` block (3 `it.each` cases, lines ~76-90) asserts against a function that
  no longer exists (Minor 1's fix). The `describe("initialRestore (W5, REQ-6a)", …)` block
  (8 cases) is untouched and still passes. For web-tests wave 2: either fold REQ-6b/c's
  three outcome→action cases into a behavioural test of `initOpen`/`navigate` (there is no
  pure function left to unit-test the mapping in isolation — `initOpen` itself is the only
  place it now lives, and it's not exported), or, if a pure seam is still wanted for this,
  that is a new design call for that agent to make and report, not a restoration of
  `openFallback`. I already repointed the file's import statement
  (`./launch-restore` → `../render/launchrestore`) — the one correction allowed under
  Constraints.

## Fix Attempt — review cycle 2

**Issue addressed**: Maintainability review (`review.maintainability.md`) Minor 1 —
`NavigateOutcome` declared in `web/src/render/launchrestore.ts:53` but never produced or
consumed there; its producer/consumers are all in `web/src/features/launch.ts`. Also
forwarded: maintainability Note 2, rewrite the listed web comments that cite review
findings/cycle numbers or narrate a removed function.

**Changes made**:
- `web/src/render/launchrestore.ts` — removed the `NavigateOutcome` type and its doc
  comment entirely (`:49-53` before this fix). The module now exports only `DEFAULT_MODEL`,
  `Touched`, `Restore`, `repoRestore`, `initialRestore` — every one of which appears in an
  exported function signature in this same module, matching `crumbs.ts`/`focusrestore.ts`.
- `web/src/features/launch.ts` — removed `type NavigateOutcome` from the `../render/
  launchrestore` import; declared `type NavigateOutcome = "ok" | "failed" | "superseded"`
  as a local `type` inside `initLaunchModal`, immediately above `navigate()` (its producer)
  and above `navigateUp`/`initOpen` (its only consumers, both closures in the same
  function). `grep -n "NavigateOutcome" web/src web/e2e` before the change showed exactly
  those three use sites plus the `launchrestore.ts` declaration — nothing outside
  `launch.ts` references the type, so a local (non-exported) declaration is sufficient; no
  test file imports it (`grep -n "NavigateOutcome" web/src/**/*.test.ts` → no matches).
- Rewrote every comment Note 2 named in web files, stating current behaviour instead of
  citing review cycle/finding numbers or narrating a removed function:
  - `web/src/features/focus.ts:63-66` (`bringForward` doc on `FocusHandle`)
  - `web/src/features/launch.ts:178-180` (Recent-click restore comment)
  - `web/src/features/launch.ts:344-347` (`initOpen` doc — also no longer narrates the
    removed `openFallback` helper)
  - `web/src/features/launch.ts:566-569` (`onLaunched`'s `bringForward` call comment)
  - `web/src/render/launchrestore.ts:1-5` (module header, "review-maintainability cycle 1
    Major 3" → states the placement rule directly)
  - `web/src/render/launchrestore.ts:29-30` (`repoRestore` doc, "cycle 1 Minor 2" dropped)
  - `web/src/render/launchrestore.ts:49-52` (removed outright along with the type it
    documented, per Minor 1 above)
  - Swept the whole tree for anything else this branch might have left behind:
    `grep -rn "review-maintainability\|cycle 1\|openFallback" web/src --include='*.ts' |
    grep -v '\.test\.ts'` after the edits shows only pre-existing citations in files this
    plan never touched (`theme.ts`, `reader.ts`, `views.ts`, `shellkeys.ts`, `masthead.ts`,
    `pane.ts`, `diagrams.ts`, `diagramdialog.ts` — all from other plans' cycle-1 reviews),
    which Note 2 says to leave alone.
- No markup/behaviour change: `NavigateOutcome`'s three string values, its producer and its
  two consumers are unchanged — only its declaration site and doc-comment wording moved.

**Decisions**: No new `deviation:` or `doc-delta:` line. This is a pure refactor (type
relocation, comment rewording) with no behavioural or protocol surface — `docs/features/
launch/spec.md` and `docs/protocol.md` need nothing new beyond what earlier waves already
staged.

**Verification**:
- `npx tsc --noEmit` — exit 0, no output.
- `make web-build` — `vite build` exits 0 (`✓ built in 1.56s`); only the pre-existing
  unrelated chunk-size advisory (`elk-*.js` etc.), not an error.
- `make web-test` — 45 files / 1837 tests, all passed.
- `make web-lint` — `Checked 184 files in 180ms. No fixes applied.`

## Fix Attempt — review cycle 3

**Failures addressed**: Correctness review (review.code.md), Minor 1 — the `NavigateOutcome`
doc comment (`web/src/features/launch.ts:285-287`) claimed both `initOpen` and `navigateUp`
"switch on this directly (REQ-6b/c)". Only `initOpen` switches on it; `navigateUp`
(`:320-325`) just returns `navigate()`'s result unexamined, and its one consumer that reads
the value (the ArrowLeft handler, `:483-484`) only checks `result !== null` — it doesn't
switch on the three-way outcome either. `navigateUp` is REQ-15's, not REQ-6's.

**Changes made**: Reworded the comment at `web/src/features/launch.ts:285-287` to
"`initOpen` switches on this directly (REQ-6b/c); `navigateUp` passes it through." No code
change — comment-only.

**Decisions**: No new `deviation:` or `doc-delta:` line — this is a comment-accuracy fix with
no behavioural, protocol, or doc-claim surface.

**Verification**:
- `make web-build` — exit 0 (`✓ built in 1.62s`, only the pre-existing chunk-size advisory).
- `make web-lint` — `Checked 184 files in 183ms. No fixes applied.`
