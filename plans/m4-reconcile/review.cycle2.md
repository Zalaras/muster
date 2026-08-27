# Review: M4 — Reconcile, shutdown policy, end / remove / resume

**Plan**: m4-reconcile
**Cycle**: 2 (cycle 1's review preserved at `plans/m4-reconcile/review.cycle1.md`)
**Verdict**: needs-changes

Cycle 1's ten Majors and the Minors the agents took are, with one exception, genuinely
fixed — and I re-measured the two that had live repros (Major 1's late-resume revival and
Major 3's stale enabled buttons) against a running daemon rather than trusting the diff.
Every test suite is green, every authored acceptance check passes, and the hard-rule
checklist is clean.

The exception is cycle 1's Major 5. Its *stated* cause (the card `keydown` listener's
unguarded `preventDefault`) was correctly fixed, but its *symptom* — "card and strip
action buttons are keyboard-dead" — is still true in the running app, for a second cause
that the fix cycle discovered and worked around in the E2E spec instead of routing back as
a defect. Details and measurements in Major 1 below. That is the one issue holding the
verdict.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 reconcile before serving | Yes | Yes (D9, E2/E4) | pass — verified live: `reconciled sessions kept_alive=1 marked_ended=0 swept=1` logs before `musterd starting` |
| REQ-2 unknown panes reported, never adopted | Yes | Yes (D10) | pass — verified live with a hand-made `muster-999` on the socket: `WRN unknown muster tmux session on socket; not adopted`, no row created |
| REQ-3 shutdown policy (`-on-exit`) | Yes | Yes (D19/D20/D21, E3/E4) | pass — verified live: SIGTERM under `-on-exit=leave` left `muster-2` running |
| REQ-4 pane snapshots | Yes | Yes (D14, D18) | pass |
| REQ-5 End | Yes | Yes (D15, D17, E5) | pass — verified live end-to-end from the mainhead |
| REQ-6 Remove | Yes | Yes (D16, E9/E12) | pass — verified live; `event` rows kept their `session_id` after the row was deleted (audit trail intact: `1\|1`, `3\|2` in `event`) |
| REQ-7 Resume | Yes | Yes (D13, E7) | pass — verified live: `#{pane_start_command}` = `…/stub-claude.sh --model claude-sonnet-4-5 --resume claude-abc-2` |
| REQ-8 resume lands in `idle` | Yes | Yes (D11, D12, E8) | pass — verified live: posting the resume envelope moved the card to `idle` with `attention`/`failure` null |
| REQ-9 ended sort + styling | Yes | Yes (W4, W5) | pass — verified live: the ended card fell below the live one, struck-through name, timer `ended now` |
| REQ-10 focus mainhead | Yes | Yes (E5, E14) | pass |
| REQ-11 card action row | Yes | Yes (E5, E9) | **pass with Major 1** — the buttons exist and work by mouse; keyboard operation is unreliable |
| REQ-12 tiles | Yes | Yes (E11, E12) | **pass with Major 1** — same keyboard issue on the tile footer; everything else verified live |
| REQ-13 dead surface | Yes | Yes (E6, E13) | pass — verified live in both Focus and a tile |
| REQ-14 confirm dialogs | Yes | Yes (E10) | pass — verified live incl. Escape cancelling with no request |
| REQ-15 `sessionRemoved` client handling | Yes | Yes (W6, E12) | pass — verified live: tile and card vanished without a reload |
| REQ-16 D5 regression guard | Yes | Yes (D8) | pass |
| REQ-17 reconcile summary line | Yes | Yes (D9) | pass — observed verbatim |
| REQ-18 ⌘1–9 on an ended session | Yes | Yes (existing views specs) | pass |
| REQ-19 snapshot `capturedAt` age (nice-to-have) | No | n/a | not done — see Minor 1 |

## Build & Tests

E2E tests: **pass** (92/92, 25.7s — full suite, all 11 spec files)
Daemon tests: **pass** (`go test -count=1 ./...`, all packages)
Web tests: **pass** (387/387, 16 files)
Daemon build: **pass**
Web build: **pass** (`tsc --noEmit && vite build`)
Lint: **pass** (`golangci-lint run` — 0 issues)

No regression in any spec this plan did not author. `terminal.spec.ts:265` (the one
pre-existing spec this plan rewrote) is green and, per the cycle-1 audit, strengthened.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass |
| D2 | `go build ./...` | pass |
| D3 | `make lint` | pass |
| D4 | `! rg -n "hook_event_name" cmd/ internal/ --glob '!internal/claudecode/**'` | pass |
| D5 | `! rg -n '"rate_limits"\|…' cmd/ internal/ --glob '!internal/claudecode/**'` | pass |
| D6 | `! rg -n '"--resume"' cmd/ internal/ web/ --glob '!internal/claudecode/**' --glob '!web/e2e/**'` | pass |
| D7 | `! rg -n "resize-pane" cmd/ internal/ web/ test/` | pass |
| D8 | `rg -q "func TestMergeSettings_ForeignCommandHookOnSessionStartSurvives" …` | pass |
| D22 | `ls internal/store/migrations/0004_reconcile.sql` | pass |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass |
| E1 | `make e2e` | pass |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D9 | Reconcile deletes/marks/leaves-identical | pass | `manager_test.go:817` asserts the full `ReconcileReport`, mem+store for both mutated rows, and `assert.Equal(livePaneBefore, livePaneAfter)` on the untouched row |
| D10 | Reconcile reports unknown `muster-*` without inserting | pass (see Minor 6) | `manager_test.go:890` asserts `report.UnknownSessions` and `Len(rows, 1)`; the log half is not asserted, but I observed the log line live |
| D11 | `KindResumeBind` → `idle`, attention/failure nil, six states | pass | `machine_test.go:290`, table over all six, both pointers seeded non-nil first |
| D12 | different claude id → clear-rebind → `started` | pass | `machine_test.go:325`, also asserts `Compactions == 0`, `LastActivity == nil` |
| D13 | `BuildArgv` emits `--resume`, omits `--name` | pass | `launch_test.go:56-66`, title deliberately set and absent from `want` |
| D14 | capture never mutates state fields | pass | `manager_test.go:1019`, six states, plus a value-copy deref compare so an in-place pointee mutation cannot hide behind `Clone()`'s shallow copy |
| D15 | End flips only the target's `alive` | pass | `manager_test.go:1233`, bystander checked in memory *and* store |
| D16 | Remove kills before deleting; failing kill keeps the row | pass | `manager_test.go:1373`, both subtests |
| D17 | 409/404 matrix on end/resume/delete | pass | `sessions_test.go:299,324,341,367` — decodes the error `code`, not just the status |
| D18 | pane 404 then 200 with text/capturedAt | pass | `sessions_test.go:396`, `CapturedAt` compared to the seeded value |
| D19 | `-on-exit=leave` leaves tmux running | pass | `onexit_test.go:251`, real built binary, private socket path |
| D20 | `-on-exit=kill` kills tmux and sets `alive=0` | pass | `onexit_test.go:265`, reopens the sqlite store |
| D21 | `-on-exit=ask` non-TTY behaves as leave | pass | `onexit_test.go:289`, `os.Pipe()` read end as stdin |
| W3 | no `any` in new web code | pass | swept all 14 changed `web/src` files; 9 `any` hits, all inside prose comments; zero `: any` / `as any` / `<any>` |
| W4 | ended-last, most-recently-ended-first sort | pass | `sort.test.ts:162-220` incl. interleaved, tiebreak, null-`endedAt`, non-mutation |
| W5 | card VM actions + `ended <age>` timer | pass | `card.test.ts:274-313`; `stateSince` deliberately 2h older proves the timer reads `endedAt` |
| W6 | `sessionRemoved` parse + reject malformed | pass | `protocol.test.ts:483-504`, incl. `id: 0` accepted |
| W7 | removed id dropped from the live set in place | pass | `live.test.ts:172-198` |
| W8 | never opens `/ws/terminal/{id}` for a dead session | pass | `terminal.spec.ts:265` asserts `tracker.totalOpened === 0` (gross count, post-reload); `actions.spec.ts:233` re-asserts no reopen after End. Also confirmed live: zero terminal regions on a dead focused session and on a dead tile |
| E2–E15 | present in the specs and green | pass (E12 partial — see Minor 7) | every E-ID has a covering test; all 92 green |
| R1 | `internal/session` stores capture text, never inspects it | pass | `captureSnapshot`/`storeSnapshot` (`manager.go:467-501`) only compare for equality-to-persist and assign; no state field is derived from the text. `checkOneLiveness` decides liveness solely from `PaneExists`, and a capture error is explicitly not a death signal |
| R2 | real-haiku resume check | **not performed** | see Manual Verification |
| R3 | snapshot text in no log line | pass | the only three snapshot log sites (`manager.go:476,499,525`) carry `err` + `session_id` only. The error itself can no longer carry pane text: `CapturePane` now goes through `runCapture` (`tmux.go:277`), which keeps stdout and stderr in separate buffers and discards stdout on a non-zero exit |
| R4 | doc upkeep | **incomplete** | `docs/protocol.md` is merged and matches the Protocol Contract (§3.4/§3.5/§3.7/§3.8/§5.5/§7.5/§8/§9 all present). `TODO.md`, `SPEC.md`, `spikes/canary-fields.md`, `docs/design/design-system.md` are all untouched — carried Major 3 below |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary — no Claude-Code format knowledge outside `internal/claudecode/` | pass (D4/D5/D6 all green; `KindResumeBind` and the `source:"resume"` mapping live in `internal/claudecode/interpret.go`; `--resume` only in `launch.go`) |
| 2 | No terminal-output state parsing | pass — `capture-pane` appears only in `internal/tmux.CapturePane` and `internal/session`'s store-only snapshot path; nothing reads it back into state (R1) |
| 3 | Non-blocking hook handler; timeouts ≤ 2 s | pass — `hookTimeoutSeconds = 2` (`internal/claudecode/settings.go:17`); ingest unchanged by this plan |
| 4 | tmux always on a dedicated socket; no `resize-pane` | pass — every invocation goes through `Client.socketFlag()` (`tmux.go:264,279`); the E2E harness uses `-S <per-run path>`; D7 green |
| 5 | No payload logging | pass (R3) |
| 6 | No empty-gauge dishonesty | pass — the dead surface renders `no snapshot captured` (confirmed negative) and `loading last screen…` (unknown), never a blank pane pretending to be content; masthead gauges still read `unknown`. Verified live in Focus and in a tile |
| 7 | Session identity keys on the tmux target | pass — `sessionTmuxName(id)` derives `muster-<id>`; `RecordResume` rewrites `TmuxTarget`; nothing keys on `session_id` |
| 8 | No settings trespass | pass — only project-scoped `<dir>/.claude/settings.local.json` (`sessions.go:244`); no `CLAUDE_CONFIG_DIR`, no `~/.claude` |
| 9 | No real `claude` outside canary/probes | pass — every test drives the harness stub via `-claude-bin`; no test invokes the real binary |

### Design-system compliance

| Check | Result |
|---|---|
| Tokens — no hard-coded hex/rgba in components | pass — `Major 7`'s two literals are hoisted to `--panel-95` / `--rose-fg`; a full sweep of `style.css` for `#hex`/`rgba(` now matches only inside the `:root` block and its comments |
| No web fonts | pass — no `@import`, no CDN link, no vendored binary; system stacks only |
| State colour is meaning | pass with the known exception — the only state-colour token used by new CSS is `--rose`, and only for destructive actions (the design-system contradiction cycle 1 raised as an `[orchestrator]` item, still open — Major 4 below). No new `--amber`/`--violet`/`--teal` use; at most one filled amber primary action per surface is unchanged |
| Colour never the sole carrier | pass — an ended card carries the word `ended` in the timer, a struck-through name (`.card.ended .name`), and the bottom sort position, not just the dimming |
| Tabular numerics on time-varying values | pass — `.endcap .pill` gained it (Major 8); all 14 time-varying readouts now declare it |
| `[hidden]` companions | pass — every `.hidden =` site in `web/src` maps to a covered element; this plan's three new toggled elements (`.mainhead`, `.dead-surface`, `.acts-row`) all have `[hidden] { display: none; }` rules at `style.css:331`, `:460`, `:367` |
| Honesty rules (§6) | pass — no 0%/empty track for unknown data, no "Done" state, no cost display, daemon-down banner prominent, `permission_mode` still last-known, `StopFailure.error` still shown raw |
| Terminal rules (§7) | pass — a dead session opens no client anywhere (measured: zero terminal regions on the focused dead session and on the dead tile, and `tracker.totalOpened === 0` in E2E); geometry still moves on focus; no `resize-pane`; scrollback and pane styling untouched |

## Manual Verification

Driven in a real browser (Playwright) against a scratch `musterd` I started myself:
private data dir, private tmux socket path, the E2E harness's stub `claude`, two real
launched sessions in two scratch git repos, `-on-exit=leave`. No real `claude` was
launched. Everything below is observed, not inferred:

1. **Baseline (Focus)** — mainhead renders as an `<h2>` heading with `End` enabled,
   `Resume` disabled (no `claudeSessionId` yet), `Remove` enabled. Both rail cards carry
   an `End` button. Terminal streams `MUSTER-STUB-READY`.
2. **End via the mainhead** — confirm dialog reads *"End session?"* with
   `aria-labelledby="end-dialog-title"` and `aria-describedby="end-dialog-body"`;
   confirming produced, in one pass: the card restyled to ended and **sorted below** the
   live one, mainhead meta `proj-alpha / main · claude-sonnet-4-5 · ended now`, End
   disabled / Resume enabled, `.endbar` = `ended now · last state started · last captured
   screen, not a live client`, `pre.snapshot` = `MUSTER-STUB-READY`, `.endcap` =
   `session ended` (with `role="status"`) + `now · last state: started` + a Resume button.
   **Cycle-1 Major 6 is fixed on all three surfaces — "now ago" appears nowhere.**
3. **INV-2 bystander** — after the End, `tmux list-sessions` showed only `muster-2`, and
   `muster-2`'s pane geometry and attached-client count were unchanged.
4. **INV-5** — zero terminal regions in the DOM for the dead focused session; the
   terminal slot was `hidden`.
5. **Cycle-1 Major 3, re-measured** — SIGTERM'd the daemon with the *dead* session
   focused (the exact case cycle 1 measured as broken). Banner up, status
   `reconnecting…`, and every action button disabled: mainhead End/Resume/Remove, the
   `.endcap` Resume, and both cards' buttons. **Fixed.** On reconnect all re-enabled.
6. **REQ-3 `-on-exit=leave`** — after that SIGTERM, `muster-2` was still on the socket.
7. **REQ-1/REQ-2 reconcile** — planted a `muster-999` session on the socket, restarted.
   Log: `WRN unknown muster tmux session on socket; not adopted tmux_session=muster-999`
   then `INF reconciled sessions kept_alive=1 marked_ended=0 swept=1`, both **before**
   `INF musterd starting`. `GET /api/state` returned only session 2; the swept card was
   gone from the UI and focus moved to the remaining session.
8. **REQ-7 Resume** — clicked Resume in the dead cap:
   `#{pane_start_command}` of the new `muster-2` pane =
   `"…/stub-claude.sh" --model claude-sonnet-4-5 --resume claude-abc-2`. Card live again,
   terminal surface mounted and streaming.
9. **REQ-8** — posted the enveloped `SessionStart(source:"resume")` with the same claude
   id: state `idle`, `attention`/`failure` null, `endedAt` null.
10. **Cycle-1 Major 1, re-measured** — ended session 2 for real (tmux session gone), then
    posted a late `SessionStart(source:"resume")` for the same claude id with no
    `/resume` call. At t+1s and t+2s the session was still
    `alive:false, state:idle, endedAt:2026-08-26T21:04:24Z`. **Fixed** — no revival, and
    no incoherent `alive:true` + `endedAt` object.
11. **REQ-12 dead tile** — marker `stopped`, footer `stopped ✕ ended now` + Resume +
    Remove, dead surface with the snapshot inside the tile body, zero terminal regions,
    slot retained.
12. **REQ-14 Escape** — Escape closed the Remove dialog with the tile still present and
    no request sent.
13. **REQ-6 Remove** — dialog copy *"Deletes it from Muster for good — the card
    disappears and it can no longer be resumed from here."*; confirming emptied the grid
    and the rail without a reload. `session` table empty; `event` table still holds
    `1` row for session 1 and `3` for session 2 — the audit trail REQ-6 requires.
14. **Console** — no application errors at any point. The only console output was
    `ERR_CONNECTION_REFUSED` WebSocket retries while I had the daemon deliberately down,
    and a `favicon.ico` 404.

**R2 was not performed.** It requires launching a real `claude --model
claude-haiku-4-5-20251001` against Damian's live subscription, and my instructions for
this cycle say not to run one without explicit instruction. The reasoning R2 exists for
still stands and I am not waving it away: the same-id claim behind REQ-8 was measured
**headless** (`-p`) on 2.1.233, this plan resumes **interactively**, and the installed
binary here is **2.1.246** (the daemon logged the drift warning). If interactive resume
minted a *different* `session_id`, REQ-8's second clause would fire and the session would
land in `started` with compactions/lastActivity/context cleared instead of `idle` — a
degradation, not a break, which is why this is not a blocker. It remains owed, along with
recording the outcome in `spikes/canary-fields.md`.

## Issues

### Critical

None.

### Major

1. **[web-impl]** **Cycle-1 Major 5's symptom is not fixed: card, strip-card and tile-footer
   action buttons are still keyboard-unusable.** —
   `web/src/render/sessions.ts:168-171`, `web/src/render/tiles.ts:125-127`,
   `web/src/render/tiles.ts:143` — the `keydown` guard added last cycle
   (`sessions.ts:132`) is correct and necessary, but it was not the only cause. The 1 s
   render tick calls `renderSessions` → `el.replaceChildren(...)`, `renderStrip` →
   `el.replaceChildren(...)` and `renderTileFooterActions` → `actsEl.replaceChildren(...)`
   **unconditionally**, so every action button node in the rail, the strip and every tile
   footer is destroyed and rebuilt once a second whether or not anything changed. Focus is
   not restored, and it does not fall to a sibling — it falls to `<body>`.

   Measured in the running app, both surfaces, with no state change in between:

   ```
   rail card End:     focusedInitially=true  sameNodeAfter1.4s=false  activeTag=BODY
   tile footer End:   focusedInitially=true  sameNodeAfter1.4s=false  activeTag=BODY
   mainhead End:      focusedInitially=true  sameNodeAfter1.4s=true   stillFocused=true
   ```

   I hit the consequence twice by accident before I understood it: focusing the rail
   card's `End` button and pressing Enter left `endDialogOpen: false` and focus on `BODY`
   — the identical observation cycle 1 recorded as Major 5, still reproducible after the
   fix. A keyboard user has a sub-second window to press the key, and once it lapses the
   next Tab restarts from the top of the document. That makes REQ-11's card row and
   REQ-12's tile footer — which include **Remove**, the destructive one — effectively
   mouse-only. Only the mainhead (REQ-10) and the dead-surface cap, which are updated in
   place rather than rebuilt, are reliably operable.

   Note for the record: the `replaceChildren`-per-tick pattern predates this plan, but it
   was harmless while cards held no focusable descendants; this plan is what puts real
   `<button>`s inside the rebuilt containers. The fix cycle's own E2E log documents
   discovering exactly this (`test-specs.md`, repair #3: "raced `renderSessions`'s 1s
   full-card-DOM-rebuild … with no automatic re-focus") and routed around it with
   `locator.press()` rather than reporting it — the test's own point (does the guard
   swallow the key) is still legitimately covered, so this is not a spec defect, but it is
   why the suite is green over a live defect.

   Fix: preserve focus across the rebuild — before `replaceChildren`, note the active
   element's `data-action` + `data-id` (or the card's session id), and after it, re-focus
   the matching new node. `sessions.ts`, `tiles.ts`'s `renderStrip`, and
   `renderTileFooterActions` all need it. A cheaper alternative is to skip the rebuild
   when the rendered view-model is unchanged, but the focus-restore is the smaller,
   more local change.

