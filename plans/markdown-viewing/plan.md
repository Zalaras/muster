# Plan: Markdown viewing

**Created**: 2026-09-13
**Status**: completed
**Work Type**: full-stack
**E2E Scope**: new-specs
**Fixture plan**: reader.spec.ts daemon (auto-focus needs the sole session; `docChanged`, the plan slot and one daemon restart are asserted per session)
**Features**: reader, surfaces, lifecycle, ingest
**Description**: A third `docs` segment in the `claude | shell` switch replaces the pane with a sanitized markdown reader for the session's plan and every `.md` under its directory, with a right-hand file nav and outline, the plan located from the transcript and refreshed by the Write hook.

## Overview

Reading markdown is the one thing Damian still leaves the dashboard for: the plan a session
wrote in plan mode, the `plans/<name>/plan.md` a pipeline session works from, an ADR or
`TODO.md` under the session's directory. This plan adds a **reader** to each session as a
third surface — the `claude | shell` segment gains `docs`, in the Focus mainhead and every tile
footer — so the document sits where the terminal does, one click away. The requirements were
settled in `plans/markdown-viewing/spec.md`; the placement (option A with a right-hand nav) in
`docs/design/mockups/markdown-viewing/` (`a2-nav-files-focus.html`, `a2-nav-hidden-focus.html`,
`a2-nav-tiles.html`), which are the design authority for every surface below.

The hard part is knowing where a plan lives: it is `<plansDir>/<slug>.md` and the slug is on no
hook payload — only the transcript names it (`kb:fact/plan-file-path-in-transcript`). Muster
starts keeping the latest transcript path per session and scans it on the moments a plan can
appear (SessionStart, leaving plan mode, a write into the plans directory, the reader opening).
The change signal is already on the wire — a `PostToolUse` Write/Edit names the file it touched —
so there is no filesystem watcher and no poll; a missed hook leaves the file stale and the
freshness cue says how old the last known write is, or says nothing when no write was ever seen.

Rendering happens in the browser with two new pinned dependencies (marked, DOMPurify): the daemon
hands raw `text/markdown` bytes exactly as the issue preview hands raw markdown today
(`kb:adr/issue-preview-is-the-leak-check`), and the dashboard trusts none of it. Served paths are
confined to the session directory or the derived plan path. Everything Claude-Code-shaped — the
transcript line shape, the plan naming rule, the tool-input file path — stays in
`internal/claudecode/`. Plan approval (SPEC § 3.1) is a follow-on that reuses this surface; the
reader leaves room in its bar and builds none of it.

## Requirements

REQ-1 … REQ-23 carry the spec's R1 … R23 numbering one-to-one, refined where planning settled a
detail; REQ-24 … REQ-27 are planning additions (interview 2026-09-13).

### Must Have

- [ ] **REQ-1**: `SurfaceKind` gains `docs`. The segment renders as `claude | shell | docs` in the
      Focus mainhead and every tile footer, built once per host and mutated afterwards (never
      rebuilt on a tick), with `docs` a native `<button>` like the other two.
- [ ] **REQ-2**: Selecting `docs` mounts the reader in that pane only. The hidden Claude or shell
      `TerminalSurface` is disposed exactly as the shell switch disposes the hidden surface today;
      no other session's live client is touched. Switching back to `claude` or `shell` restores
      that surface; a running shell keeps its pip throughout.
- [ ] **REQ-3**: `docs` works on a dead session: the tree lists and serves files; the plan slot is
      **absent** from the nav.
- [ ] **REQ-4**: The reader bar shows, left to right: a `plan` badge (only when the open file is the
      plan), the file's basename, its absolute path (never abbreviated — the plan lives outside the
      repo), the freshness cue `changed <age> ago` driven by the last write hook seen for that
      path, a `pop out ↗` link, and the nav arrow (`›` on the nav's edge while open; `‹` at the bar's
      right end while collapsed). No file-picker dropdown.
- [ ] **REQ-5**: The body renders the file as GFM — tables, task-list checkboxes, fenced code,
      headings — on the `--well` ground with the existing type tokens (`--disp` headings, `--sans`
      body, `--mono` code). No new colour tokens.
- [ ] **REQ-6**: Whole file, always: no truncation, no "open elsewhere". Files over **10 MiB
      (10,485,760 bytes)** are refused by the daemon with `413 too_large` and the reader shows the
      message; anything under renders in full.
- [ ] **REQ-7**: The last open file is remembered per session in the browser (localStorage, keyed
      by Muster session id) and restored when the surface reopens — across surface switches, view
      switches, reloads and in the pop-out. The first time a session has a plan and nothing is
      remembered, the plan opens.
- [ ] **REQ-8**: `pop out ↗` is a real link (`target="_blank"`) to `/doc.html?session=<id>&path=<abs>`,
      a second page carrying the full reader (bar, body, nav) for that session and file. The
      browser owns the tab from there.
- [ ] **REQ-9**: Plan slot pinned at the top of the nav under a `plan` header: the plan file with a
      `plan` badge when resolved, or the text `no plan yet` when `session.plan` is null or
      `plan.exists` is false. Removed entirely on a dead session (REQ-3).
- [ ] **REQ-10**: Below it, a file tree of every `*.md` (case-insensitive) under the session
      directory, paths relative to it, folders collapsed by default with a recursive file count,
      folders before files, both alphabetical. Listed via `git ls-files -co --exclude-standard`
      when the directory is a git checkout (filtered to `.md` in Go), otherwise a plain walk that
      skips dot-directories.
- [ ] **REQ-11**: A filter box above the tree narrows entries to files whose relative path contains
      the text (case-insensitive), expanding the ancestors of every match; clearing it restores the
      collapsed tree.
- [ ] **REQ-12**: The open file carries `aria-current="true"` in the tree (and in the plan slot when
      the plan is open); opening another file moves it.
- [ ] **REQ-13**: A file the session's Claude wrote — any routed `docChanged` for a `.md` under the
      directory or for the plan path, subagent hooks included — shows a changed dot in the tree
      (plan slot included) until it is opened; the dot's presence in the DOM is the indicator.
- [ ] **REQ-14**: Below the tree, under an `outline` header, the open file's headings (h1–h6,
      indented by level). Clicking one scrolls the body to it; the heading currently at the top of
      the visible body carries `aria-current="true"` as the reader scrolls. The tree and the outline
      fold independently through their headers; the arrow (REQ-4) collapses the whole nav.
- [ ] **REQ-15**: In a tile the reader renders compact: narrower nav, the path dropped from the
      bar. At 3×2 density the nav starts collapsed; at 2×2 it starts open.
- [ ] **REQ-16**: The daemon keeps the latest transcript path per session (persisted) and derives
      the plan from it with the fact record's rule — the attachment-carried path first, accepting
      every attachment type that carries it, the slug fallback second. The scan runs on
      SessionStart (startup, resume and clear), on `PreToolUse`/`PostToolUse` of `ExitPlanMode`, on
      a Write/Edit whose path sits under the default plans directory, and on every
      `GET /api/sessions/{id}/reader` — never on every hook.
- [ ] **REQ-17**: The Session object gains `plan: {path, exists} | null`, refreshed by REQ-16 and
      flipped to `exists: true` by any routed write naming the path. Additive — no protocol bump
      (`kb:adr/connection-protocol-bumps-only-on-shape-change`).
- [ ] **REQ-18**: A `docChanged` WS message follows every routed `PostToolUse` Write/Edit/MultiEdit
      that names a `.md` under the session directory or the plan path. The reader re-fetches and
      re-renders the open file when a `docChanged` names it and updates the freshness cue. Hooks
      are best-effort: a missed one leaves the file stale and labelled by the cue's age.
- [ ] **REQ-19**: The open file is additionally re-fetched when the docs surface is opened
      (mount) and, when it is the plan, when the window regains focus. No polling, no filesystem
      watcher, no manual refresh button.
