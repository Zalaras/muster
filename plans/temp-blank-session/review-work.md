# Correctness review: #128 auth cookie named by port (hand fix on main)

**Plan**: temp-blank-session (no plan.md; research `plans/temp-blank-session/research/e1.md` stands in)
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: not run (no plan; reviewed against e1.md, docs/protocol.md § transport and kb:adr/connection-auth-cookie-named-by-port)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| Cookie is `muster_auth_<port>`, port from the request Host (`internal/server/auth.go:17-22`, `:104`) | Yes | Yes (`TestAuthCookie_NamedByPort`, auth/embedded E2E) | pass |
| Two daemons' cookies coexist; another port's cookie never authenticates | Yes | Yes (unit table rows 1-2) | pass |
| Valid bare `muster_auth` accepted and re-set under the port name; wrong token refused | Yes (`auth.go:68-72`) | Yes (unit rows 3-4) | pass |
| Docs: protocol § transport, connection spec, ADR, generated kb | Yes | `make check` (check-kb) green per main session | pass (see Minor 1) |
| `make proto-run` rewrites 127.0.0.1 and survives Ctrl-C | Yes | measured (below) | fail (Major 1) |
| DIAG | kb:diagram/daemon-components (auth.go only adds a stdlib import) | — | pass |

## Build & Tests

Taken from the main session: `make check` exit 0; `go test ./cmd/musterd/` ok; `make e2e SPECS="e2e/auth.spec.ts e2e/embedded.spec.ts"` 11 passed; new unit test shown red on old auth.go, green on new. Re-run here: `go test ./internal/server -run 'Auth|Cookie|Static' -count=1` ok. Full E2E sweep running separately, not run here.

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass |
| 2 | Terminal-output state parsing | pass (the sed filter rewrites display output only) |
| 3 | Blocking hook handler | pass (n/a) |
| 4 | Bare tmux | pass (proto-stop keeps `-L muster-proto-$n`) |
| 5 | Payload logging | pass |
| 6 | Empty-gauge dishonesty | pass (n/a) |
| 7 | Identity on session_id | pass (n/a) |
| 8 | Settings trespass | pass |
| 9 | Real claude outside canary | pass |

## Points asked about

- **IPv6 / no port**: `net.SplitHostPort("[::1]:7070")` gives port `7070` → `muster_auth_7070`. A Host with no port (`localhost`, `[::1]`) or an empty port (`host:`) falls back to the bare `muster_auth`, and the legacy branch is skipped (`name != cookieName`, auth.go:68), so nothing is renamed onto itself. Correct; not pinned by a test (Minor 2), not documented (Minor 1).
- **WS upgrade on the legacy path**: `setAuthCookie` writes to `w.Header()` before `next`; coder/websocket v1.8.15 `Accept` sets its headers on the same `w.Header()` and sends them with `WriteHeader(101)` (accept.go:135-151), so the Set-Cookie rides the 101. A failed Accept (foreign Origin → 403) also carries it, harmlessly (the token was already valid). In practice the reloaded page's `GET /` renames first.
- **Other code still assuming the bare name**: about 40 `internal/server` tests and `renderfix.go:290` use `cookieName`. Those built with `httptest.NewRequest(…, "/path")` have Host `example.com` (no port), so the bare name is the primary name for them. Those dialing a real listener (`ws_test.go:27`, `terminal_test.go:97,226`, `plainshell_test.go:50`, `shells_remove_lock_test.go:110`) now authenticate only through the legacy branch (Note 1). No web e2e helper or render code names the cookie (`rg muster_auth web/` hits only the two edited specs).
- **Client side**: nothing depends on the name. The cookie is HttpOnly and `web/src` has no `document.cookie`.
- **proto-stop pgrep**: unaffected. The pipeline leaves musterd's argv unchanged; the recipe shell's argv starts with `/bin/bash`, the filter's with `sed`/`bash`, so `^\./bin/musterd .*-tmux-socket muster-proto-$n -port` still matches only musterd (checked with `ps -g` on the same pipeline shape).
- **Exit status**: `SHELL := /bin/bash` (Makefile:2), so `set -o pipefail` is valid and the recipe now fails when musterd fails (port busy etc.), where without it sed's 0 would hide that. Correct.
- **Signal handling**: Ctrl-C works as the comment says; SIGTERM to the group does not (Major 1).

## Issues

### Critical
None.

