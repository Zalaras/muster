# Plan: file-drop-fix

**Created**: 2026-09-02
**Status**: completed
**Work Type**: full-stack
**E2E Scope**: new-specs
**Description**: Dropping a file on a terminal pane types the file's real path at the cursor instead of navigating the browser (closes #8).

## Overview

Today a file dragged from Finder onto a terminal pane makes Safari (and every other browser)
open the file, losing the dashboard. Nothing in `web/src/` handles `dragover`/`drop` outside
the tile and rail reorder, so the browser default wins. In a real terminal the same gesture
types the file's absolute path at the cursor and Claude Code reads the file when the user
presses Enter (with its usual permission prompt). That is the behaviour this plan reproduces.

The obstacle is that a browser hands a page a dropped file's **name and bytes, never its
path** — deliberately, for privacy. macOS also keeps the drag pasteboard private to the
dragging app (measured 2026-09-02: a Swift/JXA poller reading `NSPasteboard(name: .drag)`
from a CLI process during a live Finder drag saw `changeCount` stay 0), so the path cannot be
recovered from the OS either. Muster's daemon is on the same machine as the browser and tmux
(SPEC §5: remote access is out of scope), so the daemon **locates the original file** instead:
the page uploads the bytes as a fingerprint, the daemon asks Spotlight (`mdfind`) for every
file with that name and exact size, falls back to walking the session's directory when
Spotlight has nothing, byte-compares the candidates against the upload, and returns the
single path whose contents are identical. The page then pastes that path — Terminal.app-style
escaped, trailing space — through xterm's paste routine, which goes out over the existing
terminal socket exactly like typing.

**Settled with Damian at planning:** the daemon never writes a copy of the dropped file — an
unlocatable or ambiguous file produces a visible hint on the pane and types nothing. It must
be the original file or nothing. Foreign drops anywhere on the dashboard are swallowed so a
missed drop never navigates away. Dropping selected text (no files) pastes the text, as real
terminals do. Nothing in the design is macOS-specific except the Spotlight finder, which is
one pluggable step — Linux (`plocate`) and Windows (Windows Search) finders are a future
addition, not a redesign.

## Requirements

