# Web Implementation: Markdown viewing

**Plan**: markdown-viewing
**Mode**: initial
**Pack**: `<!-- kb:pack plan=markdown-viewing role=web-impl -->` (features: reader, surfaces, lifecycle, ingest; conventions + 61 decisions + 45 facts + 11 lessons)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/reader/tree.ts` | created | Pure nav-tree logic: `buildTree`, `countFiles`, `filterTree`, `flattenTree` (a depth-tagged flat list, decorated with dirty/current via caller callbacks). |
| `web/src/reader/slug.ts` | created | `headingSlug`, `dedupeIds` — heading-id derivation shared by the outline builder. |
| `web/src/reader/memory.ts` | created | Browser-side "last open file / acknowledged writes" memory over a `Storage`-like interface, keyed `muster.reader.<id>`; every access try/caught. |
| `web/src/reader/freshness.ts` | created | `changedText(writtenAt, now)` → `changed <age> ago`, reusing `sessions/format.ts`'s `formatAge`. |
| `web/src/reader/markdown.ts` | created | `renderMarkdown`: marked (GFM) → DOMPurify `RETURN_DOM_FRAGMENT` → heading ids assigned during the same walk that builds the outline. |
| `web/src/reader/CLAUDE.md` | created | Hand-written head for the new package, sibling-package shape. |
| `web/src/render/reader.ts` | created | DOM builder/updater for the one reader component (bar, notice, plan slot, tree, outline, body, scroll-spy). Tree/outline rebuild only when a content signature changes, so the 1s tick never steals focus from the filter box or a tree/outline button. |
| `web/src/features/reader.ts` | created | `initReader`/`ReaderInstance`: mount/dispose diff over docs-selected sessions (dashboard) or one fixed session (standalone `doc.ts`); owns the two HTTP fetches, `docChanged`/`snapshot`/window-`focus` subscriptions, and memory read/write. |
| `web/doc.html` | created | Pop-out page: same theme-hint script + stylesheet as `index.html`, `#reader-host`, the reader template, `src/doc.ts`. |
| `web/src/doc.ts` | created | Pop-out composition root: parses `?session=&path=`, builds `App`+`WsClient`, calls `initReader` in standalone mode. |
| `web/src/protocol.ts` | modified | `SessionPlan` type + `Session.plan` (required); `DocChanged` type + `parseDocChanged`; `Message` union and `parseMessage` gain `docChanged`. |
| `web/src/ws.ts` | modified | `onDocChanged` handler; dispatch branch for the `docChanged` message. |
| `web/src/app.ts` | modified | `AppEvents` gains `docChanged`. |
| `web/src/api.ts` | modified | `fetchReaderListing`, `fetchReaderFile` (the latter decodes `text/markdown` on success, the JSON envelope on error — the one non-`decodeJson` call in the module). |
| `web/src/terminal/surfaceswitch.ts` | modified | `SurfaceKind` gains `"docs"`; `buildSurfaceSegment` builds a third button; `updateSurfaceSegment` presses/disables it; `isSurfaceAttachable` is `false` for `docs`; `shellEnded` keeps a `docs` selection (only reverts a `shell` selection); `parseSurfaceKey` round-trips `docs`. |
| `web/src/features/surfaces.ts` | modified | `select(id, "docs")` is a pure selection (no POST); `desiredSurfaceEntries` keeps a running shell's socket attached in the background while `docs` is selected (INV-1: its `onShellEnded` must still fire even though it's never mounted); `sessionRemoved` sweep includes `"docs"`. |
| `web/src/features/focus.ts` | modified | `getReader` dep thunk; `docs` mounts the reader into the main slot (dead surface + sizenote hidden), split into a `mountReader`/`mountTerminalSurface` pair to keep `renderView`'s complexity under the ceiling. |
| `web/src/features/tiles.ts` | modified | `getReader` dep thunk; `renderTileBody` mounts the reader for `docs` (checked before the generic surface branch, which would otherwise find nothing) and passes null geometry; split into `renderReaderTileBody` for the same complexity reason. |
| `web/src/main.ts` | modified | `initReader` registered (phase 8, renumbering rail/views/the split view phase to 9/10/11); `getReader` thunks wired into `tiles`/`focus`; `onDocChanged` WS handler. |
| `web/index.html` | modified | `<template id="reader-template">` (bar, notice, body, nav — tree/outline/plan-slot containers only, filled by `render/reader.ts`). |
| `web/vite.config.ts` | modified | `build.rollupOptions.input: { index, doc }` — `doc.html` is a second, independent entry. |
| `web/package.json` / `web/package-lock.json` | modified | `marked` `18.0.13`, `dompurify` `3.4.15`, exact (`npm install --save-exact`). |
| `web/src/style.css` | modified | `.reader`, `.docbar`, `.reader-notice`, `.md` (+ GFM elements, checkbox, placeholder), `.rnav` (+ tree/outline/plan-slot rules, `d0`-`d5` depth scale), `.arr`, `.badge` (docbar/rnav scope) — tokens only (`make contrast`: 0 failures, all three themes); tile-footer `.surfseg` padding trimmed one notch for the third button. |
| `web/src/features/CLAUDE.md`, `web/src/render/CLAUDE.md`, `web/src/terminal/CLAUDE.md` | modified | Hand-written head: added `reader` to **Features**, plus one gotcha each (surfaceswitch's `docs` never attachable; reader's tree/outline signature memoization). |

## Decisions

