# Review: m1-sessions — cycle 2 (re-review after fix cycle 1)

**Plan**: m1-sessions
**Verdict**: needs-changes

Cycle 1's full findings are archived verbatim in `review-cycle-1.md`.

The fix wave did real work: **Critical 2 is genuinely and completely fixed** (verified
end-to-end through a real launch — the user's own `PostToolUse`/`Stop` command hooks
survive alongside Muster's entry, and a second launch is byte-identical), and **every one
of the 11 Majors and 12 actionable Minors is resolved and hand-verified in a browser** —
including REQ-22, which cycle 1 reported as not implemented. 35/35 E2E, 157 Go tests,
186 Vitest, all six acceptance checks green, hard-rule checklist clean.

Two things keep this at needs-changes:

1. **Critical 1 is only half fixed.** The finding's own headline named "clear-rebind
   **and plain re-bind**"; only the clear-rebind branch was repaired. `SessionStart(
   source:"resume")` reuses the *original* `session_id` — a measured fact recorded in
   `spikes/canary-fields.md` — so it arrives as a **plain** `KindBind`, skips the
   escalation, and still forces `started` while leaving `attention`/`failure` set. I
   reproduced the identical browser symptom cycle 1 described: badge `started` with an
   amber "needs your permission — 00:00" note. Same wire object, same honesty violation,
   different door.
2. **Minor 3's DB-permission fix does not actually close the hole it claims to.**
   `muster.db` is now `0600`, but SQLite's `muster.db-wal` and `muster.db-shm` — which
   hold the most recently written pages, i.e. the newest hook payloads — are still
   `0644`. Measured, not inferred.

Both are cheap. Neither is a regression introduced by the fix wave; both are places the
wave stopped one step short of its own stated goal.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 launch into tmux, 201 + `started` | Yes | Yes | pass |
| REQ-2 row + broadcast before any hook | Yes | Yes | pass |
| REQ-3 repo upsert on launch | Yes | Yes | pass |
| REQ-4 idempotent settings merge preserving unowned keys | **Yes (fixed)** | **Yes (fixed)** | **pass** |
| REQ-5 `GET /api/repos` MRU + defaults | Yes | Yes | pass |
| REQ-6 `GET /api/browse` | Yes | Yes | pass |
| REQ-7 envelope binding / no cwd guessing | Yes | Yes | pass |
| REQ-8 §7 state machine + §7.4 guards | **Partial** | Partial — no test covers a plain bind on an already-bound id | **fail** (Critical 1) |
| REQ-9 permission_mode latches forward | Yes | Yes | pass |
| REQ-10 `/clear` rebind | Yes (fixed) | Yes (fixed) | pass |
| REQ-11 ~5 s liveness poll, state untouched | Yes | Yes | pass |
| REQ-12 whole-object `sessionUpsert` + snapshot | Yes | Yes | pass |
| REQ-13 status posts route but mutate nothing | Yes | Yes | pass |
| REQ-14 launch modal | Yes (spec gaps closed) | Partial — new elements untested (Major 3) | pass |
| REQ-15 Focus-view rail cards | Yes (since-timer added) | Yes | pass |
| REQ-16 pure client-side sort | Yes | Yes | pass |
| REQ-17 first-launch honesty | Yes | Yes | pass |
| REQ-18 degraded states | Yes | Yes | pass |
| REQ-19 `-claude-bin` / `-tmux-socket` | Yes | Yes | pass |
| REQ-20 `LANG`/`LC_ALL` (should) | Yes | Indirect | pass |
| REQ-21 PreCompact counter (should) | Yes | Unit only (deferred to M2 by plan-work) | pass |
| REQ-22 ⌘N opens modal (nice) | **Yes (newly implemented)** | No | pass |

## Build & Tests

E2E tests: **pass** (35/35, full suite, all 6 spec files — 16.5 s)
Daemon tests: **pass** (157 top-level, 0 fail)
Web tests: **pass** (186/186 across 10 files)
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
| W2 | `make web-test` | pass (186/186) |
| E1 | `make e2e` | pass (35/35) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D3a | `internal/session` carries no Claude Code vocabulary | pass | `machine.go` consumes only `claudecode.Kind*`/`StateInput`; event names appear only in explanatory comments |
| D5 (WS half) | `sessionUpsert` reaches clients | pass | Re-confirmed live in the browser (card appears on launch, updates on each hook POST) |
| D7 | idempotent merge preserving unowned keys | **pass (was FAIL)** | End-to-end probe: see Manual Verification — foreign hooks survive, second launch byte-identical |
| D9 | unrouted event logged, no payload | pass | `ingest.go` logs `kind` + `muster_session` only |
| D17 | status posts mutate nothing | pass | `interpret.go:97` maps `status_line` → `KindInert`; E2E REQ-13 green |
| D18 | no ingest payload ever logged | pass | Re-read every log call on the ingest path; none takes the body or payload |
| D20 | branch read at request time | pass | `repos.go` calls `gitutil.Branch` inside the request loop |
| W3 | no `any` in new web code | pass | `rg '\bany\b' web/src` matches only English prose in test names |
| W5 | MRU click prefills model + start-in | pass | Browser: MRU entry set `model=opus`, `permission-mode=plan` |
| W8 | state colour only via tokens; never colour alone | **partial** | All four state tokens are token-only and each maps to exactly one state class; word + sort position always present. But Critical 1 still paints an amber Needs-Input note onto a `started` card via the resume path |
| W12 | banner over stale rail; snapshot replaces wholesale | pass | Covered green by `resilience.spec.ts` + `sessions.spec.ts:407` |
| W13 | empty view-switcher slot sized for M2 | pass | Browser: 104×22 px, 0 children, `border-top-width: 0px` (Minor 8 fixed) |
| — | Design-system conformance (§§1–3, 5–6) | pass | Every colour now resolves to a `:root` token (`--scrim` added, `--rose` off the launch error, `--green` removed); `.r3` computed `tabular-nums`; exactly 1 filled-amber action in the modal, 0 in the rail; no web fonts; 0 gauge/meter/track elements |

Note on the amber note colour: I checked whether the REQ-17 trust-prompt note's amber
left border violates §3 ("`--amber` only ever means Needs-Input"). It does not —
design-system §5 describes the rail card's note as "amber left-border, for the reason it
needs you", and the reference render `a-instrument.html:289` uses `class="note"` for
exactly this trust-prompt text. Sanctioned, not a finding.

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary — no Claude-Code format knowledge outside `internal/claudecode/` | pass — D3 grep clean; `interpret.go` remains the sole payload-key reader |
| 2 | No terminal-output state parsing | pass — zero `capture-pane` in any `.go`/`.ts`; liveness reads pane existence only |
| 3 | Non-blocking hook handler, timeouts ≤ 2 s | pass — `handleIngest` enqueues and returns 200; `hookTimeoutSeconds = 2` (`settings.go:15`), present in the generated file |
| 4 | tmux always on a dedicated socket; no `resize-pane` | pass — every invocation routes through `tmux.Client.run` with `-L`; every test/helper passes `-L <socket>`; zero `resize-pane` in any source file |
| 5 | Never log hook payloads | pass as a *logging* rule — but see Major 1: the WAL sidecar carrying recent payloads is world-readable |
| 6 | No empty-gauge dishonesty | pass — 0 `progress`/`meter`/`.track`/`.gauge` elements in the rendered page; unknown renders the literal word |
| 7 | Session identity on the tmux target, not `session_id` | pass — `session.tmux_target` is the key; the clear path rebinds `claude_session_id` while keeping `id`/`tmuxTarget` |
| 8 | No settings trespass | pass — only `<dir>/.claude/settings.local.json`; zero references to `~/.claude/settings.json` or `CLAUDE_CONFIG_DIR` |
| 9 | No real `claude` outside canary/probes | pass — E2E uses the `#!/bin/sh` stub via `-claude-bin`; no test or fixture invokes the real binary |

