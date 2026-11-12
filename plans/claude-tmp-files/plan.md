# Plan: claude-tmp-files

**Created**: 2026-11-12
**Status**: completed
**Work Type**: full-stack
**E2E Scope**: new-specs
**Fixture plan**: reader-scratch.spec.ts daemon (each test launches its own session on its own scratchpad and reads the reader listing fresh)
**Render fixtures**: reader-docs, reader-docs-plan, new: reader-docs-scratch (live session, existing plan, three scratch files — one nested — with distinct mtimes, plus a non-markdown file), new: reader-docs-scratch-ended (the same session ended), new: reader-docs-scratch-only (live, no plan, one scratch file)
**Features**: reader, ingest
**Touches**: lifecycle, connection, actions, focus, rail, tiles
**Description**: Claude's per-session scratchpad markdown in the reader nav, under a `claude` section folded to one summary row (mockup B)

## Overview

Claude Code gives every interactive session a scratchpad folder,
`<tmp>/claude-<uid>/<encoded cwd>/<session_id>/scratchpad`, and tells the model to write scratch
files there. The dashboard cannot see them: the reader lists only the session's directory and the
plan (#121). Every hook of an interactive session names the folder in `scratchpad_dir`
(kb:fact/scratchpad-dir-per-session-id, guarded by `TestScratchpadDirPerSessionID`).

The daemon takes that folder from routed hooks, keeps it on the session row like the transcript
path (persisted, never moved by a straggler), lists the `.md` files under it in the reader
listing, serves them through the reader's file route, and sends `docChanged` for writes there.
The dashboard replaces the nav's `plan` header and plan slot with one **claude** section, folded
by default to a single summary row — `claude` plus chips for what is there (`plan` or a dimmed
`no plan`, and `<n> tmp`). Unfolded, it lists the plan row, then each scratch file newest first,
with a `tmp` badge and how long ago it was last written. The section stays on an ended session.

The mockups are `plans/claude-tmp-files/mockups/` (`opt-b-summary.html` chosen 2026-11-12; A and
C rejected). Decisions taken with the developer the same day: the chips are labels only (the whole
row toggles); `.md` only, nested folders included; after `/clear` the list follows the new
session id's (empty) folder and earlier files drop out of view; the fold is remembered per session
in the browser and starts folded; the section is kept on an ended session.

## Requirements

### Must Have
- [ ] REQ-1: A routed hook whose `scratchpad_dir` is well formed — absolute, already clean, last
  element `scratchpad`, its parent's name equal to the hook's own `session_id` — sets the session's
  scratchpad folder. Any other value (null, absent, relative, wrong shape) leaves it unchanged.
- [ ] REQ-2: The scratchpad folder only moves for a hook bound to the session's current Claude
  session id; a straggler from an id the session has left never moves it. It is never cleared
  once set: not by a `-p`-style null, not by death, not by a daemon restart.
- [ ] REQ-3: The Session object carries the folder (`scratchpadDir`), and a change to it
  broadcasts a `sessionUpsert`.
- [ ] REQ-4: The reader listing carries a `scratch` block: the folder and every `.md`
  (case-insensitive) under it, nested folders included and dot-directories skipped, each with
  its relative path, the file's modification time and the last routed write seen, newest
  modification first.
- [ ] REQ-5: The reader file route also serves a `.md` whose resolved path sits under the
  session's resolved scratchpad folder; everything else stays `404 not_found`.
- [ ] REQ-6: A routed Write/Edit/MultiEdit naming a `.md` under the scratchpad folder sends
  `docChanged` and is recorded in the write log.
- [ ] REQ-7: The nav's top section is **claude**: one summary row, folded by default, showing
  `claude` and chips — `plan` when the session's plan exists, else a dimmed `no plan`; `<n> tmp`
  when the listing holds n ≥ 1 scratch files, no tmp chip at 0.
- [ ] REQ-8: Clicking the summary row (anywhere, chips included) toggles the section; the fold
  is remembered per session in browser memory alongside the Files/Outline folds, folded when
  nothing is remembered.
- [ ] REQ-9: Unfolded, the section lists the plan row (unchanged `plan` badge, or `no plan yet`)
  then one row per scratch file in the listing's order — a `tmp` badge, the relative path, and its
  age (`ageAgo` buckets) from the later of its modification time and the last `docChanged` seen.
  *Amended (decisions/row-age-text, 2026-11-12):* the age is bare `formatAge` (`now`, `2m`, `1h`,
  `2d`), no ` ago` suffix — kb:adr/reader-scratch-row-age-bare.
- [ ] REQ-10: Opening a scratch file shows it like any document, with a `tmp` badge in the docbar
  and its absolute path; it takes `aria-current` and the dirty dot exactly as tree files do.
- [ ] REQ-11: A `docChanged` naming a path under the session's scratchpad folder that the listing
  does not hold, or a `sessionUpsert` whose `scratchpadDir` differs from the listing's
  `scratch.dir`, re-fetches the listing silently (no loading cue, the open file untouched).
- [ ] REQ-12: On an ended session the claude section is present (plan and scratch files both
  openable), replacing today's removal of the plan slot and its header row.

### Should Have
- [ ] REQ-13: The plan row shows its age too, from the listing's plan `modifiedAt` and later
  `docChanged`s, so plan and scratch rows read alike.

### Nice to Have
- none

## Protocol Contract

Delta against `docs/protocol.md`; merged there on approval.

### Session object (`kb:anchor/ws.session`) — new required key

```jsonc
"scratchpadDir": "/private/tmp/claude-501/-Users-bob-code-muster/1f52b3c3-c00c-42f3-b99e-1219989ec9e9/scratchpad"
  // string | null, required key. The scratchpad folder the latest routed hook of the session's
  // current Claude session id named, verbatim (kb:fact/scratchpad-dir-per-session-id). null until a
  // well-formed one has been seen (a `-p` session never sends one). Only a well-formed value moves
  // it: absolute, clean, last element "scratchpad", parent named for the hook's session_id. Never
  // null again once set; kept across death and daemon restart; moved by /clear's and a resume's
  // SessionStart like any later hook. A change broadcasts a sessionUpsert. Display-only.
```

### HTTP: GET `/api/sessions/{id}/reader` — new key `scratch`

```jsonc
"scratch": {
  "dir": "/private/tmp/claude-501/-Users-bob-code-muster/1f52b3c3-…/scratchpad", // = session.scratchpadDir
  "files": [                                        // every *.md (case-insensitive) under dir, nested
    { "path": "findings.md",                         //   included, dot-directories skipped; relative,
      "modifiedAt": "2026-11-12T09:40:02Z",          //   forward slashes; sorted by modifiedAt descending,
      "writtenAt": "2026-11-12T09:40:02Z" },         //   then path. modifiedAt: the file's mtime, RFC3339.
    { "path": "notes/options.md",                    //   writtenAt: as files[i].writtenAt — the last routed
      "modifiedAt": "2026-11-12T09:12:44Z",          //   write this daemon lifetime, else null.
      "writtenAt": null } ]                          //   [] when dir is missing (macOS cleared /tmp) or empty.
}
// null when session.scratchpadDir is null. Same 20,000-file cap as the walk listing; past it the
// list is cut and the top-level `truncated` stays about `files` only — scratch is not flagged.
```

`plan` gains `"modifiedAt": "RFC3339" | null` — the plan file's mtime, null when it does not
exist (REQ-13). Nothing else in the response changes.

### HTTP: GET `/api/sessions/{id}/reader/file` — confinement widened

A path is served if, after symlink resolution of both it and the reference, it (a) sits under the
session's directory and ends in `.md`, **or** (b) equals the resolved plan path, **or** (c) sits
under the session's resolved `scratchpadDir` and ends in `.md` (case-insensitive). Errors and
their envelopes are unchanged; a scratch path outside (c) is `404 not_found` like any other.

### WS daemon→UI `docChanged` — scope widened

Also sent for a routed `PostToolUse` Write/Edit/MultiEdit whose cleaned file path sits lexically
under `session.scratchpadDir` and ends in `.md` (case-insensitive). Shape unchanged:
`{ "type": "docChanged", "id": 7, "path": "<absolute>", "at": "RFC3339" }`.

## Schema Changes

Migration `0020_scratchpad.sql`, forward-only:

```sql
ALTER TABLE session ADD COLUMN scratchpad_dir TEXT;  -- NULL until a well-formed scratchpad_dir hook; never cleared
```

## UI Specifications

Design authority: `plans/claude-tmp-files/mockups/opt-b-summary.html` and its `mockup.css`
(`new (B)` rules, the `.badge.scratch` teal badge); `docs/design/design-system.md` tokens only.

### Views
- **Reader nav** (Focus, tiles, pop-out): the `plan` header row and plan slot become the claude
  section — a summary-row button, then (unfolded) the plan row and scratch rows; then the existing
  separator, Files and Outline. Compact hosts use the existing compact row sizing.
  *Amended (developer, 2026-11-12, review cycles 1–2 browser Majors):* the nav scrolls as one
  column — the claude section, the Files tree and the Outline each take their natural height and
  never shrink, and every row in every host is reachable by scrolling the nav; an empty scratch
  area takes no space — decisions/nav-global-scroll, kb:adr/reader-nav-scrolls-as-one-column
  (supersedes kb:adr/reader-nav-sections-shrink-without-floor).
- **Docbar**: the badge reads `tmp` (teal) for an open scratch file, `plan` for the plan, absent
  for a directory file, as today. *Amended (orchestrator, 2026-11-12):* the `tmp` badge is neutral
  with a dashed border, not teal — design-system.md §3 (line 122) reserves `--teal` for Working,
  measured by web-impl; kb:adr/reader-scratch-badge-neutral-not-teal.

### User Flows
1. Open docs on a session with a plan and scratch files → summary row `claude [plan] [3 tmp]`,
   folded. Click it → plan row, then three `tmp` rows, newest first, each with an age.
2. Click a `tmp` row → it opens with the loading cue; docbar `tmp findings.md <abs path>`.
3. Claude writes a new scratch file → `docChanged` for an unknown scratch path → listing re-fetched
   silently → chip becomes `4 tmp`, the new row tops the list.
4. `/clear` → `sessionUpsert` with a new `scratchpadDir` → listing re-fetched → tmp chip gone
   (the new folder is empty); the open file stays open.
5. Session ends → the section stays; plan and scratch files still open.

### States
- No data yet: the listing in flight → the summary row shows `claude` with no chips; unfolded,
  the scratch rows area shows the existing `loading…` row style. Plan chip reflects `session.plan`
  immediately (it does not wait on the listing), as the plan slot does today.
- Nothing from Claude: `claude [no plan]`; unfolded, `no plan yet` only.
- Daemon down: unchanged — the reader's existing in-view notice; rows stay as last rendered.

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Claude section summary row | `button` | `Claude` | `aria-label="Claude"`, `aria-expanded` `false`/`true`; text inside: `claude` then chips |
| Plan chip | — | `plan` | inside the summary row; `no plan` with a dimmed style when the plan does not exist |
| Scratch count chip | — | `/^\d+ tmp$/` | absent at 0 |
| Plan row | `button` | contains the plan basename | existing `.f.plan`; only in the DOM while unfolded |
| Scratch file row | `button` | contains the relative path, e.g. `findings.md`, `notes/options.md` | `tmp` badge first, age last (`now`, `2m`, `1h`, `2d`); `aria-current="true"` when open; `title` = absolute path |
| Docbar badge | — | `tmp` | on an open scratch file |

#### Invariants

- **INV-1**: `session.scratchpadDir` is non-null ⇒ it is well formed (REQ-1) and its parent's name
  is a Claude session id this session has been bound to. Asserted from every source state:
  unbound, bound, after `/clear`, after a straggler, dead, after daemon restart.
- **INV-2**: the file route serves a path iff it is in one of (a), (b), (c) — a scratch file of
  another session, or a non-`.md` in the scratchpad, is always 404, with other sessions present.
- **INV-3**: the summary row's chips always agree with what unfolding shows (plan chip ⇔ plan row is
  a file; `<n> tmp` ⇔ n scratch rows), in every host view.

