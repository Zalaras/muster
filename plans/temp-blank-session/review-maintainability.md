# Maintainability review: temp-blank-session (#128, auth cookie named by port)

**Plan**: temp-blank-session
**Verdict**: needs-changes
**Cycle**: 1 (standalone, uncommitted change on `main`)
**Pack**: not run (standalone review of the working tree; conventions read directly: § Comments, § Go middleware line 53)
**Scope**: `git diff HEAD` (non-plans) + untracked `docs/adr/connection-auth-cookie-named-by-port.md`. Code files: internal/server/auth.go, internal/server/auth_test.go, cmd/musterd/onexit_test.go, web/e2e/auth.spec.ts, web/e2e/embedded.spec.ts, Makefile (proto block), .claude/skills/proto/SKILL.md.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/server/auth.go | renderfix.go, servertest_test.go, ws_test.go, terminal_test.go, plainshell_test.go | ADR stands in | none | Major 1, Minor 1 |
| internal/server/auth_test.go | servertest_test.go, ws_test.go | n/a | none | pass (see Major 1 on :157) |
| cmd/musterd/onexit_test.go | port_proc_test.go | n/a | none | Minor 3 |
| web/e2e/auth.spec.ts | helpers/daemon.ts, helpers/fixtures.ts, helpers/connection.ts | n/a | none | Minor 4 |
| web/e2e/embedded.spec.ts | auth.spec.ts, helpers/daemon.ts | n/a | none | Minor 4 |
| Makefile (proto-run, proto-url, comment block) | proto-stop, proto-web, proto-branch | n/a | none | Minor 5, Note 2 |
| .claude/skills/proto/SKILL.md | — | n/a | none | pass |

`go test ./internal/server -run 'TestAuthCookie_NamedByPort|TestHandleAuth|TestWS'` passes (ok, 11.9 s).

## Issues

### Critical

None.

### Major

1. **[daemon-impl]** `cookieName` (`internal/server/auth.go:9-13`) changed meaning from "the auth cookie's name" to "the bare base/legacy name, used only on a portless Host or as the migration fallback", but kept its name, so every existing reader still uses it as *the* auth cookie. `rg -c cookieName internal/server/*_test.go` totals 47 call sites, plus two in non-test code:
   - `internal/server/renderfix.go:290`: `req.AddCookie(&http.Cookie{Name: cookieName, Value: renderfixUIToken})` (an `httptest.NewRequest` with Host `example.com`, so the bare name is the primary name here), and
   - `internal/server/renderfix.go:457`: `header := http.Header{"Cookie": {cookieName + "=" + renderfixUIToken}}` dialled at `httptest.NewServer` (Host `127.0.0.1:<port>`). There the bare name is **not** this daemon's name, so the request only gets in through the legacy branch at `auth.go:68`, which also writes a `Set-Cookie` on every upgrade.

   The same holds for the shared test helpers `dialWS` (`ws_test.go:27`), `dialTerminal` (`terminal_test.go:97`, `:226`), `plainshell_test.go:50` and `ws_test.go:148/208/231`. Every WS and terminal unit test, and render-fixture capture, now authenticates through the migration shim, not the port-named path. The ADR says the shim "can be dropped once no browser holds one", and dropping it would break fixture generation (production-tree code) and every one of those tests at once. `auth_test.go:157` (`TestHandleAuth_ValidTokenSetsCookieAndRedirects`) likewise now asserts the portless edge case under a name that reads as the main case.

   A fix must make these true:
   - The constant's name says what it now is (base or legacy name).
   - `renderfix.go:457` sends the name the daemon would set for the URL it dials (derived through `authCookieName` or a helper beside it, never a hand-built string), so no non-test code depends on the fallback branch.
   - Only the tests that are *about* the legacy cookie use the legacy name.
   id: internal/server/auth.go:cookieName:meaning-changed-name-kept | confidence: 85

### Minor

