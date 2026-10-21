# Review: session-notes

**Plan**: session-notes
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser needs-changes, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Session notes

**Plan**: session-notes
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 64903 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes — `0018_note.sql`, `SessionRow.Note`, `Session.Note`, `sessionWire.Note` (no `omitempty`), `parseSession` requires the key | D8, store round-trip, W1, messages tests | pass |
| REQ-2 | Yes — `server/note.go` (RawMessage decode, 20 MiB `MaxBytesReader` on `maxIngestBodyBytes`), `session/note.go` blank-to-nil, verbatim otherwise | D1, D2, D3, D6 | pass |
| REQ-3 | Yes — `Manager.SetNote` is the only writer (`rg "\.Note\b" internal -g '!*_test.go'`: row mapping, restore, `note.go`) | D4 (9 states × 36 inputs, bystander) | pass |
| REQ-4 | Yes — Remove deletes the row; Stop, Resume, restart keep the note of every row reconcile keeps (as amended through E6 and kb:adr/notes-ended-row-sweep-takes-its-note) | D5, E6 (two tests) | pass |
| REQ-5 | Yes — the issue snapshot is an allowlist, nothing changed | D7 (sentinel extension) | pass |
| REQ-6 | Yes — `.ng` / `.ng has` in `render/mainhead.ts`, first child of `.idrow` | R1, R2, mainhead unit | pass |
| REQ-7 | Yes — anchored open, close by glyph, outside pointerdown, Escape inside | R13, E1, E-spec REQ-7/REQ-12 | pass |
| REQ-8 | Yes — view click/Enter edits, Escape and in-panel pointerdown leave edit | R11, R12, E1 | pass |
| REQ-9 | Partly — debounce and flush points are present, but every send reads its text back from the localStorage draft, so with storage unavailable nothing is sent (correctness Major 1) | W4, E1, E3, E4, E5 | fail |
| REQ-10 | Yes — drafts per session, resent on `snapshot`, dropped on remove and on a 404 | W3, E4, E8 | pass |
| REQ-11 | Yes — `unsavedStatus(saver.failed(id))`, `role="status"`, `--warn` | W5, R8, E8 | pass |
| REQ-12 | Yes — popped form ignores click-away and the glyph; pop-in, close, Escape inside | E9, E10, E-spec REQ-12 (two) | pass |
| REQ-13 | Yes — header drag and eight handles, 260×150 minimum | W2, R7, E12 | pass |
| REQ-14 | Yes — `clampRect` against the slot below the mainhead and effort strip | W2, R7 | pass |
| REQ-15 | Yes — `focusChanged` closes anchored and rebinds popped; closes with no focused session | E5, E11, E-spec REQ-15 (two) | pass |
| REQ-16 | Yes — `muster.note-panel` in session storage | E12, new-tab test | pass |
| REQ-17 | Yes — the slot has no client rects in Tiles, so the popped panel is hidden; anchored closes | R10 | pass |
| REQ-18 | Yes — `.mk` at the end of `.r2` and before `.ctxinfo` | R3, R4 (tile and strip), sessions/tiles unit | pass |
| REQ-19 | Yes — `createHoverTip`, `role="tooltip"` | R5 | pass |
| REQ-20 | Yes — `.nb.cut` at `12lh` with a mask, anchored `max-height`, popped body `overflow: auto` | R5, R6 | pass |
| REQ-21 | Yes — `adoptIncoming` keeps the shown text while editing | W6, E7, editing-window test | pass |
| REQ-22 | Yes — `renderMarkdown` + `buildFrontmatterNode` + `renderDiagrams` | R5, R9 | pass |
| REQ-23 | Yes — the only Escape listener is on the panel root | E10 | pass |
| DIAG | kb:diagram/store-schema, domain-model (updated, true); daemon-components (no new package or edge, true); web-components (stale: correctness Major 5) | — | fail |

## Build & Tests

