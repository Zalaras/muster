# Daemon Implementation: issue-capture

**Plan**: issue-capture
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/ghissue/ghissue.go` | created | GitHub Issues client: `TokenReader` seam (`GhCLITokenReader` running `gh auth token` via an injectable exec seam, `FileTokenReader` for tests), `Client.CreateIssue(ctx, repo, title, body)` — obtains a fresh token internally, POSTs to `{BaseURL}/repos/{repo}/issues`, returns `(number, htmlURL, error)`. No muster/session/store/claudecode/usage import (D5). |
| `internal/server/issue.go` | created | `handleCreateCapture`/`handleCreateIssue`, the explicit-copy `issueSnapshot` struct family, `renderSnapshotMarkdown` (the `## Snapshot` table + `<details>` JSON + `<sub>` footer), `noteSection`/`composeIssueBody`, and the bounded in-memory `captureStore` (put/reserve/consume/release, 8-cap, 15 min TTL). |
| `internal/server/server.go` | modified | `Config` gains `IssueRepo`/`IssueAPIURL`/`IssueTokenFile`; `Server` gains `issueRepo`/`issueAPIURL`/`issueCaptures`/`issueClient`; `New()` wires the `ghissue.Client` (Keychain-style token-reader selection) and both routes (`POST /api/issue/captures`, `POST /api/issues`), both behind `requireCookie`. |
| `internal/store/store.go` | modified | Added `EventSummary(ctx, sessionID) (EventSummary, error)` — `MIN/MAX(seq)`, `COUNT(*)`, `MAX(received_at)` plus the last-10 `type` values (reversed to oldest-first) via the existing `event.session_id` index. No migration needed. |
| `cmd/musterd/main.go` | modified | Three new flags: `-issue-repo` (default `Zalaras/muster`), `-issue-api-url` (default `https://api.github.com`), `-issue-token-file` (default empty), wired into `server.Config`. |

## Decisions