### Must Have
- [ ] REQ-1: A foreign drag (anything not carrying the dashboard's own reorder MIME) over any
  part of the dashboard, and its drop, never navigates the browser away from the dashboard.
- [ ] REQ-2: Dropping one or more files on a **live** terminal surface (Focus pane or a Tiles
  tile) uploads each file in drop order to `POST /api/sessions/{id}/locate` and, for each
  `200`, pastes the returned path into that surface's xterm via `Terminal.paste()`, escaped
  Terminal.app-style (see REQ-4) and followed by a single space.
- [ ] REQ-3: The daemon's locate step returns a path only when **exactly one** file on disk has
  the uploaded name, size and byte-identical contents. Zero verified candidates → `404
  not_located`; two or more → `409 ambiguous`. The daemon never writes the uploaded bytes to
  disk.
- [ ] REQ-4: Path escaping matches Terminal.app: a backslash is prefixed to every space and to
  every character in `` \ ! " # $ & ' ( ) * , ; < = > ? [ ] ^ ` { | } ~ ``; everything else
  passes through unchanged (so `~` and `=` are escaped; `/`, `.`, `-`, `_`, `:`, `@`, `+`,
  digits, letters and non-ASCII are not). *Amended 2026-09-03 (review cycle 1, Minor 7): the
  original prose contradicted this list; the list was always authoritative.*
- [ ] REQ-5: Candidate discovery is Spotlight first (`mdfind` with an exact `kMDItemFSName`
  and `kMDItemFSSize` query), then — only if Spotlight yields no verified candidate — a walk
  of the session's `directory` filtered by basename and size, skipping `.git`. Candidates
  are byte-compared before they count. Duplicate paths (after `EvalSymlinks`) count once.
- [ ] REQ-6: Every locate outcome is visible on the surface that received the drop: a
  `role="status"` notice reads `Locating <name>…` while the request is in flight, is cleared
  on success, and on failure shows the failure text from the Testable UI Elements table for
  about 5 s before hiding.
- [ ] REQ-7: A file larger than 50 MiB is never uploaded: the page shows the too-large notice
  and moves to the next file. The daemon independently rejects bodies over the cap with
  `413 too_large`.
- [ ] REQ-8: A drop on a surface whose session is dead (`alive: false`, the "session ended"
  overlay) or whose socket is not open (disconnected/superseded overlay) is swallowed with no
  request, no paste and — for the not-open-socket case — the `Pane isn't connected` notice.
  The dead-session surface shows no notice (nothing to paste into, by design).
- [ ] REQ-9: The tile-header and rail-card reorder drags (plan `move-tiles`, plan
  `order-sidebar`) keep working exactly as before — the global swallow must not claim an
  internal drag.

### Should Have
- [ ] REQ-10: A drop carrying no files but a `text/plain` item pastes that text verbatim
  (no escaping, no trailing space) into the surface via `Terminal.paste()`.
- [ ] REQ-11: After a successful paste, DOM focus moves into that surface's xterm
  (`TerminalSurface.focus()`), so the user can press Enter immediately. A drop is a pointer
  gesture, consistent with plan `terminal-focus`'s "pointer selection only" rule; render
  passes still never focus (INV-1 there is untouched).

### Nice to Have
- [ ] REQ-12: While a foreign drag is over a live surface, the surface carries a
  `drop-target` class (reusing the existing `.tile.drop-target`/`.card.drop-target`
  visual language — neutral `--line-control`, never a state colour) and
  `dataTransfer.dropEffect` is `copy`; elsewhere on the dashboard it is `none`.

## Protocol Contract

Delta against `docs/protocol.md` — **merged there as §3.14 on approval, 2026-09-02**; the canonical text is the protocol doc.

### HTTP: POST /api/sessions/{id}/locate
**Auth**: UI cookie (401 `unauthorized`).

**Request:** `multipart/form-data` with exactly one file part named `file`; the part's
`filename` is the dropped file's basename (UTF-8, as the browser supplies it). No other
parts are read. Bodies over 50 MiB + 64 KiB (multipart overhead) are refused.

**Response 200:**
```json
{ "path": "/Users/damian/Desktop/Screenshot 2026-08-30 at 14.35.00.png" }
```
`path` is the absolute, symlink-resolved path of the single file whose basename, size and
bytes equal the upload. The daemon writes nothing to disk. The response is **not** escaped
for a shell — escaping is the UI's job (REQ-4).

**Errors:**
- `400 invalid_request` — body is not multipart, has no `file` part, or the part's filename
  is empty / contains a path separator.
- `404 unknown_session` — no session with that id (standard `parseSessionID`).
- `404 not_located` — no file on disk matched name, size and bytes.
  `{ "error": { "code": "not_located", "message": "no file named <name> with identical contents was found" } }`
- `409 ambiguous` — two or more distinct files matched.
  `{ "error": { "code": "ambiguous", "message": "<N> identical files named <name>", "paths": ["…", "…"] } }`
  `paths` lists every verified match (absolute, sorted) so a future UI can offer a choice;
  this plan's UI only counts them.
- `413 too_large` — body exceeded the cap. Emitted by the handler when `MaxBytesReader`
  trips; the message names the 50 MiB limit.
- `500 internal_error` — Spotlight or the walk failed for a reason other than "nothing
  found" (e.g. the session directory is unreadable). A Spotlight *timeout* or a missing
  `mdfind` binary is **not** an error — it degrades to the walk (REQ-5).

Ordering/caveats: requests are independent; the UI sends them sequentially in drop order so
pasted paths land in the order the files were dropped. The session's `alive` flag is not
consulted — locating is a filesystem question.

No WS changes.

## Schema Changes

No schema changes required.

## UI Specifications

### Views
- **Focus pane** and **Tiles tiles** — the live `TerminalSurface` root
  (`.terminal-surface`, `aria-label="Terminal: <title>"`) becomes a drop target. A new
  notice element lives inside it alongside the existing `.terminal-overlay`.
- **Whole dashboard** — a document-level drop guard swallows foreign drags/drops everywhere
  (rail, masthead, dialogs, dead-session surfaces, empty grid slots).

### DOM
Inside `TerminalSurface.root`, after `.terminal-overlay`:
```html
<div class="terminal-notice" role="status" hidden></div>
```
Positioned as a one-line strip across the **bottom** of the surface (not a full scrim —
the pane stays readable), `--mono` at 11px like the overlay, grounded on `--scrim` with
`--fg` text. It never covers more than the bottom strip and never restyles pane contents
(design-system §7.5). Toggle with the `hidden` attribute, like the overlay.

### User Flows
1. **File from Finder → live pane.** User drags a file over a pane (REQ-12: outline shows,
   cursor is copy) and releases. Notice shows `Locating <name>…`. ~0.2–2 s later the path
   appears at the cursor with a trailing space, the notice clears, focus is in the pane
   (REQ-11). User presses Enter; Claude Code reads the file as it would in Terminal.app.
2. **Several files.** Same, sequentially: each path is pasted as its request resolves, in
   drop order; a failure for one file shows its notice and does not stop the rest.
3. **File the daemon can't find** (e.g. from a Spotlight-excluded folder, or created a
   second ago and outside the session directory): notice shows the not-located text for
   ~5 s; nothing is typed. User pastes the path by hand.