1. **[daemon-impl]** The comments narrate history and restate the ADR instead of citing it. Conventions § Comments: "a choice, `kb:adr/<slug>` … don't narrate history".
   - `auth.go:9-12` retells the browser-cookie rationale with an issue number "(#128)". It is the only `#NNN` reference in a non-test `internal/server` file (`rg -n '#[0-9]{2,3}\)' internal/server/*.go | grep -v _test`).
   - `auth.go:58-60` ("which daemons set before the name carried the port … so an upgrade does not log an open dashboard out") narrates the past.

   A fix must make both comments say only what the code does now, cite `kb:adr/connection-auth-cookie-named-by-port`, and leave the rationale and the removal condition to the ADR. (The comment pass will likely catch this; listed so it is not lost.)
   id: internal/server/auth.go:comments:narrate-history | confidence: 70

2. **[daemon-tests]** 47 hand-built `&http.Cookie{Name: cookieName, Value: testUIToken}` / `cookieName + "=" + testUIToken` sites exist, while `servertest_test.go` already has request builders (`postSessionsRequest` :30, `sessionActionRequest` :41) that each repeat the cookie line. The duplication predates this change, but the change makes it load-bearing: the right name now depends on the request's Host, and each inline site has to get that right separately. A fix must make "authenticate this request/dial for this server" a single helper in `servertest_test.go` that derives the name from the target URL or Host through `authCookieName`, used by `dialWS`, `dialTerminal` and the request builders at minimum.
   id: internal/server/servertest_test.go:cookie:inline-x47 | confidence: 65

3. **[daemon-tests]** `cmd/musterd/onexit_test.go:242-246` `authCookie()` re-parses `d.baseURL` on every call and discards the error (`u, _ := url.Parse(d.baseURL)`). Its sibling `boundPort` (`port_proc_test.go:82-87`) parses the same kind of URL with `require.NoError`, and `spawnDaemon` already has the parsed `u` in hand at `onexit_test.go:235-237`. A fix must make the port come from one place (kept on `spawnedDaemon` when it is parsed, or through `boundPort`), with no swallowed error. The `"muster_auth_"` literal itself is acceptable here: `package main` cannot import `server`'s unexported helper, and a black-box test should spell the wire name out.
   id: cmd/musterd/onexit_test.go:authCookie:swallowed-parse-error | confidence: 70

4. **[e2e-specs]** The e2e cookie name is built twice.
   - `web/e2e/auth.spec.ts:10`: `` const authCookieName = () => `muster_auth_${new URL(daemon().baseURL).port}` ``
   - `web/e2e/embedded.spec.ts:57-60`: the same template written inline.

   Both re-derive a port that `ScratchDaemon` already exposes as `readonly port: number` (`web/e2e/helpers/daemon.ts:463`). A fix must make the cookie name one exported helper (a `ScratchDaemon` getter or a function in `web/e2e/helpers/`) built from `port`, used by both specs. Go and TypeScript cannot share code, so one helper per language plus the Go production function is the floor. The Go and TS test helpers should not be merged further than that.
   id: web/e2e:authCookieName:duplicated | confidence: 80

5. **[orchestrator]** `Makefile:237` (`proto-run`) now rewrites `127.0.0.1` → `$(PROTO_HOST)` with `sed` (global) over all of musterd's output. `Makefile:241` (`proto-url`) does the same rewrite in Python with `.replace(..., 1)` (first only). That is two implementations of one rewrite, with different semantics. The global sed also rewrites lines that name the real bind address (`cmd/musterd/main.go:393` listens on `127.0.0.1` only), so the prototype's log claims a host musterd never bound. A fix must leave one rewrite rule shared by both targets, or narrow the sed to URLs (`http://127.0.0.1`) so the bind line stays truthful. Makefile/skill work releases nothing, so it is not an impl agent's.
   id: Makefile:proto-run:dup-rewrite | confidence: 60

### Notes

1. **[note]** `setAuthCookie` (`auth.go:77`) is a good extraction: one cookie shape now serves both `/auth` and the rename path, and nothing elsewhere in the tree builds the auth cookie (`rg -n 'SetCookie' internal cmd --type go | grep -v _test` shows only `auth.go:78`). Reading the port from `r.Host` rather than threading the listen port through `Server` config keeps `New`/`server.go` untouched, which matches kb:adr/process-composition-roots-registration-only.
2. **[note]** The `Makefile:205-212` comment still opens with "never shares the developer's … browser cookie". That remains true, but now because of the port-named cookie, not the host. The `<name>.localhost` reason has shifted to the feedback receiver's Origin check, and the comment and `SKILL.md:31-32` say so. `sed -l` is BSD-only, which is fine for the macOS-only target; `set -o pipefail` is safe under `SHELL := /bin/bash`.
3. **[note]** For review-work, the WS and terminal unit tests now exercise the migration branch rather than the port-named path (Major 1). Whether the port-named path has WS-upgrade coverage is a coverage question, not a shape one.

