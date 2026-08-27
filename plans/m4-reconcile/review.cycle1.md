# Review: M4 — Reconcile, shutdown policy, end / remove / resume

**Plan**: m4-reconcile
**Verdict**: needs-changes

Every automated gate is green — 87/87 E2E, 387/387 Vitest, all Go packages, lint `0
issues`, all 12 authored acceptance checks. The defects below were found by reading the
diff and by driving the app in a real browser; none of them is visible to the test suite
as it stands.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 reconcile on start, before serving | Yes | Yes (D9, E2, E4) | pass |
| REQ-2 unknown panes reported, never adopted | Yes | Yes (D10, reconcile.spec) | pass |
| REQ-3 shutdown policy (`-on-exit`) | Yes | Yes (D19–D21, E3, E4) | pass — verified by hand, see Manual Verification |
| REQ-4 pane snapshots | Yes | Yes (D14, D18, E6) | pass |
| REQ-5 End | Yes | Yes (D15, D17, E5) | pass (see Minor 1) |
| REQ-6 Remove | Yes | Yes (D16, D17, E9, E12) | pass |
| REQ-7 Resume | Yes | Yes (D17, E7) | pass — argv verified by hand |
| REQ-8 resume lands in `idle` | Yes | Yes (D11, D12, E8) | **fail** — Major 1: also sets `alive` from a hook |
| REQ-9 ended sort + styling | Yes | Yes (W4, W5, E5) | pass |
| REQ-10 focus mainhead | Yes | Yes (E5, E9, E14) | **fail** — Major 2 (disconnect), Major 4 (copy) |
| REQ-11 card action row | Yes | Yes (E5, E9) | **fail** — Major 3: keyboard-dead |
| REQ-12 tiles | Yes | Yes (E11, E12) | pass — verified by hand |
| REQ-13 dead-session surface | Yes | Yes (E6, E13, INV-5) | **fail** — Major 2, Major 4 |
| REQ-14 confirm dialogs | Yes | Yes (E5, E9, E10) | pass — Escape verified by hand |
| REQ-15 `sessionRemoved` on the client | Yes | Yes (W6, W7, E9, E12) | pass |
| REQ-16 D5 regression guard | Yes | Yes (D8) | pass |
| REQ-17 reconcile summary log | Yes | Yes (D9/D10) | pass |
| REQ-18 ⌘1–9 on an ended session | Yes | No (no `E*` assigned) | pass |
| REQ-19 (nice-to-have) snapshot `capturedAt` age | No | — | not done — see Minor 8 |

## Build & Tests

E2E tests: **pass** (87/87, full suite, `npm run e2e`, 24.4s)
Daemon tests: **pass** (`make test`, all 9 packages `ok`)
Web tests: **pass** (387/387, 16 files)
Daemon build: **pass** (`go build ./...`)
Web build: **pass** (`make web-build`)
Lint: **pass** (`golangci-lint run` → `0 issues.`)

## Acceptance Checks