4. **Two identical copies exist.** Notice shows the ambiguous text with the count; nothing
   is typed.
5. **Dragged text.** Dropping a text selection pastes it verbatim (REQ-10).
6. **Missed drop.** File released on the rail/masthead/anywhere else: nothing happens, the
   dashboard stays (REQ-1).
7. **Dead or disconnected pane.** REQ-8.

### States
- **No data yet / daemon down:** the surface already shows the `disconnected — daemon down`
  overlay; a drop there yields the `Pane isn't connected` notice (REQ-8), no request. A
  drop mid-request when the daemon goes away resolves to the api layer's `network_error`
  → the couldn't-resolve notice.
- **Data:** flows above.
- **Ended:** the `session ended` overlay surface swallows the drop silently (REQ-8).

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Live terminal container | — | `[aria-label="Terminal: <title>"]` | existing (`web/e2e/helpers/terminal.ts` `terminalRegion`); the drop target |
| Drop notice (in flight) | `status` | `Locating <name>…` | `<name>` is the dropped basename verbatim; trailing Unicode ellipsis U+2026 |
| Drop notice (not located) | `status` | `Can't locate <name> on disk — paste its path instead` | em dash U+2014 with spaces, same glyph the overlay texts use |
| Drop notice (ambiguous) | `status` | `<name> matches <N> identical files — paste the path of the one you mean` | `<N>` is `paths.length` from the 409 body |
| Drop notice (too large) | `status` | `<name> is over 50 MiB — paste its path instead` | shown without any request (REQ-7) and on a daemon `413` |
| Drop notice (other failure) | `status` | `Couldn't resolve <name> — paste its path instead` | `network_error`, `500`, `400`, unknown codes |
| Drop notice (pane not connected) | `status` | `Pane isn't connected — nothing pasted` | REQ-8, socket not open |
| Pasted path in pane | — | the escaped path as text inside the terminal container | tty echo renders it before Enter; after Enter the E2E stub prints `stub-echo:<escaped path>` |

Only one notice element exists per surface; a new outcome replaces the text in place. The
notice is `hidden` whenever no text applies.

### Invariants
- **INV-1 (original or nothing):** the UI never pastes a path the daemon did not return with
  `200`, and the daemon never returns a path whose file contents differ from the upload.
  Asserted from: file in session dir; file outside session dir but Spotlight-indexed; file
  present twice; file present with same name+size but different bytes; file absent.
- **INV-2 (no writes):** no locate request, whatever its outcome, creates or modifies any
  file under the data dir or the session directory. Daemon tests assert a directory
  snapshot before/after every outcome in INV-1's list.
- **INV-3 (internal drags untouched):** with the drop guard installed, a rail-card drag and
  a tile-header drag still reorder (the existing `rail-order.spec.ts` / tile reorder specs
  are the regression pin — they must keep passing unmodified).
- **INV-4 (multi-surface routing):** in Tiles with two live tiles A and B, a drop on B
  pastes into B's pane only — A's pane content is unchanged — regardless of which session
  is "current" in the rail.

## Affected Files