- **Plan slot's arrow stays visible on a dead session, only its label/entry are dropped** — REQ-3 says "the plan slot is absent from the nav" and the DOM spec nests the collapse arrow inside the same `.hd` element as the "plan" label, but REQ-4 requires the nav's collapse control to work regardless of session liveness. Resolved by hiding only `.plan-label` and the entry container (`[data-role="plan-slot"]`) when dead, keeping `planHeader`'s arrow button reachable. No test pins the arrow's presence on a dead session either way (E22 only checks the label/entry).
- **`.docbar .path` and `.rnav .hd .n` are DOM-absent in compact, not CSS-hidden** — the plan's own "Reader DOM" prose says "hidden in compact", but the Testable UI Elements table says "absent" for both, and E27's assertion is `toHaveCount(0)`. Implemented via the same presence (`insertBefore`/`.remove()`) pattern the badge/`.chg` cue already use, driven by `compact`/`filesHeader.count: null` in the view-model rather than a CSS rule (the two CSS rules from the mockup are left in place as harmless, now-redundant defensive styling).
- **`freshness.ts`'s `changedText` composes `changed ${formatAge(...)} ago`** literally, per the Affected Files line and W9's identical wording — not a bespoke seconds-precision formatter, despite User Flow 3's illustrative "`changed 0s ago`" (which the same `formatAge` renders as `changed now ago`, matching the Testable UI Elements regex `/^changed .+ ago$/`).
- **Shell background-tracking for INV-1** (`features/surfaces.ts`): a running shell must still clear its pip when it dies even while `docs` is selected, but `isSurfaceAttachable` (unchanged) never mounts a `TerminalSurface` for `docs`. `desiredSurfaceEntries` now additionally requests the `shell` attach target whenever `state.selected === "docs" && state.shellRunning`, so its `TerminalSurface` (and `onShellEnded` callback) stays alive in the background without ever being handed to `focus.ts`/`tiles.ts` for display (they only ever ask for the *selected* kind). Scoped narrowly to the `docs`+shell-running case — claude↔shell switching is unchanged. Found via the E2E run (INV-1 test), not anticipated from the plan text alone.
- **Scroll-spy tolerance is 24px, not the naive 1px** — `.md`'s own top padding (22px / 10px compact) sits between the container's border box and the first heading even scrolled fully to the top, so a bare `<= 1` never matches. Found the same way (E17 failed until fixed).
- **`buildBarVM`'s plan-path fallback is `session`-gated, not chained with `??`** — `session?.plan?.path ?? this.listing?.plan?.path` incorrectly resurrected a stale (pre-`/clear`) plan path when `session.plan` was validly `null`, since `??` doesn't distinguish "no session" from "session present with plan: null". Fixed to `session ? (session.plan?.path ?? null) : (listing?.plan?.path ?? null)`. Found via E5.

## Handoff

**Build status**: NOT BUILDING — `npx tsc --noEmit` (and therefore `npm run build` / `make web-build`) exits non-zero, but only against test files; `npx vite build` alone (the actual bundling step) succeeds, and the embedded `bin/musterd` I built from it runs correctly end-to-end (29/32 of the plan's own reader.spec.ts pass — see below).

**Sanctioned test breakage** — `Session.plan` is a required wire field (REQ-17: "no pre-plan daemon to tolerate") and `SurfaceSegmentRefs` gained a required `docsBtn`; both changes are exactly what the plan's Protocol Contract/Affected Files specify, and the resulting test-fixture gaps are kb:lesson/stale-fixture-reshaped-the-wire's sanctioned case. Not test-file edits I'm allowed to make. web-tests needs to:
- Add `plan: null` (or a populated `SessionPlan`) to every hand-built `Session` object failing `tsc --noEmit`: `src/api.test.ts`, `src/render/dead.test.ts`, `src/render/mainhead.test.ts`, `src/render/sessions.test.ts`, `src/render/tiles.test.ts`, `src/sessions/card.test.ts`, `src/sessions/live.test.ts`, `src/sessions/sort.test.ts`, `src/sessions/store.test.ts`, `src/ws.test.ts`.
- Add a `plan` key to every raw wire-shaped JSON literal fed through `parseSession`/`parseMessage` in `src/protocol.test.ts` (23 assertions currently fail at runtime — `tsc` doesn't catch these since they're untyped JSON objects, not `Session`-typed literals) and in `src/api.test.ts`/`src/ws.test.ts`'s response fixtures.
- Add a `docsBtn` fake to `src/terminal/surfaceswitch.test.ts`'s `fakeSurfaceSegmentRefs()` — 8 tests currently throw `Cannot read properties of undefined (reading 'setAttribute')` at runtime because `updateSurfaceSegment` now touches `refs.docsBtn` unconditionally.

**E2E smoke run** (`web/e2e/reader.spec.ts`, all 32 tests, against `bin/musterd` built from `npx vite build` + `go build ./cmd/musterd` — the literal `make web-build build` was not runnable given the tsc gate above): **29 passed, 3 failed**, none of which are markup/logic I can fix:
1. **`in Tiles, selecting docs… (E2, INV-6)`** — test bug, not mine to fix: `TerminalSocketTracker` is constructed *after* `page.goto`/`launchSession`, so it misses both sessions' terminal sockets, which open during each launch's initial Focus-view render (`liveCount` stays 0 the entire timeout, confirmed via an isolated throwaway repro using the identical helpers — not caused by anything in this diff). `tiles.spec.ts:717`'s own comment already documents the fix: construct the tracker *before* `page.goto`. Needs the same reorder in `reader.spec.ts`.
2. **`the Files and Outline header toggles… (E18)`** — locator defect, not mine to fix: `filesHeaderToggle`'s `getByRole('button', { name: 'Files' })` has no `exact: true`, so it also matches the nav-open arrow button (accessible name "Hide files" — Playwright's default name match is substring/case-insensitive, and "Hide **files**" contains "Files"). Both accessible names are exactly what the plan's Testable UI Elements table specifies; the fix is `exact: true` on that locator, not a markup change.
3. **`leaving plan mode fires a scan… (REQ-16, edge case 4)`** — the plan slot never fills after a raw (non-enveloped) `PreToolUse`/`PostToolUse{ExitPlanMode}` pair. This exercises daemon-impl's `InterpretFiles`/`Observe`/`SetPlan` wiring, which `plans/markdown-viewing/daemon-implementation.md` reports as implemented and green under `go test ./...`; I could not root-cause further without reading daemon-owned files I'm not permitted to change. Flagging for review/validate to re-run once daemon-impl's own fix wave (if any) lands — the equivalent `SessionStart`-triggered path (E3/E4/E5/E28/E29, all exercising the same client-side plan-badge rendering) passes cleanly, so this reads as a daemon-side gap in the `ExitPlanMode` trigger specifically, not a client rendering defect.