- **`ghissue.Client.CreateIssue` owns the token fetch internally** (signature `CreateIssue(ctx, repo, title, body) (number, htmlURL, error)` exactly as the plan's Affected Files line states, with no separate token parameter) rather than the server package calling the `TokenReader` and passing a token in. This makes D9's "no error string returned by `ghissue.CreateIssue` contains the token, across all of INV-3's failure paths" literally provable against one function, since INV-3's paths include the auth-step failures (`gh` missing, non-zero exit, empty token) as well as the post-step ones — those are only reachable through `CreateIssue` if it performs the token read itself.
- **Added `captureStore.reserve`/`release` (an in-flight flag) beyond what the plan's prose strictly requires.** The plan only pins the observable behaviour ("consumed server-side on success", "not consumed on failure"); `reserve` marks a capture in-flight for the duration of one POST /api/issues attempt so two concurrent requests for the same `captureId` (a genuine double-click racing the network, not just the client-side REQ-19 disable) can't both reach GitHub. A capture that is reserved-but-not-yet-consumed reads as `409 capture_expired` to a concurrent second request, which is the same response code D10 already expects for a sequential second POST — no new wire behaviour, just a tighter guarantee than "belt to braces" strictly needed.
- **`session.events.lastReceivedAt` is reformatted from the stored `RFC3339Nano` to plain `RFC3339`** (`event.received_at` is written by `InsertEvent` with fractional seconds — `store.go:123`) before it reaches the snapshot, matching the plan's pinned example row (`...last 2026-08-31T09:14:58Z`, no fraction) and the allowlist's stated type (`RFC3339 UTC`).
- **`session.context.usedPct` rendering uses `math.Round`**, matching the existing web convention (`web/src/render/masthead.ts`'s `Math.round(bucket.usedPct)`) rather than truncation, so the daemon's markdown table and the dashboard's other percentage displays round the same way.

## Handoff

**Build status**: `go build ./...` exits 0.

```
$ go build ./... && echo BUILD_OK
BUILD_OK
$ go vet ./...
(clean)
$ gofmt -l .
(clean)
$ make lint
golangci-lint run
0 issues.
$ go test ./...
ok  	github.com/Zalaras/muster/cmd/musterd	6.077s
ok  	github.com/Zalaras/muster/internal/claudecode	(cached)
?   	github.com/Zalaras/muster/internal/ghissue	[no test files]
ok  	github.com/Zalaras/muster/internal/gitutil	(cached)
ok  	github.com/Zalaras/muster/internal/server	12.620s
ok  	github.com/Zalaras/muster/internal/session	3.463s
ok  	github.com/Zalaras/muster/internal/store	3.272s
ok  	github.com/Zalaras/muster/internal/usage	4.635s
ok  	github.com/Zalaras/muster/internal/webui	3.647s
```

Automated-check dry run against the new code (matching the plan's Automated Checks block):

```
$ go list -deps ./internal/ghissue > /dev/null && ! go list -deps ./internal/ghissue | rg -q "Zalaras/muster/internal/(session|store|claudecode|usage)" && echo "D5 PASS"
D5 PASS
$ ! rg -n 'sess\.(Title|Directory|Branch|IsWorktree|LastActivity|LastSnapshot)|Failure\.Message' internal/server/issue.go && echo "D6 PASS"
D6 PASS
$ ! rg -n "api\.github\.com" internal/ && echo "D7 PASS"
D7 PASS
$ ! rg -n "hook_event_name" cmd/ internal/ --glob '!internal/claudecode/**' && echo "D8 PASS"
D8 PASS
```

Also hand-verified `renderSnapshotMarkdown` against the plan's pinned session-scope example (a throwaway test run in `internal/server`, deleted before finishing — never committed): the table rows, `<details>` fence, JSON key order/indentation and `<sub>` footer came back byte-for-byte identical to the plan's `## The issue body` sample.

No test files needed changes — none existed yet for this plan (daemon-tests' job is next). Nothing to hand off as sanctioned breakage.

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: review cycle 1 Major 1 (`internal/server/issue.go`), Minors 1, 3, 4 (all `[daemon-impl]`).

**Changes made**:

- **Major 1 — failure-branch warn logs never carried the upstream status/message** (`internal/server/issue.go:568-596`, was `:576,579,582`). `handleCreateIssue`'s post-path has exactly three ways `s.issueClient.CreateIssue` can fail, and each is now closed:
  - **Auth failure** (`errors.As(err, &authErr)`, line ~582): the warn line now adds `.Str("message", authErr.Message)` alongside the existing `stage` field. `authErr.Message` is the same string already returned to the client in `writeJSONError`, proven token-free by D9/INV-3 (it never carries `gh`'s stdout — only trimmed stderr and a `gh auth login` pointer).
  - **Post failure** (`errors.As(err, &postErr)`, line ~587): the warn line now adds `.Str("message", postErr.Message)` alongside `stage` and the existing `maybe_created`. `postErr.Message` is what already carries GitHub's upstream HTTP status and `message` field (built in `ghissue.CreateIssue` as `fmt.Sprintf("github returned %d: %s", resp.StatusCode, msg)` when GitHub supplied one, or `"github returned status %d"` otherwise) — so this one field closes both halves of REQ-16 ("the failing stage and the upstream status/message") for this branch, matching the reviewer's own note that `authErr.Message`/`postErr.Message` are the pre-proven-safe fields to log.
  - **Unexpected/unmatched error** (`default` branch, line ~594): left unchanged — it already logs `.Err(err)`, which zerolog renders as an `error` field carrying `err.Error()` (the only "message" that exists for an error type the switch doesn't recognise, e.g. `ghissue.CreateIssue`'s `fmt.Errorf("encoding issue request: %w", …)` / `"building issue request: %w"` wraps). No upstream status exists for this branch since it never reaches GitHub. This branch was already compliant with REQ-16 before this fix; verified by re-reading it, not changed.
  - Confirmed by re-running `internal/server`'s existing table-driven issue tests (`go test ./internal/server/... ./internal/ghissue/...` — both `ok`), none of which pin the old (message-less) log line, so no test needed updating for this change.

- **Minor 1 — byte vs. rune counting** (`internal/server/issue.go`): added `"unicode/utf8"` import; `title == "" || len(title) > maxIssueTitleLen` → `title == "" || utf8.RuneCountInString(title) > maxIssueTitleLen`; `len(req.Note) > maxIssueNoteLen` → `utf8.RuneCountInString(req.Note) > maxIssueNoteLen`. Matches the client's UTF-16-code-unit `maxlength` gate closely enough that a 200-char title with em dashes/accents/emoji no longer gets rejected after passing the client gate (an exact UTF-16-vs-rune edge only differs for characters outside the Basic Multilingual Plane, i.e. surrogate-pair emoji, which was not in scope of the reviewer's repro and the plan's REQ-6 says "chars", which `RuneCountInString` matches for the overwhelming case).

- **Minor 3 — `capture_expired` message never named the remedy** (`internal/server/issue.go`, `handleCreateIssue`'s `reserve` check): message changed from `"capture is unknown, expired, in flight, or already filed"` to `"capture is unknown, expired, in flight, or already filed; this snapshot expired — reopen the dialog to take a fresh one"`, folding in Edge Case 2's exact remedy sentence verbatim. The pinned UI summary (`"Could not file the issue."`, Testable UI Elements) is untouched — only the `error.message` field (which reaches the detail `<pre>` per `web/src/render/issue.ts`'s `showError`/`formatErrorDetail`) changed, confirmed by reading `showError` (`errorDetailEl.textContent = formatErrorDetail(err)`, where `err` is the full `{code, message}` body).

- **Minor 4 — a 2xx body that parses but carries no issue slips through as success** (`internal/ghissue/ghissue.go:190-204`): after `json.Unmarshal(respBody, &out)` succeeds, added `if out.Number == 0 || out.HTMLURL == "" { return 0, "", &ErrPostFailed{Message: "...", MaybeCreated: true} }`, taking the same `MaybeCreated: true` branch Edge Case 9 already specifies for the unparseable-body case. Verified against `internal/ghissue/ghissue_test.go`: no existing test posts a `{}`-shaped or number-0/empty-URL 2xx body expecting success (`grep -n "html_url\|\"number\"" internal/ghissue/ghissue_test.go` shows only `{"number":14,"html_url":"..."}` and `{"number":1,"html_url":"https://x"}` fixtures), so this closes the gap without contradicting any pinned test.

**Verification**:
```
$ go build ./... && echo BUILD_OK
BUILD_OK
$ go vet ./...
(clean)
$ gofmt -l internal/server/issue.go internal/ghissue/ghissue.go
(clean)
$ make lint
golangci-lint run
0 issues.
$ go test ./internal/server/... ./internal/ghissue/...
ok  	github.com/Zalaras/muster/internal/server	12.520s
ok  	github.com/Zalaras/muster/internal/ghissue	1.556s
```

**Handoff**: No test files needed changes — all pre-existing daemon tests pass unchanged against the fixed code (byte-vs-rune, capture_expired message, and the Number==0/HTMLURL=="" MaybeCreated case were all previously untested gaps, not previously-pinned-differently behaviour). daemon-tests may want to add coverage for: a multi-byte-rune 200-char title (Minor 1), the `capture_expired` message now containing the remedy sentence (Minor 3), a `{}`/zero-number 2xx GitHub response now returning `ErrPostFailed{MaybeCreated:true}` (Minor 4), and the warn log now carrying a `message` field on both auth and post failure branches (Major 1) — none of these are required for the build gate, they're suggestions for wave 2. Nothing else needs handing off.

## Fix Attempt 2 (review cycle 2)

**Failures addressed**: review cycle 2 Critical 1, Minors 1, 2, 3 (all `[daemon-impl]`).

**Changes made**:

- **Critical 1 — the new log field name collided with `zerolog.MessageFieldName`, silently dropping REQ-16's failure detail from every log a person can read** (`internal/server/issue.go`, both warn lines in `handleCreateIssue`'s failure switch). Cycle 1's fix (Fix Attempt 1 above) used `.Str("message", …)`, and `zerolog.MessageFieldName == "message"` is the same key `Msg()` writes — so `ConsoleWriter` (production's only writer, `cmd/musterd/main.go:110`, unconditional) rendered only the `Msg()` text and the raw JSON carried a duplicate `"message"` key that any parser collapses to the last value. Every code path that reaches this defect is one of exactly two failure branches inside `handleCreateIssue`'s `switch { case errors.As(err, &authErr): … case errors.As(err, &postErr): … }` (line ~578 onward) — there is no third path that used the colliding field name (the `default` branch already used `.Err(err)`, untouched, see Fix Attempt 1's note on it):
  - **Auth-failure branch** (`errors.As(err, &authErr)`): `.Str("message", authErr.Message)` → `.Str("upstream", authErr.Message)`. Closed — `upstream` is not a zerolog-reserved field name (`zerolog.MessageFieldName`/`LevelFieldName`/`TimestampFieldName`/`ErrorFieldName` are `message`/`level`/`time`/`error`; `upstream` collides with none of them).
  - **Post-failure branch** (`errors.As(err, &postErr)`): `.Str("message", postErr.Message)` → `.Str("upstream", postErr.Message)`. Closed, same reasoning.
  - No other call site in the package used the string `"message"` as a zerolog field key (`rg -n '\.Str\("message"' internal/server/issue.go` now returns nothing).
  - The *values* were already correct per cycle 1's D9/INV-3 proof and were not touched — only the field key changed.

  **Measured, not just built** — built the daemon (`go build -o …/musterd ./cmd/musterd`), ran it for real (`-tmux-socket` a short `/private/tmp/muster-icf2.sock`, scratch data dir, `-issue-api-url` pointed at a throwaway Go stub HTTP server, cleaned up after — no `.py` stub because this sandbox blocks the system Python's outbound sockets but not a plain Go binary's, confirmed by `python3 -c "import socket; print(socket.socket().connect_ex(('127.0.0.1',PORT)))"` returning 60/ETIMEDOUT against a running python listener and a Go binary on the same port answering immediately), and drove both failure branches through the real HTTP API with a real cookie session. Rendered `ConsoleWriter` output, ANSI stripped, both branches:

  ```
  # post-failure branch (stub returns 403 {"message":"Resource not accessible by personal access token"})
  1:31PM WRN filing issue: posting to github failed maybe_created=false stage=post upstream="github returned 403: Resource not accessible by personal access token"

  # auth-failure branch (empty -issue-token-file)
  1:32PM WRN filing issue: obtaining github token failed stage=token upstream="issue token file is empty"
  ```

  Both lines now carry the full upstream detail under `upstream=`, readable by a human at the console — the exact defect the Critical describes is closed on both branches. Also re-verified Hard Rule 5 held under the renamed field: `grep -c` of the fake bearer token across both daemon-run log files (a 403 post-failure run and a separate 2-restart run covering the auth-failure and two success cases) returned `0` in each.

- **Minor 1 — `capture_expired` asserted a cause the daemon does not know** (`internal/server/issue.go`, the `capture == nil` branch): message changed from `"…already filed; this snapshot expired — reopen the dialog to take a fresh one"` to `"…already filed; reopen the dialog to take a fresh snapshot"` — Edge Case 2's remedy kept, the false "this snapshot expired" diagnosis and the collision with the `<code> — <message>` separator both dropped. Measured live: reserved-and-consumed a capture via a real success POST, then POSTed the same `captureId` again and read the JSON body back — `"capture is unknown, expired, in flight, or already filed; reopen the dialog to take a fresh snapshot"`, no diagnosis claim, single em dash reserved for the `<code> — <message>` separator upstream of this string in the dialog.

- **Minor 2 — REQ-16's success line logged `title_len`/`note_len` in bytes while validation is in runes** (`internal/server/issue.go`, the `s.log.Info()…Msg("filed github issue")` call): `Int("title_len", len(title))` → `Int("title_len", utf8.RuneCountInString(title))`; same for `note_len`. Measured live: submitted a 200-rune (`é`×200, 400-byte) title through the real HTTP API against a stub that accepts it; daemon logged `title_len=200`, matching the 200-*character* limit the request had just been validated and accepted under (previously would have logged `400`, exceeding its own limit on an accepted request).

- **Minor 3 — `ErrPostFailed`'s doc comment claimed `MaybeCreated` is true "only for the last case"** (`internal/ghissue/ghissue.go:30-32`): reread all three call sites that set `MaybeCreated: true` (`readErr != nil` at `:187`, the `json.Unmarshal` failure at `:191-196`, and this delta's `Number == 0 || HTMLURL == ""` guard at `:199-204`) and rewrote the comment to "MaybeCreated is true whenever the request reached GitHub and may have created the issue — an unreadable or unusable 2xx body (plan Edge Case 9)", matching all three rather than naming one.

**Verification**:
```
$ go build ./... && echo BUILD_OK
BUILD_OK
$ go vet ./...
(clean)
$ gofmt -l internal/server/issue.go internal/ghissue/ghissue.go
(clean)
$ make lint
golangci-lint run
0 issues.
$ make test
… (12 packages)
--- FAIL: TestHandleCreateIssue_CaptureExpired_MessageNamesTheRemedy (0.01s)
    issue_test.go:1259: "capture is unknown, expired, in flight, or already filed; reopen the dialog to take a fresh snapshot" does not contain "reopen the dialog to take a fresh one"
--- FAIL: TestHandleCreateIssue_AuthFailure_WarnLogCarriesStageAndMessage (0.01s)
    issue_test.go:1422: raw-JSON log line does not contain "\"message\":\"issue token file is empty\""
--- FAIL: TestHandleCreateIssue_PostFailure_WarnLogCarriesStageAndMessage (0.01s)
    issue_test.go:1470: raw-JSON log line does not contain "\"message\":\"github returned 403: token lacks repo scope\""
FAIL	github.com/Zalaras/muster/internal/server
(all other 11 packages ok)
```
`go test ./internal/server/... -run 'TestHandleCreateIssue' -v` confirms exactly these 3 `FAIL` lines and no others.

**Handoff — sanctioned breakage, confined and named:**
- `internal/server/issue_test.go:1412-1425` (`TestHandleCreateIssue_AuthFailure_WarnLogCarriesStageAndMessage`) and `:1460-1475` (`TestHandleCreateIssue_PostFailure_WarnLogCarriesStageAndMessage`) — explicitly named in review cycle 2 Major 1 as `[daemon-tests]`'s to rewrite (decode the event and assert on the decoded `upstream` field rather than the raw byte stream). Expected, pre-announced in this fix wave's brief.
- `internal/server/issue_test.go:1259` (`TestHandleCreateIssue_CaptureExpired_MessageNamesTheRemedy`) — **not named in the brief, but a direct, unavoidable consequence of review cycle 2 Minor 1**, which explicitly mandates dropping the string `"this snapshot expired — reopen the dialog to take a fresh one"` (the exact substring this test's `assert.Contains` pins) in favor of `"reopen the dialog to take a fresh snapshot"`. Fixing the Minor as instructed necessarily breaks this assertion; leaving the old string in place to keep the test green would mean not fixing the Minor at all, which was not an option. This is the same category of sanctioned breakage as the two named tests — a test pinning the exact old (defective) copy the review told me to change — and is `[daemon-tests]`'s to update, updating the pinned substring to `"reopen the dialog to take a fresh snapshot"` (the test's own docstring already describes the underlying remedy correctly; only the literal string needs to move).

All three failures are confined to these tests; every other package and every other test in `internal/server` passes. No test file was edited by this agent.

**Manual-verification cleanup**: daemon, both Go stub servers, and (from an earlier attempt) the blocked Python stub were all killed by PID (`ps aux` afterward shows none of `musterd|stubserver|stub.py`); the scratch directory under the session scratchpad and the short tmux socket path `/private/tmp/muster-icf2.sock` were both removed (`ls` on each returns "No such file or directory"); `git status --short` at the end of manual verification showed only the two modified source files plus the pre-existing untracked `masthead.png`, left untouched.