Every line of the plan's ```checks block, run verbatim from the repo root.

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass |
| D2 | `go build ./...` | pass |
| D3 | `make lint` | pass |
| D4 | `! rg -n "hook_event_name" cmd/ internal/ --glob '!internal/claudecode/**'` | pass |
| D5 | `! rg -n '"rate_limits"\|"used_percentage"\|…' cmd/ internal/ --glob '!internal/claudecode/**'` | pass |
| D6 | `! rg -n '"--resume"' cmd/ internal/ web/ --glob '!internal/claudecode/**' --glob '!web/e2e/**'` | pass |
| D7 | `! rg -n "resize-pane" cmd/ internal/ web/ test/` | pass |
| D8 | `rg -q "func TestMergeSettings_ForeignCommandHookOnSessionStartSurvives" internal/claudecode/settings_test.go` | pass |
| D22 | `ls internal/store/migrations/0004_reconcile.sql` | pass |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass |
| E1 | `make e2e` | pass |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D9 | Reconcile deletes/marks/leaves-byte-identical | pass | `manager_test.go:843` compares whole `store.SessionRow` before/after, not spot fields |
| D10 | unknown `muster-*` reported, no row created | pass | `manager_test.go:875` exact-slice equality (proves both negatives); `:880` `assert.Len(rows, 1)` |
| D11 | `KindResumeBind` → idle from all six states | pass (assertions) | `machine_test.go:291` table over all six; `:306–308` idle/attention nil/failure nil |
| D12 | different claude id escalates → `started` | pass | `machine_test.go:339` |
| D13 | `BuildArgv` `--resume`, omits `--name` | pass | `launch_test.go:53–60`, full-argv `assert.Equal` so omission is proven by exact equality |
| D14 | capture never mutates state (INV-4) | pass | `manager_test.go:1028–1032` whole-struct compare with only the two snapshot fields zeroed |
| D15 | End flips only the target (INV-2) | pass | `manager_test.go:1117` exact-slice kill log; `:1123–1130` bystander in memory *and* store |
| D16 | Remove kills before deleting; failing kill keeps row | pass | `manager_test.go:1231–1234`; ordering proven behaviourally, not by a call-sequence assertion |
| D17 | 409 `not_alive` / 409 `not_resumable` ×2 / 404 | pass | all four assert the JSON **code** string, not only the status (`sessions_test.go:310, 335, 352, 373`) |
| D18 | pane 404 `no_snapshot` → 200 text/capturedAt | partial | `capturedAt` is only `assert.NotEmpty` (`sessions_test.go:416`) — see Minor 6 |
| D19 | `-on-exit=leave` survives | pass | `onexit_test.go:258–260`, real subprocess + real SIGTERM |
| D20 | `-on-exit=kill` kills + row `alive=0` | pass | `onexit_test.go:272–283`, DB reopened independently |
| D21 | `ask` + non-TTY behaves as leave | pass | `onexit_test.go:289–301`, real `os.Pipe()` stdin |
| W3 | no `any` in new web code | pass | zero hits for `: any` / `as any` / `<any>` / `any[]` across `web/src` and `web/e2e` |
| W4 | sort ended-last, most-recent-first | pass | `sessions/sort.test.ts`, 6 cases incl. tie-break and purity |
| W5 | card view-model actions + `ended <age>` | pass | `sessions/card.test.ts` |
| W6 | `sessionRemoved` parse + reject malformed | pass | `protocol.test.ts`, incl. `id: 0` boundary |
| W7 | `live.ts` drops a removed id | pass | `sessions/live.test.ts` |
| W8 | never opens `/ws/terminal/{id}` for `alive:false` | pass | `aliveOnly` unit-tested; network assertion in `actions.spec.ts` INV-5 test; confirmed by hand |
| E2–E15 | present in the specs and green | pass | all 16 new specs present and passing in the full run |
| R1 | `internal/session` stores capture text, never inspects it | pass | `machine.go` has zero `Snapshot` references; `manager.go` uses the string only for assignment, emptiness and change-detection equality (`:457`, `:485`, `:490`, `:617`, `:806`, `:869`) |
| R2 | manual real-`claude` haiku resume check | **not done** | see Manual Verification — I did not launch the real binary |
| R3 | snapshot text in no log line | pass (with a latent channel) | no log call site carries the text; see Minor 4 for the one indirect path, which I probed and could not reproduce |
| R4 | doc upkeep (TODO, SPEC §11, protocol) | partial | `docs/protocol.md` merged (92 insertions); `TODO.md`, `SPEC.md`, `spikes/canary-fields.md` untouched — Major 8 |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary (no Claude-Code fields outside `internal/claudecode`) | pass — D4/D5/D6 all clean; `--resume` and `source:"resume"` both confined to the adapter |
| 2 | No terminal-output state parsing | pass — `CapturePane` is stored and served only; `machine.go` never references it (R1) |
| 3 | Non-blocking hook handler, ≤2 s timeouts | pass — ingest path untouched by this plan |
| 4 | tmux always on a dedicated socket; no `resize-pane` | pass — every invocation uses `-S <private path>`; D7 clean tree-wide; `pty.Setsize` → `resize-window` order intact in `termbridge.go:81–85` |
| 5 | No payload/prompt-text logging | pass — see Minor 4 for the one latent, unreproducible channel |
| 6 | No empty-gauge dishonesty | pass — usage and context both render the word `unknown`; the `no_snapshot` path renders `no snapshot captured` over the empty area, not a blank box |
| 7 | Session identity on the tmux target | pass — `sessionTmuxName(id)` = `muster-<id>`; reconcile matches by name, never by `session_id` |
| 8 | No `~/.claude/settings.json` / `CLAUDE_CONFIG_DIR` trespass | pass — zero hits; Resume reuses the project-scoped `writeSettings` |
| 9 | No real `claude` outside canary/probes | pass — every test uses a shell stub (`onexit_test.go:112`, `sessions_test.go:190`, `helpers/daemon.ts:132`) |

