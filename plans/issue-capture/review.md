# Review: issue-capture

**Plan**: issue-capture
**Cycle**: 3
**Verdict**: approved

Cycle 2's Critical is genuinely closed this time, and I proved it the way cycle 2 said it had
to be proved: by running the daemon and reading the line. Against a freshly built binary and a
real 403, production's `ConsoleWriter` now emits

```
1:47PM WRN filing issue: posting to github failed maybe_created=false stage=post upstream="github returned 403: stub: token lacks repo scope"
```

— the upstream detail is on the line a human reads, which is the entire content of REQ-16's
failure half. I also reproduced the collision from first principles in a throwaway probe to
confirm the diagnosis and the fix are about the same mechanism (evidence below), and swept the
whole daemon for the same defect class: **no** `Str`/`Int`/`Bool` call anywhere in `cmd/` or
`internal/` uses a zerolog-reserved key (`message`/`level`/`time`/`error`).

The two daemon tests now fail on the broken shape and pass only on the fixed one, the three
Minors are each fixed and measured, and the E2E copy repoint is a strengthening (a fragment
replaced by the full sentence), not a weakening. Full suite 174/174 across all 16 spec files,
`make test` 12 packages, lint 0 issues, 606 Vitest, every authored check green.

One `[orchestrator]` Major remains — the feature has no `TODO.md` entry to tick and no
`SPEC.md` changelog line — which by the verdict rules does not block approval. R1 is
orchestrator-owned by user decision and is the last gate before completion.

## Requirements

Cycle 1's and cycle 2's verification stands for every row the delta does not touch. The delta
(3 commits, `302745d`/`a46b077`/`cdecc1d`) changes only two daemon log-field names, two log
value units, one doc comment, one HTTP error string, three test assertions and one E2E
assertion. **REQ-16 is the only row that changes status.**

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 masthead Issue button, both views | Yes | Yes | pass |
| REQ-2 frozen Session select, `focusedId` preselect | Yes | Yes | pass |
| REQ-3 two endpoints, server-held capture | Yes | Yes | pass |
| REQ-4 explicit-copy allowlist struct | Yes | Yes | pass |
| REQ-5 no hard-exclusion class anywhere (INV-1) | Yes | Yes | pass |
| REQ-6 title required ≤200, note ≤8000, Submit gating | Yes | Yes | pass |
| REQ-7 live preview == posted body (INV-2) | Yes | Yes | pass |
| REQ-8 `gh auth token` + GitHub headers | Yes | Yes | pass |
| REQ-9 success panel `Filed <owner>/<repo>#<n>` | Yes | Yes | pass — re-measured by hand this cycle |
| REQ-10 failure keeps the dialog and form, re-enables Submit | Yes | Yes | pass — re-measured by hand this cycle |
| REQ-11 token never in a log/response/error (INV-3) | Yes | Yes | pass — re-measured under the renamed field |
| REQ-12 unknown values render `unknown` | Yes | Yes | pass |
| REQ-13 daemon-down disables the button, closes the dialog | Yes | Yes | pass |
| REQ-14 three flags, empty `-issue-api-url` disables | Yes | Yes | pass |
| REQ-15 captures immutable, 8-cap, 15 min TTL (INV-4) | Yes | Yes | pass |
| REQ-16 info log on success; warn with stage + upstream status/message on failure | **Yes** | **Yes** | **pass — cycle 2 Critical 1 fixed, measured live on both branches** |
| REQ-17 harness passes both seam flags unconditionally | Yes | Yes | pass |
| REQ-18 note section, snapshot table, `<details>` JSON, `<sub>` footer | Yes | Yes | pass |
| REQ-19 in-flight submit guard, both sides | Yes | Yes | pass |
| REQ-20 `capturedAt` shown beside the preview heading | Yes | Yes | pass |

REQ-16 is now correct on all three of its lines: both failure branches carry the upstream
detail under `upstream=`, and the success line reports `title_len`/`note_len` in the same unit
(runes) the handler validates in — measured live at `title_len=197` for a 197-rune / 394-byte
title.

## Build & Tests

