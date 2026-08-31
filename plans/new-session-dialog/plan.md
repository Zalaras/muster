# Plan: New Session Dialog

**Created**: 2026-08-30
**Status**: completed
**Work Type**: web
**E2E Scope**: new-specs
**Description**: Rebuild the launch dialog as a Finder-style picker — recents sidebar + clickable breadcrumb + one child listing where the listed directory *is* the selection — with segmented Model (adds `fable`) and Start-in controls and a stacked full-width form.

## Overview

The M1 launch dialog stacks three zones (MRU list, a Browse… button that unfolds a panel, the
form) and makes directory choice a two-step ceremony: navigate, then press "Use this folder".
It has no sense of place (one raw path string and an Up button), the dialog grows and shifts
when the browser opens, and the Model/Start-in radios wrap inside a 90px-label grid so they
read as squashed prose. `TODO.md` Pre-v1 Cleanup names all of this, and also parks the "add
Fable to the launch model select" half of the usage-model item here.

Design settled 2026-08-30 from a visual comparison (this session's artifact; the chosen render is
`plans/new-session-dialog/mockup.html`, the design authority for this plan): **option B,
"sidebar + list"** — the macOS Open-panel idiom. A persistent **Recent** sidebar (the MRU list)
sits beside a browse pane made of a **clickable breadcrumb** over a **single child listing**. The
directory currently listed is the selection; descending changes it, a crumb click or ⌘↑ goes
back up, clicking a recent navigates the browser there and restores that directory's last-used
model and mode. Below the picker a stacked form — Title, Model, Start in, each on its own
full-width row — with Model and Start in as **segmented controls** (radio inputs styled like the
Focus/Tiles switcher, design-system §4.1); Model gains a `fable` preset (a valid alias in the
installed Claude Code 2.1.251 — measured, see Implementation Notes). The footer always states
what will launch: `Launch in <path>`. Dialog width is fixed at 720px, capped at the viewport;
panes scroll internally. Rejected in the same session: A (Finder columns — wider, weaker MRU
columns), C (path field with completion — weak for exploring), and four "squash the Title into
existing chrome" placements (header / footer / strip / right column) — Damian wants plain rows.

No protocol change: `GET /api/browse` already returns `path`, `parent` and `dirs`, and `GET
/api/repos` already carries `branch`, `lastModel` and `lastPermissionMode`. Dotfiles stay
excluded (§3.6) — decided, not a gap. Web-only plan; daemon untouched.

## Requirements