- [ ] **REQ-20**: `GET /api/sessions/{id}/reader` lists; `GET /api/sessions/{id}/reader/file` serves
      raw bytes as `text/markdown`. A file is served only if, after symlink resolution, it sits
      under the session directory (resolved the same way) and ends in `.md`, or equals the derived
      plan path. Everything else is `404 not_found` — indistinguishable from a missing file. No
      route under `/reader` writes anything.
- [ ] **REQ-21**: Transcript line shapes, the plan naming rule, the plans-directory default and the
      tool-input file-path key live only in `internal/claudecode/`; the rest of the daemon and the
      dashboard see neutral values (a written path, a transcript path, a "plan may be ready" flag).
- [ ] **REQ-22**: Rendering in the browser with **marked 18.0.13** and **DOMPurify 3.4.15**, pinned
      exactly in `web/package.json` like xterm. The sanitized output is inserted as a DOM fragment
      (`RETURN_DOM_FRAGMENT`), never through `innerHTML`.
- [ ] **REQ-23**: An ADR records the renderer choice and the alternatives considered (see
      Implementation Notes → ADRs), and states that dependency bumps in this repo are manual.
- [ ] **REQ-24**: When no write hook has been seen for the open file this daemon lifetime, the
      freshness cue is **absent** (no element) — never "unknown", never a guess from mtime.
- [ ] **REQ-25**: The non-git walk stops at **20,000** files and the listing reports
      `truncated: true`; the nav's count then reads `20000+ .md`. The git listing is never capped.
- [ ] **REQ-26**: A hook whose Claude session id is not the session's current one (a straggler
      from before a `/clear`, `kb:adr/ingest-monotonic-rebind`) never moves the transcript path or
      the plan; its written path is still recorded (the write was real).
- [ ] **REQ-27**: The pop-out page shares the reader component, the WebSocket client and the
      localStorage memory with the dashboard; it has no masthead, rail or segment, and hides the
      `pop out ↗` link.

### Should Have

- [ ] **REQ-28**: A file that no longer exists when fetched (deleted or renamed underneath the
      reader) shows `file no longer exists — <path>` in the reader's status line and keeps the
      last render; the tree drops it on its next listing.

### Nice to Have

- None. Relative links between markdown files opening inside the reader, code/diff viewing,
  subagent plans and the workshop sibling are out of scope (spec § Out of Scope).

## Protocol Contract

Delta against `docs/protocol.md` (merged there on approval under new anchors `sessions.reader`,
`sessions.reader-file` and `ws.doc-changed`, plus the `ws.session` edit; `docs/features/reader/contract.md`
regenerates). Additive throughout — protocol stays version 2.

### WS: daemon→UI — the Session object (`kb:anchor/ws.session`) gains `plan`

```jsonc
"plan": { "path": "/Users/damian/.claude/plans/say-hi-golden-finch.md",  // absolute, as the transcript resolved it
          "exists": true }                                                // false = plan mode entered, nothing written yet
// null when the session's latest known transcript names no plan (never entered plan mode, or
// /clear minted a fresh transcript). Refreshed by the transcript scan (REQ-16) and flipped to
// exists:true by a routed write naming the path (REQ-18). Renders as "no plan yet" when null or
// when exists is false. Required key on every Session object (daemon and dashboard ship together).
```

### WS: daemon→UI `docChanged`

```jsonc
{ "type": "docChanged",
  "id": 7,                                              // Muster session id
  "path": "/Users/damian/code/Projects/muster/TODO.md",  // absolute, cleaned; the plan path or a .md under directory
  "at": "2026-09-13T09:15:00Z" }                         // when the daemon processed the hook (hooks carry no timestamp)
```

Sent once per routed `PostToolUse` whose tool is Write, Edit or MultiEdit and whose file path,
after `filepath.Clean`, sits lexically under the session's `directory` and ends in `.md`
(case-insensitive) **or** equals `session.plan.path`. Subagent-marked hooks count. Not sent for
unrouted events, for other tools, or for other paths. When the write names the plan path and
`plan.exists` was false, the `sessionUpsert` carrying `exists: true` is sent **before** the
`docChanged`. Best-effort like the hooks it mirrors: a client must never depend on receiving it.
A client that does not know `id` ignores it.

### HTTP: `GET /api/sessions/{id}/reader`

**Auth**: UI cookie (`401 unauthorized`).
**Request:** no body, no query.

Lists the session's readable markdown and, as a side effect, runs the transcript scan when the
session has a known transcript path — this is the "reader opened" trigger of REQ-16; a changed
plan is persisted and broadcast as a `sessionUpsert` before this response is written. `alive` is
not consulted.

**Response 200:**

```jsonc
{
  "directory": "/Users/damian/code/Projects/muster",   // the session's directory, absolute, cleaned
  "plan": { "path": "/Users/damian/.claude/plans/say-hi-golden-finch.md",
            "exists": true,
            "writtenAt": "2026-09-13T09:15:00Z" },     // same object as session.plan plus writtenAt:
                                                       //   RFC3339 | null — last routed write seen this daemon lifetime
                                                       // null when session.plan is null
  "files": [                                           // every *.md under directory, relative, forward slashes,
    { "path": "TODO.md",          "writtenAt": null },  //   sorted by path; never includes the plan unless it
    { "path": "docs/adr/x.md",    "writtenAt": "2026-09-13T09:14:58Z" } ], // physically sits under directory
  "listing": "git",                                    // "git" (ls-files -co --exclude-standard) | "walk" (not a checkout)
  "truncated": false                                   // true only for "walk" when the 20,000-file cap was hit
}
```

`writtenAt` values come from the daemon's in-memory write log (REQ-18), forgotten on restart.

**Errors** (envelope per `kb:anchor/transport`):

- `404 unknown_session` — `{ "error": { "code": "unknown_session", "message": "unknown session id" } }`
- `409 directory_missing` — the session's directory no longer exists or is not a directory.
  `{ "error": { "code": "directory_missing", "message": "/Users/d/gone no longer exists" } }`
- A `git` failure inside a checkout is not an error: the daemon logs it and falls back to `"walk"`.

### HTTP: `GET /api/sessions/{id}/reader/file?path=<absolute>`

**Auth**: UI cookie (`401 unauthorized`).
**Request:** query `path` — absolute path of the file to read (the plan's `path`, or
`directory + "/" + files[i].path` joined by the client).

**Response 200:** `Content-Type: text/markdown; charset=utf-8`, `Cache-Control: no-store`, body =
the file's bytes verbatim (no size header beyond `Content-Length`; the daemon does not parse it).

**Errors** (envelope per `kb:anchor/transport`; JSON even though success is `text/markdown`):

- `400 invalid_request` — `path` missing or not absolute.
  `{ "error": { "code": "invalid_request", "message": "path must be an absolute file path" } }`
- `404 unknown_session` — as above.
- `404 not_found` — the path is outside confinement (REQ-20: not under the symlink-resolved
  directory with a `.md` suffix, and not equal to the resolved plan path), or does not exist, or
  is a directory. Deliberately one code for all three.
  `{ "error": { "code": "not_found", "message": "no such document" } }`
- `413 too_large` — the file exceeds 10 MiB.
  `{ "error": { "code": "too_large", "message": "/Users/d/big.md is 12.4 MB; the reader serves files up to 10 MB" } }`

There is **no** `POST`/`PUT`/`DELETE` under `/api/sessions/{id}/reader` — the reader is read-only
by construction.

## Schema Changes

Migration `internal/store/migrations/0008_reader.sql` (forward-only, `kb:adr/lifecycle-migrations-add-tables-when-written`):

```sql
-- Pre-v1 (plan markdown-viewing, 2026-09-13): the latest transcript path a routed hook named and
-- the plan derived from it. Display-only; never read by the state machine.
ALTER TABLE session ADD COLUMN transcript_file TEXT;
ALTER TABLE session ADD COLUMN plan_path       TEXT;
ALTER TABLE session ADD COLUMN plan_exists     INTEGER NOT NULL DEFAULT 0;
```

