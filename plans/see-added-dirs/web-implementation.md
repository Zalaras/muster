# Web Implementation: See added directories

**Plan**: see-added-dirs
**Mode**: initial
**Pack**: kb: pack 33969 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/protocol/session.ts` | modified | `AddedDirectory` type and the required `addedDirs` key on `Session`; `parseAddedDirs` rejects a session whose key is missing, not an array, or holds a malformed entry (REQ-5a: `repo` null is a valid entry) |
| `web/src/sessions/locationpanel.ts` | created | Pure panel model: launch row, `↳` row while `claudeLocation` is non-null, `Added directories · N` section while N > 0, rows in wire order (REQ-7, W3) |
| `web/src/sessions/card.ts` | modified | `MainheadMeta` gains `addedCount` and loses `hover`; `repo.folder` drops its ` /` while directories are added so the line reads `muster+2` (REQ-6, INV-3); `locationHover` stays for the tile `.wh` (REQ-8) |
| `web/src/render/repolines.ts` | modified | `renderRepoLines` takes an optional `addedCount`; above 0 the `.rf` holds `.rf-name` and `.plus` spans built once and updated in place; at 0 it writes the plain text as before, so the rail card and `↳` callers are unchanged |
| `web/src/render/locationpanel.ts` | created | Hover controller: 350 ms delay (`POPOVER_DELAY_MS`), `.pop.loc-pop` with `role="tooltip"`, appended to `body`, placed by `placeAnchored`, closed on leave and pointerdown (REQ-7, REQ-9) |
| `web/src/render/mainhead.ts` | modified | `renderMeta` no longer writes `.loc`'s `title` (REQ-7, W2) and passes `addedCount` through |
| `web/src/features/focus.ts` | modified | Attaches the controller to `.loc` once, model read from the focused session at open; closes it on `focusChanged` |
| `web/src/style.css` | modified | `.rf.has-plus` flex row (name ellipsizes, `+N` `flex: none` in `--fg-muted`); `.pop .dr/.df/.dp/.sub` row rules; `.pop.loc-pop` 380px max width. Neutral tokens only |

`web/index.html` unchanged: `.loc` needs no slot. No Testable UI Elements row is unimplementable.

## Decisions

- Testable UI Elements, all honoured: suffix is a `span.plus`, last child of the header's `.repo .rf`, absent when N = 0; panel is `role="tooltip"` on `body`, present only while open; heading is `Location`; sub-heading `Added directories · N` present iff N > 0; rows are `<folder> · <branch>` over the path, folder alone when `repo` is null or has no branch.
- Folder-line slash (the e2e-specs handoff's open question): while N > 0 the ` /` is dropped, so `textContent` is `muster+2` exactly as the plan's table states; with N = 0 it stays `muster /`. A session with no repo shows `<basename>+N`.
- REQ-8: rail `.r2`/`.r2c` and tile callers of `renderRepoLines` pass no count; `locationHover`/`claudeHover` untouched, so the card and tile hovers are unchanged.
- REQ-9: the delay is the group popover's own exported `POPOVER_DELAY_MS`; `pointer-events: none` comes from the shared `.pop` rule; no focus path (mouse only, plan Out of scope).
- Panel is a snapshot taken at open (the group popover's precedent); it is not rebuilt while open.
- Render-tick reuse: the `+N` structure is built once and each span is written only when its text differs; the `.loc` node and its listeners are never rebuilt. The reuse inputs of the folder line are the name text, the count and the `has-plus` class; all three are written in the same pass.
- `[hidden]` sweep: no element this change adds is toggled by `hidden`, so no companion rule is needed.
- Gates run: `npm run -s lint` clean; `make contrast` 54 pairs, 0 failures in all three themes; `make size-warn` shows no new warning (card.ts held to exactly 500 lines, by trimming two comments, since it was 498).
- design: `sessions/locationpanel.ts` (pure model) + `render/locationpanel.ts` (DOM controller) follow the `sessions/sections.ts` `popoverModel` + `render/grouppopover.ts` pair. The plan's Affected Files put the model in `card.ts`; card.ts sits at the 500-line threshold and the model is one concern, so it has its own module (Hint taken in shape, dropped in location).
- design: precedent check. `rg -n "mouseenter" web/src` finds `grouppopover.ts` (hover, delay, `placeAnchored`, body-appended tooltip) and `cardtip.ts`. The controller mirrors `grouppopover.ts` and imports its `POPOVER_DELAY_MS` and `placeAnchored`. It does not extend `createGroupPopover`: that controller's `attach` is typed to `PopoverModel`, builds group rows and carries the focus-to-open path this plan does not want, so a shared generic would have meant reshaping a shipped, tested module for a 12-line timer. The timer/close logic is therefore duplicated once; a reviewer who prefers a shared `createHoverPanel` can lift it with both callers in view.
- design: `AddedDirectory` is a separate interface with the same shape as `ClaudeLocation`, decoded by the same `parseClaudeLocation`, since the wire object is the same `{directory, repo}` and a second parser would be a copy. The names say what each field of `Session` holds.
- design: state touched by more than one pass: the open panel and its timer are owned by the `createLocationPanel()` instance `focus.ts` holds; no render pass touches them.
- Hints: `locationHover` kept for the tile (REQ-8), taken; `grouppopover.ts` taken as the shape, dropped as the implementation (see above).
- doc-delta: `docs/design/design-system.md` § "Focus mainhead" — the folder line also drops its ` /` while a `+N` suffix shows (`muster+2`); mention with the panel sentence.
- doc-delta: `docs/features/focus/spec.md` — the readout's folder line reads `<repo>+N` (no ` /`) while directories are added.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` fail on sanctioned test files only: the `Session` type gained the required `addedDirs`, so every Session fixture lacks it, and `card.test.ts` reads `mainheadMeta().hover`, which no longer exists. `tsc` output filtered to non-test files is empty; `npx vite build` succeeds. Unit run: `8 failed | 88 passed` files, `127 failed | 2634 passed` tests, all from `addedDirs` undefined.
**E2E smoke**: `make web-build` cannot run (its `tsc` step fails on the sanctioned test files above), so the dashboard was built with `npx vite build` and the binary with `make build`; then `npx playwright test e2e/added-dirs.spec.ts` (daemon-impl's tree as it stood): `1 failed, 19 passed (4.0m)`. The failure is the W4 width sweep, a spec-scope defect, not this build (see below).

Test files needing changes (web-tests):
- `web/src/sessions/testfixtures.ts` — `makeSession` default gains `addedDirs: []` (fixes `store`, `sort`, `card`, `tiles`, `dead`, `actionscopy` fixtures that use it).
- `web/src/protocol/session.test.ts`, `web/src/protocol/messages.test.ts` — wire fixtures gain `addedDirs`; add decode cases (missing key, non-array, malformed entry, `repo: null` entry).
- `web/src/api/launch.test.ts`, `web/src/api/sessions.test.ts`, `web/src/sessions/live.test.ts`, `web/src/ws.test.ts` — whole-Session literals gain `addedDirs: []`.
- `web/src/sessions/card.test.ts` (line ~850) — `mainheadMeta` has no `hover`; assert `addedCount` and the dropped slash instead.
- `web/src/render/mainhead.test.ts:502-542` — assert `.loc` has no `title` (plan lists it); add suffix-structure and reuse-across-ticks cases.
- `web/src/render/sessions.test.ts` (37 failures, fixture-only).
- New: `sessions/locationpanel.ts` model tests; `render/locationpanel.ts` controller tests (delay, close on leave, body-append, `role="tooltip"`).

Spec mismatch for validate mode: `added-dirs.spec.ts:803` (W4, "a long folder name ellipsizes before the +N suffix...") sweeps viewport widths 1280, 1024, 768, 480 and 360, below the 600 px floor every existing header sweep stops at (`sweepWidths()` default `to = 600`; `card-location.spec.ts` sweeps down to 700). At 480 `mainheadFitProblems` reports `Stop 459.8-518.5 is outside the 480x800 viewport` and `Remove 523.5-582.1 ...`. The same test with the `report` post removed (no suffix, no added directories) fails at 480 with the same Stop/Remove overflow plus `model right 510.4 is past 480`, so the overflow is the header's existing minimum width, not the suffix. A copy of the test with `mainheadFitProblems` limited to widths >= 600 passes 1280/1024/768/600-range and the suffix check (inside the viewport, on top at its centre and right edge) passes at 1280, 1024, 768 and 480; it fails only at 360 (`the suffix 354.6-368.2 is outside the viewport`), where the whole header overflows the viewport the same way. The temporary copies are deleted. Widths for the sweep belong at the supported floor.

Other spec locators: none found. `web/e2e/card-location.spec.ts` still asserts the header `.loc` title at the lines the plan and the e2e-specs handoff name (adapted by e2e-specs per its handoff).

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: Browser Minor 1 (panel is a snapshot), Maintainability Major 1 (second hover controller), Major 2 (`parseAddedDirs` loop), Major 3 (`writeText` / `setText`), Minor 1 (folder label in three places). Browser Decision 1 settled as B: no row cap, no `+K more` line added.

**Changes made**

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/render/hovertip.ts` | created | `createHoverTip(build)`: the one delayed-hover lifecycle (timer, open panel, close, `mouseenter`/`mouseleave`/`pointerdown`) plus `show`, `refresh`; owns `POPOVER_DELAY_MS` |
| `web/src/render/grouppopover.ts` | modified | `createGroupPopover` is `createHoverTip(buildPanel)` plus its own focus/blur listeners; exported API unchanged (`POPOVER_DELAY_MS` re-exported) |
| `web/src/render/locationpanel.ts` | modified | `createLocationPanel` is `createHoverTip(buildPanel)`; the interface gains `refresh()` |
| `web/src/render/cardtip.ts` | modified | imports `POPOVER_DELAY_MS` from `hovertip.ts`, its owner |
| `web/src/features/focus.ts` | modified | `renderView` calls `locationPanel.refresh()` straight after `renderMainhead` |
| `web/src/protocol/session.ts` | modified | `addedDirs` decodes through `parseListOf(raw, parseClaudeLocation)`; `parseAddedDirs` deleted |
| `web/src/dom.ts` | modified | `setText` (write-if-changed) exported; `render/context.ts` and `render/repolines.ts` call it, their private copies deleted |
| `web/src/sessions/card.ts` | modified | `folderName(repo, directory)` is the one repo-name-else-basename rule; `partsOf`/`repoParts` take `slash`, `mainheadMeta` passes `addedCount === 0`, the regex is gone |
| `web/src/sessions/locationpanel.ts` | modified | `rowOf` uses `folderName` |

**Every path that exhibits each defect, and how it is closed**
- Snapshot panel, paths: (a) session ends, (b) added-directory branch changes, (c) the focused session is removed, (d) any other field of the model changes (launch branch, `↳` row, heading count). All four are one mechanism: while open, `refresh()` re-reads the model getter each render pass (the 1 s tick and every upsert), closes on `null` (c), and rebuilds when the model's JSON differs from the open one (a, b, d). Browser view switch to Tiles is unchanged (`renderView` does not run there; the existing `focusChanged` close stays).
- Duplicate hover controller, sites: `rg -n 'POPOVER_DELAY_MS|mouseenter' web/src --glob '!*.test.ts'` now finds the timer/listener lifecycle only in `hovertip.ts`. `cardtip.ts` has its own `mouseenter` path, but it is a per-card anchored text refresh that keeps its panel across cards (different lifecycle: `anchor === timer` guard, `cardtip.refresh`), so it is not the same idea; it only takes the delay constant from its owner.
- `protocol/` array loops: `rg -n 'Array.isArray' web/src/protocol --glob '!*.test.ts'` leaves only `decode.ts`.
- Write-if-changed copies named by the review (`writeText`, `setText`): one `dom.setText`. Other inline `if (x.textContent !== y) x.textContent = y` lines (`masthead.ts`, `mainhead.ts`, `selectbar.ts`, `readerfind.ts`, `railsections.ts`, `cardtip.ts`) predate this plan and were not changed.
- Folder label: `rg -n 'basename\(' web/src/sessions --glob '!*.test.ts'` finds `folderName` only; `rg -n "replace\(/ " web/src/sessions/card.ts` finds nothing.

**Repro re-run** (temporary Playwright spec, deleted; scratch daemon, mouse resting on `.loc`, no mouse move after open):
- before ends: `ADDED DIRECTORIES · 2`, both rows `· main`.
- after `git checkout -b while-open` in the first added directory: panel text row reads `muster-e2e-loc-IlNYqD · while-open`, tooltip count 1.
- after `POST /api/sessions/{id}/end`: header suffix gone, panel text is `LOCATION` + the launch row only, no `ADDED DIRECTORIES`, tooltip count 1.

**Gates**: `npx tsc --noEmit` 0, `npm run build` 0, `npm run -s lint` clean, `make contrast` 0 failures, `npx vitest run` 98 files / 2806 tests passed (no test file needed repair). `make web-build build` then `npx playwright test e2e/added-dirs.spec.ts e2e/card-location.spec.ts e2e/groups.spec.ts e2e/focus-header.spec.ts`: `189 passed (3.6m)`.

**Decisions**
- design: `render/hovertip.ts` takes `render/`'s controller shape (an instance holding its own timer/panel, `createX()` returning a handle), found by `rg -n 'mouseenter' web/src`: `grouppopover.ts` and the former `locationpanel.ts` were the two copies, `cardtip.ts` is the different one above. It is generic over the model (`createHoverTip<M>(build)`), which is the type parameter the review says the old copy confused for a different idea. The group popover keeps its focus path in its own `attach`.
- design: `refresh()`'s cache key is `JSON.stringify(model)`: the whole model, so it covers every input to `build` (heading count, each row's folder, branch, path, the `↳` row), not just visible text. An unchanged model leaves the open node alone; a changed one is replaced. A panel is `pointer-events: none` with no focus, caret or scroll state, so replacing it loses nothing browser-only.
- design: the panel's state is owned by the `createHoverTip` instance inside each controller; `focus.ts` triggers `refresh` from `renderView` only. The group popover does not call `refresh` (snapshot at open, as before).
- design: size warning kept: `web/src/sessions/card.ts` is 504 lines (threshold 500, was 494 at the start of this wave). The added lines are `folderName`, the one home of the repo-name-else-basename rule, and `partsOf`'s `slash` parameter; moving `folderName` to `sessions/paths.ts` would put a `SessionRepo` rule into a module that says it is path-only.
- design: `rowOf`'s branch rule (`repo?.branch ?? null`) differs from `partsOf`'s (`"—"` for a null branch, worktree marker): they are different displays, so only the folder rule was shared.
- doc-delta: `docs/diagrams/web-components.md` — `render/` gains `hovertip.ts`: the module count 42 becomes 43.
- doc-delta: `docs/features/focus/spec.md` — the open location panel follows the focused session (rebuilt when its model changes, closed when the session is gone); it never keeps an Added section after the session ends.
- doc-delta: `web/src/render/CLAUDE.md` Owns line and the focus/groups feature file registration (`kb.yaml`) — add `hovertip.ts` beside `grouppopover.ts`.

**Handoff**
- Test files broken by this wave: none (`npx tsc --noEmit` 0, vitest 2806 passed).
- New user-visible behaviour for e2e-specs (wave 3): the open location panel follows the focused session while the mouse rests on the readout. With the panel open, an added directory's branch change shows within one poll plus one render pass, and a session ending drops the `Added directories · N` section (the Location row stays).
- web-tests, unit coverage to add: `render/hovertip.ts` (`refresh` rebuilds on a changed model, keeps the node on an equal one, closes on `null`, no-op while closed; `show` does nothing on `null`); `sessions/card.ts` `folderName`, and `repoParts(session, false)` carrying no slash; `parseListOf` path for `addedDirs` (already covered by `protocol/session.test.ts` malformed-entry cases, which still pass).
