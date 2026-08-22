# Plan: m1-sessions

**Created**: 2026-08-22
**Status**: completed
**Approved**: 2026-08-22
**Completed**: 2026-08-22 (review approved after 3 cycles)
**Work Type**: full-stack
**Description**: M1 — sessions exist: launch `claude` into tmux from the dashboard, bind ingested events to Muster sessions via the envelope, run the §7 state machine, and render the Focus-view session rail.

## Overview

M1 implements the M1 row of `docs/protocol.md` §8. The daemon gains `POST /api/sessions`
(spawn `claude` in a new tmux window on the muster socket, with the session-binding
environment set), `GET /api/repos` (the MRU directory list), `GET /api/browse` (the
folder-browser backend — new in this plan; the "native chooser" line in protocol §3.2 was
wrong, browsers never reveal absolute paths), the envelope binding that maps Claude's
`session_id` to a Muster session, the §7 state machine fed by ingested events in `seq`
order, `sessionUpsert` broadcasting, and basic liveness polling. The web dashboard gains
the launch modal (MRU picker + folder browser + title + model + starting permission mode)
and the Focus-view session rail (state stripe, title, badge, time-in-state, repo/branch,
blocked-longest-first sort, degraded states), with the masthead's view-switcher slot laid
out but empty (Tiles is M2) and the main area a placeholder panel (terminal panes are M2).

Scope lines drawn with Damian during planning: status-line posts keep being persisted and
routed but update **no** session fields in M1 — titles and model refresh from the status
line move to M3, so an untitled session renders "untitled" until then. Worktree
recognition is stored as columns on the session row (`branch`, `is_worktree`); the
`worktree` table waits for the milestone that manages worktrees (SPEC §4.2), per the M0
schema-minimalism precedent. No pin UI (the `pinned` column and sort order exist; ux-flows
§1.1 says add the control only if the MRU list annoys). Resume is M4; a dead session
greys out and offers nothing yet — this deferral includes §7.3's
`SessionStart (source:"resume")` row (`alive := true` → `idle`): nothing in M1 revives a
dead session, which is why D10's reachable-row list omits resume (made explicit during
review cycle 2, 2026-08-22).

## Requirements

### Must Have
- [x] REQ-1: `POST /api/sessions` launches `claude` in a new tmux window on the
      configured muster socket, with `MUSTER_SESSION=<session id>` set in the pane
      environment, and returns `201` + the Session object in state `started`.
- [x] REQ-2: The session row is inserted and `sessionUpsert` broadcast **before** any
      hook can arrive (protocol §3.1 — the first hook may be a long way off).
- [x] REQ-3: Launch upserts the `repo` row: `last_launched_at`, `launch_count`++,
      `last_model`, `last_permission_mode`; creates it (with git detection) when absent.
- [x] REQ-4: Launch ensures `<dir>/.claude/settings.local.json` registers Muster's hook,
      status-line and allowed-URL config via a deterministic, idempotent JSON merge that
      preserves all keys Muster does not own (probe-verified scope, canary-fields
      "Configuration that must keep working").
- [x] REQ-5: `GET /api/repos` returns the MRU list ordered `pinned DESC,
      lastLaunchedAt DESC`, with branch read at request time and per-repo launch
      defaults (`lastModel`, `lastPermissionMode`).
- [x] REQ-6: `GET /api/browse` lists a directory's subdirectories so the launch modal
      can navigate to a directory not yet in the MRU list.
- [x] REQ-7: The enveloped SessionStart (its `musterSession` value from the pane
      environment) binds `claudeSessionId → session`; every subsequent raw hook routes
      through that binding by its Claude session id. A raw event whose Claude session id
      is unknown persists unrouted (`event.session_id` NULL) and is logged — never
      guessed by `cwd`.
- [x] REQ-8: The state machine implements protocol §7 exactly: displayed states
      `started · planning · working · needs_input · failed · idle`, the §7.3 transition
      table, and the §7.4 ordering guards (events apply in `seq` order; a Stop-family
      event closes its prompt id; closed prompts never reopen; an unseen prompt id
      starts a turn).
- [x] REQ-9: `permission_mode` latches forward: seeded by the launch flag
      (`source:"seed"`), overwritten by any payload carrying the field
      (`source:"hook"`), never reset by events that lack it (field inventory:
      spikes/canary-fields.md — most events carry none).