- `transcript_file` NULL until the first routed hook after this migration; rewritten only when the
  value changes (every hook carries it; a no-op write per hook would double the ingest worker's
  SQLite traffic).
- `plan_path`/`plan_exists` NULL/0 until a scan resolves one; `plan_path` NULL is the wire `plan: null`.
- The write log (`writtenAt`) is **not** persisted — daemon memory only, like shells.

## UI Specifications

Design authority: `docs/design/mockups/markdown-viewing/a2-nav-files-focus.html` (Focus, nav
open), `a2-nav-hidden-focus.html` (nav collapsed), `a2-nav-tiles.html` (tile, compact),
`reader-anatomy.html` (bar anatomy and the reserved approval space), with the rules of
`docs/design/design-system.md` § 1 (tokens only — the mockups' `.rnav`, `.docbar`, `.md` rules in
`gen.mjs` are transcribed into `style.css`), § 2 (type roles: `--disp` headings, `--sans` body,
`--mono` code and chrome), § 5 (buttons, segmented control, form fields — the filter box is a
`--well` input with a `--edge` border), § 6.7 (daemon-down is the existing banner; the reader adds
only its own status line) and § 6.8 (stale is labelled, not hidden). The mockups show the
directory with `~`; the build shows the **absolute** path (the client cannot know `$HOME`) — the
only deliberate deviation. The outline (`.rnav .ol` rules in `gen.mjs`) was dropped from the
mockups and re-added to the spec (R14); it is in (interview 2026-09-13).

### Views

- **Focus** — the mainhead segment gains `docs` after `shell`. With `docs` selected the main slot
  (`#main-terminal-slot`) holds the reader root instead of a terminal; the dead surface is hidden
  regardless of `alive`; `#sizenote` is hidden (no geometry to state).
- **Tiles** — every tile footer segment gains `docs`. With `docs` selected the tile's `.tbody-slot`
  holds a compact reader; the footer's geometry text is empty and the `live`/`stopped` marker
  follows the session as today.
- **Pop-out** (`/doc.html`) — the reader alone, filling the viewport, for `?session=<id>&path=<abs>`.
  Unknown or missing `session` → reader status line `unknown session`. Missing or unreadable `path`
  → the nav loads and the body shows the nothing-open placeholder.

### Reader DOM (one component, three hosts)

Built from `<template id="reader-template">` in `web/index.html` and `web/doc.html` (same markup):

```html
<section class="reader" aria-label="Reader: <title>">          <!-- role region; "untitled" like Terminal: -->
  <div class="docbar">
    <span class="badge">plan</span>                            <!-- only while the plan is open -->
    <span class="fname">plan.md</span>                         <!-- basename -->
    <span class="path">/abs/path/plan.md</span>                <!-- absolute; hidden in compact -->
    <span class="chg"><i aria-hidden="true"></i>changed 12s ago</span>  <!-- absent when no write seen (REQ-24) -->
    <a class="ib" href="/doc.html?session=7&path=…" target="_blank" rel="noopener">pop out ↗</a>  <!-- hidden in the pop-out -->
    <!-- the arrow button sits here while the nav is collapsed -->
  </div>
  <div class="reader-notice" role="status" hidden></div>        <!-- REQ-28, too_large, daemon-down, unknown session -->
  <article class="md">…sanitized fragment…</article>            <!-- scroll container; placeholder "nothing open — pick a file" -->
  <nav class="rnav" aria-label="Documents">
    <div class="hd">plan<button type="button" class="arr" aria-label="Hide files">›</button></div>  <!-- arrow here while open -->
    <button type="button" class="f plan" aria-current="true"><span class="badge">plan</span><span class="fname">plan.md</span><span class="dot" aria-hidden="true"></span></button>
    <!-- or: <div class="f none">no plan yet</div>; the whole plan block is absent on a dead session -->
    <div class="sep"></div>
    <button type="button" class="hd toggle" aria-expanded="true" aria-label="Files"><span class="dir">/abs/dir</span><span class="n">71 .md</span></button>
    <input type="search" class="filter" placeholder="filter files…" aria-label="Filter files" />
    <div class="tree">
      <button type="button" class="f d0" aria-expanded="false"><span class="car" aria-hidden="true">▸</span>docs/<span class="cnt" aria-hidden="true">41</span></button>
      <button type="button" class="f d0"><span class="fname">TODO.md</span><span class="dot" aria-hidden="true"></span></button>
    </div>
    <div class="sep"></div>
    <button type="button" class="hd toggle" aria-expanded="true" aria-label="Outline">outline</button>
    <div class="outline"><button type="button" class="ol h2" aria-current="true">Requirements</button>…</div>
  </nav>
</section>
```

- Tree entries are indented by depth class (`d0`…`d5`, mockup `d1`…`d3`); a folder button toggles
  `aria-expanded` and its children's presence; a file button opens the file. Folder children are
  rendered only while expanded (no `hidden` toggling of thousands of nodes).
- The changed dot (`span.dot`) is present in the DOM iff the file has an unseen `docChanged`
  (REQ-13); the caret and count are `aria-hidden` so a folder's accessible name is exactly its
  `name/` and a file's exactly its basename.
- Headings in the rendered fragment get `id`s (slugified, deduplicated with `-2`, `-3`…); the
  outline is built from the same walk. Scroll-spy runs on the `.md` scroll event (rAF-throttled):
  the last heading whose top is at or above the container's top is current.
- `.reader.compact` (tiles): `.rnav` narrower, `.path` and `.hd .n` hidden, tighter `.md` padding
  — the mockup's `.rnav.compact`/`.md.compact` rules.
- The reader's segment buttons are `disabled` while the WS is down (the existing gate); the reader
  itself keeps its last render and shows `musterd unreachable — showing last render` in its status
  line until the next `hello`.

### User Flows

1. Session showing Claude. Click `docs` → the Claude surface is disposed, the reader mounts,
   `GET …/reader` (listing + scan). No memory and `plan.exists` → the plan opens
   (`GET …/reader/file?path=<plan>`); otherwise the remembered file opens, or the placeholder shows.
2. Click a tree file → fetch, render, `aria-current` moves, dot clears, memory updated.
3. Claude writes the open file → `docChanged` → re-fetch, re-render, cue `changed 0s ago` and
   ages every tick; a `docChanged` for another file lights its dot.
4. Claude enters plan mode, writes the plan, leaves plan mode → scan on `ExitPlanMode` (and on the
   write under the plans directory) → `sessionUpsert` with `plan` → the slot fills; if nothing is
   open the plan opens.
5. `pop out ↗` → new tab at `/doc.html?…` with the same file and nav; both tabs update on
   `docChanged` and share memory.
6. Click the nav arrow → nav hides, `‹` `Show files` appears at the bar's right end; click →
   restored. Click `Files`/`Outline` headers → that section folds alone.
7. Click `claude` → reader disposed for that session, terminal re-attaches.

### States

- **No data yet** — before the listing arrives: nav shows the `plan` header with `no plan yet`
  (or nothing on a dead session), an empty tree, and the body placeholder `nothing open — pick a
  file`. No cue, no counts (the `.n` count is absent until the listing arrives — never `0 .md`).
- **Data** — as the mockups.
- **Daemon down** — banner (existing); segment disabled; reader keeps its render and status line
  reads `musterd unreachable — showing last render`; the cue keeps ageing.
- **Directory gone** (409) — status line shows the daemon's message; tree empty.
- **File gone** (404 on an open file) — `file no longer exists — <path>`; last render kept.
- **Too large** (413) — the daemon's message in the status line; body unchanged.
- **Truncated listing** — count reads `20000+ .md`.

### Testable UI Elements