### Major
1. **[orchestrator]** `Makefile:239`: a SIGTERM sent to the whole `make proto-run` process group kills musterd before it finishes `-on-exit kill`, so the prototype's tmux sessions (and any `claude` in them) survive. The filter ignores only INT. On a group SIGTERM, sed dies at once. musterd catches TERM and then logs "shutting down" to stderr, which is now a pipe with no reader, so Go's runtime kills it with SIGPIPE (writes to fd 1/2 on a broken pipe) before `shutdownGracefully` runs. Before this diff, stderr went to the terminal or the capture file and shutdown completed. This breaks the Makefile's own claim (line 205-206) that the prototype "takes its sessions with it when it stops". A background task stopped by killing its process tree is the likely trigger. `proto-stop` (TERM to musterd's pid only) and Ctrl-C are fine.
   Evidence: a stand-in Go program with the same pattern (Notify INT/TERM, log to stderr, then do the shutdown work), run as `prog 2>&1 | { trap '' INT; sed -l …; }` in its own process group:
   ```
   kill -INT  -<pgid>  → "shutting down interrupt", statuses=0 0, marker written
   kill -TERM -<pgid>  → "Terminated: 15", marker MISSING (shutdown never ran)
   same, filter `trap '' INT TERM HUP` → "shutting down terminated", exit=0, marker written
   ```
   For a fix to hold, the filter must outlive musterd for every signal musterd handles. `trap '' INT TERM` (HUP optional) does this, with the Makefile comment updated to match.
   id: Makefile:proto-run:filter-dies-before-daemon-on-group-sigterm | confidence: 75

### Minor
1. **[orchestrator]** `docs/protocol.md:48-50` (and its generated `contract.md`), plus the ADR: the name is stated as always `muster_auth_<port>`, but a Host without a port gets the bare `muster_auth` (`auth.go:15-22`), and the legacy rename does not apply then. Add the fallback in one clause (it is what every portless `httptest` request and `renderfix.go` rely on), or say "always on a Host with a port".
   id: docs/protocol.md:transport:no-port-fallback-unstated | confidence: 80
2. **[daemon-tests]** `internal/server/auth_test.go:243-299`: `TestAuthCookie_NamedByPort` does not pin the two Host shapes the brief asked about: an IPv6 Host (`http://[::1]:7070/…` → `muster_auth_7070`) and a Host with no port (bare name, no Set-Cookie on a bare cookie). The legacy-rename row asserts only `HttpOnly` on the re-set cookie, not `SameSite=Strict`, `Path=/` or `MaxAge`, which the protocol pins for the cookie.
   id: auth_test.go:TestAuthCookie_NamedByPort:host-shapes-and-attrs-unpinned | confidence: 70