---

## Fix round (delta re-review, uncommitted `git diff HEAD`)

**Verdict**: approved

`go vet ./internal/server` is clean. `go test ./internal/server -run 'TestAuth|TestHandleAuth|TestRequireCookie|TestHandleWS|TestHandleTerminal|TestRoutes'` → ok (8.9 s).

### Delta

| Prior issue | Fix | Verified how |
|-------------|-----|--------------|
| Major 1: `cookieName` meaning changed, name kept; `renderfix.go:457` and WS/terminal helpers on the legacy branch | `cookieBaseName` (`auth.go:9-12`); `authCookieNameForHost` (`auth.go:20-27`), which `authCookieName(r)` delegates to | Fixed. `rg -n 'cookieName\b' internal cmd --type go` now finds nothing. `renderfix.go:457`, `dialWS` (`ws_test.go:28`), `ws_test.go:149/209/232`, `dialTerminal` (`terminal_test.go:97`), `terminal_test.go:226` and `dialShell` (`plainshell_test.go:51`) all derive the name from their listener's host. The portless `httptest.NewRequest` sites (including `renderfix.go:290`) keep `cookieBaseName`, which is their correct name and now reads as such. `auth_test.go:147/157` uses a host with a port and expects `muster_auth_28820`. |
| Minor 1: comments narrate history / restate ADR | `auth.go:9-11`, `:15-16`, `:61-64` | Fixed. They cite `kb:adr/connection-auth-cookie-named-by-port`, with no `#128` and no history. |
| Minor 2: no shared helper for portless cookie sites | not done, reason given | **Withdrawn.** After the rename, `cookieBaseName` on a portless request is the right name and says so. The remaining repetition predates this change, and churning ~45 sites is not worth it here. |
| Minor 3: `authCookie()` swallowed parse error | `onexit_test.go:242-249` | Fixed. `require.NoError` plus a non-empty port check now match sibling `boundPort`. Re-deriving the port has a sound reason: `port_proc_test.go` builds `spawnedDaemon` by hand. |
| Minor 4: e2e cookie name built twice | `ScratchDaemon.authCookieName` getter (`web/e2e/helpers/daemon.ts:464-467`) | Fixed. Both specs use it, built from `port`. |
| Minor 5: two rewrites with different semantics; sed rewrote the bind address | `Makefile:240` sed narrowed to `http://127.0.0.1` | Fixed. On the single URL in tokens.json, `proto-url`'s first-match replace is equivalent. The Makefile comment (`:208-212`) and `SKILL.md` now give the same reason for `<name>.localhost`. |

### Minor (new in this round, non-blocking)

1. **[daemon-tests]** The fix spreads "cookie header for this listener" across 7 sites, using three different ways to get the host:
   - `strings.TrimPrefix(url, "http://")` at `renderfix.go:457`, `terminal_test.go:97`, `terminal_test.go:226` and `plainshell_test.go:51`;
   - `hostOf(t, wsURL)` at `ws_test.go:28` and `ws_test.go:149` (the helper is defined at `ws_test.go:315-321`);
   - `req.URL.Host` at `ws_test.go:209` and `ws_test.go:232`.

   `hostOf` also sits in `ws_test.go`, but the package's shared request helpers live in `servertest_test.go` (its header says so: "Test helpers shared by the server package's feature tests"). A fix must leave one test helper that takes a listener URL and returns the cookie header value (one way to get the host), kept in `servertest_test.go` and used by the six test sites. `renderfix.go:457` is non-test code and can keep its own one-liner.
   id: internal/server/ws_test.go:hostOf:three-host-extractions | confidence: 70

### Notes

1. **[note]** `ScratchDaemon.authCookieName` (`daemon.ts:464`) is a getter declared between the `readonly port` and `readonly baseURL` fields. Every other member of that class keeps its fields together, so the getter would read more naturally after the field block. Taste only.