Text patterns transcribed from the a2 mockups' markup; `textContent` concatenates siblings without
spaces, so the folder pattern below is `▸docs/41` — locate folders by accessible name instead.

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| `docs` segment (mainhead) | `button` | `docs` | `.mainhead .surfseg`, native button, `aria-pressed` |
| `docs` segment (tile) | `button` | `docs` | scope through `article.tile[data-session-id]` as `claude`/`shell` do |
| Reader region | `region` | `Reader: <title>` | `<section aria-label>`; `untitled` when title null; one per host |
| Bar plan badge | — | `plan` | `.docbar .badge`; present iff the plan is open |
| Bar file name | — | `<basename>` | `.docbar .fname` |
| Bar path | — | `<absolute path>` | `.docbar .path`; absent in `.reader.compact` |
| Freshness cue | — | `/^changed .+ ago$/` | `.docbar .chg`; **absent** until a write hook is seen |
| Pop out link | `link` | `pop out ↗` | `<a target="_blank" href="/doc.html?session=<id>&path=<enc>">`; hidden on `/doc.html` |
| Nav arrow (open) | `button` | `Hide files` | text `›`, inside `.rnav .hd` |
| Nav arrow (collapsed) | `button` | `Show files` | text `‹`, last child of `.docbar` |
| Reader status line | `status` | see States | `.reader-notice`; the only `role="status"` inside `.reader` |
| Nav | `navigation` | `Documents` | `<nav class="rnav" aria-label="Documents">` |
| Plan slot entry | `button` | `plan<basename>` (textContent) | `.rnav .f.plan`; `aria-current` when open; contains `span.dot` when changed |
| No-plan text | — | `no plan yet` | `.rnav .f.none` |
| Files header toggle | `button` | `Files` | `aria-label`; visible text = directory + count; `aria-expanded` |
| File count | — | `/^\d+\+? \.md$/` | `.rnav .hd .n`; absent before the listing and in compact |
| Filter box | `searchbox` | `Filter files` | `<input type="search">` |
| Folder entry | `button` | `<name>/` | `aria-expanded`; caret and count `aria-hidden` |
| File entry | `button` | `<basename>` | `aria-current` when open; `span.dot` when changed |
| Outline header toggle | `button` | `Outline` | `aria-label`; text `outline`; `aria-expanded` |
| Outline entry | `button` | `<heading text>` | `.rnav .ol.h<n>`; `aria-current` for the heading in view |
| Rendered body | — | — | `article.md`; headings carry `id`s; task items render `input[type=checkbox][disabled]` |
| Body placeholder | — | `nothing open — pick a file` | `.md .placeholder` |

### Invariants

- **INV-1 (no terminal for docs)**: a `TerminalSurface` never exists for kind `docs` —
  `isSurfaceAttachable(…, "docs")` is false for every `alive`/`shellRunning` combination, and the
  surface map never holds a `<id>:docs` key. Asserted from every source state: claude→docs,
  shell→docs, docs→claude, docs→shell, and shell ending while docs is selected (selection stays
  `docs`, pip clears).
- **INV-2 (confinement)**: a `200` from `/reader/file` implies the resolved path is under the
  resolved directory with a `.md` suffix, or equals the resolved plan path. Checked from every
  entry: a listing-derived path, the plan path outside the directory, `..` traversal, a symlink
  inside the directory pointing outside, a symlinked *directory*, the plan's `-agent-` sibling,
  the `.workshop.md` sibling, a non-`.md` file under the directory, a directory path.
- **INV-3 (plan honesty)**: `session.plan` is `null` iff the latest known transcript names no plan;
  `exists` is true iff the last scan's stat succeeded or a routed write named the path since.
  Asserted from: never-scanned, scan-found-missing-file, scan-found-existing, write-after-scan,
  `/clear` to a planless transcript, daemon restart.
- **INV-4 (boundary)**: the attachment plan-path key, the transcript-path key, the tool-input key
  and the plans-directory settings key appear only under `internal/claudecode/` (`D4`).
- **INV-5 (no polling)**: with no hook, no focus event and no user action, zero requests reach
  `/reader/file` and `/reader` over a settle window.
- **INV-6 (bystanders)**: selecting `docs` on one session never opens, closes or resizes another
  session's terminal socket — asserted in Tiles with two live tiles.
- **INV-7 (read-only)**: no route under `/api/sessions/{id}/reader` accepts a mutating method (`D17`).
- **INV-8 (monotonic transcript)**: a hook whose Claude session id is not the session's current one
  never changes `transcript_file` or `plan` (REQ-26), for both orderings of the `/clear` pair and
  for a straggler tool hook.

### Carried-over measurements

- **Plans are written with `Write` (49/49), never `Edit`** — measured across transcripts written by
  2.1.233–2.1.270 (`docs/history/design/markdown-viewing.md` § 3). Applied here to *any* tool hook,
  not only plan writes; re-checked: Edit/MultiEdit are handled identically by inference, so a shift
  in Claude Code's tool choice costs nothing.
- **Transcript scan ≤ 20 ms on the largest (5.3 MB) transcript** — measured as a standalone pass.
  Applied here inside the single ingest worker and inside a GET handler; re-checked: the worker
  runs it on at most four trigger events per plan cycle, not per hook, so the worst case adds
  tens of milliseconds to those events only — still valid. The GET runs it per reader open.
- **`ExitPlanMode` sequence** (`kb:fact/plan-mode-hook-sequence`, 2.1.233) — used only as a scan
  trigger; re-checked: if any step is lost the slot fills at the next trigger or reader open, so a
  changed sequence degrades to a later slot, never a wrong one.
- **`PostToolUse` carries the tool-input file path for Write** — measured on the wire
  (`test/rig/captures/capture-1.jsonl`). Applied to Edit/MultiEdit by inference; the payload
  builder in E2E carries the same shape for all three.

## Affected Files

### Daemon

- `internal/claudecode/plan.go` — **new** (moved from the spike, not copied blind): `PlanFile{Path,
  Source}`, `LocatePlanFile(transcriptPath) (PlanFile, error)` and the line scanner; a missing
  transcript is the "no plan" answer, not an error. The default plans directory (`~/.claude/plans`)
  and `IsUnderDefaultPlansDir(path)` live here.
- `internal/claudecode/files.go` — **new**: `FileSignal{TranscriptPath string; WrittenPath string;
  PlanMaybeReady bool}` and `InterpretFiles(eventType string, payload []byte) FileSignal` — the only
  reader of the transcript-path key, the tool name and the tool-input file path.
  `PlanMaybeReady` is true for SessionStart, for `PreToolUse`/`PostToolUse` of `ExitPlanMode`,
  and for a written path under the default plans directory.
- `internal/claudecode/claudecodetest/` — builders for a `PostToolUse` Write/Edit body with a
  chosen file path and transcript path, and for transcript lines (plan attachment, exit
  attachment, slug-only), so server tests never spell the keys.
- `internal/session/session.go` — `TranscriptPath string`, `PlanPath string`, `PlanExists bool`
  (display-only, never read by `machine.go`).
- `internal/session/manager.go` — `SetTranscript(ctx, id, path) (changed bool, error)` (persist
  on change, no broadcast); `SetPlan(ctx, id, path string, exists bool) (*Session, changed bool,
  error)` (persist + `sessionUpsert` on change); both refuse when `claudeSessionID` (passed in)
  differs from the session's current binding (REQ-26). `rowToSession`/`sessionToRow` carry the
  three fields.
- `internal/store/session.go` — `SessionRow` gains `TranscriptPath *string`, `PlanPath *string`,
  `PlanExists bool`; insert/update/select SQL.