## Manual Verification

Drove a scratch `musterd` (own port, own data dir, own `-S` tmux socket, stub `claude`,
`-on-exit=leave`) in a real browser via Playwright, with two sessions (`alpha`, `beta`)
bound to `claude-1` / `claude-2`. Everything below was observed, not inferred. Scratch
daemon, tmux server and data dir were all torn down afterwards (`pgrep musterd` → none).

Confirmed working:

- **Mainhead + card action rows** render per REQ-10/REQ-11: live card shows only `End`;
  ended card shows only `Resume` + `Remove`; mainhead shows all three with `Resume`
  disabled while alive.
- **End** (mainhead → dialog → confirm): dialog copy matches REQ-14; `muster-1` was
  killed, `muster-2` untouched (**INV-2 verified by hand** on the tmux socket, not just
  in the UI); the card restyled to ended and sorted below the live one; the focused
  terminal was replaced by the dead surface.
- **Dead surface**: `.endbar`, `pre.snapshot` containing the stub's real
  `MUSTER-STUB-READY` output (so End's pre-kill capture genuinely ran), and an `.endcap`
  with `session ended` + `Resume`.
- **Resume** from the cap: `#{pane_start_command}` on the new pane read
  `"…/stub-claude.sh" --model claude-haiku-4-5-20251001 --resume claude-1` — the flag and
  the id are correct and reach tmux. Row went `alive:true`, `endedAt:null`, `state`
  unchanged (`started`), exactly as the contract says.
- **REQ-8 end-to-end**: posting the enveloped `SessionStart(source:"resume")` moved the
  card to `state: idle` with `attention` and `failure` both null.
- **Escape** closes the End dialog with no request sent.
- **Tiles**: the dead tile kept its grid slot, marker flipped to `stopped`, the dead
  surface mounted inside it, and the footer showed `✕ ended 1m ago` + `Resume` + `Remove`
  with the geometry readout cleared. The live tile still read `79×14 · live`.
- **REQ-3 `-on-exit=leave`**: SIGTERM → process exited, `muster-2` still on the socket,
  log line `leaving live sessions running count=1 tmux_socket=…` present.
- **Daemon-down banner** appears prominently and the rail cards and tile footers do
  correctly disable.

Found by hand (details under Issues): Major 1 (measured the `alive:true` + `endedAt`
window), Major 2 (buttons stay live after disconnect), Major 3 (Enter on a card's End
button does nothing), Major 4 ("ended now ago").

**Not verified — R2.** The plan asks the reviewer to run a real
`claude --model claude-haiku-4-5-20251001`, End it from the dashboard, Resume it, confirm
the enveloped `SessionStart` carries the same `session_id`, and record the outcome in
`spikes/canary-fields.md`. I did not do this: it spends Damian's real subscription and he
has not asked for it in this session, and I should not write to `spikes/canary-fields.md`
on my own initiative. Everything R2 covers that *can* be checked without the real binary
(the argv, the same-id resume path, the `idle` landing) I verified above with the stub.
**R2 remains outstanding and must be done before this plan completes.**

## Issues

### Critical

None. No hard-rule violation, no failing test, no failing acceptance check, no build
failure.

### Major

1. **[daemon-impl]** **`alive` is set from a hook payload, breaking INV-1.** —
   `internal/session/machine.go:127` — `applyBind`'s `KindResumeBind` branch does
   `sess.Alive = true`. REQ-8 lists exactly what a resume bind may touch (re-bind the id,
   clear `attention`/`failure`, keep `compactions`/`lastActivity`/`context`, set
   `state := idle`) and `alive` is not on that list; INV-1 makes tmux pane existence the
   sole authority for `alive`. This is the one place in the tree where liveness comes
   from anywhere but tmux.

   Measured, not theorised. Against a live scratch daemon: End session 1 (tmux session
   really gone), then post a queued/late `SessionStart(source:"resume")`. `GET /api/state`
   250 ms later returned

   ```
   t=1 {'alive': True, 'state': 'idle', 'endedAt': '2026-08-26T20:10:35Z'}
   t=2 {'alive': False, ...}
   ```

   with **no `muster-1` on the tmux socket at all**. The daemon broadcast a Session that
   is internally incoherent (`alive:true` *and* `endedAt` set — `applyBind` never clears
   `endedAt`), and during that window the client's `aliveOnly` passes the id through, so
   the dashboard opens `/ws/terminal/1` for a dead session (INV-5) and shows an empty
   terminal where REQ-13's dead surface belongs — the plan's States section forbids
   exactly that ("never an empty terminal pretending to be live"). The daemon log from my
   session shows the symptom: `terminal resize failed … can't find session: muster-1`,
   twice. The window is bounded by the ~5 s liveness poll, which is why this is Major and
   not Critical — but ingest is asynchronous by design (CLAUDE.md), so the race is
   ordinary, not exotic.

   Fix: delete the `sess.Alive = true` line. `RecordResume` already sets `alive` on the
   real resume path, from the tmux spawn that actually happened.

2. **[daemon-tests]** **The D11 test enshrines the Major-1 behaviour.** —
   `internal/session/machine_test.go:309` —
   `assert.True(t, sess.Alive, "REQ-8: applyBind's resume-bind branch marks the session
   alive")`. The criterion (D11) asks only for `idle` + `attention == nil` +
   `failure == nil`; this extra assertion locks in a behaviour REQ-8 never authorised, so
   fixing Major 1 will fail the suite. Drop the assertion when Major 1 is fixed.

3. **[web-impl]** **Action buttons stay enabled after the daemon goes down, and a
   destructive dialog can still be opened.** — `web/src/main.ts:670-672` —
   `onDisconnected` calls `setStatus(...)` but never `render()`, so every already-drawn
   surface keeps its stale `connected: true` button state. Measured with the daemon
   killed and the banner up (`status: "reconnecting…"`), Focus view on an ended session:

   ```
   mainhead:  End disabled=true   Resume disabled=false   Remove disabled=false
   dead cap:  Resume disabled=false
   ```

   and clicking mainhead `Remove` **opened the Remove confirm dialog** (`removeDialogOpen:
   true`, no fetch issued). This persisted indefinitely — there is no tick that repairs
   it. The plan's States section requires the opposite on both counts: "action buttons are
   disabled while the WS is down" and "Dialogs, if open, close". `setStatus` already
   honours the second clause via `confirmDialogs.closeAll()`; it just never re-renders so
   a *new* one can still be opened.

   Note the rail cards and tile footers *were* correctly disabled — they get re-rendered
   incidentally when the live session's terminal socket drops. A focused **dead** session
   has no terminal socket, so nothing re-renders it. Fix: call `render()` from
   `onDisconnected` (and on reconnect).

4. **[e2e-specs]** **E14 cannot catch Major 3 — it only tests the live-focused case.** —
   `web/e2e/actions.spec.ts:538-568` — the test focuses a *live* session (`down-e14`),
   where the incidental re-render described above masks the defect and where `Resume` is
   disabled by `alive` anyway. The mainhead `Resume` and the dead-surface cap `Resume`
   only ever become enabled for a **dead** focused session, which E14 never puts on
   screen. Add a dead-focused case: end a session, focus it, kill the daemon, then assert
   mainhead `Resume`/`Remove` and the `.endcap` `Resume` are all disabled.

5. **[web-impl]** **Card and strip action buttons are keyboard-dead.** —
   `web/src/render/sessions.ts:131-137` — the card's `keydown` listener fires
   `event.preventDefault()` with no `event.target === card` guard, and this plan nests
   real `<button>`s inside that card (`sessions.ts:113-121`). `preventDefault()` on the
   bubbled key event cancels the button's own activation. Verified live: focused beta's
   card `End` button (`document.activeElement` = `BUTTON:End`), pressed Enter →
   `endDialogOpen: false`, and focus was dropped to `BODY`. The same button activates
   correctly on click (`endDialogOpen: true`, focus unchanged — REQ-11's `stopPropagation`
   works for the mouse). Every card and strip-card action button is affected in both
   views. Fix: `stopPropagation` on the button's `keydown` too, or guard the card listener
   with `if (event.target !== card) return;`.

6. **[web-impl]** **"ended now ago" — ungrammatical copy on the primary new surface.** —
   `web/src/render/mainhead.ts:27`, `web/src/render/dead.ts:63-69`,
   `web/src/render/tiles.ts:151` — `formatEndedAge` returns the literal string `"now"` for
   its sub-minute bucket (`format.test.ts:104` asserts this deliberately), and three call
   sites append `" ago"`. Observed verbatim in the browser immediately after an End:

   - mainhead meta: `alpha / main · sonnet · ended now ago`
   - `.endbar`: `ended now ago · last state started · last captured screen, not a live client`
   - `.endcap`: `now ago · last state: started`

   This is the *most common* case — you end a session and look straight at it. The rail
   card gets it right (`ended now`, no "ago") because `card.ts:130` doesn't append. The
   mockups only ever show the `6m` bucket, where `+ " ago"` reads fine, so transcription
   didn't surface it. Fix in the callers (or have `formatEndedAge` return an already-
   suffixed phrase). The E2E specs can't see it — they assert `/^ended /` only.