- [x] REQ-10: `/clear` handling per protocol §4.2/§7.3: SessionEnd with reason `clear`
      is not a death hint; SessionStart with source `clear` (or any new Claude session
      id on a known pane) rebinds, resets compactions, → `started`; Muster identity
      (`id`, `tmuxTarget`, title) unchanged.
- [x] REQ-11: Liveness: a ~5 s tmux pane-existence poll on the muster socket sets
      `alive:false` + `endedAt` when the pane is gone; SessionEnd (reason ≠ `clear`) is
      an immediate hint doing the same; state is never changed by liveness.
- [x] REQ-12: Every session change broadcasts a whole-object `sessionUpsert`; the WS
      `snapshot` and `GET /api/state` carry the full session list.
- [x] REQ-13: Status-line posts are persisted and routed to their session but mutate no
      session fields in M1 (title/model refresh from the status line is M3).
- [x] REQ-14: Launch modal: MRU list, folder browser, optional title, model radios
      (sonnet / opus / haiku) + free-text override, starting permission mode radios,
      per-directory defaults prefilled, errors shown inline.
- [x] REQ-15: Focus view: attention-sorted rail of session cards (3 px state stripe,
      title or "untitled", state badge, time-in-state, repo / branch with worktree
      marker, context row rendered as unknown, attention/failure note), placeholder
      main panel, masthead with an empty view-switcher slot.
- [x] REQ-16: Client-side sort as a pure, unit-tested function: needs_input
      (longest-blocked first) → failed (most recent first) → planning → working →
      started → idle (longest-idle first).
- [x] REQ-17: First-launch honesty (ux-flows §1.4): `state == "started"` +
      `claudeSessionId == null` + `firstLaunchHere` → "first launch here — likely
      waiting on Claude Code's trust prompt"; otherwise after ~10 s → "no signal yet".
      Text only in M1 (the Focus-pane action needs M2's terminal).
- [x] REQ-18: Degraded states: dead session greys out keeping its last state; daemon
      down shows the banner over the stale rail; time-in-state is the staleness signal.
- [x] REQ-19: `musterd` gains `-claude-bin` (default `claude`) and `-tmux-socket`
      (default `muster`) flags so E2E can launch a stub binary on a per-run socket.

### Should Have
- [x] REQ-20: The spawned process gets `LANG`/`LC_ALL` set (a Go-daemon child inherits
      none; the failure presents as a broken terminal bridge in M2 — cheap to do now).
- [x] REQ-21: PreCompact increments the session's compaction counter (`⟳n` in the
      context row), no state transition.

### Nice to Have
- [x] REQ-22: ⌘N opens the launch modal (ux-flows keyboard model).

## Protocol Contract

Delta against `docs/protocol.md` (merged there on approval). M1 otherwise implements
§3.1, §3.2, §4.2, §5.3, §5.5 and §7 as already written — those are not restated here.

### HTTP: GET /api/browse (new endpoint, M1)

**Auth**: UI cookie (401 `unauthorized` without it).
**Request:** query param `path` — absolute directory path; omitted → the daemon user's
home directory.
**Response 200:**
```jsonc
{
  "path": "/Users/damian/code",          // the directory listed (absolute, cleaned)
  "parent": "/Users/damian",             // null at filesystem root
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

Replaces §3.2's "Browse… uses no endpoint — the native chooser feeds the chosen path"
note, which was wrong: browsers deliberately never reveal a picked folder's absolute
path, so the dashboard browses via the daemon instead.

### HTTP: GET /api/repos (M1 — additive fields)

Each element gains two nullable fields, the per-directory launch defaults
(ux-flows §1.2 "Model and Start in default to whatever was used last, per directory"):

```jsonc
{ "lastModel": "opus",                 // model value of the last launch here; null before any
  "lastPermissionMode": "acceptEdits" }// starting mode of the last launch here; null likewise
```

### HTTP: POST /api/sessions (M1 — clarifications, no shape change)

- `model` is passed to the CLI verbatim; the UI offers sonnet/opus/haiku presets plus a
  free-text override, but the API accepts any non-empty string.
- `400 invalid_request` also covers: empty/unknown `permissionMode`, empty `model`,
  directory that does not exist or is not a directory.
- `500 launch_failed` additionally covers a `settings.local.json` that exists but is not
  valid JSON — Muster refuses to guess at merging into a corrupt file; the error message
  names the file.

### WS: daemon→UI `sessionUpsert` / `snapshot` (M1 — Session field notes)

`sessionUpsert` and non-empty `snapshot.sessions` are sent for the first time (shapes
already in §5.3/§5.5). Formalized/added:

```jsonc
{ "firstLaunchHere": true }   // boolean, on every Session object — true iff the launch
                              // created this directory's repo row (drives the
                              // trust-prompt honesty note client-side)