- `internal/store/migrations/0008_reader.sql` — **new**, as Schema Changes.
- `internal/server/reader.go` — **new**: `readerFeature{manager, hub, log, runGit execFunc, home,
  writes *writeLog}` with `mount` (the two GETs), `Observe(ctx, sessionID int64, claudeSessionID
  string, sig claudecode.FileSignal)` (transcript → `SetTranscript`; written path → write log +
  `docChanged` + `plan.exists` flip; `PlanMaybeReady` → `LocatePlanFile` → `SetPlan`), the pure
  `confine(dir, planPath, requested) (abs string, ok bool)`, `listMarkdown(ctx, dir) (paths
  []string, listing string, truncated bool, err error)` and `writeLog` (per-session
  `map[string]time.Time`, capped at 512 paths per session, dropped on Remove).
- `internal/server/readerwire.go` — **new**: `readerListingWire`, `readerPlanWire`,
  `docChangedMessage`.
- `internal/server/sessionwire.go` — `Plan *sessionWirePlan` on `sessionWire`; `toWireSession`.
- `internal/server/ingest.go` — `ingestQueue` gains an optional `files` observer; `process` calls
  `files.Observe(ctx, *sessionID, ev.SessionID, claudecode.InterpretFiles(ev.Type, ev.Payload))`
  after `Apply` for routed hook events (not status posts). `newIngestFeature` takes the observer.
- `internal/server/sessions.go` — Remove drops the session's write log (one call).
- `internal/server/server.go` — one-line `register(s, newReaderFeature(...))` and passing it to
  the ingest feature.
- `internal/server/CLAUDE.md`, `internal/claudecode/CLAUDE.md`, `internal/session/CLAUDE.md` —
  hand-written head only: add `reader` to **Features** where the package now serves it (the
  trailer is generated).

### Web

- `web/package.json` / `web/package-lock.json` — `"marked": "18.0.13"`, `"dompurify": "3.4.15"`
  under `dependencies`, exact (`npm install --save-exact`).
- `web/vite.config.ts` — `build.rollupOptions.input: { index: "index.html", doc: "doc.html" }`.
- `web/index.html` — `<template id="reader-template">` (DOM above).
- `web/doc.html` — **new**: the pop-out page — theme-hint script and stylesheet as `index.html`,
  a `#reader-host` div, the same `<template id="reader-template">`, `<script type="module" src="/src/doc.ts">`.
- `web/src/doc.ts` — **new** composition root for the pop-out: `createApp`, `WsClient`,
  `initReader(app, { standalone: { sessionId, path } })`, nothing else.
- `web/src/protocol.ts` — `Session.plan: { path: string; exists: boolean } | null` (required key);
  `DocChanged` type + `parseDocChanged`.
- `web/src/ws.ts` — decode `docChanged` → `onDocChanged`.
- `web/src/app.ts` — `AppEvents` gains `docChanged`.
- `web/src/main.ts` — `initReader` registration line; `onDocChanged: (m) => app.emit("docChanged", m)`.
- `web/src/api.ts` — `fetchReaderListing(id)`, `fetchReaderFile(id, absPath)` returning
  `ApiResult<string>` (a `text/markdown` success, JSON envelope errors).
- `web/src/terminal/surfaceswitch.ts` — `SurfaceKind` gains `"docs"`; `buildSurfaceSegment`
  builds a third button (`data-surf="docs"`, text `docs`) and returns `docsBtn`;
  `updateSurfaceSegment` presses/disables it; `isSurfaceAttachable` returns false for `docs`;
  `shellEnded` keeps a `docs` selection; `parseSurfaceKey` round-trips `docs`.
- `web/src/features/surfaces.ts` — `select(id, "docs")` is a pure selection (no POST); the
  `sessionRemoved` sweep includes the third kind (no-op for surfaces).
- `web/src/features/reader.ts` — **new** controller: one `ReaderInstance` per session whose
  selected surface is `docs` in the current view (or the standalone session); render phase 8
  mounts/disposes by diffing visible ids against selection; subscribes to `docChanged`,
  `sessionUpsert` (plan, alive, title), `snapshot` (re-fetch open file after reconnect), the
  window `focus` event; owns memory reads/writes; exposes `rootFor(id)`.
- `web/src/render/reader.ts` — **new** DOM builder/updater from the template: bar, body, nav,
  tree, outline, status line, compact mode, collapse state; no fetch, no socket.
- `web/src/reader/markdown.ts` — **new**: `renderMarkdown(text): { fragment: DocumentFragment;
  outline: OutlineEntry[] }` — marked (GFM) → DOMPurify `RETURN_DOM_FRAGMENT` → heading ids.
- `web/src/reader/slug.ts` — **new**, pure: `headingSlug(text)`, `dedupeIds(slugs)`.
- `web/src/reader/tree.ts` — **new**, pure: `buildTree(paths)`, `filterTree(tree, query)`,
  `countFiles(node)`.
- `web/src/reader/memory.ts` — **new**, pure over a `Storage`-like interface: last open file and
  the set of paths whose change dot was cleared, keyed `muster.reader.<id>`; every access
  try/caught.
- `web/src/reader/freshness.ts` — **new**, pure: `changedText(at, now)` → `changed <age> ago`
  using `sessions/format.ts`'s `formatAge`.
- `web/src/reader/CLAUDE.md` — **new** hand-written head in the sibling packages' shape.
- `web/src/features/focus.ts` — `deps.getReader` thunk; when `docs` is selected the main slot
  takes `getReader().rootFor(id)`, the dead surface and sizenote hide.
- `web/src/features/tiles.ts` — `renderTileBody` mounts `getReader().rootFor(id)` for `docs`
  and passes null geometry.
- `web/src/render/tiles.ts` — no structural change; footer geometry text empty for `docs`.
- `web/src/style.css` — `.reader`, `.docbar`, `.reader-notice`, `.md` (+ `.compact`), `.rnav`
  (+ `.compact`), `.arr`, `.ib`, `.surfseg` third-button width; tokens only.
- `web/src/features/CLAUDE.md`, `web/src/terminal/CLAUDE.md`, `web/src/render/CLAUDE.md` —
  hand-written head: add `reader` to **Features**.
- `web/playwright.config.ts`, `web/e2e/helpers/fixtures.ts`, `web/scripts/e2e-lint.sh` — **no
  change expected**; listed to record they are web-impl's if one is needed.

### E2E (e2e-specs)

- `web/e2e/reader.spec.ts` — **new**.
- `web/e2e/helpers/reader.ts` — **new**: locators from the table above, a fake-transcript writer
  (one attachment line naming a plan file, optional slug line), fixture-directory builders (nested
  `.md`s, a non-`.md`, a dot-directory, symlinks), a `ReaderRequestTracker` counting
  `/reader` and `/reader/file` requests (INV-5), and `getReaderListing(page, base, id)`.
- `web/e2e/helpers/payloads.ts` — every builder accepts `transcriptPath` (default unchanged);
  `rawPostToolUse` accepts `toolName` (`Write` | `Edit` | `MultiEdit` | other) and `filePath`;
  `rawPreToolUse` gains the same for `ExitPlanMode`. Shapes from the measured captures only.
- `web/e2e/CLAUDE.md` — hand-written head: add `reader` to **Features**.

## Edge Cases

1. **No plan yet** (never entered plan mode) — `plan: null`; slot reads `no plan yet`; tree works. → **E4**
2. **Plan mode entered, nothing written** — transcript names the path, stat fails → `exists:
   false`; slot reads `no plan yet`; a later routed write flips it. → **D13**, **E9**
3. **`/clear` mid-session, SessionEnd(old) then SessionStart(new)** — new transcript, no plan →
   scan → `plan: null` → slot returns to `no plan yet`. → **E5**
4. **`/clear` reversed: SessionStart(new) arrives, then SessionEnd(old)** — the old id's hook
   carries the old transcript path; REQ-26 ignores it; plan stays the new transcript's. → **D20**
5. **Straggler tool hook from before `/clear`** (old Claude id, after the rebind) — its written path
   is recorded (a `docChanged` still fires if in scope) but the transcript path is not moved. → **D20**, **E29**