## Manual Verification

Drove the app in real headless Chromium through the project's own E2E harness (temporary
probe specs, since that gives a real daemon + real `POST /api/sessions` + real tmux on a
private socket; all probe files removed afterwards and `git status` re-confirmed clean).
Five probes:

- **Critical 1 residue, reproduced (PROBE-A/B)**: from `needs_input`, one
  `SessionStart(source:"resume")` carrying the **same** `claude_session_id` left the card
  reading badge `started` with the note `"needs your permission — 00:00"` and computed
  `border-left-color: rgb(242, 163, 60)` (amber). `GET /api/state`:
  `{"state":"started","attention":{"reason":"permission","since":"2026-08-22T18:11:58Z"},"alive":true}`.
  Repeating from `failed` gave `{"state":"started","failure":{"error":"server_error",…}}`
  with the note `"server_error — API error ended the turn"`. Identical symptom to cycle
  1's Critical 1.
- **Critical 2 fix, confirmed end-to-end (PROBE-D)**: pre-seeded a directory's
  `.claude/settings.local.json` with a user `PostToolUse` formatter hook, a user `Stop`
  notify hook, a `MyOwnEvent` key and a scalar `someUserKey`, then did a real launch.
  After: `PostToolUse` holds **both** `/Users/damian/bin/my-formatter.sh` and Muster's
  `type:"http"` entry; `Stop` likewise; `MyOwnEvent` and `someUserKey` untouched;
  `SessionStart` correctly a single `type:"command"` wrapper. A second launch into the
  same directory produced a **byte-identical** file (no duplication). This is the exact
  scenario cycle 1 proved broken.