E2E tests: **pass (174/174)** — full suite via `npm run e2e` from `web/`, all 16 spec files, 41.7s, single run, no flakes, **0 skipped**. `npx playwright test --list` confirms 174 in 16 files, of which `issue-capture.spec.ts` contributes 13.
Daemon tests: **pass** — `make test`, all 12 packages `ok`, first run, no flake
Web tests: **pass (606/606)** — 21 files, Vitest
Daemon build: **pass** — `go build ./...`
Web build: **pass** — `make web-build` (tsc `--noEmit` + Vite, assets re-embedded into `internal/webui/assets/`)
Lint: **pass** — `golangci-lint run`, 0 issues

Unlike cycle 2, these gates are green **and** the behaviour they are silent about was measured
separately — see Manual Verification. A log-format change is only provable by reading the log,
and this cycle it was read.

## Acceptance Checks

Every line run exactly as authored in the plan's ```checks block, from the repo root.

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass |
| D2 | `go build ./...` | pass |
| D3 | `make lint` | pass |
| D5 | `go list -deps ./internal/ghissue …` no session/store/claudecode/usage | pass |
| D6 | no excluded `sess.*` / `Failure.Message` access in `internal/server/issue.go` | pass |
| D7 | no `api.github.com` under `internal/` | pass |
| D8 | no `hook_event_name` outside `internal/claudecode/` | pass |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass |
| W3 | no snapshot field name in `web/src/render/issue.ts` | pass |
| E1 | `make e2e` | pass (174/174) |
| E8 | no `api.github.com` under `web/e2e/`; both seam flags in `daemon.ts` | pass |

## Reviewer-Verified Criteria