7. **[web-impl]** **Two hard-coded colour literals in new component CSS.** —
   `web/src/style.css:504` `background: rgba(23, 26, 36, 0.95)` (that is `--panel`
   `#171a24` at 95%) and `web/src/style.css:1070` `color: #fff` (not in the palette at
   all; `--paper` is `#e8e6e1`). Design-system §1: never hard-code a hex in a component; a
   new colour goes in the `:root` token block first. The file already has the precedent —
   the same mockup's `rgba(8,9,13,.72)` was hoisted to `--scrim` at `style.css:48` with
   that rule cited in the comment. `.btn.key` three rules up does it right
   (`color: var(--ink)`).

8. **[web-impl]** **`.endcap .pill` is missing `font-variant-numeric: tabular-nums`.** —
   `web/src/style.css:502-512` — its body is rewritten every second by `dead.ts:69`
   (`${age} ago · last state: ${badge}`), so its digits change under the reader. No
   ancestor declares `font-variant-numeric` in either mount context (Focus or tile), so
   nothing inherits in. Every other new time-varying readout in this plan got it
   (`.card .timer` :827, `.mainhead .meta` :336, `.endbar` :461, `.tfoot` :712,
   `.thead .tm` :687) — this is the one miss. Design-system §2 calls this non-negotiable,
   and the cap sits centred over a static screen where the width shift is most visible.

