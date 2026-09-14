# Plan: Markdown Render Fixes

**Created**: 2026-09-14
**Status**: completed
**Work Type**: web
**E2E Scope**: new-specs
**Fixture plan**: reader.spec.ts daemon (the new tests launch a session and assert reader-local state; the file's existing tests already take the per-test `daemon` fixture)
**Features**: reader
**Description**: One fixed, right-aligned nav-toggle arrow for the reader (#24), and a loading cue that never blanks a rendered body (#25).

## Overview

Two reported defects on the reader surface that landed in `a7ba245`, both purely in the
browser — no protocol change, no daemon change, no schema change.

**#24, the jumping arrow.** The nav-collapse control is two buttons, not one
(`web/src/render/reader.ts:400-425`): one inside `nav.rnav`'s header (`web/index.html:339`)
while the nav is open, one in `.docbar` (`web/index.html:332`) while it is collapsed, with
exactly one unhidden at a time (`ReaderRefs` calls them `openArrow` and `collapsedArrow`). They
land in different places for two independent reasons. The open one lost the `margin-left: auto` the mockup gives it
(`docs/design/mockups/markdown-viewing/gen.mjs:186` vs `web/src/style.css:998`), so it sits
next to the word "plan" at the *left* edge of the 236px nav column. The collapsed one is
only pushed right by `margin-left: auto` on `.docbar .chg` (`web/src/style.css:762`) — and
`.chg` is removed from the DOM entirely whenever no write has been seen for the open file
(`render/reader.ts:168`, REQ-24's default state), which is the normal case. With `.chg`
gone nothing pushes, so `pop out ↗` and the arrow bunch up immediately after `.path`.
That is exactly the report: "the arrow jumps to next to the path". This plan replaces the
pair with **one** button, permanently in the docbar and permanently pinned to its right
edge, whose glyph and `aria-expanded` change with the nav's state. The control then never
moves at all — which is the literal ask — and, because it is never hidden, the focus-restore
dance added by the `markdown-viewing` review's cycle-4 Major 1 has nothing left to restore
and goes with it.

**#25, no loading state.** `openFile` (`web/src/features/reader.ts:186`) sets `this.openPath`
and then awaits the fetch **without requesting a render**. Between the click and the content
there is no feedback at all: the bar still names the old file, `aria-current` has not moved
off it, and the body still holds the old document. The click looks like it did nothing. The
fix greys the reading area out for the duration and says what it is loading, split by what is
safe to overwrite. Where a document is already rendered, the body is dimmed rather than replaced
and the text cue goes on the reader's status line (`.reader-notice`, already `role="status"`):
the reader's existing failure surfaces (E25 for a deleted file, E26 for one over 10 MiB)
deliberately keep the last good render when an open fails, and a loading placeholder that
blanked the body would have to overturn that. Where nothing has
rendered yet — mount, and the pop-out's measured 139/172 ms first-paint window — the body
placeholder itself reads `loading…` instead of today's false `nothing open — pick a file`,
and the file tree carries a `loading…` row until the listing lands. A re-fetch of the file
you are already reading (`docChanged`, window focus, post-reconnect `snapshot`) stays
completely silent, so Claude saving the plan under you never flashes a cue.

Ahead of every cue, `openFile` gains a synchronous `requestRender()` before its await, so the
bar's filename and the tree's `aria-current` move on the click itself. That is the part that
answers "did my click register?" with zero latency and zero layout shift.

## Requirements

### Must Have

- [ ] REQ-1: The reader has exactly **one** nav-toggle button, in the docbar, present in every
  state — nav open or collapsed, session alive or dead, Focus host, tile host and pop-out —
  and never `hidden`.
- [ ] REQ-2: That button's right edge is at the same horizontal position whether the nav is
  open or collapsed, and whether or not the freshness cue is present.
- [ ] REQ-3: The button carries a stable accessible name (`File explorer`) and reports the nav's
  state on `aria-expanded`; its glyph is `›` while the nav is open and `‹` while it is collapsed.
- [ ] REQ-4: Keyboard-activating the button leaves focus on it, in both directions, on every host.
- [ ] REQ-5: The rest of the docbar no longer re-aligns when the freshness cue appears or
  disappears — `badge`, `fname`, `path`, `chg` and `pop out ↗` keep one left-to-right group and
  stay put.
- [ ] REQ-6: With the plan slot absent (a dead session), the nav's plan header row is absent too,
  leaving no empty padded strip at the top of the nav.
- [ ] REQ-7: Starting to open a file updates the bar (`fname`, `path`, plan badge) and the tree's
  `aria-current` synchronously, before the fetch resolves.
- [ ] REQ-8: While a user-initiated open is in flight **and a document is already rendered**, the
  reader's status line reads `loading <basename>…` and the body is left untouched.
- [ ] REQ-9: While nothing has been rendered yet, the body placeholder reads `loading…` — never
  `nothing open — pick a file` — until the listing resolves and either a file opens or nothing does.
- [ ] REQ-10: While the listing is in flight, the file tree shows a single `loading…` row.
- [ ] REQ-11: A re-fetch of the already-open file (`docChanged`, window `focus`, `snapshot`)
  shows no loading cue and never replaces the body with a placeholder.
- [ ] REQ-12: Every load terminates its cue — on success, on an API error and on a network
  failure — and a failed open with nothing rendered settles the body on `nothing open — pick a file`.
- [ ] REQ-13: `basename` and the loading-cue text live as pure functions in a new
  `web/src/reader/paths.ts`, Vitest-tested, with no DOM import.
- [ ] REQ-14: While a user-initiated open is in flight, the reading area is **greyed out** — the
  body dims and carries `aria-busy="true"` — and returns to full opacity when the fetch resolves,
  whether it succeeded or failed, without its content having been replaced.

### Should Have

- [ ] REQ-15: Daemon-down still wins the status line over the loading cue (design-system §6.7).
- [ ] REQ-16: Two readers mounted at once (two tiles on `docs`) show a loading cue only in the
  instance whose own fetch is in flight.

### Nice to Have

- [ ] REQ-17: The now-dead `.arr[hidden]` rule is removed from `web/src/style.css` along with the
  second arrow.

## Protocol Contract

No protocol changes. Both defects are browser-side rendering and controller state; the two
endpoints this feature uses (`kb:anchor/sessions.reader`, `kb:anchor/sessions.reader-file`) and
`kb:anchor/ws.doc-changed` are called exactly as they are today, with no change to request
shape, response shape, cadence or count. The feature's own INV-5 ("no polling", pinned by E14 of
`web/e2e/reader.spec.ts`) is unaffected — this plan adds no fetch.

## Schema Changes

No schema changes required.

## UI Specifications

### Views

- **Reader (`.reader`)** — all three hosts (Focus main slot, tile body slot, `/doc.html`),
  cloned from `#reader-template` in `web/index.html` and `web/doc.html`, which stay byte-identical.

### The nav toggle (#24)

The `.rnav .hd` arrow (`web/index.html:339`, `web/doc.html:42`) is **deleted** from both
templates. The docbar arrow (`web/index.html:332`, `web/doc.html:35`) survives as the only one,
retargeted:

```html
<button type="button" class="arr" data-role="arr-nav" aria-label="File explorer" aria-expanded="true">›</button>
```

It stays the last child of `.docbar`. `renderReader` sets, every pass:

- `aria-expanded` = `String(!vm.navCollapsed)`
- `textContent` = `vm.navCollapsed ? "‹" : "›"`

and never sets `hidden` on it. Both docbar and nav header carry `12px` side padding
(`web/src/style.css:720`, `:998`), so pinning the button to the docbar's right edge puts it at
the same horizontal position the mockup's nav-header arrow occupies — the control is where the
design intends, and it no longer moves.

CSS delta in `web/src/style.css`:

- `.docbar .chg` — **remove** `margin-left: auto`. It was the accidental aligner, and it made
  the whole right-hand group jump left the moment a freshness cue was absent (REQ-5).
- `.docbar .arr` — **add** `margin-left: auto`. The one auto margin in the bar, on an element
  that is always present, so the arrow is flush right in every presence combination
  (`.badge` absent, `.path` absent in a compact tile, `.chg` absent before any write,
  `.ib` hidden with nothing open).
- `.arr[hidden]` — remove (REQ-17); nothing hides the arrow any more.

`renderBar`'s two-anchor `setPresence` logic for `.path` (`render/reader.ts:171-179`) is
**unchanged** — it is about DOM order, which this plan does not touch.

### The loading cues (#25)

Four situations, distinguished by what is safe to overwrite:

| Situation | Text cue | Body content | Body dimmed |
|---|---|---|---|
| Listing in flight (mount, pop-out) | tree shows one `loading…` row | placeholder `loading…` | no |
| User-initiated open, nothing rendered yet | placeholder `loading…` (already showing) | placeholder `loading…` | yes |
| User-initiated open, a document is rendered | status line `loading <basename>…` | untouched | yes |
| Re-fetch of the open file | none | untouched until the new content lands | no |

**The grey-out (REQ-14).** `article.md` gains `aria-busy="true"` and a `loading` class while
`loadingPath !== null`; both are cleared on every resolution path. The CSS is two declarations:

```css
.md { transition: opacity 120ms ease; }
.md.loading { opacity: 0.4; }
```

Three reasons this shape rather than a modal or an overlay element. It never replaces or moves
anything, so `kb:adr/reader-loading-cue-never-clears-a-rendered-body`'s "keep the last render on a
failed open" holds by construction — a failed open simply un-dims the document that was already
there. It costs no new DOM and no new modal wiring, in a component cloned into up to eight hosts
at once. And the 120 ms fade **is** the flash protection: a fetch that resolves in 20 ms never
reaches a visible dim, while a slow one greys out fully, so no timer, threshold or delay
constant is needed anywhere in this plan. `opacity` also keeps `make contrast` out of it — that
gate polices colour literals (hex, `rgb()`, named colours), and this introduces none. A 120 ms
opacity fade is not motion and needs no `prefers-reduced-motion` branch; `web/src/style.css`
already ships two opacity transitions (`:1212`, `:1951`) without one.

Controller state added to `ReaderInstance` (`web/src/features/reader.ts`):

- `private loadingPath: string | null` — the absolute path of a user-initiated open in flight,
  `null` otherwise.
- `private bodyRendered = false` — set `true` the first time a document's fragment enters the
  body, never reset.

`loadingPath` drives both the status-line text and the grey-out, so the two can never disagree
about whether something is loading.

`openFile(absPath, opts: { showLoading: boolean })`. Callers: `decideInitialOpen`,
`maybeAutoOpenPlan`, `selectRelative` and `selectPlan` pass `true`; `handleDocChanged`,
`refetchOpenFile` and `handleWindowFocus` pass `false`. With `showLoading`, before the await:
set `openPath`, set `loadingPath`, clear `noticeText`, clear `outline` and `currentHeadingId`,
and call `requestRender()` (REQ-7). Every resolution path — success, API error, network error —
clears `loadingPath` behind the existing `disposed`/`fetchSeq`/`openPath` guard (REQ-12).

Status-line derivation, in a named helper so `render` stays under the cognitive-complexity
ceiling of 15 (`docs/conventions.md` § TypeScript / web):

```
!connected                                  -> UNREACHABLE_TEXT      (design-system §6.7, REQ-15)
loadingPath !== null && bodyRendered        -> `loading ${basename(loadingPath)}…`  (REQ-8)
otherwise                                   -> noticeText
```

Body placeholder transitions:

- constructor — `loading…` (replaces today's `nothing open — pick a file`, which is false while
  the listing is still in flight).
- listing resolves and nothing opens (no memory, no plan, or a pop-out with no `?path=`) —
  `nothing open — pick a file`.
- listing fails — `nothing open — pick a file`, with the error on the status line.
- open fails while `bodyRendered` is `false` — `nothing open — pick a file`.
- open fails while `bodyRendered` is `true` — **untouched** (E25/E26's existing contract).

### User Flows

1. The user opens `docs` on a session. The body reads `loading…` and the tree shows a `loading…`
   row. The listing lands; the tree fills; the plan opens and replaces the body.
2. The user clicks a file in the tree. The bar's filename, path and plan badge change and
   `aria-current` moves, immediately. The status line reads `loading <basename>…` over the
   document still on screen. The content lands; the status line clears.
3. The user clicks a file that is too large. The status line switches from the loading text to
   the `too_large` message; the previously open document stays on screen (unchanged from today).
4. Claude writes the open file. The reader re-fetches silently; the new content replaces the old
   with no cue at any point.
5. The user presses the nav arrow. The nav hides; the arrow stays exactly where it was, flips to
   `‹`, reports `aria-expanded="false"`, and keeps keyboard focus.

### States

- **No data yet**: the body reads `loading…` and the tree carries a `loading…` row; the file
  count element stays absent rather than rendering `0 .md` (unchanged —
  `kb:adr/usage-unknown-renders-word-not-track`'s rule applied to this surface).
- **Data**: as today, plus the loading cues above during transitions.
- **Daemon down**: `musterd unreachable — showing last render` takes the status line over any
  loading cue (REQ-15); the in-flight fetch rejects through `safeFetch`'s `networkError`
  (`web/src/api.ts:723`, `:735`), so the cue always terminates.

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Nav toggle | `button` | `File explorer` | `aria-label`; `aria-expanded` `true`/`false`; text `›` open, `‹` collapsed. Distinct from the Files section toggle's name (`Files`), so both stay unambiguous inside the reader region |
| Files section toggle | `button` | `Files` | unchanged |
| Outline section toggle | `button` | `Outline` | unchanged |
| Reader status line | `status` | `/^loading .+…$/` while loading | `.reader-notice`, already `role="status"`; `hidden` when there is nothing to say |
| Body loading placeholder | — | `loading…` | `article.md > p.placeholder`; no implicit role on either element |
| Reading area while loading | — | — | `article.md` carries `aria-busy="true"` and class `loading`; the attribute is the durable oracle, never the computed opacity, which is mid-transition |
| Tree loading row | — | `loading…` | one `div` inside `[data-role="tree"]`, styled like `.f.none`; not focusable, so not a button |
| Nav plan header row | — | `plan` | `[data-role="plan-header"]`; absent entirely on a dead session (REQ-6) |

### Invariants

Named rather than numbered, because the `reader` feature already carries an INV-1..INV-8 series
from the `markdown-viewing` plan and a second numbering would collide with it.

- **INV-ONE-ARROW** — *exactly one, never hidden*: a mounted reader contains exactly one nav-toggle
  button and it is never `hidden`, asserted from every reachable source state: nav open and
  collapsed, session alive and dead, listing pending and loaded, Focus host, tile host (2×2 and
  3×2, where the nav mounts collapsed) and the pop-out page.
- **INV-ARROW-FIXED** — *the arrow does not move*: the button's bounding-box right edge is identical
  (within 1px) across a nav toggle, and across the first freshness cue appearing. Asserted in
  Focus and in a tile.
- **INV-NO-STRANDED-BODY** — *the body is never stranded*: once every in-flight fetch for an instance has
  resolved, the body holds either rendered content or `nothing open — pick a file` — never
  `loading…`. Asserted from each terminating path: success, `not_found`, `too_large`,
  `unknown_session`, `directory_missing` and a dead daemon.
- **INV-REFETCH-NEVER-BLANKS** — *a re-fetch never blanks*: no code path reachable from `handleDocChanged`,
  `refetchOpenFile` or `handleWindowFocus` calls `setReaderBody` with a placeholder, and none of
  them sets `aria-busy` — a silent re-fetch neither clears nor greys the body.
- **INV-DIM-ALWAYS-LIFTS** — *the grey-out always lifts*: after every in-flight fetch for an
  instance has resolved, `article.md` carries no `aria-busy`, asserted from each terminating
  path — success, `not_found`, `too_large`, `unknown_session`, `directory_missing` and a dead
  daemon — and in each host (Focus, tile, pop-out).
- **INV-CUES-PER-INSTANCE** — *cues are per-instance*: with two readers mounted (two tiles on `docs`), a load in
  one shows no cue in the other, and the bystander's body and status line are untouched.

### Carried-over measurements

- The pop-out's 139/172 ms first-paint figure comes from the `markdown-viewing` review cycle 6
  (recorded in `TODO.md` § Pre-v1 Cleanup) and was measured on `/doc.html` — the same page and
  the same fetch pair this plan changes, on the same build. Re-checked against this plan's
  change: still valid, because the plan adds no request and reorders none; it only changes what
  is painted inside that window. It is used here as motivation for REQ-9, never as a threshold —
  this plan sets no timer and no delay before showing a cue.
- The docbar and nav-header `12px` side paddings are read from `web/src/style.css` at this
  commit, not carried from an earlier measurement.

## Affected Files

### Web

- `web/index.html` — reader template: delete the arrow button inside `.rnav .hd` (line 339);
  retarget the surviving docbar button (line 332) to `data-role="arr-nav"`,
  `aria-label="File explorer"`, `aria-expanded="true"`.
- `web/doc.html` — the identical template edit; the two templates must stay byte-identical.
- `web/src/style.css` — `.docbar .chg` loses `margin-left: auto`; `.docbar .arr` gains it;
  `.arr[hidden]` removed; a rule for the tree's `loading…` row (reuse `.f.none`'s shape); the
  `.md` opacity transition and `.md.loading` dim.
- `web/src/render/reader.ts` — `ReaderRefs`: `navToggle` replaces `collapsedArrow` and
  `openArrow`, and `planLabel` goes (the whole header row is hidden instead); delete
  `prepareNavArrowFocusRestore` and its call; `renderReader` writes the arrow's glyph and
  `aria-expanded`; `renderPlanSlot` hides `[data-role="plan-header"]` when the slot is absent;
  `ReaderVM` gains `treeLoading: boolean` and `bodyLoading: boolean`, the latter applied to
  `article.md` as the `loading` class plus an `aria-busy` attribute that is *removed* rather
  than set to `"false"` when clear (matching how `aria-current` is handled); `renderTree` renders the single `loading…` row when
  it is set, with `"loading"` as that pass's structural signature.
- `web/src/features/reader.ts` — `loadingPath` and `bodyRendered` state; `openFile` takes
  `{ showLoading }` and renders synchronously before its await; the status-line derivation
  helper; the body-placeholder transitions; `treeLoading: this.listing === null` and
  `bodyLoading: this.loadingPath !== null` in the view
  model; imports `basename`/`loadingText` from the new module and drops its private `basename`.
- `web/src/reader/paths.ts` — **new**: `basename(path)` and `loadingText(path: string | null)`.
- `web/src/reader/CLAUDE.md` — add `paths.ts` to the **Owns** line (the hand-written half of a
  touched package's CLAUDE.md belongs to this impl track).

### Web unit tests

- `web/src/reader/paths.test.ts` — **new**: `basename` and `loadingText`.

### E2E

- `web/e2e/helpers/reader.ts` — replace `navArrowShow`, `navArrowHide`, `navArrowOpenNode` and
  `navArrowCollapsedNode` with a single `navToggle(region)`; add locators for the body loading
  placeholder, the tree loading row and the plan header row.
- `web/e2e/reader.spec.ts` — update E18, E22, E26, E27 and the cycle-4 arrow-focus test for the
  single button and the new failure/`loading` surfaces; add the new tests below.

`TODO.md`, `docs/adr/`, `SPEC.md`, `docs/features/reader/spec.md` and every generated kb file are
**not** listed above — see Implementation Notes → Doc upkeep.

## Edge Cases

1. A file fetch resolves after a newer open superseded it — the existing
   `disposed`/`fetchSeq`/`openPath` guard drops it, and it must not clear a newer
   `loadingPath`. → E6
2. The listing fetch fails (`unknown_session`, `directory_missing`) — the tree's `loading…` row
   is replaced by an empty tree, the body settles on `nothing open — pick a file`, and the
   message goes to the status line. → E14
3. A remembered open path names a file that has since been deleted, so the very first open fails
   with nothing rendered — the body must settle on `nothing open — pick a file`, never stay at
   `loading…`. → E14
4. An open fails while a document is rendered (a file over 10 MiB) — the loading cue is replaced
   by the error message, the grey-out lifts, and the rendered body is kept. → E12
5. A `docChanged` for the previously open file arrives while a *different* file's open is in
   flight — `openPath` has already moved, so it takes the `else` branch and only refreshes dots;
   the in-flight load is unaffected. → E10
6. The daemon dies mid-load — the unreachable text wins the status line, and the rejected fetch
   still clears `loadingPath`, so neither the cue nor the grey-out survives the reconnect. → E13
7. A dead session — the plan header row is absent entirely and the nav toggle still works. → E5
8. A 3×2 tile, where the nav mounts collapsed and neither `.path` nor the file count is rendered
   — the arrow is still present and still flush right. → E1
9. The pop-out opened with no `?path=` — the body must settle on `nothing open — pick a file`
   rather than sitting at `loading…` forever. → E11
10. Two tiles on `docs` at once — a load in one shows no cue in the other. → E15
11. The window regains focus while the plan is open, triggering a silent re-fetch. → E10
12. A user clicks the same file that is already open — a user-initiated open of the current
   path; the cue shows and clears normally, and the body is replaced by its own fresh render.
   → untested: indistinguishable at the DOM from E7/E8's different-file case, which already
   pins both the cue and the replacement.
13. `/clear` mints a new Claude session id in the same pane — no rule in this plan keys on
   `session_id`; the reader keys on the muster session id and the tmux target, exactly as today.
   → untested: this plan adds no `session_id`-keyed rule, so E5/E29's existing coverage is
   unchanged.

## Acceptance Criteria

IDs are unique across the whole section — `W*` web, `E*` e2e. There is no daemon track.

### Web

- **W1**: `make check` passes.
- **W2**: `make web-build` passes.
- **W3**: each reader template declares exactly one `class="arr"` button.
- **W6**: `prepareNavArrowFocusRestore` and the `.arr[hidden]` rule are gone, and no code path
  sets `hidden` on the nav toggle.
- **W7**: `web/src/reader/paths.ts` imports nothing DOM-bound and is covered by
  `web/src/reader/paths.test.ts`.
- **W8**: `web/src/reader/CLAUDE.md`'s **Owns** line names `paths.ts`.
- **W9**: the status-line text is derived in exactly one place, with daemon-down ahead of the
  loading cue.
- **W10**: `web/index.html` and `web/doc.html` hold `#reader-template` blocks that are identical
  to each other.

Biome's `suspicious` recommended set (`make web-lint`, inside W1) is what forbids `any` in the
new code — there is no separate criterion for it.

### E2E

- **E1**: with the nav open and then collapsed, the reader contains exactly one nav-toggle button
  and its right edge is the same in both states, in Focus and in a 3×2 tile.
- **E2**: keyboard-activating the nav toggle leaves focus on it, in both directions, on the Focus
  host and on the pop-out.
- **E3**: the nav toggle's `aria-expanded` is `true` while the nav is visible and `false` while it
  is not, and its glyph is `›` and `‹` respectively.
- **E4**: the nav toggle's right edge is unchanged after the first routed write makes the
  freshness cue appear.
- **E5**: on an ended session the nav's plan header row is absent and the nav toggle still hides
  and restores the nav.
- **E6**: with the file response held, clicking a tree file moves `aria-current` onto it and
  changes the bar's filename before the response is released.
- **E7**: with the file response held, the reader's status line reads `loading <basename>…` while
  the body still shows the previously open document.
- **E16**: with the file response held, `article.md` carries `aria-busy="true"`, and releasing the
  response clears it.
- **E8**: releasing the held file response clears the status line and renders the new document.
- **E9**: with the listing response held, the body reads `loading…` and the tree shows one
  `loading…` row.
- **E10**: a routed write for the open file, and a window `focus` event, each re-render the
  document without the status line ever showing a loading cue and without `article.md` ever
  carrying `aria-busy`.
- **E11**: a pop-out opened with no `path` query settles its body on `nothing open — pick a file`.
- **E12**: opening a file over 10 MiB clears the loading cue and the grey-out, shows the
  too-large message, and keeps the previously rendered document on screen.
- **E13**: stopping the daemon mid-load shows the unreachable text and leaves no loading cue once
  the daemon is restarted.
- **E14**: a reader whose remembered open path was deleted before mount settles its body on
  `nothing open — pick a file`, never on `loading…`.
- **E15**: with two tiles on `docs`, holding one tile's file response shows the loading cue in
  that tile only, leaving the other tile's status line hidden.

### Automated Checks

```checks
W1 make check
W2 make web-build
W3 [ "$(rg -o 'class="arr"' web/index.html web/doc.html | wc -l | tr -d ' ')" = "2" ]
W5 ! rg -n 'data-role="arr-(open|collapsed)"' web/
E0 make e2e
```

**E0** is the full-suite run; it is deliberately not an acceptance-criterion ID, since every
`E*` criterion is proved by it (the ID was `E15` until review cycle 1 caught the collision with
the two-tiles criterion of that name — IDs are unique across this section).

**W5** has no prose twin — it is purely the "no stale locator survives" gate for the deleted
button's `data-role`. Its grep covers `web/e2e/` as well as `web/src/` and the two templates
deliberately: the element is gone, so no test has a legal reason to name its old role, and the
E2E helpers must be renamed in the same change. The five files it currently reports —
`web/index.html`, `web/doc.html`, `web/src/render/reader.ts`, `web/e2e/helpers/reader.ts` and
`web/e2e/reader.spec.ts` — are each listed under **Affected Files** against their owning agent.

### Reviewer-Verified

- **W6**: `prepareNavArrowFocusRestore` and the `.arr[hidden]` rule are gone, and no code path
  sets `hidden` on the nav toggle.
- **W7**: `web/src/reader/paths.ts` imports nothing DOM-bound.
- **W8**: `web/src/reader/CLAUDE.md`'s **Owns** line names `paths.ts`.
- **W9**: the status-line text is derived in exactly one place, with daemon-down ahead of the
  loading cue.
- **W10**: the two `#reader-template` blocks are identical to each other.
- **E1**–**E15**: verified by `make e2e`; the reviewer additionally confirms each new test
  asserts a settled state rather than a transient one (a held route, never a race).

## Implementation Notes

### Testing the transient states

The loading cues are, by construction, short-lived on a localhost fetch of a scratch fixture, so
they must never be asserted by racing them. `web/e2e/actions.spec.ts:703-756` already holds the
real `GET /api/sessions/{id}/pane` response with a `page.route` handler awaiting a promise the
test resolves, to make exactly this class of interim state (`loading last screen…`) observable —
copy that shape for `/reader` and `/reader/file`. It uses no timer, so it stays clean under
`web/scripts/e2e-lint.sh` rule 3, and it delays the genuine round trip rather than fabricating a
payload.

### Why the second arrow goes rather than being re-aligned

Right-aligning both arrows would still leave a one-row vertical hop, because the nav header is
in grid row 3 and the docbar is row 1 (`web/src/style.css:710`). One button in the docbar is the
only arrangement where the control does not move at all. It also retires a defect class rather
than a defect: the `markdown-viewing` review's cycle-4 Major 1 found that toggling the nav hid
whichever arrow the user had just pressed, dropping focus to `<body>`, and fixed it with
`prepareNavArrowFocusRestore`. A single never-hidden button cannot reach that state. The
reviewer should read the deletion as intended, not as a lost fix — E2 is its replacement.

### Decisions this plan makes

Written as `status: proposed` ADRs on the plan branch at approval, flipped to `accepted` at
Completion:

- `kb:adr/reader-nav-toggle-is-one-fixed-button` — one nav-toggle button pinned to the docbar's
  right edge replaces the mockup's two-position arrow pair; the docbar's right-hand group stops
  re-aligning on the freshness cue's presence. Deviates from
  `docs/design/mockups/markdown-viewing/gen.mjs`'s static render, which was never exercised as a
  transition. `refs: [plan:markdown-render-fixes]`.
- `kb:adr/reader-loading-cue-never-clears-a-rendered-body` — a user-initiated open greys the
  reading area out (a dimmed `article.md`, `aria-busy`) and names the file on the status line,
  rather than replacing the body or opening a modal; the body placeholder carries the cue only
  while nothing has rendered; re-fetches of the open file are silent; the 120 ms opacity fade is
  the flash protection, so no timer or delay threshold gates any cue. Keeps REQ-6/REQ-28's "keep
  the last render on a failed open" (E25, E26) intact. `refs: [plan:markdown-render-fixes]`.

### Doc upkeep (orchestrator)

- `docs/features/reader/spec.md` — its § The reader paragraph lists the bar's parts including
  "nav arrow"; update it for the single fixed arrow and add the loading cues. Add `paths.ts`'s
  path to the `web:` frontmatter list if the glob does not already cover it (`web/src/reader/**`
  does).
- `TODO.md` — tick and move both entries (**Jumping file explorer arrow** [#24] and **No loading
  state for markdown files** [#25]) from § Reported issues to
  `docs/history/todo-done.md` under the same heading, keeping their full markdown links so
  `/triage --audit` still sees them as triaged.
- `docs/adr/` — the two ADRs above.
- Then `make gen-kb && make check-kb`; generated files ride the same commit.

### Out of scope

Two things noticed in this code that neither issue reports, left alone deliberately:

- `openFile` resets `currentHeadingId` to the first heading on every successful load, and
  `attachScrollSpy`'s `computeCurrent` only runs on `scroll`, so after a re-fetch the outline's
  `aria-current` sits on the top heading until the user scrolls. Pre-existing, unrelated to both
  issues, and fixing it would widen the change to the scroll-spy contract.
- The three `TODO.md` entries carried over from the `markdown-viewing` review (focus restoration
  on daemon drop, the pop-out's 1-2 frame unreachable flash, and a pop-out not following a live
  theme change) are separate backlog items and stay where they are.