### Must Have
- [ ] REQ-1: The dialog is a 720px-wide modal (`max-width: calc(100vw - 32px)`) whose height does not change as the user navigates — the picker area is a fixed-height region (300px) whose sidebar and listing scroll internally.
- [ ] REQ-2: The picker has two panes side by side: a **Recent** sidebar (MRU list from `GET /api/repos`, order as served) and a **browse pane** (breadcrumb + child listing from `GET /api/browse`). There is no Browse… button, no browse panel to unfold, no Up button and no "Use this folder" button.
- [ ] REQ-3: **The listed directory is the selection.** Whatever `path` the browse pane currently shows is what `POST /api/sessions` will launch into; the footer readout `Launch in <path>` always equals it. There is no separate "apply" step.
- [ ] REQ-4: Clicking a child entry navigates into it (one `GET /api/browse?path=<child>`), replacing the listing and the breadcrumb, and thereby changes the selection.
- [ ] REQ-5: The breadcrumb renders every ancestor of the listed path as a clickable segment (root `/` first, then each path component); clicking one navigates there. The last component is the current directory, rendered as the highlighted non-clickable segment.
- [ ] REQ-6: ⌘↑ while the dialog is open navigates to the parent of the listed directory (same as clicking the last clickable crumb); it is a no-op when there is no parent crumb.
- [ ] REQ-7: Clicking a recent navigates the browse pane to that directory (it becomes the selection), marks that recent as the active one (`aria-pressed="true"`), and sets Model and Start in to the recent's `lastModel` / `lastPermissionMode` (falling back to `sonnet` / `default` when null). Navigating anywhere else clears the active mark.
- [ ] REQ-8: On open the dialog resets the form, loads recents, and navigates the browse pane to the **first recent** if there is one, otherwise to the browse root (`GET /api/browse` with no `path`). The first recent's model/mode are applied exactly as in REQ-7, so ⌘N ⏎ relaunches the most recent directory with its last settings.
- [ ] REQ-9: Model is a segmented radio group with presets `sonnet`, `opus`, `haiku`, `fable`, plus `other…` which reveals a `Custom model` text row beneath it (hidden otherwise). The submitted `model` is the preset value verbatim, or the trimmed custom text when `other…` is chosen; an empty custom model blocks submit with `Enter a model.` as today.
- [ ] REQ-10: Start in is a segmented radio group `default` · `plan` · `auto-accept`, mapping to `permissionMode` `default` / `plan` / `acceptEdits` exactly as today.
- [ ] REQ-11: The form is stacked in the order Title, Model, (Custom model), Start in — one field per row, label column left, control spanning the rest — followed by the error line and the footer (readout · Cancel · Launch). Launch is the single filled-amber primary action (design-system §3).
- [ ] REQ-12: A recent whose `lastModel` is not one of the presets (e.g. `claude-opus-4-8`) selects `other…` and fills the custom field with it (current behaviour, preserved).
- [ ] REQ-13: A failed `GET /api/browse` (404/400/network) leaves the listing, breadcrumb and selection exactly where they were and shows the error message in `#launch-error` (role=alert); a later successful navigation clears it. A failed `GET /api/repos` shows the error the same way and renders the sidebar empty-state.
- [ ] REQ-14: Every existing launch behaviour outside the dialog's internals is unchanged: ⌘N opens it from anywhere (swallowing the browser's ⌘N even when already open), both `New session` buttons (rail and Tiles toolbar) open it, a launch from Tiles is promoted into the grid, the 201 `Session` is upserted immediately via `onLaunched`, Cancel closes, `Esc` closes (native `<dialog>`).