2. **[e2e-specs]** **No spec covers the keyboard path end-to-end after the render tick.** —
   `web/e2e/actions.spec.ts` — the keyboard test added this cycle uses `locator.press()`,
   which bundles focus and keypress into one fast action and therefore cannot observe
   Major 1. Once Major 1 is fixed, add a case that focuses a card's (and a tile footer's)
   action button, waits out at least one render tick (>1.1 s), and then presses Enter,
   asserting the dialog opens. Without it the regression re-lands silently — the current
   green suite is the proof of that.

3. **[orchestrator]** **R4 doc upkeep is still incomplete; R2 still owed.** —
   `docs/protocol.md` is merged and I verified it against the Protocol Contract clause by
   clause. `TODO.md`, `SPEC.md` and `spikes/canary-fields.md` remain untouched: the four
   M4 TODO ticks, the SPEC §11 changelog entry (shutdown policy, startup sweep, snapshot
   in, placement C, resume → idle) and R2's canary-fields recording are all still owed.
   Non-blocking; the Doc-Upkeep Backstop and Completion steps own it. Carried unchanged
   from cycle 1 Major 9.

4. **[orchestrator]** **`--rose` for destructive actions still contradicts design-system
   §3.** — `web/src/style.css:1069-1079`, `web/index.html:144,153` — unchanged from cycle
   1 Major 10, and correctly left alone by web-impl (the plan authorised the reuse at
   `plan.md:234` and the code documents the override honestly). §3 says a state colour may
   only mean that state and that "rose is never 'delete'"; a `failed` card's rose stripe
   can sit on screen beside a rose Remove hover and a rose-filled confirm button. Either
   amend §3 to record the exception or add a `--danger` family. No pipeline agent may edit
   `docs/design/design-system.md`. Damian's call.

