# Web Implementation: New Session Dialog

**Plan**: new-session-dialog
**Mode**: fix (attempt 2)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/render/crumbs.ts` | created | Pure `splitCrumbs(path)` (root-first ancestor chain, trailing-slash tolerant) + tiny DOM `renderCrumbs(nav, crumbs, onNavigate)` that draws ancestor `<button data-path>`s + the `<span aria-current>` + the decorative `⌘↑` kbd. |
| `web/src/render/launch.ts` | rewritten | Picker rebuild: `current: BrowseResult \| null` is the single source of truth (readout/crumbs/submit all derive from it — INV-1 by construction); `navigate(path)` is the one door (child/crumb/⌘↑/recent/open), with a request-counter stale-response guard (W8) and INV-3-preserving failure handling (only the listing reverts, crumbs/footer/recents are never touched on a failed browse); `MODEL_PRESETS` gains `fable`; recents render pressed/branch by deriving from `current.path` against the served `Repo[]`, never stored separately; ⌘↑ and listing arrow-key/Enter/→ traversal added (REQ-6, REQ-15). |
| `web/index.html` | edited | `#launch-dialog` rewritten to the mockup's sidebar+breadcrumb+segmented-form structure; removed `#browse-button`/`#browse-panel`/`#browse-path`/`#browse-up`/`#use-this-folder`/`#selected-directory`/`.radios` fieldsets; `#mru-entry-template` reshaped to the sidebar entry (`.dir-name` + `.dir-meta` › `.dir-branch`/`.dir-age`); `#subdir-entry-template` reshaped to the `.entry` shape (`.nm` + `.chev`, with an inserted `.git` span for git checkouts). |
| `web/src/main.ts` | edited | `launchModalElements` wiring updated to the new element set (`recentsList`, `recentEntryTemplate`, `crumbsNav`, `browseDirs`, `entryTemplate`, `launchTargetPath`, `launchTargetBranch`); dropped the removed browse/selected-directory fields. |
| `web/src/style.css` | edited | Replaced the old `.picker`/`.browse-*`/`.subdir`/`fieldset.radios`/`.field-row` block with the mockup's `.picker`/`.recents`/`.browse`/`.crumbs`/`.entries`/`.fields`/`fieldset.seg`/`.seg-track`/`#launch-target` rules (tokens only); added `#launch-dialog.modal{width:720px}` (id beats the shared `dialog.modal`/`dialog.confirm` classes, so confirm dialogs keep 440px); added `.kbd` and `dialog.modal h2{display:flex;align-items:center}` for the `⌘N`/`⌘↑` decorative kbds; added `#launch-target .branch[hidden]{display:none}` compensating rule. |

## Decisions