- **Fix-wave web surfaces (PROBE-C)**: ⌘N opened the modal from the shell (REQ-22);
  the MRU entry rendered `.dir-name` = `muster-e2e-repo-AJTvoI` **and** `.dir-path` =
  its full absolute path (Major 5); exactly 1 `.btn.key` filled-amber action in the modal;
  `#launch-error` has `role="alert"` and computed `color: rgb(243, 183, 183)` = `--banner-fg`,
  not `--rose` (Majors 1 + Minor 6); `.r3` computed `font-variant-numeric: tabular-nums`
  (Major 3); `#view-switcher` 104×22 px, 0 children, `0px` border (Minor 8); 0 gauge
  elements; card root carries `aria-label="probe-web"` (Minor 9).
- **Git-checkout marker (PROBE-E)**: browsing a directory containing a real `git init`
  checkout and a plain directory rendered `["git-subdir (git)", "plain-subdir"]` —
  Major 6 works. (My first attempt used an empty `.git` directory as the fixture and
  showed no marker; that was my fixture being invalid, not the code — `gitutil.IsRepo`
  shells out to `git rev-parse --is-inside-work-tree`, which correctly rejects it.)
- **WAL sidecar modes (Go probe)**: `muster.db mode=-rw-------`,
  `muster.db-wal mode=-rw-r--r--`, `muster.db-shm mode=-rw-r--r--` — Major 1 below.

Zero console errors and zero page errors across every probe. Could not verify: real
`claude` behaviour (correctly out of scope) and M3-gated surfaces (context gauges, usage
bars), which are `null` by design in M1.

## E2E Suite (regression sweep)

`npm run e2e` over **all 6 spec files, 35 tests — 35 passed** (16.5 s), including the 4
M0 files (`auth`, `ingest`, `resilience`, `shell`) this plan did not author. No
regressions from the fix wave.

**Repairs table verified.** Cycle 1's fix attempt logged one repair: the
`envelopedSessionStart` `model` fixture moving from `{id, display_name}` to a plain
string. I confirmed the claim in its last column holds:

- `spikes/canary-fields.md` now records the measurement (plain model-ID string, never an
  object; optional — the diff is additive and dated, with probe versions named).
- `payloads.ts` sends a plain string; `envelopedStatusLinePreFirstResponse` (line 225)
  correctly **keeps** the `{id, display_name}` object, which is the shape the status line
  really sends. The fixture is now shape-faithful per event type.
- `interpret.go`'s `modelID` dropped the speculative object branch, and
  `interpret_test.go` gained a subtest asserting the object shape is *not* extracted for
  `SessionStart`. The disagreement is settled by measurement rather than accommodated.
- No assertion was deleted, skipped or weakened. Zero `test.skip`/`test.fixme`/`.skip(`/
  `.fixme(` anywhere in `web/e2e` or `web/src`. The two `card.test.ts` expectations that
  changed (`"needs your permission"` → `"needs your permission — 00:10"`) tightened
  rather than weakened, and web-tests added a genuinely new test pinning that the timer
  reads `attention.since` and not `stateSince` — a distinction the old pair could not
  have caught, since both fixtures set the two fields equal.

## Issues

### Critical