Cycles 1 and 2 verified D4, D9–D12, W4, W5 and E7 by hand; the delta touches none of the
surfaces those items cover (no `web/src`, no `web/index.html`, no `web/src/style.css` change —
`git diff 17f89fd..HEAD --stat` lists only `internal/ghissue/ghissue.go`,
`internal/server/issue.go`, `internal/server/issue_test.go`, `web/e2e/issue-capture.spec.ts`
and three plan logs). Re-verified where the delta could have moved them:

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D4 | snapshot key set == §"The allowlist" exactly | pass | Unchanged assertion and unchanged `want` set; the delta edits no snapshot code. Also re-read live from a real daemon's dashboard-scope preview: the `<details>` JSON carries exactly `capturedAt`, `scope`, `musterd.version`, `claudeCode.{pinned,installed,drift}`, `host.{os,arch}`, `dashboard.{sessionsTotal,sessionsAlive,view,density,railSort}` — no directory, no repo name, no branch, no usage, no prompt text. |
| D9 | token in no error string across every INV-3 path | pass | Unchanged code path. Re-measured under the **renamed** field, which is the one thing that could have changed it: `grep -c "stub-token-abc"` over a live daemon log covering a 403 failure, a 201 success and a 409 `capture_expired` → **0**. |
| D10, D11, D12 | present and asserting their prose | pass | Present at `issue_test.go:1281` (D10), `:1600` (D11), `:1045` (D12); unchanged by the delta. |
| W4, W5 | composer; no `any` | pass | No `web/src` file changed. Re-swept anyway: `rg ':\s*any\b|<any>|as any' web/src/render/issue.ts` → no match. |
| E7 | `unknown` rendering, in a browser | pass | Cycle 1's check stands. Incidentally re-confirmed live this cycle in the masthead, where all three usage readouts rendered the word `unknown` with no track drawn (design-system §6) against a daemon with no usage data. |
| R1 | the real post to `Zalaras/muster` | **orchestrator-owned, not a review item** | Settled by user decision (`plans/issue-capture/decisions/r1-real-post/decision.md`): the orchestrator runs the four R1 steps from the main session after this review, where the permission prompts can be approved live. Not attempted here — instructed not to — and correctly not counted against the verdict. It remains the last gate before completion. |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — D8 clean; the delta added no Claude-Code field name. The two new field keys are `upstream` (GitHub's own error text) and rune counts. |
| 2 | No terminal-output state parsing | pass — D6 clean; no `capture-pane` anywhere in the delta or in `internal/server/issue.go` |
| 3 | Non-blocking hook handler | pass — ingest untouched by the delta |
| 4 | tmux via a dedicated socket | pass — no tmux call added. My own manual daemon ran on `-tmux-socket /private/tmp/mrev.sock`, never the user's default server; socket killed and removed after cleanup. |
| 5 | No payload logging | **pass, re-measured under the delta.** The two renamed warn lines log `authErr.Message` (built from `gh`'s trimmed **stderr** only, `ghissue.go:80-84` — stdout, where the token lives, never enters it) and `postErr.Message` (`"github returned %d: %s"` over GitHub's own `message`, or a transport error). Neither can carry title, note or prompt text. The success line logs *counts*, not content. Live grep of the daemon log for the fake bearer: **0** hits. |
| 6 | No empty-gauge dishonesty | pass — the delta added no rendering. Confirmed live: masthead 5h/7d/model all read `unknown`, no track; the preview's dashboard row reads `0 sessions, 0 alive` (a measured count, not an unknown). |
| 7 | Session identity on the tmux target | pass — unchanged |
| 8 | No settings trespass | pass — no `~/.claude/settings*.json`, no `CLAUDE_CONFIG_DIR` in the delta or in my manual run (scratch `-data-dir` only) |
| 9 | No real `claude`/`gh` in tests | pass — the delta added no test that spawns a binary; every scratch daemon gets `-issue-token-file` unconditionally, so `GhCLITokenReader` is never selected. **No real `claude` was launched this cycle** — dashboard-scope captures need no session. Zero subscription spend. |

## Design System Compliance

The delta changed no CSS, no markup and no token — `git diff 17f89fd..HEAD` touches neither
`web/src/style.css` nor `web/index.html`. Cycle 1's and cycle 2's §5/§6/§7 checks stand.
Re-confirmed the two things a copy change could disturb, plus the `[hidden]` sweep the
design-system checklist asks for on every UI review:

- **`[hidden]` companions — complete.** Every element `render/issue.ts` toggles via `.hidden`
  has either an author `[hidden] { display: none; }` rule or no author `display` declaration at
  all: `#issue-body` (`style.css:1638`), `#issue-success` (`:1726`), `#issue-error-detail`
  (`:1759`), the three footer buttons (`:1775-1777`), and `#issue-error`, whose only class
  `.launch-error` carries its own companion at `:1583`. Verified in practice as well as in the
  stylesheet: in the live browser the failure state showed the error panel with the success
  panel hidden, and the success state the reverse, with no ghost text in either.
- **Tabular numerics.** `#issue-captured-at`'s `.preview .meta` rule sets
  `font-variant-numeric: tabular-nums` (`style.css:1703`) — the one value in this dialog that
  changes over time. Confirmed rendering live as `captured 11:46:59Z`.
- **State colour.** The delta introduces no colour. `#issue-error`'s `.launch-error` uses
  `--banner-fg`, deliberately not `--rose` (which stays reserved for Failed) — the comment at
  `style.css:1577-1579` says so, and it is still correct.

## Manual Verification

Drove the real binary against a real browser, not the harness: `go build -o …/musterd
./cmd/musterd` on the current checkout (`plan/issue-capture` @ `cdecc1d`), run on a scratch
`-data-dir` at port 19870 with `-issue-api-url` pointed at a controllable local Node stub,
`-issue-repo review/scratch`, `-issue-token-file` holding a distinctive fake bearer,
`-tmux-socket /private/tmp/mrev.sock`, `-usage-poll 0`, serving the **embedded** dashboard (no
`-web-dist`, i.e. the shipping path), driven in Chromium via Playwright. Dashboard scope
throughout — no real `claude`, no subscription spend, no real GitHub.

**Critical 1 (the log-field collision) — fixed, and this is the measurement cycle 2 demanded.**
Stub set to `403 {"message":"stub: token lacks repo scope"}`. The daemon's ConsoleWriter output
(ANSI stripped):

```
1:47PM WRN filing issue: posting to github failed maybe_created=false stage=post upstream="github returned 403: stub: token lacks repo scope"
```

Compare cycle 2's rejected line, from the same code path: `WRN filing issue: posting to github
failed maybe_created=false stage=post` — the detail was absent. It is now present, on the only
writer production uses. The auth branch was measured the same way by `daemon-implementation.md`
Fix Attempt 2 (`stage=token upstream="issue token file is empty"`); I did not re-run that
branch live, because the mechanism is identical and its unit test now decodes the field.

I also re-derived the mechanism independently, rather than taking the diagnosis on trust — a
throwaway zerolog probe against the vendored version (file created, run, deleted; `git status`
clean afterwards, only the untracked `masthead.png` I left alone):

```
ConsoleWriter, key "message" : WRN msg text stage=token                                   ← field GONE
ConsoleWriter, key "upstream": WRN msg text stage=token upstream=UPSTREAM_DETAIL           ← field present
raw JSON,      key "message" : {"level":"warn","stage":"token","message":"UPSTREAM_DETAIL","message":"msg text"}
raw JSON,      key "upstream": {"level":"warn","stage":"token","upstream":"UPSTREAM_DETAIL","message":"msg text"}
```

Both halves of cycle 2's finding reproduce exactly (ConsoleWriter drops the colliding field;
raw JSON duplicates the key), and `upstream` is unaffected by either. The fix addresses the
mechanism, not the symptom.

**Defect-class sweep.** Because this bug was invisible to build, vet, lint and tests, I swept
for siblings rather than only the two sites: `rg 'Str\("(message|level|time|error)"|Int\(…|Bool\(…|Interface\(…'`
over `cmd/` and `internal/` returns **no match**. No other log call in Muster shadows a
zerolog-reserved key.

**REQ-10 / the error render — measured by hand.** Typed a title with real keystrokes
(`pressSequentially`), submitted against the 403 stub, then read the DOM directly:

```
dialogOpen       : true
errorSummaryText : "Could not file the issue."          (role="alert", pinned copy intact)
detailText       : "issue_post_failed — github returned 403: stub: token lacks repo scope"
submitDisabled   : false      successHidden : true      title preserved
```

The `<code> — <message>` separator renders once, GitHub's upstream status reaches the
selectable `<pre>`, and Submit is re-enabled for a retry.

**Minor 1 (`capture_expired` copy) — fixed, verified against the daemon itself.** POSTed a
bogus `captureId` with a real cookie:

```
HTTP 409
{"error":{"code":"capture_expired","message":"capture is unknown, expired, in flight, or already filed; reopen the dialog to take a fresh snapshot"}}
```

The false "this snapshot expired" diagnosis is gone, the remedy survives, and the sentence now
contains **no** em dash — so the only dash the user sees on the detail line is the
`<code> — <message>` separator (cycle 2 measured three dashes in one sentence). This is
byte-identical to the string the E2E assertion pins, which is why that repoint is exact rather
than approximate.

**Minor 2 (rune-counted log lengths) — fixed, measured on both sides of the wire.** Swapped
the stub to `201 {"number":4321,"html_url":…}` and filed a title of 197 `é` characters (197
runes, **394 bytes**). The stub received `titleRunes= 197 titleBytes= 394`; the daemon logged:

```
1:48PM INF filed github issue note_len=0 number=4321 scope=dashboard title_len=197 url=https://example.invalid/review/scratch/issues/4321
```

`title_len=197`, matching the 200-**character** limit the request was validated under. Before
the fix this line would have read `title_len=394` — a length exceeding its own limit on an
accepted request. Fixed.

**REQ-9 (success panel) — re-measured, since the same POST path was touched:**

```
successText : "Filed review/scratch#4321"
linkHref    : "https://example.invalid/review/scratch/issues/4321"
linkTarget  : "_blank"    linkRel : "noreferrer noopener"    errorHidden : true
```

The repo name comes from `-issue-repo`, the number and href from the stub's response — no
`#0`, no empty href, and the link is correctly `noreferrer noopener`.

**REQ-1 / REQ-6 incidentally re-confirmed:** the masthead renders `button "File an issue"`; the
dialog opens with `File issue` **disabled** on an empty title and the Session select showing
only `— none (dashboard only) —` with no sessions present.

**Minor 3 (`ErrPostFailed` doc comment)** — read against the code rather than measured, since
it is a comment. All three sites that set `MaybeCreated: true` (`ghissue.go:188` read error,
`:193` unparseable 2xx, `:202` 2xx with no issue) are covered by the new wording "whenever the
request reached GitHub and may have created the issue — an unreadable or unusable 2xx body",
and the three that leave it false (`:176` transport, `:183`/`:185` non-2xx) are not. Accurate.

**Cleanup.** Daemon and both stubs stopped (`ps aux | grep` → nothing), tmux socket
`/private/tmp/mrev.sock` kill-server'd and removed, scratch data dir / token file / stub
scripts / probe file all deleted, browser closed. `git status --short` shows only
`?? masthead.png`, untouched and never staged. `.playwright-mcp/` is gitignored
(`.gitignore:45`) and left in place. No real `claude` process existed to kill.

## E2E Regression Sweep

**174/174 pass, all 16 spec files, single run, 41.7s, zero skipped.** This was the whole suite,
not just this plan's spec — `npx playwright test --list` independently confirms 174 tests in 16
files, so nothing was silently excluded. `rg 'test\.skip|test\.fixme|test\.only'` over
`web/e2e/` → no match.

The delta's E2E footprint is one assertion in one test (`+6 / -3` lines), so no other plan's
spec could regress, and none did.

**test-specs.md `## Repairs` (Fix Attempt 2) — claim verified, and it holds.** One entry, on
the `capture_expired` remedy test. Both halves check out:

- It replaced `toContainText("reopen the dialog to take a fresh one")` with
  `toContainText("capture is unknown, expired, in flight, or already filed; reopen the dialog
  to take a fresh snapshot")`. That is a **strengthening**: a fragment of the remedy clause
  became the entire sentence — both what is wrong and what to do — pinned verbatim. I checked
  it byte-for-byte against the daemon's live 409 body above; they match exactly.
- The preceding `toHaveText(/^capture_expired — /)` (error-code prefix) and the behavioural
  half (Submit stays disabled, the capture is nulled — the distinction from E4's re-enable) are
  untouched. Edge Case 2 / cycle-1 Minor 3 coverage is intact.
- The log claims "No assertion was deleted, skipped, or weakened." Accurate — the diff is a
  single `toContainText` argument, no `skip`/`fixme`, no container-level `toBeVisible()`
  substitution, no fixture change (the test still uses the existing `envelopedSessionStart`
  helper unchanged).

This is the correct category — sanctioned breakage from an approved copy fix, pre-announced in
`daemon-implementation.md`'s Fix Attempt 2 handoff, not a locator defect. **Nothing here
indicates an E2E Validate process failure**, because no locator or markup mismatch was involved.

## Daemon Test Quality (the cycle-2 Major)

The Major was that the two log tests passed on the broken output. The rewrite fixes exactly
that, and I checked it is not merely different but *sufficient*:

`decodeLastLogEvent` (`issue_test.go:97-110`) `json.Unmarshal`s the last log line into a
`map[string]any` and the tests assert `event["upstream"]`. Under the old, colliding field name
this **cannot** pass: Go's decoder keeps the last duplicate `"message"` (confirmed in my probe
above — the parsed value is the `Msg()` text), so `event["upstream"]` would be `nil` and the
assertion would fail. That is precisely the property cycle 2 asked for: a formulation that
fails on the collision and passes only on the rename. The post-failure test additionally pins
`stage` and `maybe_created`, so the whole event shape is asserted, not just the one field.

The docstring on the helper explains *why* raw-byte matching was wrong, which is the right
place for that knowledge — the next person to write a log test will read it.

## Issues

### Critical

None.

### Major

1. **[orchestrator]** **The feature has no `TODO.md` entry to tick and no `SPEC.md` changelog
   line.** `docs/protocol.md` upkeep is done and correct (§2 error codes, §3.12, §3.13, and a
   2026-08-31 changelog entry at `:758-761`), and the cycle-1 Minor-5 follow-up is filed at
   `TODO.md:448-454`. But `rg -i 'issue-capture|Issue button|file an issue' TODO.md SPEC.md`
   finds **no work item for the feature itself** in either file: `## Pre-v1 Cleanup`
   (`TODO.md:394`) has no line for "let me file a bug report from the dashboard", and
   `SPEC.md` never mentions issue capture at all — not in §2 (MVP features), not in §11
   (Changelog). This is the same gap `embed-dashboard`'s review raised as its Major 2, and the
   same remedy applies: add the entry retroactively under `## Pre-v1 Cleanup` and tick it, in
   the established format (what shipped, the plan name, the date, and the review's carried-
   forward follow-ups). Whether `SPEC.md` also needs a §2/§11 line is a judgement call I am
   deliberately not making for you — the feature is post-spec and user-facing, and CLAUDE.md's
   upkeep rule is about *decisions*, so it is arguably protocol-doc-only; worth a deliberate
   yes or no rather than a silent no. Nothing a pipeline agent may edit, so this does **not**
   block approval — it belongs to the Doc-Upkeep Backstop / Completion steps.

### Minor

None.

### Notes

1. **[note]** **R1 is still outstanding and is the last real gate.** By user decision
   (`decisions/r1-real-post/decision.md`) the orchestrator runs the four R1 steps from the main
   session after this review, and pastes the `gh issue list` output and the **full** issue body
   into this file. Worth stating plainly what R1 is still load-bearing for even though the
   suite is green: it is the only exercise of the real `gh auth token` reader
   (`GhCLITokenReader` — every automated test injects `-issue-token-file` instead, by design,
   per REQ-17), the only real GitHub request, and the only reading of a real filed body against
   §"The allowlist" by eye. My dashboard-scope preview check above is good evidence for the
   allowlist but is not the same artefact.
2. **[note]** `decodeLastLogEvent`'s `require.NotEmpty(t, lines)` can never fire —
   `strings.Split` always returns at least one element, so an empty buffer yields `[""]`, which
   is non-empty as a slice. The very next check (`require.NotEmpty(t, last)`) does catch that
   case with a clear message, so the guard is redundant rather than wrong. No change requested;
   recorded so it is not mistaken for a live assertion later.
3. **[note]** The same helper asserts on the **last** log line, which couples the two tests to
   the warn being the final event of the request. It is today: `writeJSONError`
   (`internal/server/auth.go:45-52`) logs nothing, and nothing else runs after the switch. If a
   future change logs after the warn, these tests fail loudly rather than passing vacuously —
   the safe failure direction — but the fix would then be to select the event by `stage` rather
   than by position. Accepted as-is.
4. **[note]** The E2E assertion now pins the `capture_expired` sentence in full, so any future
   rewording of that string breaks the test. That is the intended cost of copy the plan requires
   the user to be able to read and paste, and it is the same discipline the `"Could not file the
   issue."` summary already lives under. Recorded as an accepted trade-off, not a defect.
5. **[note]** `ErrPostFailed`'s first sentence still enumerates only "non-2xx, a transport
   error, or a 2xx body that would not parse", which omits the read-error and 2xx-with-no-issue
   branches. The second sentence — the one cycle 2 Minor 3 was actually about — now covers all
   three `MaybeCreated: true` cases correctly, so nothing in the comment is false. Not worth a
   further edit.
6. **[note]** The version-drift warning fires on this machine (`installed=2.1.251
   pinned=2.1.246`) and appeared in my manual run's log. Unrelated to this plan, and the
   honesty machinery works — the masthead rendered `claude 2.1.251 (drift from pinned 2.1.246)`
   and the snapshot preview carried `2.1.251 installed · 2.1.246 pinned · drift`. `make canary`
   before trusting Muster against 2.1.251 is a separate, pre-existing item.
7. **[note]** `make test` and the full E2E suite each passed on the first run this cycle;
   neither cycle 1's `TestLauncher_SuccessfulLaunchEndToEnd` timing flake nor its stale-tmux-
   server leak recurred. Both remain worth remembering rather than acting on.
8. **[note]** Cycle 1's Minor 5 (disabled-button affordance) is settled as Option B by user
   decision and filed as an app-wide sweep at `TODO.md:448`. I confirmed both records exist,
   confirmed `#issue-submit-button` still has no visual disabled state as decided, and did not
   re-raise it.

## R1 — the real post (orchestrator, main session, 2026-08-31)

Run per `decisions/r1-real-post/decision.md` (user decision: pipeline runs R1 from the main
session). Real daemon (`make run`, real data dir), real dashboard, real `gh auth token`.
Session launched from the dashboard's New-session dialog: `scratch` directory, custom model
`claude-haiku-4-5-20251001` (typed exactly — the haiku preset would have sent the alias),
prompted `say hi` (it replied "Hey! 👋 How's it going? …"), reached `idle` with
19% context before capture.

**Step 1 — filed and listed.** Dialog showed `Filed Zalaras/muster#1` linked to
`https://github.com/Zalaras/muster/issues/1`. `gh issue list -R Zalaras/muster -L 3`:

```
1	OPEN	Pipeline verification: R1 real post (plan issue-capture)		2026-08-31T11:59:43Z
```

**Step 2 — full body, read against §"The allowlist".** `gh issue view 1 -R Zalaras/muster
--json title,body` returned the body below (verbatim). Read line by line against the
allowlist: every field present is on the pinned list; **absent**: prompt text (`say hi`
appears nowhere), assistant text (the reply appears nowhere), session title, directory,
repo name, branch, worktree flag, Claude session id value (only `claudeSessionIdBound:
true`), pane captures, hook payloads, status-line JSON, and all account usage. The
session's context row is present by design (Damian's explicit inclusion).

