# Muster — daemon↔UI protocol · v1

Written 2026-08-20 (M0, before any daemon code — next-steps item 5 / TODO M0 first item).
This file is the **contract between `musterd` and the web dashboard**, plus the ingest
surface Claude Code posts into. It is the document the build pipeline treats as shared
state: **no agent changes it unilaterally** — a plan's Protocol Contract section carries
the delta, and the change lands here when the plan is approved.

Authority order: `SPEC.md` decides *what* Muster does; `docs/design/ux-flows.md` decides
*how the interface behaves*; this file decides *what crosses the wire between the two
processes and how state is derived*. Claude Code's own wire formats are **not** specified
here — they live in `spikes/canary-fields.md` (measured) and are consumed only inside
`internal/claudecode/` (hard rule). This file references them by field name only where a
derivation rule needs one.

Each endpoint/message is tagged with the milestone that implements it. Everything is
protocol **version 1**; the version only bumps on a breaking change to an existing
message (additive fields don't bump it).

---

## 1. Conventions

- **JSON everywhere**, UTF-8. Field names are **camelCase** (Claude Code's snake_case
  stops at the adapter boundary).
- **Timestamps are RFC3339 UTC strings** (`"2026-08-20T09:15:00Z"`). The adapter converts
  Claude Code's epoch integers (`resets_at`) before they reach this protocol.
- **`null` means unknown, and renders as the word "unknown"** — never as 0, never as an
  empty gauge (SPEC §2.2/§2.3). Absent optional fields mean "not applicable", not unknown.
- **Additive evolution**: clients ignore unknown message types and unknown fields; the
  daemon ignores unknown fields in requests. This is what lets M1–M4 extend M0 without
  version bumps.
- IDs: `session.id` and `repo.id` are daemon-assigned integers (SQLite rowids), opaque to
  the UI. Claude's `session_id` is a separate string attribute (`claudeSessionId`) and is
  **never** an identity key (SPEC §7 — `/clear` mints a new one in the same pane).

## 2. Transport & auth

- Daemon binds `127.0.0.1` only, one port (default from config; E2E allocates per run).
- Serves: static dashboard (`/`), UI API (`/api/…`), UI WebSocket (`/ws`), terminal
  WebSockets (`/ws/terminal/{id}`, M2), ingest (`/ingest/…`), health (`/healthz`).
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
  `launch_failed`, …); the UI may switch on them.

## 3. HTTP endpoints — UI

| Method & path | Milestone | Purpose |
|---|---|---|
| `GET /healthz` | M0 | Liveness; **unauthenticated**. `200 {"status":"ok","version":"<daemon>"}` |
| `GET /auth?token=…` | M0 | Exchange UI token for cookie; `303` → `/` |
| `GET /` + assets | M0 | Dashboard (cookie required) |
| `GET /api/state` | M0 | Full snapshot as JSON — same object as the WS `snapshot` payload (§5.2). E2E oracle and debugging; the UI itself uses the WS |
| `POST /api/sessions` | M1 | Launch a session |
| `GET /api/repos` | M1 | Directory picker list |
| `GET /api/browse` | M1 | Folder-browser directory listing (§3.6) |
| `PUT /api/prefs` | M2 | Persist UI preferences (view + density) |
| `GET /api/sessions/{id}/pane` | M4 | Last captured pane screen (§3.4) — display source only |
| `POST /api/sessions/{id}/resume` | M4 | `claude --resume` a dead session in a fresh pane (§3.5) |
| `POST /api/sessions/{id}/end` | M4 | Kill a live session's tmux session (§3.7) |
| `DELETE /api/sessions/{id}` | M4 | Remove a session (ends it first if live); broadcasts `sessionRemoved` (§3.8) |

Design rule: **commands travel over HTTP; the WS pushes state one way (server→client)**.
Rationale: idempotency and errors are natural in request/response, the E2E harness can
drive every action without a socket, and the WS stays a pure ordered event stream. The
only client→server WS traffic in v1 is terminal input/resize on the terminal sockets (§6).

### 3.1 `POST /api/sessions` (M1)

```jsonc
// request
{
  "directory": "/Users/damian/code/Projects/muster",  // required, absolute
  "title": "flaky-e2e-hunt",                          // optional → `claude --name`
  "model": "opus",                                     // required; passed to `--model` verbatim — any non-empty string (UI offers sonnet/opus/haiku presets + free-text override)
  "permissionMode": "acceptEdits"                      // required: "default" | "plan" | "acceptEdits" — seeds the latch (§7.3)
}
// response: 201 + the Session object (§5.3), state "started"
```