**W15** (sanitized markdown only ever enters via a DOMPurify fragment): `rg -n "innerHTML" web/src` — no matches outside test files.
**W16** (`ReaderInstance` constructed/disposed only in `features/reader.ts`): confirmed by inspection — `render/reader.ts` takes refs+view-model only, no `new ReaderInstance` outside `features/reader.ts`/`doc.ts`'s call into `initReader`.
**No `any` types** (W14): none added.

Every REQ-1 through REQ-28 and INV-1 through INV-8 web-facing item is implemented above; REQ-16/REQ-20/REQ-21/REQ-25/REQ-26 are daemon-only (no client change needed beyond rendering what the daemon sends, already covered).

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: Critical 1, Major 1, Major 2 (all [web-impl], from `plans/markdown-viewing/review.md`).

**Changes made**:

- **Critical 1** (`web/src/style.css`): `.reader` switched from `display: flex; flex-direction: column` to
  `display: grid; grid-template-columns: 1fr auto; grid-template-rows: auto auto 1fr`. `.docbar` and
  `.reader-notice` get `grid-column: 1 / -1` plus explicit `grid-row: 1`/`2` (explicit, not relying on
  auto-placement, because `.reader-notice` is `[hidden]` — i.e. absent from the grid — on the
  overwhelmingly common path, and auto-placement would otherwise shift `.md`/`.rnav` up into the
  `auto`-sized second row instead of the flexible third one). `.md` gets `grid-column: 1; grid-row: 3`
  plus `min-width: 0` (grid items default to `min-width: auto`, which would let content overflow the
  1fr track); `.rnav` gets `grid-column: 2; grid-row: 3`, its `flex: none` removed (meaningless on a
  grid item). No DOM/template change — `.rnav` stays nested inside `.reader` exactly as
  `plan.md`'s DOM sketch and every reader E2E locator expect; `.rnav[hidden]` and
  `.reader.compact .rnav`'s width override are untouched and still size column 2 (auto-collapses to 0
  when `.rnav` is absent, same as the pre-existing nav-collapsed behaviour relied on).

  Measured before/after with a fresh scratch daemon (throwaway Playwright repro using
  `helpers/fixtures.ts`, deleted before this commit — not a committed test file):
  - Focus: `md` box `{x:300, width:744}` (right edge 1044) vs `nav` box `{x:1044}` — flush beside it,
    not stacked below. `nav` bottom `103+617=720` == host bottom `90+630=720` (no overflow).
  - Tile: `nav` bottom `132+241.5=373.5` ≤ tile bottom `87+315.5=402.5` (reviewer had measured nav
    ending 25.5px past the tile's bottom edge; now it ends within it, `.rnav`'s own
    `overflow: hidden auto` scrolling internally).

- **Major 1** (`web/src/features/reader.ts`): `ReaderInstance.compact` changed from a `readonly`
  constructor field to a mutable field set at the top of `render()`, which now takes `compact` as a
  fourth parameter (mirroring `session`/`now`/`connected`) instead of reading a value fixed at
  construction. `render()` also now does `this.refs.root.classList.toggle("compact", compact)`
  (moved out of the constructor, which no longer takes a `compact` option at all).
  `reconcileInstances` (the only non-standalone caller) computes `compact = app.state.view ===
  "tiles"` once per pass and passes it to every instance's `render()` call, so a session's reader
  instance — kept alive across a Focus↔Tiles switch by `reconcileInstances`'s desired-set diff — now
  reflects the *current* host every render tick instead of the value at its original mount. The
  standalone (`doc.ts`) call site passes `compact: false` unconditionally (pop-out is never compact).
  `navCollapsedDefault`'s mount-time computation in `newInstance` (the "starts collapsed" default) is
  untouched — the review explicitly said that one stays mount-time.

  Measured (same throwaway repro): opened `docs` in Focus on a session (class `"reader"`, no
  `compact`, nav width 236), then clicked "Tiles" — the *same* session's reader (now in the tile)
  read class `"reader compact"`, `.docbar .path` count 0, `.rnav .hd .n` count 0, nav width 190 —
  all four of REQ-15's compact markers, previously stuck at their Focus-mount values.

- **Major 2** (`web/src/sessions/format.ts`, `web/src/reader/freshness.ts`): added
  `agoSuffix(age: string): string` beside `formatEndedAgo` in `format.ts` — the "now" bucket renders
  bare `"now"`, every other bucket appends `" ago"` — and rewrote `formatEndedAgo` to call it
  (`agoSuffix(formatEndedAge(...))`, same output as before, now sharing the rule instead of
  duplicating it inline). `freshness.ts`'s `changedText` now composes
  `` `changed ${agoSuffix(formatAge(writtenAtIso, now))}` `` instead of appending `" ago"` directly, so
  the sub-minute bucket reads `"changed now"` instead of the ungrammatical `"changed now ago"`.

  Measured (same throwaway repro, real write→docChanged→re-render round trip against a scratch
  daemon): `.docbar .chgtext` textContent is exactly `"changed now"` immediately after the write.

**Sanctioned test breakage (not mine to fix, confirmed by name)**:
- `web/src/reader/freshness.test.ts` — pins the old `"changed now ago"` string in its first and
  last (regex) assertions. Owned by web-tests.
- `web/e2e/reader.spec.ts:369` — asserts `/^changed .+ ago$/`; ran it and confirmed the one failure
  is exactly this line (`Received string: "changed now"`), the other 31/32 reader E2E tests pass.
  Owned by e2e-specs.

