# Correctness review: Session notes

**Plan**: session-notes
**Verdict**: needs-changes
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