#### Carried-over measurements

- kb:fact/scratchpad-dir-per-session-id was measured interactive, `manual` mode, 2.1.322, one
  repo. Applied here to every permission mode and to sessions Muster launches through the
  wrapper hooks: still valid because the path shape depends on cwd and session id only, and the
  hook wrappers forward payloads verbatim (kb:adr/ingest-all-hooks-command-wrappers). The
  canary guard re-checks it on every Claude Code bump.

## Affected Files

### Daemon (daemon-impl)
- `internal/claudecode/files.go` — REQ-1: the file signal also yields the hook's scratchpad folder, only when well formed.
- `internal/server/reader.go` — REQ-2, REQ-5, REQ-6: routed hooks move the session's scratchpad folder; file route confinement (c); docChanged and write log for scratch writes.
- `internal/reader/reader.go` — REQ-4, REQ-5, REQ-6: scope and listing of the scratchpad folder.
- `internal/server/readerwire.go` — REQ-4, REQ-13: the `scratch` block and plan `modifiedAt`.
- `internal/server/sessionwire.go` — REQ-3: `scratchpadDir`.
- `internal/session/reader.go`, `internal/session/manager.go` — REQ-2, REQ-3: set-on-change with the claude-session-id gate, persisted, broadcast.
- new `internal/store/migrations/0020_scratchpad.sql` and the store's session row mapping — REQ-2.
- `internal/server/renderfix_scenarios_reader.go` — the three new render scenarios, and their scratch files in the reader recording.
- `internal/claudecode/claudecodetest/*.go` — wire-shaped hooks carrying a well-formed `scratchpad_dir` for tests outside the boundary (kb:adr/ingest-wire-shaped-fixtures-via-claudecodetest).

