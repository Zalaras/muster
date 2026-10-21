# Review: session-notes

**Plan**: session-notes
**Verdict**: needs-changes
**Cycle**: 2
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser approved, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Session notes

**Plan**: session-notes
**Part verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 74649 words (budget 30000)

Full review, not a delta cycle: cycle 1 left Majors open. The cycle 2 diff (`6a6d62bb..HEAD`) was read
whole. Cycle 1's items are checked one by one in `## Cycle 1 follow-up`.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes. `0018_note.sql`, `SessionRow.Note`, `sessionWire.Note` (no `omitempty`), `parseSession` requires the key | D8, store round-trip, W1 | pass |
| REQ-2 | Yes. `server/note.go` now decodes through `decodeNullable[string]` (`nullable.go`): `""` raw (absent key) fails `json.Unmarshal`, so the 400 is unchanged. 20 MiB `MaxBytesReader` on `maxIngestBodyBytes` | D1, D2, D3 (`{}` missing-key case at `note_test.go:132`), D6 | pass |
| REQ-3 | Yes. `Manager.SetNote` is the only writer (unchanged this cycle) | D4 | pass |
| REQ-4 | Yes, as amended through E6 and kb:adr/notes-ended-row-sweep-takes-its-note | D5, E6 | pass |
| REQ-5 | Yes. Issue snapshot allowlist unchanged | D7 | pass |
| REQ-6 | Yes. The glyph class moved from `render/mainhead.ts` to `features/notes.ts` `syncGlyph` (`ng` / `ng has` from `session.note === null`), written on every render pass | R1 (live and ended, noted and note-less), R2. The deleted `mainhead.test.ts` class cases are covered by R1 | pass |
| REQ-7 | Yes | R13, E1 | pass |
| REQ-8 | Yes | R11, R12, E1 | pass |
| REQ-9 | Yes, fixed this cycle. `notesdrafts.ts` keeps an in-memory `typed` map that `get`/`pending` read first, so `pump` sends the latest typed text whether or not storage kept it. A failed write removes that session's older key, so older text is never brought back | W4, plus the new "a storage that refuses writes" block (5 cases, red on `53f6d325^` per web-tests log), E3, E4, E5 | pass |
| REQ-10 | Yes. One key per session (`muster.note-draft.<id>`). Resent on `snapshot`, dropped on remove and on a 404 | W3 (rewritten: per-key, cross-window, fresh-window listing, failed write), E4, E8 | pass |
| REQ-11 | Yes. At the 260px minimum the status now ellipsizes, with its full text in `title` (Major 1 below is about the docs) | W5, R8, new minimum-size render test, E8 | pass |
| REQ-12 | Yes | E9, E10 | pass |
| REQ-13 | Yes. The header controls now stay inside the panel at 260×150 with the status showing (`.st` `flex: 0 1 auto; min-width: 0`, `.who` `flex: 0 8 auto`) | W2, R7, the new minimum-size render test (red on the old bundle: `right 1441.25 > 1440`) | pass |
| REQ-14 | Yes. `slotWatch` ResizeObserver on `.main`, `#mainhead`, `#effort-strip`, `#sizenote` re-lays the popped panel in the same frame. The panel is `position: fixed` (`.npanel`), so moving it cannot change an observed box | W2, R7, the new two-rAF resize render test (red on the old bundle) | pass |
| REQ-15 | Yes | E5, E11 | pass |
| REQ-16 | Yes | E12 | pass |
| REQ-17 | Yes | R10 | pass |
| REQ-18 | Yes | R3, R4 | pass |
| REQ-19 | Yes | R5 | pass |
| REQ-20 | Yes | R5, R6 | pass |
| REQ-21 | Yes | W6, E7 | pass |
| REQ-22 | Yes. `rerenderNoteDiagrams` now uses `stampPass`. Behaviour unchanged | R5, R9 | pass |
| REQ-23 | Yes | E10 | pass |
| DIAG | kb:diagram/web-components (now true: `main.ts` 21 inits = `rg -c` 21; `features/` 44 non-test modules = 20 + 1 + 5 + 18; `render/` 45; storage prose names note drafts and the panel's per-tab geometry; `render → reader` carries markdown); kb:diagram/daemon-components (`nullable.go` adds no package or edge); store-schema and domain-model unchanged since cycle 1 and true | — | pass |

## Build & Tests

E2E tests: pass (635, full: the gate ran `make e2e-run SPECS=''`; `notes.spec.ts` 21/21) · Daemon tests (race): pass (27 packages ok, 0 FAIL) · Web tests: pass (2990 in 104 files) · Render tests: pass (407) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues; biome 406 files clean). All read from $GATES_LOG_DIR (`gates-session-notes-c2`). No flaky-spec repair in this diff, so no soak was owed.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D9 | `make test` | pass (02-test.log, deduped to test-race: 27 packages ok) |
| D10 | `make lint` | pass (03-lint.log, 0 issues) |
| D11 | `go build ./...` | pass (01-build.log, empty) |
| D12 | `make check-render-fixtures` | pass (06, 105 scenarios up to date) |
| W7 | `make web-test` | pass (05, 2990 passed) |
| W8 | `make web-build` | pass (04, built in 1.90s) |
| W9 | `make web-lint` | pass (09, 406 files clean) |
| W10 | `make contrast` | pass (10, 54 pairs × 3 themes, 0 failures) |
| R14 | `make render-test` | pass (08, 407 passed) |
| E13 | `make e2e` | pass (21, 635 passed) |
| K1 | `make check-kb` | pass (14, 627 records, 0 problems) |
| gates | render-lint, e2e-lint, e2e-honest, features-inventory, versions, features scope, comments, comment ledger | pass (07, 15, 13, 11, 12, 16, 17, 18) |
| gates | size / e2e-level | WARN only (19 is review-maintainability's; 20 is the census, with no `notes.spec.ts` line) |
| DOC | doc upkeep + Doc Delta vs what shipped | FAIL. Seven `proposed` notes ADRs with `refs: plan:session-notes`. No log carries a real `deviation:` line. `TODO.md` #95 is ticked at Completion per the plan. `plans/session-notes/doc-delta.md` now carries cycle 1's missing lines and the E6 lifetime correction, and each claim checks against the code (link opens a new tab, `a[href]` skipped at `notespanel.ts:137`; glyph-while-popped focuses the panel; resend on `snapshot` and on the next edit; a 404 drops the draft; the 4px/10px handles, 360×300 at a 24px inset and the 260×150 minimum match `notesgeometry.ts` and `style.css`). One `doc-delta:` line from this cycle is still not reflected anywhere (Major 1) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | No `any` in new web code | pass | `git diff main...HEAD` of `web/src`, `web/e2e`, `web/render`, `+` lines: no `\bany\b`. The only hits are Go (`decodeNullable[T any]`, renderfix `map[string]any`) |
| V2 | Neutral tokens only; unsaved uses `--warn`, never `--amber` | pass | This cycle's CSS adds only flex, overflow and ellipsis rules. The branch's added CSS has no colour literal, no `--amber`/`--rose`/`--violet`/`--teal`, and no old token name. `font-family` is only `var(--mono)`. The new render test asserts the status is `--warn` |
| V3 | Matches header option A, marker option C, `panel.html` | pass (structure) | Structure unchanged from cycle 1. The one change: at the 260px minimum the status ellipsizes and the title label gives way first, which the mockup does not draw at that width. Pixel match is review-browser's |
| V4 | No part of a note reaches Claude Code | pass | Nothing this cycle touched launch argv, title delivery, hook replies or `internal/claudecode`. `decodeNullable` is a pure decoder |
| V5 | Rendered through the reader's sanitizing renderer, never raw HTML | pass | `renderNoteInto` → `renderMarkdown` → `replaceChildren`. No `innerHTML` in any added line |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. No Claude Code field names in the branch diff outside `internal/claudecode/` |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass. Not touched |
| 4 | tmux on a dedicated socket; no `resize-pane` | pass. No new tmux call; E6 uses `daemon.killTmuxWindow` on the test socket |
| 5 | No payload logging | pass. `note.go` logs `session_id` and the error, never the note |
| 6 | Empty-gauge honesty | pass. There is no gauge; a null note renders the stated empty line |
| 7 | Identity on the tmux target | pass |
| 8 | No settings trespass | pass |
| 9 | No real `claude` outside canary/probes | pass |

## Cycle 1 follow-up

| Cycle 1 item | Fix commit | Verified how |
|--------------|------------|--------------|
| correctness Major 1 `[web-impl]` sends read back from the localStorage draft | `53f6d325` | Diff read. `get` returns `typed.get(id) ?? stored(id)`, so `pump` (`notessave.ts:56`) sends the latest typed text. `set` removes the key when `writeJson` returns false (`notesdrafts.ts:53`), so the stale-resend path is gone. Every reader of the draft goes through `get`/`pending` (`bind`, `snapshot` resend, `flushAll`), and both read `typed` first |
| correctness Major 2 `[web-tests]` no saver test over refusing storage | `59c9a0cc` | `notessave.test.ts` "a storage that refuses writes": `throwingStorage()` debounce, flush and flushAll, `failingAfter(1)` stale-text case, in-flight follow-up and unreachable resend. The web-tests log records 5 red on the pre-fix tree |
| correctness Major 3 `[orchestrator]` Doc Delta missing doc-delta lines and the E6 correction | `cf7cefe7` | `plans/session-notes/doc-delta.md` carries (b) and (c). (a) went into design-system §5 directly. Each claim checked against the code (DOC row) |
| correctness Major 4 `[orchestrator]` design-system unsaved wording | `3273ed93` | Now "once a save has failed to reach musterd, until one succeeds", which matches `unsavedStatus(saver.failed(id))` and W5 |
| correctness Major 5 `[orchestrator]` web-components stale | `3273ed93`, `ad79de4c` | Counts and storage prose re-measured (DIAG row) |
| correctness Minor 1 `[orchestrator]` Render fixtures header | `3273ed93` | The header names `notes-strip` |
| maintainability Major 1 `[daemon-impl]` third nullable decoder | `9d1df03d` | One `decodeNullable[T]`. `rg '"null"' internal --glob '!*_test.go'` → `nullable.go:6` only. Wire behaviour is unchanged for absent key, `null` and wrong type: title (`title_test.go:46` `{}` → 400), groupId (`rail_test.go:267` string → 400), note (`note_test.go:132`). All are green in 02-test.log |
| maintainability Major 2 `[web-impl]` one-key draft map | `53f6d325` | One key per session. A write or removal touches only `keyFor(id)`. The cross-window test holds |
| maintainability Minors 1–3 (`PutNoteOptions`, glyph owners, `stampPass`) | `53f6d325` | `putNote` takes `RequestOptions`. `noteBtn` is gone from `MainheadElements` and `focus.ts`, and the glyph's lookup, class, `aria-expanded` and click all sit in `features/notes.ts`. `rerenderNoteDiagrams` spreads `stampPass(host)` |
| browser Major 1 / Minor 1 / Minor 2 | `53f6d325`, `9571927a` | Read only for test honesty (measuring is review-browser's). Both new render tests drive real states: a real aborted PUT, a real drag and resize to 260×150, a real `setViewportSize` plus two rAFs. The render-tests log records both red on the `53f6d325^` bundle |

## Issues

### Critical

None.

### Major

1. **[orchestrator]** One `doc-delta:` line from this cycle's fix is not reflected in `plans/session-notes/doc-delta.md` (doc-reconcile's input) or in `docs/design/design-system.md` § Note panel. The line is `web-implementation.md:106`: "the unsaved status shortens with an ellipsis at the panel's 260px minimum, its full text in `title`". Shipped: `style.css` `.npanel .ph .st { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis }` and `.who { flex: 0 8 auto }`; `renderNotePanel` sets `refs.status.title`. The render test at `notes.spec.ts:401` pins `clipped: true` at the minimum. Today design-system § Note panel describes the status with no width rule. `docs/features/notes/spec.md` says flatly that "the panel header reads `unsaved, musterd unreachable`", which is not what a 260px panel shows. A fix must make two things true: design-system § Note panel states that the status gives way (the title first, then the status by ellipsis, with the full text on hover); and `doc-delta.md` names the notes-spec sentence so doc-reconcile qualifies it. The line's other two clauses need no edit, because no doc names the draft key (`rg "note-drafts" docs` is empty) or the glyph's class writer.

### Minor

1. **[daemon-impl]** `internal/server/CLAUDE.md`'s hand-written **Owns** line lists where the `/api/sessions` routes live, one file per feature: "`launchcreate.go` (create), `actions.go` (…), `rail.go` (pin, order), `rename.go` (title), `effort.go` (effort-warning dismiss)". That list was kept current by earlier plans (`effort.go` was added with its route). This plan's `PUT /api/sessions/{id}/note` lives in `note.go`, which the list does not name, and the line's **Features** list has no `notes`, though `notes` owns `internal/server/note*.go`. A fix must make true: the Owns enumeration names `note.go` (note) and the Features line includes `notes`.
2. **[web-impl]** `web/src/render/CLAUDE.md`'s hand-written **Owns** line names each overlay builder and says `anchored.ts` places "those overlays" (`menu.ts`, `grouppopover.ts`, `cardtip.ts`, `hovertip.ts`, …). It does not name `notes.ts` (note body render, marker, hover content) or `notespanel.ts` (the panel, which `anchored.ts` places). Its **Features** line has no `notes`, though `notes` owns `web/src/render/notes*.ts`. `features/CLAUDE.md` was updated for `notes.ts` and its helpers, so the omission is only here. A fix must make true: the render Owns line names the two note builders and the Features line includes `notes`.

### Notes

1. **[note]** For review-browser: at the 260px minimum with musterd down, the status now reads truncated (the fix log measured `.st` at 143px, `.who` at 0). Whether `unsaved, musterd un…` still reads as the warning REQ-11 asks for is an observed property.
2. **[note]** Over a storage that refuses writes (site data blocked, or a note past the origin's quota), unacknowledged text now lives only in this window's memory. A reload or browser close before musterd acknowledges it loses it, apart from what the unload flush delivers (keepalive is capped at 60,000 bytes in `notes.ts`). That is the limit of keeping anything in the browser, not a defect: the send path no longer depends on storage, which was cycle 1's Major. The notes spec's "kept in the browser and sent again after a reload" holds wherever the browser keeps storage.
3. **[note]** `**Touches**` gained groups and launch because `groups.go`, `rail.go` and `launchergroup.go` changed call sites to `decodeNullable[int64]`. No behaviour of either feature changed: same status codes and messages, with `rail_test.go:267` and the launch group tests green. So neither needs promoting to Features.
4. **[note]** kb:diagram/web-components says `localStorage` is "reached through one seam, `storage.ts`'s `readJson`/`writeJson`". The draft store also uses `storage.ts`'s `removeItem` and enumerates keys through the new `KeyedStorage` (`length`/`key`). It is still the one seam, so the sentence stays true in substance.
5. **[note]** The review pack is 74,649 words against a 30,000 budget (64,903 in cycle 1). The plan touches eleven features.

## Browser review

# Browser review: Session notes

**Plan**: session-notes
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 15485 words (budget 30000)
**Rig**: `make web-build build` at d4382694 (clean tree), `bin/musterd` per test via `helpers/fixtures.ts` `daemon`: a fresh scratch data dir under `$TMPDIR/muster e2e-<owner>-…` (with a space), `-S <dataDir>/tmux.sock`, the E2E stub `claude`. Headless Chromium, throwaway `web/e2e/zz-rb-notes-c2.spec.ts` run in the foreground with `--workers=1` (5 tests, every one ran to the end over three runs), then deleted. Fixture teardown killed each daemon and ran `tmux -S … kill-server`.

Gates log `/var/folders/8t/36s1xtwj1xjfn1pg_jrwztjw0000gn/T/gates-session-notes-c2`: 0 failed lines. `21-e2e.log` shows 635 passed and `04-web-build.log` is green, so the app I drove is the one that ships.

Hosts: **focus** (the header glyph, the anchored panel, the popped-out panel over the main slot, and the rail card) and **tiles** (the tile header, the strip card, and the hidden popped panel). **pop-out `/doc.html`** is N/A for every row because notes have no `/doc.html` host. The popped-out panel is an in-page form of the Focus host, measured as `focus (popped)`. States: **no data** (`note: null`), **data**, and **daemon-down** (SIGTERM through `daemon.kill()`, with the banner confirmed `display:block`). Measurements are at 1440×900 unless a cell names another size. "Slot" means `section.main` from the bottom of `#mainhead` (or of the effort strip) to the top of the size note.

The cycle-1 findings were re-measured first (rows marked **re-check**).

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-13 / browser c1 Major 1 **re-check** | focus (popped) | daemon-down | at the minimum size, with the status showing and the panel pinned to the slot's right edge, both controls lie inside the panel and work with the pointer | pass | panel 1180–1440 × 158.4–308.4 (260×150), slot 300–1440. `.ph` scrollWidth 258 = clientWidth 258. Pop in 1383–1403 and Close 1409–1429 are inside the panel. `elementFromPoint` at each centre returns `Pop in note` and `Close note`. `.st` shows 143 of its 182 px with an ellipsis, `title="unsaved, musterd unreachable"`, colour rgb(232,207,90) = `--warn`. A pointer click on Close closes the panel (dialog count 0) |
| REQ-13 | focus (popped) | data | the same at the minimum with no status, then with a long title | pass | pinned right 1180–1440: sw 258 = cw 258, controls at 1383–1403 and 1409–1429 and both hit-test to themselves. After focusing the 54-character-title session, `.who` 1227.7–1371 ellipsizes and the controls do not move |
| REQ-14 / edge 17 / browser c1 Minor 1 **re-check** | focus (popped) | data | the panel follows the slot in the same frame on a window resize | pass | Jumps 1440×900→800×600→1440×900, three rounds, sampled every animation frame: the only out-of-slot reading is the first rAF after each shrink (at 19–22 ms, read before the ResizeObserver runs in that frame). A stepped drag resize, 1440→700→1440 in 40 px steps, gives 19 of 80 rAF reads out of slot and **0 of 80 post-paint reads** (a MessageChannel task after each frame). Cycle 1 measured 107–945 ms of overlap |
| REQ-6 | focus | no data | glyph muted, placed right before the title | pass | `.ng` colour rgb(166,171,188) = `--fg-dim`, opacity 0.55, display flex; box 314–327 × 63.7–76.7; `h2.name` starts at x 339; both inside mainhead 300–1440 |
| REQ-6 | focus | data | glyph in the foreground | pass | after the first save: class `ng has`, rgb(232,230,225) = `--fg`, opacity 1. With the glyph now written only by `features/notes.ts`, the class follows a save, an ended session and a clear |
| REQ-6 / INV-3 | focus | data (ended) | glyph and marker stay on an ended session | pass | after `/end` with the endcap visible: `ng has`, `--fg`; rail `.mk` display flex, `Has a note` count 1 |
| REQ-6 / edge 6 | focus | data → no data | a whitespace-only save mutes the glyph and hides the marker | pass | `/api/state` note `null`; class `ng`, colour `--fg-dim`; `.r2 .mk` has `[hidden]` and computes `display:none`; the empty-note line shows |
| REQ-6 / edge 16 | focus | data | glyph keeps its width and the action cluster stays in view at header widths 1280, 900, 640 and 360 | pass | windows 1580, 1200, 940 and 660: the glyph is 13×13 at x 314 and the name starts at 339 every time. `.acts` right edges are 1566, 1186, 926 and 646, each ≤ the mainhead's right edge |
| REQ-6 | focus | daemon-down | glyph keeps the last-known state | pass | banner `display:block`; glyph class `ng has` |
| REQ-7 | focus | no data | the keyboard-focused glyph keeps focus across a tick, and Space opens the panel | pass | `activeElement` is `.ng` and the same node after 1.2 s; Space opens the panel and focus moves to `.bd` |
| REQ-7 | focus | no data | anchored panel under the glyph, reading `Note · <title>`, with the empty-note line | pass | `.npanel.anchored` display flex, opacity 1, box 314–714 × 80.7–152.5, below the glyph (bottom 76.7) and inside the viewport. Header `Note· rb-a`. `aria-expanded="true"`. Only `Pop out note` computes `display:block`; Pop in, Close and the 8 `.rz` handles compute `display:none`. The textarea is absent |
| REQ-7 | focus | data | Escape inside closes; click-away closes | pass | Escape on `.bd`: no `.npanel` node, `aria-expanded="false"`, focus back on `.ng`. A pointer click on the terminal also closes it, and focus goes to `xterm-helper-textarea` |
| REQ-8 | focus | no data / data | Enter on the body gives a focused textarea that keeps focus across a tick; a click inside the panel goes back to rendered | pass | after Enter the `activeElement` is the TEXTAREA, the same node after 1.3 s. A click on the header label gives editor count 0, an `h2 "heading two"` rendered, and the panel still open |
| REQ-8 | focus | data | native undo and redo | pass | Cmd+Z gives `first line\n\n#`, Cmd+Shift+Z gives `first line\n\n## heading two` |
| REQ-9 | focus | data | text sent about 1 s after the last keystroke | pass | the `PUT …/note` left 1004 ms after the last key; `/api/state` then read `first line\n\n## heading two` |
| REQ-9 / REQ-15 / INV-4 | focus (popped) | data | focus follows to another session | pass | after clicking the second card: header `· rb-p2-…`, body `second session note`, still popped and inside the slot (1180–1440 × 126.4–276.4; the slot top moved to 126.4 for the wrapped header) |
| REQ-9 | focus | daemon-down | closing the panel with pending text flushes it, and it lands after the restart | pass | typed ` again` while down, Escape, then a pointer Close; after `daemon.restart()` `/api/state` note = `typed while down more again` |
| REQ-10 / REQ-11 | focus (popped) | daemon-down | text kept per session, unsaved status in `--warn` | pass | editor value kept; `localStorage` holds only `muster.note-draft.1` = `"typed while down"`; `.st` text matches the status, colour `--warn` (rgb 232,207,90; `--amber` is rgb 242,163,60) |
| REQ-10 / REQ-11 | focus | daemon-down → up | the save lands with no action and the status clears | pass | after `daemon.restart()` `/api/state` note = `typed while down`; `.st` text empty; `muster.note-draft.1` removed (null); banner `display:none` |
| REQ-11 | focus | data | nothing shows while a save is merely in flight | **[note]** not measured | Note 1 |
| REQ-12 | focus (popped) | data | Pop out gives the popped form with only Pop in and Close | pass | `.npanel.popped` 1056–1416 × 119.4–419.4 (360×300, inset 24 from the slot's top right); Pop out `display:none`, Pop in and Close `block`; all 8 `.rz` `block`; header cursor `grab` |
| REQ-12 / E9 | focus (popped) | data | after a terminal click, keys reach the pane and the panel stays | pass | focus is inside the terminal; the pane's stub echoes `stub-echo:rbtyped`; the panel still has class `npanel popped`, display flex |
| REQ-12 | focus (popped) | data | the glyph does not close the popped panel | pass | after a glyph click: `npanel popped`, display flex, focus moved into the panel |
| REQ-23 / INV-2 | focus (popped) | data | Escape from the terminal or the rail leaves the panel alone | pass | Escape with the terminal focused: panel unchanged after 1.2 s and focus still in the terminal. Escape after a rail click: display flex |
| REQ-13 | focus (popped) | data | drag by the header; resize from every edge and corner, out and down to the minimum | pass | nw, n, w, ne, sw, e, s and se dragged out each give 300–1440 × 95.4–874, which is the slot. se and nw dragged in each give 260×150 |
| REQ-14 / INV-5 | focus (popped) | data | inside the slot after a drag past every edge | pass | up-left: 300,95.4 (slot 300,95.4–1440,874); down-right: 1080,574–1440,874 |
| REQ-14 / edge 17 | focus (popped) | data | inside the slot after a window resize, then back to the remembered rectangle | pass | at 640×500: 380–640 × 177.4–327.4 inside slot 300–640 × 177.4–461. Back at 1440×900: 1180,95.4 (the rectangle before the resizes) |
| REQ-14 | focus (popped) | data | a taller header with no window resize | pass | focusing the long-title session moves the panel top to 126.4, the new slot top |
| REQ-14 | focus (popped) | daemon-down | the banner pushes the slot down | pass | banner shown: panel top 158.4 = slot top 158.4 |
| REQ-15 / edge 9 | focus (popped) | data | Remove of the focused session shows the next one; the last Remove closes the panel | pass | after Remove: popped, `· rb-p2-…`, body `second session note`; the removed note is absent from `/api/state`; its `muster.note-draft.<id>` key is null. After the last Remove: no `.npanel` node, `#main-empty` display flex |
| REQ-16 | focus (popped) | data | reload keeps the form and rectangle; a new tab starts anchored | pass | reload brings it back popped at 680–940 × 295.4–445.4, the rectangle set before the reload. A new tab in the same context shows no panel until the glyph is clicked, then `npanel anchored` |
| REQ-17 | tiles | data | popped panel hidden in Tiles; back in Focus at the same rectangle | pass | in Tiles `.npanel` has `[hidden]` and computes `display:none`. Back in Focus it is popped at 680–940 × 295.4–445.4, the same as before |
| REQ-18 / INV-3 | focus (rail card) | no data | no marker | pass | `.r2 .mk` computes `display:none` |
| REQ-18 / INV-3 | focus (rail card) | data | marker at the end of the repo line; the repo text ellipsizes before it | pass | `.mk` 277–288 ends at `.r2`'s right edge (288); `.rf` 14–269 with `text-overflow: ellipsis`; `Has a note` count 1; colour rgb(178,182,195) = `--fg-muted` |
| REQ-18 | tiles (tile header) | no data / data | marker before the context readout only on the noted tiles | pass | rb-t1: `.mk` 567–578, `.ctxinfo` starts at 587; rb-t2: 1286–1297, then 1306. rb-t3 and rb-t4 (no note): `.mk` display none |
| REQ-18 | tiles (strip card) | data | marker at the end of the repo line | pass | strip cards 5 and 6: `.mk` 698–709 and 1418–1429, each ending at `.r2`'s right edge; `.rf` ends at 690 and 1410 |
| REQ-18 | tiles / focus | daemon-down | markers keep the last-known note | pass | tile markers `flex, flex, none, none`; rail `.mk` display flex |
| REQ-19 | focus (rail card) | data | 350 ms hover opens a read-only tooltip that never takes the pointer | pass | no tooltip at 200 ms; at 600 ms one `role=tooltip`: display block, opacity 1, `pointer-events:none`, header `Note read-only`, box 277–577 × 181.8–423.7 inside the viewport. Count 0 after the pointer leaves |
| REQ-19 | tiles (tile header, strip) | data | the same hover | pass | tile: tooltip 567–867 × 110.5–352.4. Strip: flips above, 784–853.8 over the marker's top of 858, inside the viewport |
| REQ-19 | focus / tiles | daemon-down | hover keeps the last-known note | pass | rail hover reads `Note read-only known before outage` while the editor holds the unsaved draft. Tile hover renders the long note's frontmatter and heading (re-measured after the banner moved the marker down 32 px) |
| REQ-20 | hover | data | cut after 12 lines with a fade | pass | `.nb.cut` max-height 213.938px = 12 × line-height 17.835px; mask `linear-gradient(… 75%, transparent)`; scrollHeight 2179, clientHeight 214 |
| REQ-20 / edge 14 | focus (anchored) | data | height capped to the viewport, and the body scrolls | pass | long note: panel 80.7–440.7 at window heights 900 and 640, inside the viewport both times; `.bd` scrollHeight 2179, clientHeight 324, overflow-y auto; a wheel moves scrollTop 0→400→800 |
| REQ-20 | focus (popped) | data | the body scrolls inside the chosen size | pass | `.bd` scrollHeight 2179, clientHeight 264, overflow-y auto; a wheel moves scrollTop to 300 |
| REQ-21 / edge 12 | focus | data | a second window updates in place when not editing, and keeps its own text while editing; its next save wins | pass | second context: body `from window one` with no reload. While it is editing, an API write `third write` leaves its editor at `p2 local`. Its next keystroke stores `p2 local!` |
| REQ-22 | focus (anchored), hover | data | frontmatter and mermaid rendered | pass | `table.frontmatter` count 1 and one diagram `svg`, in the panel and in the tooltip |
| REQ-22 / edge 15 | focus (anchored) | data | malformed input renders as the reader shows it, and a click still edits | pass | `title: [unclosed` renders as a frontmatter row; the broken fence keeps its source and shows `p.diagram-error "diagram not rendered: Parse error on line 3:"`. A click on the body gives a focused TEXTAREA. Enter on the keyboard-focused glyph opened the panel |
| §6.7 | all | daemon-down | daemon-down surfaced prominently | pass | `#banner` display block: `musterd unreachable — hook output in open panes is Muster's absence, not session failure.` |
| §7.1 | focus (popped) / tiles | data | one live client per session | pass | `totalAttachedClients()` is 1 in Focus with the popped panel; 2 in Tiles with 2 sessions; 4 in Tiles with 4 tiles and 2 strip cards |
| §6 others, §7.2–7.5 | all | all | gauges, Done, cost, permission mode, geometry, scrollback, pane styling | N/A — this plan adds no gauge, state word, cost, mode, terminal geometry or xterm option; the panel floats over the slot and never resizes the pane | |

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** REQ-11's "nothing shows while a save is merely in flight" was not measured in the running app. A request cannot be held open without a network stub. W5 and R8 own it.
2. **[note]** The cycle-1 correctness Note 2 flicker was not reproduced on localhost. I typed, waited for the debounced `PUT` to leave, typed more and pressed Escape at once. A MutationObserver on the body recorded only the final `AAAABBBB`, and the wire matched. The earlier upsert lands inside the typing window on localhost, so a slower link could still show it. No change requested.
3. **[note]** At the 260 px minimum with the status showing, the `· <title>` label gives way to 0 px and the status is cut with an ellipsis (its full text is in `title`). This is the fix's intended give-way order (web-implementation.md, Fix Attempt 1), and both controls stay reachable. No change requested.
4. **[note]** REQ-19's 350 ms delay was bracketed (no tooltip at 200 ms, a tooltip at 600 ms), not timed exactly.
5. **[note]** V3 (mockup match) is a visual comparison against `mockups/*.html`, and I did not diff it.

## Maintainability review

# Maintainability review: Session notes

**Plan**: session-notes
**Part verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 19994 words (budget 30000)
**Scope**: 44 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (5 generated CLAUDE.md trailers among them). This is a full review, because cycle 1 had Majors. The 16 files changed since cycle 1 (`git diff 6a6d62bb..HEAD`) were read again in full, with their siblings open. The other files are unchanged since cycle 1, so their cycle-1 rows carry over.

## Cycle-1 issues

| Cycle-1 issue | Fix commit | Verified how | Result |
|---|---|---|---|
| Major 1: `decodeNote` was a third nullable-field decoder | 9d1df03d | `internal/server/nullable.go:5` `decodeNullable[T any](raw json.RawMessage) (value *T, ok bool)` is now the only decoder. `rg -n '"null"' internal cmd --glob '!*_test.go'` returns only `internal/server/nullable.go:6`. `note.go:51`, `rename.go:59`, `groups.go:133`, `rail.go:85` and `launchergroup.go:29` all call it. Each message and status at those call sites is the same as before. `decodeGroupID` and `decodeNote` are gone (`rg decodeGroupID\|decodeNote internal` returns nothing). | fixed |
| Major 2: the one-key draft map was rewritten whole from a stale copy in another window | 53f6d325 | `features/notesdrafts.ts:11-15` gives each session its own key, `muster.note-draft.<id>`. `set` (`:51-54`) and `drop` (`:56-59`) touch only `keyFor(id)`, so a window can no longer delete or overwrite another session's draft, whatever its own cached copy holds. The cycle-1 interleaving (B's `drop(2)` writing `{}` over A's `{1:"x"}`) cannot happen now. `pump` reads `drafts.get`, which returns the window's in-memory `typed` map before storage (`:47-49`), so a send no longer depends on storage at all. The precedent is `reader/memory.ts:20` `keyFor(sessionId)`. The `design:` line names the guard that holds. | fixed |
| Minor 1: `PutNoteOptions` duplicated `RequestOptions` | 53f6d325 | `api/sessions.ts:6,65` imports and takes `RequestOptions`. `rg PutNoteOptions web` returns nothing. | fixed |
| Minor 2: the note glyph had two owners | 53f6d325 | `noteBtn` is gone from `MainheadElements` (`render/mainhead.ts`) and from `focus.ts` (`rg noteBtn web/src` returns nothing). `features/notes.ts:49` looks the glyph up once, wires its click, and `syncGlyph` (`:156-165`) writes both its `aria-expanded` and its class. Writing control state from a controller has precedent: `groups.ts:502` (`aria-pressed`) and `groupsselect.ts:126-127`. | fixed |
| Minor 3: the diagram pass stamp was written twice | 53f6d325 | `render/notes.ts:59` `rerenderNoteDiagrams` now spreads `stampPass(host)`. `rg noteInstance web/src` shows the key is written only in `stampPass` (`:35`). | fixed |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/server/nullable.go | groups.go, rename.go, rail.go, launchergroup.go, respond.go | yes (fix attempt 1) | none | pass |
| internal/server/note.go | rename.go, effort.go, nullable.go | yes | none | pass |
| internal/server/rename.go | note.go, groups.go | yes (folded into `decodeNullable`) | none | pass, Note 3 |
| internal/server/groups.go | rail.go, launchergroup.go | yes | none | pass |
| internal/server/rail.go | groups.go | yes | none | pass |
| internal/server/launchergroup.go | launcher.go, groups.go | yes | none | pass |
| internal/server/renderfix_scenarios_notes.go | unchanged since cycle 1 | yes | none | pass |
| internal/server/server.go | unchanged since cycle 1 (composition root, one `register` line) | n/a | funlen `New` 53>40, over on main already | pass, Note 1 |
| internal/server/sessionwire.go | unchanged since cycle 1 | n/a, one field | funlen `toWireSession` 62>60, over on main already | pass, Note 1 |
| internal/server/CLAUDE.md | — | generated trailer | — | Note 5 |
| internal/session/note.go | unchanged since cycle 1 (title.go, writeorder.go) | yes | none | pass |
| internal/session/row.go | unchanged since cycle 1 | n/a | none | pass |
| internal/session/session.go | unchanged since cycle 1 | yes (shared state `Note`) | none | pass |
| internal/session/writeorder.go | unchanged since cycle 1 | n/a | none | pass |
| internal/session/CLAUDE.md | — | generated trailer | — | pass |
| internal/store/migrations/0018_note.sql | unchanged since cycle 1 | n/a | none | pass |
| internal/store/session.go | unchanged since cycle 1 | yes (file length) | filelen 550, `UpdateSession` 69, `scanSession` 68 | pass, Note 1 |
| web/src/api/http.ts | unchanged since cycle 1 (api/sessions.ts) | plan hint (keepalive) | none | pass |
| web/src/api/sessions.ts | api/http.ts | n/a (uses `RequestOptions`) | none | pass |
| web/src/features/CLAUDE.md | — | hand-written Owns line | — | pass |
| web/src/features/notes.ts | focus.ts (its `ResizeObserver` at `:141`), groups.ts, groupsselect.ts, rename.ts | yes (glyph owner, slot observer) | none (367 lines) | pass |
| web/src/features/notesdrafts.ts | reader/memory.ts, storage.ts, theme.ts, updaterestart.ts | yes (draft store guard) | none | Minor 1 |
| web/src/features/notesgeometry.ts | unchanged since cycle 1 | yes | none | pass, Note 2 |
| web/src/features/notespanelstate.ts | unchanged since cycle 1 | yes | none | pass |
| web/src/features/notessave.ts | notesdrafts.ts, usage.ts | yes | none | pass |
| web/src/features/notesview.ts | unchanged since cycle 1 | yes | none | pass |
| web/src/features/rail.ts | unchanged since cycle 1 | yes (hover) | none | pass |
| web/src/features/reader.ts | unchanged since cycle 1 | yes (counter move) | filelen 685, down from 698 on main | pass, Note 1 |
| web/src/features/tiles.ts | unchanged since cycle 1 | yes (hover) | none | pass |
| web/src/features/updaterestart.ts | storage.ts | yes (accessor moved to `storage.ts`) | none | pass |
| web/src/main.ts | unchanged since cycle 1 (composition root, one `initNotes` line) | n/a | none | pass |
| web/src/protocol/session.ts | unchanged since cycle 1 | n/a, one field | none | pass |
| web/src/render/CLAUDE.md | — | generated trailer | — | Note 5 |
| web/src/render/diagrams.ts | unchanged since cycle 1 | yes | none | pass |
| web/src/render/mainhead.ts | focus.ts | yes (`stackMeta`); glyph removed | none | pass |
| web/src/render/notes.ts | render/reader.ts, features/reader.ts | yes | none | pass |
| web/src/render/notespanel.ts | confirm.ts, diagramdialog.ts | yes | none | pass |
| web/src/render/sessions.ts | unchanged since cycle 1 | yes (hover) | none | pass |
| web/src/render/tiles.ts | unchanged since cycle 1 | yes (hover) | none | pass |
| web/src/sessions/store.ts | unchanged since cycle 1 | none (one getter) | none | pass |
| web/src/sessions/testfixtures.ts | unchanged since cycle 1 | n/a | none | pass |
| web/src/storage.ts | reader/memory.ts, theme.ts, updaterestart.ts | yes (`KeyedStorage`, guarded accessors) | none | pass (owner named in Minor 1) |
| web/src/storagefakes.ts | api/testfakes.ts, sessions/testfixtures.ts | web-tests log | none | pass, Note 4 |
| web/src/style.css | the notes section's own earlier rules | n/a | none | pass |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[web-impl]** Listing a storage's keys is now the only storage access in the dashboard that `storage.ts` does not guard. `features/notesdrafts.ts:34-45` `storedIds` wraps `storage.length` and `storage.key(i)` in a try/catch of its own. Every other access that can throw goes through `storage.ts`: `readJson` (`:27-31`), `writeJson` (`:48-53`), `removeItem` (`:59-63`), and the accessor guard `guardedStorage` (`:70-82`). This branch moved that guard into `storage.ts` from `updaterestart.ts`. A loop over every module with a try block shows these are the only two that touch storage:
   ```
   $ for f in $(rg -l "try \{" --glob '!*.test.ts' web/src); do rg -q -i storage "$f" && echo "$f"; done
   web/src/storage.ts
   web/src/features/notesdrafts.ts
   ```
   The `design:` line says `KeyedStorage` went into `storage.ts` because the draft store must list its keys. The guarded read that uses it stayed in the caller, and the `design:` line gives no reason for that. The next feature that needs to list keys will copy the loop. This breaks `docs/conventions.md` § Design "One owner per concept" and "Match the siblings" (the error path). **A fix must make true:** tolerating a throwing storage while listing keys is owned by `storage.ts`, beside the other three helpers, and `notesdrafts.ts` asks it. The behaviour stays as it is: a throwing storage lists nothing.

### Notes

1. **[note]** These size warnings are unchanged from cycle 1, and each was already over on `main`:
   - `server.go` `New`
   - `sessionwire.go` `toWireSession`
   - `store/session.go` `UpdateSession`, `scanSession` and the 550-line file
   - `features/reader.ts`, which shrank

   The cycle-1 reading still holds: each grew by only the one line its field or registration needs. No split is asked for (kb:adr/process-size-linters-warn-never-fail). The size log has no `dupl` lines. Two test-file funlen hits are outside this part: `note_test.go:323` `noteDaemonInputs` and the store and session tests.
2. **[note]** Carried over from cycle 1: `features/notesgeometry.ts` `sameRect` has no production caller, and `render/notes.ts` `NoteTipModel` is exported but used only in its own file.
3. **[note]** `rename.go:59` names the decoded `*string` `raw`. Everywhere else in the package, `raw` is the undecoded `json.RawMessage`, including the parameter of `decodeNullable` itself (`nullable.go:5`). A name like `requested` would read better. This is taste, so no change is asked for.
4. **[note]** Carried over from cycle 1: `web/src/storagefakes.ts` is test-only, but its name drops the `test` marker that its siblings `api/testfakes.ts` and `sessions/testfixtures.ts` carry. It now also holds `failingAfter`.
5. **[note]** For review-work: the hand-written Owns lines still do not name the new files. In `internal/server/CLAUDE.md`, the route-by-file list has no `note.go`, and the new `nullable.go` is not listed either. In `web/src/render/CLAUDE.md`, `notes.ts` and `notespanel.ts` are not named. Only the generated trailers changed in both files.
6. **[note]** Not a guard defect, because REQ-21 makes the same-session case last write wins, so it is left to review-work. `pending()` (`notesdrafts.ts:65-73`) lists every session's stored draft, including drafts typed in other windows. That means window B's `flushAll` on a snapshot can PUT, and then acknowledge, text that window A typed. The text comes from B's storage copy, which may be stale. A still holds its newer text in `typed` and sends it on its own debounce, so nothing is lost. The order of the two PUTs is not fixed, though.
