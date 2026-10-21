# Correctness review: Session notes

**Plan**: session-notes
**Verdict**: needs-changes
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