3. **[orchestrator]** `Makefile:208-211` and `.claude/skills/proto/SKILL.md:31-32`: the reason given for `<name>.localhost` is "the host its feedback receiver expects". But the receiver also accepts the `127.0.0.1:<port>` origin (`.claude/skills/proto/feedback-server.py:141`: names = `127.0.0.1`, `localhost`, dashboard_host). After this fix, opening at 127.0.0.1 neither logs anyone out nor breaks feedback, so the "never `dashboardUrl`" rule and the sed rewrite no longer rest on a true reason. Either state the real one (for example, a distinct host per prototype in the browser's history, cookie jar and storage) or relax the rule.
   id: Makefile:proto-run:receiver-host-reason-false | confidence: 70

### Notes
1. **[note]** The real-listener WS/terminal unit tests (`ws_test.go:27`, `terminal_test.go:97`, `plainshell_test.go:50`, `shells_remove_lock_test.go:110`) send the bare cookie to `127.0.0.1:<port>`, so they pass only through the legacy branch. Only E2E covers the port-named cookie on a real WS upgrade. When the ADR's "drop the bare name" step comes, those tests turn red. That is loud, not silent, but the helper (`dialWS`) could use `authCookieName` now.
2. **[note]** The ADR's "its bare cookie is accepted once and renamed" really means "accepted on each request until the browser stores the port-named one". The bare cookie is never cleared and expires on its own 30-day MaxAge. That is harmless: it authenticates only a daemon whose token it carries.
3. **[note]** The sed filter rewrites every `127.0.0.1` musterd prints, bind errors included (`… 127.0.0.1:28820: address already in use` would read `<name>.localhost:28820`). `sed -l` is BSD-only (GNU sed's `-l N` takes a number), which is fine for this macOS-only project. A `/` in `PROTO_NAME` (branch `proto/a/b`) would break the `s///` delimiter.
4. **[note]** The new `TODO.md` tweak cites `plans/temp-blank-session/research/e1.md`, which is untracked. Commit it with the fix or drop the pointer, so the reference does not dangle.
5. **[note]** The research's suggested E-level proof (two live daemons in one browser context) was not added. The unit test proves the names differ and coexist per request, and the browser's keeping of two differently named cookies is a platform guarantee, so the unit level is the cheapest one that falsifies this. Acceptable.
6. **[note]** The ADR status `accepted` is right for a change made directly on `main` (CLAUDE.md § Doc upkeep).

---

# Cycle 2: fix-round verification

**Verdict**: approved
**Scope**: `git diff HEAD` as of the fix round (still uncommitted). I read the diff and re-ran the measurement. Gates are the main session's; here I re-ran only `go test ./internal/server -run 'Auth|Cookie|Static|HandleWS|Terminal|Shell' -count=1`, which passed (17.8 s).

## Delta

| Prior issue (id) | Status | Verified how |
|---|---|---|
| Major 1 `Makefile:proto-run:filter-dies-before-daemon-on-group-sigterm` | resolved | Makefile:240 filter is now `{ trap '' INT TERM HUP; sed -l 's#http://127\.0\.0\.1#http://$(PROTO_HOST)#g'; }`. Re-measured with the stand-in daemon (Notify INT/TERM, logs `dashboard_url=http://127.0.0.1:1/auth listen=127.0.0.1:1`, then does its shutdown work), the pipeline in its own process group, the whole group signalled, and 1.5 s settle before and after. New filter, INT: `shutting down interrupt`, `statuses=0 0`, marker written. New filter, TERM: `shutting down terminated`, marker written. Old filter (`trap '' INT`), TERM, as a control: marker MISSING. A `/` in PROTO_HOST (`diff/viewer.localhost`) is safe with `#` delimiters, and only the `http://` link was rewritten (`listen=127.0.0.1:1` was left alone, so bind errors now read true). The Makefile comment (lines 208-212) matches. |
| Minor 1 `docs/protocol.md:transport:no-port-fallback-unstated` | resolved | protocol.md:48-51 and the regenerated contract.md now carry "a `Host` with no port gets bare `muster_auth`; on a `Host` with a port, a valid bare … is accepted and re-set". ADR Options (B) and Consequences ("re-set … on each request until the browser holds the new one; the bare cookie is left to expire") match auth.go. |
| Minor 2 `auth_test.go:TestAuthCookie_NamedByPort:host-shapes-and-attrs-unpinned` | resolved | Table on `authCookieNameForHost`: `127.0.0.1:28820`, `diff-viewer.localhost:9`, `[::1]:7070`, `localhost`, `[::1]`. The rename row now asserts SameSite=Strict, Path=/ and MaxAge=cookieMaxAge. `TestHandleAuth_ValidTokenSetsCookieAndRedirects` now uses a Host with a port and expects `muster_auth_28820`. |
| Minor 3 `Makefile:proto-run:receiver-host-reason-false` | resolved | The reason now given (a host of its own, so its cookies never meet those of an older musterd) holds. A prototype worktree branched before this change, opened on 127.0.0.1, would still set the bare cookie that a pre-port installed musterd reads. The false "feedback receiver expects" claim is gone from both Makefile and SKILL.md. |
| Note 1 (real-listener tests rode the legacy branch) | resolved | `dialWS`/`TestHandleWS_*` (ws_test.go), `dialTerminal` and the non-numeric-id dial (terminal_test.go), `dialShell` (plainshell_test.go) and `renderfix.go:457` now send `authCookieNameForHost(<listener host>)`. Every remaining `cookieBaseName` use in `*_test.go` and `renderfix.go:290` is on an `httptest.NewRequest` with a path-only URL (Host `example.com`, no port), where the bare name is the primary name, not the legacy branch. I checked the ones not on the same line (shells_remove_lock_test.go:109, update_test.go:454, usagebroadcast_test.go:130, launchermodels_test.go:371, issue_test.go:1011, state_test.go:124). E2E: `ScratchDaemon.authCookieName` (helpers/daemon.ts:464) is used by auth.spec.ts and embedded.spec.ts. onexit_test.go's `authCookie` now requires a port. |

## Remaining findings

None blocking.

### Notes
1. **[note]** Under a group SIGTERM the recipe shell itself dies at once (no `statuses=` line in the TERM runs), so make exits before musterd finishes. musterd and sed finish shutdown as orphans of the group, and sessions are killed. The feedback receiver dies of the same TERM. That is acceptable for a tooling target. A group SIGHUP still kills musterd outright, because musterd does not handle HUP; that predates this change.
2. **[note]** The cycle 1 note about the `TODO.md` tweak citing the untracked `plans/temp-blank-session/research/e1.md` still stands: commit it with the fix or drop the pointer.