E2E tests: pass (635, full — the gate ran `make e2e` with `SPECS=''`; `notes.spec.ts` 21/21) · Daemon tests (race): pass (27 packages ok) · Web tests: pass (2986 in 104 files) · Render tests: pass (405) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues; biome 406 files clean) — all read from $GATES_LOG_DIR

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D9 | `make test` | pass (02-test.log, deduped to test-race: 27 packages ok) |
| D10 | `make lint` | pass (03-lint.log, 0 issues) |
| D11 | `go build ./...` | pass (01-build.log, empty) |
| D12 | `make check-render-fixtures` | pass (06, 105 scenarios up to date) |
| W7 | `make web-test` | pass (05, 2986 passed) |
| W8 | `make web-build` | pass (04, built) |
| W9 | `make web-lint` | pass (09, 406 files clean) |
| W10 | `make contrast` | pass (10, 54 pairs × 3 themes, 0 failures) |
| R14 | `make render-test` | pass (08, 405 passed) |
| E13 | `make e2e` | pass (21, 635 passed) |
| K1 | `make check-kb` | pass (14, 627 records, 0 problems) |
| gates | render-lint, e2e-lint, e2e-honest, features-inventory, versions, features scope, comments, comment ledger | pass (07, 15, 13, 11, 12, 16, 17, 18) |
| gates | size / e2e-level | WARN only (19: review-maintainability's; 20: census, no `notes.spec.ts` line) |
| DOC | doc upkeep + Doc Delta vs what shipped | FAIL — ADRs present, `proposed`, `refs: plan:session-notes`, no `deviation:` line; `TODO.md` #95 is ticked at Completion per the plan. The Doc Delta does not reflect web-impl's `doc-delta:` lines (Major 3), design-system §5 says something false about the unsaved status (Major 4), and kb:diagram/web-components is stale (Major 5) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | No `any` in new web code | pass | `rg "\bany\b"` over `features/notes*.ts`, `render/notes*.ts`, `storage.ts`, `storagefakes.ts` and the new specs/helpers: no type use |
| V2 | Neutral tokens only; unsaved uses `--warn`, never `--amber` | pass | style.css diff: `.ng` `--fg-dim`/`--fg`, `.mk` `--fg-muted`, panel `--bg-raised`/`--edge`/`--line`/`--line-control`/`--bg-hover`/`--well`/`--scrim`, `.st` `--warn`; no state hue, no colour literal |
| V3 | Matches header option A, marker option C, `panel.html` | pass (structure) | glyph first in `.idrow`; marker last in `.r2` and before `.ctxinfo`; header `Note`, `· <title>`, status, `⧉` or `⧠ ×` controls, the mockup's sizes. Only the two named colour deviations differ (status `--warn` not `--amber-note`; textarea `--edge` border not teal outline). Pixel match is review-browser's |
| V4 | No part of a note reaches Claude Code | pass | `Note` is read only by `row.go`, `writeorder.go`, `note.go` and `sessionwire.go`; nothing in `internal/claudecode`, launch argv, title delivery or hook replies |
| V5 | Rendered through the reader's sanitizing renderer, never raw HTML | pass | `render/notes.ts` `renderNoteInto` → `renderMarkdown` → `replaceChildren`; no `innerHTML` in any new file |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — no Claude Code field names in the diff outside `internal/claudecode/` (the one `session_id` hit is the Muster int id in a log field) |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass — not touched |
| 4 | tmux on a dedicated socket; no `resize-pane` | pass — E6 uses the existing `daemon.killTmuxWindow` on the test socket |
| 5 | No payload logging | pass — `note.go` logs only `session_id` and the error, never the note |
| 6 | Empty-gauge honesty | pass — no gauge; a null note renders the stated empty line |
| 7 | Identity on the tmux target | pass |
| 8 | No settings trespass | pass |
| 9 | No real `claude` outside canary/probes | pass |

## Issues

### Critical

None.

### Major

1. **[web-impl]** Every save sends the text it reads back from the localStorage draft, never the typed text. When the browser cannot keep the draft, the typed note is never saved, and the unsaved status never shows — `web/src/features/notessave.ts:56-57` (`const text = deps.drafts.get(id); if (text === undefined …) return;`), fed by `features/notes.ts:55` (`createDraftStore(safeLocalStorage())`). `writeJson` swallows a throwing or full storage, and `notesdrafts.test.ts:115-121` pins that a throwing storage keeps nothing. Measured with the shipped `notessave.ts` under Node 24: with storage unavailable, `edit`, the debounce, `flush` and `flushAll` give `sends=0 failed=false`. With one draft write over quota (a stand-in quota, the shipped `notesdrafts.ts` logic), the next send re-sent the **previous** text (`{"sent":["short","short"],"kept":"short"}`). Had musterd been reachable, that stale text would have been stored and acknowledged while the panel showed the new text. Real triggers: site data blocked for the origin, or a note past the origin's localStorage quota. All sessions' drafts share one key, while musterd accepts notes up to 20 MiB. This breaks REQ-9 ("Text is sent to musterd within about a second") and the Overview's "Text is never lost". A fix must make two things true: the text sent is always the latest text typed for that session, whether or not the browser kept it; and a failed keep never suppresses a save or swaps in older text.
2. **[web-tests]** No test drives the save scheduler over a storage that throws or refuses a write. `notessave.test.ts` uses only `memoryStorage`, and the throwing-storage case is tested only on the draft store, where it pins "keeps nothing". A regression test must show that `createNoteSaver` over `throwingStorage()`, and over a storage whose `setItem` throws after a first write, still sends the latest edited text for the right id. It goes red on the current tree (Major 1).
3. **[orchestrator]** The plan's `## Doc Delta` does not reflect web-impl's three `doc-delta:` lines (`web-implementation.md` § Decisions), and `doc-reconcile` promotes the delta verbatim. Missing: (a) the Note-panel specifics for design-system §5: 4px edge and 10px corner handles, a default 360×300 rectangle inset 24px from the slot's top right, and a 260×150 minimum; (b) for the notes spec: a click on a link in a rendered note opens a new tab and does not start editing; the glyph, pressed while the panel is popped out, moves focus into it; a failed save is retried on reconnect and on the next edit; a `404 unknown_session` drops the kept text; (c) the lifetime correction from kb:adr/notes-ended-row-sweep-takes-its-note. Today `docs/features/notes/spec.md` § The note says "An ended session keeps its note… Stop, resume and a daemon restart keep it", which is false for a row that was already ended before the restart (it is swept, note and all). The `docs/protocol.md` Session `note` comment says "never read or written by … reconcile … deleted with the row by Remove", which leaves out the start-up sweep. The delta must name these sentences so the promoted spec and protocol say what shipped.
4. **[orchestrator]** `docs/design/design-system.md` § Note panel (written at doc upkeep) says the header shows "an **unsaved** status in `--warn` while musterd has not confirmed the text". What shipped, and what REQ-11 requires, is narrower: it shows only after a save failed to reach musterd, and "Nothing shows while a save is merely in flight" (`notesview.ts` `unsavedStatus(saver.failed(id))`; W5; R8). The sentence must name the failed-save condition, not the unconfirmed one.
5. **[orchestrator]** kb:diagram/web-components is stale (`go tool kb for web/src/features/notes.ts` names it; the plan's `## Diagrams` lists only store-schema and domain-model). On main its counts matched the tree. On this branch: `main.ts` inits 21 controllers, not "20"; `features/` holds 44 modules, not "38" (one new stateful controller, `notes.ts`, and five new DOM-free helpers, not "19 … plus 13"); `render/` holds 45, not "43". The prose says `localStorage` serves only "the reader's per-session memory and the first-paint theme hint, never session state", and `sessionStorage` only "the update restart handoff". It now also holds note drafts (`muster.note-drafts`) and the note panel's per-tab form and rectangle (`muster.note-panel`). The record must match the tree.

### Minor

1. **[orchestrator]** The plan's `**Render fixtures**` header names `notes` and `notes-tiles`, but `render/notes.spec.ts` also loads `notes-strip`, added through render-tests' `needs-scenario` in fix attempt 1. That is a legitimate route and the fixture is generated (D12 green), but the header no longer lists every scenario the spec uses.

### Notes

1. **[note]** For review-browser: the popped-out and anchored panels re-place only on a render pass. `features/notes.ts` has no `resize` listener and no ResizeObserver, so after a window resize the popped panel can sit outside the shrunken slot until the next 1 s tick. R7 passes because it polls. Whether that gap is visible is browser's to measure against REQ-14.
2. **[note]** For review-browser: leaving edit mode while an earlier debounced save is still in flight shows that earlier, shorter text when its `sessionUpsert` arrives (`syncIncoming` adopts any incoming text outside edit mode). The final text replaces it once the follow-up save lands. Browser's to judge whether the flicker is visible.
3. **[note]** `**Touches**` lists rail and lifecycle. Rail cards gain the marker, but the plan placed that behaviour in the notes spec on purpose (rail spec word cap) and changes no rail sentence. Lifecycle's only link is the sweep ADR, which changes no lifecycle behaviour. Neither needs promoting to Features.
4. **[note]** E2E Repairs row 1 (E6) is honest. It follows the orchestrator's amendment, keeps the live-restart half, and replaces the ended half with a pane death while musterd is down, with stronger assertions (`alive: false`, glyph `--fg`, an edit round-trip). Nothing was deleted, skipped or weakened.
5. **[note]** The review pack is 64,903 words against a 30,000 budget, and web-impl's pack was 37,598 against the same budget (its log's `kb: WARN`). The plan touches nine features.

## Browser review

# Browser review: Session notes

**Plan**: session-notes
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 13736 words (budget 30000)
**Rig**: `make web-build build` at 5b86280d (tree dirty only in `orchestration-state.json`), `bin/musterd` per test via `helpers/fixtures.ts` `daemon`: a fresh scratch data dir under `$TMPDIR/muster e2e-<owner>-…` (with a space), `-S <dataDir>/tmux.sock`, the E2E stub `claude`. Headless Chromium, throwaway `web/e2e/zz-rb-notes.spec.ts` run in the foreground with `--workers=1` (7 tests, all ran), then deleted. Teardown killed each daemon and ran `tmux -S … kill-server`.

Gates log `/var/folders/8t/36s1xtwj1xjfn1pg_jrwztjw0000gn/T/gates-session-notes-c1`: 0 failed lines, `21-e2e.log` 635 passed, `04-web-build.log` green. So the app I drove is the one that ships.

Hosts: **focus** (the header glyph, the anchored panel, the popped-out panel over the main slot, and the rail card), **tiles** (the tile header, the strip card, the hidden popped panel). **pop-out `/doc.html`**: N/A for every row, because notes have no `/doc.html` host. The "popped-out panel" is an in-page form of the Focus host and is measured as `popped`. States: **no data** (`note: null`), **data**, **daemon-down** (SIGTERM through `daemon.kill()`, the banner confirmed visible). Measurements are at 1440×900 unless a cell names another size. "Slot" means `section.main`, between `#mainhead`'s bottom (or the effort strip's) and the size note's top.

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-6 | focus | no data | glyph muted, placed right before the title | pass | `.ng` color rgb(166,171,188) = `--fg-dim`, opacity 0.55; glyph box 314–327 × 63.7–76.7, `h2.name` starts at x 339, both inside mainhead 300–1440 |
| REQ-6 | focus | data | glyph in the foreground | pass | after the first save: class `ng has`, color rgb(232,230,225) = `--fg`, opacity 1 |
| REQ-6 / INV-3 | focus | data (ended) | glyph stays foreground on an ended session | pass | after `/end`, endcap visible: `ng has`, color `--fg` |
| REQ-6 / edge 16 | focus | data | glyph keeps its width; action cluster stays in view at header widths 1280/900/640/360 | pass | windows 1580/1200/940/660 give header w 1280/900/640/360. The glyph is 13×13 at x 314 each time and the name starts at 339. `.acts` right edges 1566/1186/926/646 all ≤ mainhead right (1580/1200/940/660) |
| REQ-6 | focus | daemon-down | glyph keeps the last-known state | pass | banner `display:block`; glyph color `--fg` |
| REQ-7 | focus | no data | glyph click opens the anchored panel, which reads `Note · <title>` and shows the empty-note line | pass | `.npanel.anchored` display flex, opacity 1, box 314,80.7–714,152.5 under the glyph (glyph bottom 76.7) and inside the viewport; header `Note· rb-a`; `aria-expanded="true"`; only `Pop out note` has display block (Pop in and Close are `display:none` with `[hidden]`) |
| REQ-7 | focus | no data | Space and Enter on the keyboard-focused glyph open it; focus kept across a tick | pass | Shift+Tab from rename makes `.ng` the activeElement, still the same node after 1.2 s; Space opens the panel and focus moves to `DIV.bd`; Enter also opens it (malformed-note run) |
| REQ-7 | focus | data | Escape with focus inside closes; click-away closes; glyph state follows | pass | after Escape the panel node is gone and `aria-expanded=false`, focus on `.ng`; a pointer click on the terminal also closes it and focus goes to `xterm-helper-textarea` |
| REQ-8 | focus | no/data | Enter on the body or a click opens a focused textarea; focus kept across a tick; a click inside the panel returns to rendered | pass | after Enter the activeElement is the TEXTAREA, the same node after 1.3 s of typing; a click on the header label gives editor count 0, an `h2 "heading two"` rendered and the panel still open |
| REQ-8 | focus | data | native undo and redo | pass | Cmd+Z gives `first line\n\n#`, Cmd+Shift+Z gives `first line\n\n## heading two` |
| REQ-9 | focus | data | sent about 1 s after the last keystroke | pass | the `PUT …/note` request left 952 ms after the last key (request event timestamp); `/api/state` then read the typed text |
| REQ-9 / REQ-15 | focus | data | anchored panel closes on a focus switch, and the pending text is saved first | pass | after clicking another card the panel node is gone; d1's `/api/state` note holds the typed ` more` |
| REQ-10 / REQ-11 | focus | daemon-down | text kept, status `unsaved, musterd unreachable` in `--warn` | pass | editor value kept; `localStorage["muster.note-drafts"]` = `{"1":"…plus typed while down"}`; `.st` text matches, color rgb(232,207,90) = `--warn` |
| REQ-10 / REQ-11 | focus | daemon-down → up | the save lands with no action and the status clears | pass | after `daemon.restart()` the `/api/state` note matched in 1.9 s; `.st` text empty afterwards |
| REQ-11 | focus | data | nothing shows while a save is merely in flight | **[note]** not measured (no way to hold a request in flight without a stub). R8/W5 cover it |
| REQ-12 | focus (popped) | data | Pop out gives the popped form with Pop in and Close only | pass | `.npanel.popped` 1056,119.4–1416,419.4 (360×300); visible controls are `Pop in note` and `Close note`, both inside the panel box |
| REQ-12 / E9 | focus (popped) | data | after a terminal click the keys reach the pane and the panel stays | pass | activeElement inside the terminal; `tmux capture-pane` contains `rbtyped`; panel still display flex |
| REQ-12 | focus (popped) | data | the glyph does not close the popped panel | pass | after a glyph click: visible, class `npanel popped` |
| REQ-23 / INV-2 | focus (popped) | data | Escape from the terminal or the rail leaves the panel alone | pass | Escape after a terminal click leaves the panel open; Escape after clicking the rail density button leaves it visible and focus stays put |
| REQ-13 | focus (popped) | data | drag by the header; resize from corners and edges down to a minimum | pass | nw corner out → 1140×778.6 (fills the slot); se corner in → 260×150, both controls inside the panel; e and s edges out → 1140×778.6 |
| REQ-13 | focus (popped) | daemon-down | the minimum still shows the header controls | **FAIL** | at 260×150 with the status showing, `.ph` scrollWidth is 286 against clientWidth 258. Pinned at the slot's right edge (panel 1180–1440), Pop in sits at 1421–1441 and Close at 1447–1467, past the 1440 viewport: `elementFromPoint` at Close's centre is `null` and a pointer click leaves the panel open (Major 1) |
| REQ-14 / INV-5 | focus (popped) | data | inside the slot after drag past every edge | pass | dragged up-left: 300,95.4 (slot 300,95.4–1440,874); dragged down-right: 1080,574–1440,874 |
| REQ-14 / edge 17 | focus (popped) | data | inside the slot after a window resize, once settled | pass | settled 2.5 s after the resize: at 800×600, top 126.4 = slot top 126.4; at 640×500, 300,177.4–640,461 (340×283.6) = the slot exactly; back at 1440×900 the remembered rectangle 300,95.4 returns |
| REQ-14 / edge 17 | focus (popped) | data | no overlap of the Focus header while the resize settles | FAIL (Minor 1) | sampled every 100 ms over three rounds: on 1440→800 the panel stays at y 95 while the header bottom is at 126, for 107/429/845 ms; on 800→1440 it stays at y 126 for 313/944/631 ms before it re-clamps |
| REQ-14 | focus (popped) | data | header grows with no window resize (long title focused) | pass | focusing the long-title session moves the panel to top 126.4 = the header's new bottom |
| REQ-14 | focus (popped) | daemon-down | banner pushes the slot down | pass | banner shown: panel top 127.4 = slot top 127.4; banner gone: back to 95.4 |
| REQ-15 | focus (popped) | data | follows focus to another session | pass | header `Note· rb-b2`, body `second session note`, same rectangle 300,95.4 403×323 |
| REQ-15 / edge 9 | focus (popped) | data | Remove of the focused session shows the next one; the last Remove closes the panel | pass | after Remove the panel is popped with `Note· rb-f2` and `f2 survivor note`; the removed note is absent from `/api/state` and its draft key is null. After the last Remove the `.npanel` node is gone and `#main-empty` is display flex |
| REQ-16 | focus (popped) | data | reload keeps the form and rectangle; a new tab starts anchored | pass | reload brings back popped 300,95.4 403×323, the rectangle set before the window resizes. In a new tab of the same context no panel shows until the glyph is clicked, and it opens `npanel anchored` |
| REQ-17 | tiles | data | popped panel hidden in Tiles; Focus brings it back at the same rectangle | pass | in Tiles `.npanel` has `hidden`, computed `display:none`; back in Focus it is popped at 300,95.4 403×323 |
| REQ-18 / INV-3 | focus (rail card) | no data | no marker | pass | `.r2 .mk` has `hidden`, computed `display:none`, empty sr text |
| REQ-18 / INV-3 | focus (rail card) | data, ended | marker at the end of the repo line; repo text ellipsizes before it | pass | mk 277–288 ends at r2's right edge (288); `.rf` 14–269 with `text-overflow: ellipsis`; sr text `Has a note`; color rgb(178,182,195) = `--fg-muted`; still the same after `/end` |
| REQ-18 | tiles (tile header) | data | marker before the context readout | pass | rb-b1: mk 567–578, `.ctxinfo` starts at 587 (`ctx unknown`), both inside thead 2–718.5; rb-b2 is the same |
| REQ-18 | tiles (strip card) | data | marker at the end of the repo line | pass | the 5th session in the strip: mk 1418–1429 ends at r2's right edge (1429); `.rf` ends at 1410 |
| REQ-18 | tiles | daemon-down | markers keep the last-known note | pass | banner block; tile mk display flex |
| REQ-18 | focus (rail card) | daemon-down | marker kept | pass | mk display flex |
| REQ-19 | focus (rail card) | data | 350 ms hover opens a read-only tooltip that does not take the pointer | pass | none at 150 ms; at 850 ms a `role=tooltip` with display block, opacity 1, `pointer-events:none`, header `Note read-only`, box 277,181.8–577,423.7 inside the viewport; it closes when the pointer leaves (count 0). Exact delay not timed: [note] |
| REQ-19 | tiles (tile header, strip) | data | the same hover | pass | tile: tooltip 567,110.5–867,352.4; strip: flips above (784–853.8, marker top 858), inside the viewport |
| REQ-19 | focus / tiles | daemon-down | hover keeps the last-known note | pass | rail hover reads `known before outage`; tile hover renders the last-known note |
| REQ-20 | hover | data | cut after 12 lines with a fade | pass | `.nb.cut` max-height 213.94px against line-height 17.835px (12 lines); mask `linear-gradient(… 75%, transparent)`; scrollHeight 1403 |
| REQ-20 | focus (anchored) | data | height capped to the viewport; the body scrolls | pass | long note: panel 80.7–440.7 at both 900 and 640 window heights (inside the viewport); `.bd` scrollHeight 1403 against clientHeight 324, overflow auto; a wheel moves scrollTop 0→400 |
| REQ-20 | focus (popped) | data | body scrolls inside the chosen size | pass | `.bd` 1403 against 264, overflow auto; a wheel moves scrollTop 0→300 |
| REQ-21 | focus | data | a second window updates in place when not editing and keeps its own text while editing | pass | second context: body shows `from window one` with no reload; while editing it keeps `p2 local` through another upsert |
| REQ-22 | focus (anchored), hover | data | frontmatter and mermaid rendered | pass | `table.frontmatter` (title/status rows); one diagram `svg` in the panel and in the tooltip |
| REQ-22 / edge 15 | focus (anchored) | data | malformed input renders as the reader shows it; a click still edits | pass | `pre.frontmatter` raw block, mermaid source kept, `p.diagram-error "diagram not rendered: Parse error on line 2:"`; a click on the body gives a focused TEXTAREA |
| §6.7 | all | daemon-down | daemon-down surfaced prominently | pass | `#banner` display block, `musterd unreachable — hook output in open panes is Muster's absence, not session failure.` |
| §7.1 | focus (popped) / tiles | data | one live client per session | pass | `totalAttachedClients()` is 1 with one focused session and the popped panel, and 2 in Tiles with 2 tiles |
| §6 others, §7.2–7.5 | all | all | gauges, Done, cost, permission mode, geometry, scrollback, pane styling | N/A — this plan adds no gauge, state word, cost, mode, terminal geometry or xterm option; the panel floats over the slot and never resizes the pane | |