Side effects (ux-flows §1.3): upsert `repo` row; create the tmux window on the `muster`
socket with `MUSTER_SESSION` set in the pane environment (§4.2); ensure the directory's
`.claude/settings.local.json` (gitignored by Claude Code — measured, §4.2) registers
Muster's hooks/status-line/ingest URLs;
insert the session row and broadcast `sessionUpsert` **immediately** — before any hook
arrives, because the first hook may be a long way off (trust prompt, ux-flows §1.4).
Errors: `400 invalid_request` (missing/relative directory; empty/unknown
`permissionMode`; empty `model`; directory that does not exist or is not a directory),
`500 launch_failed` (tmux/spawn failure, message carries stderr; also a
`settings.local.json` that exists but is not valid JSON — Muster refuses to guess at
merging into a corrupt file, and the error message names the file).

### 3.2 `GET /api/repos` (M1)

`200` → array ordered `pinned DESC, lastLaunchedAt DESC` (ux-flows §1.1):

```jsonc
[{ "id": 3, "path": "/Users/damian/code/Projects/muster", "name": "muster",
   "isGit": true, "branch": "main",            // branch read at request time; null when !isGit
   "pinned": false, "lastLaunchedAt": "2026-08-20T08:01:00Z", "launchCount": 12,
   "lastModel": "opus",                        // model value of the last launch here; null before any
   "lastPermissionMode": "acceptEdits" }]      // starting mode of the last launch here; null likewise
```

`lastModel`/`lastPermissionMode` are the per-directory launch defaults (ux-flows §1.2
"Model and Start in default to whatever was used last, per directory").

Browse… navigates via `GET /api/browse` (§3.6). The earlier "native chooser" note here
was wrong: browsers deliberately never reveal a picked folder's absolute path, so the
dashboard browses via the daemon instead.

### 3.3 `PUT /api/prefs` (M2)

**Auth**: UI cookie (401 `unauthorized` without it).
**Request** (at least one field; unknown fields ignored):

```jsonc
{ "view": "tiles",       // optional: "focus" | "tiles"
  "density": "3x2" }     // optional: "2x2" | "3x2" — the Tiles grid density
```

→ `204`, no body. Persisted in kv under one JSON key (survives daemon restarts —
ux-flows §3.8) and re-broadcast to all UI sockets as a `prefs` message carrying the
**full** prefs object, which is how a second window stays in sync. Defaults before any
PUT: `{"view":"focus","density":"2x2"}`.
**Errors:** 400 `invalid_request` — body not JSON, no known field present, or a field
value outside its enum.

### 3.4 `GET /api/sessions/{id}/pane` (M4 — m4-reconcile, 2026-08-26; was deferred from M2)

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

### 3.5 `POST /api/sessions/{id}/resume` (M4 — refined by m4-reconcile, 2026-08-26)

