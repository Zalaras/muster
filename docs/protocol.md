# Muster — daemon↔UI protocol

This file is the **contract between `musterd` and the web dashboard**, plus the ingest
surface Claude Code posts into. It is the document the build pipeline treats as shared
state: **no agent changes it unilaterally** — a plan's Protocol Contract section carries
the delta, and the change lands here when the plan is approved.

Authority order: `SPEC.md` decides *what* Muster does; `docs/design/ux-flows.md` decides
*how the interface behaves*; this file decides *what crosses the wire between the two
processes and how state is derived*. Claude Code's own wire formats are **not** specified
here — they live in `docs/history/spikes/canary-fields.md` (measured) and are consumed only inside
`internal/claudecode/` (hard rule). This file references them by field name only where a
derivation rule needs one.

Everything is protocol **version 2**; the version bumps only on a breaking change to an
existing message (additive fields don't bump it). This file carries no provenance — how each
piece arrived is in `docs/history/protocol-changelog.md` and `git log -- docs/protocol.md`.
Sections are addressed by stable `kb:anchor` ids, not numbers: an HTML comment naming the id
sits on the line before each `##`/`###` heading, and code and docs cite a section as
`kb:anchor/<id>` (resolved by `go run ./tools/kb`; the id table is `tools/kb/anchors.tsv`).

---

<!-- kb:anchor conventions -->
## Conventions

- **JSON everywhere**, UTF-8. Field names are **camelCase** (Claude Code's snake_case
  stops at the adapter boundary).
- **Timestamps are RFC3339 UTC strings** (`"2026-08-20T09:15:00Z"`). The adapter converts
  Claude Code's epoch integers (`resets_at`) before they reach this protocol.
- **`null` means unknown, and renders as the word "unknown"** — never as 0, never as an
  empty gauge (SPEC §2.2/§2.3). Absent optional fields mean "not applicable", not unknown.
- **Additive evolution**: clients ignore unknown message types and unknown fields; the
  daemon ignores unknown fields in requests. This is what lets later plans extend the protocol
  without version bumps.
- IDs: `session.id` and `repo.id` are daemon-assigned integers (SQLite rowids), opaque to
  the UI. Claude's `session_id` is a separate string attribute (`claudeSessionId`) and is
  **never** an identity key (SPEC §7 — `/clear` mints a new one in the same pane).

<!-- kb:anchor transport -->
## Transport & auth

- Daemon binds `127.0.0.1` only, one port (default from config; E2E allocates per run).
- Serves: static dashboard (`/`), UI API (`/api/…`), UI WebSocket (`/ws`), terminal
  WebSockets (`/ws/terminal/{id}`, `/ws/shell/{id}`), ingest (`/ingest/…`), health (`/healthz`).
- **Two tokens, distinct lifecycles** (both random, generated at first run, stored in kv):
  - **UI token** — carried once in the launcher's URL, exchanged at `GET /auth` for a
    cookie. Cookie: `muster_auth`, `HttpOnly`, `SameSite=Strict`, no `Secure` (localhost
    HTTP). Every `/api/*`, `/ws*` and static request without a valid cookie → `401`
    (API/WS) or redirect-to-nowhere page telling the user to relaunch (static).
  - **Ingest token** — embedded in the ingest URL path that Muster writes into each
    directory's project-scoped Claude Code settings. Keeps a random webpage (or a stray
    local process) from POSTing forged events; it grants nothing else. Same-user malware
    reading it is SPEC §2.6's accepted residual risk.
- **WS hardening**: the daemon rejects WebSocket upgrades whose `Origin` header is
  present and not the daemon's own origin. Belt to the SameSite braces.
- Errors (HTTP, non-2xx): `{"error": {"code": "<machine_token>", "message": "<human>"}}`.
  Codes are stable strings (`unauthorized`, `invalid_request`, `not_found`,
  `launch_failed`, `capture_expired`, `issue_auth_failed`, `issue_post_failed`, …); the UI
  may switch on them.

<!-- kb:anchor http -->
## HTTP endpoints — UI

| Method & path | Purpose |
|---|---|
| `GET /healthz` | Liveness; **unauthenticated**. `200 {"status":"ok","version":"<daemon>"}` |
| `GET /auth?token=…` | Exchange UI token for cookie; `303` → `/` |
| `GET /` + assets | Dashboard (cookie required) |
| `GET /api/state` | Full snapshot as JSON — same object as the WS `snapshot` payload (`kb:anchor/ws.snapshot`). E2E oracle and debugging; the UI itself uses the WS |
| `POST /api/sessions` | Launch a session |
| `GET /api/repos` | Directory picker list |
| `GET /api/browse` | Folder-browser directory listing (`kb:anchor/browse.get`) |
| `PUT /api/prefs` | Persist UI preferences (view + density + usageModel) |
| `POST /api/usage/refresh` | Force an immediate per-model usage fetch |
| `PUT /api/sessions/{id}/pin` | Pin or unpin a session, renumbering `railPos` (`kb:anchor/sessions.pin`) |
| `PUT /api/sessions/order` | Reorder the rail and set the pinned block in one atomic call (`kb:anchor/sessions.order`) |
| `GET /api/sessions/{id}/pane` | Last captured pane screen (`kb:anchor/sessions.pane`) — display source only |
| `POST /api/sessions/{id}/resume` | `claude --resume` a dead session in a fresh pane (`kb:anchor/sessions.resume`) |
| `POST /api/sessions/{id}/end` | Kill a live session's tmux session (`kb:anchor/sessions.end`) |
| `DELETE /api/sessions/{id}` | Remove a session (ends it first if live); broadcasts `sessionRemoved` (`kb:anchor/sessions.remove`) |
| `POST /api/issue/captures` | Take an allowlisted state snapshot and hold it (`kb:anchor/issue.captures`) |
| `POST /api/issues` | File a held capture as a GitHub issue (`kb:anchor/issue.create`) |
| `POST /api/sessions/{id}/locate` | Resolve a dropped file's bytes to its original on-disk path (`kb:anchor/sessions.locate`) |
| `PUT /api/sessions/{id}/title` | Set or clear a session's title override (`kb:anchor/sessions.title`) |
| `POST /api/sessions/{id}/shell` | Ensure a plain shell is running for a session, spawning it if absent (`kb:anchor/sessions.shell`) |

Design rule: **commands travel over HTTP; the WS pushes state one way (server→client)**.
Rationale: idempotency and errors are natural in request/response, the E2E harness can
drive every action without a socket, and the WS stays a pure ordered event stream. The
only client→server WS traffic in v1 is terminal input/resize on the terminal sockets (`kb:anchor/terminal.ws`,
`kb:anchor/terminal.shell-ws`).

<!-- kb:anchor sessions.create -->
### `POST /api/sessions`

```jsonc
// request
{
  "directory": "/Users/damian/code/Projects/muster",  // required, absolute
  "title": "flaky-e2e-hunt",                          // optional → `claude --name`
  "model": "opus",                                     // required; passed to `--model` verbatim — any non-empty string (UI offers sonnet/opus/haiku/fable presets + free-text override)
  "permissionMode": "acceptEdits"                      // required: "default" | "plan" | "acceptEdits" | "auto" — seeds the latch (kb:anchor/state.transitions).
                                                       // "default" is Claude Code's manual mode (UI label "manual"; measured 2.1.259: no-flag,
                                                       // `manual` and `default` all report permission_mode "default"). "auto" added by
                                                       // bypassPermissions/dontAsk deliberately not offered (SPEC §4.4).
}
// response: 201 + the Session object (kb:anchor/ws.session), state "started"
```

Side effects (ux-flows §1.3): upsert `repo` row; create the tmux window on the `muster`
socket with `MUSTER_SESSION` set in the pane environment (`kb:anchor/ingest.envelope`); ensure the directory's
`.claude/settings.local.json` (gitignored by Claude Code — measured, `kb:anchor/ingest.envelope`) registers
Muster's hooks/status-line/ingest URLs;
insert the session row and broadcast `sessionUpsert` **immediately** — before any hook
arrives, because the first hook may be a long way off (trust prompt, ux-flows §1.4).
Errors: `400 invalid_request` (missing/relative directory; empty/unknown
`permissionMode` — message `permissionMode must be one of default, plan, acceptEdits, auto`;
empty `model`; directory that does not exist or is not a directory),
`500 launch_failed` (tmux/spawn failure, message carries stderr; also a
`settings.local.json` that exists but is not valid JSON — Muster refuses to guess at
merging into a corrupt file, and the error message names the file).

<!-- kb:anchor repos.list -->
### `GET /api/repos`

