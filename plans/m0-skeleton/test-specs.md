# E2E Test Specs: M0 Skeleton

**Plan**: m0-skeleton
**Mode**: validate (attempt 1)
**Verdict**: pass
**Tests created**: 19
**Live run**: 19/19 passing

## Tests

| File | Test Name | Requirement | What It Verifies |
|------|-----------|-------------|------------------|
| web/e2e/auth.spec.ts | serves /healthz without authentication | REQ-1 | 200 `{"status":"ok","version":…}`, no cookie |
| web/e2e/auth.spec.ts | shows the relaunch page for an unauthenticated visit to / | REQ-5 | No cookie → 401 + relaunch HTML, not the SPA |
| web/e2e/auth.spec.ts | shows the relaunch page for a stale cookie | REQ-5 / Edge Case 14 | Garbage cookie value → same relaunch page |
| web/e2e/auth.spec.ts | rejects GET /api/state without the auth cookie with a JSON 401 | REQ-5, REQ-6 | `/api/*` unauth → JSON `{"error":{"code":"unauthorized",…}}` |
| web/e2e/auth.spec.ts | exchanges the UI token for a session cookie and lands on the rendered shell | REQ-3, REQ-4 | `/auth?token=` sets `muster_auth` (HttpOnly, SameSite=Strict, Path=/), 303→/ renders shell |
| web/e2e/auth.spec.ts | gets a 401 relaunch page for a bad token at /auth | REQ-4 | Bad token at `/auth` → 401 relaunch page |
| web/e2e/auth.spec.ts | rejects a WS upgrade whose Origin host does not match the daemon's own | REQ-7 (origin check) | Foreign `Origin` on `/ws` upgrade → 403 |
| web/e2e/shell.spec.ts | renders the masthead, connection status and empty sessions state after the WS handshake | REQ-7, REQ-15 | `role=status` shows connected; "No sessions yet" |
| web/e2e/shell.spec.ts | renders both usage readouts as the word unknown, never an empty gauge | REQ-16 | 5h/7d text patterns render "unknown" |
| web/e2e/shell.spec.ts | shows the Claude Code version reported by hello | REQ-8, REQ-15 | Version text `/claude 2\./i` from `hello.claudeCode` |
| web/e2e/shell.spec.ts | GET /api/state returns exactly the M0 snapshot object once authenticated | REQ-6 | JSON equals `{"sessions":[],"usage":{...null...},"prefs":{"view":"focus"}}` |
| web/e2e/ingest.spec.ts | persists an enveloped SessionStart then a raw Stop for the same session as seq 1 and 2 | REQ-10, REQ-12 (E7) | Both shapes persist; seq 1/2; envelope columns set on enveloped row, NULL on raw row |
| web/e2e/ingest.spec.ts | persists a status-line POST as an event with type status_line | REQ-11 (E8) | Row with `type = "status_line"` |
| web/e2e/ingest.spec.ts | rejects a wrong ingest token with 404 and persists nothing | REQ-13, Edge Case 8 (E9) | 404, no row for that session id |
| web/e2e/ingest.spec.ts | returns 200 for a malformed JSON hook body and persists nothing | REQ-13 (E10) | 200, total event count unchanged |
| web/e2e/ingest.spec.ts | returns 200 for valid JSON with no usable session_id and persists nothing | REQ-13, Edge Case 4 | 200, total event count unchanged |
| web/e2e/resilience.spec.ts | shows the daemon-down banner when the scratch daemon is killed, and clears it on restart | REQ-17 (E11, E12) | `role=alert` banner appears on kill, clears + reconnects on restart, no reload |
| web/e2e/resilience.spec.ts | keeps the same UI and ingest tokens across a restart on the same data dir | REQ-2, REQ-19 | Tokens unchanged after `restart()`; daemon healthy again |
| web/e2e/resilience.spec.ts | does not re-apply migrations on a second startup against the same data dir | REQ-9 | `schema_migrations` row count unchanged across restart |

## Fixture Changes

New shared helper modules (none existed before this plan; the pre-M0 harness only ran
against Vite):

