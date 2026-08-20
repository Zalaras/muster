# Plan: M0 Skeleton

**Created**: 2026-08-20
**Status**: approved
**Work Type**: full-stack
**Description**: First vertical slice — HTTP+WS server with token auth, SQLite with embedded migrations, hook/status-line ingest with per-session seq, a web shell that connects and stays connected, and the scratch-daemon E2E harness. Doubles as H1's pipeline acceptance shakedown.

## Overview

M0 builds the skeleton every later milestone hangs off: `musterd` becomes a real server
(HTTP + WebSocket on `127.0.0.1`, both tokens per SPEC §2.6), SQLite lands via
`modernc.org/sqlite` in WAL mode with embedded numbered migrations, and the
`internal/claudecode` ingest path accepts both hook shapes (raw and enveloped) plus the
enveloped status line, persisting every event append-only with a daemon-assigned
monotonic `seq`. The web side replaces the pre-M0 placeholder with a shell that
authenticates via the cookie exchange, connects to `/ws`, renders `hello` + `snapshot`
honestly (empty sessions, usage *unknown*), reconnects with backoff, and shows the
daemon-down banner while the socket is dead. The E2E harness stops driving Vite and
starts driving the real daemon: a scratch instance per run on a per-run port with a
per-run data directory.

The protocol is **not designed here** — `docs/protocol.md` v1 §8 lists exactly what M0
implements, and this plan implements precisely that list. There is no state machine, no
session launch, no `sessionUpsert`, no terminal sockets: ingested events land in the
`event` table (visible to tests via the scratch DB) and nothing else happens to them.

This slice is also H1's acceptance test: it must run through `/orchestrate` end to end
(e2e-specs → daemon-impl ∥ web-impl → daemon-tests ∥ web-tests → e2e-validate →
review-work), so the scope is deliberately small but touches every track.

## Requirements