### Daemon
- `internal/locate/locate.go` — new package. `type Locator struct{ finders []Finder;
  walkCap int; spotlightTimeout time.Duration }`, `func (l *Locator) Locate(ctx, dir,
  name string, upload []byte) (path string, err error)` returning sentinel errors
  `ErrNotLocated`, `ErrAmbiguous{Paths []string}`. Candidate filter (basename + size),
  byte-compare, `EvalSymlinks` dedupe, sorted output. Pure Go, no server or session
  imports.
- `internal/locate/spotlight.go` — `Finder` that runs `mdfind` with the exact
  name+size query (single quotes escaped in the name), 2 s timeout, returns `nil, nil` when
  `mdfind` is absent (`exec.LookPath`) or times out. `BuildQuery(name string, size int64)
  string` is exported for unit tests.
- `internal/locate/walk.go` — `Finder` over the session directory: `filepath.WalkDir`
  skipping `.git`, stopping at `walkCap` entries (default 200 000) or ctx deadline, matching
  basename + size via `DirEntry.Info()`.
- `internal/server/locate.go` — new handler `handleLocateFile`: `parseSessionID`,
  `http.MaxBytesReader(w, r.Body, 50<<20 + 64<<10)`, `r.FormFile("file")`, filename
  validation, `s.manager.Get(id)` for `Directory`, calls the `Locator`, maps errors to the
  Protocol Contract codes. `413` when the multipart read fails with `*http.MaxBytesError`.
- `internal/server/server.go` — register `POST /api/sessions/{id}/locate` behind
  `requireCookie` next to the other `/api/sessions/{id}/...` routes; `Server` gains a
  `locator *locate.Locator` field.
- `cmd/musterd/main.go` — construct `locate.New()` (Spotlight + walk finders) and pass it
  to the server. No new flags.

### Web
- `web/src/terminal/drop.ts` — new pure module (Vitest-testable, no DOM): `escapePath(path:
  string): string` (REQ-4), `MAX_DROP_BYTES = 50 * 1024 * 1024`, `classifyDrop(types:
  readonly string[], fileCount: number): "files" | "text" | "none"`, and the notice text
  builders `locatingText(name)`, `noticeForFailure(name, failure)` where `failure` is
  `{ kind: "not_located" } | { kind: "ambiguous", count: number } | { kind: "too_large" }
  | { kind: "other" } | { kind: "not_connected" }`.
- `web/src/terminal/pane.ts` — `TerminalSurface`: creates the `.terminal-notice` element;
  installs `dragover`/`dragleave`/`drop` on `root` (prevent default, `dropEffect = "copy"`,
  REQ-12 class); `drop` handler runs the sequential locate→paste loop; new methods
  `pasteText(text: string): boolean` (false unless `term` exists and the socket is `OPEN`)
  and `showNotice(text | null)` with the ~5 s auto-hide timer (cleared on dispose).
  Constructing for a dead session installs the drop handlers too, but they only prevent
  default (REQ-8).
- `web/src/api.ts` — `locateDroppedFile(sessionId: number, file: File):
  Promise<ApiResult<{ path: string }>>` posting `FormData` via `safeFetch`; parses the
  `409` body's `paths` so the caller can count them (extend `ApiErrorBody` parsing with an
  optional `paths?: string[]`, ignored elsewhere).
- `web/src/render/dropguard.ts` — new: `installDropGuard(doc: Document)` adding
  document-level `dragover` and `drop` listeners that call `preventDefault()` **only when
  `event.defaultPrevented` is still false** (an internal reorder or a terminal surface has
  already claimed the event otherwise) and set `dropEffect = "none"` on `dragover`.
- `web/src/main.ts` — one call to `installDropGuard(document)` at startup.
- `web/src/style.css` — `.terminal-notice` (bottom strip) and `.terminal-surface.drop-target`
  (REQ-12, same neutral outline as the existing drop-target rules; must pass `make contrast`).

### E2E (owned by e2e-specs)
- `web/e2e/drop.spec.ts` — new spec file.
- `web/e2e/helpers/terminal.ts` — add `dropFiles(region, files: {name, bytes}[])` and
  `dropText(region, text)` helpers that build a `DataTransfer` in-page
  (`page.evaluateHandle`, `new File([...])`) and `dispatchEvent("drop", { dataTransfer })`,
  plus `dropNotice(region)` returning `region.getByRole("status")`.