9. **[orchestrator]** **R4 doc upkeep is incomplete; R2 was not performed.** —
   `docs/protocol.md` is merged (92 insertions, verified against the plan's Protocol
   Contract). `TODO.md`, `SPEC.md` and `spikes/canary-fields.md` are untouched: the four
   M4 TODO ticks, the SPEC §11 changelog entry (shutdown policy, startup sweep, snapshot
   in, placement C, resume → idle) and R2's canary-fields recording are all still owed.
   R2 itself (the real-haiku resume check) has not been run — see Manual Verification for
   why I did not run it. Non-blocking for the verdict; the Doc-Upkeep Backstop and
   Completion steps own it.

10. **[orchestrator]** **`--rose` for destructive actions needs a design-system
    amendment.** — `web/src/style.css:1069-1079`, `web/index.html:144,153` — design-system
    §3 is explicit that a state colour may only mean that state and that "rose is never
    'delete'"; §6.7 reinforces it by giving the daemon-down banner its own `--banner-*`
    family precisely to avoid borrowing `--rose`. This plan authorised the reuse
    (`plan.md:234`) and the code documents the override honestly at `style.css:1046-1049`,
    so the implementation is not at fault — but the design system is now contradicted by a
    shipped surface, and a `failed` card (rose stripe, `style.css:753`) can sit on screen
    beside a rose Remove hover and a rose-filled confirm button, same colour, two meanings.
    Either amend §3 to record the exception or add a `--danger` family. No pipeline agent
    may edit `docs/design/design-system.md`, hence the routing. Damian's call.