```

M1 value semantics (all within §5.3's existing nullability rules):

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

### §7.3 status-line row (M1 — scope note)

The "Status-line post → Title / model / context / usage refresh" row is implemented in
M3, not M1 (planning decision 2026-08-22): M1 persists and routes status posts, and
mutates nothing. §8's M3 row gains "title/model refresh from the status line".

### §8 milestone map (M1 row)

M1 row gains `GET /api/browse`.

## Schema Changes

Migration `internal/store/migrations/0002_sessions.sql` (forward-only). All times
RFC3339 UTC text.

```sql
CREATE TABLE repo (
  id                   INTEGER PRIMARY KEY,
  path                 TEXT    NOT NULL UNIQUE,  -- absolute directory launched into
  name                 TEXT    NOT NULL,          -- basename(path)
  is_git               INTEGER NOT NULL DEFAULT 0,
  pinned               INTEGER NOT NULL DEFAULT 0, -- no UI yet; ordering honors it
  last_launched_at     TEXT    NOT NULL,
  launch_count         INTEGER NOT NULL DEFAULT 0,
  last_model           TEXT,                      -- per-directory launch defaults
  last_permission_mode TEXT,
  created_at           TEXT    NOT NULL
) STRICT;

CREATE TABLE session (
  id                     INTEGER PRIMARY KEY,
  tmux_target            TEXT    NOT NULL,  -- the identity key (no UNIQUE: tmux window
                                            -- ids restart with the tmux server, so a
                                            -- dead session's target can be re-minted;
                                            -- uniqueness among alive sessions is code's)
  tmux_pane              TEXT,              -- pane id at spawn; envelope corroboration
  claude_session_id      TEXT,              -- mutable attribute, never identity
  repo_id                INTEGER NOT NULL REFERENCES repo(id),
  directory              TEXT    NOT NULL,
  branch                 TEXT,              -- captured at launch; null when not git
  is_worktree            INTEGER NOT NULL DEFAULT 0, -- linked-worktree recognition
  title                  TEXT,              -- launch --name value; null otherwise (M3
                                            -- takes over from the status line)
  state                  TEXT    NOT NULL,  -- started|planning|working|needs_input|failed|idle
  state_since            TEXT    NOT NULL,
  permission_mode        TEXT    NOT NULL,  -- the latch value
  permission_mode_source TEXT    NOT NULL,  -- 'seed' | 'hook'
  model                  TEXT,              -- launch value, replaced by SessionStart's
  compactions            INTEGER NOT NULL DEFAULT 0,
  attention_reason       TEXT,              -- 'permission'|'idle'; non-null iff needs_input
  attention_since        TEXT,
  failure_error          TEXT,              -- raw token; non-null iff failed
  failure_message        TEXT,
  last_activity          TEXT,
  alive                  INTEGER NOT NULL DEFAULT 1,
  ended_at               TEXT,
  first_launch_here      INTEGER NOT NULL DEFAULT 0,
  created_at             TEXT    NOT NULL
) STRICT;

ALTER TABLE event ADD COLUMN session_id INTEGER;  -- Muster session id once routed;
                                                  -- NULL = unrouted (or pre-M1 rows)
CREATE INDEX idx_event_session_id ON event(session_id);
```

Prompt-close tracking (`currentPromptId`, the closed-prompt set) is in-memory only,
bounded to the last 8 closed ids per session; a daemon restart resets the guards, which
is an accepted M1 edge (M4's reconcile revisits restart behaviour). Don't test SQLite's
own constraint enforcement.

## The state machine — implementation shape

Protocol §7 is the specification; this section only fixes *where the pieces live* so the
CLAUDE.md boundary holds:

- `internal/claudecode` gains an **interpreter**: it takes a persisted event (type +
  payload) and returns a neutral `StateInput` — an enum of Muster's own vocabulary
  (`Bind`, `ClearRebind`, `TurnActivity`, `NeedsInputPermission`, `NeedsInputIdle`,
  `TurnClosed`, `TurnFailed`, `Compaction`, `DeathHint`, `ClearDeathHint`, `Inert`) plus
  neutral fields (prompt id, permission mode, model, failure token/message, activity
  text). Every payload key name and event-name value is read **only** here; the exact
  key inventory is `spikes/canary-fields.md`, which daemon-impl consults directly
  rather than this plan repeating it.
- `internal/session` holds the manager and the state machine, operating purely on
  `StateInput` values — it contains no Claude Code payload vocabulary at all. This is
  what makes the exhaustive table-driven unit tests (conventions: "the logic the whole
  tool rests on") wire-format-free.
- The M0 single ingest worker keeps its role: parse → persist (with routing) → feed the
  manager, sequentially, so `seq` order and apply order are the same thing by
  construction.
- The manager persists each session mutation and hands the fresh Session object to the
  WS hub for `sessionUpsert` fanout (slow/stuck clients are dropped, never block the
  worker).

## UI Specifications

Design authority: `docs/design/design-system.md` (tokens, type roles, state colours,
honesty rules — binding) with `mockups/a-instrument.html` as the reference render.

### Views

- **Masthead** (existing, extended): brand, then the **view-switcher slot** — an empty
  container laid out at the switcher's final size (design-system §8: adding Tiles in M2
  must move nothing) — then the existing right-aligned readouts.
- **Rail** (left column): "New session" button in the rail header, then the sorted
  session cards. Card anatomy per design-system §5: 3 px state stripe; title (or
  "untitled") + state badge + time-in-state timer; `repo / branch` line (worktree marker
  when `repo.isWorktree`; directory basename when `repo` is null); context row
  `ctx unknown ⟳n` with **no gauge track drawn** (honesty rule 1 — context data is M3);
  an amber-left-border note when attention is non-null ("needs your permission" /
  "waiting for your input" + since-timer), a failure note when failed (raw error token
  verbatim + the human message — never switched on, honesty rule 4), the trust-prompt /
  no-signal note per REQ-17, and "ended" treatment (greyed, `--dim`) when `alive` is
  false.
- **Main panel**: placeholder on `--term` ground — mono note "terminal panes arrive in
  M2". No selection behaviour in M1 (click-to-focus lands with the terminal).
- **Launch modal**: native `<dialog>`, design-system §5 modal treatment. Contents:
  - MRU list (from `GET /api/repos`): one button per directory — name, path, branch or
    `—`, relative last-launch age. Clicking selects it as the launch directory.
  - "Browse…" button revealing the folder browser: current path, "Up" button,
    subdirectory buttons (from `GET /api/browse`, git checkouts marked), "Use this
    folder" button selecting the current path.
  - Form: selected directory (read-only display), Title (optional text), Model radios
    `sonnet · opus · haiku · other` + a "Custom model" text input shown when `other` is
    selected, "Start in" radios `Claude Code default · plan mode · auto-accept`,
    Launch (the surface's single filled-amber primary action) and Cancel.
  - Selecting an MRU directory prefills Model/Start-in from `lastModel`/
    `lastPermissionMode` (falling back to sonnet / Claude Code default).
  - A launch error renders inline in the modal footer (the daemon's `error.message`);
    the modal stays open.

### User Flows

1. **Launch, known directory**: New session → modal opens with MRU list → click a
   directory (defaults prefill) → optionally title/model/mode → Launch → modal closes →
   card appears immediately in `started` (REQ-2) → synthesized/real hooks drive it
   through the states.
2. **Launch, new directory**: New session → Browse… → navigate (Up / subdirectory
   buttons) → Use this folder → form as above → Launch. Card shows the trust-prompt
   note (REQ-17) because `firstLaunchHere` is true.
3. **Answering a blocked session** happens in the terminal (M2 brings it into the
   dashboard); the card's exit from `needs_input` arrives via the resolving hook.

### States

- **No data yet**: empty rail renders "No sessions yet" (existing behaviour); every
  unknown per-session datum renders the word "unknown" (context row) — never an empty
  gauge; a session with no title renders "untitled".
- **Data**: as specified above; timers tick client-side (1 s interval over a pure
  formatting function).
- **Daemon down**: existing banner over the **stale rail** (cards keep rendering their
  last-known data; time-in-state keeps counting — the honest staleness signal). On
  reconnect the fresh `snapshot` replaces the whole session store.

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| New session button | `button` | `New session` | rail header |
| Launch modal | `dialog` | `New session` | native `<dialog>` + `aria-labelledby` its heading |
| MRU directory entry | `button` | contains the directory basename | one per repo row |
| Browse… button | `button` | `Browse…` | reveals the folder browser |
| Up button | `button` | `Up` | folder browser |
| Subdirectory entry | `button` | the directory's name | folder browser |
| Use this folder | `button` | `Use this folder` | folder browser |
| Current browse path | — | the absolute path text | e2e-specs picks the locator |
| Title input | `textbox` | `Title` | `<input>` + `<label>` |
| Model radios | `radio` | `sonnet` / `opus` / `haiku` / `other` | native radio inputs |
| Custom model input | `textbox` | `Custom model` | visible only when `other` selected |
| Start-in radios | `radio` | `Claude Code default` / `plan mode` / `auto-accept` | native radio inputs |
| Launch button | `button` | `Launch` | primary action |
| Cancel button | `button` | `Cancel` | closes modal |
| Launch error line | — | daemon `error.message` text | inline in modal |
| Session card | — | contains the title (or `untitled`) | locator strategy is e2e-specs' call |
| State badge | — | `started` / `planning` / `working` / `needs input` / `failed` / `idle` | lowercase in DOM; CSS may uppercase |
| Context row | — | `/ctx\s+unknown/` | no gauge track drawn |
| Trust-prompt note | — | `/first launch here/` | REQ-17 |
| No-signal note | — | `/no signal yet/` | REQ-17, after ~10 s |
| Failure note | — | contains the raw error token | REQ-15 |
| View-switcher slot | — | (empty) | present in DOM, no content in M1 |

## Affected Files

### Daemon
- `internal/store/migrations/0002_sessions.sql` — new: `repo`, `session`, `event.session_id`.
- `internal/store/store.go` (+ new `repo.go`, `session.go` in the package) — repo
  upsert/list, session insert/update/load-all, `InsertEvent` gains the routed session id.
- `internal/claudecode/launch.go` — new: CLI argv construction (model/name/permission-mode
  flags), binary name seam for `-claude-bin`.
- `internal/claudecode/settings.go` — new: `settings.local.json` deterministic merge;
  generation of the two command wrapper scripts (SessionStart + status line) into the
  daemon data dir; the hook/status/allowed-URL config shapes.
- `internal/claudecode/interpret.go` — new: event → neutral `StateInput` (the only
  reader of payload keys; inventory per `spikes/canary-fields.md`).
- `internal/claudecode/claudecodetest/claudecodetest.go` — extend: wire-body builders
  for every event type the state machine consumes, enveloped and raw, so tests outside
  the package never hand-roll wire strings (M0 review lesson).
- `internal/tmux/tmux.go` — new package: muster-socket ops (`ensure server/session`,
  `new-window` with env + cwd, pane-existence check, kill helpers for tests). Always a
  dedicated socket; never the user's default server.
- `internal/session/manager.go`, `internal/session/machine.go` — new package: in-memory
  session registry keyed by tmux target, the §7 state machine over `StateInput`,
  persistence, upsert emission, the ~5 s liveness poll (ctx-aware).
- `internal/server/sessions.go` — new: `POST /api/sessions` handler (decode → delegate
  to a launcher that composes store+tmux+claudecode+manager → encode).
- `internal/server/repos.go` — new: `GET /api/repos` (branch read at request time).
- `internal/server/browse.go` — new: `GET /api/browse`.
- `internal/server/ingest.go` — worker feeds routing + the manager after persisting.
- `internal/server/ws.go` — hub gains `broadcast` (non-blocking per-client sends).
- `internal/server/state.go` — snapshot sourced from the manager.
- `internal/server/server.go` — route wiring, manager/launcher in `Config`.
- `cmd/musterd/main.go` — `-claude-bin`, `-tmux-socket` flags; construct tmux/manager/
  launcher; start/stop the poll loop gracefully.

### Web
- `web/index.html` — layout: masthead switcher slot, rail (`New session` button +
  cards container), placeholder main panel, launch `<dialog>` / `<template>` elements.
- `web/src/style.css` — design-system §1 tokens (complete set), rail card, badge,
  stripe, modal, placeholder styles.
- `web/src/protocol.ts` — full §5.3 Session validation (replacing the M0 trust-the-array
  stopgap), `firstLaunchHere`, `sessionUpsert` message type.
- `web/src/ws.ts` — `onSessionUpsert` callback.
- `web/src/api.ts` — new: cookie-authed fetch wrappers for `POST /api/sessions`,
  `GET /api/repos`, `GET /api/browse` (+ the error-envelope decoder).
- `web/src/sessions/store.ts` — new: session map (snapshot replace + upsert merge).
- `web/src/sessions/sort.ts` — new: the pure sort function (REQ-16) with explicit
  tiebreaks (planning/working/started: `stateSince` ascending, then `id`).
- `web/src/sessions/format.ts` — new: time-in-state / relative-age formatters.
- `web/src/render/sessions.ts` — real rail cards (replaces the M0 count stub).
- `web/src/render/launch.ts` — new: modal render + form logic + folder browser.
- `web/src/render/masthead.ts` — switcher slot.
- `web/src/main.ts` — wire modal, store, upserts, 1 s timer tick.

### E2E (specs owned by e2e-specs; config files below stay with their impl owner)
- `web/e2e/launch.spec.ts`, `web/e2e/sessions.spec.ts` — new suites (flows in
  Acceptance Criteria).
- `web/e2e/helpers/daemon.ts` — pass `-claude-bin` (a stub script the harness writes:
  `#!/bin/sh` + a long sleep) and a per-run `-tmux-socket`; kill that tmux server in
  teardown. **No real `claude` is ever launched by E2E.**
- `web/e2e/helpers/payloads.ts` — enveloped/raw bodies for the M1 event set
  (SessionStart with each source value, turn-activity, Notification both types, Stop,
  StopFailure, SessionEnd with/without reason clear, PreCompact), mirroring
  `claudecodetest`'s builders.
- `web/playwright.config.ts` — **owned by web-impl**; no change is expected, but if one
  becomes necessary it lands there via web-impl, never via e2e-specs.

## Edge Cases

1. **Hook loss**: any turn-activity with an unseen prompt id opens the turn (self-heals
   a lost first event); a session whose closing event was lost sits in its last active
   state with a growing timer — the honest signal (no timeout-based auto-idle).
2. **Reordering/stragglers**: events for an already-closed prompt id persist but cause
   no transition (the measured hazard: tool events interleaving past a Stop).
3. **Duplicate delivery**: reapplying an event to the same state is a no-op transition
   (`stateSince` only changes when the state actually changes).
4. **`/clear`**: per REQ-10. The successor SessionStart still carries the envelope
   (same pane, same environment), so rebinding uses `musterSession`, not guesswork.
5. **New Claude session id on a known pane without a clear source**: treated as
   `/clear` (protocol §4.2 loss tolerance).
6. **Pane dies without SessionEnd** (`kill -9`): the poll catches it within ~5–10 s;
   the card greys, state and timer freeze at last-known.
7. **Daemon restart mid-session**: sessions reload from SQLite with their persisted
   state; prompt-close guards reset (accepted; M4's reconcile owns restart semantics);
   the liveness poll immediately re-evaluates `alive`.
8. **Launch failure** (tmux spawn error, directory vanished between checks): no session
   row remains (insert → spawn → on failure delete the row), `500 launch_failed` with
   stderr in the message; the modal shows it inline.
9. **Existing `settings.local.json`**: user keys preserved verbatim; Muster's entries
   are recognizable (they reference the daemon's ingest URL / script paths) and are
   replaced wholesale on every launch, so port/token changes heal themselves. A file
   that exists but isn't valid JSON refuses the launch (`launch_failed`) rather than
   guessing.
10. **Nonsense free-text model**: `claude` exits at startup; no hooks ever arrive; the
    poll marks the session dead in `started` — honest, no special case.
11. **Raw event for an unknown Claude session id** (e.g. daemon missed the enveloped
    SessionStart): persisted with NULL `event.session_id`, logged; no retroactive
    re-routing in M1.
12. **Enveloped event whose `musterSession` doesn't match any live session** (stale env
    after manual pane surgery): persisted unrouted and logged — never bound.
13. **Two sessions in the same directory**: fully supported; routing is by the envelope
    and the session-id map, never by `cwd`.
14. **Browse into an unreadable/removed directory**: `404 not_found`; the browser UI
    shows the error and stays where it was.

## Acceptance Criteria

IDs are unique across the whole section — `D*` daemon, `W*` web, `E*` e2e. One clause
per criterion.

### Daemon
- **D1**: `go build ./...` passes.
- **D2**: `make check` (lint + unit) passes.
- **D3**: no Claude Code payload key names appear outside `internal/claudecode/`
  (checked via the negative grep below; test files are **in scope** — tests obtain
  wire-shaped bodies from `internal/claudecode/claudecodetest`, never by hand-rolling
  or splitting literals).
- **D4**: `POST /api/sessions` creates a tmux window on the configured socket with the
  Muster session id in the pane environment.
- **D5**: the launch response is `201` with a Session object in state `started`, and a
  matching `sessionUpsert` reaches connected WS clients before any hook is ingested.
- **D6**: launching twice into one directory yields one `repo` row with
  `launch_count == 2` and updated defaults.
- **D7**: launch writes/merges `<dir>/.claude/settings.local.json` idempotently,
  preserving keys it does not own (unit-tested merge; second launch produces identical
  content).
- **D8**: an enveloped SessionStart binds the Claude session id, and a subsequent raw
  hook for that id routes to the session (`event.session_id` populated).
- **D9**: a raw event with an unknown Claude session id persists with NULL
  `event.session_id` and triggers a log line, with no state effect.
- **D10**: the state machine passes exhaustive table-driven unit tests covering every
  §7.3 row reachable in M1 (bind, clear-rebind, turn-activity, both needs_input
  notifications, permission-request corroboration, turn-closed, turn-failed,
  compaction, both death-hint variants, inert/unknown inputs).
- **D11**: a turn-activity input for an already-closed prompt id causes no transition.
- **D12**: a turn-activity input with an unseen prompt id enters ACTIVE even when no
  prompt-submitted input was ever seen.
- **D13**: inputs lacking a permission mode never change the latch (a session failing
  in plan mode stays `planning`-latched, state `failed`).
- **D14**: clear-rebind keeps `id`/`tmuxTarget`/`title`, rebinds the Claude session id,
  resets compactions, and sets state `started`.
- **D15**: a SessionEnd-family death hint with reason clear leaves `alive` true; any
  other sets `alive` false and `endedAt`, leaving `state` unchanged.
- **D16**: killing the tmux window flips `alive` to false via the poll within 10 s.
- **D17**: status-line posts persist and route but change no session fields.
- **D18**: no ingest payload body is ever logged (review + existing M0 discipline).
- **D19**: `GET /api/browse` returns subdirectories with `parent`/`isGit` per contract
  and the specified 400/404 errors.
- **D20**: `GET /api/repos` orders `pinned DESC, lastLaunchedAt DESC` and reads
  `branch` at request time.

### Web
- **W1**: `make web-build` passes (strict TS).
- **W2**: `make web-test` passes.
- **W3**: no `any` types in new web code.
- **W4**: the launch modal renders every Testable UI Element with the specified
  accessible names.
- **W5**: selecting an MRU directory prefills model and start-in from the repo's
  defaults.
- **W6**: the sort function passes unit tests covering all six states, the three
  specified orderings and the tiebreaks.
- **W7**: rail cards render title-or-"untitled", badge word, ticking time-in-state,
  repo/branch (or directory basename), and the context row as `ctx unknown` with no
  gauge track element.
- **W8**: state colour appears only via the design-system tokens, and every state is
  also carried by the badge word and sort position (never colour alone).
- **W9**: the trust-prompt note shows for a first-launch `started` session with no
  Claude session id, and switches to the no-signal note after ~10 s for a known
  directory.
- **W10**: a `failed` card shows the raw error token verbatim plus the human message,
  with no client-side switching on the token.
- **W11**: an `alive:false` card greys out and keeps its last state and badge.
- **W12**: on WS disconnect the banner appears over the still-rendered stale rail; on
  reconnect the snapshot replaces the session store wholesale.
- **W13**: the masthead contains the empty view-switcher slot sized so M2's control
  will not shift layout.

### E2E
All flows drive the real daemon (scratch harness, stub claude, per-run tmux socket) with
Claude Code faked via synthesized ingest POSTs.
- **E1**: launch via the modal (MRU path) → card appears in `started` immediately, and
  a tmux window exists on the scratch socket.
- **E2**: launch via Browse… into a fresh directory → card appears with the
  trust-prompt note, and `.claude/settings.local.json` exists in that directory.
- **E3**: synthesized enveloped SessionStart then turn-activity then Stop → the card
  walks `started → working → idle` with `lastActivity` shown.
- **E4**: a permission notification moves the card to `needs input`; a later Stop for
  that prompt returns it to `idle`.
- **E5**: a failure-close event moves the card to `failed` showing the raw token; a
  session seeded in plan mode shows `planning` on turn-activity instead of `working`.
- **E6**: a straggler turn-activity for a closed prompt does not move the card off
  `idle`.
- **E7**: the clear sequence (SessionEnd reason clear + SessionStart source clear, new
  Claude session id, same envelope binding) keeps one card, state `started`, rebound id
  visible via `GET /api/state`.
- **E8**: cards sort needs-input first (longest blocked at top), then failed, then the
  active/started/idle groups.
- **E9**: killing the scratch tmux window greys the card without changing its badge.
- **E10**: daemon restart → the card reappears from persistence with its state.

### Automated Checks

Every line is `<ID> <single-line shell command>` run from the project root; a check
passes iff its command exits 0. The negative grep D3 spans **all** Go code including
tests (wire bodies come only from `claudecodetest` — the m0-skeleton lesson); its
banned strings appear in this plan only inside the checks block itself, verified by
dry-run at planning time.

```checks
D1 go build ./...
D2 make check
D3 ! rg -n "hook_event_name|notification_type|last_assistant_message|stop_hook_active" cmd/ internal/ --glob '!internal/claudecode/**'
W1 make web-build
W2 make web-test
E1 make e2e
```

### Reviewer-Verified

- **D3a**: `internal/session` contains no Claude Code event-name strings or payload
  vocabulary — the state machine consumes only the neutral `StateInput` type (the
  grep D3 catches key names; this is the judgement-level companion).
- **D5** (WS half), **D7**, **D9** (log line), **D17**, **D18**, **D20** (request-time
  branch): verified by reading code/tests.
- **W3**, **W5**, **W8**, **W12**, **W13**: verified by reading code and exercising
  the app.
- Design-system conformance: tokens only, mono metadata, tabular numerics on timers,
  single filled-amber primary action per surface (design-system §§1–3, 5–6).

## Implementation Notes

- **Wrapper scripts** (SessionStart + status line): generated by the daemon into its
  data dir, referenced by absolute path from `settings.local.json`. Each reads stdin,
  wraps it in the §4.2 envelope from `$MUSTER_SESSION`/`$TMUX_PANE` (omitting absent
  vars), and POSTs with `curl --max-time 2 --silent --output /dev/null`; exit 0 always.
  Hook timeouts Muster registers are 1–2 s, never 5 (CLAUDE.md hard rule). Env
  inheritance is measured (canary-fields "Configuration that must keep working",
  2026-08-20 probe).
- **HTTP hook config** registers one URL for all plain-HTTP events; SessionStart is
  command-wrapped because it is silently never delivered over HTTP (measured —
  spikes/FINDINGS.md §1). The status line is a command script by construction.
- **Launch sequence** (order matters): validate → repo upsert → insert session row
  (need the id for the pane env) → write settings → spawn tmux window (`-c` directory,
  env vars for the binding + `LANG`/`LC_ALL`) → record target/pane → broadcast → 201.
  On spawn failure: delete the row, `500 launch_failed`.
- **Git detection at launch**: plain `git -C` invocations (conventions: CLI, never
  go-git) for is-git, current branch, and linked-worktree recognition (common-dir ≠
  git-dir — ux-flows §2).
- **tmux**: dedicated socket always (`-L <socket>` from the flag); one window per
  session; target recorded as `<session>:@<window id>`. No resizing work in M1 (that
  is M2's geometry law).
- **Timers client-side**: `stateSince`/`attention.since` are daemon truth; the ticking
  is rendering. Keep formatters pure for Vitest.
- **Model field on SessionStart is optional** (measured 2026-08-20: present on one
  startup capture, absent on another and on clear) — replace the launch value only
  when present.
- **`permissionMode` is always rendered as last-known** (SPEC §4.5, design-system
  honesty rule 3) — M1 shows no mode indicator on cards (not in the card anatomy);
  the latch exists for the planning/working split only.
- **The E2E stub claude** must stay alive (sleep loop) so pane-liveness tests control
  death explicitly via tmux kill.