### Should Have
- [ ] REQ-15: Keyboard traversal of the listing: with focus on a child entry, ↑/↓ move focus between entries and ⏎/→ descend (buttons already activate on ⏎; ← is ⌘↑'s synonym only when focus is inside the listing).
- [ ] REQ-16: The child listing shows `loading…` while a browse request is in flight and `No subdirectories` when `dirs` is empty; the sidebar shows `No recent directories` when there are no repos.
- [ ] REQ-17: The footer readout appends ` · <branch>` when the selection came from a recent with a non-null `branch`; it shows the bare path otherwise (the browse endpoint does not report the listed directory's own branch — honesty rule: never invent one).

### Nice to Have
- [ ] REQ-18: Each recent's `title` attribute is its full path (the sidebar shows name · branch · age only), and each crumb's `title` is the absolute path it navigates to.

## Protocol Contract

No protocol changes. The dialog consumes `GET /api/repos` (§3.2), `GET /api/browse` (§3.6) and
`POST /api/sessions` (§3.1) exactly as documented. The `fable` preset is just another
non-empty `model` string passed to `--model` verbatim, which §3.1 already allows. Doc-only
upkeep (orchestrator, see Implementation Notes): §3.1's request comment "UI offers
sonnet/opus/haiku presets" gains `fable`.

## Schema Changes

No schema changes required.

## UI Specifications

Design authority: `plans/new-session-dialog/mockup.html` (open it in a browser — it renders
standalone with the live tokens). Transcribe names and structure from it, not from this prose.

### Views
- `#launch-dialog` (the only view touched). Structure, top to bottom:
  1. `<h2 id="launch-dialog-title">New session` + a decorative `⌘N` kbd (`aria-hidden`).
  2. `.picker` — CSS grid `200px 1fr`, height 300px, bottom hairline:
     - `<aside class="recents" aria-label="Recent directories">` → `.side-head` "Recent" + `#mru-list` of `<button class="dir" aria-pressed>` entries (`.dir-name`, `.dir-meta` › `.dir-branch`, `.dir-age`), or `<p class="empty">No recent directories</p>`.
     - `.browse` → `<nav id="browse-crumbs" aria-label="Path">` (ancestor `<button data-path>`s separated by `aria-hidden` `›`, then `<span aria-current="location">` for the listed directory, then a decorative `⌘↑` kbd) over `#browse-dirs.entries` of `<button class="entry">` (`.nm` name + optional `.git` ` (git)` + `aria-hidden` `.chev`), or `<p class="empty">No subdirectories</p>` / `<p class="loading">loading…</p>`.
  3. `<form id="launch-form">` → `.fields` grid `70px 1fr`: Title label+input; `<fieldset class="seg"><legend>Model</legend><div class="seg-track" role="radiogroup" aria-label="Model">` of `<label><input type=radio name=model value=…>text</label>`; Custom model label+input (both `hidden` unless `other…`); the Start in fieldset likewise (`name="permission-mode"`).
  4. `<p id="launch-error" role="alert" hidden>`.
  5. `.modal-foot` → `<span id="launch-target">Launch in <b>path</b><span class="branch"> · branch</span></span>` (branch span absent/hidden when unknown), `#cancel-button`, `#launch-button` (type=submit, `.btn.key`).
- The segmented control is **radio inputs**, visually hidden inside their labels (`opacity:0; position:absolute; inset:0`), with `label:has(input:checked)` taking `--panel2`/`--paper` and `label:has(input:focus-visible)` an amber 1px inset outline. Native radio semantics and keyboard (←/→ within a group) come for free; `getByRole("radio", { name })` keeps working.
- Removed from `index.html`: `#browse-button`, `#browse-panel`, `#browse-path`, `#browse-up`, `#use-this-folder`, `#selected-directory`, the `.radios` fieldsets, `#subdir-entry-template`'s bare-text button (replaced by the `.entry` template). `#mru-entry-template` is reshaped to the sidebar entry.
- Styling: tokens only (design-system §1); mono 9.5–11.5px for every path, crumb, entry, label and readout (§2); `tabular-nums` on `.dir-age`; no radius above 2px; `--amber` appears only on the Launch button, the active-recent inset stripe and the focus ring — never as a hover colour.

### User Flows
1. **Relaunch last directory**: ⌘N → dialog opens, sidebar lists recents, first recent is pressed, breadcrumb+listing show that directory, Model/Start in show its last-used values, footer reads `Launch in <that path> · <branch>` → ⏎ → 201 → dialog closes, card appears.
2. **Launch into a new directory**: ⌘N → click crumb `code` → listing shows `code`'s children → click `spikes` → click `new-thing (git)` → footer reads `Launch in …/spikes/new-thing` (no branch) → choose `fable` → type a title → Launch.
3. **Switch recent**: click `mdrostering` in the sidebar → browser jumps there, `mdrostering` pressed, Model flips to its last model, Start in to its last mode.
4. **Custom model**: click `other…` → `Custom model` row appears → type `claude-opus-4-8` → Launch sends it verbatim.
5. **Browse error**: a directory vanishes between listing and click → click its entry → 404 → `#launch-error` shows the daemon's message; breadcrumb, listing and footer unchanged; click another entry that exists → error clears, navigation proceeds.

### States
- **No data yet** (requests in flight on open): sidebar shows `Recent` heading with nothing beneath until repos arrive; listing shows `loading…`; footer reads `Launch in` with an empty path placeholder `—`; Launch is enabled but submit with no selection shows `Choose a directory to launch into.` (today's guard). Never render a fake path.
- **Data**: as in the mockup.
- **Daemon down**: fetches fail → `#launch-error` shows the API error. The sidebar renders its empty state; the listing renders **nothing** (an empty region) — never `No subdirectories`, which would claim knowledge Muster does not have. The daemon-down banner (`banner.ts`) is unchanged and remains the daemon-down surface.

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Launch dialog | `dialog` | `New session` | unchanged (`aria-labelledby`); the heading's textContent is `New session ⌘N` but the kbd is `aria-hidden` so the accessible name stays `New session` |
| New session buttons (rail, Tiles toolbar) | `button` | `New session` | unchanged |
| Recent sidebar | `complementary` | `Recent directories` | `<aside aria-label>` |
| Recent entry | `button` | `/^<name>/` | textContent is `<name><branch-or-—><age>` with no separators — match on the leading name; `aria-pressed` `true` for the active recent; `title` = full path (REQ-18) |
| Recent empty state | — | `No recent directories` | `<p class="empty">` |
| Breadcrumb | `navigation` | `Path` | `<nav aria-label="Path">` |
| Ancestor crumb | `button` | exact component name, root is `/` | `data-path` attribute carries the absolute path |
| Current crumb | — | the listed directory's basename | `<span aria-current="location">` inside the nav; no role asserted |
| Child entry | `button` | `^<name>( \(git\))?$` | `.chev` is `aria-hidden` so it is not part of the name; identical pattern to today's spec regex |
| Listing empty / loading | — | `No subdirectories` / `loading…` | `<p>` inside `#browse-dirs` |
| Title | `textbox` | `Title` | `<label for>` |
| Model group | `radiogroup` | `Model` | explicit `role="radiogroup" aria-label` on `.seg-track` |
| Model options | `radio` | `sonnet` · `opus` · `haiku` · `fable` · `other…` | note the ellipsis character `…` (U+2026), transcribed from the mockup |
| Custom model | `textbox` | `Custom model` | hidden unless `other…` checked |
| Start in group | `radiogroup` | `Start in` | as Model |
| Start in options | `radio` | `default` · `plan` · `auto-accept` | values `default` / `plan` / `acceptEdits` |
| Launch target readout | — | `/^Launch in /` | `#launch-target`; `b` holds the path; `.branch` span holds ` · <branch>` when present |
| Error | `alert` | — | `#launch-error`, text is the API message |
| Cancel / Launch | `button` | `Cancel` / `Launch` | unchanged |

### Invariants

- **INV-1 — readout equals selection equals listing.** At all times while the dialog is open, `#launch-target b`'s text, the path that `POST /api/sessions` would send, and `#browse-crumbs`'s composed path (crumb buttons + current span joined by `/`) are the same string. Source states to assert from: after open with recents; after open with no recents (root); after a child click; after a crumb click; after ⌘↑; after a recent click; after a failed browse (unchanged from before the failure); after a failed launch (unchanged).
- **INV-2 — exactly one active recent or none.** At most one `.dir[aria-pressed="true"]`; it is the one whose path equals the selection, and there is none when the selection is not a recent's path. Assert after each transition in INV-1's list — in particular after navigating *away* from a recent via a child click (the mark must clear) and after navigating *onto* a recent's path via crumbs (the mark may set — implement as "pressed iff path matches", so it does).
- **INV-3 — a browse failure never moves anything.** Breadcrumb, listing, selection, readout and the pressed recent are byte-identical before and after a failed `GET /api/browse`; only `#launch-error` changes.
- **INV-4 — the dialog's box does not change size on navigation.** `#launch-dialog`'s bounding height after open equals its height after any sequence of child/crumb/recent clicks (the `other…` reveal of the Custom model row is the one permitted height change, and it is form-driven, not navigation-driven).

## Affected Files

### Web
- `web/index.html` — rewrite the `#launch-dialog` markup to the mockup's structure (sidebar + browse pane, breadcrumb nav, stacked segmented form, footer readout); reshape `#mru-entry-template`; replace `#subdir-entry-template` with the `.entry` shape; delete the Browse…/panel/Up/Use-this-folder/`#selected-directory` elements.
- `web/src/render/launch.ts` — `LaunchModalElements` gains `crumbs`, `launchTarget`, `browseEmpty/loading` handling and loses `browseButton`/`browsePanel`/`browsePath`/`browseUpButton`/`useThisFolderButton`/`selectedDirectoryDisplay`; selection derives from the current `BrowseResult.path`; `navigate(path)` is the single entry point used by child clicks, crumb clicks, ⌘↑, recent clicks and open; recents restore model/mode; `MODEL_PRESETS` gains `fable`; ⌘↑ handler scoped to the open dialog.
- `web/src/render/crumbs.ts` (new) — pure `splitCrumbs(path: string): { name: string; path: string }[]` (root `/` first; `"/a/b"` → `[{/,/},{a,/a},{b,/a/b}]`) plus a tiny DOM `renderCrumbs(nav, crumbs, onNavigate)`; the pure half is what web-tests unit-tests.
- `web/src/style.css` — replace the `.picker`/`.browse-*`/`.subdir`/`fieldset.radios`/`.field-row` block (lines ~1296–1490) with the mockup's `.picker`, `.recents`, `.browse`, `.crumbs`, `.entries`, `.fields`, `fieldset.seg`/`.seg-track`, `#launch-target` rules; `dialog.modal` width 720px for the launch dialog only (confirm dialogs keep 440px via `dialog.confirm`).
- `web/src/main.ts` — update the `launchModalElements` wiring to the new element set (`requireElement` ids per the mockup).
- `web/e2e/launch.spec.ts`, `web/e2e/tiles-launch.spec.ts` — **owned by e2e-specs**, listed here only so the change is expected: every `Browse…` / `Up` / `Use this folder` / `#selected-directory` step is rewritten to crumb/entry navigation; radio names `other`→`other…`, `Claude Code default`→`default`, `plan mode`→`plan`.

## Edge Cases

1. **Open with zero recents** → browse root listed, sidebar `No recent directories`, no pressed recent, footer shows the root path. Launch works from there.
2. **First recent's directory no longer exists** → the open-time browse 404s. Without a fallback there would be no crumbs to click, so open-time navigation is special: try the first recent; on failure **navigate to the browse root** instead. The root's success clears the error line (acceptable — the stale recent is visibly not pressed and the sidebar still offers it; clicking it later shows the 404 via REQ-13).
3. **Recent outside the browse root** (`-browse-root` narrower than the recent's path) → §3.6 says explicit absolute paths elsewhere stay browsable; crumbs render from `/` regardless of root; `parent` may be non-null above the root. No special casing.
4. **Browse root itself** (`parent: null`) → the breadcrumb still shows all ancestor components as buttons (they are explicit absolute paths and therefore browsable per §3.6); ⌘↑ uses the crumb list, not `parent`, so it also works. `parent` is unused by the UI.
5. **Filesystem root `/`** → one current crumb `/`, no ancestor buttons, ⌘↑ no-op.
6. **Path with spaces or unicode** → crumbs split on `/` only; names rendered as text nodes (no HTML); `data-path` is the exact absolute string; E2E already runs from a space-bearing scratch dir so this is exercised for free.
7. **Rapid double-click on an entry** → the second click lands on the *new* listing's entry at that position (or nothing) — acceptable; but two in-flight browses must not race: a stale response (for a path that is no longer the requested one) is dropped. Implement with a request counter.
8. **Recent click while a browse is in flight** → the recent's navigation wins (counter bumps); pressed mark follows the final path (INV-2).
9. **`other…` selected then a recent with a preset `lastModel` clicked** → custom row hides, preset checked, custom text left in place (harmless, hidden) — as today.
10. **Launch fails (400/500)** → error shown, dialog stays open, nothing else moves (INV-3 applies to launch failures too — assert once).
11. **⌘↑ when focus is in the Title input** → still navigates (dialog-scoped, not listing-scoped) — Finder behaviour; the Title text is untouched.
12. **⌘N while open** → `preventDefault`, no reset (existing behaviour, REQ-14).
13. **Daemon restarts while open** → next fetch fails → REQ-13 path; the WS banner handles the rest. No dialog-specific handling.
14. **Very long path** → crumb bar scrolls horizontally inside the pane (`overflow-x:auto`); footer readout ellipsises from the right (CSS `text-overflow`); the dialog never widens (INV-4's sibling: width fixed).
15. **Hidden directories** → not listed (§3.6 excludes dotfiles; decided to keep). Typing is not offered, so a dotdir is unreachable from this dialog — accepted.

## Acceptance Criteria

IDs are unique across the whole section — `W*` web, `E*` e2e. One clause per criterion.

### Web
- **W1**: `make web-build` passes.
- **W2**: `make web-test` passes, including new unit tests for `splitCrumbs` (root, single component, nested, trailing slash tolerated, space-bearing component).
- **W3**: `web/index.html` contains no `#browse-button`, `#browse-panel`, `#browse-up`, `#use-this-folder` or `#selected-directory` element.
- **W4**: `MODEL_PRESETS` in `launch.ts` is exactly `sonnet, opus, haiku, fable`.
- **W5**: no hard-coded hex colour is introduced in `style.css` for this dialog (tokens only).
- **W6**: the segmented controls are native radio inputs — no element carries an explicit radio role attribute.
- **W7**: no `any` types in new/changed web code.
- **W8**: the stale-response guard exists (a browse response for a path other than the most recently requested is ignored).

### E2E
- **E1**: opening the dialog with two prior launches lists both recents, marks the most recent as pressed, shows its path in the breadcrumb and in `Launch in`, and restores its last model and mode as checked radios.
- **E2**: with no recents, the dialog opens on the browse root: crumbs compose to the root path, `Launch in` shows it, and nothing is pressed.
- **E3**: clicking a child entry descends: the entry's name becomes the current crumb, its parent becomes a crumb button, `Launch in` updates, and a git checkout entry is named `<name> (git)`.
- **E4**: clicking an ancestor crumb navigates up to that directory (listing shows the previously-current directory as an entry).
- **E5**: ⌘↑ navigates to the parent; at filesystem root it is a no-op.
- **E6**: clicking a second recent navigates there, moves `aria-pressed` to it, and swaps model/mode radios to that recent's last values.
- **E7**: after navigating to a recent, clicking a child entry clears every `aria-pressed="true"` (INV-2).
- **E8**: launching without any interaction after open (⌘N, ⏎) creates a session in the first recent's directory with its last model and mode (REQ-8), verified via the sqlite oracle (`session.directory`, and the repo's `last_model`).
- **E9**: launching into a fresh directory reached by crumbs+entries creates the session there and the card shows `first launch here`.
- **E10**: choosing `fable` launches with `model = fable` (oracle: the repo row's last model / the fake-claude argv capture the harness already records).
- **E11**: `other…` reveals `Custom model`; a custom string is submitted verbatim; empty custom model shows `Enter a model.`.
- **E12**: a browse 404 (directory removed after listing) shows the daemon's message in the alert and leaves crumbs, listing count, `Launch in` and pressed recent unchanged (INV-3); a subsequent successful navigation clears the alert.
- **E13**: the dialog's bounding height is identical after open and after a child click, a crumb click and a recent click (INV-4).
- **E14**: launching from the Tiles toolbar via the new picker still promotes the session into the grid (regression of `tiles-launch.spec.ts`).
- **E15**: `Escape`, `Cancel`, ⌘N-while-open behave as before (dialog closes / closes / stays open with no reset).

### Automated Checks

```checks
W1 make web-build
W2 make web-test
W3 ! rg -n 'id="(browse-button|browse-panel|browse-up|use-this-folder|selected-directory)"' web/index.html
W4 rg -n 'MODEL_PRESETS = \["sonnet", "opus", "haiku", "fable"\] as const' web/src/render/launch.ts
W6 ! rg -n 'role="radio"' web/index.html web/src
E1 make e2e
```

Scope notes for the negative greps: W3 and W6 cover `web/index.html` and `web/src` only — E2E and
unit tests are out of their net (a test may legitimately mention the removed ids in a comment).
Dry-run against this document: W3's pattern requires `id="…"` with a double-quoted attribute; this
plan writes the ids as bare `#browse-button` etc., so the plan itself is clean. W6's pattern (a
radio role attribute with the closing quote immediately after the word) appears nowhere in this
plan or the mockup — the mockup's `role="radiogroup"` is not matched by it. Dry-run 2026-08-30:
both greps exit 1 against `plan.md` and `mockup.html`, except for the W6 check line itself
inside the `checks` block (the pattern necessarily contains itself).

### Reviewer-Verified

- **W5**: no new hex colours in `style.css` for the dialog (tokens only).
- **W7**: no `any` types in new/changed web code.
- **W8**: stale-browse-response guard present and correct.
- **R1**: the rendered dialog matches `plans/new-session-dialog/mockup.html` at 720px — reviewer opens both and compares (sidebar width, crumb bar, segmented controls, stacked rows, footer readout).
- **R2**: `--amber` is used only for the Launch button, the pressed-recent stripe and the focus ring (design-system §3).
- **R3**: all metadata/paths/labels are `--mono` at 9.5–11.5px (design-system §2).
- **R4**: E2E specs derive their locators from the Testable UI Elements table (radio names include the `…` character; entry regex unchanged from M1).

## Implementation Notes

- **`fable` is a real alias — measured 2026-08-30** by static inspection of the installed
  `~/.local/share/claude/versions/2.1.251` bundle: the model-alias switch contains
  `case"fable":case"mythos":return 3` alongside `haiku`/`sonnet`/`opus`, and the resolver has a
  `case"fable"` branch. The preset therefore sends the literal string `fable`, exactly like
  `sonnet`. Pinned version is 2.1.246; the canary does not launch with `--model fable` (haiku
  only — subscription rule), so this stays a static fact recorded in `spikes/canary-fields.md`
  (orchestrator upkeep below). Nothing about it leaks into the daemon: `model` is passed
  verbatim (§3.1), so no `internal/claudecode` change.
- **Selection derives from `BrowseResult.path`, never from a separately stored string** — that is
  what makes INV-1 hold by construction. Keep a single `current: BrowseResult | null` and compute
  the readout, the crumbs and the submit body from it.
- **`navigate(path)` is the one door.** Child click, crumb click, ⌘↑, recent click and open all
  call it; it bumps a request counter, shows `loading…`, awaits `browse(path)`, drops the response
  if the counter moved on, then renders. Recent click additionally applies model/mode *after* the
  render succeeds (so a 404 on a recent leaves the form alone — INV-3).
- **Pressed recent is derived, not stored**: after every render, `pressed = repo.path === current.path`.
- **Crumbs**: `splitCrumbs` is pure and unit-tested; it must handle `/` (one crumb), reject nothing
  (browse already validated), and tolerate a trailing slash. Render ancestors as `<button
  data-path>` and the last as `<span aria-current="location">`. ⌘↑ reads the last button's
  `data-path`.
- **Segmented control = radios**: don't hand-roll a widget. `<label><input type=radio …>text</label>`
  with the input visually hidden; `:has(input:checked)` does the styling (Safari 15.4+/Chrome
  105+ — fine for a personal macOS tool). Existing `checkRadio`/`checkedValue` helpers carry over.
- **Custom model row**: label + input pair with `hidden` toggled on both (display:contents grid
  rows can't hide a wrapper; the two-element pair keeps the `70px 1fr` grid intact).
- **Height stability (INV-4)**: the picker is a fixed 300px grid; the listing and sidebar are
  `overflow:auto`; the error `<p>` reserves no space when hidden — so the only height change is
  the Custom model reveal and an error line appearing, both form-driven. E13 asserts the
  navigation-driven case only.
- **Removing the Up/Use-this-folder buttons removes existing E2E coverage paths**; e2e-specs
  rewrites `launch.spec.ts` and `tiles-launch.spec.ts` rather than adding beside them (the old
  flows no longer exist). `helpers/daemon.ts`'s `browseScratchDirectory()` and `-browse-root`
  plumbing are unchanged and still what E2/E3/E9 drive.
- **Doc upkeep (orchestrator, never web-impl)**: `TODO.md` — tick the Pre-v1 "Improve the Create
  new session dialog" item and note the Fable-in-model-select half of the usage item is now done;
  `docs/protocol.md` §3.1 request comment gains `fable` in the preset list (+ §9 changelog line,
  doc-only, no version bump); `docs/design/ux-flows.md` §1.1–1.2 — replace the ASCII picker/form
  with the sidebar+breadcrumb description and the segmented form (decision 4 in the table gains
  "segmented; `fable` preset"); `docs/design/design-system.md` §5 — add a **Segmented control**
  component line (mono 10.5px, `--line2` border, active segment `--panel2`/`--paper`; used by the
  view switcher and the launch form) and extend the Modal line with "launch dialog is 720px,
  confirms 440px"; `SPEC.md` §11 changelog entry for the ux-flows change; `spikes/canary-fields.md`
  — record the `fable` alias fact above with its version and method.