### Must Have
- [ ] REQ-1: `musterd` serves HTTP on `127.0.0.1` only; `GET /healthz` responds `200 {"status":"ok","version":"<daemon>"}` with no auth.
- [ ] REQ-2: At first run the daemon generates two random tokens (UI, ingest), persists them in the `kv` table, and reuses them on every subsequent start.
- [ ] REQ-3: The daemon writes `<data-dir>/tokens.json` (mode 0600) on every startup: `{"dashboardUrl": "http://127.0.0.1:<port>/auth?token=<uiToken>", "uiToken": "…", "ingestToken": "…"}` — the launcher/E2E handoff (SPEC §2.6's accepted token-file risk).
- [ ] REQ-4: `GET /auth?token=<uiToken>` sets the `muster_auth` cookie (`HttpOnly`, `SameSite=Strict`, `Path=/`, `Max-Age` 30 days, value = UI token) and responds `303` → `/`. A bad/missing token gets the relaunch page (REQ-5) with `401`.
- [ ] REQ-5: Static routes (`/`, assets) without a valid cookie return `401` with a minimal HTML page telling the user to relaunch Muster; `/api/*` and `/ws` without it return `401 {"error":{"code":"unauthorized","message":…}}` (JSON). Token comparison is constant-time.
- [ ] REQ-6: `GET /api/state` (cookie auth) returns the same JSON object as the WS `snapshot` payload: `{"sessions":[],"usage":{"fiveHour":null,"sevenDay":null,"sampledAt":null,"source":"subscription"},"prefs":{"view":"focus"}}` in M0.
- [ ] REQ-7: `/ws` (cookie auth on the upgrade) sends `hello` then `snapshot` on every (re)connect, then nothing else in M0; server→client only. Upgrades with an `Origin` header present whose host ≠ the request `Host` are rejected (403).
- [ ] REQ-8: `hello` carries `protocolVersion: 1`, `daemon.version`, and `claudeCode {pinned, installed, drift}`; `installed`/`drift` are `null` when `claude --version` failed at startup (null = unknown, protocol §1).
- [ ] REQ-9: SQLite opens via `modernc.org/sqlite` with WAL enabled; embedded numbered `.sql` migrations apply forward-only at startup and are recorded in `schema_migrations`; a second startup applies nothing.
- [ ] REQ-10: `POST /ingest/{token}/hook` accepts both shapes — enveloped (body has a `payload` key) and raw — returns `200` with an empty body immediately, and persists asynchronously to `event` in arrival order.
- [ ] REQ-11: `POST /ingest/{token}/status` accepts the enveloped status-line body (same parser; a raw body is tolerated) and persists it as `type = "status_line"`.
- [ ] REQ-12: Each persisted event gets a monotonic `seq`, keyed per `claude_session_id`, assigned at ingest, shared across both ingest endpoints; the `event` row also captures `type`, `prompt_id`, `tool_use_id`, envelope fields (`muster_session`, `tmux_pane`) and the verbatim inner payload JSON.
- [ ] REQ-13: A wrong ingest token → `404`; a body that is not valid JSON, or valid JSON with no usable `session_id` → `200`, logged (without the body), dropped. Payload bodies are never logged.
- [ ] REQ-14: All Claude-Code-format parsing (raw-vs-envelope detection, field names like `hook_event_name`/`session_id`, status-line shape) lives in `internal/claudecode`; other packages consume a neutral parsed struct.
- [ ] REQ-15: The web shell authenticates, connects to `/ws`, and renders the masthead (brand, usage readouts, Claude Code version/drift, connection status) plus the empty sessions state from `hello` + `snapshot`.
- [ ] REQ-16: Usage renders the word **unknown** for both buckets (values are null) — no empty gauge, no 0%.
- [ ] REQ-17: When the socket drops, the shell shows the full-width daemon-down banner and reconnects with backoff (500 ms doubling to an 8 s cap, forever); the banner clears when `hello` arrives again.
- [ ] REQ-18: A `hello.protocolVersion` the client doesn't know replaces the shell with a "protocol changed — reload the dashboard" message.
- [ ] REQ-19: The E2E harness launches a scratch `bin/musterd` per run: per-run free port, per-run temp data dir, serving the freshly built `web/dist`; never attaches to an existing server; kills the daemon on teardown.
- [ ] REQ-20: The daemon shuts down gracefully on SIGINT/SIGTERM (contexts cancelled, ingest queue drained, DB closed).

### Should Have
- [ ] REQ-21: Logging via zerolog, one root logger constructed in `main` (replacing the pre-M0 slog usage — conventions compliance).
- [ ] REQ-22: `make run` builds daemon + web and runs `bin/musterd` against `web/dist` and the real data dir, logging the dashboard URL.
- [ ] REQ-23: A bounded ingest queue (drop + count + log on overflow — loss tolerance, never backpressure onto Claude Code).

### Nice to Have
- [ ] REQ-24: `make run` opens the dashboard URL in the browser (`open <url>`).

## Protocol Contract

**No wire changes.** M0 implements exactly the M0 row of `docs/protocol.md` §8: §2 auth
(both tokens, cookie exchange, WS origin check), `GET /healthz`, `GET /auth`, static,
`GET /api/state`, `/ws` with `hello` + `snapshot` (empty sessions, null usage) +
reconnect/banner behaviour, and both ingest endpoints persisting enveloped/raw events
with `seq`. All shapes are as written there; agents code against `docs/protocol.md`
directly.

One **clarification** (merged into `docs/protocol.md` §5.1 on approval; additive
nullability, no version bump):

### WS: daemon→UI `hello` — nullability note
```json
{ "type": "hello", "protocolVersion": 1,
  "daemon": { "version": "string" },
  "claudeCode": { "pinned": "string",
                  "installed": "string|null — null when claude --version failed at startup",
                  "drift": "boolean|null — null iff installed is null" } }
```
The client renders `installed: null` as *unknown* (protocol §1), not as drift.

Daemon-local artifacts that are **not** protocol (they never cross the daemon↔UI wire)
but are fixed here because two agents share them:

- **`<data-dir>/tokens.json`** (0600, rewritten each startup):
  `{"dashboardUrl":"http://127.0.0.1:<port>/auth?token=<uiToken>","uiToken":"…","ingestToken":"…"}`.
  The E2E harness reads it to authenticate and to build ingest URLs.
- **`<data-dir>/muster.db`** — the SQLite file; the E2E ingest oracle queries it
  read-only via the `sqlite3` CLI (`GET /api/state` cannot show events until M1 gives it
  sessions, and adding a debug field to the snapshot would be a protocol change M0
  doesn't need).
- **`kv` keys**: `ui_token`, `ingest_token`.

## Schema Changes

Migration `internal/store/migrations/0001_init.sql` — **only the tables M0 exercises**
(`kv`, `event`). `session`/`repo`/`usage_sample` arrive with the milestones that first
write them (M1/M3): migrations are forward-only, so freezing full column sets now for
tables M0 can't touch just risks a churn migration later. (Deviation from a literal
reading of "schema per SPEC §7" — SPEC §7 is the direction; flagged at approval.)

```sql
CREATE TABLE kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

CREATE TABLE event (
  id                INTEGER PRIMARY KEY,  -- global arrival order across all sessions
  claude_session_id TEXT    NOT NULL,
  seq               INTEGER NOT NULL,     -- per-claude_session_id, assigned at ingest
  type              TEXT    NOT NULL,     -- hook_event_name verbatim, or 'status_line'
  prompt_id         TEXT,
  tool_use_id       TEXT,
  muster_session    INTEGER,              -- envelope field; NULL on raw posts / unset env
  tmux_pane         TEXT,                 -- envelope field; NULL likewise
  payload           TEXT    NOT NULL,     -- verbatim inner payload JSON
  received_at       TEXT    NOT NULL,     -- RFC3339 UTC, daemon clock (hooks carry none)
  UNIQUE (claude_session_id, seq)
) STRICT;
```

Migration bookkeeping table (created by the migration runner itself, not a numbered file):
`schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`.

Notes:
- `seq` keys on `claude_session_id` because the Muster-session binding doesn't exist
  until M1's envelope binding; SPEC §7's "per-session seq" has no other addressable key
  in M0. M1 adds the nullable `session_id` column (and routing) in its own migration;
  `event.id` preserves global arrival order across any rebinding.
- No `session_id`-missing rows: an event without a usable `session_id` is dropped at
  ingest (REQ-13), so `claude_session_id` is NOT NULL.
- Don't test SQLite's constraint enforcement — test Muster's seq assignment and
  migration idempotence.

## UI Specifications

Follow `docs/design/design-system.md` (direction A "instrument"): tokens from §1, masthead
per §5, honesty rules §6 (esp. #1 never an empty gauge, #7 daemon-down loud). M0 builds
only the shell — no rail cards, no tiles, no view switcher (M1 lays out the switcher slot).

### Views
- **Shell** (`/` after auth) — masthead: brand "Muster"; right-aligned: 5-hour readout,
  7-day readout, Claude Code version (with drift callout when `drift` is true or
  `installed` is null), connection status. Main area: the empty sessions state.
- **Daemon-down banner** — full-width banner (design-system §6.7) shown whenever the
  socket is not open-and-helloed; explains that pane noise is Muster's absence, not
  session failure. Clears on `hello`.
- **Protocol-mismatch view** — replaces the shell entirely: "protocol changed — reload
  the dashboard".
- **Relaunch page** — served by the **daemon** (not the SPA) on unauthenticated static
  requests: minimal HTML telling the user to relaunch Muster.

### User Flows
1. Launcher/E2E opens `dashboardUrl` → `GET /auth?token=…` sets the cookie → `303` → `/`
   → shell loads → WS connects → `hello` + `snapshot` render.
2. Daemon dies → socket closes → banner appears, client retries with backoff → daemon
   returns → `hello` → banner clears, shell re-renders from the fresh `snapshot`.
3. Unauthenticated visit to `/` → relaunch page (no SPA loads).

### States
- **No data yet** (socket connecting, no `hello`): connection status reads `connecting…`;
  usage readouts read **unknown**; sessions area empty-state text. Never a 0% bar.
- **Data** (M0's only data): empty sessions → "No sessions yet"; usage null → **unknown**
  (word only, no track — design-system §6.1); version/drift from `hello`.
- **Daemon down**: the banner (above); the rest of the shell stays visible but is
  understood stale.

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Masthead brand | `heading` | `Muster` | `<h1>` |
| Connection status | `status` | `/connected\|connecting\|reconnecting/i` | mandated `role="status"` on the masthead element |
| Daemon-down banner | `alert` | `/musterd unreachable/i` | mandated `role="alert"`; full-width; present only while disconnected |
| 5-hour usage readout | — | `/5h[\s\S]*unknown/i` | no track rendered when null |
| 7-day usage readout | — | `/7d[\s\S]*unknown/i` | same |
| Claude Code version | — | `/claude\s+2\./i` | shows drift text when `drift` true; `unknown` when `installed` null |
| Empty sessions state | — | `No sessions yet` | main area |
| Protocol-mismatch view | — | `/reload the dashboard/i` | Vitest covers the trigger logic; E2E not required to induce it |
| Relaunch page body | — | `/relaunch/i` | daemon-served HTML, not the SPA |

## Affected Files

### Daemon
- `cmd/musterd/main.go` — replace the pre-M0 stub: flags (`-addr`, `-data-dir`,
  `-web-dist`, `-debug`), zerolog root logger, open store + migrate, token bootstrap,
  write `tokens.json`, construct server, graceful shutdown on SIGINT/SIGTERM. Default
  `-data-dir` `~/Library/Application Support/Muster`; default `-web-dist` `web/dist`.
- `internal/server/server.go` — `net/http` mux wiring (Go 1.22 method/path routing),
  `/healthz`, `/auth`, static file serving from `-web-dist`, relaunch page.
- `internal/server/auth.go` — cookie middleware (`func(http.Handler) http.Handler`),
  constant-time token compare, JSON-vs-HTML 401 split.
- `internal/server/ws.go` — `/ws` via `coder/websocket`: origin check, `hello` +
  `snapshot` on connect, client registry (broadcast infra exists but M0 broadcasts
  nothing after the snapshot).
- `internal/server/state.go` — `GET /api/state` (shares the snapshot-building code with
  ws.go).
- `internal/server/ingest.go` — both ingest endpoints: token check (404), enqueue body +
  arrival time, return 200; single worker goroutine parses via `claudecode`, assigns
  `seq`, inserts; bounded queue drop-and-log.
- `internal/store/store.go` — open (`modernc.org/sqlite`, WAL pragma), kv get/set,
  event insert (seq assignment inside the insert path, per `claude_session_id`), close.
- `internal/store/migrate.go` — embedded FS runner, `schema_migrations`, forward-only.
- `internal/store/migrations/0001_init.sql` — DDL above.
- `internal/claudecode/ingest.go` — `ParseIngestBody(body []byte) (Event, error)`:
  envelope detection (`payload` key), raw fallback, extraction of `session_id`,
  `hook_event_name` (or `status_line` for the status endpoint), `prompt_id`,
  `tool_use_id`, envelope `musterSession`/`tmuxPane`; returns a neutral struct — the
  only package that knows the wire names.
- `Makefile` — `run` target; `e2e` gains `build web-build` as prerequisites.

### Web
- `web/src/protocol.ts` — message types (`Hello`, `Snapshot`, `Usage`, `Session`) and
  `parseMessage()` (unknown types → ignored, per protocol §1).
- `web/src/ws.ts` — the single WebSocket client module: connect, emit
  connected/hello/snapshot/disconnected, reconnect loop; exports pure
  `backoffDelay(attempt): number` (500 ms × 2ⁿ capped at 8000).
- `web/src/render/masthead.ts` — masthead render function (brand, usage readouts,
  version/drift, connection status).
- `web/src/render/banner.ts` — daemon-down banner show/hide.
- `web/src/render/sessions.ts` — empty-state render (M1 replaces the body).
- `web/src/main.ts` — wiring: subscribe to ws module, dispatch to renderers,
  protocol-version gate.
- `web/src/style.css` — design-system §1 token subset + masthead/banner styles.
- `web/index.html` — shell skeleton / `<template>` elements.
- Vitest: `web/src/protocol.test.ts`, `web/src/ws.test.ts` (backoff schedule, dispatch,
  version gate — logic only, no real sockets).

### E2E
- `web/playwright.config.ts` — drop the Vite `webServer` block entirely; keep chromium
  project; specs get their daemon from the fixture below.
- `web/e2e/helpers/daemon.ts` — `startScratchDaemon()`: free port, `mkdtemp` data dir,
  spawn `../bin/musterd -addr 127.0.0.1:<port> -data-dir <tmp> -web-dist dist`, wait for
  `/healthz`, read `tokens.json`; exposes `baseURL`, tokens, `dbPath`, `kill()`,
  `restart()` (same port + data dir); teardown kills and removes the temp dir.
- `web/e2e/helpers/db.ts` — ingest oracle: run `sqlite3 <dbPath> "<sql>"` (read-only)
  and parse rows.
- `web/e2e/auth.spec.ts`, `shell.spec.ts`, `ingest.spec.ts`, `resilience.spec.ts` —
  replace `smoke.spec.ts` (delete it; it drives the retired Vite server).

## Edge Cases

1. **Enveloped vs raw hook posts** — detection is "body has a `payload` key"; both must
   persist identically apart from the envelope columns (protocol §4.2).
2. **Envelope with absent `musterSession`/`tmuxPane`** (headless probe) — columns NULL,
   event still persisted.
3. **Malformed JSON body** — `200`, logged without the body, dropped (protocol §4).
4. **Valid JSON, no `session_id`** — treated as malformed (every measured hook and
   status post carries it — canary-fields "common set").
5. **Unknown `hook_event_name`** — persisted verbatim, inert (forward compatibility).
6. **Duplicate/near-simultaneous status posts** (~435 ms pairs) — M0 persists both;
   de-duplication is M3's problem (it's a `usage_sample` concern, not an event-log one).
7. **`/clear` mints a new `session_id`** — new `claude_session_id`, seq restarts at 1
   for the new stream; `event.id` keeps global order. No special handling in M0.
8. **Wrong ingest token** — `404`, logged, no oracle for guessing.
9. **Ingest queue overflow** — drop + count + log; never block the 200 (hooks are lossy
   by design; Muster must not add backpressure).
10. **Daemon restart** — tokens live in kv, so the cookie and ingest URLs stay valid;
    `tokens.json` is rewritten identically; the web client reconnects and re-renders
    from the fresh snapshot.
11. **WS upgrade with foreign `Origin`** — rejected 403; absent `Origin` (non-browser
    client, curl, tests) — allowed.
12. **`claude` binary missing/hung at startup** — `hello.claudeCode.installed`/`drift`
    are null; startup proceeds (drift check already non-fatal).
13. **Two dashboards open** — both sockets get `hello`+`snapshot`; the registry must
    handle N clients even though M0 never broadcasts after that.
14. **Static asset requested with a stale/garbage cookie** — same relaunch page as no
    cookie.

## Acceptance Criteria

IDs are unique across the whole section — `D*` daemon, `W*` web, `E*` e2e. One clause per
criterion.

### Daemon
- **D1**: `make test` passes.
- **D2**: `go build ./...` succeeds.
- **D3**: `make lint` passes.
- **D4**: No Claude Code wire-format names appear outside `internal/claudecode/`.
- **D5**: Unit tests cover seq assignment per `claude_session_id` across both ingest endpoints interleaved.
- **D6**: Unit tests cover envelope-vs-raw parsing including absent envelope fields.
- **D7**: Unit tests cover malformed-body and missing-`session_id` drops returning 200.
- **D8**: Unit tests cover migration idempotence (second `Migrate` call is a no-op).
- **D9**: Unit tests cover auth middleware (valid cookie passes; missing/wrong cookie → 401 JSON for API paths, HTML for static).
- **D10**: The ingest handler returns 200 before any DB work happens (verified by reading the handler: enqueue only).
- **D11**: Hook/status payload bodies are never written to any log output.
- **D12**: The daemon shuts down cleanly on SIGTERM with the ingest queue drained.

### Web
- **W1**: `make web-build` passes (strict TS, no framework added).
- **W2**: `make web-test` passes.
- **W3**: No `any` types in new web code.
- **W4**: Vitest covers `backoffDelay` (500, 1000, 2000, 4000, 8000, 8000…).
- **W5**: Vitest covers `parseMessage` ignoring unknown message types and unknown fields.
- **W6**: Vitest covers the protocol-version gate (version ≠ 1 → mismatch view trigger).
- **W7**: Only `web/src/ws.ts` constructs a WebSocket.
- **W8**: Usage readouts render the word "unknown" with no gauge track when values are null.

### E2E
- **E1**: `make e2e` passes.
- **E2**: An unauthenticated request to `/` gets the relaunch page, not the dashboard.
- **E3**: Visiting `dashboardUrl` sets the cookie and lands on the rendered shell.
- **E4**: `GET /healthz` returns 200 with a version, no cookie required.
- **E5**: `GET /api/state` returns 401 without the cookie and the M0 snapshot object with it.
- **E6**: The shell shows connection status "connected", both usage readouts "unknown", and "No sessions yet" after the WS handshake.
- **E7**: An enveloped `SessionStart` POST then a raw `Stop` POST for the same `session_id` persist as two `event` rows with `seq` 1 and 2 (sqlite3 oracle).
- **E8**: A status-line POST persists as an `event` row with `type = "status_line"`.
- **E9**: A POST to `/ingest/<wrong-token>/hook` returns 404 and persists nothing.
- **E10**: A malformed-JSON hook POST returns 200 and persists nothing.
- **E11**: Killing the scratch daemon makes the daemon-down banner (role `alert`) appear.
- **E12**: Restarting the daemon on the same port and data dir clears the banner without a page reload.

### Automated Checks

Every line below is `<ID> <single-line shell command>`, run from the project root. A check
passes iff its command exits 0.

```checks
D1 make test
D2 go build ./...
D3 make lint
D4 ! rg -n "hook_event_name|last_assistant_message|used_percentage|resets_at|notification_type" cmd/ internal/ --glob '!internal/claudecode/**'
W1 make web-build
W2 make web-test
W7 ! rg -n "new WebSocket" web/src --glob '!web/src/ws.ts'
E1 make e2e
```

### Reviewer-Verified

- **D5–D9**: the named unit tests exist and genuinely exercise the behaviour (not just the happy path).
- **D10**: handler code path is enqueue-then-200, no synchronous DB call.
- **D11**: grep/read every log call on the ingest path — no payload bodies, no prompt text.
- **D12**: shutdown path honors context cancellation per conventions.
- **W3**: no `any` in new TS.
- **W4–W6**: the named Vitest suites exist and assert the specified behaviour.
- **W8**: unknown-usage rendering is the word only — no empty/0% track in the DOM.
- Masthead/banner styling uses design-system §1 tokens (no ad-hoc colours).
- Logging is zerolog with the root logger built in `main` (conventions).
- E2E harness properties: per-run port, per-run data dir, no server reuse, daemon killed on teardown.

## Implementation Notes

- **Authority order**: `docs/protocol.md` v1 is the contract — implement its M0 row
  exactly; `spikes/canary-fields.md` is the wire-format truth for payload shapes (newest
  facts measured against 2.1.237). Do not consult Claude Code's official docs.
- **Synthesized E2E payloads** must match the measured shapes (canary-fields "Hook
  payloads" table). Minimum viable examples:
  - Enveloped `SessionStart`:
    `{"musterSession":1,"tmuxPane":"%12","payload":{"hook_event_name":"SessionStart","session_id":"e2e-s1","transcript_path":"/tmp/t.jsonl","cwd":"/tmp","source":"startup","model":{"id":"claude-haiku-4-5-20251001","display_name":"Haiku 4.5"}}}`
  - Raw `Stop`:
    `{"hook_event_name":"Stop","session_id":"e2e-s1","transcript_path":"/tmp/t.jsonl","cwd":"/tmp","prompt_id":"p1","permission_mode":"default","last_assistant_message":"hi","stop_hook_active":false}`
  - Enveloped status line: envelope wrapping the canary-fields status-line shape
    (`context_window` nulls + absent `rate_limits` for the pre-first-response state).
  No real `claude` anywhere in this plan's tests — E2E fakes Claude Code entirely.
- **Async ingest shape**: handler validates the token, enqueues `{body, receivedAt}` on
  a buffered channel (~1024), returns 200. One worker goroutine parses, assigns seq
  (in-memory per-`claude_session_id` counters, lazily seeded from
  `MAX(seq)` on first touch), inserts. Single worker ⇒ arrival order preserved without
  locking games. Drain on shutdown.
- **Snapshot building** is one function used by both `GET /api/state` and the WS
  handshake — they must never drift apart.
- **Static serving from disk** (`-web-dist`), not `go:embed`, in M0: embedding would make
  `go build ./...` depend on the web build. Revisit if a self-contained binary ever
  matters (personal tool run from the repo — it may never).
- **UI token is reusable** at `/auth` (not single-shot): the token lives in kv for the
  life of the install; "one-time" in SPEC §2.6 describes the launcher flow, not token
  burning. Cookie Max-Age 30 days.
- **Playwright config keeps the per-run port discipline** for a different reason now:
  ports come from the fixture's free-port allocation, and `reuseExistingServer` is moot
  because there is no `webServer` block. The stale-server trap stays dead.
- **The e2e `restart()` helper** re-spawns on the same port/data dir — needed for E12 and
  it incidentally proves kv token persistence (REQ-2).
- **Dev-loop skill** (next-steps item 3 DoD): `make run` is in-plan (daemon track,
  REQ-22). The `/dev-loop` skill file (`.claude/skills/dev-loop/SKILL.md` — build, run,
  where tokens.json lives, how to stop) is **authored by the main session at plan
  completion**, outside orchestration: pipeline agents don't write `.claude/` content,
  and it's doc work per CLAUDE.md's judgement rule.
- **Doc upkeep on completion**: tick the four M0 boxes in `TODO.md`; SPEC §11 changelog
  entry only if a decision here amends one (the kv/event-only migration probably rates a
  line); no new wire facts expected (nothing probes Claude Code).