- **Branch display (REQ-17) is derived from path equality against the served `Repo[]`, not tracked as "came from a recent click".** This mirrors the plan's own instruction that pressed-state is "derived, not stored" (Implementation Notes) — implementing branch the same way keeps `current`+`repos` the only state and avoids a third parallel flag. Consequence: if a crumb/child navigation happens to land on a path that matches a recent, the footer will also show that recent's branch (not just the pressed mark) — not explicitly required by REQ-17 but not prohibited either, and consistent with the plan's own derivation philosophy.
- **REQ-16's "loading…" only replaces the listing region, never the crumbs/footer.** The plan says only "the child listing shows loading…"; keeping crumbs/footer frozen during an in-flight request means `navigate()`'s failure path only needs to re-render the listing to restore INV-3, not the whole picker — simpler and provably correct by construction (crumbs/footer/recents are literally untouched by a failed request, not merely re-rendered to the same values).
- **Precedent followed**: `elements.recentsList.replaceChildren(...)` / `elements.browseDirs.replaceChildren(...)` on every navigation is the same per-navigation full-rebuild pattern the pre-rebuild `launch.ts` already used (`renderMruList`/`renderBrowse` both did `replaceChildren` on every load). This is a user-action-triggered re-render, not a periodic tick, so the render-tick node-reuse rule (main.ts's 1s loop / `pendingTileFocus`) doesn't apply here — grepped for it, found no launch-dialog precedent needing reuse since focus is not expected to survive a navigation (a navigation changes the entries entirely).
- **`#subdir-entry-template` keeps its original id** (only its internal shape changes to `.entry`/`.nm`/`.chev`) — the plan's Affected Files wording ("replace `#subdir-entry-template` with the `.entry` shape") describes the template's *content*, and no Testable UI Element or test references the template's id itself, only the rendered button's role/name.
- **Kbd hints (`⌘N`, `⌘↑`) render only when a browse pane exists.** `updateCrumbs()` renders nothing (no kbd either) while `current` is null (the "no data yet"/daemon-down state) — simplest reading of the honesty rule ("never render a fake path") extended to the decorative hint that references it; not separately tested, low risk either way.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0.

No test files needed changes — `web/e2e/launch.spec.ts` and `web/e2e/tiles-launch.spec.ts` were already rewritten by e2e-specs against this exact plan/mockup and needed no import fixes. `npx vitest run` (549 existing tests) passes unchanged; no existing unit test touched `render/launch.ts` or `render/crumbs.ts` internals, so `web-tests` has a clean slate to add `crumbs.test.ts` for `splitCrumbs` (W2).

## Fix Attempt 1

**Failures addressed**: `a failed GET /api/repos shows the error and renders the sidebar
empty-state (REQ-13)` — `web/e2e/launch.spec.ts:558`. `navigate()`'s success path
unconditionally called `clearError()`, so the repos-fetch error set moments earlier in
`initOpen()` was wiped out by the same open sequence's own browse-root fallback
navigation, every time.

**Changes made** (`web/src/render/launch.ts`):

- Added `reposErrorPersistent` (a private flag alongside `current`/`repos`) tracking
  whether the error currently shown in `#launch-error` is the "repos unavailable" kind —
  the one kind of error this dialog has no fix-it action for (nothing re-fetches repos
  mid-open).
- Split `showError` into two: the existing `showError(message)` (sets
  `reposErrorPersistent = false` — used by browse failures and by `submit()`'s
  validation/launch-failure paths, unchanged from before) and a new
  `showReposError(message)` (sets `reposErrorPersistent = true`) used only at
  `initOpen()`'s `fetchRepos()` failure branch (was `showError`, now `showReposError`).
- `clearError()` now also resets `reposErrorPersistent = false` (used by `resetForm()`
  and `initOpen()`'s repos-success branch, both unconditional as before — neither runs
  while a repos error is live).
- `navigate()`'s success path changed from an unconditional `clearError()` to
  `if (!reposErrorPersistent) clearError();`. This is the single call site that could
  reach the defect (verified by `grep -n "clearError\|showError"
  web/src/render/launch.ts` before the fix: the only three `clearError()` call sites are
  `navigate()`'s success path, `initOpen()`'s repos-success branch, and `resetForm()` —
  the latter two never run while a repos error is showing, so `navigate()`'s was the only
  door that needed closing).

**Category swept, not just the reported branch**: every path that can reach
`navigate()`'s success branch while a repos error is showing is now covered by the same
guard, because the guard lives at the one shared choke point (`navigate()`'s success
path) rather than at each caller:
  - `initOpen()`'s own `await navigate(undefined)` fallback right after a repos failure
    (the reported case, `repos = []` so the `if (first)` block is skipped entirely).
  - `initOpen()`'s edge-case-2 fallback (`await navigate(undefined)` after a *first
    recent's* browse 404) — not reachable with a live repos error since that branch only
    runs when `reposResult.ok` was true, but exercised by the same guard code path
    regardless.
  - Any user-initiated navigate (child click, crumb click, ⌘↑, recent click) issued while
    a repos error is still visible (e.g. the user clicks a listed child before the repos
    error has been dismissed) — all funnel through the same `navigate()` success branch,
    so all are covered without enumerating them individually.

Edge case 2 (a *browse* error, including validation/launch errors) is preserved: those
call plain `showError`, which resets `reposErrorPersistent` to `false`, so the very next
successful `navigate()` still clears them — confirmed by rerunning the existing E12 test
below.

**Verification**:
- `npx tsc --noEmit && npm run build` — exit 0.
- `npx playwright test e2e/launch.spec.ts` — 20/20 passed, including the previously
  failing REQ-13 test and the E12 edge-case-2 regression test (`a browse 404 shows the
  daemon's error and leaves crumbs, listing, Launch in and the pressed recent unchanged`,
  whose final assertion — a later successful navigation clears the error — still passes).
- `npx playwright test e2e/tiles-launch.spec.ts` — 3/3 passed.
- `npx vitest run` — 558/558 passed (unchanged; no unit test imports `render/launch.ts`
  internals).
- Full suite `npx playwright test` from `web/` — 151/151 passed (up from 150 passed/1
  failed before the fix), no other spec regressed.

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0.

## Fix Attempt 2

**Failures addressed**:
- E2E implementation bug (test-specs.md): `the dialog's bounding height is unchanged
  after open, a child click, a crumb click and a recent click, even with an overflowing
  listing (INV-4, E13)` — `#browse-dirs` never actually scrolled internally; it grew to
  fit all 25 entries and painted over the form rows and Launch/Cancel buttons below.
- review.md Minor 1 (`[web-impl]`): listing keyboard traversal (REQ-15) is one-shot —
  focus is lost to `<body>` after the first ArrowRight descend, so a following
  ArrowDown/ArrowUp/ArrowLeft do nothing.
- review.md Minor 2 (`[web-impl]`): on a deep path the breadcrumb's current-directory
  segment and the `⌘↑` hint are scrolled out of view on open (`scrollLeft` rests at 0).

**Changes made**:

- `web/src/style.css` — the category named in the bug report is "grid items inside the
  fixed 300px `.picker`", which has exactly two: `.browse` and `.recents`. Both lacked
  `min-height: 0`, so both are one-line omissions from the stylesheet's own established
  pattern (14 other `min-height: 0` rules already exist for exactly this reason). Fixed
  both:
  - `.browse` (the flex-column holding `.crumbs` + `#browse-dirs`) — this was the bug's
    cited root cause; without the clamp, `.entries`'s `flex: 1; overflow: auto` had no
    finite height to fill against, so it never clipped.
  - `.recents` (the sidebar, the picker's other grid item, itself `overflow: auto` with
    no intermediate flex child) — same defect class: as a grid item with implicit
    `min-height: auto`, a long recents list would grow the row past 300px exactly like
    `.browse` did, even though no test happened to build a long-enough recents list to
    catch it. Closed pre-emptively per the bug's own instruction to close every door in
    the category, not just the cited one.
  - No other descendant of `.picker` is a grid item (`.crumbs`, `.entries`, `.recents
    .dir` are flex children of `.browse`/`.recents`, not of the grid itself), so these
    two are the complete set.

- `web/src/render/launch.ts` — REQ-15 traversal continuity:
  - `navigateUp()` now returns `Promise<boolean>` (was `void`, fire-and-forget) so callers
    can chain onto its settlement; its one call site inside itself now `return`s
    `navigate(...)` instead of `void`-ing it, and its two existing callers were updated
    (the window-level `⌘↑` handler now does `void navigateUp();`; the listing's `ArrowLeft`
    case now chains a focus restore, below).
  - Added `focusFirstEntry()`: focuses `#browse-dirs`'s first `button.entry`, a no-op if
    the new listing is empty (`renderListing()`'s "No subdirectories" state renders no
    button, so there is nothing to focus — an acceptable dead end since the category is
    then genuinely empty, not "list exists but focus was lost").
  - The listing `keydown` handler's `ArrowRight` case no longer relies on
    `document.activeElement?.click()` (whose fired click handler's own `navigate()`
    promise wasn't reachable from here to chain onto); it now reads the target directory
    directly off `current.dirs[activeIndex]` and calls `navigate(dir.path)` itself, then
    chains `.then(() => focusFirstEntry())`.
  - The `ArrowLeft` case chains the same `.then(() => focusFirstEntry())` onto
    `navigateUp()`.
  - Every code path that reaches the "focus lost after a listing-driven navigation"
    defect is a call into `navigate()` (directly or via `navigateUp()`) made from
    `#browse-dirs`'s own `keydown` handler — there are exactly two (`ArrowRight`,
    `ArrowLeft`); both now chain `focusFirstEntry()` onto the navigation's settlement.
    `ArrowUp`/`ArrowDown` never call `navigate()` (they only move focus among the
    listing's existing, unchanged buttons), so they were never affected and needed no
    change. The window-level `⌘↑` handler and a direct crumb/recent click *also* call
    `navigate()`/`navigateUp()`, but those aren't "listing keyboard traversal" (the
    finding's scope, and REQ-15's literal wording: "with focus on a child entry") — a
    mouse click or a global shortcut has no listing-button focus to restore, so they were
    deliberately left un-chained.

- `web/src/render/crumbs.ts` — `renderCrumbs()` now ends with
  `nav.scrollLeft = nav.scrollWidth;`, snapping the bar to its end on every render (both
  the initial open and every subsequent navigation), so the current-directory segment and
  the `⌘↑` hint are what's on screen, not the leading ancestors.

**Verification** (ad hoc Playwright script, run against a real scratch daemon, then
deleted before commit — never added to the tracked `e2e/` suite):

- Issue 1 (overflow): already covered by the existing tracked test, rerun after the fix —
  `npx playwright test e2e/launch.spec.ts` — 21/21 passed, including
  `the dialog's bounding height is unchanged... (INV-4, E13)`, whose own
  `expect.poll(() => el.scrollHeight > el.clientHeight).toBe(true)` now observes `true`
  (previously false per the bug report's own measurement of 650px === 650px).
- Issue 2 (keyboard continuity): a temporary script focused a listing entry, pressed
  ArrowRight (descend), read `document.activeElement` — `{tag: "BUTTON", text: "a-fairly-
  long-segment-name-number-0"}` (first entry of the new listing, not `BODY`); pressed
  ArrowLeft (ascend), read `document.activeElement` — `{tag: "BUTTON", text: "muster-e2e-
  browse-jEXjdc"}` (first entry of the parent listing); then re-descended and pressed
  ArrowDown then ArrowUp — `document.activeElement.tagName` still `"BUTTON"`. Confirms
  traversal survives more than one round-trip, not just the reviewer's one keystroke.
  (First attempt at this script asserted the crumb text synchronously right after the
  keypress and got a false failure — crumbs don't update until `navigate()`'s fetch
  resolves, so a same-tick read still shows the pre-navigation crumb; fixed by awaiting
  the settled crumb text before reading focus, same pattern the tracked E13 test already
  uses for its own "wait for the settled destination" comment.)
- Issue 3 (crumb scroll position): the same script built a 12-segment-deep directory and
  browsed all the way down via child clicks, then read the crumbs `<nav>`'s metrics:
  `{scrollLeft: 3427, scrollWidth: 3945, clientWidth: 518}` — `scrollLeft + clientWidth ===
  scrollWidth`, i.e. scrolled fully to the end (previously `scrollLeft: 0` per the
  reviewer's measurement).
- `npx tsc --noEmit` — exit 0.
- `npm run build` — exit 0 (`tsc --noEmit && vite build`, both stages clean).
- `npx vitest run` — 558/558 passed, unchanged.
- `npx playwright test e2e/launch.spec.ts` — 21/21 passed.
- `npx playwright test e2e/tiles-launch.spec.ts` — 3/3 passed (unaffected surface,
  re-checked since `.picker`/`.browse` styling and `render/launch.ts` are shared with the
  Tiles-launched flow).

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0.

No test files were touched. No new sanctioned breakage.

## Fix Attempt 3

**Failures addressed**:
- review.md Critical 1 (`[web-impl]`): REQ-13's `network` failure mode is unimplemented —
  every function in `web/src/api.ts` calls `fetch` unguarded, so a rejected promise
  (daemon down, connection refused, sleep/wake, aborted request) propagates out of
  `navigate()`/`initOpen()`/`submit()` and is swallowed by their `void` call sites,
  contradicting the module's own header comment ("errors never throw").
- review.md Minor 1 (`[web-impl]`): a no-op ascend (`←` with no parent crumb) re-anchors
  focus anyway, jumping it from the currently-focused entry to the first entry of the
  *unchanged* listing.

**Changes made** (`web/src/api.ts`):

- Added one choke point: `safeFetch(input, init)` wraps `fetch` in `try`/`catch`,
  returning `Response | null` (`null` on a rejected promise), and a `networkError:
  ApiErrorBody` (`code: "network_error"`) alongside the existing `genericError`.
- Every exported function's `fetch` call site was changed to `safeFetch`, each followed
  immediately by `if (!res) return { ok: false, error: networkError };` before any
  existing status/body handling runs.

**Category swept, not just the cited functions**: the finding named `browse`,
`fetchRepos` and `launchSession` as examples but described the defect as a category
("Each does `const res = await fetch(...)` with no `try`/`catch`"). Audited every fetch
call site in the module:

```
$ grep -n "await fetch(\|await safeFetch(" web/src/api.ts
153:    return await fetch(input, init);        # inside safeFetch itself
177:  const res = await safeFetch("/api/sessions", {          # launchSession
189:  const res = await safeFetch("/api/repos", ...            # fetchRepos
198:  const res = await safeFetch(url, ...                     # browse
207:  const res = await safeFetch("/api/prefs", {               # putPrefs
230:  const res = await safeFetch("/api/usage/refresh", ...     # refreshUsage
246:  const res = await safeFetch(`/api/sessions/${id}/end`, ... # endSession
256:  const res = await safeFetch(`/api/sessions/${id}/resume`, ... # resumeSession
266:  const res = await safeFetch(`/api/sessions/${id}`, ...    # removeSession
297:  const res = await safeFetch(`/api/sessions/${id}/pane`, ... # fetchPane
309:  const res = await safeFetch(`/api/sessions/${id}/pin`, {  # pinSession
332:  const res = await safeFetch("/api/sessions/order", {      # putSessionOrder
```

All 11 exported functions are now closed against a rejected fetch — not only the 3 the
finding named. Confirmed `grep -c "await fetch(" web/src/api.ts` (excluding the one
inside `safeFetch` itself) returns 0: no unguarded `fetch` remains in the module. Also
grepped the rest of `web/src` for any other ad hoc `fetch(` reachable from the launch
dialog — none found (`api.ts` is the sole module making HTTP calls; the WS client is a
separate, already-reconnecting module per `docs/conventions.md`).

With this fix, REQ-13's two scenarios both resolve as the plan specifies: a refused
`/api/repos` now reaches `initOpen()`'s `else` branch (`repos = []`,
`showReposError(...)`, `reposLoaded = true`) instead of hanging in `loading…` forever;
a fully-down daemon (both `/api/repos` and the subsequent `/api/browse` calls refused)
now renders the sidebar's `No recent directories` empty state and `#launch-error`, per
the plan's States section, instead of leaving the dialog on "no data yet" forever.

**Changes made** (`web/src/render/launch.ts`):

- `navigateUp()` now returns `Promise<boolean | null>`: `null` when
  `elements.crumbsNav` has no `button[data-path]` (nothing to ascend to — a genuine
  no-op), otherwise the underlying `navigate(...)` result (`true`/`false`, both of which
  already re-render the listing and so lose focus regardless).
- The `ArrowLeft` case in `#browse-dirs`'s `keydown` handler now reads
  `navigateUp().then((result) => { if (result !== null) focusFirstEntry(); })` instead of
  unconditionally chaining `focusFirstEntry()` — so a no-op ascend leaves focus exactly
  where it was.
- The window-level `⌘↑` handler (`void navigateUp();`) never called `focusFirstEntry()`
  in the first place (it doesn't restore listing focus — REQ-6 is dialog-scoped, not
  listing-scoped), so it needed no change; confirmed by `grep -n "navigateUp"
  web/src/render/launch.ts` — exactly these two call sites exist, both accounted for.

**Verification**:
- `npx tsc --noEmit` — exit 0.
- `npm run build` — exit 0 (`tsc --noEmit && vite build`).
- `npx vitest run` — 558/558 passed, unchanged (no unit test imports `api.ts`'s new
  `safeFetch`/`networkError` internals or `launch.ts`'s `navigateUp` internals; the
  existing `api.test.ts` suite mocks the global `fetch`, which `safeFetch` still calls
  with the exact same arguments — verified by rerunning `api.test.ts`'s
  `toHaveBeenCalledWith` assertions, all pass unchanged).
- `make build` — daemon builds cleanly (needed to run the E2E specs below).
- `npx playwright test e2e/launch.spec.ts e2e/tiles-launch.spec.ts` — 26/26 passed,
  including REQ-13's own `a failed GET /api/repos shows the error and renders the
  sidebar empty-state` and the REQ-15 focus-continuity regression test
  (`keyboard traversal: descending and ascending re-anchors focus...`), confirming no
  regression from either change.

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0.

No test files were touched. No new sanctioned breakage.