### Web (web-impl)
- `web/index.html` — REQ-7: `#reader-template`'s plan header and slot become the claude section.
- `web/src/render/reader.ts` — REQ-7, REQ-9, REQ-10, REQ-12: summary row, chips, scratch rows, docbar `tmp` badge.
- `web/src/features/reader.ts` — REQ-8, REQ-10, REQ-11, REQ-12: fold memory, opening scratch files, listing re-fetch triggers, the section on ended sessions.
- `web/src/reader/*.ts` (memory and pure derivations) — REQ-8, REQ-9, REQ-11.
- `web/src/protocol/*` — REQ-3, REQ-4, REQ-13: the new wire fields.
- `web/src/style.css` — REQ-7, REQ-9: summary row, chips, `.badge.scratch`, row age, from the mockup.
- `web/render/helpers/reader.ts`, `web/e2e/helpers/reader.ts`, `web/e2e/helpers/payloads.ts` — locators for the new section, and a hook payload with a caller-chosen `scratchpad_dir`.

### Existing tests this breaks
- render-tests: `web/render/reader.spec.ts:285` — the plan row is now inside a folded section; unfold first.
- render-tests: `web/render/reader.spec.ts:506` (E22) — on an ended session the section is now present, not absent.
- e2e-specs: `web/e2e/reader.spec.ts:970` — plan-slot keyboard walk; the plan row is folded away by default.
- web-tests: any `render/reader` or `features/reader` unit test asserting `planSlot: {kind:"absent"}` for a dead session.