`200` → array ordered `pinned DESC, lastLaunchedAt DESC` (ux-flows §1.1):

```jsonc
[{ "id": 3, "path": "/Users/damian/code/Projects/muster", "name": "muster",
   "isGit": true, "branch": "main",            // branch read at request time; null when !isGit
   "pinned": false, "lastLaunchedAt": "2026-08-20T08:01:00Z", "launchCount": 12,
   "lastModel": "opus",                        // model value of the last launch here; null before any
   "lastPermissionMode": "acceptEdits" }]      // starting mode of the last launch here ("default" | "plan" | "acceptEdits" | "auto"); null likewise
```

`lastModel`/`lastPermissionMode` are the per-directory launch defaults (ux-flows §1.2
"Model and Start in default to whatever was used last, per directory").

Browse… navigates via `GET /api/browse` (`kb:anchor/browse.get`). The earlier "native chooser" note here
was wrong: browsers deliberately never reveal a picked folder's absolute path, so the
dashboard browses via the daemon instead.

<!-- kb:anchor prefs.put -->
### `PUT /api/prefs`

**Auth**: UI cookie (401 `unauthorized` without it).
**Request** (at least one field; unknown fields ignored):

```jsonc
{ "view": "tiles",       // optional: "focus" | "tiles"
  "density": "3x2",      // optional: "2x2" | "3x2" — the Tiles grid density
  "usageModel": "Fable",  // optional: 1–32 chars after trim — which per-model weekly window the masthead shows
  "railSort": "manual",   // optional: "manual" | "attention" — the rail's sort mode
  "theme": "dark",        // optional: ^[a-z][a-z0-9-]{0,31}$ — the dashboard theme; "follow" = no override
  "updateCheck": true }   // optional: boolean — whether the daemon checks GitHub Releases for a newer musterd
```

→ `204`, no body. Persisted in kv under one JSON key (survives daemon restarts —
ux-flows §3.8) and re-broadcast to all UI sockets as a `prefs` message carrying the
**full** prefs object, which is how a second window stays in sync. Defaults before any
PUT: `{"view":"focus","density":"2x2","usageModel":"Fable","railSort":"manual","theme":"follow","updateCheck":true}`.
**Errors:** 400 `invalid_request` — body not JSON, no known field present, a field
value outside its enum, `usageModel` empty / longer than 32 chars, `theme` not
matching its pattern, or `updateCheck` not a JSON boolean.

`updateCheck`: governs **checking only** — the binary never changes
without an explicit `POST /api/update/apply` (`kb:anchor/update.apply`) or `musterd -update`. A change has side
effects beyond the echo: `false` clears `update.available`/`update.checkedAt` and broadcasts
`update` (`kb:anchor/ws.update`); `true` triggers an immediate check. A persisted non-boolean loads as `true`.

`theme`: **opaque to the daemon** beyond the pattern — the
client owns the theme registry (`web/src/theme.ts`), so a new theme never needs a daemon
release. `"follow"` means the dashboard resolves the theme from `claudeTheme.family`
(`kb:anchor/ws.snapshot`): `light` → Light, `dark`/`unknown` → Instrument. A stored name the client no longer
knows resolves the same way as `"follow"`. A persisted value failing the pattern loads as
`"follow"` (same silent fallback as the other fields).

`railSort`: `manual` shows the rail in the user-owned order
(`pinned` block first, then `railPos` — `kb:anchor/ws.session`); `attention` keeps the pinned block first
and sorts the unpinned group by the `kb:anchor/ws.snapshot` attention order. Client-side sort in both cases.

<!-- kb:anchor sessions.pane -->
### `GET /api/sessions/{id}/pane`

Serves the last screen the daemon captured for the session. The daemon runs
`tmux capture-pane -p` on every liveness tick (~5 s) for each alive session and on End
immediately before the kill; the text is persisted only when it changes. **Display source
only** — never read by the state machine (CLAUDE.md hard rule); never logged (it holds
prompt text).

**Response 200:**
```jsonc
{ "text": "…",                          // last capture-pane -p output, LF-separated, trailing blank lines trimmed
  "capturedAt": "2026-08-26T09:15:00Z" } // when that capture was taken
```
Errors: `404 unknown_session`; `404 no_snapshot` (no capture has succeeded yet). Served for
live sessions too; the UI asks only for `alive:false` ones.

<!-- kb:anchor sessions.resume -->
### `POST /api/sessions/{id}/resume`