1. **[daemon-impl]** **Critical 1 is only half remediated: a plain re-bind still leaves
   `attention`/`failure` set on a `started` session.** `internal/session/machine.go:106-110`
   clears `Attention`/`Failure`/`LastActivity` only inside the `if kind == KindClearRebind`
   branch. `SessionStart(source:"resume")` maps to `KindBind` (`interpret.go:112-115`), and
   per `spikes/canary-fields.md:73-75` — "On `--resume`, the `session_id` and
   `transcript_path` are **the same as the original session's**" — the id-change escalation
   at `machine.go:87-89` never fires. So the plain-bind path falls straight through to
   `setState(StateStarted)` with both fields intact.
   Reproduced in a real browser (Manual Verification, PROBE-A/B): badge `started`, note
   `"needs your permission — 00:00"`, `border-left-color: rgb(242,163,60)`, wire object
   `{"state":"started","attention":{"reason":"permission",…}}`; and from `failed`,
   `{"state":"started","failure":{"error":"server_error",…}}`. This is protocol §5.3's
   `iff` invariant broken and design-system §6 honesty violated — the same two
   consequences cycle 1 named, reached through the door the fix left open. Cycle 1's own
   headline said "Clear-rebind **(and plain re-bind)**".
   **Fix**: hoist the `Attention`/`Failure` reset out of the `KindClearRebind` branch so
   it runs on every bind — §5.3's invariant is unconditional, and no bind should ever
   land on `started` carrying a previous turn's blocked-or-failed note. Keep the
   `Compactions`/prompt-guard/`LastActivity` reset clear-only (that part is genuinely
   `/clear` semantics). The missing test is a companion to the three new
   `TestApplyInput_ClearRebind` subtests: a plain `KindBind` with an **unchanged**
   `claudeSessionID` from `needs_input` and from `failed`.

   While in `applyBind`: §7.3's row `SessionStart (source:"resume", same session_id)`
   specifies "Re-bind to new pane, `alive := true` → **idle** (history exists; it is
   waiting for input, not new)". Neither half is implemented — every bind lands on
   `started`, and `Alive` is only ever assigned `false` anywhere in the codebase
   (`machine.go:74`, `manager.go:313`), so nothing can ever revive a session. Since
   `checkLiveness` skips sessions already marked dead (`manager.go:291`), a session that
   loses its pane can never come back inside M1. REQ-8 asks for "§7.3 exactly" and §8
   assigns "the state machine (§7)" to M1, so this row belongs in scope; if the intent is
   to defer the `alive := true` half to M4's reconcile, that deferral should be written
   into the plan rather than left silent.

### Major

1. **[daemon-impl]** Minor 3's fix leaves the WAL sidecars world-readable, so the newest
   prompt text is still exposed — `internal/store/store.go:52`. `os.Chmod(path, 0o600)`
   runs *after* `PRAGMA journal_mode = WAL` and `Migrate`, by which time SQLite has
   already created `muster.db-wal`/`muster.db-shm` at the driver's default mode, and
   chmod'ing the main file does not touch them. Measured on a fresh store:
   `muster.db mode=-rw-------`, `muster.db-wal mode=-rw-r--r--`,
   `muster.db-shm mode=-rw-r--r--`. The WAL is precisely where the *most recent* commits
   live, so the payloads most worth protecting are the ones still readable by every
   account on the machine. `daemon-implementation.md`'s Fix Attempt 1 claims this change
   "clos[ed] the world-readable window" — it did not, and the claim should not stand
   unchallenged.
   **Fix**: chmod all three paths (`path`, `path+"-wal"`, `path+"-shm"`), tolerating
   `os.IsNotExist` on the sidecars; or set the mode before the driver creates the file.
   Add a `store_test.go` assertion on all three modes so the next change can't silently
   reopen it.
2. **[daemon-impl]** `isMusterEntry` recognizes a Muster HTTP hook by URL **path shape
   alone**, ignoring the host — `internal/claudecode/settings.go:57-62`. The
   path-shape-over-exact-URL choice is well reasoned and documented (an exact match
   couldn't recognize Muster's own stale entry after a port/token rotation, which the
   wholesale-replace guarantee depends on), and I am not asking to revert it. But
   `^/ingest/[^/]+/(hook|status)$` will also match a *foreign* HTTP hook that happens to
   use that path on another host, and such an entry would be silently deleted on every
   launch — the same class of destruction Critical 2 was about, just far narrower.
   **Fix**: additionally require the URL's host to be a loopback address (`127.0.0.1`,
   `[::1]`, `localhost`). That keeps the token/port-rotation heal intact while making a
   remote hook unrecognizable-as-Muster's, and costs one condition.