`SPEC.md`, `TODO.md` and `docs/protocol.md` are the orchestrator's — see Implementation
Notes → Doc upkeep.

## Edge Cases

1. **Internal reorder drag crosses a terminal surface (Tiles: tile header dragged over
   another tile's body).** The surface's `dragover` must not claim it: check
   `event.dataTransfer.types` for the reorder MIME (export `DRAG_MIME` from
   `render/dragreorder.ts`, or check for the absence of `Files`/`text/plain`) and return
   without `preventDefault`, so `tiledrag`'s own container handlers and the guard behave as
   today. INV-3.
2. **Drop with `Files` on a surface in Tiles while a *different* session is current.** Paste
   goes to the receiving surface's own socket (each surface owns one). INV-4.
3. **Session dies between drop and response** (pane killed, `4001`): `pasteText` returns
   false because the socket closed → `Pane isn't connected` notice; nothing lost silently.
4. **Daemon restarts mid-request.** `safeFetch` → `network_error` → other-failure notice.
   The surface's own reconnect logic is unchanged.
5. **Superseded surface** (another window took the session): socket closed → REQ-8 notice.
6. **Same file name, same size, different bytes** on disk (e.g. two screenshots of identical
   dimensions): byte-compare rejects it → `not_located`, never a wrong path. INV-1.
7. **Two byte-identical copies** (file duplicated in the repo, or Spotlight sees both a
   Desktop original and an iCloud copy): `409 ambiguous` with both paths; UI counts them.
8. **Spotlight returns the same file via two paths** (symlinked folder, `/private/tmp` vs
   `/tmp`): `EvalSymlinks` dedupe makes it one candidate.
9. **File created seconds before the drop** inside the session directory (Spotlight lag
   measured ~2 s): Spotlight misses, the walk finds it. Outside the session directory it is
   `not_located` until indexed — acceptable, documented in the notice.
10. **Spotlight disabled/excluded folders, `mdfind` missing (non-macOS):** finder returns no
    candidates without error; the walk still runs. Cross-platform seam.
11. **Huge session directory** (`node_modules`, monorepo): walk cap 200 000 entries or the
    request's ctx deadline → treated as exhausted → `not_located` if nothing found before
    the cap. Never a 500 for size alone.
12. **Filename with `'`** (`it's.png`): Spotlight query escapes the quote; the walk is
    unaffected; REQ-4 escapes it for the paste.
13. **Filename with a path separator or empty** (browsers should never send these): `400`.
14. **Non-ASCII filename** (`Bildschirmfoto.png`, emoji): compared as the browser supplies it
    (UTF-8, NFC/NFD as given); APFS is normalisation-insensitive so the walk's `stat` finds
    it; Spotlight's `kMDItemFSName` compare is likewise normalisation-tolerant. Not escaped
    in the paste.
15. **Text drop that also carries Files** (dragging a file from some apps adds a
    `text/uri-list` or `text/plain` item too): files win — `classifyDrop` returns `"files"`
    whenever `fileCount > 0`.
16. **Text drop of a `file://` URL string** (Safari occasionally supplies one from
    non-Finder sources): pasted verbatim per REQ-10; no attempt to decode it into a path.
    Deliberately simple — treat as text.
17. **Over-cap file among several**: skipped with its notice; the others proceed (REQ-7).
18. **Hook loss/duplication/reordering, `/clear` rebinding, daemon restart mid-session,
    no-data nulls, pane death without `SessionEnd`:** none of these touch this feature —
    it reads no hook state and keys only on the session id and directory. Listed to record
    that they were considered.
19. **Drop while the notice is still showing a previous failure**: the new `Locating…` text
    replaces it immediately and the old hide timer is cancelled.
20. **`dropEffect = "none"` on the document guard and browser navigation.** The intended
    behaviour is "cursor says not-allowed, nothing happens". If any supported browser is
    found to navigate despite a prevented `dragover` with `dropEffect none`, web-impl leaves
    `dropEffect` untouched on the guard (REQ-1 outranks REQ-12's cursor) and records which
    browser in the plan's Implementation Notes.

## Acceptance Criteria

IDs are unique across the whole section — `D*` daemon, `W*` web, `E*` e2e. One clause per
criterion; never mix a runnable command with a judgement call in one item.

### Daemon
- **D1**: `make test` passes.
- **D2**: `go build ./...` passes.
- **D3**: `make lint` passes.
- **D4**: `Locate` returns the path when exactly one byte-identical file exists in the walk root.
- **D5**: `Locate` returns `ErrNotLocated` when a same-name same-size file has different bytes.
- **D6**: `Locate` returns `ErrAmbiguous` carrying both sorted paths when two identical copies exist.
- **D7**: `Locate` counts a file reachable via a symlinked directory once.
- **D8**: the walk skips `.git` directories.
- **D9**: the walk stops at the entry cap and reports not-located rather than erroring.
- **D10**: `BuildQuery` produces `kMDItemFSName == 'it\'s.png' && kMDItemFSSize == 12` for that input.
- **D11**: the Spotlight finder returns no candidates and no error when `mdfind` is absent or times out.
- **D12**: the handler answers `400 invalid_request` when the `file` part is missing.
- **D13**: the handler answers `413 too_large` for a body over the cap.
- **D14**: the handler answers `404 unknown_session` for an unknown id.
- **D15**: the handler answers `404 not_located` / `409 ambiguous` (with `paths`) / `200 {path}` matching the locate outcome.
- **D16**: after every handler outcome above, the data dir and walk root contain exactly the files they did before (INV-2).
- **D17**: `internal/locate` imports nothing from `internal/server`, `internal/session` or `internal/claudecode`.

### Web
- **W1**: `make web-build` passes.
- **W2**: `make web-test` passes.
- **W3**: `make contrast` passes.
- **W4**: `escapePath` prefixes a backslash to every character REQ-4 lists and to nothing else (table-driven Vitest over each listed character, a plain path, and a non-ASCII name).
- **W5**: `classifyDrop` returns `"files"` when `fileCount > 0` even if `text/plain` is present, `"text"` for text-only, `"none"` otherwise.
- **W6**: the notice text builders produce exactly the Testable UI Elements strings.
- **W7**: no `any` types in new web code.
- **W8**: `TerminalSurface.pasteText` returns false and sends nothing when the socket is not `OPEN`.
- **W9**: the drop guard never calls `preventDefault` on an event that is already `defaultPrevented`.

### E2E
- **E1**: dropping a file that exists in the session directory (unique random bytes) on the Focus pane makes the pane show the escaped path, and after Enter `stub-echo:<escaped path>`.
- **E2**: E1 with a filename containing a space shows the backslash-escaped form in the pane.
- **E3**: dropping a file whose bytes exist nowhere on disk shows the not-located notice and types nothing (after Enter the stub echoes an empty line, not a path).
- **E4**: dropping a file that exists twice (identical bytes) in the session directory shows the ambiguous notice with `2`.
- **E5**: dropping a file on the masthead leaves `page.url()` unchanged and the rail still visible.
- **E6**: dropping `text/plain` on the pane pastes the text verbatim.
- **E7**: a 50 MiB + 1 byte file shows the too-large notice and no `/locate` request is issued.
- **E8**: in Tiles with two live tiles, a drop on tile B pastes into B and A's pane text is unchanged (INV-4).
- **E9**: a drop on a dead session's surface shows no notice and the dashboard stays.
- **E10**: the existing rail reorder and tile reorder specs pass unmodified with the guard installed (INV-3).
- **E11**: after a successful drop, `activeElementInsideTerminal(page, title)` is true (REQ-11).

### Automated Checks

Every line below is `<ID> <single-line shell command>`, run from the project root. A check passes
iff its command exits 0. Write "must not exist" checks so success is exit 0 — prefix the grep with
`!`. IDs match the prose criterion above where one exists; a check with no prose twin (e.g. a build
gate) is fine and shares the same ID namespace. The orchestrator and the review agent run these
verbatim; nothing else in this section is executed automatically.

```checks
D1 make test
D2 go build ./...
D3 make lint
D17 ! rg -n -e '"github.com/Zalaras/muster/internal/(server|session|claudecode)"' internal/locate/
W1 make web-build
W2 make web-test
W3 make contrast
E1 make e2e
```

Scope note for D17: `_test.go` files inside `internal/locate/` are in the grep's net on
purpose — the package's tests must stay pure too (they exercise `Locate` against temp dirs,
never a server). Dry-run against this plan: the pattern does not occur in `plan.md`. Dry-run
against the tree: `internal/locate/` does not exist yet, so there are no pre-existing hits.

### Reviewer-Verified

- **D4–D16**: read the daemon unit tests and confirm each criterion has a dedicated test; run
  them (they are inside `make test`).
- **W4–W9**: read the Vitest files and the pane/guard code.
- **E2–E11**: read `web/e2e/drop.spec.ts` and confirm each has a dedicated test; they run
  inside `make e2e`.
- **INV-1**: confirm no code path pastes a path except from a `200` body, and no daemon path
  returns a candidate that skipped the byte-compare.
- **INV-2**: confirm no `os.WriteFile`/`os.Create`/`os.MkdirAll` in `internal/locate/` or
  `internal/server/locate.go`.
- **REQ-9/INV-3**: confirm `dropguard.ts` and the surface `dragover` handler both bail on
  internal drags.
- **Design-system §7.5**: confirm the notice sits in the frame (bottom strip) and never
  restyles xterm's DOM.
- **Hard rule (no Claude Code knowledge leakage)**: this feature reads no hook/status-line
  data; confirm `internal/locate` and the handler import nothing from `internal/claudecode`.

## Implementation Notes

- **Measured facts this plan rests on (2026-09-02, macOS 26 / Darwin 25.6):**
  `mdfind "kMDItemFSName == '<name>' && kMDItemFSSize == <size>"` found a Desktop screenshot
  in 0.15 s and a source file inside this repo; a freshly created Desktop file was indexed
  ~2 s after creation. The macOS drag pasteboard (`NSPasteboard(name: .drag)`) read from a
  CLI process (JXA and compiled Swift, inside and outside the tool sandbox) stayed at
  `changeCount 0` through a live Finder drag — it is process-private, which is why path
  recovery goes through Spotlight + walk and not the pasteboard.
- **Why bytes travel at all.** The upload is a fingerprint, not a transfer: the daemon
  compares it against candidates in memory and never persists it. Claude Code still reads
  the file from its original path on Enter, with its usual permission prompt.
- **`Terminal.paste()`**, not `onData`/socket writes directly: xterm normalises line endings
  and wraps in bracketed-paste markers iff the application enabled mode 2004 (Claude Code
  does; the E2E stub does not, so the stub sees plain text). `paste()` routes through
  `onData`, so the existing socket send path is reused unchanged.
- **Sequential, not parallel, uploads** so pasted paths keep drop order and the notice
  always names the file in flight.
- **E2E determinism**: the harness's scratch dirs live under `os.tmpdir()`, which Spotlight
  does not index, so E2E always exercises the walk — and each dropped file's content is
  unique random bytes so a Spotlight hit elsewhere on the machine is impossible. If the
  2 s Spotlight timeout ever makes E2E slow, a `-locate-spotlight=false` seam flag can be
  added (not planned now).
- **Drop simulation in Playwright**: `locator.dispatchEvent("drop", { dataTransfer })` with
  a `JSHandle<DataTransfer>` built via `page.evaluateHandle` (`dt.items.add(new
  File([bytes], name))`). No `dragover` is needed for a dispatched `drop`, but E5's
  navigation check should dispatch `dragover` then `drop` on the masthead to exercise the
  guard's real path.
- **Cross-platform note for SPEC** (Damian wants Linux and maybe Windows later): the only
  OS-specific piece is the Spotlight `Finder`. Linux gets a `plocate`/`locate` finder,
  Windows a Windows Search one; the walk and byte-compare are portable as written.
- **Doc upkeep (orchestrator):**
  - `TODO.md` — tick the #8 entry under the open-items list, noting the plan name and
    the original-file-or-nothing decision.
  - `SPEC.md` changelog — entry "2026-09-02 — file drop types the original path (plan
    `file-drop-fix`)": decision that Muster never stages a copy; Spotlight+walk locate;
    drag-pasteboard measurement; cross-platform finder note.
  - `docs/protocol.md` — §3.14 merged from the Protocol Contract above on approval; §8
    milestone map gains the endpoint under Pre-v1; changelog line.