No body. Rewrites the directory's `.claude/settings.local.json` (`kb:anchor/ingest.envelope`), then spawns
`claude --resume <claudeSessionId> --model <model.id> [--permission-mode <latched>]` in a
new tmux session named `muster-<id>` (the dead one's name is free again) with the same
pane environment as a launch. The row keeps its Muster `id`; `tmuxTarget`/`tmuxPane` are
the new pane's, `alive:true`, `endedAt:null`, the snapshot is cleared, and a
`sessionUpsert` is broadcast. `state` is **unchanged** until the enveloped
`SessionStart(source:"resume", same session_id)` arrives and lands it in `idle` (`kb:anchor/state.transitions`).

`200` + Session object. Errors: `404 unknown_session`; `409 not_resumable` (still alive,
or `claudeSessionId` null); `409 directory_missing` (the directory no longer exists);
`500 launch_failed` (settings write or tmux spawn failed — row unchanged).

<!-- kb:anchor browse.get -->
### `GET /api/browse`

**Auth**: UI cookie (401 `unauthorized` without it).
**Request:** query param `path` — absolute directory path; omitted → the daemon's
**browse root** (`-browse-root` flag; empty/default = the daemon user's home
directory — E2E passes its per-run scratch dir so browse tests never touch the real
home).
**Response 200:**

```jsonc
{
  "path": "/Users/damian/code",          // the directory listed (absolute, cleaned)
  "parent": "/Users/damian",             // null at the browse root and at filesystem
                                         //   root (the root is the Up ceiling; explicit
                                         //   absolute paths elsewhere stay browsable)
  "dirs": [                              // subdirectories only, dotfiles excluded,
    { "name": "Projects",                //   sorted by name; files never appear
      "path": "/Users/damian/code/Projects",
      "isGit": false }                   // true iff it looks like a git checkout
  ]
}
```

**Errors:**
- 400 `invalid_request`: `path` present but not absolute.
- 404 `not_found`: path doesn't exist or isn't a directory (or is unreadable).

<!-- kb:anchor sessions.end -->
### `POST /api/sessions/{id}/end`

No body. Captures a final pane snapshot, then `tmux kill-session -t muster-<id>`, then
nudges the liveness check. Open terminal sockets for the id close `4001 pane_ended`; a
`sessionUpsert` with `alive:false` is broadcast before the response. No other session is
touched. Recoverable: the daemon still holds `claudeSessionId`, so `kb:anchor/sessions.resume` can resume it.

`200` + Session object (`alive:false`, `endedAt` set). Errors: `404 unknown_session`;
`409 not_alive`.

<!-- kb:anchor sessions.remove -->
### `DELETE /api/sessions/{id}`

No body. If the session is alive, the `kb:anchor/sessions.end` End path runs first (its upsert is broadcast);
then the row is deleted and `sessionRemoved` (`kb:anchor/ws.session-removed`) is broadcast. `event` rows keep their
`session_id` (audit trail). A removed session can no longer be resumed from Muster.

This also kills the session's shell tmux
session, `muster-<id>-shell`, if one is running (`kb:anchor/sessions.shell`). `kb:anchor/sessions.end` End deliberately does **not** —
a shell outlives its parent session ending and dies only on Remove (or reconcile).

`204`. Errors: `404 unknown_session`; `500 end_failed` (alive and the kill failed — the
row is **not** deleted).

<!-- kb:anchor usage.refresh -->
### `POST /api/usage/refresh`

**Auth**: UI cookie (401 `unauthorized`). No body. Wakes the per-model usage poller
(`kb:anchor/ws.usage` `modelScoped`) for an immediate fetch; concurrent requests coalesce into at most one
in-flight fetch. → `202`, no body; the result arrives as a `usage` message. Errors:
`404 not_found` — polling disabled (`musterd -usage-poll 0`).

<!-- kb:anchor sessions.pin -->
### `PUT /api/sessions/{id}/pin`

**Auth**: UI cookie (401 `unauthorized`). **Request:** `{ "pinned": true }` (`pinned`
required, boolean). → `204`, no body. `pinned:true` moves the session to the **bottom of
the pinned block** (pinned in order of pinning); `pinned:false` moves it to the **top of
the unpinned block** (immediately after the last pinned session). The daemon renumbers
whatever `railPos` values are needed to keep `kb:anchor/ws.session`'s invariant (every pinned session's
`railPos` below every unpinned one's; `railPos` unique). Already in the requested state →
`204` and no broadcast. Otherwise every session whose `pinned` or `railPos` changed is
broadcast as a `sessionUpsert` — and only those. Errors: `400 invalid_request` (body not
JSON / `pinned` missing or not boolean), `404 unknown_session`.

<!-- kb:anchor sessions.order -->
### `PUT /api/sessions/order`

**Auth**: UI cookie (401 `unauthorized`). **Request:**

```jsonc
{ "ids": [4, 9, 2, 7],   // session ids, no duplicates, each must exist; may be empty
  "pinnedCount": 1 }      // integer in [0, len(ids)]: the first pinnedCount ids become pinned
```

→ `204`, no body. The first `pinnedCount` ids become `pinned:true`, the rest
`pinned:false`; `railPos` = index in `ids` (this is how a drag across the pin boundary
pins/unpins in one atomic call). Sessions that exist but are not listed keep their
`pinned` flag and follow the listed ones in their existing relative `railPos` order — an
unlisted *pinned* session is still kept inside the pinned block (end of it), renumbering
the unpinned listed ones, so the `kb:anchor/ws.session` invariant always holds. Every session whose `pinned`
or `railPos` changed is broadcast as a `sessionUpsert`; none if nothing changed. Errors:
`400 invalid_request` — body not JSON, `ids` missing / not an integer array / duplicate or
unknown id, `pinnedCount` missing or outside `[0, len(ids)]`. Nothing changes on a 400.
Route note: Go's mux prefers the literal `order` segment over `{id}`, so this coexists with
`/api/sessions/{id}/…`.

<!-- kb:anchor issue.captures -->
### `POST /api/issue/captures`

**Auth**: UI cookie (401 `unauthorized`). Takes a snapshot of muster's own state for the
dashboard's file-an-issue button and holds it server-side. **Request** (body optional):

```jsonc
{ "sessionId": 7 }   // the muster session to snapshot; null or absent = dashboard scope
```

**Response 201:**

```jsonc
{ "captureId": "9f3c…",                       // 32 hex chars, opaque; the handle kb:anchor/issue.create files
  "capturedAt": "2026-08-31T09:15:00Z",
  "snapshot": { /* the allowlisted object — see below */ },
  "snapshotMarkdown": "## Snapshot\n\n| field | value |\n…" }  // rendered; no trailing newline
```

The snapshot is a **strict allowlist**, assembled by explicit field copy, never by
subtracting keys from a whole-object shape:

- always — `capturedAt`, `scope`, `musterd.version`, `claudeCode.{installed,floor,verified,status}`
  (the `kb:anchor/ws.hello` `hello` semantics — `installed` null iff `status` is `unknown`; the rendered
  `snapshotMarkdown` cell is `<installed> installed · verified <floor>–<verified> · <status>`, or
  `installed unknown · verified <floor>–<verified>` when unknown; a single-version range renders as
  the one version),
  `host.{os,arch}`, `dashboard.{sessionsTotal,sessionsAlive,view,density,railSort}`;
- session scope only — `session.{state,stateSince,alive,endedAt}`,
  `session.attention.{reason,since}`, `session.failure.error` (**the raw token only**),
  `session.model.id`, `session.permissionMode.{value,source}`,
  `session.context.{usedPct,totalInputTokens,windowSize}`, `session.compactions`,
  `session.tmuxTarget`, `session.createdAt`, `session.claudeSessionIdBound` (a boolean —
  never the id), `session.events.{firstSeq,lastSeq,count,lastReceivedAt,recentTypes}`.

**Never** on the wire here: prompt text, hook payload bodies, raw status-line JSON, pane
captures, `lastActivity`, `failure.message` (it *is* the last assistant message),
`title` (it refreshes from the status line's auto-generated session name — `kb:anchor/ws.session`),
`directory`, `branch`, `isWorktree`, the repo name, the `claudeSessionId` value, and every
account-usage field of `kb:anchor/ws.usage`. `Zalaras/muster` may be open-sourced; this list is the
boundary. Unknown values render the word `unknown` in `snapshotMarkdown`, never `0` (`kb:anchor/conventions`).

No side effects on muster state; nothing is broadcast. At most 8 captures are held, each
expiring 15 minutes after `capturedAt`; taking a 9th evicts the oldest. Captures live in
memory only — a daemon restart drops them.

Errors: `400 invalid_request` (body present but not JSON; `sessionId` not an integer);
`404 unknown_session`; `404 not_found` (issue capture disabled — `musterd -issue-api-url ""`).

<!-- kb:anchor issue.create -->
### `POST /api/issues`

**Auth**: UI cookie (401 `unauthorized`). Files a held `kb:anchor/issue.captures` capture as a GitHub issue on
the daemon's configured repo (`-issue-repo`, default `Zalaras/muster`). The daemon obtains
a token by running `gh auth token` **at time of use** — never stored, never logged, never
in a response body — and POSTs to `{-issue-api-url}/repos/{owner}/{name}/issues`.

**Request:**

```jsonc
{ "captureId": "9f3c…",              // required; from kb:anchor/issue.captures
  "title": "Rail drag drops on the wrong index",  // required; 1–200 chars after trimming
  "note": "dragged card 3 above card 1…" }        // optional; ≤ 8000 chars, CRLF → LF
```

**Response 201:**

```jsonc
{ "number": 14, "url": "https://github.com/Zalaras/muster/issues/14",
  "repo": "Zalaras/muster" }
```

The posted body is the note section (`"## What happened\n\n" + trimmedNote + "\n\n"`,
omitted entirely when the trimmed note is empty) followed by the capture's
`snapshotMarkdown`, with no trailing newline — so the dashboard's preview is byte-identical
to what GitHub receives. A successful file **consumes** the capture; a failure does not, so
a retry needs no re-capture.

**No fallback by design**: on any failure nothing is queued, retried or written to disk.

Errors: `400 invalid_request` (body not JSON; `captureId` missing; `title` missing, blank
after trimming or over 200 chars; `note` over 8000 chars); `404 not_found` (disabled);
`409 capture_expired` (unknown, expired, or already-consumed `captureId`);
`502 issue_auth_failed` (`gh` not on `PATH`, `gh auth token` non-zero, or an empty token —
`message` carries `gh`'s stderr, never its stdout); `502 issue_post_failed` (GitHub non-2xx,
a transport failure, or a 2xx whose body would not parse — in that last case the message
says the issue may nonetheless have been created). `502` rather than `500` because this is
the one endpoint whose failure is genuinely upstream, and the UI says so.

<!-- kb:anchor sessions.locate -->
### `POST /api/sessions/{id}/locate`

**Auth**: UI cookie (401 `unauthorized`). Backs drag-and-drop onto a terminal pane (#8).
A browser hands a page a dropped file's **name and bytes, never its path**, and macOS keeps
the drag pasteboard private to the dragging app (measured 2026-09-02), so the daemon
**locates the original** instead: the upload is a fingerprint, compared in memory against
every file on disk with the same basename and size; the daemon **never writes the bytes to
disk** — it is the original file or nothing (settled with Damian).

**Request:** `multipart/form-data` with exactly one file part named `file`; the part's
`filename` is the dropped file's basename (UTF-8, as the browser supplies it). No other
parts are read. Bodies over 50 MiB + 64 KiB (multipart overhead) are refused.

**Response 200:**

```json
{ "path": "/Users/damian/Desktop/Screenshot 2026-08-30 at 14.35.00.png" }
```

`path` is the absolute, symlink-resolved path of the **single** file whose basename, size
and bytes equal the upload. Not shell-escaped — escaping is the UI's job (Terminal.app
style: backslash before spaces and shell metacharacters, trailing space).

Candidate discovery is Spotlight first (`mdfind` with an exact `kMDItemFSName` +
`kMDItemFSSize` query, 2 s timeout), then — only if Spotlight yields no verified
candidate — a walk of the session's `directory` filtered by basename and size (skipping
`.git`, capped at 200 000 entries). Every candidate is byte-compared before it counts;
duplicate paths (after `EvalSymlinks`) count once. A Spotlight timeout or a missing
`mdfind` binary degrades to the walk, never errors — the Spotlight finder is the only
OS-specific step (Linux `plocate` / Windows Search finders are a future addition).

**Errors:**

- `400 invalid_request` — body is not multipart, has no `file` part, or the part's
  filename is empty / contains a path separator.
- `404 unknown_session` — no session with that id.
- `404 not_located` — no file on disk matched name, size and bytes.
  `{ "error": { "code": "not_located", "message": "no file named <name> with identical contents was found" } }`
- `409 ambiguous` — two or more distinct files matched.
  `{ "error": { "code": "ambiguous", "message": "<N> identical files named <name>", "paths": ["…", "…"] } }`
  `paths` lists every verified match (absolute, sorted) so a future UI can offer a choice;
  the current UI only counts them.
- `413 too_large` — body exceeded the cap; the message names the 50 MiB limit.
- `500 internal_error` — the walk failed for a reason other than "nothing found" (e.g. the
  session directory is unreadable).

Requests are independent; the UI sends them sequentially in drop order so pasted paths land
in the order the files were dropped. The session's `alive` flag is not consulted — locating
is a filesystem question; the UI itself refuses to paste into a surface whose terminal
socket is not open.

<!-- kb:anchor sessions.title -->
### `PUT /api/sessions/{id}/title`

**Auth**: UI cookie (401 `unauthorized`). Backs inline rename from the Focus mainhead and a
tile header (#10). **Request:** `{ "title": "hunting flake" }` sets the session's **title
override** (1–100 characters after trimming, counted in runes); `{ "title": null }` clears it.
The `title` key is **required** — an absent key is not a clear. Leading/trailing whitespace is
trimmed before validation and storage. → `204`, no body. Every UI socket receives one
`sessionUpsert` iff the wire `title` or `titleOverride` changed; a request that leaves both as
they were is a `204` with no broadcast. The session's `alive` flag is not consulted (a dead
session can be renamed — display-only field).

Precedence (`kb:anchor/ws.session`): the wire `title` is `titleOverride` when non-null, else Claude's last-known
`session_name`, else `null`. Status posts keep refreshing Claude's name into the daemon's own
column but never read or write the override; while an override is set, a post that changes only
Claude's name persists and broadcasts nothing (the wire object is unchanged). The launch form's
title still reaches Claude Code as `--name` and is *not* an override.

**Errors** (envelope per `kb:anchor/transport`):

- `400 invalid_request` — body not JSON, `title` key missing, `title` neither string nor null,
  or the trimmed string empty / longer than 100 runes.
  `{ "error": { "code": "invalid_request", "message": "title must be null or 1-100 characters after trimming" } }`
- `404 unknown_session` — no session with that id.
  `{ "error": { "code": "unknown_session", "message": "unknown session id" } }`

<!-- kb:anchor sessions.shell -->
### `POST /api/sessions/{id}/shell`

**Auth**: UI cookie (401 `unauthorized`). No body. Ensures session `{id}` has a plain shell
running in its own tmux session, `muster-<id>-shell`, spawning it if absent — the lazy-spawn
step behind the dashboard's `claude | shell` surface switch (#21). Idempotent: a session whose
shell is already running is a `200` with `created: false`.

The shell runs the user's `$SHELL` interactively (fallback `/bin/zsh`) with the session's
`directory` as cwd, and is spawned with **no `MUSTER_SESSION`** in its environment — so a
`claude` run inside it produces an envelope with no `musterSession`, falls through
`kb:anchor/ingest.envelope`'s binding rules to an unbound `session_id`, and persists unrouted with a NULL
`event.session_id`. That isolation is structural, not incidental: it is what stops a nested
`claude` driving the parent session's state machine. Muster writes no
`.claude/settings.local.json` on a shell's behalf.

`alive` is **not** consulted, in either direction: a shell may be started on a dead session
and survives its parent session ending. A shell has no representation in SQLite and none on
the state stream — the `kb:anchor/ws.session` Session object is unchanged, and no `sessionUpsert` is broadcast.

**Response 200:**

```json
{ "target": "muster-7-shell", "created": true }
```

- `target` — string, the shell's tmux session name; always `muster-<id>-shell`.
- `created` — boolean, `true` iff this call spawned it.

**Errors** (envelope per `kb:anchor/transport`):

- `404 unknown_session` — no session with that id.
  `{ "error": { "code": "unknown_session", "message": "unknown session id" } }`
- `409 directory_missing` — the session's recorded directory no longer exists or is not a
  directory; checked before the spawn so this is a clean 409, never a tmux error.
  `{ "error": { "code": "directory_missing", "message": "/Users/d/gone no longer exists" } }`
- `500 shell_spawn_failed` — tmux refused the spawn; `message` carries the tmux error.
  `{ "error": { "code": "shell_spawn_failed", "message": "tmux new-session: ..." } }`

Shells are deliberately **not** persistent: they outlive musterd only because tmux sessions
do, and reconcile (`kb:anchor/state.liveness`) kills every `muster-<n>-shell` on the socket at startup rather than
adopting it.

<!-- kb:anchor update.apply -->
### `POST /api/update/apply`

**Auth**: UI cookie (401 `unauthorized`).
**Request** (`restart` optional, default `false`):

```jsonc
{ "restart": false }
```

→ `202`, no body — progress arrives as `update` messages (`kb:anchor/ws.update`). Semantics: if
`update.installed` already equals `update.available` (or `available` is null and `installed`
is set — the restart-only case after a plain Update) the download is skipped; otherwise the
daemon downloads the `runtime.GOARCH` archive plus `checksums.txt` and `checksums.txt.minisig`
for `available`, verifies the minisign signature against its compiled-in public key, verifies
the archive's SHA-256 against the signed file, extracts `musterd` beside the running binary and
renames it over the resolved path — broadcasting phases `downloading` → `verifying` →
`installing` → `done`. Then, iff `restart` is true, phase `restarting` is broadcast and the
daemon re-execs itself in place (same PID, same arguments; sessions are never killed and
`-on-exit` is never consulted). A POST while `apply.phase` is `downloading`/`verifying`/
`installing`/`restarting` also returns 202 without starting a second apply; its `restart` value
is ignored — the first request's wins. Any failure leaves the old binary untouched.
**Errors:**
- 400 `invalid_request` — body not JSON.
- 404 `not_found` — updates disabled (`musterd -update-base-url ""`) or the install is `dev`.
- 409 `update_unsupported` — install is `homebrew`/`unmanaged`; `message` is `update.remedy`.
- 409 `nothing_to_apply` — `available` and `installed` both null.
- 409 `shutting_down` — the daemon is already shutting down.

<!-- kb:anchor update.restart-impact -->
### `GET /api/update/restart-impact`

**Auth**: UI cookie (401 `unauthorized`). No body. → `200`:

```jsonc
{ "shells": [ { "sessionId": 3, "title": "fix auth" } ] }   // [] when none; title null when the owning session is unknown
```

One entry per `muster-<n>-shell` tmux session alive on the daemon's socket — the set reconcile
kills on restart (`kb:anchor/sessions.shell` / `kb:anchor/state.liveness`), which is why the dashboard's Update-and-restart confirm names
them. Computed on request from tmux, never cached (shells have no wire representation
elsewhere). No errors beyond auth.

<!-- kb:anchor ingest -->
## HTTP endpoints — ingest (Claude Code → daemon)

| Method & path | Body |
|---|---|
| `POST /ingest/{token}/hook` | One hook payload — **enveloped** (`kb:anchor/ingest.envelope`) from the command wrapper; raw still accepted (canary / legacy) |
| `POST /ingest/{token}/status` | Enveloped status-line stdin JSON |

- One hook URL for **all** events (`hook_event_name` is in every payload), reached only
  from the generated wrapper script — Muster writes **no** `allowedHttpHookUrls` and no
  `type:"http"` entries.
- **Return `200` with empty body immediately; process asynchronously.** A slow receiver
  taxes every turn by its timeout, additively per hook (SPEC §6). Hook timeouts Muster
  configures are 1–2 s, never 5. Malformed JSON is still `200` (logged, dropped) — there
  is no value in making Claude Code retry, and 4xx/5xx behaviour is not ours to lean on.
- Bad token → `404` (no oracle for token guessing; it's logged).
- At ingest the daemon assigns a **monotonic per-session `seq`**, persists the event
  (append-only `event` table), then feeds the state machine (`kb:anchor/state`) in `seq` order. Hook
  payloads carry no timestamp or ordering of their own.
- **Never log payload bodies** anywhere world-readable — they contain prompt text.

<!-- kb:anchor ingest.transport -->
### Transport facts this design is built on (measured, 2.1.233)

`SessionStart` is silently never delivered over `type:"http"`, which is one reason every
hook — and the status line — is a `type:"command"` wrapper script that POSTs its stdin
(the others are below). Delivery is best-effort, at-most-once, unordered; design for loss
(SPEC §6).

**All hooks are `type:"command"` wrappers.** Command hooks
see the pane environment on every event (probe 2026-08-27 against 2.1.246: 15/15 events
enveloped across 3 sessions), so every event carries the `kb:anchor/ingest.envelope` envelope, and the wrapper
exits 0 silently when `$MUSTER_SESSION` is unset or the daemon is unreachable — an
unmanaged session posts nothing and a stopped daemon produces no inline hook errors. The
entries reference the wrapper's *path*, so a port/token rotation rewrites only the scripts
(done at every daemon start), never the settings file. Cost ~50 ms/event vs ~25 ms for
http (measured).

<!-- kb:anchor ingest.envelope -->
### The envelope — how events bind to a Muster session

Raw hook payloads identify themselves only by `session_id` + `cwd`, which cannot
distinguish two sessions launched into the same directory. The command-wrapped posts fix
this, because a command hook runs inside the session's environment:

- The daemon spawns every pane with `MUSTER_SESSION=<muster session id>` in the pane
  environment (`tmux new-window -e`); tmux itself provides `TMUX_PANE`.
- The `SessionStart` wrapper and the status-line script POST an **envelope**:

```jsonc
{ "musterSession": 7,            // from $MUSTER_SESSION; absent if unset
  "tmuxPane": "%12",             // from $TMUX_PANE; absent outside tmux (headless probes)
  "payload": { /* verbatim stdin JSON — untouched */ } }
```

- `/ingest/{token}/hook` accepts both shapes: enveloped (has a `payload` key) and raw.
- **Binding rule** (envelope-authoritative): every
  event Muster's wrapper posts is enveloped, and the envelope's `musterSession` routes it
  (a stale/unknown value is never trusted — persisted unrouted). The enveloped
  `SessionStart` remains the *normal* binder of `claudeSessionId → session` (and
  confirms/records the tmux target), but any enveloped non-status event whose
  `session_id` differs from the bound one is the "new `session_id` on a known pane" case
  below and is applied as a `/clear` rebind first; an enveloped event on a never-bound
  session binds it without a transition. Rebinding is **monotonic**: an enveloped event whose `session_id` is one this session has *already left* — `byClaude[session_id]` already points at this session and it is not the current `claudeSessionId` — is a reordered straggler from the previous conversation (typically the `/clear` pair's own `SessionEnd(reason:"clear")`, since delivery is unordered). It is routed and applied but **never rebinds backwards**; the current binding, context gauge and compaction counter are untouched. Residuals (measured, accepted): if the pane genuinely returns to an earlier conversation via `--resume` and that `SessionStart(source:"resume")` is lost, `claudeSessionId` stays on the newer id until the next bind event — events still route and apply. And INV-1 (`kb:anchor/state.transitions`) holds for the *bound* session only: an enveloped event whose `musterSession` is A but whose `session_id` is bound to B rebinds A and moves `byClaude`, leaving B's `claudeSessionId` unattributed — pre-existing on the `KindResumeBind` path, reachable only by posting one conversation under two `MUSTER_SESSION` values.
  Raw (non-enveloped) posts route by `session_id`
  through the existing mapping, never bind, and persist unrouted when unknown — never
  guessed at by `cwd`. Status-line posts never bind or rebind (`kb:anchor/state.transitions`, INV-1).
- `/clear` is directly observable (probe 2026-08-20, 2.1.237): the old `session_id` gets
  `SessionEnd` with `reason:"clear"`, then `SessionStart` fires with `source:"clear"` and
  a **new** `session_id` in the same pane. On it: rebind `claudeSessionId`, reset the
  context gauge and compaction counter, state → `started`. Session identity (`id`,
  `tmuxTarget`, title history) is unchanged. A new `session_id` on a known pane without
  `source:"clear"` is treated the same way (loss tolerance).

All of `kb:anchor/ingest.envelope` is measured, not assumed (probe 2026-08-20, against 2.1.237): command hooks
and the status-line script see both `$TMUX_PANE` and `tmux new-window -e`-injected
variables, headless and interactive. The per-directory config Muster writes is
**`.claude/settings.local.json`** — verified to honor `hooks`, `statusLine` and
`allowedHttpHookUrls` on its own, and gitignored by Claude Code, so the ingest token
never lands in a committable file.

**Command fields are shell command lines.**
`hooks.<Event>[].hooks[].command` and `statusLine.command` are handed to `/bin/sh -c` by
Claude Code (probe 2026-08-25 against 2.1.245, `spikes/FINDINGS.md` addendum: a bare
space-bearing path fails with `/bin/sh: /tmp/muster: No such file or directory` for
`SessionStart` and *silently* for the status line). Muster therefore writes each
wrapper-script path as a **single-quoted shell word** (`'` inside the path escaped as
`'\''`), and recognises its own prior entries in either the quoted or the legacy bare
form when replacing them wholesale. Quoting a space-free path is harmless (measured). The
default macOS data dir (`~/Library/Application Support/Muster`) contains a space, so this
is the production path, not an edge case.

<!-- kb:anchor ws -->
## WebSocket `/ws` — the state stream

- Auth: cookie on the upgrade request. Ordered, server→client only. Client never sends
  application messages on this socket (pings are the library's business).
- On (re)connect the server sends `hello`, then `snapshot`, then live deltas. There is
  **no replay** — the snapshot is the resync mechanism, mirroring how hook loss is
  handled everywhere else.
- The client reconnects with backoff (one WS client module owns this — conventions). A
  dead socket **is** the "daemon down" signal: the UI switches to the full-width banner
  (ux-flows §3.5) until `hello` arrives again.

Every message: `{"type": "<name>", …}`. Unknown types are ignored.

<!-- kb:anchor ws.hello -->
### `hello`

```jsonc
{ "type": "hello", "protocolVersion": 2,
  "daemon": { "version": "0.7.0" },
  "claudeCode": { "installed": "2.1.267", "floor": "2.1.246", "verified": "2.1.267", "status": "verified" } }
```

`claudeCode` is the daemon's startup classification of the installed Claude Code against the
canary-verified range (`docs/claude-code-versions.md`):

- `installed` — `string|null`: the leading `major.minor.patch` of `claude --version` at daemon
  startup. `null` **iff** `status` is `"unknown"` (the check failed, hung past its timeout or was
  unparseable).
- `floor` — `string`, always present: the lowest version `make canary` has gone green on.
- `verified` — `string`, always present: the highest such version (the ceiling). `floor ≤ verified`
  always; equal when only one version has been observed.
- `status` — `"unknown" | "below" | "verified" | "above"`: `below` is `installed < floor`,
  `verified` is `floor ≤ installed ≤ verified` (versions strictly inside the range are inferred, not
  individually run), `above` is `installed > verified`.

The masthead renders the four states (`unknown` as the words "Claude installation unknown", `kb:anchor/conventions`;
`below`/`above` with a warning glyph and hover text). Protocol 1 carried `{pinned, installed,
drift}` — removed. A `protocolVersion` the client doesn't know → client shows "reload the
dashboard"; the dashboard is embedded in the binary, so the only skewed client is a tab left open
across a `musterd` upgrade.

<!-- kb:anchor ws.snapshot -->
### `snapshot`

```jsonc
{ "type": "snapshot",
  "sessions": [ /* Session objects, kb:anchor/ws.session — order unspecified; the client sorts */ ],
  "usage": { /* Usage object, kb:anchor/ws.usage */ },
  "prefs": { "view": "focus", "density": "2x2", "usageModel": "Fable", "railSort": "manual", "theme": "follow", "updateCheck": true },
  "claudeTheme": { "family": "dark" },   // "light" | "dark" | "unknown" — always present
  "update": { /* kb:anchor/ws.update — always present*/ } }
```

`claudeTheme.family` is the daemon's latest read of Claude Code's own theme setting,
folded to a family: `light`, `dark`, or `unknown` (polling disabled via
`-claude-theme-poll 0`, or the setting unreadable). Claude Code's default is dark, so an
absent setting reports `dark`, not `unknown`. The dashboard uses it for the terminal
pane's ground/foreground pair **in every theme** (design-system §7.5: Muster cannot restyle
the TUI Claude draws, so it matches the ground to the theme Claude is drawing for) and, when
`prefs.theme` is `"follow"`, to resolve the dashboard theme. Where the setting lives and how
it is read is `internal/claudecode`'s business — not specified here.

**Sorting is client-side**, a pure function over Session fields per ux-flows §3.4
(needs-input longest-blocked first → failed most recent → planning → working → started →
idle longest-idle first), unit-tested in Vitest. The daemon never orders for display.

<!-- kb:anchor ws.session -->
### The Session object

Broadcast whole (`sessionUpsert`) on any change — at 3–6 sessions, field-level patching
is complexity with no payoff, and whole-object replacement is naturally loss-tolerant.

```jsonc
{
  "id": 7,
  "title": "flaky-e2e-hunt",        // DISPLAY title: titleOverride when non-null, else the
                                    //   last-known status-line session_name (launch --name until then), else null
  "titleOverride": null,            // string | null — the user's rename via PUT /api/sessions/{id}/title (kb:anchor/sessions.title); null = none.
                                    //   Never touched by status posts, rebinds, resume or reconcile. INV: title == titleOverride
                                    //   whenever titleOverride is non-null.
  "state": "working",                // "started"|"planning"|"working"|"needs_input"|"failed"|"idle"
  "stateSince": "2026-08-20T09:15:00Z",
  "alive": true,                     // liveness is ORTHOGONAL to state (kb:anchor/state.liveness); false = pane gone, card greys out, offers resume
  "endedAt": null,
  "attention": { "reason": "permission", "since": "2026-08-20T09:15:00Z" }, // non-null iff state == "needs_input"; reason "permission"|"idle"
  "failure": { "error": "server_error", "message": "API error ended the turn" }, // non-null iff state == "failed"; error is the RAW token — display it, never switch on it (H2: taxonomy isn't 1:1)
  "directory": "/Users/damian/code/Projects/muster",
  "repo": { "name": "muster", "branch": "feat-e2e", "isWorktree": false },  // null when directory isn't a git checkout
  "model": { "id": "claude-opus-5", "displayName": "Opus 5" },  // launch value until the status line confirms; null if unknown
  "permissionMode": { "value": "plan", "source": "hook" },       // source "seed" (launch flag) | "hook" (a payload carried it); ALWAYS last-known, never authoritative (SPEC §4.5). value is an open string; observed "default" | "plan" | "acceptEdits" | "auto" (2.1.259)
  "context": { "usedPct": 42, "totalInputTokens": 84211,
               "windowSize": 200000, "compactions": 2 },          // usedPct/totalInputTokens/windowSize null before first API response → "ctx — unknown"
  "lastActivity": "Fixed the flaky retry; running the suite…",   // truncated last_assistant_message from the closing Stop; null until first Stop
  "claudeSessionId": "3f2a…",       // null until SessionStart binds
  "tmuxTarget": "muster:@4",        // the identity key; exposed for debugging/tests.
                                    //   "muster-<id>:@<n>" — one tmux session per Muster
                                    //   session (concurrent live tiles each need their own
                                    //   attach client). Opaque to the UI.
  "firstLaunchHere": true,          // boolean, on every Session object — true iff the launch created this directory's repo row
  "createdAt": "2026-08-20T09:11:02Z",
  "pinned": false,                  // user pinned it into the rail's top block
  "railPos": 12                     // integer ≥ 0, manual rail position, unique across
                                    //   all sessions (gaps allowed). INV: every pinned session's
                                    //   railPos < every unpinned one's. New sessions get
                                    //   max(railPos)+1, pinned:false; existing rows backfilled
                                    //   railPos = id (opened order). Display-only — never read or
                                    //   written by the state machine or the status path. The
                                    //   client sorts by it (prefs.railSort); the daemon never
                                    //   orders for display (kb:anchor/ws.snapshot unchanged). Changes arrive as
                                    //   ordinary sessionUpserts, one per changed session.
}
```

First-launch honesty (ux-flows §1.4) is derived client-side: `state == "started"` +
`claudeSessionId == null` + (`firstLaunchHere` → "likely waiting on trust prompt", else
after ~10 s → "no signal yet"). `firstLaunchHere` is on every Session object so the
client needn't track repo history.

Value semantics (within the nullability rules above):

- `title`: the launch form's title, else `null`, until **Claude's name** arrives from the
  status line's session name — it refreshes whenever a post carries one (early posts carry
  none; the last-known value stands until then). The wire `title` reflects it only while
  `titleOverride` is null (`kb:anchor/sessions.title`).
- `model`: `{id, displayName}` carry the launch value verbatim until the SessionStart
  payload's optional model field (a plain model-ID string, sometimes absent — measured
  2026-08-20) replaces `id`; both then refresh from the status line's model object whenever
  it is present.
- `context`: `usedPct`/`totalInputTokens`/`windowSize` are non-null from the session's first
  status post carrying real context data (the daemon adopts the block only when the payload's
  used-percentage is non-null — pre-first-response posts carry null percentages with a zero
  token count, which must stay *unknown*), all-null before it and again after `/clear`. The
  three are always all-null or all-non-null. `compactions` is live from PreCompact.
- `lastActivity`: the closing Stop's last-assistant-message text, truncated to 200 chars by
  the daemon; `null` until a first Stop.
- `alive`/`endedAt`: live from the liveness poll and the SessionEnd hint.
- Status posts change **only** title/model/context, and only when a value actually changed
  (no no-op upserts) — never `state`/`stateSince`/`attention`/`failure`/`alive`/
  `permissionMode`/`compactions` (INV-1; `kb:anchor/state.transitions`'s "never a state source").

<!-- kb:anchor ws.usage -->
### The Usage object & `usage` message

```jsonc
{ "type": "usage", "usage": {
    "fiveHour": { "usedPct": 61.2, "resetsAt": "2026-08-20T11:00:00Z" },  // null until the first post-boot sample → masthead "unknown"
    "sevenDay": { "usedPct": 23.0, "resetsAt": "2026-08-22T06:00:00Z" },  // wire name seven_day; null as above
    "model": { "id": "claude-opus-5", "displayName": "Opus 5" },  // freshest sample's model (masthead readout); null iff buckets null
    "sampledAt": "2026-08-20T09:15:31Z",   // null iff buckets null
    "source": "subscription",              // the SPEC §9 Q6 seam: "api"/"otel" later
    "modelScoped": [                        // per-model weekly windows from GET /api/oauth/usage; null until the first successful fetch, then the full list sorted by displayName ([] is a valid, distinct result)
      { "displayName": "Fable", "usedPct": 61.0, "resetsAt": "2026-09-01T13:59:59Z" } ],
    "modelScopedAt": "2026-08-30T10:00:00Z", // null iff modelScoped null — last successful fetch
    "modelScopedError": null,               // null after a successful fetch; "no-credentials" | "unauthorized" | "unreachable" after a failed one — modelScoped keeps the last-good list
    "modelScopedSource": "subscription-api" } } // constant in v1
```

Percentages arrive as floats; the client rounds for display. The daemon records a sample
only when bucket values or model **changed** — `sampledAt` advancing alone is not a
change — so the measured ~435 ms pair posts (identical values) produce one `usage`
broadcast and one `usage_sample` row, not two. **No hydration**: after a daemon restart
the buckets are null until the next status post — per-session
context, by contrast, lives on the session row and survives restarts like title/state. A
sample is recorded only from a **routed** status post (valid envelope) carrying both
buckets and the model in the same payload; anything less persists as an event and feeds
nothing.

**Two sources, one object**: the `fiveHour`/`sevenDay`/`model`
half comes from routed status posts as above; the `modelScoped*` half comes from musterd's
own poll of Claude Code's `/api/oauth/usage` endpoint (default every 5 min, plus `kb:anchor/usage.refresh`),
because the status line filters the per-model window out (`spikes/FINDINGS.md`
2026-08-30 addendum). Each half has its own change detection; a `usage` message is sent
whenever **either** changes (or `modelScopedError` changes) and always carries the merged
full object built at send time. Neither half hydrates across a daemon restart. The
`usageModel` pref (`kb:anchor/prefs.put`) selects which `modelScoped` entry the masthead renders.

<!-- kb:anchor ws.session-upsert -->
### `sessionUpsert`

```jsonc
{ "type": "sessionUpsert", "session": { /* kb:anchor/ws.session */ } }
```

<!-- kb:anchor ws.prefs -->
### `prefs`

```jsonc
{ "type": "prefs", "prefs": { "view": "tiles", "density": "3x2", "usageModel": "Fable", "railSort": "manual", "theme": "dark", "updateCheck": true } }  // full-object echo of PUT /api/prefs
```

<!-- kb:anchor ws.session-removed -->
### `sessionRemoved`

```jsonc
{ "type": "sessionRemoved", "id": 7 }   // sent once per DELETE /api/sessions/{id} (kb:anchor/sessions.remove)
```

A client that has never seen `id` ignores it. Startup sweeps (`kb:anchor/state.liveness`) send nothing — swept
rows are simply absent from the first `snapshot`. Dead sessions otherwise stay visible
(sorted last, offering Resume/Remove) until removed or swept.

<!-- kb:anchor ws.claude-theme -->
### `claudeTheme`

```jsonc
{ "type": "claudeTheme", "family": "light" }   // "light" | "dark" | "unknown"
```

Sent **only when the polled family changed** since the last broadcast — never per tick,
never with a timestamp (it is a current-state fact, not an event). The first value a client
sees is `snapshot.claudeTheme` (`kb:anchor/ws.snapshot`), so a reconnect needs no replay. On receipt the
client always re-derives the terminal pair (`<html data-claude-family>`) and, only while
`prefs.theme` is `"follow"`, re-derives the dashboard theme (`<html data-theme>`). A
`prefs` message never changes the family; a `claudeTheme` message never changes the
dashboard theme while an override is set.

<!-- kb:anchor ws.update -->
### `update`

```jsonc
{ "type": "update", "update": {
    "running": "0.10.0",                  // string — the daemon's version as built; release builds are bare MAJOR.MINOR.PATCH (GoReleaser's {{.Version}}); dev builds are the raw string ("dev", "v0.10.0-4-ge5102b8")
    "install": "installer",               // "installer" | "dev" | "homebrew" | "unmanaged" — startup classification from the resolved executable path, constant for the daemon's life
    "remedy": null,                        // string iff install is "homebrew" | "unmanaged" (the one-line remedy to show); null otherwise
    "available": "0.11.0",                // string|null — a strictly newer release from the last successful check; null when none, when prefs.updateCheck is false, when install is "dev", or when checking is disabled by flag
    "checkedAt": "2026-09-10T20:00:00Z",  // RFC3339|null — the last successful check; null before one and after the pref is turned off
    "installed": null,                     // string|null — a version swapped onto disk (by this daemon, or detected from a `musterd -update` run) that the running process has not yet restarted into
    "apply": { "phase": "idle",           // "idle" | "downloading" | "verifying" | "installing" | "restarting" | "failed" | "done"
               "version": null,           // string|null — the release being / last applied; null iff phase is "idle"
               "error": null } } }         // string|null — message plus remedy sentence; non-null iff phase is "failed"
```

Sent on every change to any field (check result, pref toggle, each apply phase, detection of an
external swap); `snapshot.update` carries the current object, so a reconnecting window needs no
replay. `running` duplicates `hello.daemon.version` deliberately — the dialog renders from one
object. `available` and `installed` may both be non-null (swap done, restart pending); the
Settings-button badge rule is `available != null && installed == null`. After a restart the new
daemon starts with `installed: null`, `apply.phase: "idle"`. The check itself runs in the
daemon (once after listen, then every `-update-check-interval`, default 24 h) against the
`/releases/latest` redirect of `-update-base-url` — never `api.github.com`, never the browser;
with `updateCheck` false the daemon makes no update-related request at all. Where the release
lives and how it is verified is `internal/selfupdate`'s business — not specified here.

<!-- kb:anchor terminal.ws -->
## WebSocket `/ws/terminal/{id}` — the PTY bridge

One socket per **live** surface, bridged to a daemon-owned PTY running `tmux attach`
against that session's own tmux session (`muster-<id>` — see `kb:anchor/ws.session`'s tmuxTarget note).

**Auth**: UI cookie on the upgrade + the `kb:anchor/transport` Origin check. Pre-upgrade errors (plain HTTP):
401 `unauthorized` (no/invalid cookie), 404 `not_found` (unknown session id),
409 `not_attachable` (session exists but `alive` is false).

Frames:

- **Binary server→client**: raw PTY output bytes (tmux attach stream), verbatim — the
  daemon transforms nothing and chunks only on byte boundaries (multi-byte UTF-8 may
  split across frames; byte order is the only guarantee). xterm.js writes them verbatim;
  the dashboard restyles nothing inside a pane; `scrollback: 0`.
- **Binary client→server**: raw input bytes (keystrokes/paste).
- **Text frames**: JSON control, client→server only (no server→client text frames):
  `{"type":"resize","cols":210,"rows":52}` — client sends one immediately after open
  (the attach PTY starts at 80×24 until it arrives), then debounced ~100 ms; the daemon
  applies `pty.Setsize` **then** `tmux resize-window`, in that order, never the
  pane-level primitive (FINDINGS §7(d)). `cols` clamped to [20, 500], `rows` to
  [5, 300]; an unparseable or unknown text frame is ignored and logged, never fatal.

**Close codes** (server-initiated):

- `4000` `superseded` — a newer socket claimed this session (one-live-client law). The
  UI shows a click-to-reclaim overlay; nothing auto-reconnects on 4000 (no flap loop).
- `4001` `pane_ended` — PTY EOF: the tmux session/pane is gone. The daemon also nudges
  the liveness poll, so a `sessionUpsert` with `alive:false` follows shortly.
- Normal close (1001) on daemon shutdown.

**One-live-client law, enforced server-side** (SPEC §9 Q5): at most one terminal socket
per session; a new connection for the same session **takes over** — the daemon closes the
previous socket with close code `4000` (reason `superseded`) and tears down its PTY
before the new attach starts. Geometry ownership moves with the socket, which is exactly
the resize mechanics view-switching needs (ux-flows §3.8): the newly-owning surface sends
its `resize` on connect, and sessions whose live surface didn't change are never touched.

<!-- kb:anchor terminal.shell-ws -->
### WebSocket `/ws/shell/{id}` — the shell PTY bridge

One socket per live **shell** surface, bridged to a daemon-owned PTY running `tmux attach`
against `muster-<id>-shell` (`kb:anchor/sessions.shell`). **Attach only** — this route never spawns; `POST
/api/sessions/{id}/shell` is the only thing that creates a shell.

**Auth**: UI cookie on the upgrade + the `kb:anchor/transport` Origin check. Pre-upgrade errors (plain HTTP):
401 `unauthorized`, 404 `not_found` (unknown session id), 409 `no_shell` (the session exists
but has no running shell). `alive` is not consulted (`kb:anchor/sessions.shell`). Note that a browser cannot read a
pre-upgrade status — the WebSocket API hides it — which is why the spawn is a separate POST
whose error body the dashboard can actually render.

**Frames**: byte-for-byte identical to `kb:anchor/terminal.ws` — raw PTY output binary server→client, raw input
binary client→server, and `{"type":"resize","cols":N,"rows":N}` as the only client→server text
frame, with the same [20, 500] × [5, 300] clamps and the same `pty.Setsize` **then** `tmux
resize-window` order (FINDINGS §7(d)). An unparseable or unknown text frame is ignored and
logged, never fatal.

**Close codes**: `4000` `superseded`, `4001` `pane_ended` (the shell exited — `exit`, or an
external kill), normal close (1001) on daemon shutdown. Unlike `kb:anchor/terminal.ws`'s `4001`, this one does
**not** nudge the liveness poll: a shell's death is not its session's death, and a live session
must never take a liveness flap because a shell under it exited.

**One-live-client law**: enforced per **attach target**, not per session. `muster-<id>` and
`muster-<id>-shell` are distinct targets, so a session's Claude socket and its shell socket are
independent — opening one never supersedes the other. Two clients on the *same* target still
supersede each other exactly as `kb:anchor/terminal.ws` describes.

<!-- kb:anchor state -->
## The state machine

Runs inside the daemon per session, fed exclusively by ingested events (in `seq` order),
Muster's own actions (launch/resume), and pane-liveness checks. **Never terminal output.**

<!-- kb:anchor state.displayed -->
### Displayed states

`started · planning · working · needs_input · failed · idle` — exactly SPEC §2.1. There
is no "done" (a turn ending is not a task completing) and no "dead" state — liveness is
the orthogonal `alive` flag (`kb:anchor/state.liveness`).

<!-- kb:anchor state.tracked -->
### Per-session tracked variables

- `state`, `stateSince` — the displayed pair.
- `modeLatch` — last known `permission_mode`, seeded by the launch flag
  (`source:"seed"`), overwritten by any payload carrying the field (`source:"hook"`).
  Events without the field (`SessionStart`, `SessionEnd`, `Notification`, `StopFailure`,
  `PreCompact` — measured) **never reset it**: a session failing in plan mode stays plan.
  A seeded `auto` on a model that cannot run it (haiku — measured 2.1.259, the TUI prints
  `auto mode unavailable for this model` and drops to manual) is corrected to `"default"` by
  the first `UserPromptSubmit`, via this same seed-then-correct path; nothing special-cased.
- `currentPromptId` — from the latest turn-scoped event; `closedPromptIds` — prompts
  closed by a Stop-family event (keeping the last few suffices).
- Turn-scoped events may carry a **subagent marker** (measured 2.1.259, canary-fields
  "Subagent and background-task fields"): a
  background subagent's `PreToolUse`, `PostToolUse` and `PermissionRequest` carry the
  *parent turn's* `prompt_id` plus the marker; the `Notification` a subagent triggers does
  not. The state machine sees the marker only as a neutral flag derived in
  `internal/claudecode`.
- `compactions`, `context`, `attention`, `failure`, `lastActivity` — as surfaced in `kb:anchor/ws.session`.

<!-- kb:anchor state.transitions -->
### Transitions

"Turn-activity" events: `UserPromptSubmit`, `PreToolUse`, `PostToolUse` (all carry
`prompt_id` and `permission_mode`). `ACTIVE` below means: `planning` if
`modeLatch == "plan"`, else `working` — planning is working-shaped attention-wise
distinct, and the latch is what separates them.

| Event (guards) | Transition / effect |
|---|---|
| Muster launch | Row created → `started`; latch seeded from the form |
| `SessionStart` (`source:"startup"`, enveloped) | Bind `claudeSessionId`, record model → stay/enter `started` |
| `SessionStart` (`source:"clear"`), or any enveloped non-status event whose `session_id` differs from the bound one | `/clear`: rebind, reset context + compactions → `started`; a non-`SessionStart` trigger then applies its own row |
| Any enveloped non-status event whose `session_id` is a *previous* id of this session (already in `byClaude` → this session, not the current one) | Reordered straggler: route and apply the event's own row; **no** rebind, no reset (monotonic binding) |
| Any enveloped non-status event on a never-bound session | Bind `claudeSessionId` (no transition), then apply the event's own row |
| `SessionStart` (`source:"resume"`, same `session_id`) | Re-bind to new pane, `alive := true` → `idle` (history exists; it is waiting for input, not new) |
| Turn-activity event (prompt not closed) | Adopt `prompt_id` as current (a new id is a new turn even if `UserPromptSubmit` was lost) → `ACTIVE`; update latch; **clear `attention` and `failure`** (`kb:anchor/ws.session`'s iff rules) |
| Turn-activity event (prompt already closed, **no subagent marker**) | Straggler from an unordered stream: persist, **no transition, no field change** (the latch still updates) |
| Turn-activity event (prompt already closed, **subagent marker present**) | A background subagent still working past the parent's `Stop` (#14, measured 2.1.259): → `ACTIVE`, clear `attention` and `failure`; the closed prompt is neither reopened nor adopted as current — the next Stop-family event still lands `idle`/`failed` |
| `Notification` `permission_prompt` (prompt not closed) | → `needs_input`, `attention.reason:"permission"`; **clears `failure`** (`kb:anchor/ws.session`'s iff rule) |
| `Notification` `idle_prompt` (prompt not closed) | → `needs_input`, `attention.reason:"idle"`; **clears `failure`** (reachable from `failed` when the fresh prompt's `UserPromptSubmit` was lost) |
| `Notification` — any other `notification_type` | Persist only, no transition (unobserved types stay inert) |
| `PermissionRequest` (prompt not closed, **or closed with the subagent marker present**) | Corroborates → `needs_input`, reason `"permission"`; **clears `failure`** (`kb:anchor/ws.session`) (v1 never answers it; the terminal prompt races and wins). A subagent's permission wait past the parent's `Stop` is identified by this event alone — its `Notification` carries no marker |
| `Notification` `permission_prompt` / `idle_prompt` (prompt already closed) | Straggler: persist, no transition (if the subagent's `PermissionRequest` was lost, the terminal itself still shows the prompt — the honest gap) |
| `Stop` | Close `prompt_id` → `idle`; capture `lastActivity`. `background_tasks` is never read: a `Stop` with background work still running lands `idle`, and the first subagent-marked hook returns it to `ACTIVE` (~2 s later, measured) — holding `working` on `background_tasks` would pin a session for as long as a backgrounded shell lives |
| `StopFailure` | Close `prompt_id` → `failed`; capture raw `error` (`Stop`/`StopFailure` are mutually exclusive per prompt — H2) |
| `PreCompact` | `compactions++`, no transition |
| `SubagentStop` | Persist only |
| `SessionEnd` (`reason:"clear"`) | `/clear` in progress: **not** a death hint — no effect on `alive`; the successor `SessionStart(source:"clear")` follows |
| `SessionEnd` (any other reason) | `alive := false`, `endedAt` set; **state unchanged** (it's a hint — `kb:anchor/state.liveness` is the authority) |
| Status-line post | Title / model / context refresh (`kb:anchor/ws.session` value semantics) + account usage (`kb:anchor/ws.usage`), applied outside the state machine; **never a state source** — no effect on any state-machine-owned field (INV-1) |
| Unknown `hook_event_name` | Persist + log; inert (forward compatibility) |

`needs_input` exits through the same table: the user answering in the terminal produces
turn-activity (→ `ACTIVE`) or a Stop-family event (→ `idle`/`failed`). Nothing else
clears it — if Muster missed the resolving event, the stale timer *is* the honest signal
(ux-flows §3.5).

<!-- kb:anchor state.ordering -->
### Ordering & loss tolerance

Hooks are best-effort, at-most-once, unordered, timestamp-free. Rules, in priority order:

1. Events apply in ingest (`seq`) order — arrival order is the only order there is.
2. A Stop-family event closes its `prompt_id`; later-arriving **unmarked** events for a
   closed prompt never reopen a turn (the one measured hazard: tool events interleaving
   past a `Stop`). **Subagent-marked** events for a closed prompt are not stragglers — they
   are a background subagent still running under the parent's prompt id (measured 2.1.259)
   — and transition the state without reopening the prompt. Resumption is ordinary: each
   background completion arrives as a `UserPromptSubmit` with a fresh `prompt_id`, closed
   by its own `Stop`.
3. Any turn-scoped event with an unseen `prompt_id` starts that turn — every transition
   into `ACTIVE` self-heals a lost predecessor.
4. Not every turn closes: a killed session emits neither `Stop` nor `StopFailure`
   (H2 probe) — which is why liveness is independent (`kb:anchor/state.liveness`), and why the state machine
   must never *wait* for an event to make progress.

The state machine and these guards get exhaustive table-driven unit tests (conventions —
"the logic the whole tool rests on").

<!-- kb:anchor state.liveness -->
### Liveness

`alive` is decided by **tmux pane existence on the muster socket** — polled (~5 s) and
event-nudged (`SessionEnd`, PTY EOF, End). `SessionEnd` is only a hint
(`kill -9` emits nothing; `reason` can't distinguish crash from clean exit). A dead
session keeps its last `state`, greys out, sorts last, and offers Resume/Remove.

**Reconcile at daemon start** runs synchronously, before `/ws` or `GET /api/state` can
answer, over every persisted row:

- `alive=0` (ended in an earlier daemon lifetime — the user had their resume chance) →
  the row is **deleted** (count logged). Nothing is broadcast; it is absent from the
  first `snapshot`.
- `alive=1`, pane exists → unchanged; tracking resumes.
- `alive=1`, pane gone (died while the daemon was down, or a reboot) → `alive:false`,
  `endedAt` = the startup time (the true death time is unknown and not guessed). Kept, so
  the resume chance survives; swept on the *following* startup.
- A `muster-<n>` tmux session with no row → logged at warn, never adopted (Muster only
  manages what it started).
- A `muster-<n>-shell` tmux session (`kb:anchor/sessions.shell`) → **killed**, unconditionally, whatever its
  `<n>`, and never reported as an unknown session. Shells are deliberately non-persistent;
  since tmux sessions outlive musterd, "the daemon forgets them" has to mean this sweep
  actively kills them, or a restart leaks a live shell with nothing pointing at it.
  Adopting one instead would be persistence by the back door.

**Daemon shutdown leaves sessions running** by default — they are meant to outlive a
restart. `musterd -on-exit=ask|leave|kill` (default `ask`): with a TTY on stdin and ≥1
live session, `ask` prompts once ("N live sessions on tmux socket X — kill them? [y/N]",
10 s timeout → No); without a TTY `ask` behaves as `leave`. `kill` (or a `y`) takes a
final snapshot, kills each live session's tmux session and sets its row `alive=0` before
exit — so the next startup sweeps it.

## History

`docs/history/protocol-changelog.md` — the milestone map this contract was built against and
the per-plan changelog, newest last. `git log -- docs/protocol.md` has the diffs.