- `web/e2e/helpers/daemon.ts` — `startScratchDaemon()` / `ScratchDaemon` class: free-port
  allocation, `mkdtemp` data dir, spawns `bin/musterd -addr … -data-dir … -web-dist
  web/dist`, polls `/healthz`, reads `tokens.json`. Exposes `baseURL`, `dbPath`,
  `uiToken`/`ingestToken`/`dashboardUrl`, `ingestURL(kind)`, `kill()` (SIGTERM, 5s
  SIGKILL escalation), `restart()` (same port + data dir), `teardown()`. Matches the
  plan's Affected Files > E2E description of this helper.
- `web/e2e/helpers/db.ts` — read-only `sqlite3 -json` oracle: `queryEvents(dbPath,
  claudeSessionId)`, `countAllEvents(dbPath)`, `countMigrations(dbPath)`. Matches the
  plan's note that `/api/state` can't show events until M1, so the DB is the only ingest
  oracle in M0.
- `web/e2e/helpers/payloads.ts` — payload builders, each traced to a specific
  `canary-fields.md` fact:
  - `envelopedSessionStart` — copied verbatim from the plan's Implementation Notes
    example (which cites canary-fields.md's "SessionStart is silently never delivered
    over `type:"http"`" transport fact — the reason the real wrapper always envelopes it).
  - `rawStop` — copied verbatim from the plan's Implementation Notes example (a plain
    HTTP hook, no envelope).
  - `envelopedStatusLinePreFirstResponse` — built from canary-fields.md's "Status-line
    payload" section: `context_window`'s percentages/`current_usage` null,
    `total_input_tokens: 0`, and `rate_limits` entirely absent — the measured
    pre-first-API-response shape ("the whole `rate_limits` key is absent … until a
    session's first API response").
  - `malformedJsonBody` / `rawHookMissingSessionId` — REQ-13's two drop paths; the latter
    is honest to canary-fields.md's observation that every measured hook and status post
    carries `session_id`, so this is a deliberately atypical payload, not a claim about
    real Claude Code behavior.
  - All values are fixed/deterministic (no timestamps, no `seq`, no randomness) per the
    harness rule and canary-fields.md's "no timestamps or sequence numbers exist on any
    hook payload."
- Deleted `web/e2e/smoke.spec.ts` per the plan's Affected Files > E2E instruction — it
  drove the retired Vite dev-server scaffold (`getByTestId("app-shell")`, "Muster —
  pre-M0 shell") that M0 replaces entirely.

`web/playwright.config.ts` was **not** touched, per this agent's constraint (never modify
it or global setup/teardown infra). It still contains the pre-M0 Vite `webServer` block;
the plan's Affected Files > E2E section calls for dropping that block, but that edit falls
to the implementation tracks (daemon-impl/web-impl), not e2e-specs. Collection succeeds
regardless, since `--list` never starts `webServer`. See Notes.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | serves /healthz without authentication |
| REQ-2 | keeps the same UI and ingest tokens across a restart on the same data dir |
| REQ-3 | exchanges the UI token for a session cookie and lands on the rendered shell |
| REQ-4 | exchanges the UI token…; gets a 401 relaunch page for a bad token at /auth |
| REQ-5 | shows the relaunch page for an unauthenticated visit to /; shows the relaunch page for a stale cookie; rejects GET /api/state without the auth cookie with a JSON 401 |
| REQ-6 | rejects GET /api/state…(401 case); GET /api/state returns exactly the M0 snapshot object once authenticated |
| REQ-7 | renders the masthead…(hello+snapshot on connect); rejects a WS upgrade whose Origin host does not match the daemon's own |
| REQ-8 | shows the Claude Code version reported by hello |
| REQ-9 | does not re-apply migrations on a second startup against the same data dir |
| REQ-10 | persists an enveloped SessionStart then a raw Stop for the same session as seq 1 and 2 |
| REQ-11 | persists a status-line POST as an event with type status_line |
| REQ-12 | persists an enveloped SessionStart then a raw Stop for the same session as seq 1 and 2 |
| REQ-13 | rejects a wrong ingest token…(token case is REQ-13-adjacent, see Notes); returns 200 for a malformed JSON hook body and persists nothing; returns 200 for valid JSON with no usable session_id and persists nothing |
| REQ-14 | enforced structurally (all wire-shape knowledge lives in `helpers/payloads.ts`, which is not implementation code); no dedicated E2E assertion — this is a `rg` check (D4) by design |
| REQ-15 | renders the masthead, connection status and empty sessions state after the WS handshake |
| REQ-16 | renders both usage readouts as the word unknown, never an empty gauge |
| REQ-17 | shows the daemon-down banner when the scratch daemon is killed, and clears it on restart |
| REQ-18 | not covered here — Testable UI Elements table marks this "Vitest covers the trigger logic; E2E not required to induce it" |
| REQ-19 | keeps the same UI and ingest tokens across a restart on the same data dir (harness itself is REQ-19; exercised by every spec via `startScratchDaemon`/`teardown`) |
| REQ-20 | exercised implicitly by every `daemon.kill()`/`teardown()` call (SIGTERM path); no dedicated assertion on queue-drain internals — that's a daemon unit-test concern (D12) |
| REQ-21–24 | Should/Nice-Have, non-UI-observable — not E2E's job |

## Repairs (validate / fix modes only)

Not applicable — this is authoring mode.

## E2E Implementation Bugs (if verdict = implementation-bug)

Not applicable — this is authoring mode; nothing has been run.

## Test Run Output

```
$ npx playwright test --list
Listing tests:
  [chromium] › auth.spec.ts:19:1 › serves /healthz without authentication
  [chromium] › auth.spec.ts:28:1 › shows the relaunch page for an unauthenticated visit to /
  [chromium] › auth.spec.ts:34:1 › shows the relaunch page for a stale cookie
  [chromium] › auth.spec.ts:43:1 › rejects GET /api/state without the auth cookie with a JSON 401
  [chromium] › auth.spec.ts:51:1 › exchanges the UI token for a session cookie and lands on the rendered shell
  [chromium] › auth.spec.ts:67:1 › gets a 401 relaunch page for a bad token at /auth
  [chromium] › auth.spec.ts:73:1 › rejects a WS upgrade whose Origin host does not match the daemon's own
  [chromium] › ingest.spec.ts:26:1 › persists an enveloped SessionStart then a raw Stop for the same session as seq 1 and 2
  [chromium] › ingest.spec.ts:63:1 › persists a status-line POST as an event with type status_line
  [chromium] › ingest.spec.ts:81:1 › rejects a wrong ingest token with 404 and persists nothing
  [chromium] › ingest.spec.ts:94:1 › returns 200 for a malformed JSON hook body and persists nothing
  [chromium] › ingest.spec.ts:107:1 › returns 200 for valid JSON with no usable session_id and persists nothing
  [chromium] › resilience.spec.ts:20:3 › daemon resilience › shows the daemon-down banner when the scratch daemon is killed, and clears it on restart
  [chromium] › resilience.spec.ts:40:3 › daemon resilience › keeps the same UI and ingest tokens across a restart on the same data dir
  [chromium] › resilience.spec.ts:53:3 › daemon resilience › does not re-apply migrations on a second startup against the same data dir
  [chromium] › shell.spec.ts:17:1 › renders the masthead, connection status and empty sessions state after the WS handshake
  [chromium] › shell.spec.ts:30:1 › renders both usage readouts as the word unknown, never an empty gauge
  [chromium] › shell.spec.ts:42:1 › shows the Claude Code version reported by hello
  [chromium] › shell.spec.ts:47:1 › GET /api/state returns exactly the M0 snapshot object once authenticated
Total: 19 tests in 4 files
```

Also ran `npx tsc --noEmit` from `web/` (which type-checks `e2e/` per `tsconfig.json`'s
`include`) as an extra pre-flight, since `make web-build` will run this against strict
settings (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`verbatimModuleSyntax`, `noUnusedLocals/Parameters`): clean, no output, exit 0.

## Notes

- **`playwright.config.ts` webServer block**: left untouched (forbidden to me). It still
  points at the retired `npm run dev` Vite server. None of my new specs use it — every
  spec calls `startScratchDaemon()` itself and navigates with absolute
  `daemon.baseURL`/`daemon.dashboardUrl` URLs rather than the config's `baseURL`, so the
  suite is self-sufficient even before that block is dropped. Whoever removes it
  (daemon-impl/web-impl, per the plan's Affected Files list) should also add
  `build web-build` as `make e2e` prerequisites (Makefile row in the same list) so
  `bin/musterd` and `web/dist` exist before the fixture spawns the daemon.
- **REQ-13 wrong-token test's requirement id**: I tagged the "rejects a wrong ingest
  token" test as REQ-13 in the coverage table for grouping, but the wrong-token 404 is
  more precisely Edge Case 8 / the ingest-token check described under REQ-10/11's
  endpoint contract; there's no single REQ number for "bad token → 404" in the Must-Have
  list beyond the endpoints themselves. Flagging so the coverage table isn't read as
  claiming a REQ-13 text match it doesn't have — REQ-13 proper (malformed/missing
  session_id → 200, dropped) has its own two dedicated tests.
- **WS Origin-rejection test** (`rejects a WS upgrade whose Origin...`) sends a raw
  `Sec-WebSocket-*` handshake via `APIRequestContext.get`, expecting the daemon's origin
  check to short-circuit with a plain 403 HTTP response before ever attempting the
  protocol switch (a completed non-101 response is exactly what `fetch`/`APIRequestContext`
  can observe). This is the one test I'm least sure survives contact with the real
  `coder/websocket` handshake path unmodified — if the daemon's origin check only runs
  *inside* the library's `Accept()` after some of the handshake has already progressed,
  the response might not arrive the way a plain HTTP client expects. Flagged for extra
  scrutiny in validate mode; per the agent's decision rule, if this turns out to be my
  locator/expectation being wrong about how the rejection surfaces (e.g. it needs a
  `sec-websocket-key` PlayWright can't correctly frame), that's my repair — if the daemon
  simply accepts the foreign Origin, that's REQ-7's `[daemon-impl]` bug.
- **REQ-18 / protocol-mismatch view**: no E2E test, matching the plan's own Testable UI
  Elements table note ("Vitest covers the trigger logic; E2E not required to induce it").
  Inducing a `protocolVersion != 1` `hello` from a real daemon would require either a
  build flag or WS message tampering that isn't in scope for a faithful-payload E2E suite.
- **REQ-14** (Claude-Code wire-format names confined to `internal/claudecode/`) is
  enforced by the Automated Checks `rg` command (D4), not by an E2E assertion — E2E has
  no way to observe package boundaries from outside the binary. My own
  `helpers/payloads.ts` necessarily contains the real field names (`hook_event_name`,
  `session_id`, etc.) since it's synthesizing what Claude Code would send; this file
  lives under `web/e2e/`, outside the grep's `cmd/ internal/` scope, so it does not
  trip D4.
- All four spec files assume a worker-scoped `ScratchDaemon` (module-level variable +
  `test.beforeAll`/`afterAll`), matching the fixture pattern implied by the plan's
  `helpers/daemon.ts` description. `resilience.spec.ts` additionally wraps its tests in
  `test.describe.serial(...)` because its three tests deliberately chain kill/restart
  state; `auth.spec.ts`, `shell.spec.ts` and `ingest.spec.ts` use distinct
  `claude_session_id`s (or no shared mutable state at all) so they stay safe under
  `fullyParallel: true` without serial.
- Everything here is `authored`, not run — no `bin/musterd` and no `web/dist` build exist
  yet. Per the authoring-mode gate, only `npx playwright test --list` (plus the `tsc`
  pre-flight above) was used to validate the suite; no attempt was made to make any test
  pass.

## Validate Attempt 1

Read `plans/m0-skeleton/daemon-implementation.md` and `plans/m0-skeleton/web-implementation.md`
first to confirm what was actually built (both confirmed no changes to `web/e2e/**`,
so the specs above were untouched by either implementation track). Confirmed
`bin/musterd` and `web/dist` exist (built), and `sqlite3` is on `PATH` for the db oracle.

Ran, from `web/`:

```
npx playwright test --list        # collection gate, pre-run
npm run e2e -- e2e/auth.spec.ts e2e/shell.spec.ts e2e/ingest.spec.ts e2e/resilience.spec.ts
npx playwright test --list        # collection gate, post-run (no edits were made, but re-verified per protocol)
```

All 19 tests passed on the **first** live run. No locator, timing, or fixture defect was
found — nothing needed repair. In particular, the one test flagged in the authoring log
as "least sure survives contact with the real handshake" (the foreign-`Origin` WS
rejection in `auth.spec.ts`) passed cleanly: the daemon's origin check does short-circuit
with a plain 403 before the protocol switch, so `APIRequestContext.get` observes it as an
ordinary completed HTTP response, exactly as the test expected.

No spec file, helper, or fixture was modified in this attempt.

### Repairs

None. No test required a locator change, wait adjustment, or fixture correction.

`No assertion was deleted, skipped, or weakened.`

### Test Run Output

```
> muster-web@0.0.0 e2e
> playwright test e2e/auth.spec.ts e2e/shell.spec.ts e2e/ingest.spec.ts e2e/resilience.spec.ts

Running 19 tests using 6 workers

  ✓   1 [chromium] › e2e/auth.spec.ts:19:1 › serves /healthz without authentication (36ms)
  ✓   4 [chromium] › e2e/ingest.spec.ts:63:1 › persists a status-line POST as an event with type status_line (68ms)
  ✓   6 [chromium] › e2e/ingest.spec.ts:26:1 › persists an enveloped SessionStart then a raw Stop for the same session as seq 1 and 2 (61ms)
  ✓   8 [chromium] › e2e/ingest.spec.ts:81:1 › rejects a wrong ingest token with 404 and persists nothing (317ms)
  ✓   9 [chromium] › e2e/ingest.spec.ts:94:1 › returns 200 for a malformed JSON hook body and persists nothing (326ms)
  ✓  10 [chromium] › e2e/ingest.spec.ts:107:1 › returns 200 for valid JSON with no usable session_id and persists nothing (325ms)
  ✓   5 [chromium] › e2e/auth.spec.ts:73:1 › rejects a WS upgrade whose Origin host does not match the daemon's own (424ms)
  ✓   3 [chromium] › e2e/auth.spec.ts:34:1 › shows the relaunch page for a stale cookie (603ms)
  ✓   2 [chromium] › e2e/auth.spec.ts:51:1 › exchanges the UI token for a session cookie and lands on the rendered shell (634ms)
  ✓  12 [chromium] › e2e/shell.spec.ts:17:1 › renders the masthead, connection status and empty sessions state after the WS handshake (601ms)
  ✓   7 [chromium] › e2e/auth.spec.ts:28:1 › shows the relaunch page for an unauthenticated visit to / (588ms)
  ✓  14 [chromium] › e2e/auth.spec.ts:43:1 › rejects GET /api/state without the auth cookie with a JSON 401 (45ms)
  ✓  15 [chromium] › e2e/auth.spec.ts:67:1 › gets a 401 relaunch page for a bad token at /auth (186ms)
  ✓  13 [chromium] › e2e/shell.spec.ts:30:1 › renders both usage readouts as the word unknown, never an empty gauge (196ms)
  ✓  17 [chromium] › e2e/shell.spec.ts:47:1 › GET /api/state returns exactly the M0 snapshot object once authenticated (167ms)
  ✓  16 [chromium] › e2e/shell.spec.ts:42:1 › shows the Claude Code version reported by hello (180ms)
  ✓  11 [chromium] › e2e/resilience.spec.ts:20:3 › daemon resilience › shows the daemon-down banner when the scratch daemon is killed, and clears it on restart (2.5s)
  ✓  18 [chromium] › e2e/resilience.spec.ts:40:3 › daemon resilience › keeps the same UI and ingest tokens across a restart on the same data dir (325ms)
  ✓  19 [chromium] › e2e/resilience.spec.ts:53:3 › daemon resilience › does not re-apply migrations on a second startup against the same data dir (333ms)

  19 passed (7.2s)
```

Post-run collection re-check:

```
Total: 19 tests in 4 files
```

### Notes (Validate Attempt 1)

- `web/playwright.config.ts` now matches what the authoring-mode notes anticipated: the
  Vite `webServer` block and shared `baseURL` were dropped by web-impl, and the chromium
  project was kept. No spec relied on either, so this required no spec changes.
- `web/e2e/smoke.spec.ts` is confirmed absent — nothing to double-delete.
- The REQ-13/Edge-Case-8 labeling caveat and the REQ-18/REQ-14 coverage notes from the
  authoring log still hold; nothing observed in this run changes those judgment calls.