No body. Rewrites the directory's `.claude/settings.local.json` (§4.2), then spawns
`claude --resume <claudeSessionId> --model <model.id> [--permission-mode <latched>]` in a
new tmux session named `muster-<id>` (the dead one's name is free again) with the same
pane environment as a launch. The row keeps its Muster `id`; `tmuxTarget`/`tmuxPane` are
the new pane's, `alive:true`, `endedAt:null`, the snapshot is cleared, and a
`sessionUpsert` is broadcast. `state` is **unchanged** until the enveloped
`SessionStart(source:"resume", same session_id)` arrives and lands it in `idle` (§7.3).

`200` + Session object. Errors: `404 unknown_session`; `409 not_resumable` (still alive,
or `claudeSessionId` null); `409 directory_missing` (the directory no longer exists);
`500 launch_failed` (settings write or tmux spawn failed — row unchanged).

### 3.6 `GET /api/browse` (M1)

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

### 3.7 `POST /api/sessions/{id}/end` (M4 — m4-reconcile, 2026-08-26)

No body. Captures a final pane snapshot, then `tmux kill-session -t muster-<id>`, then
nudges the liveness check. Open terminal sockets for the id close `4001 pane_ended`; a
`sessionUpsert` with `alive:false` is broadcast before the response. No other session is
touched. Recoverable: the daemon still holds `claudeSessionId`, so §3.5 can resume it.

`200` + Session object (`alive:false`, `endedAt` set). Errors: `404 unknown_session`;
`409 not_alive`.

### 3.8 `DELETE /api/sessions/{id}` (M4 — m4-reconcile, 2026-08-26)

No body. If the session is alive, the §3.7 End path runs first (its upsert is broadcast);
then the row is deleted and `sessionRemoved` (§5.5) is broadcast. `event` rows keep their
`session_id` (audit trail). A removed session can no longer be resumed from Muster.

`204`. Errors: `404 unknown_session`; `500 end_failed` (alive and the kill failed — the
row is **not** deleted).

## 4. HTTP endpoints — ingest (Claude Code → daemon)

| Method & path | Milestone | Body |
|---|---|---|
| `POST /ingest/{token}/hook` | M0 | One hook payload — **enveloped** (§4.2) from the command wrapper; raw still accepted (canary / legacy) |
| `POST /ingest/{token}/status` | M0 | Enveloped status-line stdin JSON |

- One hook URL for **all** events (`hook_event_name` is in every payload), reached only
  from the generated wrapper script — Muster writes **no** `allowedHttpHookUrls` and no
  `type:"http"` entries (m4-hook-lifetime, 2026-08-27).
- **Return `200` with empty body immediately; process asynchronously.** A slow receiver
  taxes every turn by its timeout, additively per hook (SPEC §6). Hook timeouts Muster
  configures are 1–2 s, never 5. Malformed JSON is still `200` (logged, dropped) — there
  is no value in making Claude Code retry, and 4xx/5xx behaviour is not ours to lean on.
- Bad token → `404` (no oracle for token guessing; it's logged).
- At ingest the daemon assigns a **monotonic per-session `seq`**, persists the event
  (append-only `event` table), then feeds the state machine (§7) in `seq` order. Hook
  payloads carry no timestamp or ordering of their own.
- **Never log payload bodies** anywhere world-readable — they contain prompt text.

### 4.1 Transport facts this design is built on (measured, 2.1.233)

`SessionStart` is silently never delivered over `type:"http"` — it ships as a
`type:"command"` wrapper script that POSTs its stdin. The status line is likewise a
command script POSTing its stdin. Everything else arrives as a plain HTTP hook. Delivery
is best-effort, at-most-once, unordered; design for loss (SPEC §6).

**All hooks are `type:"command"` wrappers** (m4-hook-lifetime, 2026-08-27). Command hooks
see the pane environment on every event (probe 2026-08-27 against 2.1.246: 15/15 events
enveloped across 3 sessions), so every event carries the §4.2 envelope, and the wrapper
exits 0 silently when `$MUSTER_SESSION` is unset or the daemon is unreachable — an
unmanaged session posts nothing and a stopped daemon produces no inline hook errors. The
entries reference the wrapper's *path*, so a port/token rotation rewrites only the scripts
(done at every daemon start), never the settings file. Cost ~50 ms/event vs ~25 ms for
http (measured). The "plain HTTP hook" wording above is historical (M0–M4a).

### 4.2 The envelope — how events bind to a Muster session

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
- **Binding rule** (envelope-authoritative since m4-hook-lifetime, 2026-08-27): every
  event Muster's wrapper posts is enveloped, and the envelope's `musterSession` routes it
  (a stale/unknown value is never trusted — persisted unrouted). The enveloped
  `SessionStart` remains the *normal* binder of `claudeSessionId → session` (and
  confirms/records the tmux target), but any enveloped non-status event whose
  `session_id` differs from the bound one is the "new `session_id` on a known pane" case
  below and is applied as a `/clear` rebind first; an enveloped event on a never-bound
  session binds it without a transition. Rebinding is **monotonic** (decided with Damian 2026-08-28, review of `m4-hook-lifetime`): an enveloped event whose `session_id` is one this session has *already left* — `byClaude[session_id]` already points at this session and it is not the current `claudeSessionId` — is a reordered straggler from the previous conversation (typically the `/clear` pair's own `SessionEnd(reason:"clear")`, since delivery is unordered). It is routed and applied but **never rebinds backwards**; the current binding, context gauge and compaction counter are untouched. Residuals (measured, accepted): if the pane genuinely returns to an earlier conversation via `--resume` and that `SessionStart(source:"resume")` is lost, `claudeSessionId` stays on the newer id until the next bind event — events still route and apply. And INV-1 (§7.3) holds for the *bound* session only: an enveloped event whose `musterSession` is A but whose `session_id` is bound to B rebinds A and moves `byClaude`, leaving B's `claudeSessionId` unattributed — pre-existing on the `KindResumeBind` path, reachable only by posting one conversation under two `MUSTER_SESSION` values.
  Raw (non-enveloped) posts route by `session_id`
  through the existing mapping, never bind, and persist unrouted when unknown — never
  guessed at by `cwd`. Status-line posts never bind or rebind (§7.3, INV-1).
- `/clear` is directly observable (probe 2026-08-20, 2.1.237): the old `session_id` gets
  `SessionEnd` with `reason:"clear"`, then `SessionStart` fires with `source:"clear"` and
  a **new** `session_id` in the same pane. On it: rebind `claudeSessionId`, reset the
  context gauge and compaction counter, state → `started`. Session identity (`id`,
  `tmuxTarget`, title history) is unchanged. A new `session_id` on a known pane without
  `source:"clear"` is treated the same way (loss tolerance).

All of §4.2 is measured, not assumed (probe 2026-08-20, against 2.1.237): command hooks
and the status-line script see both `$TMUX_PANE` and `tmux new-window -e`-injected
variables, headless and interactive. The per-directory config Muster writes is
**`.claude/settings.local.json`** — verified to honor `hooks`, `statusLine` and
`allowedHttpHookUrls` on its own, and gitignored by Claude Code, so the ingest token
never lands in a committable file.

**Command fields are shell command lines** (m4-hook-quoting, 2026-08-25).
`hooks.<Event>[].hooks[].command` and `statusLine.command` are handed to `/bin/sh -c` by
Claude Code (probe 2026-08-25 against 2.1.245, `spikes/FINDINGS.md` addendum: a bare
space-bearing path fails with `/bin/sh: /tmp/muster: No such file or directory` for
`SessionStart` and *silently* for the status line). Muster therefore writes each
wrapper-script path as a **single-quoted shell word** (`'` inside the path escaped as
`'\''`), and recognises its own prior entries in either the quoted or the legacy bare
form when replacing them wholesale. Quoting a space-free path is harmless (measured). The
default macOS data dir (`~/Library/Application Support/Muster`) contains a space, so this
is the production path, not an edge case.

## 5. WebSocket `/ws` — the state stream (M0)

- Auth: cookie on the upgrade request. Ordered, server→client only. Client never sends
  application messages on this socket (pings are the library's business).
- On (re)connect the server sends `hello`, then `snapshot`, then live deltas. There is
  **no replay** — the snapshot is the resync mechanism, mirroring how hook loss is
  handled everywhere else.
- The client reconnects with backoff (one WS client module owns this — conventions). A
  dead socket **is** the "daemon down" signal: the UI switches to the full-width banner
  (ux-flows §3.5) until `hello` arrives again.

Every message: `{"type": "<name>", …}`. Unknown types are ignored.

### 5.1 `hello`

```jsonc
{ "type": "hello", "protocolVersion": 1,
  "daemon": { "version": "0.1.0" },
  "claudeCode": { "pinned": "2.1.233", "installed": "2.1.233", "drift": false } }
```

`drift` mirrors startup drift detection (`docs/claude-code-pin.md`); the masthead shows it.
`claudeCode.installed` is `null` when `claude --version` failed at startup, and `drift`
is `null` iff `installed` is — the client renders that as *unknown* (§1), never as drift.
A `protocolVersion` the client doesn't know → client shows "reload the dashboard".

### 5.2 `snapshot`

```jsonc
{ "type": "snapshot",
  "sessions": [ /* Session objects, §5.3 — order unspecified; the client sorts */ ],
  "usage": { /* Usage object, §5.4 */ },
  "prefs": { "view": "focus", "density": "2x2" } }   // density added M2 (Tiles grid)
```

**Sorting is client-side**, a pure function over Session fields per ux-flows §3.4
(needs-input longest-blocked first → failed most recent → planning → working → started →
idle longest-idle first), unit-tested in Vitest. The daemon never orders for display.

### 5.3 The Session object

Broadcast whole (`sessionUpsert`) on any change — at 3–6 sessions, field-level patching
is complexity with no payoff, and whole-object replacement is naturally loss-tolerant.

```jsonc
{
  "id": 7,
  "title": "flaky-e2e-hunt",        // last known from status-line session_name; launch --name until then; null if none yet
  "state": "working",                // "started"|"planning"|"working"|"needs_input"|"failed"|"idle"
  "stateSince": "2026-08-20T09:15:00Z",
  "alive": true,                     // liveness is ORTHOGONAL to state (§7.5); false = pane gone, card greys out, offers resume
  "endedAt": null,
  "attention": { "reason": "permission", "since": "2026-08-20T09:15:00Z" }, // non-null iff state == "needs_input"; reason "permission"|"idle"
  "failure": { "error": "server_error", "message": "API error ended the turn" }, // non-null iff state == "failed"; error is the RAW token — display it, never switch on it (H2: taxonomy isn't 1:1)
  "directory": "/Users/damian/code/Projects/muster",
  "repo": { "name": "muster", "branch": "feat-e2e", "isWorktree": false },  // null when directory isn't a git checkout
  "model": { "id": "claude-opus-5", "displayName": "Opus 5" },  // launch value until the status line confirms; null if unknown
  "permissionMode": { "value": "plan", "source": "hook" },       // source "seed" (launch flag) | "hook" (a payload carried it); ALWAYS last-known, never authoritative (SPEC §4.5)
  "context": { "usedPct": 42, "totalInputTokens": 84211,
               "windowSize": 200000, "compactions": 2 },          // usedPct/totalInputTokens/windowSize null before first API response → "ctx — unknown"
  "lastActivity": "Fixed the flaky retry; running the suite…",   // truncated last_assistant_message from the closing Stop; null until first Stop
  "claudeSessionId": "3f2a…",       // null until SessionStart binds
  "tmuxTarget": "muster:@4",        // the identity key; exposed for debugging/tests.
                                    //   Sessions launched ≥M2 use "muster-<id>:@<n>" —
                                    //   one tmux session per Muster session (m2-terminal:
                                    //   concurrent live tiles each need their own attach
                                    //   client). Opaque to the UI either way.
  "firstLaunchHere": true,          // boolean, on every Session object — true iff the launch created this directory's repo row
  "createdAt": "2026-08-20T09:11:02Z"
}
```

First-launch honesty (ux-flows §1.4) is derived client-side: `state == "started"` +
`claudeSessionId == null` + (`firstLaunchHere` → "likely waiting on trust prompt", else
after ~10 s → "no signal yet"). `firstLaunchHere` is on every Session object so the
client needn't track repo history.

M1 value semantics (within the nullability rules above):

- `title`: the launch form's title, else `null` (status-line titles are M3).
- `model`: `{id, displayName}` where both carry the launch value verbatim until the
  SessionStart payload's optional model field (a plain model-ID string, sometimes
  absent — measured 2026-08-20) replaces `id`; `displayName` stays the verbatim string
  until M3's status line supplies a real display name.
- `context`: `usedPct`/`totalInputTokens`/`windowSize` always `null` in M1 (gauges are
  M3); `compactions` is live from PreCompact.
- `lastActivity`: the closing Stop's last-assistant-message text, truncated to 200
  chars by the daemon; `null` until a first Stop.
- `alive`/`endedAt`: live from the liveness poll and the SessionEnd hint.

M3 value semantics (m3-gauges, 2026-08-23 — supersede the M1 rules for title/model/context):

- `title`: refreshes from the status line's session name whenever present (early posts
  carry none — last-known stands until then).
- `model`: `id` and `displayName` refresh from the status line's model object whenever
  present; the M1 launch-value rules stand until the first such post.
- `context`: `usedPct`/`totalInputTokens`/`windowSize` are non-null from the session's
  first status post carrying real context data (the daemon adopts the block only when the
  payload's used-percentage is non-null — pre-first-response posts carry null percentages
  with a zero token count, which must stay *unknown*), all-null before it and again after
  `/clear`. The three are always all-null or all-non-null.
- Status posts change **only** these fields, and only when a value actually changed (no
  no-op upserts) — never `state`/`stateSince`/`attention`/`failure`/`alive`/
  `permissionMode`/`compactions` (m3-gauges INV-1; §7.3's "never a state source").

### 5.4 The Usage object & `usage` message

```jsonc
{ "type": "usage", "usage": {
    "fiveHour": { "usedPct": 61.2, "resetsAt": "2026-08-20T11:00:00Z" },  // null until the first post-boot sample → masthead "unknown"
    "sevenDay": { "usedPct": 23.0, "resetsAt": "2026-08-22T06:00:00Z" },  // wire name seven_day; null as above
    "model": { "id": "claude-opus-5", "displayName": "Opus 5" },  // freshest sample's model (M3, masthead readout); null iff buckets null
    "sampledAt": "2026-08-20T09:15:31Z",   // null iff buckets null
    "source": "subscription" } }            // the §9 Q6 seam: "api"/"otel" later
```

Percentages arrive as floats; the client rounds for display. The daemon records a sample
only when bucket values or model **changed** — `sampledAt` advancing alone is not a
change — so the measured ~435 ms pair posts (identical values) produce one `usage`
broadcast and one `usage_sample` row, not two. **No hydration**: after a daemon restart
the buckets are null until the next status post (m3-gauges, 2026-08-23) — per-session
context, by contrast, lives on the session row and survives restarts like title/state. A
sample is recorded only from a **routed** status post (valid envelope) carrying both
buckets and the model in the same payload; anything less persists as an event and feeds
nothing.

### 5.5 `sessionUpsert` and `prefs`

```jsonc
{ "type": "sessionUpsert", "session": { /* §5.3 */ } }
{ "type": "prefs", "prefs": { "view": "tiles", "density": "3x2" } }  // M2; full-object echo of PUT /api/prefs
```

```jsonc
{ "type": "sessionRemoved", "id": 7 }   // M4; sent once per DELETE /api/sessions/{id} (§3.8)
```

A client that has never seen `id` ignores it. Startup sweeps (§7.5) send nothing — swept
rows are simply absent from the first `snapshot`. Dead sessions otherwise stay visible
(sorted last, offering Resume/Remove) until removed or swept.

## 6. WebSocket `/ws/terminal/{id}` — the PTY bridge (M2; refined by m2-terminal, 2026-08-23)

One socket per **live** surface, bridged to a daemon-owned PTY running `tmux attach`
against that session's own tmux session (`muster-<id>` — see §5.3's tmuxTarget note).

**Auth**: UI cookie on the upgrade + the §2 Origin check. Pre-upgrade errors (plain HTTP):
401 `unauthorized` (no/invalid cookie), 404 `not_found` (unknown session id),
409 `not_attachable` (session exists but `alive` is false).

Frames:

- **Binary server→client**: raw PTY output bytes (tmux attach stream), verbatim — the
  daemon transforms nothing and chunks only on byte boundaries (multi-byte UTF-8 may
  split across frames; byte order is the only guarantee). xterm.js writes them verbatim;
  the dashboard restyles nothing inside a pane; `scrollback: 0`.
- **Binary client→server**: raw input bytes (keystrokes/paste).
- **Text frames**: JSON control, client→server only (no server→client text frames in M2):
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

## 7. The state machine (M1; specified now because everything above serves it)

Runs inside the daemon per session, fed exclusively by ingested events (in `seq` order),
Muster's own actions (launch/resume), and pane-liveness checks. **Never terminal output.**

### 7.1 Displayed states

`started · planning · working · needs_input · failed · idle` — exactly SPEC §2.1. There
is no "done" (a turn ending is not a task completing) and no "dead" state — liveness is
the orthogonal `alive` flag (§7.5).

### 7.2 Per-session tracked variables

- `state`, `stateSince` — the displayed pair.
- `modeLatch` — last known `permission_mode`, seeded by the launch flag
  (`source:"seed"`), overwritten by any payload carrying the field (`source:"hook"`).
  Events without the field (`SessionStart`, `SessionEnd`, `Notification`, `StopFailure`,
  `PreCompact` — measured) **never reset it**: a session failing in plan mode stays plan.
- `currentPromptId` — from the latest turn-scoped event; `closedPromptIds` — prompts
  closed by a Stop-family event (keeping the last few suffices).
- `compactions`, `context`, `attention`, `failure`, `lastActivity` — as surfaced in §5.3.

### 7.3 Transitions

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
| Turn-activity event (prompt not closed) | Adopt `prompt_id` as current (a new id is a new turn even if `UserPromptSubmit` was lost) → `ACTIVE`; update latch |
| Turn-activity event (prompt already closed) | Straggler from an unordered stream: persist, **no transition** |
| `Notification` `permission_prompt` (prompt not closed) | → `needs_input`, `attention.reason:"permission"` |
| `Notification` `idle_prompt` (prompt not closed) | → `needs_input`, `attention.reason:"idle"` |
| `Notification` — any other `notification_type` | Persist only, no transition (unobserved types stay inert) |
| `PermissionRequest` (prompt not closed) | Corroborates → `needs_input`, reason `"permission"` (v1 never answers it; the terminal prompt races and wins) |
| `Stop` | Close `prompt_id` → `idle`; capture `lastActivity` |
| `StopFailure` | Close `prompt_id` → `failed`; capture raw `error` (`Stop`/`StopFailure` are mutually exclusive per prompt — H2) |
| `PreCompact` | `compactions++`, no transition |
| `SubagentStop` | Persist only |
| `SessionEnd` (`reason:"clear"`) | `/clear` in progress: **not** a death hint — no effect on `alive`; the successor `SessionStart(source:"clear")` follows |
| `SessionEnd` (any other reason) | `alive := false`, `endedAt` set; **state unchanged** (it's a hint — §7.5 is the authority) |
| Status-line post | Title / model / context refresh (§5.3 M3 semantics) + account usage (§5.4), applied outside the state machine; **never a state source** — no effect on any state-machine-owned field (m3-gauges INV-1). Implemented in M3 (M1 persisted and routed status posts, mutating nothing) |
| Unknown `hook_event_name` | Persist + log; inert (forward compatibility) |

`needs_input` exits through the same table: the user answering in the terminal produces
turn-activity (→ `ACTIVE`) or a Stop-family event (→ `idle`/`failed`). Nothing else
clears it — if Muster missed the resolving event, the stale timer *is* the honest signal
(ux-flows §3.5).

### 7.4 Ordering & loss tolerance

Hooks are best-effort, at-most-once, unordered, timestamp-free. Rules, in priority order:

1. Events apply in ingest (`seq`) order — arrival order is the only order there is.
2. A Stop-family event closes its `prompt_id`; later-arriving events for a closed prompt
   never reopen a turn (the one measured hazard: tool events interleaving past a `Stop`).
3. Any turn-scoped event with an unseen `prompt_id` starts that turn — every transition
   into `ACTIVE` self-heals a lost predecessor.
4. Not every turn closes: a killed session emits neither `Stop` nor `StopFailure`
   (H2 probe) — which is why liveness is independent (§7.5), and why the state machine
   must never *wait* for an event to make progress.

The state machine and these guards get exhaustive table-driven unit tests (conventions —
"the logic the whole tool rests on").

### 7.5 Liveness (M1 basic; M4 reconcile — settled by m4-reconcile, 2026-08-26)

`alive` is decided by **tmux pane existence on the muster socket** — polled (~5 s) and
event-nudged (`SessionEnd`, PTY EOF in M2, End in M4). `SessionEnd` is only a hint
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

**Daemon shutdown leaves sessions running** by default — they are meant to outlive a
restart. `musterd -on-exit=ask|leave|kill` (default `ask`): with a TTY on stdin and ≥1
live session, `ask` prompts once ("N live sessions on tmux socket X — kill them? [y/N]",
10 s timeout → No); without a TTY `ask` behaves as `leave`. `kill` (or a `y`) takes a
final snapshot, kills each live session's tmux session and sets its row `alive=0` before
exit — so the next startup sweeps it.

## 8. Milestone map (what each milestone must implement of this contract)

- **M0**: §2 auth (both tokens), `/healthz`, `/auth`, static, `GET /api/state`, `/ws`
  with `hello` + `snapshot` (empty sessions, null usage) + reconnect/banner behaviour,
  both ingest endpoints persisting enveloped/raw events with `seq` (no state machine —
  events land in the `event` table and are visible via `/api/state`'s future shape).
- **M1**: `POST /api/sessions`, `GET /api/repos`, `GET /api/browse`, the state machine
  (§7), `sessionUpsert`, liveness polling, the envelope binding (§4.2).
- **M2**: terminal sockets (§6), `PUT /api/prefs` + `prefs` (view + density).
- **M3**: `usage` message + `usage_sample` persistence + context in `sessionUpsert` +
  title/model refresh from the status line.
- **M4**: `/resume` (§3.5), `/end` (§3.7), `DELETE` + `sessionRemoved` (§3.8, §5.5),
  reconcile-on-start + shutdown policy (§7.5), pane snapshots (§3.4), resume → `idle`
  (§7.3) — plan `m4-reconcile`; canary unskip — plan `m4-canary`.

## 9. Changelog

- **2026-08-28 — §4.2/§7.3: rebinding is monotonic** (plan `m4-hook-lifetime`, review cycle 1
  Critical, Option B chosen by Damian; `plans/m4-hook-lifetime/decisions/monotonic-rebind/`).
  An enveloped event naming a claude id this session has already left (a reordered
  straggler, typically the `/clear` pair's own `SessionEnd(reason:"clear")`) is routed and
  applied but never rebinds backwards or resets the gauge/compaction count. Known
  residuals: a resume-back whose `SessionStart(source:"resume")` is lost keeps a stale
  `claudeSessionId` until the next bind event (state stays correct); and a cross-session id
  collision (one conversation posted under two `MUSTER_SESSION` values) leaves the
  bystander's `claudeSessionId` unattributed in the map — pre-existing on the
  `KindResumeBind` path, not introduced here. No wire change; no version bump.

- **2026-08-27 — §4/§4.1/§4.2/§7.3: all hooks are command wrappers; envelope-authoritative
  binding** (plan `m4-hook-lifetime`). Muster writes one `type:"command"` entry per event
  pointing at `<dataDir>/hook.sh`, no `type:"http"` entries and no `allowedHttpHookUrls`;
  the wrapper exits 0 silently when `$MUSTER_SESSION` is unset or the daemon is down.
  Binding may occur on any enveloped event. Wire shapes on `/ingest/*` unchanged; no
  version bump.

- **2026-08-26 — m4-reconcile plan approved, delta merged.** §3.4 pane snapshot un-deferred
  (capture on every liveness tick, display only); §3.5 resume refined (reuses
  `muster-<id>`, state unchanged until the resume SessionStart, new `directory_missing`);
  new §3.7 `POST …/end` and §3.8 `DELETE /api/sessions/{id}`; §5.5 `sessionRemoved` is
  live; §7.5 settles reconcile (sweep `alive=0` rows at startup; keep newly-found-dead
  rows one lifetime) and the shutdown policy (`-on-exit`, default survive). §7.3's
  `source:"resume"` → `idle` row was already the contract — the code lands in `started`
  today and the plan fixes it. All additive; no version bump.

- **2026-08-25 — m4-hook-quoting plan approved, doc-only delta merged.** §4.2 records that
  `hooks[].command` / `statusLine.command` are `/bin/sh -c` command lines and that Muster
  single-quotes the wrapper-script paths it writes (recognising quoted and legacy bare
  forms on replace). No wire-shape change; no version bump.

- **2026-08-20 — v1 written** (M0 kickoff). Decisions made here, beyond what SPEC/ux-flows
  already fixed: commands-over-HTTP / push-only state WS; two tokens (UI cookie exchange,
  ingest URL token); single hook ingest URL with the envelope + `MUSTER_SESSION`/`TMUX_PANE`
  binding; raw events route by `session_id`, never guessed by `cwd`; whole-object
  `sessionUpsert`; client-side sorting; liveness as an orthogonal `alive` flag rather than
  a seventh state; resume lands in `idle`; `/clear` resets gauge+compactions but not
  identity; prompt-close guards for unordered streams; terminal-socket takeover with close
  code 4000. Open verifications noted in §4.2 (wrapper env visibility; `/clear`'s
  `SessionStart.source`).
- **2026-08-20 — §5.1 nullability clarified** (m0-skeleton plan approval): `hello`'s
  `claudeCode.installed`/`drift` are `null` when the startup version check fails —
  rendered as *unknown*, not drift. Additive; no version bump.
- **2026-08-20 — §4.2 verified and corrected** (interface probe, against 2.1.237 — the
  installed binary had drifted past the 2.1.233 pin). Envelope env inheritance confirmed;
  config file settled as `.claude/settings.local.json`; `/clear` observed as
  `SessionEnd(reason:"clear")` → `SessionStart(source:"clear")` with a new `session_id`,
  so §7.3 gained a `source:"clear"` fast path and exempted `reason:"clear"` from the
  death-hint rule.
- **2026-08-22 — m1-sessions plan approved, delta merged.** New `GET /api/browse` (§3.6)
  replaces §3.2's "native chooser" note (wrong: browsers never reveal a picked folder's
  absolute path). `GET /api/repos` elements gain nullable `lastModel`/
  `lastPermissionMode` (per-directory launch defaults). `POST /api/sessions` error
  coverage clarified (400 for bad mode/model/directory; 500 for a corrupt
  `settings.local.json`); `model` accepts any non-empty string. Session objects gain
  `firstLaunchHere` (boolean, every object) and M1 value semantics are noted in §5.3.
  §7.3's status-line row is scoped to M3 (M1 persists and routes status posts, mutates
  nothing); §8's M1 row gains `/api/browse`, M3 gains the title/model refresh. All
  additive; no version bump.
- **2026-08-23 — m2-terminal plan approved, delta merged.** §6 refined: upgrade auth +
  pre-upgrade errors (401/404/409 `not_attachable`), resize clamps and the
  initial-resize rule, close codes `4000 superseded` / `4001 pane_ended` (EOF also
  nudges liveness), no server→client text frames. §3.3 `PUT /api/prefs` gains `density`
  ("2x2"|"3x2"), partial bodies, and the full-object `prefs` echo; `snapshot.prefs`
  gains `density`. §3.4 pane snapshots **deferred to M4** (mockup cards are
  metadata-only; the dead-session use case belongs with resume). §5.3 notes the new
  tmuxTarget format `muster-<id>:@<n>` — one tmux session per Muster session, because
  concurrent live tiles each need their own attach client. All additive; no version
  bump.
- **2026-08-23 — m3-gauges plan approved, delta merged.** §5.4 Usage gains nullable
  `model` (freshest sample's; masthead readout) and precise semantics: record/broadcast
  only on bucket-value or model change (collapses the ~435 ms pair posts), no hydration
  across daemon restart (buckets null until the next post), samples only from routed
  posts carrying buckets + model together. §5.3 gains M3 value semantics (title/model
  refresh whenever the status post carries them; context adopted only when the payload's
  used-percentage is non-null, all-or-nothing, reset by `/clear`; status posts mutate
  nothing state-owned — INV-1). §7.3's status-line row resolved accordingly. All
  additive; no version bump.
- **2026-08-22 — §3.6 gains the browse root** (M1 review follow-up, user-approved):
  `musterd -browse-root` (empty = the user's home directory) is `GET /api/browse`'s
  no-param default and the "Up" ceiling (`parent` null there); explicit absolute paths
  outside it remain browsable. Motivation: the E2E harness had to create scratch
  directories under the real `$HOME` to drive the Browse… flow. Additive; no version
  bump.
