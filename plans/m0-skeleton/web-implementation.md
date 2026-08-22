# Web Implementation: M0 Skeleton

**Plan**: m0-skeleton
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/protocol.ts` | created | `Hello`/`Snapshot`/`Usage`/`Session`/`Prefs` types per `docs/protocol.md` §5; `parseMessage()` validates known fields and ignores unknown types/fields (protocol §1); `isSupportedProtocolVersion()` for REQ-18's gate; `UNKNOWN_USAGE` constant for the pre-hello initial state |
| `web/src/ws.ts` | created | The single WebSocket client module (docs/conventions.md). `WsClient` class: connect, backoff reconnect loop, dispatches parsed messages to handler callbacks (`onConnecting`/`onConnected`/`onHello`/`onSnapshot`/`onDisconnected`/`onProtocolMismatch`). Exports pure `backoffDelay(attempt)` (500ms×2ⁿ capped at 8000). Socket construction is injectable (`SocketFactory`) so logic is testable without a real socket; only the default factory calls `new WebSocket(...)` |
| `web/src/render/masthead.ts` | created | Pure DOM updates: `renderConnectionStatus`, `renderUsage` (renders "unknown" word only, no track, when a bucket is null — REQ-16/W8), `renderClaudeVersion` (unknown when `installed` null, drift text when `drift` true — REQ-8) |
| `web/src/render/banner.ts` | created | `renderBanner()` toggles the daemon-down banner's `hidden` attribute |
| `web/src/render/sessions.ts` | created | `renderSessions()` — "No sessions yet" empty state; M1 replaces the non-empty branch |
| `web/src/main.ts` | rewritten | Replaces the pre-M0 placeholder. Wires `WsClient` to the render functions; derives connection-status text and banner visibility from the client's lifecycle callbacks; swaps to the protocol-mismatch view on `onProtocolMismatch` |
| `web/src/style.css` | created | Design-system §1 token subset (ink/panel/line/paper/muted/dim/rose/mono/sans) for the masthead, banner and empty-state — nothing else exists yet to need the rest of the token set |
| `web/index.html` | rewritten | Shell skeleton: masthead (`<h1>Muster</h1>`, usage/version/status spans), banner (`role="alert"`), sessions main area, protocol-mismatch view — all populated by `main.ts`, no hardcoded dynamic text |
| `web/playwright.config.ts` | edited | Dropped the Vite `webServer` block and shared `baseURL` entirely, per plan's Affected Files > E2E instruction; kept the chromium project. Every spec already drives its own scratch daemon via absolute URLs (confirmed: `npx playwright test --list` still lists all 19 tests unchanged) |

## Decisions

- **Banner visibility gated on `everConnected`, not literally "socket not helloed" from page load.** The design-system Views section says the banner is "shown whenever the socket is not open-and-helloed," which taken completely literally would flash "musterd unreachable" during the initial connect on every page load — even though the daemon obviously just served that page. I implemented `bannerVisible = everConnected && status !== "connected"`: the banner only appears once a `hello` has been received at least once and then the socket drops. This matches REQ-17's actual wording ("when the socket drops... shows the... banner"), the States section (the initial "no data yet" state describes only `connecting…` text, no banner), and the Testable UI Elements table's "present only while disconnected" (a subset relationship, not a contradiction) — while avoiding a dishonest transient banner that the design system's own honesty rules would otherwise flag. Flagging as a judgment call since the Views section's literal wording could be read either way.
- **`Session` type in `protocol.ts` is typed per the full `docs/protocol.md` §5.3 shape, but `parseSessions()` doesn't deep-validate individual session fields** — it only checks `sessions` is an array and trusts the daemon's shape (`value as Session[]`). M0's daemon only ever sends `sessions: []` (no code path produces a non-empty array until M1's state machine), so per-field validation would be dead code nothing in M0 can exercise; deferred to M1 when it's actually testable against real data.
- **`web/e2e/smoke.spec.ts` and the old `web/vite.config.ts` E2E proxy comment**: smoke.spec.ts was already absent (deleted by the e2e-specs agent per the plan) — verified via `find web/e2e -iname "smoke*"` returning nothing. `vite.config.ts` was left untouched since the plan's Affected Files list doesn't mention it and M0 doesn't need the dev-proxy it describes for anything the build/test gates check.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0 (confirmed via both direct `npm` commands and `make web-build`/`make web-test` from the repo root — all clean, no output/errors).

No test files needed changes. `web/e2e/*.spec.ts` and `web/e2e/helpers/*` were not touched; `npx playwright test --list` still lists all 19 tests after the `playwright.config.ts` edit, confirming nothing in the spec files depended on the removed `webServer`/`baseURL` config.

Nothing here changes the protocol contract — `protocol.ts` implements exactly `docs/protocol.md` §5.1/§5.2/§5.3/§5.4 as written, including the plan's `hello` nullability clarification.