**Gate**: `npx tsc --noEmit` exits 0. `npm run build` (tsc + vite build) exits 0. `make web-build build`
from the project root exits 0. `npx playwright test reader.spec.ts` (smoke check, not the gate):
31 passed, 1 failed (the sanctioned Major-2 string above) — full pass list confirms Critical 1/Major 1
didn't regress anything (E1, E2, E27 all green).

## Fix Attempt 2 (review cycle 1, folded wave)

**Failure addressed**: new [web-impl] product defect e2e-specs' wave-3 coverage uncovered while
validating Fix Attempt 1's Major 1 fix — `.path` never reappears after a Focus→Tiles→Focus round
trip on a session that has seen no write hook (REQ-24's default state). Not one of the three tagged
review issues (those landed in bc715e3); routed by the orchestrator as a new bug.

**Root cause**: `web/src/render/reader.ts`'s `renderBar` anchored `.path`'s `setPresence` on `.chg`
(`setPresence(refs.path, refs.chg, vm.pathVisible)`), but `.chg` is itself removed from the DOM by
the very next line (`setPresence(refs.chg, refs.popOut, vm.freshness !== null)`) whenever no write
has been seen. Once `.chg` is detached, `.path`'s `anchor.parentElement?.insertBefore(...)` has no
parent to call on and silently no-ops on every subsequent render — `.path` never comes back.

**Change**: `web/src/render/reader.ts` — `.path`'s setPresence now anchors on `refs.popOut` (`.ib`,
the pop-out link) instead of `refs.chg`. `.popOut` is never removed from the DOM anywhere in this
file (only `.hidden` is toggled on it directly), so it's a permanent, safe anchor. Calling
`setPresence(path, popOut, …)` before `setPresence(chg, popOut, …)` in `renderBar` (unchanged order)
still produces the correct badge/fname/path/chg/popOut sequence in either presence combination,
since both insertions target the same fixed anchor in left-to-right call order.

**Swept for other instances of the same latent bug**: `grep -n "setPresence(" web/src/render/reader.ts`
shows exactly three calls in the file — `(badge, fname, …)`, `(path, popOut, …)` (this fix), and
`(chg, popOut, …)`. `fname` is never an `el` argument anywhere (never removed), and `popOut` is only
ever hidden via `refs.popOut.hidden = …`, never passed as an `el` to `setPresence` — so both
remaining anchors (`fname` for badge, `popOut` for chg) are permanent nodes, not subject to the same
detached-anchor failure. No second instance found.