3. **[web-tests]** / **[e2e-specs]** Seven user-facing behaviours the fix wave added have
   **zero** assertions anywhere. Verified by grep: `(git)` marker — only
   `render/launch.ts:149`; `.dir-path` — only `launch.ts:119` and `style.css:469`;
   `metaKey` — only `launch.ts:219`; `#launch-error` / `showError` — no E2E hit at all.
   web-tests reasoned (correctly, per conventions and cycle 1's Minor 14) that DOM wiring
   is Playwright's job — but e2e-specs was routed only the fixture repair, so no one was
   asked to write the Playwright half, and the work fell through the gap between the two
   agents. Notably **"Launch error line"** is its own row in the plan's Testable UI
   Elements table and has no test in any file, while Major 7's fix just added two new
   writers to it (`loadBrowse`, `loadRepos`). Edge Case 14 ("the browser UI **shows the
   error** and stays where it was") is therefore implemented but unverified.
   **Fix**: `[e2e-specs]` — assert the launch-error line renders a daemon
   `error.message` (the Testable-UI row), the `(git)` marker on a real `git init`
   subdirectory, the MRU path span, and ⌘N opening the dialog. All four are cheap; my
   probes above are working drafts of each. Note also that `launch.spec.ts:69` locates a
   subdirectory button with `{ name: dirName, exact: true }`, which the additive `(git)`
   suffix will break the first time a test browses into a real checkout — worth loosening
   pre-emptively.

### Minor

1. **[daemon-impl]** `sessions.go:125` still passes raw `err.Error()` into the
   client-visible envelope. This one is *correct* — Edge Case 8 and protocol §3.1
   explicitly require `launch_failed`'s "message carries stderr" — so it is not the leak
   cycle 1's Minor 12 meant. Recording it so the next reviewer doesn't re-flag it. Cycle
   1's `browse.go:36` reference was a mis-citation (`browse.go` never used `err.Error()`);
   `repos.go` was the real site and is now curated. Resolved.
2. **[daemon-impl]** `daemon-implementation.md` Fix Attempt 2 records `.card .stripe`'s
   default as "now reads `var(--dim)`", but `style.css:230-234` has no `background`
   declaration at all — the stripe is transparent when unstyled. The outcome is *better*
   than what was logged (no state colour can leak into a stateless card), so no code
   change is wanted; the log line is just inaccurate.
3. **[web-impl]** `NoteKind`'s `"trust"` and `"no-signal"` variants are computed in
   `card.ts:99-104` and then collapsed by `render/sessions.ts:49`
   (`vm.noteKind === "failure" ? "note fail" : "note"`), so the distinction is discarded
   at the DOM boundary. Harmless today (both render identically by design), but a typed
   distinction that nothing consumes will drift.
4. **[web-impl]** The ⌘N handler calls `event.preventDefault()` before checking whether
   the dialog is already open (`launch.ts:218-223`; `openModal` returns early at :208).
   Swallowing the browser's own Cmd+N is the intent of the shortcut, so this is
   cosmetic — but the guard reads more clearly inside the handler than as an early
   return two functions away.
5. **[plan-work]** `spikes/canary-fields.md` now records probes against **2.1.240** while
   `docs/claude-code-pin.md` pins **2.1.233** (the file already carried 2.1.237 entries
   before this plan, so the drift predates it). Not this plan's defect and not
   verdict-affecting, but `make canary` is the gate for a version bump per CLAUDE.md, and
   the pin doc is now two versions behind what measurements are being taken against.
   Worth an explicit decision rather than continued silent drift.
6. **[e2e-specs]** Carried forward from cycle 1's Minor 13, correctly routed to plan-work
   for M2 and **not** expected this cycle: REQ-21's `⟳n` counter has no E2E assertion
   (the counter isn't in the Testable UI Elements table), and the Browse… flow must create
   its scratch directory under the real `$HOME` because `GET /api/browse` defaults there
   with no override. Confirmed still open; still a plan defect rather than a test defect.
7. **[web-tests]** Carried forward from cycle 1's Minor 14 as a recorded decision:
   `renderSessions`'s non-empty DOM branch has no unit test, by design — covered by
   `e2e/sessions.spec.ts` plus `sessions/card.test.ts`. No action; noted so it stays a
   decision rather than becoming an accident.