<details>
<summary>full body as returned by gh</summary>

## What happened

Verification issue filed by the issue-capture pipeline's R1 step against a real haiku session. Will be closed immediately after inspection.

## Snapshot

| field | value |
| --- | --- |
| musterd | 8f383bd-dirty |
| Claude Code | 2.1.251 installed · 2.1.246 pinned · drift |
| host | darwin/amd64 |
| dashboard | 1 sessions, 1 alive · view focus 2x2 · rail manual |
| state | idle since 2026-08-31T11:58:26Z |
| alive | true |
| model | claude-haiku-4-5-20251001 |
| permission mode | default (last known, source hook) |
| context | 19% · 37762 / 200000 tokens |
| compactions | 0 |
| tmux | muster-1:@0 |
| session | created 2026-08-31T11:57:54Z · claude session bound |
| events | seq 1-8, 14 routed · last 2026-08-31T11:58:27Z |
| recent events | status_line, SessionEnd, SessionStart, status_line, SessionStart, status_line, status_line, UserPromptSubmit, Stop, status_line |

<details>
<summary>raw snapshot</summary>

````json
{
  "capturedAt": "2026-08-31T11:59:05Z",
  "scope": "session",
  "musterd": {
    "version": "8f383bd-dirty"
  },
  "claudeCode": {
    "pinned": "2.1.246",
    "installed": "2.1.251",
    "drift": true
  },
  "host": {
    "os": "darwin",
    "arch": "amd64"
  },
  "dashboard": {
    "sessionsTotal": 1,
    "sessionsAlive": 1,
    "view": "focus",
    "density": "2x2",
    "railSort": "manual"
  },
  "session": {
    "state": "idle",
    "stateSince": "2026-08-31T11:58:26Z",
    "alive": true,
    "endedAt": null,
    "model": {
      "id": "claude-haiku-4-5-20251001"
    },
    "permissionMode": {
      "value": "default",
      "source": "hook"
    },
    "context": {
      "usedPct": 19,
      "totalInputTokens": 37762,
      "windowSize": 200000
    },
    "compactions": 0,
    "tmuxTarget": "muster-1:@0",
    "createdAt": "2026-08-31T11:57:54Z",
    "claudeSessionIdBound": true,
    "events": {
      "firstSeq": 1,
      "lastSeq": 8,
      "count": 14,
      "lastReceivedAt": "2026-08-31T11:58:27Z",
      "recentTypes": [
        "status_line",
        "SessionEnd",
        "SessionStart",
        "status_line",
        "SessionStart",
        "status_line",
        "status_line",
        "UserPromptSubmit",
        "Stop",
        "status_line"
      ]
    }
  }
}
````

</details>

<sub>Filed from the Muster dashboard. Allowlisted snapshot only — no prompt text, hook payload bodies, status-line JSON, pane captures, directory paths, repository names or account usage.</sub>

</details>

**Step 3 — closed.** `gh issue close 1 -R Zalaras/muster -c "pipeline verification (plan
issue-capture)"` → `✓ Closed issue Zalaras/muster#1`; re-list shows `1  CLOSED`.

**Step 4 — session killed.** Ended from the dashboard (End → confirm). `tmux -L muster ls`
after: `no server running on /private/tmp/tmux-501/muster` — no orphan, no continuing subscription burn.

R1 verdict: **pass** — GitHub accepted the request; the filed body is the previewed
allowlisted markdown and nothing else.
