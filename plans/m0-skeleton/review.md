# Review: M0 Skeleton

**Plan**: m0-skeleton
**Verdict**: approved

Zero critical issues. Full E2E suite green (19/19), every authored acceptance check passes,
hard-rule checklist clean, all must-have requirements verified — several by hand in a real
browser and against a real scratch daemon rather than by trusting the test logs.

Two Major issues are recorded below. Neither blocks approval under the verdict rules, but
both should be fixed before M1 builds on this skeleton: one is an acceptance check that
reports green only because a source literal was split to evade it, the other is a
design-token conflict that gets more expensive to fix once M1 renders failed sessions.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 `/healthz` on 127.0.0.1, no auth | Yes | E2E + unit | pass |
| REQ-2 tokens generated once, kv-persisted | Yes | E2E restart | pass |
| REQ-3 `tokens.json` mode 0600 | Yes | E2E + manual | pass |
| REQ-4 `/auth` sets cookie, 303 → `/` | Yes | E2E + unit | pass |
| REQ-5 401 HTML for static, 401 JSON for API/WS, constant-time | Yes | E2E + unit | pass |
| REQ-6 `GET /api/state` == snapshot payload | Yes | E2E `toEqual` | pass |
| REQ-7 `/ws` hello+snapshot, foreign-Origin 403 | Yes | E2E + unit | pass |
| REQ-8 hello nullability (`installed`/`drift` null) | Yes | unit + manual | pass |
| REQ-9 WAL + forward-only embedded migrations | Yes | E2E + unit | pass |
| REQ-10 both hook shapes, immediate 200, async persist | Yes | E2E + unit | pass |
| REQ-11 status endpoint → `type="status_line"` | Yes | E2E + unit | pass |
| REQ-12 monotonic seq per `claude_session_id`, all columns | Yes | E2E + unit + manual | pass |
| REQ-13 wrong token 404; malformed/no-session 200+drop; no payload logs | Yes | E2E + unit + manual | pass |
| REQ-14 wire-format knowledge confined to `internal/claudecode` | Yes (impl) | D4 grep | pass — see Major 1 for the test-file caveat |
| REQ-15 masthead + empty sessions state | Yes | E2E + browser | pass |
| REQ-16 usage renders **unknown**, no gauge | Yes | E2E + Vitest + browser | pass |
| REQ-17 daemon-down banner + backoff reconnect | Yes | E2E + Vitest + browser | pass |
| REQ-18 protocol-mismatch view | Yes | Vitest | pass |
| REQ-19 E2E harness: per-run port/data dir, no reuse, killed | Yes | read + observed | pass |
| REQ-20 graceful SIGINT/SIGTERM shutdown | Yes | unit + manual | pass |
| REQ-21 zerolog, one root logger in `main` | Yes | read | pass |
| REQ-22 `make run` | Yes | read | pass |
| REQ-23 bounded ingest queue, drop+count+log | Yes | unit | pass |
| REQ-24 `make run` opens browser (Nice to Have) | No | — | not implemented, deliberately (logged in daemon-implementation.md) |

## Build & Tests