### Minor

1. **[web-impl]** REQ-19 is still unimplemented and the data is already in hand. —
   `web/src/render/dead.ts:26,89` — `capturedAt` is fetched, typed into `PaneState` and
   then never rendered. Carried from cycle 1 Minor 8; still worth doing because
   design-system §6.8 (stale state carries its age) is a rule, not a nice-to-have, and the
   capture can be ~5 s older than the `ended <age>` already displayed. Low severity because
   the end bar does say "last captured screen, not a live client", so the surface is not
   dishonest — just less precise than it could be.

2. **[daemon-impl]** The blank-first-capture edge remains. —
   `internal/session/manager.go:489` — `storeSnapshot`'s diff check (`sess.LastSnapshot ==
   text`) short-circuits when the very first capture is genuinely blank, so
   `LastSnapshotAt` is never set and `GET …/pane` returns `404 no_snapshot` for a capture
   that did succeed. daemon-impl's Fix Attempt 1 names this and scopes it out, which is
   fair — it is a different bug from cycle-1 Minor 2 (the read-side sentinel, correctly
   fixed). It is not theoretical: it bit the e2e agent's own Major-6 test, which had to
   wait for `MUSTER-STUB-READY` to work around it. `LastSnapshotAt.IsZero()` on the write
   side too would close it.

3. **[web-impl]** `renderSessions` rebuilds the whole rail every second even when nothing
   changed. — `web/src/render/sessions.ts:168` — beyond Major 1, this also discards any
   in-progress text selection in a card and forces layout on every tick. Not a new pattern
   and not required by this plan, but Major 1's fix is the natural moment to reconsider it.

4. **[web-impl]** `.acts-row` is unconditionally visible on every live rail card. —
   `web/src/render/sessions.ts:117` — carried from cycle 1 Minor 12, deliberately not
   changed, and I agree with the reasoning (the Testable UI table needs it present). Still
   worth Damian's conscious sign-off: the mockup annotates the row hover-only
   (`opt-c-both.html:277`), and shipping it always-on puts a destructive action one click
   from every card and changes rail density from the reference render.

5. **[web-impl]** Dialogs still have no `aria-live` announcement of the consequence text
   beyond `aria-describedby` — which is the right primitive and was correctly added this
   cycle. Nothing further needed; noting only that the a11y items from cycle 1 Minor 11
   are all verifiably in place (`aria-describedby` on both dialogs, `role="status"` on both
   `session ended` caps, `.mainhead .name` promoted to `<h2>` — I confirmed the heading
   renders at level 2 in the accessibility tree).

6. **[daemon-tests]** D10 asserts the report but not the log line. —
   `internal/session/manager_test.go:890` — the criterion says "logs (and reports)". The
   log line exists (`manager.go:335`) and I observed it live, so this is a coverage gap,
   not a defect: a future refactor could drop the warn and D10 would stay green.

7. **[e2e-specs]** E12 infers `sessionRemoved` rather than observing it. —
   `web/e2e/actions.spec.ts:488` — the backfill assertions are solid, but the "broadcasts
   `sessionRemoved`" half is checked via `GET /api/state` on the daemon, not by observing
   the WS frame. The un-reloaded DOM update is decent circumstantial evidence and `W6`
   unit-covers the parse, so this is low risk.

8. **[daemon-tests]** `tmux.CapturePane`'s new regression guard cannot reproduce the
   failure mode it guards. — `internal/tmux/tmux_test.go` — the test's own log says so
   candidly, and I agree with shipping it as a mechanism guard rather than a reproduction;
   noting it only so nobody later reads it as proof a historical leak existed.
