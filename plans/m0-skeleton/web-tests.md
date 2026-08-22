# Web Tests: M0 Skeleton

**Plan**: m0-skeleton
**Verdict**: pass

## Summary

Tests created: 62 | Passing: 62 | Failing: 0

Five new test files, one per logic/formatting module named in `web-implementation.md`.
`main.ts` (wiring: DOM `querySelector`s at import time, constructs `WsClient`, calls
`.start()` which opens a real socket) is intentionally left untested by Vitest — it has
no logic beyond a one-line banner-visibility derivation (`everConnected && status !==
"connected"`), which the web-impl agent already flagged as "about as much as belongs
outside a pure module." Not tangled enough to call an implementation bug; it's covered
by E2E (E6, E11, E12 exercise exactly this via a real daemon/socket).

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `protocol.test.ts` | parses a fully-populated hello | valid hello round-trips | pass |
| `protocol.test.ts` | parses the pre-first-response nullability state: installed and drift both null | protocol §5.1 measured absence | pass |
| `protocol.test.ts` | ignores unknown top-level fields | additive evolution §1 | pass |
| `protocol.test.ts` | rejects hello missing protocolVersion / bad daemon.version / missing claudeCode / bad pinned / bad drift type | malformed hello shapes | pass (5 tests) |
| `protocol.test.ts` | parses the M0 empty-sessions, null-usage snapshot | REQ-6/REQ-16 shape | pass |
| `protocol.test.ts` | parses a snapshot with a populated usage bucket | non-null usage decode | pass |
| `protocol.test.ts` | rejects sessions-not-array / missing usage / bad usedPct / bad source / bad prefs.view | malformed snapshot shapes | pass (5 tests) |
| `protocol.test.ts` | ignores unknown fields inside usage and prefs | additive evolution | pass |
| `protocol.test.ts` | ignores an unknown message type | forward compatibility | pass |
| `protocol.test.ts` | ignores a message with no type field | malformed envelope | pass |
| `protocol.test.ts` | rejects non-object top-level data: null/undefined/string/number/bool/array | malformed WS frame payloads | pass (6 cases) |
| `protocol.test.ts` | isSupportedProtocolVersion accepts 1 / rejects 0,2,-1,1.5 | REQ-18 gate | pass (5 cases) |
| `protocol.test.ts` | UNKNOWN_USAGE is fully-null | pre-hello initial state | pass |
| `ws.test.ts` | backoffDelay doubles from 500ms and caps at 8000ms | REQ-17 schedule (W4) | pass |
| `ws.test.ts` | dispatch routes supported hello / unsupported hello / snapshot / null | pure dispatch logic | pass (4 tests) |
| `ws.test.ts` | start() calls onConnecting immediately | connection lifecycle | pass |
| `ws.test.ts` | onConnected + dispatches parsed hello on message | open/message wiring | pass |
| `ws.test.ts` | ignores non-JSON and binary message frames without throwing | malformed WS frames | pass (2 tests) |
| `ws.test.ts` | onDisconnected + reconnect after backoffDelay(0)=500ms | REQ-17 | pass |
| `ws.test.ts` | backs off across repeated drops (500 → 1000ms) | REQ-17 schedule under real drops | pass |
| `ws.test.ts` | resets backoff attempt after a hello is received | attempt-counter reset on reconnect | pass |
| `ws.test.ts` | a protocol-mismatch hello does not reset the backoff attempt counter | mismatch vs. real hello distinction | pass |
| `ws.test.ts` | closes the socket on an error event | error→close path | pass |
| `ws.test.ts` | stop() prevents any further reconnect attempt | teardown | pass |
| `ws.test.ts` | a close event from a superseded socket is not double-handled | stale-socket guard | pass |
| `render/masthead.test.ts` | renderConnectionStatus renders connected/connecting/reconnecting | masthead status text | pass (3 cases) |
| `render/masthead.test.ts` | renderUsage: both null → "5h/7d unknown" | REQ-16/W8 honesty rule | pass |
| `render/masthead.test.ts` | renderUsage: rounds a present bucket's percentage | formatting | pass |
| `render/masthead.test.ts` | renderUsage: boundary values 0 and 99.6 round to 0%/100% | formatting boundaries | pass |
| `render/masthead.test.ts` | renderUsage: one bucket null renders independently | mixed null/non-null | pass |
| `render/masthead.test.ts` | renderClaudeVersion: null info → "claude unknown" | pre-hello state | pass |
| `render/masthead.test.ts` | renderClaudeVersion: installed null → unknown text regardless of drift | protocol §5.1 | pass |
| `render/masthead.test.ts` | renderClaudeVersion: drift true → drift text | REQ-8 | pass |
| `render/masthead.test.ts` | renderClaudeVersion: drift false → plain version | REQ-8 | pass |
| `render/banner.test.ts` | renderBanner unhides when visible=true | daemon-down banner | pass |
| `render/banner.test.ts` | renderBanner hides when visible=false | banner clear | pass |
| `render/sessions.test.ts` | renders "No sessions yet" for empty array | REQ-15 empty state | pass |
| `render/sessions.test.ts` | renders a count placeholder for non-empty arrays (plural and singular) | pre-M1 fallback branch | pass (2 cases) |

## Implementation Bugs

None found.

## Test Run Output

```
> muster-web@0.0.0 test
> vitest run

 RUN  v4.1.10 /Users/damian/Documents/code/Projects/muster/web

 Test Files  5 passed (5)
      Tests  62 passed (62)
   Start at  14:56:39
   Duration  246ms (transform 191ms, setup 0ms, import 263ms, tests 36ms, environment 1ms)
```

`npx tsc --noEmit` — clean, no output.
`npm run build` (and `make web-build`) — succeeds (`vite build` completes, `dist/` produced).
`make web-test` — 62/62 passing, matches the direct `npm test` run above.
`rg -n "new WebSocket" web/src --glob '!web/src/ws.ts'` — no matches (W7 automated check intact).