**Verified with the reviewer's actual repro, not a new one**: ran the specific E2E test that
measured this defect (`e2e/reader.spec.ts:1003`, "compact follows the current host across a
Focus/Tiles switch, not the mount moment") against a rebuilt `bin/musterd`
(`make web-build build`, then `npx playwright test reader.spec.ts -g "compact follows the current
host"` from `web/`) — 1 passed, where it was previously red on the return (Tiles→Focus) half.

**Full suite re-run** (`npx playwright test reader.spec.ts`, all 34 tests, same rebuilt binary):
34 passed, 0 failed — includes the previously-sanctioned Major-2 test (now passing, presumably fixed
upstream by e2e-specs' Task 1 regex widening) and the two previously-flagged daemon/test-order items
(E2/INV-6, REQ-16 ExitPlanMode) also now green, not touched by this fix.

**Gate**: `npx tsc --noEmit` exits 0. `npm run build` exits 0. `python3
.claude/skills/orchestrate/scripts/dead-refs.py` — 938 references checked, 0 missing.

## Fix Attempt 3 (review cycle 2)

**Failures addressed**: Critical 1, Major 1 (both [web-impl], from `plans/markdown-viewing/review.md`
cycle 2). Both are consequences of the cycle-1 grid fix per the reviewer, not a retraction of it.

**Critical 1 — nav content clipped and unreachable** (`web/src/style.css:1151-1154`, now
`1151-1160`): `.rnav .tree`/`.rnav .outline` were `overflow: hidden`, and as flex items in `.rnav`'s
column their automatic flex-minimum size is 0 once overflow isn't `visible` — they shrink to
whatever column space is left and clip the rest, and `.rnav`'s own `overflow: hidden auto` never
engages because nothing overflows *it*, only its children.

**Model chosen: option 1 (each section scrolls inside its own shrunken box)**, not the `flex: none`
whole-column alternative — I set `overflow-y: auto; overflow-x: hidden` on `.rnav .tree, .rnav
.outline`. This keeps the `.hd`/`.filter`/`.sep` chrome pinned (they stay `flex: none`, untouched)
and puts an independent scrollbar on whichever of tree/outline has overflow, which matches REQ-14's
"independent folds" framing better than one scrollbar for the whole nav column (the `flex: none`
model would scroll the Files/Outline headers away with their content). **Observable contract for
wave-3 (e2e-specs) to pin: `.rnav .tree` and `.rnav .outline` are each independently scrollable
elements (`overflow-y: auto`) — assert reachability by scrolling each element to its own
`scrollHeight`, not the nav as a whole.**

Verified by measurement, not locator, using a throwaway Playwright spec (`web/e2e/_verify-cycle2.spec.ts`,
written, run, and deleted before this commit — `git status` shows nothing left under `web/e2e/`)
against a rebuilt `bin/musterd` (`make web-build build`): a session with 20 top-level `.md` files
and a 30-heading open file, real DOM measurement in the full Focus pane:

```
nav.rnav      scrollHeight 598  clientHeight 598          (unchanged — nav itself still doesn't scroll, by design)
.tree         scrollHeight 441  clientHeight 175  overflow-y: auto
.outline      scrollHeight 651  clientHeight 258  overflow-y: auto
before scroll: last file row bottom 690   vs .tree bottom (clipped) — unreachable without scrolling
before scroll: last outline row bottom 1112.86 vs .outline bottom (clipped) — unreachable without scrolling
after scrolling each element to its own scrollHeight:
  last file row bottom 424        <= .tree's own bottom 423.86 (+1 tolerance)   reachable
  last outline row bottom 719.86  <= .outline's own bottom 720                   reachable
```

**Major 1 — `.path` lands after `.chg` once re-inserted** (`web/src/render/reader.ts:158-178`):
`setPresence` only moves an element when it transitions from absent→present; it never repairs an
already-connected element's position. Anchoring both `.path` and `.chg` on the same fixed point
(`.ib`/popOut) meant that whichever of the two was already connected going into a render pass never
moved, so when `.path` was re-inserted (Tiles→Focus, `pathVisible` true again) while `.chg` was
already connected from an earlier write, `insertBefore(path, popOut)` landed `.path` to the right of
`.chg` — the cycle-1 fix commit's claim that left-to-right call order "preserves the sequence either
way" was true only when both start absent, which is not the round-trip case.

**Fix**: reordered the two `setPresence` calls (`.chg` first, still anchored on `.ib`) and made
`.path`'s anchor conditional on `.chg`'s presence this pass: `setPresence(refs.path, vm.freshness !==
null ? refs.chg : refs.popOut, vm.pathVisible)`. Because `.chg`'s own `setPresence` call runs first,
`refs.chg` is guaranteed connected (with a `parentElement`) whenever `vm.freshness !== null`, so
anchoring `.path` on it is always safe. This makes the resulting order deterministic from the
view-model alone rather than from what happened to be connected before the pass.

**Verified across all four present/absent combinations of `.path`/`.chg`** (not just the one that
was broken), same throwaway spec, real write hook via `envelopedSessionStart` + `rawPostToolUse`
against a rebuilt `bin/musterd`, reading `.docbar`'s actual child order each step:

```
1. Focus, no cue yet        ["fname","path","ib","arr[hidden]"]                 path present, chg absent
2. Focus, after a real Write ["fname","path","chg","ib","arr[hidden]"]          path BEFORE chg — correct
3. Tile (compact)            ["fname","chg","ib","arr[hidden]"]                  path dropped, chg stays
4. Back in Focus             ["fname","path","chg","ib","arr[hidden]"]          path BEFORE chg — was AFTER before this fix
innerText at step 4: "TODO.md" / "<abspath>/TODO.md" / "changed now" / "pop out ↗" — REQ-4 order
```

**Blast radius of `setPresence`/`renderBar` change**: `rg -n "setPresence\(" web/src/render/reader.ts`
— still exactly three call sites (`badge/fname`, `chg/popOut`, `path/`the new conditional anchor`);
no other caller of `renderBar` or `setPresence` exists (`rg -n "renderBar\(|setPresence\(" web/src`
— both names are private to this one module, called once from `render()` in the same file).

**e2e-specs Major 2 (both new specs blind to these findings)**: not mine to fix (test files); noting
for wave-3 per the review — *live compact* needs a routed Write before the Focus→Tiles→Focus round
trip and an assertion on `.docbar`'s element order (not just `.path` presence); *nav placement* needs
a fixture whose tree/outline exceed the nav and an assertion that the last row of each is reachable
by scrolling that row's own container to its `scrollHeight` (the model chosen above).

**Not touched, confirmed still correct per the reviewer**: the grid layout, the live-compact render
parameter, `agoSuffix`, and anchoring `.path`'s *absent*-case insertion off `.ib` rather than `.chg` —
all untouched by this diff.

**Gate**: `npx tsc --noEmit` exits 0. `npm run build` exits 0. `make web-build build` from the
project root exits 0. `npx playwright test e2e/reader.spec.ts` (smoke check, not the gate): 34
passed, 0 failed. `python3 .claude/skills/orchestrate/scripts/dead-refs.py` — 938 references
checked, 0 missing.

## Fix Attempt 4 (review cycle 3)

**Failures addressed**: Critical 1 `[web-impl]` (`/doc.html` has no host sizing rule — REQ-14
scroll-spy and click-to-scroll dead there, `.docbar` scrolls off), Major 1 `[web-impl]` (every
tree/outline button is destroyed and rebuilt on any `current`/`dirty` change, dropping keyboard
focus to `<body>`).

**Critical 1 fix**: `web/src/style.css` — added `.reader-host { display: flex; height: 100vh;
min-height: 0; overflow: hidden; }`, mirroring `#app`'s own `height: 100vh` rule (index.html's
composition root). A single flex item stretches to fill both axes by default, so `.reader`'s
existing `flex: 1; display: grid; grid-template-rows: auto auto 1fr` now resolves against a
definite height and `.md`'s `overflow: auto` engages.

**Sweep 1 (unbounded hosts) — read the full chain for every host, not just the pop-out**:
- Focus: `#app` (`height: 100vh`, flex column) → `#view-focus.split` (`flex: 1; min-height: 0`)
  → `.main` (`flex: 1`, flex column, `min-height: 0`) → `#main-terminal-slot.terminal-slot`
  (`flex: 1`, flex column, `min-height: 0`) → `.reader` (`flex: 1`, grid, `min-height: 0`) →
  `.md` (grid row `1fr`, `overflow: auto`) — every link bounded, already correct (this is why
  cycle 2/3's Focus measurements passed).
- Tiles (both densities): `.tiles-view` (`flex: 1; min-height: 0`) → `.grid` (`flex: 1;
  min-height: 0`, `grid-template-rows: 1fr 1fr`, definite per-cell height from the grid) →
  `.tile` (flex column, `min-height: 0`) → `.tbody-slot` (`flex: 1; min-height: 0; display:
  flex`) → `.reader` → `.md` — every link bounded, already correct (matches cycle-3's own
  measured 2×2/3×2 reachability numbers).
- Pop-out (`doc.html`): `html, body` (`height: 100%`) → `#reader-host` — **had no rule at all**,
  the only broken link in any of the four hosts. Fixed above.

**Verification (re-running the reviewer's exact repro)**, throwaway spec against a rebuilt
`bin/musterd`, fixture = `buildLargeMarkdownFixtureTree` (20 top-level files + a 30-heading
file), same shape the review cycle-3 measurement used, deleted before this handoff
(`git status` shows nothing left under `web/e2e/`):

```
document.documentElement: scrollHeight 720  clientHeight 720   (was 2559 / 720 — page no longer grows to content)
article.md:               scrollHeight 2511 clientHeight 672   (scrollable, was scrollHeight===clientHeight)
.docbar top before/after scrolling article.md to 1200:  0 / 0  (stays fixed — was scrolling off-screen)
scroll-spy aria-current after scrollTop=1200:  "Section 15"    (was stuck on "Outline")
click "Section 25": scrollTop 0 → 1839 (container's own max, content-clamped near the list's
  end — same clamping any scrollable list exhibits), heading lands at viewport y=223.5 (visible,
  was 513px below viewport with scrollTop staying at 0)
```

**Major 1 fix**: `web/src/render/reader.ts` — `renderTree`/`renderOutline` (and, found in the
sweep below, `renderPlanSlot`) now key their rebuild decision on a **structural** signature that
excludes `current`/`dirty`, and apply those two as attribute patches (`aria-current`,
add/remove `.dot`) to the *existing* buttons in place:
- `treeStructOf`/`outlineStructOf`: every field the builder reads except `current`/`dirty` (kind,
  path, name, depth, expanded, count / id, level, text), `JSON.stringify`'d for the signature —
  same collision-avoidance the original code had, just narrowed to the structural fields.
- `applyTreeAttrs`/`applyOutlineAttrs`: walk the already-built children in entry order (same
  order, since order is itself part of the structural signature) and set/remove
  `aria-current`/`.dot` without touching any other node.
- When a rebuild *is* structurally required (expand/collapse, filter, listing change), focus is
  captured by the button's stable key (`data-path` / the outline's existing `data-headingId`)
  before `replaceChildren` and restored onto the equivalent new node after — `focusedKeyWithin`/
  `restoreFocusByKey`, shared by both.

**Sweep 2 (other memo keys carrying attribute-level state)**: `renderPlanSlot` had the identical
shape — its single button's `JSON.stringify(vm)` signature included `current`/`dirty`, so opening
the plan (which sets `current: true` on the very next render pass, right after the click that
opens it) or a docChanged toggling its dirty dot destroyed and rebuilt the one interactive node in
the plan slot. Fixed the same way: `renderPlanSlot`'s signature is now `kind`/`basename` only
(`applyPlanAttrs` patches `current`/`dirty` in place). This wasn't named in the review but is the
same defect class on the plan slot's own button — REQ-4/REQ-9 unaffected functionally, existing
E3/E4/E7/E19 (plan badge, dirty dot, filter, memory) still pass unmodified.

**Sweep 3 (focus destruction generally)**: filter input, both fold toggles, the nav arrow and the
pop-out link are all permanent `ReaderRefs` fields from `buildReader`, never rebuilt anywhere in
`renderReader` — only `.hidden`/attributes/text are set on them, or (filesToggle's `.n` count) a
child span is added/removed without touching the toggle button itself. Confirmed by re-reading
every line of `renderReader`/`renderBar`: no other `replaceChildren`/`remove`+reinsert touches a
focusable control. Nothing further to fix here.

**Verification (re-running the reviewer's exact repro)**, same throwaway spec, real key presses
via `page.keyboard.press("Enter")`, waiting past the 1s render tick (1100ms) before reading
`document.activeElement`:

```
tree file button "file-01.md":       focused before Enter, Enter opens it, activeElement after 1100ms wait: "file-01.md" (was BODY)
outline button "Section 5":          focused before Enter, Enter scrolls to it, activeElement after 1100ms wait: "Section 5" (was BODY)
folder toggle "docs/":                focused before Enter, Enter expands it, activeElement after 1100ms wait: still that <button> (aria-expanded set) (was BODY)
```

**Blast radius**: `treeStructKey`/`outlineStructKey` (string-based first draft) were replaced with
object-based `treeStructOf`/`outlineStructOf` + `JSON.stringify` before landing, to match the
original code's exact-value semantics with no delimiter-collision risk. `rg -n "dataset\[.sig.\]"
web/src/render/reader.ts` (pre-fix) showed 4 call sites, all inside this one file/these three
functions — no external consumer of the old `dataset.sig`/`dataset.structSig` keys exists
anywhere else in `web/src` (they're a private implementation detail of this module, never read by
a test or another feature). `btn.dataset["path"]` added to tree buttons is likewise
internal-only, not part of the Testable UI Elements contract, and does not change any button's
accessible name or role.

**Gate**: `npx tsc --noEmit` exits 0. `npm run build` exits 0. `make web-lint` — "Checked 148
files… No fixes applied." `make contrast` — 43/43/43 pairs, 0 failures (this cycle's CSS added no
color/font/spacing literal). `make web-build build` from the project root exits 0. `npx playwright
test e2e/reader.spec.ts` (smoke check, not the gate): 34 passed, 0 failed — including E17
(scroll-spy/click-to-scroll), E21 (pop-out) and both cycle-1 regression specs (nav placement,
live-compact). `python3 .claude/skills/orchestrate/scripts/dead-refs.py` — 941 references checked,
0 missing.

## Fix Attempt 5 (review cycle 4)

**Failures addressed**: Major 1 `[web-impl]` (nav arrow pair destroys keyboard focus) and Minor 1
`[web-impl]` (two malformed `kb:` citations).

**Major 1 — nav arrow focus.** `renderReader` (`web/src/render/reader.ts`) unconditionally sets
`refs.nav.hidden = vm.navCollapsed` and `refs.collapsedArrow.hidden = !vm.navCollapsed` every pass.
Each arrow is a permanent ref (never rebuilt — cycle-3's fix already covers that), but hiding one
that currently holds focus drops `document.activeElement` to `BODY` just as completely as a
rebuild would; cycle-3's sweep tested "is this control rebuilt" and missed "does activating this
control hide the focused element", which is the property the reviewer named.

Added `prepareNavArrowFocusRestore(refs, navCollapsed)`: reads `document.activeElement` *before*
either `hidden` flip (both branches run synchronously inside the same click/Enter handler, since
`app.render()` is synchronous, so it still reads whichever arrow the user just activated) and
returns a thunk that focuses the counterpart. `renderReader` calls the thunk *after* both `hidden`
flips are applied — focusing a still-`hidden` element is a no-op, so the order matters both ways:
capture-before, act-after. Scoped to exactly the two arrows (`refs.openArrow`/`refs.collapsedArrow`)
so an unrelated render pass, or the rare case where the toggle callback fires with focus elsewhere,
never focus-steals — matches the review's explicit ask ("do not focus-steal when the toggle came
from anywhere else").

**Minor 1 — malformed `kb:` citations.** `web/src/style.css:687` (`kb:for` `#app`'s own rule
above`) → `see #app's own rule above` (plain cross-reference, not a `kb:` token; there was never a
real record for this). `web/doc.html:7` (``kb:anchor's` REQ-11`) → dropped the `kb:anchor's`
prefix entirely; `index.html`'s own copy of this same comment (`web/index.html:7`) cites `REQ-11`
plainly with no `kb:` wrapper — `doc.html`'s comment now matches it exactly, since REQ-11 is a
plan requirement number, not a kb record.

**Broader sweep (the reviewer's "does activating this control hide/remove/disable its own focused
element" property), every interactive control in the reader, every host:**

- Nav arrow pair — fixed above.
- Tree file/folder buttons, outline buttons, plan-slot button — attribute-patched in place
  (cycle-3's fix), never hidden or removed by their own activation; re-confirmed by re-reading
  `applyTreeAttrs`/`applyOutlineAttrs`/`applyPlanAttrs` — none touch `.hidden` or a `disabled`
  property.
- Files/Outline fold toggles (`filesToggle`/`outlineToggle`) — activating either hides a *sibling*
  (`refs.filter`+`refs.tree`, or `refs.outline`), never the toggle button itself; the toggle stays
  visible and focused after activation. Not the same defect shape as the arrow pair (there, the
  activated element and the hidden element are the same node in two guises; here they are
  genuinely different nodes and the hidden one is never the one just pressed). No change needed.
- Filter input — `refs.filter.hidden` follows `filesFolded`, which the filter box itself never
  sets; typing in it never hides it. No change needed.
- Pop-out link (`refs.popOut`) — `hidden` follows `popOutHref === null`, which only goes non-null
  →null when `openPath` is cleared or the session disappears from the frame; the link's own
  activation (opening the pop-out in a new tab) never changes either input. No change needed.
- Segment buttons (`claudeBtn`/`shellBtn`/`docsBtn`, `web/src/terminal/surfaceswitch.ts:201-203`)
  — go `disabled` while the WS is down. This is a pre-existing, app-wide gate (`git log --
  web/src/terminal/surfaceswitch.ts` shows the claude/shell `disabled = !connected` pair predates
  this plan, added in `ac2b62c feat(terminal): tabbed plain shell…`; this plan's `docsBtn` only
  follows the same existing pattern) and identical in shape to every other action button in the
  app (mainhead End/Resume/Remove, the dead-surface Resume, the tile action row) — none of which
  restore focus across a disconnect either. Fixing it here would mean changing shared
  disconnect-gating behaviour for `claude`/`shell` too, well outside a reader-only fix wave, and
  would leave the app with one inconsistent instance (reader) while every sibling control keeps
  the old behaviour. **Not fixed** — flagging as a pre-existing, cross-cutting pattern rather than
  a reader defect, consistent with the review's own framing ("the existing gate").
- Two cases the reviewer already examined and explicitly asked to leave alone (tree row filtered
  away while focused; plan slot removed on session death) — left untouched, per the review's Notes
  1 and 3.

**Verification (re-running the reviewer's exact repro)** — a throwaway probe spec
(`reader.probe-arrow-focus.spec.ts`, written, run, then deleted; `git status` confirmed clean
afterward), real key presses via `page.keyboard.press("Enter")`, `settleFor(page, 1100)` past the
render tick, asserting on the counterpart's own locator (`toBeFocused()`), on both hosts:

```
FOCUS host   Hide files, Enter  → Show files focused  (was BODY)
FOCUS host   Show files, Enter  → Hide files focused   (was BODY)
POPOUT       Hide files, Enter  → Show files focused  (was BODY)
POPOUT       Show files, Enter  → Hide files focused   (was BODY)
```

**Gate**: `npx tsc --noEmit` exits 0. `npm run build` exits 0. `make web-lint` — "Checked 148
files in 143ms. No fixes applied." `make web-build build` from the project root exits 0. `npx
playwright test reader.spec.ts` (smoke check, not the gate): 37 passed, 0 failed. `python3
.claude/skills/orchestrate/scripts/dead-refs.py` — 941 references checked, 0 missing.

**Build status this cycle**: `npx tsc --noEmit` and `npm run build` exit 0. No test files needed
changes. Major 2 `[e2e-specs]` (add a focus-survival assertion for the nav arrow pair) is the test
agent's fix, not mine — `web/e2e/reader.spec.ts` is out of my scope.

## Fix Attempt 5 (review cycle 5)

**Failures addressed**: Critical 1 `[web-impl]` — `/doc.html` permanently asserted
`musterd unreachable — showing last render` because `doc.ts` wired none of `WsClient`'s
`onConnecting`/`onHello`/`onDisconnected`, so `app.state.connection` never left `createApp()`'s
`"connecting"` default and `RenderFrame.connected` was `false` on every frame, masking every real
notice (`file no longer exists`, `too_large`, `directory_missing`) and REQ-8/REQ-27/REQ-28.

**Changes made**:
- `web/src/features/connection.ts` — extracted the DOM-free half of connection tracking (the
  `everConnected` rule and the `app.state.connection` write) into a new exported
  `createConnectionState(app, onChange?)` / `ConnectionState`. `initConnection` (dashboard) now
  wraps it, passing an `onChange` that does exactly what its old inline `set()` did
  (`renderConnectionStatus`, `renderBanner`, the `"status"` emit, `app.render()`) — same order,
  same conditions. The one non-mechanical change: the banner condition was
  `everConnected && status !== "connected"`; since `disconnected()` can only ever produce
  `"reconnecting"` when `everConnected` is true and `"connecting"` when it isn't, that's exactly
  `status === "reconnecting"` — simplified and commented with the equivalence argument rather than
  threading `everConnected` out through the callback.
- `web/src/doc.ts` — added `createConnectionState(app, () => app.render())` and wired
  `onConnecting`/`onHello`/`onDisconnected` to it (claudeCode is ignored — no version readout on
  this page). Extended the header comment into an explicit per-callback account of every
  `WsClient` callback `main.ts` wires, checked deliberately rather than by analogy (the root cause
  the reviewer named): wired the three connection callbacks plus the pre-existing
  `onSnapshot`/`onSessionUpsert`/`onDocChanged`; left `onSessionRemoved`, `onPrefs`, `onUsage`,
  `onClaudeTheme`, `onUpdate` and `onProtocolMismatch` unwired, each with its own reason in the
  comment (see below — this goes further than the review's two flagged callbacks, which is the
  "third omission" check the fix wave asked for).

**Per-callback disposition** (the enumerable list the fix wave asked for):

| Callback | Wired? | Why |
|---|---|---|
| `onConnecting` | yes | drives `app.state.connection` — the fix |
| `onHello` | yes | drives `app.state.connection` — the fix |
| `onDisconnected` | yes | drives `app.state.connection` — the fix |
| `onSnapshot` | already wired | reader reads the store directly |
| `onSessionUpsert` | already wired | reader reads the store directly |
| `onDocChanged` | already wired | reader reads this event directly |
| `onSessionRemoved` | no | `initReader`'s own `app.on("sessionRemoved", …)` subscription is gated `if (!standalone)` (`features/reader.ts:471`) — `doc.ts` always passes a standalone target, so wiring this would be a dead wire, not a behaviour choice. Confirmed by reading the guard, not inferred. |
| `onPrefs` | no | `rg 'app\.on\(' web/src/features/reader.ts` → only `"docChanged"`, `"snapshot"`, `"sessionRemoved"`; no feature built on this page reads `"prefs"` |
| `onUsage` | no | same sweep — no reader code reads `"usage"`, and no usage feature exists on `/doc.html` |
| `onClaudeTheme` | no | same sweep — no reader code reads `"claudeTheme"`; the page's own initial-theme script (index.html-identical, `doc.html:7`) reads `localStorage` directly and needs no runtime event |
| `onUpdate` | no | same sweep — no update feature on this page |
| `onProtocolMismatch` | no | the plan's States table has no mismatch row for `/doc.html`, and `showProtocolMismatch()`'s behaviour (hide `#app`, show `#protocol-mismatch`) needs shell/banner markup this page doesn't have; wiring it to anything else would be inventing unspecified behaviour, which the review's own note explicitly warned against doing for the two callbacks it did flag |

**Verification — re-ran the reviewer's exact repro, with a throwaway probe spec**
(`web/e2e/_probe-critical1.spec.ts`, written against the committed `helpers/reader.ts`/
`helpers/session.ts`/`helpers/payloads.ts`, run, then deleted; `git status --porcelain` confirmed
back to only the two source files plus this log). Measured on the real pop-out, daemon started
fresh:

```
daemon healthy, file open           .reader-notice hidden=true,  text ""
                                     (was: hidden=false, "musterd unreachable — showing last render")
file deleted + routed Write hook    .reader-notice text "file no longer exists — <path>"
                                     (was: still "musterd unreachable…", the real message never shown)
daemon.kill() (genuine outage)      .reader-notice text "musterd unreachable — showing last render"
                                     (this is now the FIRST time that text appears — a true statement)
```

Both halves proved: the false message is gone while healthy, and a genuine outage now shows it
(previously it showed the same text regardless, so this case was unfalsifiable before the fix).

**Dashboard blast radius** (`initConnection` reuse instruction) — re-measured the dashboard's own
connection states are unchanged by the extraction: `make e2e` reader-relevant specs re-run below
include E24 (`stopping the daemon disables the docs segment and shows the unreachable status …
restarting restores it`), which exercises `initConnection`'s full connecting → connected →
reconnecting/banner → connected path on the dashboard and passed unchanged.

**Gate**: `npx tsc --noEmit` exits 0. `make web-build` exits 0 (vite build succeeds, `doc.ts`
bundle emitted). `make web-lint` — "Checked 148 files in 148ms. No fixes applied." `make web-test`
— 35 files, 1562/1562 passed (unchanged count — no test needed touching). `make web-build build`
from the project root, then `npx playwright test reader.spec.ts` (smoke check, not the gate): 38
passed, 0 failed (37 → 38: cycle 4 added one since the last log entry; nothing here removed or
skipped one). `python3 .claude/skills/orchestrate/scripts/dead-refs.py` — 944 references checked,
0 missing.

**Build status**: `npx tsc --noEmit` and `npm run build`/`make web-build` exit 0. No test files
needed changes — Major 1 `[e2e-specs]` (add a pop-out status-line assertion) is the test agent's
fix, not mine; `web/e2e/reader.spec.ts` stays out of my scope.