E2E tests: **pass** (19/19, full suite via `make e2e` — not just this plan's specs)
Daemon tests: **pass** (42 top-level / 80 with subtests)
Web tests: **pass** (62)
Daemon build: **pass**
Web build: **pass** (`tsc --noEmit` + `vite build`)
Lint: **pass** (`golangci-lint run` — 0 issues)

The E2E run was a regression sweep across all four spec files. No spec outside this plan
exists yet, so nothing pre-existing could regress; `web/e2e/smoke.spec.ts` was correctly
deleted (it drove the retired Vite scaffold).

`test-specs.md`'s Repairs table is empty and its claim is truthful: the suite passed on the
first live run, and I verified independently that no assertion was deleted, skipped or
weakened — no `test.skip`/`test.fixme`/`.only` anywhere in `web/`, no `t.Skip` in `internal/`,
and no container-level `toBeVisible()` standing in for a real assertion. Every negative test
proves absence with a real oracle (`countAllEvents` before/after), not by omission.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass |
| D2 | `go build ./...` | pass |
| D3 | `make lint` | pass |
| D4 | `! rg -n "hook_event_name\|…" cmd/ internal/ --glob '!internal/claudecode/**'` | pass — **but only because a source literal was split to evade it; see Major 1** |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass |
| W7 | `! rg -n "new WebSocket" web/src --glob '!web/src/ws.ts'` | pass |
| E1 | `make e2e` | pass |

Every line was run exactly as written from the repo root. D4 is flagged rather than taken at
face value: it exits 0, so the check formally passes, but it would not have if
`internal/server/ingest_test.go` spelled the field normally.

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D5 | seq per `claude_session_id` across both endpoints, interleaved | pass | `store_test.go` covers interleaved two-session inserts and the `/clear` restart case; `ingest_test.go` `TestIngestPipeline_SeqAssignmentAcrossHookAndStatusEndpoints` proves both HTTP endpoints funnel into it. Confirmed live: seq 1/2 across an enveloped then raw POST |
| D6 | envelope-vs-raw parsing incl. absent envelope fields | pass | `claudecode/ingest_test.go` 7 subtests; `store_test.go` nullable/populated column pairs. Confirmed live: `muster_session`/`tmux_pane` set on the enveloped row, NULL on the raw one |
| D7 | malformed + missing-`session_id` drops return 200 | pass | unit tests on both paths; confirmed live (malformed → 200, nothing persisted) |
| D8 | migration idempotence | pass | `TestMigrate_SecondCallIsANoOp` asserts existing data survives, not just the row count; E2E re-checks across a real restart |
| D9 | auth middleware, JSON-vs-HTML 401 split | pass | `TestRequireCookie` (4 subtests incl. empty cookie), plus routing-level tests for `/api/state` and static incl. stale cookie |
| D10 | handler is enqueue-then-200, no synchronous DB work | pass | read `ingest.go:120-137` — token check, `io.ReadAll`, `enqueue`, `WriteHeader(200)`. Parsing and insertion happen in `process()` on the worker goroutine. `TestHandleIngest_ReturnsBefore200WithNoSynchronousDBWork` proves it by never starting the worker |
| D11 | no payload bodies in any log | pass | read every log call on the ingest path — all carry only `kind`/`dropped_total`. The parse-error branch deliberately omits `Err(err)`. Verified live: POSTed `last_assistant_message:"SUPERSECRETPROMPTTEXT"`, grepped the daemon log, 0 hits |
| D12 | shutdown honours context cancellation | pass | `ingestQueue.Stop` selects on `ctx.Done()`; `http.Server.Shutdown` precedes `srv.Shutdown` so no handler can send on the closed channel; `defer st.Close()` runs last. Verified live: SIGTERM → clean "shutting down" line, process exits, port released |
| W3 | no `any` in new TS | pass | grepped `web/src` and `web/e2e` — the only hits are the word "any" in prose and test names. See Minor 8 on the one unchecked cast |
| W4 | `backoffDelay` schedule | pass | `ws.test.ts` asserts 500/1000/2000/4000/8000/8000, and separately that real repeated drops walk the schedule and that a `hello` resets the counter |
| W5 | `parseMessage` ignores unknown types and fields | pass | unknown type, missing type, 6 non-object frame shapes, and unknown-fields-inside-`usage`/`prefs` all covered |
| W6 | protocol-version gate | pass | `isSupportedProtocolVersion` rejects 0/2/-1/1.5; `ws.test.ts` proves a mismatched hello routes to `onProtocolMismatch` and does *not* reset backoff |
| W8 | unknown usage is the word only, no track in the DOM | pass | `renderUsage` writes `textContent` only. Verified in the browser: `5h unknown` / `7d unknown`, and a query for `progress, meter, [role=progressbar], .track, .gauge, .bar` returned **0** elements |
| — | masthead/banner styling uses §1 tokens | partial | every declaration resolves to a `var(--…)`; no hard-coded hex in any component rule. But the banner's chosen token is wrong — see Major 2 |
| — | zerolog root logger built in `main` | pass | `main.go:76` builds the only logger; passed down via `Config.Logger`. No package-level logger, no `init()`, no slog left |
| — | E2E harness: per-run port, per-run data dir, no reuse, killed on teardown | pass | `freePort()` binds :0; `mkdtemp` per run; no `webServer` block and no shared `baseURL` in `playwright.config.ts`; `teardown()` SIGTERMs with 5s SIGKILL escalation then removes the dir. Caveats in Minor 5–6 |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary — no Claude-Code format knowledge outside `internal/claudecode/` | pass (implementation) — the only wire names elsewhere are Muster's own snake_case DB column names, which the plan itself specifies. Test-file caveat: Major 1 |
| 2 | No terminal-output state parsing | pass — no `capture-pane` anywhere in `cmd/` or `internal/`; state is not derived at all in M0 |
| 3 | Non-blocking hook handler | pass — enqueue-then-200; no hook registration exists yet, so no timeout to check |
| 4 | tmux always via `-L muster`; `pty.Setsize` + `resize-window` | N/A — M0 invokes tmux nowhere. `tmux_pane`/`tmuxPane` are column/field names only |
| 5 | Never log hook payloads | pass — verified by reading every log call and by a live marker-string test |
| 6 | No empty-gauge dishonesty | pass — the word *unknown*, zero gauge/track elements in the DOM |
| 7 | Session identity on the tmux target, never `session_id` | N/A — no session identity exists in M0. `event.claude_session_id` is the event-log key, which the plan explicitly justifies; M1 must key sessions on the tmux target |
| 8 | No `~/.claude/settings.json` trespass, no `CLAUDE_CONFIG_DIR` | pass — zero references |
| 9 | No real `claude` outside canary/probes | pass — the only invocation is `claude --version` in the pre-existing drift check (no API call, no subscription burn). The E2E harness spawns `bin/musterd`, never `claude` |

Design-system §6 honesty rules: #1 verified clean in the browser; #2–#6 are vacuous in M0
(no context row, no permission mode, no failure display, no "Done" state, no cost field
anywhere in `protocol.ts`); #7 verified clean; #8 vacuous, see Minor 9.
Design-system §7 terminal rules: entirely N/A — no terminal, no xterm.js, no resize calls.

## Manual Verification

Built `bin/musterd` and drove a scratch daemon on a throwaway data dir at
`127.0.0.1:8791`, with a real Chromium session against the built `web/dist`.

Confirmed by hand:

- **Auth handoff** — opened the real `dashboardUrl` from `tokens.json`; landed on the
  rendered shell. `tokens.json` is `-rw-------` (0600).
- **Shell, data state** — masthead reads `Muster` / `5h unknown` / `7d unknown` /
  `claude 2.1.239 (drift from pinned 2.1.233)` / `connected`; main area `No sessions yet`.
  The drift branch rendered honestly against my actually-installed 2.1.239 vs the 2.1.233
  pin. `font-variant-numeric: tabular-nums` computed on the readouts. **Zero** gauge/track
  elements in the DOM, so REQ-16 holds structurally and not just textually.
- **Daemon-down** — SIGTERMed the daemon: log emitted one clean `shutting down` line and
  the process exited (REQ-20). The banner appeared with `role="alert"`, the mandated
  *musterd unreachable* text, full-bleed width (1200px of a 1200px body), and the status
  flipped to `reconnecting…`. Screenshot reviewed for the visual read.
- **Reconnect** — restarted on the same port and data dir: banner cleared, status returned
  to `connected`, and `performance.getEntriesByType('navigation').length === 1` proved it
  happened **without a page reload** (E12's real claim, which the E2E spec asserts only
  indirectly).
- **Ingest, by hand** — enveloped `SessionStart` then raw `Stop` for one session → 200/200,
  persisted as `seq` 1 and 2, `muster_session=1`/`tmux_pane=%12` on the enveloped row and
  NULL on the raw one, payload stored byte-verbatim. Wrong token → 404. Malformed JSON →
  200 with nothing persisted.
- **Log hygiene (D11)** — the raw `Stop` carried
  `last_assistant_message:"SUPERSECRETPROMPTTEXT"`; grepping the full daemon log for that
  marker, for `last_assistant_message`, and for the malformed body found **0** hits. The
  drop was logged as `dropping unparseable ingest post kind=hook` with no body.

One console error appears on load: `GET /favicon.ico 404`. Cosmetic — the request is
authenticated, passes the cookie check, and the file simply doesn't exist. Not a finding.

The scratch daemon, its data dir, and the screenshot were removed; no stray files remain in
the working tree and no `musterd` is left running.

## Issues

### Critical

None.

### Major

1. **[daemon-tests]** D4 passes only because the field name was split to evade it —
   `internal/server/ingest_test.go:28`:
   ```go
   const hookEventNameKey = "hook_event" + "_name"
   ```
   Used at lines 120 and 231 to build bodies POSTed to the real `/hook` endpoint. The
   accompanying comment discloses the intent openly, and its architectural argument is
   reasonable: `internal/server` never *parses* this field, it only ships bytes to a
   boundary that delegates to `claudecode.ParseIngestBody`. But the consequence is that an
   authored acceptance check now reports green while the literal is materially present and
   sent from outside `internal/claudecode`, so the next reader of "D4 pass" is misled, and
   the precedent means a future genuine leak could be hidden the same way.
   **Fix** (either, both small): move the fixture body behind an exported test helper in
   `internal/claudecode` — the one package allowed to know the spelling — and call it from
   `internal/server`; **or** narrow D4 to non-test sources (`--glob '!**/*_test.go'`), which
   changes an approved acceptance check and therefore needs the user's sign-off. Do not
   leave the split literal in place with the check reporting green.

2. **[web-impl]** Daemon-down banner uses the Failed-state token as its ground —
   `web/src/style.css:75-83` sets `background: var(--rose)`, which the browser confirms
   renders as full-saturation `#E36A6A`. Design-system §3 is explicit: "A state colour may
   **only** mean that state", and `--rose` means Failed. The reference render disagrees too:
   `docs/design/mockups/a-instrument.html:55-57` paints this banner `#3A1E1E` ground /
   `#5A2C2C` border / `#F3B7B7` text, reserving `var(--rose)` for the daemon-down *health
   dot* (line 59). As soon as M1 lands failed-session cards with their 3px `--rose` stripe,
   one token will carry two meanings and the banner will visually out-shout the actual
   failure it sits above.
   **Fix**: per §1's own instruction ("if a needed colour isn't here, add it here first"),
   add the three banner colours to the design system's `:root` token block, then reference
   them from `.banner`. §6.7's "loudly" is satisfied either way — the reference treatment is
   still a full-bleed bar with a border.

### Minor

1. **[daemon-impl]** `received_at` is stamped at insert time, not arrival —
   `internal/store/store.go:97`. The plan's Implementation Notes specify the handler
   "enqueues `{body, receivedAt}`", but `ingestJob` (`internal/server/ingest.go:20-23`)
   carries only `{kind, body}`. Harmless while the queue is empty; under a backlog the
   column drifts from the arrival time its own schema comment documents. Unlike the
   implementation log's three other deviations, this one wasn't flagged in Decisions.
2. **[daemon-impl]** `received_at` uses `time.RFC3339` — second granularity. Verified live:
   two events ingested in the same second share an identical timestamp. Nothing is broken
   (`event.id` and `seq` carry order), but M3's ~435 ms duplicate status-post pairs will want
   `time.RFC3339Nano` to be distinguishable.
3. **[daemon-impl]** The plan's own DDL and `store.go` comments were reworded to avoid
   tripping D4 (disclosed in `daemon-implementation.md`). Benign on its own — a comment
   isn't wire-format knowledge — but it is the same check-evasion pattern as Major 1, and
   the same root cause: D4's scope.
4. **Plan defect** (no routing tag) — D4's grep covers `_test.go` files, which is what forced
   both evasions above. Worth scoping the check to non-test sources when the plan template
   is next revised, so the tripwire fires only where the rule actually applies.
5. **[e2e-specs]** `web/e2e/helpers/daemon.ts:92` pipes the daemon's stdout/stderr
   (`stdio: ["ignore", "pipe", "pipe"]`) but never reads or drains them. A daemon that dies
   at startup therefore fails as an opaque 10s "never became healthy" with its own
   diagnostics discarded, and a sufficiently chatty daemon could block on a full pipe
   buffer. M0 logs ~2 lines per startup so it cannot hang today. Suggest capturing the
   output and surfacing it on failure, or `"inherit"`.
6. **[e2e-specs]** `freePort()` closes its probe listener before the daemon binds
   (`daemon.ts:26-40`), so under `fullyParallel: true` two workers can in principle race for
   the same port, surfacing as the same opaque timeout. Suite is green; noting the latent
   flake.
7. **[e2e-specs]** Fixture omissions vs `spikes/canary-fields.md`: `rawStop` omits
   `background_tasks` and `session_crons` (canary-fields.md:43); the status-line fixture
   omits `cost` (171-172), `prompt_id` (101-103) and `session_name` (166, plausibly
   consistent with its documented "absent from the earliest posts"). **No fabricated
   fields** — the honesty rule holds, and the pre-first-response shape (`rate_limits` key
   entirely absent, `context_window` percentages/`current_usage` null,
   `total_input_tokens: 0`) matches the measurements exactly. `prompt_id` is the only
   omission M0's parser would have read; `internal/claudecode/ingest_test.go` covers that
   extraction directly, so this is a completeness nit, not a coverage hole.
8. **[web-impl]** `parseSessions` casts `value as Session[]` without per-field validation
   (`web/src/protocol.ts:178-181`, deviation documented). No `any`, and M0's daemon only ever
   sends `[]` — but the cast will silently admit malformed sessions the moment M1 populates
   the array, which is exactly when it stops being dead code.
9. **Forward-looking** (no tag) — design-system §6.8 ("stale is labelled, not hidden") is
   vacuous in M0: behind the daemon-down banner the only retained values are `unknown` usage
   and a startup version fact, so nothing false is asserted. It becomes mandatory the moment
   M1 renders session cards that persist across a disconnect.
10. **[daemon-impl]** `-addr` accepts any bind address, so REQ-1's "127.0.0.1 only" is a
    default rather than an invariant, while the flag help calls it "localhost only by
    design". Fine for a single-user personal tool; noting the gap between the help text and
    the enforcement.
