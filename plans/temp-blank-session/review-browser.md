# Browser review: temp-blank-session (#128, auth cookie named by port)

**Plan**: temp-blank-session (hand-made fix, uncommitted on `main`; no plan.md, research `research/e1.md`)
**Verdict**: approved
**Cycle**: 1
**Pack**: not run (no plan.md to pack against)
**Rig**: `go build` of the working tree (HEAD 90d51ea4 + uncommitted diff) to a scratchpad binary, `-web-dist internal/webui/assets`; data dirs `<scratchpad>/rig/data A|B|B2|D` (space-bearing); tmux sockets `/tmp/mbr.ExXC/t-<n>.sock` (the scratchpad path exceeds AF_UNIX's 103 bytes); E2E stub `claude` script via `-claude-bin`; `-on-exit kill`; headless Chromium driven by a standalone Node script (not the Playwright runner, so the gate lock held by the full sweep was never taken). Everything killed, sockets' servers killed, socket dir removed, `git status` unchanged.

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| A stays signed in when B is authed in the same context | focus | data | swaps show terminals, no overlay | pass | 4 swaps real-a/real-b after B's `/auth`: each `{"ready":true,"overlays":[],"visibleDownText":[]}` (MUSTER-STUB-READY in region, re-read after 1.2 s); zero 401 responses observed on A's tab |
| same | tiles | data | both tiles live | pass | `["Terminal: real-a:ready=true:down=false","Terminal: real-b:ready=true:down=false"]` |
| same | pop-out | — | — | N/A — the fix is the auth cookie; no pop-out surface involved beyond the same cookie check |
| A `/api/state` | — | data, B authed | 200 | pass | `A /api/state: 200`, `B /api/state (same ctx): 200` |
| A refresh renders shell | focus | data, B authed | 200 + shell | pass | `A refresh: 200 heading=1`, then swap real-a ready, no overlay |
| B still works beside A | focus | data | B refresh + state | pass | `B tab refresh heading=1 B /api/state=200` |
| A after B stopped | focus | B down | swaps, state, refresh | pass | swaps real-b/real-a ready, no overlay; `/api/state` 200; refresh 200 heading=1 |
| Both cookies present | — | — | `muster_auth_<A>`, `muster_auth_<B>` | pass | `muster_auth_60504@127.0.0.1/ httpOnly=true sameSite=Strict | muster_auth_60516@127.0.0.1/ httpOnly=true sameSite=Strict`; no bare `muster_auth` set by either |
| Upgrade: bare cookie with A's token | focus | data | loads, renamed | pass | `GET / -> 200 set-cookie=muster_auth_60504=<tok>; Path=/; Max-Age=2592000; HttpOnly; SameSite=Strict`; shell heading present; swap real-a ready; with the bare cookie then removed, `/api/state=200` on the port-named one alone |
| Bare cookie with B's token on A | — | — | refused | pass | `GET / -> 401`, relaunch page shown, no Set-Cookie; `/api/state=401`; same bare cookie on B → 200 and `muster_auth_61307` set |
| Stale port-named + valid bare on A | — | — | falls back to bare, rewrites | pass | `GET / -> 200`; `muster_auth_60504` now carries A's token; `/api/state=200` |
| Daemon-down surfaced (§6) | focus | daemon-down | prominent | pass (unchanged) | after SIGTERM: banner `musterd unreachable — hook output in open panes is Muster's absence, not session failure.`, status `reconnecting…` |
| Control (pre-fix behaviour) | — | — | — | not re-run | research e1 §2 records the pre-fix repro (401 on `/api/state`, overlay on every swap); this build no longer shows it |

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** The bare `muster_auth` cookie is accepted and a port-named one set, but the bare cookie is never expired, so it lingers in the browser for its remaining Max-Age. Harmless as measured (a bare cookie carrying another daemon's token is refused), and the ADR already plans dropping the fallback; no change requested.
2. **[note]** A daemon still on the pre-port release beside a new one on 127.0.0.1 keeps writing bare `muster_auth`; the new daemon reads it only as a fallback after its port-named cookie, so it cannot be logged out by the old one. Reasoned from the measured fallback order (stale port-named + valid bare → 200), not driven against an old binary.
3. **[note]** Not measured: `<name>.localhost` hosts and the Vite dev proxy. The name is taken from the request Host's port, so both get a consistent name per addressed port; `review-work`'s to confirm against the code if wanted.
