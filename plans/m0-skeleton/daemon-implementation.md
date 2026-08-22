# Daemon Implementation: M0 Skeleton

**Plan**: m0-skeleton
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `go.mod` / `go.sum` | modified | Added `github.com/coder/websocket`, `modernc.org/sqlite`, `github.com/rs/zerolog` (all `go get @latest`, resolved via proxy.golang.org). |
| `internal/claudecode/ingest.go` | created | `ParseIngestBody(body []byte, kind Kind) (Event, error)` — envelope-vs-raw detection (`payload` key), extraction of `session_id`/`hook_event_name`/`prompt_id`/`tool_use_id`/envelope `musterSession`/`tmuxPane`; `KindStatus` forces `Type = "status_line"`; `ErrNoSessionID` for the missing-session_id drop path. Only file with Claude-Code field names. |
| `internal/store/store.go` | created | `Store`: `Open` (WAL pragma, single conn, runs `Migrate`), `Close`, `KVGet`/`KVSet`, `InsertEvent` (seq assigned inline via `MAX(seq)+1` scoped to `claude_session_id`, in the same `INSERT`). |
| `internal/store/migrate.go` | created | Embedded-FS migration runner: creates `schema_migrations` if absent, applies each unnumbered-yet `.sql` file in a transaction, records it. Forward-only, idempotent (skips already-applied versions). |
| `internal/store/migrations/0001_init.sql` | created | DDL for `kv` and `event`, verbatim from the plan's Schema Changes section (two comment wordings adjusted — see Decisions). |
| `internal/server/server.go` | created | `Server`/`Config`/`New`/`Handler`/`Start`/`Shutdown`; `routes()` wires the Go 1.22 method/path mux. |
| `internal/server/auth.go` | created | Cookie middleware (`requireCookie`), `hmac.Equal`-based constant-time token compare, JSON-vs-HTML 401 split, relaunch page HTML, `/healthz`, `/auth`. |
| `internal/server/state.go` | created | `Snapshot`/`UsageInfo`/`PrefsInfo` types, `buildSnapshot()` (shared by `/api/state` and `/ws`), `handleState`. |
| `internal/server/ws.go` | created | `/ws`: `websocket.Accept` (origin check is the library's own default — present+mismatched Origin → 403, absent Origin → allowed), `hello` + `snapshot` via `wsjson.Write`, `wsHub` client registry for future broadcast + shutdown close-all. |
| `internal/server/ingest.go` | created | `ingestQueue` (bounded channel, single worker, drop+count+log on overflow), both ingest handlers (token check → 404, else enqueue raw body → 200, no DB work on the request path). |
| `cmd/musterd/main.go` | rewritten | Flags (`-addr`, `-data-dir`, `-web-dist`, `-debug`, plus pre-existing `-version`), zerolog root logger, data-dir creation, store open, token bootstrap (kv-backed, `crypto/rand`), `tokens.json` write (0600, rewritten + chmod'd every startup), Claude Code drift check feeding `hello`, listener via `net.ListenConfig`, graceful SIGINT/SIGTERM shutdown (`http.Server.Shutdown` then `Server.Shutdown` closing WS conns + draining the ingest queue). |
| `Makefile` | modified | `e2e` now depends on `build web-build`; added `run: build web-build` target (REQ-22). |

## Decisions

- **Seq assignment lives in the SQL insert, not an in-memory counter map.** The
  Implementation Notes describe "in-memory per-`claude_session_id` counters, lazily
  seeded from `MAX(seq)`"; I used `VALUES (?, (SELECT COALESCE(MAX(seq),0)+1 FROM event
  WHERE claude_session_id = ?), ...)` inside `Store.InsertEvent` instead. This satisfies
  the Affected Files line for `store.go` verbatim ("seq assignment inside the insert
  path, per `claude_session_id`") and REQ-12/D5 identically, with no extra state to seed
  or guard — correct because the single ingest worker never calls `InsertEvent`
  concurrently with itself. Verified manually: enveloped `SessionStart` then raw `Stop`
  for the same session persisted with `seq` 1 and 2 (`sqlite3` query output pasted below).
- **D4's automated grep vs. the plan's own DDL comment.** The plan's Schema Changes
  section writes the `event.type` column comment as `-- hook_event_name verbatim, or
  'status_line'` verbatim, and I initially copied that plus an analogous comment in
  `store.go`. Running the exact D4 check —
  `! rg -n "hook_event_name|last_assistant_message|used_percentage|resets_at|notification_type" cmd/ internal/ --glob '!internal/claudecode/**'`
  — matched both comments (rg exit 0 on two hits in `internal/store/migrations/0001_init.sql:13`
  and `internal/store/store.go:82`), which negated by `!` fails the check. Neither comment
  is a real leak (no code reads/writes that field name outside `internal/claudecode`), so
  I reworded them ("the hook's event-name field verbatim" / "Claude Code's own hook/status
  field names") to preserve the documentation without tripping the literal-string check.
  Re-ran D4 after the edit: exit 0.
- **`make run` implements REQ-22 only, not REQ-24 (Nice to Have).** REQ-24's `open <url>`
  needs the token generated at runtime, which isn't known until the daemon has already
  started — auto-opening the browser would need either a second process reading
  `tokens.json` after readiness or daemon-side `exec.Command("open", ...)`, neither of
  which the plan calls for. Per YAGNI and the plan's own Should/Nice split, I logged
  `dashboard_url` on every startup (satisfies "logging the dashboard URL") and left
  browser auto-open undone.
- **`db.SetMaxOpenConns(1)`** on the store's `*sql.DB`, not specified in the plan. A
  single writer goroutine plus SQLite's own one-writer-at-a-time rule means a connection
  pool > 1 only risks `SQLITE_BUSY` retries for no benefit at M0's scale (a personal,
  single-user daemon); one connection removes the class of bug entirely. Minimal,
  reversible if a later milestone needs concurrent reads.
- **Static serving 401 vs 404 for a nonexistent asset path**: not specified beyond "static
  routes without a valid cookie return 401" — verified manually that `/` and any other
  path under the `"/"` catch-all pattern get the auth check first, so an unauthenticated
  request to any static path (including one that wouldn't otherwise exist) gets the same
  401 relaunch page (Edge Case 14), never a 404 leaking path existence.

## Manual verification (ahead of daemon-tests / E2E)

Built `bin/musterd` and drove it directly (see shell history in this run) against a
scratch data dir and a stub `web/dist`:
- `GET /healthz` → `200 {"status":"ok","version":"..."}`, no cookie.
- Unauthenticated `GET /`, `GET /api/state` → `401` (HTML relaunch page / JSON error
  respectively).
- `GET /auth?token=<uiToken>` → `303` → `/`, sets `muster_auth` (HttpOnly, SameSite=Strict,
  Path=/, Max-Age 2592000); bad token → `401` relaunch page.
- Real WS handshake (small throwaway `coder/websocket` client) → `hello` then `snapshot`,
  exact shape: `{"type":"hello","protocolVersion":1,"daemon":{"version":"..."},"claudeCode":{"pinned":"2.1.233","installed":"2.1.239","drift":true}}`
  then `{"type":"snapshot","sessions":[],"usage":{"fiveHour":null,"sevenDay":null,"sampledAt":null,"source":"subscription"},"prefs":{"view":"focus"}}`.
- Foreign-`Origin` WS upgrade attempt (with cookie) → `403`; no-`Origin`, no-cookie → `401`.
- Enveloped `SessionStart` then raw `Stop` for `session_id=smoke-1` → two `event` rows,
  `seq` 1/2, `type` `SessionStart`/`Stop`, envelope columns set on the first row and NULL
  on the second (`sqlite3 -json` query, matches E7's expectation exactly).
- Wrong ingest token → `404`.
- SIGTERM → clean shutdown log line, process exits; restart on the same port/data-dir →
  identical `tokens.json`, `schema_migrations` count unchanged (1 before and after).
- `go build ./...`, `go vet ./...`, `make lint` (0 issues), `go test ./...` (existing
  `internal/claudecode` tests still pass) all clean; `gofmt -l .` empty.

## Handoff

**Build status**: `go build ./...` exits 0.

No test files needed changes — `internal/server` and `internal/store` have no test files
yet (that's daemon-tests' job); `internal/claudecode`'s existing `version_test.go` was
untouched and still passes.

Everything in the plan's Affected Files > Daemon list is implemented. Not implemented
(by design, per plan scope): the state machine (§7, M1), session/repo/usage_sample
tables (M1/M3), terminal sockets (M2), `POST /api/sessions`/`GET /api/repos`/`PUT
/api/prefs` (M1/M2) — all explicitly out of M0's scope per the plan's Overview.