6. **Missed Write hook** — file stale; cue shows the last known write's age or is absent; the next
   `docChanged`, surface open or (for the plan) window focus repairs it. → **E12**, **E13**
7. **File deleted or renamed underneath the reader** — next fetch is 404 → `file no longer exists
   — <path>`; the tree drops it on its next listing. → **E25**
8. **Directory is not a git checkout** — walk, dot-directories skipped, capped at 20,000 with
   `truncated: true` and `20000+ .md`. → **D8**
9. **Directory is a checkout but `git` fails** (corrupt index, no git on PATH) — logged, `"walk"`
   fallback, 200. → **D7**
10. **Huge file** — over 10 MiB is a 413 rendered in the status line; under it renders whole; a
    slow render stalls only the tab. → **D12**, **E26**
11. **Dead session** — plan block absent, tree and file serving work. → **E22**
12. **Dead session whose directory was deleted** — 409 `directory_missing` in the status line. → **E23**
13. **Daemon down while a reader is mounted** — segment disabled; render kept; status line; on
    `hello` the open file is re-fetched. → **E24**
14. **Daemon restart mid-session** — transcript and plan columns survive; write log gone (cue
    absent until the next write); reopening docs shows the plan. → **D14**, **E28**
15. **Pre-migration rows** — `transcript_file` NULL until their next hook; a scan on reader open
    does nothing until then. → **D9** (the nil-transcript branch)
16. **Pop-out with a bad query** — unknown session → `unknown session`; bad path → placeholder. → **E21**
17. **Subagent (`agent_id`) writes under the directory** — `docChanged` fires, dot lights;
    subagent plan files (`-agent-`) are neither listed nor servable. → **D16**, **D11**
