# Review: m1-sessions

**Plan**: m1-sessions
**Verdict**: needs-changes

Two Critical findings, both in the daemon, both invisible to the current test suite:
a §7 clear-rebind path that leaves `attention`/`failure` set on a `started` session
(breaking protocol §5.3's `iff` invariant *and* producing a design-system §6 honesty
violation I reproduced in a real browser), and a `settings.local.json` merge that
silently destroys the user's own hooks on the ten events Muster also registers.
Everything else is in good shape: 35/35 E2E, 156 Go tests, 185 Vitest, all six authored
acceptance checks green, hard-rule checklist clean.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 launch into tmux, 201 + `started` | Yes | Yes (E2E + `TestLauncher_SuccessfulLaunchEndToEnd`) | pass |
| REQ-2 row + broadcast before any hook | Yes | Yes (`TestCreateSession_DoesNotBroadcast`, `TestRecordLaunch_BroadcastsOnceWithTheRealTarget`) | pass |
| REQ-3 repo upsert on launch | Yes | Yes (`TestUpsertRepo_*`, D6) | pass |
| REQ-4 idempotent settings merge preserving unowned keys | **Partial** | Partial — no test covers a user hook on a Muster-owned event | **fail** (Critical 2) |
| REQ-5 `GET /api/repos` MRU + defaults | Yes | Yes (`TestHandleListRepos_*`) | pass |
| REQ-6 `GET /api/browse` | Yes | Yes (`TestHandleBrowse_*` + E2E 400/404) | pass |
| REQ-7 envelope binding / no cwd guessing | Yes | Yes (`TestIngestRouting_*`) | pass |
| REQ-8 §7 state machine + §7.4 guards | **Partial** | Partial — the clear-from-`needs_input`/`failed` paths are untested | **fail** (Critical 1) |
| REQ-9 permission_mode latches forward | Yes | Yes (D13, `TestApplyInput_TurnFailed`) | pass |
| REQ-10 `/clear` rebind | **Partial** | Partial — E7 only clears from `started` | **fail** (Critical 1) |
| REQ-11 ~5 s liveness poll, state untouched | Yes | Yes (`TestCheckLiveness_*`, E9; verified in browser) | pass |
| REQ-12 whole-object `sessionUpsert` + snapshot | Yes | Yes (E10/W12; verified in browser) | pass |
| REQ-13 status posts route but mutate nothing | Yes | Yes (E2E REQ-13) | pass |
| REQ-14 launch modal | Yes (minor spec gaps) | Yes (W4 E2E) | pass with Majors |
| REQ-15 Focus-view rail cards | Yes (since-timer missing) | Yes | pass with Majors |
| REQ-16 pure client-side sort | Yes | Yes (13 unit tests + E8) | pass |
| REQ-17 first-launch honesty | Yes | Yes (both branches E2E; verified in browser) | pass |
| REQ-18 degraded states | Yes | Yes (E9, W12; verified in browser) | pass |
| REQ-19 `-claude-bin` / `-tmux-socket` | Yes | Yes (every E2E test) | pass |
| REQ-20 `LANG`/`LC_ALL` (should) | Yes | Indirect | pass |
| REQ-21 PreCompact counter (should) | Yes | Unit only, no E2E (acknowledged) | pass |
| REQ-22 ⌘N opens modal (nice) | **No** | No | not implemented (no verdict impact) |

## Build & Tests

E2E tests: **pass** (35/35, full suite, all 6 spec files — 15.1 s)
Daemon tests: **pass** (156 top-level, 0 fail; `-race` clean)
Web tests: **pass** (185/185 across 10 files)
Daemon build: **pass**
Web build: **pass**
Lint: **pass** (golangci-lint, 0 issues)

## Acceptance Checks

Every line of the plan's ```checks block, run verbatim from the repo root.