## Issues

### Critical
None.

### Major
1. **[web-impl]** With the unsaved status showing, the popped-out panel at its minimum width (260px) pushes its header controls past its own right edge. Measured: `.npanel .ph` scrollWidth 286 against clientWidth 258, and the `· <title>` label shrinks to 0 width. With the panel pinned to the slot's right edge, Close sits at x 1447–1467 and Pop in at 1421–1441, against a 1440 viewport. `elementFromPoint` at Close's centre returns `null`, and a pointer click leaves the panel open. The case is ordinary: the panel's default place is the slot's top right, and the status appears whenever musterd is down. REQ-13 says the minimum still shows the header controls. Files: `web/src/style.css` (`.npanel .ph`, `.st`) and `features/notesgeometry.ts` (the minimum). A fix must make true: at the minimum size, with the status text showing, both visible controls lie inside the panel box, and so inside the slot.

### Minor
1. **[web-impl]** After a window resize, the popped panel waits for the next render tick before it re-clamps. Until then it overlaps the Focus header, or sits off its remembered place. Sampled every 100 ms over three rounds: on 1440×900→800×600 the panel stayed at y 95 while the header's bottom was at 126, for 107, 429 and 845 ms; on the way back it stayed at y 126 for 313, 944 and 631 ms. The settled state is correct. During a live window drag the panel sits over the header for most of the drag. A fix must make true: the panel's rectangle follows the slot in the same frame the slot's box changes (on resize, or whenever the header's height changes), not on the next tick.
2. **[render-tests]** R7 (and E12) could not have failed for Major 1. R7 drives the popped panel to its minimum only with the status empty, and R8 checks the status colour only in a panel at its default width. A test must make true: at 260×150, pinned to the slot's right edge with `unsaved, musterd unreachable` shown, the Pop in and Close boxes lie inside the panel box.