18. **Plans-directory override** — honoured automatically because the attachment path is already
    resolved; the slug fallback assumes the default directory. → untested: no override observed on
    this machine (fact record's Limitations); the fallback path is covered by **D5**.
19. **Two hosts for one session** (Focus main slot and a tile can never both show a session, but
    the pop-out and the dashboard can) — two `ReaderInstance`s in two pages, shared memory via
    localStorage; each fetches independently. → **E21**
20. **Selecting `docs` while a shell runs, then the shell exits** — selection stays `docs`, pip
    clears (INV-1). → **W4**
21. **Symlink inside the directory pointing outside; symlinked directory; `..`; the plan's
    `-agent-` and `.workshop.md` siblings; a non-`.md`; a directory path** — all 404. → **D11**, **E20**
22. **Write to a non-`.md`, non-plan path** — no `docChanged`. → **D13**
23. **Unrouted hook (unknown envelope / never-bound id)** — nothing observed, no `docChanged`. → **D13**
24. **Density 3×2 in Tiles** — nav starts collapsed; 2×2 starts open and compact. → **E27**
25. **Filter matches a file three folders deep** — ancestors expand; clearing collapses again. → **E7**
26. **A heading text repeats** (two `## Notes`) — ids dedupe (`notes`, `notes-2`); both outline
    entries scroll to their own heading. → **W8**, **E17**
27. **Listing while the plan physically sits under the directory** (override case) — it appears in
    both the slot and the tree; opening either is the same file. → untested: override not observed
    (see 18).
28. **Remove a session with a reader mounted** — reader disposed with the tile/pane; write log
    dropped. → **W13** (reviewer: `sessionRemoved` path) 

## Acceptance Criteria

IDs are unique across the whole section — `D*` daemon, `W*` web, `E*` e2e. One clause per
criterion; never mix a runnable command with a judgement call in one item.

### Daemon

- **D1**: `make test` passes.
- **D2**: `go build ./...` passes.
- **D3**: `make lint` passes.
- **D4**: The attachment plan-path key, the transcript-path key, the tool-input key and the
  plans-directory settings key appear in no Go or TypeScript source outside
  `internal/claudecode/` (INV-4; test files excluded — server tests use `claudecodetest`, E2E
  builders live under `web/e2e/` and are out of the grep's net by design).
- **D5**: `LocatePlanFile` resolves a transcript with a `plan_mode` attachment line, one with only a
  `plan_mode_exit` line, and one with only a slug (to `<home>/.claude/plans/<slug>.md`), returns an
  empty `PlanFile` for a transcript with neither and for a missing file, and this test is the
  fact's guard (`TestLocatePlanFile`).
- **D6**: `InterpretFiles` yields the written path for `PostToolUse` Write, Edit and MultiEdit and
  none for other tools, the transcript path for every hook type, and `PlanMaybeReady` exactly for
  SessionStart, `PreToolUse`/`PostToolUse` of `ExitPlanMode`, and a write under the default plans
  directory.
- **D7**: `GET …/reader` on a git checkout lists tracked and untracked `.md` files (ignored and
  non-`.md` excluded) as sorted relative paths with `listing: "git"`, and falls back to `"walk"`
  when the injected `git` run func fails.
- **D8**: `GET …/reader` on a non-git directory lists `.md` files skipping dot-directories with
  `listing: "walk"`, and a tree past the cap returns exactly 20,000 entries with `truncated: true`.
- **D9**: `GET …/reader` on a session with a recorded transcript naming an existing plan file
  responds with that `plan` and has broadcast a `sessionUpsert` carrying it; on a session with no
  transcript recorded it responds with `plan: null` and broadcasts nothing.
- **D10**: `GET …/reader/file?path=<dir>/a.md` returns 200 `text/markdown; charset=utf-8` with the
  file's exact bytes.
- **D11**: `GET …/reader/file` returns 404 `not_found` for `..` traversal, a symlink inside the
  directory targeting outside, a symlinked directory targeting outside, the plan's `-agent-` and
  `.workshop.md` siblings, a non-`.md` under the directory and a directory path; 400
  `invalid_request` for a relative path; and 200 for the plan path outside the directory (INV-2).
- **D12**: `GET …/reader/file` on a file of 10 MiB + 1 byte returns 413 `too_large` with the
  envelope, and on a file of exactly 10 MiB returns 200.
- **D13**: A routed `PostToolUse` Write naming `<dir>/x.md` broadcasts one `docChanged` with that
  path; one naming the plan path flips `plan.exists` to true with a `sessionUpsert` before the
  `docChanged`; one naming `<dir>/x.txt` broadcasts nothing; an unrouted one broadcasts nothing.
- **D14**: `transcript_file`, `plan_path` and `plan_exists` round-trip through
  `UpdateSession`/`LoadAll` (a restart keeps the plan).
- **D15**: `SetTranscript` persists only when the value changed and never broadcasts.
- **D16**: A subagent-marked `PostToolUse` Write under the directory broadcasts `docChanged`.
- **D17**: No mutating route exists under `/api/sessions/{id}/reader` (INV-7).
- **D18**: `GET …/reader` for a session whose directory is gone returns 409 `directory_missing`.
- **D19**: The listing's `writtenAt` for a path is non-null after a routed write named it and null
  for every other path.
- **D20**: With the session bound to Claude id B, a hook carrying Claude id A (a different
  transcript path and a `PlanMaybeReady` trigger) leaves `transcript_file` and `plan` unchanged,
  for a `SessionEnd`, a `PostToolUse` Write and a `PreToolUse` `ExitPlanMode` (INV-8).

### Web

- **W1**: `make web-build` passes.
- **W2**: `make web-test` passes.
- **W3**: `make web-lint` passes.
- **W4**: `surfaceswitch` unit tests: `selectSurface(…, "docs")` selects it; `isSurfaceAttachable`
  is false for `docs` across all four `alive`×`shellRunning` combinations; `shellEnded` with `docs`
  selected keeps `docs` and clears `shellRunning`; `parseSurfaceKey(surfaceKey(id, "docs"))` round-trips (INV-1).
- **W5**: `tree.ts` unit tests: `buildTree` nests paths, folders sort before files, both
  alphabetical, `countFiles` is recursive, and folders start collapsed.
- **W6**: `tree.ts` unit tests: `filterTree` is a case-insensitive substring match on the relative
  path, expands every match's ancestors, and an empty query returns the collapsed tree.
- **W7**: `memory.ts` unit tests: last open file and cleared-dot set round-trip through a fake
  storage, a throwing storage yields defaults, and keys are per session id.
- **W8**: `slug.ts` unit tests: `headingSlug` lowercases and hyphenates, `dedupeIds` appends `-2`,
  `-3` to repeats.
- **W9**: `freshness.ts` unit test: `changedText` renders `changed <age> ago`.
- **W10**: `protocol.ts` unit tests: `parseSession` accepts `plan` as object or null and rejects a
  missing key; `parseDocChanged` accepts the shape and rejects a missing `path` or `id`.
- **W11**: `make contrast` passes (no colour literal outside a theme block; new rules use tokens only).
- **W12**: `web/package.json` pins `marked` to exactly `18.0.13`.
- **W13**: `web/package.json` pins `dompurify` to exactly `3.4.15`.

### E2E

- **E1**: In Focus the mainhead segment shows a third `docs` button; clicking it shows the
  `Reader: <title>` region and removes the Claude terminal region; clicking `claude` restores the
  terminal region (REQ-1, REQ-2).
- **E2**: In Tiles with two live tiles, clicking `docs` in one tile shows a reader in that tile
  only, and the other tile's terminal socket count and geometry are unchanged (INV-6).
- **E3**: A session whose transcript names an existing plan file shows it in the plan slot with a
  `plan` badge, opens it automatically, and the bar shows the badge, the basename and the absolute
  path (REQ-7, REQ-9, REQ-4).
- **E4**: A session whose transcript names no plan shows `no plan yet` and lists the directory's files (REQ-9).
- **E5**: After a `SessionEnd`/`SessionStart(clear)` pair naming a planless transcript, the slot
  returns to `no plan yet` (edge case 3).
- **E6**: The tree lists exactly the fixture's `.md` files — the non-`.md` and the dot-directory's
  file absent — with folders collapsed showing counts, and expanding a folder reveals its children (REQ-10).
- **E7**: Typing in the filter narrows the tree to matching files with ancestors expanded; clearing
  restores the collapsed tree (REQ-11).
- **E8**: The open file carries `aria-current="true"`; opening another moves it (REQ-12).
- **E9**: A `PostToolUse` Write naming an unopened file lights its changed dot, and opening it clears
  the dot (REQ-13).
- **E10**: Rewriting the open file on disk and posting a `PostToolUse` Write for it re-renders the
  new content and shows a `changed … ago` cue (REQ-18).
- **E11**: Before any write hook for the open file, no freshness cue element exists (REQ-24).
- **E12**: Rewriting the plan on disk, switching to `claude` and back to `docs` shows the new content (REQ-19).
- **E13**: Rewriting the plan on disk and dispatching a window `focus` event shows the new content (REQ-19).
- **E14**: With a reader open and nothing happening for a settle window, zero requests reach
  `/reader` or `/reader/file` (INV-5).
- **E15**: A file with a GFM table, a task list and a fenced block renders a `<table>`, disabled
  checkboxes and a `<pre><code>` (REQ-5).
- **E16**: A file containing a `<script>` element, an `onerror` attribute and a `javascript:`
  link renders with no script element, no `onerror` attribute and no `javascript:` href in the body (REQ-22).
- **E17**: The outline lists the file's headings; clicking one scrolls the body so that heading is
  at the top; scrolling the body to a later heading moves `aria-current` to it (REQ-14).
- **E18**: The `Files` and `Outline` header toggles fold their sections independently; `Hide files`
  removes the nav and shows `Show files` at the bar's right end; `Show files` restores the nav (REQ-14, REQ-4).
- **E19**: After opening a second file, switching to `claude`, reloading the page and switching to
  `docs`, the same file is open (REQ-7).
- **E20**: Requests to `/reader/file` for `..` traversal, a symlink to an outside file and the
  plan's `-agent-` sibling return 404 on the running daemon (REQ-20).
- **E21**: The `pop out ↗` link opens a new page at `/doc.html?session=<id>&path=<abs>` showing the
  reader region with bar, body and nav for the same file and no `pop out` link; a `docChanged`
  posted afterwards re-renders it (REQ-8, REQ-27).
- **E22**: On an ended session the plan block is absent from the nav and opening a tree file renders it (REQ-3).
- **E23**: On an ended session whose directory was removed, the reader status line shows the
  daemon's `directory_missing` message (edge case 12).
- **E24**: Stopping the daemon disables the segment and shows `musterd unreachable — showing last
  render` while the body keeps its content; restarting restores the segment (edge case 13).
- **E25**: Deleting the open file and posting a `PostToolUse` Write for it shows `file no longer
  exists — <path>` while the body keeps its last render (REQ-28).
- **E26**: Opening a file of 10 MiB + 1 byte shows the daemon's `too_large` message in the status
  line and the body is unchanged (REQ-6).
- **E27**: In Tiles at 3×2 the tile's reader nav is collapsed and the bar has no path; at 2×2 the nav is open (REQ-15).
- **E28**: After `daemon.restart()` and a reload, switching to `docs` shows the plan in the slot (INV-3).
- **E29**: After a `/clear` pair, a `PostToolUse` Write carrying the old Claude id and the old
  transcript path leaves the slot at `no plan yet` (INV-8).

### Automated Checks

Every line below is `<ID> <single-line shell command>`, run from the project root. A check passes
iff its command exits 0. Write "must not exist" checks so success is exit 0 — prefix the grep with
`!`. IDs match the prose criterion above where one exists; a check with no prose twin (e.g. a build
gate) is fine and shares the same ID namespace. The orchestrator and the review agent run these
verbatim; nothing else in this section is executed automatically.

Test-file scope for D4: `_test.go` and `*.test.ts` are excluded (they obtain wire bodies through
`internal/claudecode/claudecodetest`), and `web/e2e/` is outside the searched roots entirely
(payload builders are the sanctioned place for measured shapes). Dry-run 2026-09-13: zero
pre-existing hits.

```checks
D1 make test
D2 go build ./...
D3 make lint
D4 ! rg -n "planFilePath|transcript_path|tool_input|plansDirectory" cmd/ internal/ web/src --glob '!internal/claudecode/**' --glob '!**/*_test.go' --glob '!**/*.test.ts'
D5 go test ./internal/claudecode -run 'TestLocatePlanFile' -count=1
D6 go test ./internal/claudecode -run 'TestInterpretFiles' -count=1
D17 ! rg -n '"(POST|PUT|PATCH|DELETE) /api/sessions/\{id\}/reader' internal/
W1 make web-build
W2 make web-test
W3 make web-lint
W11 make contrast
W12 rg -q '"marked": "18\.0\.13"' web/package.json
W13 rg -q '"dompurify": "3\.4\.15"' web/package.json
E1 make e2e
```

### Reviewer-Verified

Criteria that are not a single exit-code check. The review agent verifies these by reading code or
exercising the app.

- **D7**–**D16**, **D18**–**D20**: exist as named Go tests and assert what the prose says (covered by
  `make test`; the reviewer confirms the assertions match the criteria, not just that tests exist).
- **W4**–**W10**: exist as Vitest cases asserting what the prose says.
- **W14**: no `any` types in new web code.
- **W15**: the sanitized markdown enters the DOM only as a DOMPurify fragment — no `innerHTML`
  assignment with document-derived data anywhere under `web/src/`.
- **W16**: `ReaderInstance` is constructed and disposed only inside `features/reader.ts` (and
  `doc.ts` through `initReader`); no render module fetches or opens a socket.
- **W17**: `sessionRemoved` disposes a mounted reader and the daemon drops its write log (edge case 28).
- **W18**: New CSS references tokens only; `.md` headings use `--disp`, body `--sans`, code `--mono`.
- **W19**: The pop-out page (`doc.html`) carries the same theme-hint script as `index.html` so its
  first paint is never in the wrong theme.
- **E2**–**E29**: exist as Playwright tests asserting what the prose says (covered by `make e2e`).
- **REQ-23**: the ADR named in Implementation Notes records the alternatives listed there.

## Implementation Notes

### Decisions this plan makes (ADRs, `status: proposed`, `refs: [plan:markdown-viewing]`)

1. **`kb:adr/reader-markdown-rendered-in-browser`** — marked 18.0.13 + DOMPurify 3.4.15 in the
   browser; the daemon hands raw `text/markdown`. Alternatives considered 2026-09-13: markdown-it
   (six transitive deps vs none, slower cadence), micromark/remark (no release in 18 months, large
   ecosystem), showdown (unmaintained), sanitize-html (archived), daemon-side goldmark + bluemonday
   (+153 kB binary, the dashboard must trust daemon HTML, task-list checkboxes stripped by the UGC
   policy), and the browser-native Sanitizer API as the eventual exit for DOMPurify once it ships
   across browsers. States that dependency bumps in this repo are manual. Tags: `deps`, `security`.
2. **`kb:adr/reader-docs-is-third-surface-segment`** — the reader is a third `docs` kind in the
   `claude | shell` segment (option A) with a right-hand file nav; drawer (B), split (C) and a
   pop-out-only window (D) were mocked and rejected (`docs/design/mockups/markdown-viewing/README.md`).
   The pop-out survives as a reader feature, not a placement. Tags: `ux`.
3. **`kb:adr/reader-plan-located-by-transcript-scan`** — the plan path comes from scanning the
   transcript named by the hook's transcript path, on bounded triggers (SessionStart,
   Pre/PostToolUse ExitPlanMode, a write under the default plans directory, reader open), persisted
   in two session columns; no filesystem watcher, no poll. Notes that a plan-only mtime poll may be
   wanted later. Tags: `claude-code-format`, `store`.
4. **`kb:adr/reader-change-signal-is-the-write-hook`** — `docChanged` mirrors routed
   Write/Edit/MultiEdit hooks; freshness is the hook's processing time and is absent when no hook
   was seen; write times live in daemon memory only. Tags: `ux`.
5. **`kb:adr/reader-served-paths-confined-to-directory-or-plan`** — `/reader/file` serves only a
   symlink-resolved path under the resolved directory with a `.md` suffix or the resolved plan path,
   404 otherwise; `GET /api/browse`'s any-directory looseness is deliberately not copied for file
   contents. Tags: `security`.
6. **`kb:adr/reader-popout-is-a-second-page`** — the pop-out is a second Vite entry (`/doc.html`)
   with its own composition root sharing the reader component and WS client; a hash route inside
   `index.html` was rejected because the dashboard's composition root would then branch on the URL.
   Tags: `ux`.
7. **`kb:adr/reader-memory-split-browser-and-daemon`** — "last open file" and "which dots were
   cleared" are browser-side localStorage per session id (shared by the pop-out); "which files
   Claude wrote" is daemon memory, forgotten on restart like shells. Tags: `ux`.

### Facts

- `kb:fact/plan-file-path-in-transcript` — the whole locator rests on it; `TestLocatePlanFile`
  becomes its `guard` and `internal/claudecode/plan.go` its `files` entry (orchestrator, Doc upkeep).
- `kb:fact/plan-mode-hook-sequence` — the `ExitPlanMode` trigger.
- `kb:fact/hook-payload-fields` — the transcript path is in the common set on every hook.
- `kb:fact/clear-mints-new-session-id` — why "latest transcript" and REQ-26 exist.
- `kb:fact/subagent-hooks-carry-agent-id` — subagent writes light dots (REQ-13).
- `kb:fact/hook-delivery-best-effort` — why the cue labels staleness and nothing is replayed.

### Daemon shape

- `Observe` runs on the single ingest worker after `Apply`, so `SetTranscript`/`SetPlan`
  see the post-rebind binding and REQ-26's id comparison is exact. It must never block on the
  hub: `docChanged` goes through the same non-blocking `wsHub.broadcast` the usage feature uses.
- `LocatePlanFile` opens the transcript read-only and decodes only lines containing one of the two
  marker keys (the spike's scanner). A transcript that does not exist is `PlanFile{}`, not an
  error — the E2E harness's default transcript path is a file that never exists.
- `confine`: `filepath.EvalSymlinks` on the directory once per request and on the requested path;
  compare with `strings.HasPrefix(resolved, dir + string(os.PathSeparator))` after `Clean`; `.md`
  suffix check is `strings.EqualFold` on the extension; the plan comparison is on the resolved
  plan path. Stat after confinement to distinguish 404 (missing/dir) from 413 (size) — the size
  check is on `FileInfo.Size()` before opening.
- `listMarkdown` for git: `git -C <dir> ls-files -co --exclude-standard -z`, `cmd.WaitDelay` set
  (conventions § Go), filtered in Go; paths already relative. For the walk: `filepath.WalkDir`,
  skip any directory whose name starts with `.`, stop at 20,000 files. Both sorted with
  `sort.Strings`.
- `writeLog`: `map[int64]map[string]time.Time`; when a session's map exceeds 512 entries drop the
  oldest; mutex-guarded (Observe writes, the GET reads).
- Never log the written path together with any payload text; the path alone is fine (it is what
  the wire carries).

### Web shape

- `features/reader.ts` render phase sits between `surfaces` (7) and `rail`: for each visible
  session id (Focus: `focusedId`; Tiles: `tilesLive()`) whose selected surface is `docs`, ensure a
  `ReaderInstance`; dispose the rest. `focus.ts`/`tiles.ts` only ask `rootFor(id)` in their own
  view phase and mount the returned root, mirroring how they mount a `TerminalSurface.root`.
- A `ReaderInstance` holds: the DOM refs, the listing, the open path, the rendered outline, the
  collapsed/fold state, and a per-instance `docChanged` handler. On mount: read memory → fetch
  listing → decide the file to open (memory, else plan if `exists`, else placeholder) → fetch.
- Markdown: `marked.parse(text, { gfm: true, async: false })` → `DOMPurify.sanitize(html,
  { RETURN_DOM_FRAGMENT: true })` → walk `h1–h6`, assign ids via `slug.ts`, collect the outline →
  `article.replaceChildren(fragment)`. Links keep `href` for `http(s)`; DOMPurify already drops
  `javascript:`. No `target` rewriting.
- Compact mode is a class on the root set by the host (tiles pass `compact: true`); the initial
  nav-collapsed state is passed by the host from `app.state.density === "3x2"`.
- Window `focus` listener is registered once by the controller and dispatched to every mounted
  instance whose open file is the plan.
- `doc.ts` reads `session` and `path` from `location.search`, builds the app and WS client exactly
  as `main.ts` does (no masthead/rail/banner elements exist on that page; the WS callbacks that
  target them are no-ops), and calls `initReader` in standalone mode; the `#reader-host` is the
  only host.

### Doc upkeep (orchestrator — Doc-Upkeep Backstop / Completion)

- `TODO.md` § Pre-v1 Cleanup → "Markdown viewing": tick and move the block to
  `docs/history/todo-done.md`.
- `docs/facts/plan-file-path-in-transcript.md`: `guard: TestLocatePlanFile`, `files:
  [internal/claudecode/plan.go]`, `tests: [TestLocatePlanFile]`.
- Flip the seven ADRs above to `accepted` at Completion (step 2e).
- `docs/features/reader/spec.md` is written by `/plan-work` at approval (the registry entry the
  **Features** header needs); the orchestrator updates its `go`/`web`/`e2e` globs if the impl
  agents named files differently.
- `SPEC.md` § 3.1: add one sentence that the plan now surfaces in the reader and that approval
  controls are the follow-on.
- `make gen-kb && make check-kb` after every record change.