| ID | Command | Result |
|----|---------|--------|
| D1 | `go build ./...` | pass (exit 0) |
| D2 | `make check` | pass (exit 0) |
| D3 | `! rg -n "hook_event_name\|notification_type\|last_assistant_message\|stop_hook_active" cmd/ internal/ --glob '!internal/claudecode/**'` | pass (exit 0 — no matches) |
| W1 | `make web-build` | pass (exit 0) |
| W2 | `make web-test` | pass (185/185) |
| E1 | `make e2e` | pass (35/35) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D3a | `internal/session` carries no Claude Code vocabulary | pass | Production code references only `claudecode.Kind*` / `StateInput`; the only hits for event names (`machine.go:79,84`, `manager.go:350`) are explanatory comments, not decodes |
| D5 (WS half) | `sessionUpsert` reaches clients | pass | `server.go:103-105` wires `Manager.OnUpsert` → `hub.broadcast`; `RecordLaunch` is the single first-broadcast point; observed live in the browser |
| D7 | idempotent merge preserving unowned keys | **FAIL** | Idempotency holds, but a user hook on a shared event is destroyed — see Critical 2 |
| D9 | unrouted event logged, no payload | pass | `ingest.go:145-152` logs `kind` + `muster_session` only |
| D17 | status posts mutate nothing | pass | `interpret.go:90` maps `status_line` → `KindInert`; E2E REQ-13 confirms `title` unchanged |
| D18 | no ingest payload ever logged | pass | Read every log call on the ingest path (`ingest.go:56,97,99,117,127,145,152,170`) — none takes `job.body` or `ev.Payload` |
| D20 | branch read at request time | pass | `repos.go:36-39` calls `gitutil.Branch` inside the request loop, never a cached column |
| W3 | no `any` in new web code | pass | `rg '\bany\b' web/src` matches only English prose in 4 test names |
| W5 | MRU click prefills model + start-in | pass | Browser: clicking the MRU entry set `model=opus`, `permission-mode=plan` from the seeded launch |
| W8 | state colour only via tokens; never colour alone | **FAIL** | Word + sort position are always present, and all four state tokens are token-only — but the Critical 1 bug paints an amber Needs-Input note onto a `started` card, so amber stops meaning Needs-Input |
| W12 | banner over stale rail; snapshot replaces wholesale | pass | Browser: killed the daemon → banner visible with its explanatory text, both cards still rendered with unchanged badges, timer kept climbing 01:33 → 01:37 |
| W13 | empty view-switcher slot sized for M2 | pass | Browser: `#view-switcher` is 104×22 px with 0 children |
| — | Design-system conformance (§§1–3, 5–6) | pass with Majors | §6 honesty rules clean on all eight; one amber primary action per surface (rail 0 / modal 1); tabular-nums on 7 of 8 time-varying values. Majors listed below |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary — no Claude-Code format knowledge outside `internal/claudecode/` | pass — D3 grep clean; `interpret.go` is the sole payload-key reader; remaining `permission_mode` hits outside it are comments and Muster's own SQL column names |
| 2 | No terminal-output state parsing | pass — zero `capture-pane` in any `.go`/`.ts`; liveness reads pane *existence* only (`tmux.go:78-88`) |
| 3 | Non-blocking hook handler, timeouts ≤ 2 s | pass — `handleIngest` reads the body, enqueues, returns 200 with no DB work (`ingest.go:167-184`); `hookTimeoutSeconds = 2` (`settings.go:13`), verified in the generated file |
| 4 | tmux always on a dedicated socket; no `resize-pane` | pass — every invocation goes through `tmux.Client.run` with `-L <socket>` (`tmux.go:99`); tests use private per-test sockets; zero `resize-pane` in any source file |
| 5 | Never log hook payloads | pass — see D18 above (see Minor 3 for the DB file mode) |
| 6 | No empty-gauge dishonesty | pass — no `progress`/`meter`/track element exists anywhere; unknown renders the literal word (`card.ts:70`, `masthead.ts:21-26`); browser confirmed `ctx unknown` with 0 gauge elements |
| 7 | Session identity on the tmux target, not `session_id` | pass — `session.tmux_target` is the key; `claude_session_id` is a mutable attribute and the clear path rebinds it while keeping `id`/`tmuxTarget` |
| 8 | No settings trespass | pass — only `<dir>/.claude/settings.local.json` is touched (`sessions.go:165`); zero references to `~/.claude/settings.json` or `CLAUDE_CONFIG_DIR` |
| 9 | No real `claude` outside canary/probes | pass — E2E writes a `#!/bin/sh` sleep-loop stub and passes `-claude-bin`; no test or fixture invokes the real binary |

## Manual Verification

Built `web/dist`, then ran the real `musterd` on `127.0.0.1:8791` against a scratch data
dir with a stub `claude` and a private `-tmux-socket muster-review`, and drove it in a
real headless Chromium (the Playwright MCP profile was locked, so I scripted Playwright
directly). Screenshots in the scratchpad. What I confirmed by hand:

- **Launch, MRU path**: `POST /api/sessions` → 201 with `state:"started"`,
  `tmuxTarget:"muster:@1"`, `repo:{name:"repo-a",branch:"feat-review",isWorktree:false}`,
  `permissionMode:{value:"plan",source:"seed"}`, `firstLaunchHere:true`. Card appeared
  immediately.
- **W5**: reopening the modal and clicking the MRU entry prefilled `model=opus` and
  `permission-mode=plan` — read out of the live DOM, not inferred.
- **W7 / honesty rule 1**: card rendered `review-seed` · `started` · `00:01`
  (`font-variant-numeric: tabular-nums` computed) · `repo-a / feat-review` ·
  `ctx unknown`, with `querySelectorAll("progress, .track, .gauge, meter").length === 0`.
- **W13**: `#view-switcher` measured 104×22 px, empty.
- **REQ-17**: the first-launch card showed "first launch here — likely waiting on Claude
  Code's trust prompt"; a second launch into the same directory showed the no-signal note
  after ~10 s (E2E).
- **State walk**: synthesized enveloped SessionStart → `Notification(permission_prompt)`
  drove the card to `needs input` with an amber stripe (`rgb(242,163,60)`) and the
  "needs your permission" note; a `StopFailure` drove it to `failed` with a rose stripe
  (`rgb(227,106,106)`) and `server_error — API error ended the turn` verbatim.
- **Critical 1, reproduced end-to-end**: from `needs_input`, posting
  `SessionEnd(reason:"clear")` then `SessionStart(source:"clear")` left the card reading
  badge `started`, grey stripe, **and still "needs your permission" in an amber-bordered
  note**. `GET /api/state` confirmed the wire object:
  `{"state":"started","attention":{"reason":"permission","since":"…"},"claudeSessionId":"cs-2"}`.
  Repeating from `failed` left `started` + the stale `server_error` failure note. In both
  cases the REQ-17 honesty note was suppressed by the stale one.
- **REQ-11 / W11**: `tmux -L muster-review kill-window` → within 8 s the card's computed
  opacity dropped to `0.55` with its badge word unchanged.