### Minor

1. **[daemon-impl]** `End` can return `200` with `alive:true`. —
   `internal/session/manager.go:328-331` — after the kill, `End` delegates to
   `checkOneLiveness`, which returns silently if `PaneExists` *errors*; the session is then
   never marked ended and `End` returns a Session with `alive:true`, contradicting §3.7
   ("Response 200: … `alive:false`, `endedAt` set"). Self-heals on the next poll. Consider
   falling back to `markEnded` when the post-kill liveness check errors.
2. **[daemon-impl]** A genuinely blank pane is indistinguishable from "never captured". —
   `internal/session/manager.go:457` — `Snapshot` returns `ok=false` when
   `LastSnapshot == ""`, so an empty screen serves `404 no_snapshot` and the UI says "no
   snapshot captured" for a capture that did succeed. `LastSnapshotAt.IsZero()` is the
   honest sentinel. (`api.test.ts` already tests the client side for "empty text is not
   missing" — the daemon can never produce that case.)
3. **[daemon-impl]** `EndAllSessions` runs on `context.Background()` with no deadline
   (`cmd/musterd/main.go:200`), outside `shutdownTimeout`'s budget — a wedged tmux hangs
   shutdown indefinitely. Give it its own bounded context.
4. **[daemon-impl]** Latent (unreproduced) snapshot-text log channel. —
   `internal/tmux/tmux.go:261-268` — `run` embeds `CombinedOutput()` in the returned
   error, and for `capture-pane -p` stdout *is* the pane text; `manager.go:472` and `:521`
   log that error with `Err(err)`. I probed for it (unknown target, bad `-S` range) and
   could not get tmux to emit pane text on a non-zero exit — failures write only to
   stderr — so R3 holds today. Cheap to make airtight: have `CapturePane` not wrap the
   output into its error.
5. **[daemon-tests]** D18 checks `capturedAt` with `assert.NotEmpty`
   (`internal/server/sessions_test.go:416`) rather than against the seeded value or an
   RFC3339 shape — a wrong-but-non-empty timestamp passes.
6. **[daemon-tests]** D14's whole-struct compare (`manager_test.go:1028-1032`) shares
   pointer fields between the two clones (`Attention`, `Failure`, `Model`, `Context`), so
   an *in-place* mutation of a pointed-to struct would be invisible; only pointer
   replacement is caught. Low risk given `captureSnapshot`'s body, but not airtight.
7. **[web-impl]** `render/dead.ts:63` falls back to `"just now"` when `endedAt` is null,
   rendering "ended just now ago" — a confident claim about a time it does not know.
   `card.ts:130` and `tiles.ts:151` handle the same branch honestly. Prefer no clause.
8. **[web-impl]** The snapshot's own `capturedAt` is fetched, typed and stored
   (`api.ts`, `dead.ts:26,89`) and then never read. That is REQ-19 (nice-to-have), but
   design-system §6.8 (stale state carries its age) is a rule, and the capture can be ~5 s
   older than the ended age already shown. The data is already in hand.
9. **[web-impl]** While the pane fetch is in flight, `dead.ts:73-76` renders both the
   snapshot and the cap body as empty strings — indistinguishable from a session that
   ended on a blank screen. A `loading last screen…` would remove the ambiguity.
10. **[web-impl]** Unrelated whitespace regression. — `web/src/main.ts:403` — the
    sizenote placeholder changed from `" "` (NBSP) to `" "` (verified by hexdumping
    the diff). `.sizenote` is `display: flex`, and a flex item containing only collapsible
    whitespace is not rendered, so the ASCII space reserves zero height and silently
    defeats the layout-shift trick the comment two lines above describes. Almost certainly
    a formatter artifact; restore it as an explicit `" "` escape.
11. **[web-impl]** A11y polish on the new markup: neither dialog uses `aria-describedby`
    for its consequence copy, so the destructive text isn't announced with the dialog;
    `<b>session ended</b>` has no `role="status"`/`aria-live`, so nothing is announced when
    a focused session flips to dead; `.mainhead .name` is a `<span>`, giving no heading to
    navigate to above the terminal.
12. **[web-impl]** `render/sessions.ts:117` sets `actsRow.hidden = false` unconditionally,
    so `End` is permanently visible on every live rail card. The mockup annotates it
    hover-only (`opt-c-both.html:277`: "row appears on hover or on the focused card").
    REQ-11 and the Testable UI table need it present for E2E, so this is not a violation —
    but it puts a destructive action one click from every card and changes rail density
    from the reference render. Worth a conscious decision.
13. **[orchestrator]** Plan defect: the Testable UI Elements table says mainhead Remove is
    "never disabled" while the States section and E14 require every action button disabled
    while the WS is down. The implementation resolved it correctly; amend the table row so
    the plan stops contradicting itself.
14. **[e2e-specs]** `test-specs.md`'s header reads `Mode: validate (attempt 1)` /
    `Live run: 87/87`, but the `## Repairs` section near the top still says "Not
    applicable — authoring mode" and `## Test Run Output` still says "Not executed
    (authoring mode)". The real repairs table lives further down under "Validate Attempt
    1". Reconcile the stale header sections so the document doesn't contradict itself.

**Repairs audit** (per the `## Validate Attempt 1` table): all 7 repairs were the same
defect — a bare `request.*` fixture instead of `page.request.*`, i.e. a missing UI cookie
— and every one changed only the request call, never an assertion. Verified no
`test.skip`/`test.fixme` anywhere in `web/e2e` or `web/src`, no assertion replaced by a
container-level `toBeVisible()`, and no fixture drift: `sessionStartResume` is a thin
wrapper over the existing `envelopedSessionStart` forcing `source: "resume"`, which
`spikes/canary-fields.md` documents as a measured value. The one pre-existing spec this
plan rewrote — `web/e2e/terminal.spec.ts:265` — was **strengthened**, not weakened: it
keeps both original zero-attempt socket checks and adds `toHaveCount(0)` on the terminal
region plus endbar/endcap/snapshot content, with a deterministic pane-endpoint poll
replacing a race against the 5 s liveness tick.