### Notes
1. **[note]** REQ-11's "nothing shows while a save is merely in flight" was not measured in the running app, because a request cannot be held open without a network stub. W5 and R8 own it.
2. **[note]** REQ-19's 350 ms delay was bracketed (no tooltip at 150 ms, tooltip at 850 ms), not timed exactly.
3. **[note]** At a 360px window (header 60px wide, under the rail's fixed 300px) the title wraps below the glyph and `.acts` spills to x 582. That is outside REQ-6/R2's range (header width ≥ 360) and older than this plan.
4. **[note]** In daemon-down, the rail hover shows the daemon's last-known note while the panel's editor holds the unsaved draft. This matches the plan's States ("markers and hovers keep the last-known note"). No change requested.
5. **[note]** V3 (mockup match) is a visual comparison against the mockups, and I did not diff it against `mockups/*.html`.

## Maintainability review

# Maintainability review: Session notes

**Plan**: session-notes
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 18238 words (budget 30000)
**Scope**: 40 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (5 generated CLAUDE.md trailers among them)

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/server/note.go | rename.go, effort.go, groups.go (`decodeGroupID`), ingest.go, locate.go | yes | none | Major 1 |
| internal/server/renderfix_scenarios_notes.go | renderfix_scenarios_rail.go, _shortcuts.go, _groups.go, _focus.go | yes | none | pass |
| internal/server/server.go | (composition root) | n/a, one `register` line | funlen `New` 53>40, already over on main (113 lines to 114) | pass, Note 1 |
| internal/server/sessionwire.go | usagewire.go | n/a, one field | funlen `toWireSession` 62>60, already over on main (64 lines to 65) | pass, Note 1 |
| internal/server/CLAUDE.md | — | generated trailer | — | Note 12 |
| internal/session/note.go | title.go, writeorder.go | yes | none | pass |
| internal/session/row.go | — | n/a, one field each way | none | pass |
| internal/session/session.go | — | yes (shared state `Note`) | none | pass |
| internal/session/writeorder.go | — | n/a, one restore line | none | pass |
| internal/session/CLAUDE.md | — | generated trailer | — | pass |
| internal/store/migrations/0018_note.sql | 0017 and earlier | n/a | none | pass |
| internal/store/session.go | — | yes (file length) | filelen 550, `UpdateSession` 69, `scanSession` 68; lengths unchanged from main except +1 column | pass, Note 1 |
| web/src/api/http.ts | api/sessions.ts, api/testfakes.ts | plan hint (keepalive) | none | Minor 1 |
| web/src/api/sessions.ts | api/http.ts | none for `PutNoteOptions` | none | Minor 1 |
| web/src/features/CLAUDE.md | — | hand-written Owns line updated | — | pass |
| web/src/features/focus.ts | rename.ts, notes.ts | none for `noteBtn` | none | Minor 2 |
| web/src/features/notes.ts | usage.ts, readerfind.ts, rename.ts, focus.ts | yes | none (358 lines) | Minor 2 |
| web/src/features/notesdrafts.ts | reader/memory.ts, theme.ts, updaterestart.ts | yes | none | Major 2 |
| web/src/features/notesgeometry.ts | reader/zoom.ts, reader/find.ts | yes | none | pass, Note 3 |
| web/src/features/notespanelstate.ts | updaterestart.ts | yes | none | pass |
| web/src/features/notessave.ts | usage.ts, readerfind.ts | yes | none | pass |
| web/src/features/notesview.ts | updateview.ts, connectionhealth.ts | yes | none | pass, Note 9 |
| web/src/features/rail.ts | tiles.ts | yes (hover) | none | pass |
| web/src/features/reader.ts | render/diagrams.ts | yes (counter move) | filelen 685, shrank from 698 on main | pass, Note 1 |
| web/src/features/tiles.ts | rail.ts | yes (hover) | none | pass |
| web/src/features/updaterestart.ts | storage.ts | yes | none | pass |
| web/src/main.ts | (composition root) | n/a, one `initNotes` line + phase comment | none | pass |
| web/src/protocol/session.ts | — | n/a, one field | none | pass |
| web/src/render/CLAUDE.md | — | generated trailer | — | Note 12 |
| web/src/render/diagrams.ts | reader.ts, mermaid.ts | yes | none | pass, Note 6 |
| web/src/render/mainhead.ts | focus.ts | yes (`stackMeta`); none for `noteBtn` | none | Minor 2 |
| web/src/render/notes.ts | locationpanel.ts, grouppopover.ts, cardtip.ts, hovertip.ts, reader.ts | yes | none | Minor 3, Note 4 |
| web/src/render/notespanel.ts | confirm.ts (exemplar), diagramdialog.ts, menu.ts | yes | none | pass, Note 5 |
| web/src/render/sessions.ts | tiles.ts, context.ts | yes (hover) | none | pass, Note 8 |
| web/src/render/tiles.ts | sessions.ts | yes (hover) | none | pass, Note 8 |
| web/src/sessions/store.ts | — | none (one getter) | none | pass, Note 7 |
| web/src/sessions/testfixtures.ts | — | n/a, one field | none | pass |
| web/src/storage.ts | — | yes | none | pass |
| web/src/storagefakes.ts | api/testfakes.ts, sessions/testfixtures.ts | web-tests log line 43 | none | pass, Note 10 |
| web/src/style.css | earlier plan sections (rail groups, rail card density) | n/a | none | pass, Note 11 |

## Issues

### Critical

None.

### Major

1. **[daemon-impl]** `decodeNote` is a third copy of "decode a required JSON key that is null or a value" in one package. It is at `internal/server/note.go:71-83`. `internal/server/groups.go:92` `decodeGroupID(raw json.RawMessage) (id *int64, ok bool)` already has this shape for an integer, and `internal/server/rename.go:59-71` does it inline for a string: absent key is invalid, `"null"` is nil, otherwise unmarshal. `decodeNote` repeats that same logic for a string. `rg -n '"null"' internal --glob '!*_test.go'`:
   ```
   internal/server/note.go:75:	if string(raw) == "null" {
   internal/server/rename.go:67:	if string(req.Title) != "null" {
   internal/server/groups.go:93:	if string(raw) == "null" {
   ```
   Decisions says `rg -n "json.RawMessage" internal/server` found only `rename.go`. That same grep also lists `groups.go:92 decodeGroupID`, the existing named helper of this shape. The reason given, that the shared part is too small to hoist and the rules differ, does not hold: the rules that differ (rename's trim and length limit) run after the shared decode, not inside it. This breaks `docs/conventions.md` § Design "Reuse before add": "What it finds is reused or generalised, never copied, whatever Decisions says". **A fix must make true:** `internal/server` has one decoder for the nullable string case, and the note handler and the title handler both call it. Whether `decodeGroupID` folds into the same generic helper is the implementer's choice, and the choice goes in a `design:` line. The wire behaviour of both endpoints stays as it is: the same status codes and messages.

2. **[web-impl]** The shared draft store does not protect what its `design:` line says it protects. `features/notesdrafts.ts:12` keeps every session's draft under one local-storage key, `muster.note-drafts`. Every `set`/`drop` (`:36-48`) reads the whole map, changes one entry and writes the whole map back. Two windows share this state, and the `design:` line names it so: "read-modify-write per change so two windows never overwrite each other's other-session drafts". Read-modify-write is not a guard across windows. Chrome serves each renderer's `localStorage` reads from its own cached copy and propagates another window's write asynchronously, so a window can rewrite the whole key from a stale copy. The interleaving:
   1. Window A types into session 1. `set(1, "x")` writes `{1:"x"}`.
   2. Before A's write reaches window B's cache, B's save for session 2 returns. `acknowledge(2)` calls `drop(2)`, which reads B's stale `{2:"y"}`, deletes key 2 and writes `{}`.
   3. A's debounce fires. `pump` (`notessave.ts:56`) calls `drafts.get(1)`, gets `undefined` and returns without sending. Nothing marks the save as failed.

   The typed text is never sent, and the panel never shows `unsaved`. That is the loss the kept-draft design exists to prevent (kb:adr/notes-unsaved-text-kept-in-browser-until-acknowledged). The window is the cross-renderer propagation delay, so it is narrow. I argued this from the code and Chrome's storage model; I did not reproduce it in a browser, which is why this is a Major and not a Critical. This breaks § Design "Shared state names its writers and its guard". **A fix must make true:** a write for one session's draft cannot remove or overwrite another session's draft, whatever another window's copy holds. The `design:` line must then describe the guard that actually holds.

### Minor

1. **[web-impl]** `PutNoteOptions` in `web/src/api/sessions.ts:8-10` (`{ keepalive?: boolean }`) is a second declaration of `RequestOptions` from `web/src/api/http.ts:56-58` (`{ keepalive?: boolean }`), added in the same change. `putNote` passes it straight through to `requestEmpty(…, options?: RequestOptions)`. This breaks § Design "One owner per concept": two declarations of one shape will drift. **A fix must make true:** the keepalive option has one declared type, which `putNote` takes.

2. **[web-impl]** The Focus-header note glyph has two owners. `features/focus.ts:120` looks it up into `MainheadElements.noteBtn`, and `render/mainhead.ts:187-188` writes its class from focus's render phase. `features/notes.ts:49` looks up the same `#mainhead .ng` a second time, wires its click (`:287`) and writes `aria-expanded` from the notes phase (`:157-161`). Every other `#mainhead` control is looked up once, in `focus.ts:113-121`. A feature that adds behaviour to one hands it to focus: rename passes `deps.renameHandlers` (`focus.ts:62,128`), and the group button's click is wired at `focus.ts:165`. No `design:` line explains why the glyph is split. This breaks § Design "Match the siblings" and "One owner per concept". **A fix must make true:** one controller looks up the glyph and writes every attribute it carries (class, `aria-expanded`, the click), or a `design:` line states why the split is right.

3. **[web-impl]** `render/notes.ts` writes the diagram pass-guard rule in two places. `stampPass` (`:33-37`) mints an instance, stamps `dataset.noteInstance` and returns the `isCurrent` check. `rerenderNoteDiagrams` (`:57-66`) re-inlines the same three steps instead of calling it. Each body render and each theme re-render depends on the two copies agreeing on the dataset key and the comparison. This breaks § Design "One owner per concept" ("Two places that must agree will not"). **A fix must make true:** the stamp and its `isCurrent` check are written once in the file, and both the initial pass and the theme re-render use them.

### Notes

1. **[note]** Size warnings on touched files. Each one already existed on `main`, measured by function line span:
   - `server.go` `New`: 113 lines to 114, the one `register` line the composition-root rule requires.
   - `sessionwire.go` `toWireSession`: 64 to 65, one wire field.
   - `store/session.go`: `UpdateSession` and `scanSession` unchanged apart from one column in each list; the file went from 548 to 550 lines.
   - `features/reader.ts`: shrank from 698 to 685.

   Only the store file has a reason in Decisions ("the column belongs beside its siblings"). The same reason holds for the other three, since each grew by the one line the field or registration needs. No split is asked for (kb:adr/process-size-linters-warn-never-fail).
2. **[note]** `internal/session/note_test.go:323` `noteDaemonInputs` (funlen 70>60) is a test-file length warning, not a `dupl` hit. It is outside this part. The size log has no `dupl` lines.
3. **[note]** `features/notesgeometry.ts:64` `sameRect` has no production caller: `rg sameRect web/src` hits only the module itself and `notesgeometry.test.ts`. `render/notes.ts:16` `NoteTipModel` is exported but used only inside its own file.
4. **[note]** `render/notes.ts:39-47` `renderNoteInto` repeats the reader's body sequence: `renderMarkdown`, prepend `buildFrontmatterNode`, `replaceChildren`, then `renderDiagrams`. The reader splits that sequence across `features/reader.ts:312` and `render/reader.ts:511-513` (`setReaderBody`). Every piece is reused, so this is not a second implementation. But the spec says a note renders "as the docs reader renders markdown", and nothing makes the two compositions agree. Each new reader body step will need adding in both places.
5. **[note]** `render/notespanel.ts:97-122` `wireGesture` and `render/diagramdialog.ts:190-215` (diagram pan) are two inline pointer-capture drag loops. The `design:` line says it matched the idiom. The two differ (pointer-id filtering, explicit `releasePointerCapture`), so this is a candidate for a shared helper when a third one appears.
6. **[note]** `render/diagrams.ts:21` now holds the module-level `nextDiagramInstanceId` counter. `render/CLAUDE.md` says "No cross-call state here". The same file already holds `sourceByFigure`, and the `design:` line gives the reason: two hosts minting from separate counters would collide on SVG ids. So the placement has precedent and a reason.
7. **[note]** `SessionStore.get` (`sessions/store.ts:27`) is an improvement. Older callers still do `app.store.values().find((s) => s.id === …)`: `focus.ts:149,159,166`, `rename.ts:31,36`, `actions.ts:201`, `railmenu.ts:57`, `launch.ts:830`. Moving them over is not this plan's work.
8. **[note]** The card, tile and mainhead builders read raw `session.note` (`render/sessions.ts:90`, `render/tiles.ts:111`, `render/mainhead.ts:187`) instead of a view-model field, and `applyRepoBlocks` gained a `session` parameter beside its `vm`. Precedent: `renderContextRow(…, session.context, …)` in the same functions. The decision is only `note === null`.
9. **[note]** `features/notesview.ts` is 9 lines with two one-line functions. `features/CLAUDE.md` says "inline when short". The `design:` reason, that Vitest needs a module with no DOM, holds because `notes.ts` touches the DOM.
10. **[note]** `web/src/storagefakes.ts` is test-only support. Its name drops the `test` marker its siblings carry (`api/testfakes.ts`, `sessions/testfixtures.ts`), so at the root beside `storage.ts` a newcomer reads it as a production module. Its earlier name, `features/notestestfakes.ts`, did match. The web-tests log (line 43) records the three older private copies (`theme.test.ts:73-80`, `reader/memory.test.ts:39`, `features/updaterestart.test.ts:22`) and leaves them, as the `sessions/testfixtures.ts` header allows.
11. **[note]** `style.css`'s notes section turns `.r2` into a grid at the end of the file (`.r2 { display: grid; … }`), away from the base `.r2` rule at line 2507. A reader of the rail-card section will not see it there. The earlier plan sections (rail card density, rail groups) set the precedent of overriding from their own section.
12. **[note]** For review-work:
    - The DIAG row for `kb:diagram/web-components`: the module counts for `features/` and `render/`. The storage text says local storage holds only the reader's memory and the theme hint, and session storage only the update handoff; notes now uses both. The `render → reader` edge now carries `markdown`.
    - The hand-written Owns lines in `internal/server/CLAUDE.md` (its route-by-file list does not name `note.go`) and `web/src/render/CLAUDE.md` (it does not name `notes.ts`/`notespanel.ts`).
    - The drafts ADR's "keyed by session" against the single map key in `notesdrafts.ts:12`.

    Reusing `maxIngestBodyBytes` in `note.go:39` matches kb:adr/notes-request-bounded-at-ingest-ceiling.