- **W12**: killed the daemon → banner appeared ("musterd unreachable — hook output in
  open panes is Muster's absence, not session failure"), both cards stayed rendered with
  unchanged badges, and the time-in-state timer kept counting (01:33 → 01:37).

Zero console errors and zero page errors across all three sessions. Scratch daemon and
tmux server torn down; all probe/verify files removed (`git status` clean of them).

I could not verify: real `claude` behaviour (correctly out of scope — burns Damian's
subscription), and M3-gated surfaces (context gauges, usage bars) which are `null` by
design in M1.

## E2E Suite (regression sweep)

`npm run e2e` over **all 6 spec files, 35 tests — 35 passed**, including the 5 M0 files
(`auth`, `ingest`, `resilience`, `shell`) this plan did not author. No regressions.

**Repairs table verified.** One repair (E6's `expect.poll` count 3 → 4). I read the test:
it still asserts the straggler event is persisted *and* that the badge stays `idle`
afterwards — the changed literal is only the synchronisation count, so REQ-8/E6 is still
genuinely verified. Not a weakening.

**No vacuous passes found**: zero `test.skip` / `test.fixme` / `.skip(` / `.fixme(`
anywhere in `web/e2e` or `web/src`; no assertion replaced by a container-level
`toBeVisible()`. `render/sessions.test.ts` did lose two assertions, but they pinned the
M0 `"N sessions"` stub text that the plan explicitly required be replaced — the coverage
genuinely moved to `sessions/card.test.ts` (26 tests) plus `e2e/sessions.spec.ts`, both
of which I confirmed assert real card content.

One fixture **did** drift from the measured captures — see Major 11.

## Issues

### Critical

1. **[daemon-impl]** Clear-rebind (and plain re-bind) forces `state = started` without
   clearing `Attention` / `Failure`, breaking protocol §5.3's stated invariants
   (`attention` non-null **iff** `needs_input`; `failure` non-null **iff** `failed`) and
   producing a design-system §6 honesty violation — `internal/session/machine.go:87-108`
   (`applyBind`) never touches either field, unlike `KindTurnClosed` at
   `machine.go:47-48`.
   Reproduced in a real browser: a card blocked on a permission prompt, after
   `SessionEnd(clear)` + `SessionStart(source:"clear")`, reads badge `started` with a
   grey stripe **and** an amber-bordered "needs your permission" note; from `failed` it
   reads `started` with the stale `server_error — API error ended the turn`. The wire
   object confirms it:
   `{"state":"started","attention":{"reason":"permission",…},"claudeSessionId":"cs-2"}`.
   Two knock-on effects: the amber note means Needs-Input on a non-blocked session
   (breaks W8 / design-system §3), and the stale note suppresses REQ-17's trust-prompt /
   no-signal note, because `card.ts:105-113` gives attention and failure precedence.
   **Fix**: in `applyBind`, on both the clear-rebind and the id-change escalation paths,
   set `sess.Attention = nil` and `sess.Failure = nil` alongside the existing
   `Compactions`/prompt-guard reset. `/clear` starts a fresh conversation, so consider
   resetting `LastActivity` too (§5.3: "null until a first Stop"). E7 only ever clears
   from `started`, which is why nothing caught this — the new test belongs in
   `TestApplyInput_ClearRebind`, clearing from `needs_input` and from `failed`.

2. **[daemon-impl]** `MergeSettings` replaces the **whole hook array** for each of the ten
   events Muster registers, silently destroying the user's own hooks on those events —
   `internal/claudecode/settings.go:63-67`. REQ-4 requires a merge that "preserves all
   keys Muster does not own" and Edge Case 9 specifies "Muster's entries are
   *recognizable* … and are replaced wholesale"; recognizability is never used, so
   ownership is never distinguished. Proven with a probe against the real function: an
   existing
   `"PostToolUse":[{"hooks":[{"type":"command","command":"/Users/damian/bin/my-formatter.sh","timeout":10}]}]`
   came back as Muster's `type:"http"` entry alone — the formatter hook was gone.
   (`MyOwnEvent` and `someUserKey` did survive, so the outer-key preservation is fine.)
   This runs on **every launch** into that directory and destroys config Damian may
   depend on; the ten affected events include `PreToolUse`, `PostToolUse`,
   `UserPromptSubmit` and `Stop` — the most commonly user-hooked events there are.
   **Fix**: within each event's array, drop only entries recognizable as Muster's (their
   `url` is the daemon's ingest URL, or their `command` is one of the generated wrapper
   script paths), append Muster's fresh entry, and keep every foreign entry in place. The
   missing test is a companion to `TestMergeSettings_PreservesKeysMusterDoesNotOwn`: a
   user command hook on a Muster-owned event must survive.

### Major

1. **[web-impl]** `--rose` used for the launch error line — `web/src/style.css:589`
   (`.launch-error { color: var(--rose) }`). Design-system §3 reserves `--rose` for the
   Failed *session state*; an HTTP error from `POST /api/sessions` is not that. §1's
   `--banner-*` note spells out this exact reasoning ("the banner describes the daemon,
   not any session's Failed state; `--rose` stays reserved for Failed") and the codebase
   already knows the pattern — it added `--border-*` and `--note-fg-*` to `:root` for the
   same reason. Add a token (or reuse `--banner-fg`).
2. **[web-impl]** Hard-coded colour literal in a component rule —
   `web/src/style.css:408`, `dialog#launch-dialog::backdrop { background: rgba(8, 9, 13, 0.72) }`.
   §1: "Never hard-code a hex value in a component — if a needed colour isn't here, add
   it here first." The value matches the reference render; only its location is wrong.
   Add `--scrim` to `:root`. This is the only colour literal outside the token block.
3. **[web-impl]** Context row missing `font-variant-numeric: tabular-nums` —
   `web/src/style.css:282-288` (`.r3`). §2 calls this "non-negotiable" for "timers,
   percentages, token counts". `.r3` already carries the live `⟳n` compaction counter
   (`card.ts:69-70`), so a 9 → 10 transition shifts the row; it is also the element that
   will carry M3's percentage and token count. Seven of the eight time-varying values are
   correct — `.timer`, both usage readouts, `.railhead .n`, `.dir-age`, `#claude-version`
   all set it — so this is the one omission.
4. **[web-impl]** The attention note omits the since-timer the plan specifies —
   `web/src/sessions/card.ts:73-76` returns only the reason text, but plan line 287
   requires `"needs your permission" / "waiting for your input" + since-timer`, and
   design-system §3 requires the Needs-Input timer to count up and escalate.
   `attention.since` is already parsed (`protocol.ts`) and already drives the sort
   (`sort.ts:29-31`); `formatTimer` is imported in the same file. Note `.timer` shows
   `stateSince`, which is a *different* fact — it resets on any state re-entry, whereas
   `attention.since` is the blocked-since truth the sort orders on.
5. **[web-impl]** MRU entries never show the directory path —
   `web/index.html:115-121` has no path span and `web/src/render/launch.ts:121` renders
   `repo.name` (the basename) only. The plan's UI spec requires "one button per
   directory — name, **path**, branch or `—`, relative last-launch age", and ux-flows §1.1
   renders full paths. Consequence: a repo and its linked worktree — which ux-flows §2
   says Damian already uses — are indistinguishable in the picker, so a launch can go
   into the wrong checkout. `repo.path` is already in hand (used at `launch.ts:125`).
6. **[web-impl]** Folder-browser subdirectories don't mark git checkouts —
   `web/src/render/launch.ts:142` sets `button.textContent = dir.name` and discards
   `dir.isGit`. The plan's UI spec says "subdirectory buttons (from `GET /api/browse`,
   git checkouts marked)". The daemon computes `isGit` per subdirectory (`browse.go:64`)
   and the client parses it — it just never reaches the DOM.
7. **[web-impl]** Browse and repo-list failures are silent —
   `web/src/render/launch.ts:149-159`: both `loadBrowse` and `loadRepos` return early on
   `!result.ok` with no user-visible message. Edge Case 14 requires "the browser UI
   **shows the error** and stays where it was"; only the "stays where it was" half is
   implemented (the comment at :151-152 says as much). `showError` is right there.
8. **[daemon-impl]** `checkLiveness` holds live `*Session` pointers outside the mutex —
   `internal/session/manager.go:282-291` collects pointers under the lock, then reads
   `target.TmuxTarget` at :291 with the lock released, while `RecordLaunch` writes that
   same field under the lock at :169. Confirmed a genuine `WARNING: DATA RACE` under
   `-race` with a probe. In fairness: **not reachable with today's call graph**, because
   `RecordLaunch` runs exactly once per session and the poll filters out sessions whose
   target is still `""` — my probe had to call it twice to trigger it. But the locking
   discipline is wrong (`List()` at :245-253 deliberately returns clones, showing the
   author knew), and it goes live the moment anything else writes `TmuxTarget` — which
   M2's geometry work will. **Fix**: collect `{id, target}` value copies under the lock.
9. **[daemon-impl]** Wrapper scripts are written world-readable with the ingest token in
   cleartext — `internal/claudecode/settings.go:147` uses `0o755`. Verified on a live
   daemon: `-rwxr-xr-x hook-sessionstart.sh` containing
   `curl … http://127.0.0.1:8791/ingest/<token>/hook`, next to a correctly-`0600`
   `tokens.json`. Only the daemon's own user ever executes these, so `0o700` is equally
   functional and doesn't publish the token to every account on the machine.
10. **[daemon-impl]** No rollback when `RecordLaunch` fails —
    `internal/server/sessions.go:146-149` returns `launch_failed` after the tmux window
    has already been spawned, leaving the session row persisted, the pane running, and no
    `sessionUpsert` ever broadcast: an invisible session plus a stray pane the user can't
    see or reach. Every other failure path calls `l.rollback`. Add it here too (and kill
    the window).
11. **[e2e-specs]** `envelopedSessionStart` sends `model` as `{id, display_name}` —
    `web/e2e/helpers/payloads.ts:34,53` — but the plan's own Protocol Contract and
    Implementation Notes both describe `SessionStart`'s model field as "a plain model-ID
    string, sometimes absent — measured 2026-08-20". `spikes/canary-fields.md` records
    `{id, display_name}` only for the **status line** (line 170); its hook table (line 39)
    lists `model` on `SessionStart` with no shape at all. So the fixture asserts a wire
    shape no measurement supports, and `interpret.go:121-136` was then written to accept
    *both* shapes — an accommodation that hides the disagreement rather than settling it.
    No test is vacuous as a result, but REQ-7's "SessionStart's model replaces the launch
    value" is only proven against a possibly-fictional shape. **Fix**: settle it with a
    measurement (`/interface-probe`), record the real shape in `spikes/canary-fields.md`,
    then align the fixture — and drop whichever branch of `modelID` turns out to be
    fiction. Every other fixture I checked is faithful to the measured table
    (`Stop` carries `background_tasks`/`session_crons`; `StopFailure`, `Notification`,
    `SessionEnd` correctly carry no `permission_mode`; `PermissionRequest` does).

### Minor

1. **[web-impl]** REQ-22 (⌘N opens the launch modal) is not implemented — no keydown
   listener anywhere. Nice-to-Have, so no verdict impact, but it should be ticked or
   dropped explicitly rather than left silent.
2. **[daemon-impl]** `handleCreateSession` threads `r.Context()` through the entire launch
   (`sessions.go:201`), so a client that navigates away mid-launch cancels the tmux spawn
   *and* the rollback's own DB write (`rollback` at :155-158 reuses the dead ctx).
   `context.WithoutCancel` for the launch, or a fresh background ctx for the rollback.
3. **[daemon-impl]** `muster.db` is created `0644` and stores hook payloads verbatim,
   i.e. prompt text in a world-readable file — observed on the live daemon. The mode
   is pre-existing M0 code (`store.Open`), not this plan's change, but M1 is the first
   milestone where real prompt text actually flows, so it's now materially relevant.
   Adjacent to hard rule 5 rather than a violation of it (a DB isn't a log). `0600`
   would close it.
4. **[web-impl]** `--idle` used as the generic default stripe colour —
   `style.css:224-228` (`.card .stripe { background: var(--idle) }`). §3 says a state
   colour may only mean that state; a stateless card would render as Idle. Never visible
   today (all six states are mapped and every override wins), but `--line`/`--dim` is
   the honest inert default.
5. **[web-impl]** `--green` (`style.css:25`) is declared and never referenced — the
   reference render uses it for the masthead health dot, which wasn't ported.
6. **[web-impl]** `#launch-error` has no `role="alert"` / `aria-live` —
   `web/index.html:89`. A screen-reader user who presses Launch and fails gets silence
   with the dialog still open. `#banner` (:23) already models the fix.
7. **[web-impl]** `#protocol-mismatch` (`web/index.html:40`) is a bare `<div>` that
   replaces the whole app; a full-page fatal state deserves `role="alert"` and focus
   placement, or the shell just vanishes.
8. **[web-impl]** The empty view-switcher slot draws a visible 1 px border —
   `style.css:101-106`. §8 asks for the *space* to be reserved (which it correctly is,
   104×22), not for a phantom control; an empty bordered rectangle reads as broken or
   disabled. Drop the `border`, keep the box.
9. **[web-impl]** Card title is a `<span>` and the timer is unlabelled
   (`web/index.html:103,106`), so a card has no accessible name and `00:08` is unexplained.
   Harmless in M1 (cards aren't interactive yet) but mandatory once M2 makes them
   focusable.
10. **[web-impl]** `contextText` (`card.ts:67-71`) never reads `usedPct` /
    `totalInputTokens` / `windowSize`, all three of which are parsed and typed. The
    moment the daemon populates them the card will keep asserting "unknown" about data it
    holds — the mirror image of honesty rule 1. A `TODO` citing §6.2 at minimum.
11. **[daemon-impl]** `interpret.go:85` sets `FailureError: &f.Error` unconditionally, so
    a `StopFailure` with no `error` field yields a pointer to `""` and the card renders a
    bare `" — message"`. `TestInterpret_StopFailure_EmptyErrorStillReturnsANonNilPointer`
    pins this as intended; worth deciding whether it should instead be nil.
12. **[daemon-impl]** `repos.go:29` and `browse.go:36` pass raw `err.Error()` into the
    client-visible error envelope, leaking internal paths/messages. Harmless for a
    localhost single-user tool; inconsistent with the curated messages elsewhere.
13. **[e2e-specs]** Two gaps the log already flags honestly and I agree are plan defects,
    not test defects — routing them to **plan-work** for M2 rather than e2e-specs:
    REQ-21 (PreCompact `⟳n`) has no E2E assertion because the counter isn't in the
    Testable UI Elements table; and the Browse… flow must create its scratch directory
    directly under the real `$HOME` because `GET /api/browse` defaults there and the
    modal offers no way to jump to an arbitrary path. A `-home-dir`-style override (or a
    path input) would fix the latter properly.
14. **[web-tests]** `renderSessions`'s non-empty DOM branch now has no unit test at all
    (only the empty-state assertion remains). Consistent with conventions ("interaction
    and rendering are Playwright's job") and the branch is genuinely covered by
    `e2e/sessions.spec.ts` plus `card.test.ts`, so I'm not asking for a jsdom harness —
    noting it so the gap is a recorded decision rather than an accident.