## Edge Cases

1. `-p` session: `scratchpad_dir` null on every hook → `scratchpadDir` stays null; summary row `claude [no plan]` or `[plan]`, no tmp chip. → D1
2. Malformed value (`/tmp/scratchpad`, as today's E2E payloads send; relative; trailing slash; parent ≠ session_id) → ignored. → D1 (shared with edge case 1)
3. `/clear`: `SessionEnd{clear}` (old id, old dir) then `SessionStart{clear}` (new id, new dir) → folder moves to the new one. → D2
4. `/clear` pair reordered: `SessionStart{clear}` applied first, then the late `SessionEnd{clear}` naming the old dir → no move back (old id is left). → D3
5. A straggler from the previous turn (old id, old dir) after the rebind → no move. → D3 (shared with edge case 4)
6. `--resume <id>` → SessionStart names the original folder → it moves back; the stray empty folder the resume creates is never named and never listed. → D2 (shared with edge case 3)
7. Daemon restart → `scratchpadDir` loaded from the row; listing still works on an ended session. → D4
8. Folder deleted by macOS → `scratch.files` `[]`, chip gone, section still shows the plan. → D5
9. A symlink inside the scratchpad pointing outside it → not served. → D6
10. Another session's scratch file requested through this session's route → 404. → D6 (shared with edge case 9)
11. A non-`.md` file in the scratchpad (Claude also writes `.json`, scripts) → not listed, not served. → D5 (shared with edge case 8)
12. The tasks folder beside the scratchpad (`…/<sid>/tasks/*.output`) → never listed. → D5 (shared with edge case 8)
13. `docChanged` arrives before the listing resolves → the listing it is fetching will include it; no double fetch. → W3
14. `sessionUpsert` with the same `scratchpadDir` (any other field changed) → no re-fetch. → W3 (shared with edge case 13)
15. Plan written after mount while folded → plan chip turns from `no plan` to `plan` with no re-fetch (from `sessionUpsert`). → R3
16. Long nested path in a 3×2 tile → ellipsized inside the panel, absolute path in `title`. → R5
17. Hook loss: the hook naming a new folder is dropped → the next hook from that id carries it again. → untested: every hook carries the field, so loss only delays the move by one event (kb:fact/hook-delivery-best-effort)

## Acceptance Criteria

### Daemon
- **D1**: Only a well-formed `scratchpad_dir` (absolute, clean, base `scratchpad`, parent named for the hook's `session_id`) reaches the file signal; null, absent, relative and wrong-shape values yield none.
- **D2**: After a `/clear` pair or a resume `SessionStart`, `scratchpadDir` names the new hook's folder and a `sessionUpsert` carried it.
- **D3**: From every source state (unbound, bound, after `/clear`, dead), a hook bound to a Claude session id the session has left never changes `scratchpadDir` (INV-1).
- **D4**: `scratchpadDir` survives a daemon restart and death unchanged.
- **D5**: The listing's `scratch.files` holds exactly the `.md` files under the folder, nested included, dot-directories, non-markdown and the sibling `tasks/` excluded, ordered by `modifiedAt` descending then path; `[]` for a missing folder; `scratch` null when `scratchpadDir` is null.
- **D6**: The file route serves a scratch `.md` of the session and returns `404 not_found` for a non-`.md` there, a symlink escaping it, and another session's scratch file, with that other session present (INV-2).
- **D7**: A routed write under the scratchpad folder ending in `.md` sends one `docChanged`; a non-`.md` write there sends none.
- **D8**: The plan entry of the listing carries `modifiedAt`, null when the plan file does not exist.

### Web
- **W1**: The fold memory defaults to folded when nothing is stored and round-trips per session, beside the Files/Outline folds.
- **W2**: Chip derivation: plan chip `plan` iff `session.plan?.exists`, else `no plan`; tmp chip `<n> tmp` iff n ≥ 1 (INV-3).
- **W3**: The re-fetch decision fires for a `docChanged` naming an unlisted path under `scratch.dir` and for a changed `scratchpadDir`, and for nothing else (same dir, listed path, path outside, listing still in flight).
- **W4**: A scratch row's age is `ageAgo` of the later of `modifiedAt` and the last `docChanged.at` for its path. *Amended (decisions/row-age-text):* bare `formatAge`, not `ageAgo`.

### Render
- **R1**: `reader-docs-scratch`, Focus: folded summary row reads `claude`, a `plan` chip and a `3 tmp` chip, and no plan or scratch row is in the DOM.
- **R2**: `reader-docs-scratch`, Focus, unfolded: the plan row then three scratch rows in the listing's order, each with a `tmp` badge and an age; the non-markdown file is absent.
- **R3**: `reader-docs`, Focus: summary row shows a dimmed `no plan` chip and no tmp chip; unfolded shows `no plan yet` only.
- **R4**: `reader-docs-scratch-ended`: the summary row is present and unfolding shows the plan and scratch rows (REQ-12).
- **R5**: `reader-docs-scratch` at tiles 3×2 (compact): rows fit the panel width, the nested path ellipsized, no horizontal scroll in the nav.
- **R6**: Opening a scratch row in `reader-docs-scratch` shows the docbar `tmp` badge, the file's absolute path, and `aria-current="true"` on that row only.
- **R7**: `reader-docs-scratch-only`: summary row shows `no plan` and `1 tmp`.

### E2E
- **E1**: A launched session receiving a hook with a well-formed `scratchpad_dir` whose folder holds a `.md` → the docs surface's summary row shows `1 tmp`, and unfolding then clicking the row renders that file.
- **E2**: With the reader open, a routed Write hook naming a new `.md` in the scratchpad → the tmp chip goes from `1 tmp` to `2 tmp` without reopening the surface.
- **E3**: A `/clear` pair naming a new empty scratchpad → the tmp chip disappears while the open file stays open.
- **E4**: Ending the session leaves the summary row and its scratch rows openable.

### Automated Checks

```checks
D1 make test
D2 go build ./...
D3 make lint
D5 make check-render-fixtures
W1 make web-build
W2 make web-test
R1 make render-test
E1 make e2e
```

### Reviewer-Verified

- **V1**: no `any` types in new web code.
- **V2**: the summary row, chips, `tmp` badge and row ages match `mockups/opt-b-summary.html` in instrument, dark and light.
- **V3**: `scratchpad_dir` is read only inside `internal/claudecode` (hard rule), and its well-formedness rule has one owner there.
- **V4**: no new filesystem watcher or poll: the scratch list moves only on the listing fetch, `docChanged` and `sessionUpsert`.

## Doc Delta

**reader** — becomes true (`docs/features/reader/spec.md`):
- The nav's top section is **claude**, folded by default to one summary row with chips for the plan and the number of scratch files; unfolded it lists the plan row, then the session's scratchpad `.md` files newest first, each with a `tmp` badge and its age.
- The daemon keeps the scratchpad folder the session's current Claude session id named on its hooks, persisted and never moved by a straggler (kb:fact/scratchpad-dir-per-session-id); the listing carries its `.md` files and the file route serves them.
- A write under the scratchpad sends `docChanged`; a new scratch path or a moved folder re-fetches the listing.
- The claude section stays on an ended session.

**reader** — stops being true:
- "the plan slot pinned on top" (the nav now opens with the claude section).
- "Works on a dead session with the plan slot — and the nav's plan header row — removed."
- In § Does not: "never lists files outside the directory other than the plan" becomes "other than the plan and the session's scratchpad markdown".
- In § Serving and confinement: "or the resolved plan path" gains "or a `.md` under the resolved scratchpad folder".

## Out of scope

- Keeping scratch files from before `/clear` or from earlier resumes in view (mockup C's `before /clear` folder) — the daemon remembers only the current folder.
- Non-markdown scratch files (`.json`, scripts, task output) — the reader renders markdown only.
- Clicking a chip to open the plan directly — chips are labels (developer, 2026-11-12).

## Implementation Notes

**Hints (non-binding):**
- `reader.WalkMarkdown` already walks with the 20,000 cap and skips dot-directories; the listing needs mtimes on top.
- `Manager.SetTranscript` is the pattern for the gated, persist-on-change setter; unlike it, this one broadcasts.
- `reader.Scope` already holds the directory and plan path; the confinement and `PathQualifies` widen there.
- `ageAgo` is the age formatter `changedText` already uses.
- The existing E2E payloads send `scratchpad_dir: "/tmp/scratchpad"`, which REQ-1 rejects, so no existing journey changes behaviour.

**Decisions** (proposed ADRs on approval):
- `reader-scratchpad-in-folded-claude-section` — mockup B: one claude section folded to a summary row, label-only chips, `.md` only, current folder only.
- `reader-served-paths-include-scratchpad` — supersedes kb:adr/reader-served-paths-confined-to-directory-or-plan: adds (c), with the folder accepted only in the measured shape.
- `reader-claude-section-kept-on-ended-session` — the section, plan included, stays on a dead session.
- `reader-scratchpad-dir-from-hooks-persisted` — the folder comes from routed hooks (never derived from uid/cwd, never from the status line), on the session row, gated like the transcript path.

Facts relied on: kb:fact/scratchpad-dir-per-session-id, kb:fact/clear-mints-new-session-id,
kb:fact/resume-keeps-session-identity, kb:fact/hook-delivery-best-effort.

**Doc upkeep (orchestrator):** the four ADRs above; `kb:diagram/store-schema` gains
`scratchpad_dir` (migration 0020); `kb:anchor/ws.session` and the reader anchors per the
Protocol Contract; `TODO.md` #121 ticked at Completion.
