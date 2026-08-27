# Review: M4 — Reconcile, shutdown policy, end / remove / resume

**Plan**: m4-reconcile
**Cycle**: 4 (cycle 1 at `review.cycle1.md`, cycle 2 at `review.cycle2.md`, cycle 3 at `review.cycle3.md`)
**Verdict**: approved

Cycle 3's Critical is genuinely fixed, and I did not take the diff's word for it. The
hover-reveal `opacity: 0` now lives on `.card .acts-row` instead of the bare class, so the
dead surface's cap keeps its default opacity — measured live at **opacity 1 on both**
surfaces the Critical named (Focus's `#dead-surface` and a dead tile's cloned
`.dead-surface`), on the button *and* its containing row, with screenshots showing the
Resume button actually painted inside the "SESSION ENDED" pill. I also proved the new
guard assertions have teeth by reverting the CSS fix and watching E6 and E11 fail on
exactly those lines.

The `--rose` Major is closed the way Damian decided it: `docs/design/design-system.md` §1
carries a `--danger` family, §3 now says destructive actions use it and never `--rose`,
and every rose hit left in `style.css` is a Failed-state use. Measured on the live Remove
confirm button: `rgb(201,79,79)` fill / `rgb(122,53,53)` border / white text — the tokens,
not the old rose.

Everything is green: 96/96 E2E (full suite, 11 spec files, rebuilt binary and bundle),
404/404 Vitest, all Go packages uncached, lint 0 issues, both builds, all 12 authored
acceptance checks.

Two findings, both Minor, both measured rather than inferred. The one worth Damian's eye
is Minor 2: the focus-on-reorder fix landed on the rail but not on the Tiles grid, and I
measured a focused tile-footer **End** button falling to `<body>` on a real priority
change — with a control run proving it is the reorder, not the tick. That is cycle-3's
Minor 1 in the other view, and cycle 3 ruled that class non-blocking, so I am holding to
that precedent rather than moving the goalposts in the cycle that would block on it.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 reconcile before serving | Yes | Yes (D9, E2/E4) | pass |
| REQ-2 unknown panes reported, never adopted | Yes | Yes (D10, incl. the warn line) | pass |
| REQ-3 shutdown policy (`-on-exit`) | Yes | Yes (D19/D20/D21, E3/E4) | pass |
| REQ-4 pane snapshots | Yes | Yes (D14, D18, blank-first-capture) | pass |
| REQ-5 End | Yes | Yes (D15, D17, E5) | pass — re-driven by hand this cycle |
| REQ-6 Remove | Yes | Yes (D16, E9/E12) | pass — dialog copy read live |
| REQ-7 Resume | Yes | Yes (D13, E7) | pass — `--resume <claudeSessionId>` read off the new pane |
| REQ-8 resume lands in `idle` | Yes | Yes (D11, D12, E8) | pass |
| REQ-9 ended sort + styling | Yes | Yes (W4, W5) | pass |
| REQ-10 focus mainhead | Yes | Yes (E5, E14) | pass |
| REQ-11 card action row | Yes | Yes (E5, E9, keyboard-after-tick, new re-sort case) | pass |
| REQ-12 tiles | Yes | Yes (E11, E12, tile-footer keyboard case) | pass — see Minor 2 for a focus wrinkle that does not break the requirement |
| REQ-13 dead surface | Yes | Yes (E6, E11 — both now with computed-opacity guards) | **pass** — cycle-3 Critical 1 fixed and re-measured on both surfaces |
| REQ-14 confirm dialogs | Yes | Yes (E10) | pass |
| REQ-15 `sessionRemoved` client handling | Yes | Yes (W6, E12) | pass |
| REQ-16 D5 regression guard | Yes | Yes (D8) | pass |
| REQ-17 reconcile summary line | Yes | Yes (D9) | pass |
| REQ-18 ⌘1–9 on an ended session | Yes | Yes (views specs) | pass |
| REQ-19 snapshot `capturedAt` age (nice-to-have) | Yes | Yes (8 new `dead.test.ts` cases) | pass — coverage gap from cycle 3 closed |

## Build & Tests

E2E tests: **pass** (96/96, 23.7 s — `make e2e`, full rebuild, 11 spec files)
Daemon tests: **pass** (`go test -count=1 ./...`, uncached, every package)
Web tests: **pass** (404/404, 16 files — was 387 in cycle 3; 17 net-new)
Daemon build: **pass**
Web build: **pass** (`tsc --noEmit && vite build`)
Lint: **pass** (`golangci-lint run` — 0 issues)

Recorded because it cost me an hour and should not cost anyone else one: `make web-build`
is `tsc --noEmit && vite build`, and **`tsc` type-checks `web/e2e/` too**. A throwaway
measurement spec with a type error therefore makes the build exit non-zero and leaves
`web/dist` **silently stale** — if you swallow the output, the next Playwright run drives
the *previous* bundle. I briefly measured `capRow opacity: 0` on a tree whose source was
correct, purely because of this. Anyone writing a throwaway spec should check the build's
exit code, not just that a command ran.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass |
| D2 | `go build ./...` | pass |
| D3 | `make lint` | pass |
| D4 | `! rg -n "hook_event_name" cmd/ internal/ --glob '!internal/claudecode/**'` | pass |
| D5 | `! rg -n '"rate_limits"\|"used_percentage"\|"context_window"\|"session_name"\|"total_input_tokens"' cmd/ internal/ --glob '!internal/claudecode/**'` | pass |
| D6 | `! rg -n '"--resume"' cmd/ internal/ web/ --glob '!internal/claudecode/**' --glob '!web/e2e/**'` | pass |
| D7 | `! rg -n "resize-pane" cmd/ internal/ web/ test/` | pass |
| D8 | `rg -q "func TestMergeSettings_ForeignCommandHookOnSessionStartSurvives" internal/claudecode/settings_test.go` | pass |
| D22 | `ls internal/store/migrations/0004_reconcile.sql` | pass |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass |
| E1 | `make e2e` | pass |

All 12 run verbatim from the repo root; every one exits 0.

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D9–D21 | the listed unit/HTTP tests exist and assert what the criterion says | pass | verified in full in cycles 1–3; **no Go file changed this cycle** (newest Go mtime is `manager.go` 08-26 23:28, cycle 3's fix), so that verification carries. Re-listed every `func Test*` across the eight relevant files to confirm none was renamed or dropped |
| W3 | no `any` in new web code | pass | `rg ': any\b\|as any\|<any>\|\bany\[\]' web/src` — zero hits, **including** the new `.test.ts` files (the `FakeDomNode` shim uses `as unknown as X`, not `any`) |
| W4 | `sortSessions` — ended after live, most-recently-ended first | pass | `sort.test.ts:163,181` |
| W5 | card VM — `ended <age>` timer, `["Resume","Remove"]` vs `["End"]` | pass | `card.test.ts:274-299` |
| W6 | `protocol.ts` parses / rejects `sessionRemoved` | pass | `protocol.test.ts:483-494` |
| W7 | `live.ts` drops a removed id without reshuffling | pass | `live.test.ts:177,182` |
| W8 | never opens `/ws/terminal/{id}` for `alive:false` | pass | `terminal.spec.ts:265` + `actions.spec.ts` INV-5 case, both green; my own browser run mounted no terminal for the dead session |
| E2–E15 | present in the specs and green | pass | 96/96 |
| R1 | `internal/session` stores capture text and never inspects it | pass | `manager.go:467-506` — `CapturePane`'s string is compared for equality-to-persist and assigned; no state field is derived from it. `End` (`:530`) does the same before the kill |
| R2 | real-haiku resume check | **not performed** | out of scope by explicit instruction again this cycle. `[orchestrator]`, unchanged |
| R3 | snapshot text in no log line | pass | the three snapshot log sites (`manager.go:476,505,531`) carry `err` + `session_id` only; `tmux.runCapture` still keeps `capture-pane` stdout out of the error string |
| R4 | doc upkeep | **incomplete** | `docs/protocol.md` merged (92 insertions, verified against the Protocol Contract in cycles 1–3). `TODO.md`, `SPEC.md`, `spikes/canary-fields.md` still show no modification in `git status`. `[orchestrator]`, unchanged |

### Repairs audit

`test-specs.md` → **Fix Attempt 3** records **no repairs**, and I verified the claim rather
than reading it. All five edits are additive: three computed-style assertions inserted
into tests that already passed (E6, E11, E9), and two wholly new tests. Sweeps across
`web/e2e` and `web/src` for `test.skip` / `test.fixme` / `.only(` / `describe.skip`:
**zero hits**. The two `t.Skip` calls in Go remain the pre-existing `curl`/`sh`-on-PATH
environment guards in `internal/server/settings_shell_test.go`. No assertion was replaced
by a container-level `toBeVisible()` — E6 and E11 *gained* a stricter check beside the
existing one. `web-tests.md` → Fix Attempt 1 touched no implementation file and only added
17 tests (387 → 404). The earlier repair tables (Validate Attempt 1's 7 cookie fixes, Fix
Attempt 1's one race reorder) were audited in cycles 1–2 and are unchanged.

**Teeth check on the new guards** (the point of the cycle): I reverted the Critical-1 CSS
fix — moved `opacity: 0` back onto the bare `.acts-row` — rebuilt, and re-ran the two
tests that are supposed to catch it:

```
> expect(cap.locator(".acts-row")).toHaveCSS("opacity", "1")   E6  Expected "1"  Received "0"
> expect(tileA.locator(".endcap .acts-row")).toHaveCSS(…)      E11 Expected "1"  Received "0"
2 failed
```

Both fail, on both surfaces. The guards are real. Fix restored, `md5` verified identical
to the pre-experiment file, dist rebuilt to the original asset hashes.

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — D4/D5/D6 green; `--resume` appears only in `internal/claudecode/launch.go` |
| 2 | No terminal-output state parsing | pass — `capture-pane` reaches only `tmux.CapturePane` → `storeSnapshot`; liveness is still decided solely by `PaneExists` (R1) |
| 3 | Non-blocking hook handler; timeouts ≤ 2 s | pass — `hookTimeoutSeconds = 2`, used for both hook forms |
| 4 | tmux always on a dedicated socket; no `resize-pane` | pass — D7 green; `pty.Setsize` then `tmux resize-window`, in that order (`termbridge.go:81-85`) |
| 5 | No payload logging | pass (R3) |
| 6 | No empty-gauge dishonesty | pass — `no snapshot captured` / `loading last screen…` / masthead `unknown` all intact; my run's masthead read `5h unknown  7d unknown` with no data |
| 7 | Session identity keys on the tmux target | pass |
| 8 | No settings trespass | pass — no `CLAUDE_CONFIG_DIR`, no `~/.claude/settings.json` access; isolation is the project-scoped `settings.local.json` |
| 9 | No real `claude` outside canary/probes | pass — every spec drives the stub via `-claude-bin`; my own measurement runs launched no real binary |

### Design-system compliance

| Check | Result |
|---|---|
| Tokens — no hard-coded hex/rgba in components | pass — a script that strips the `:root` block and scans the rest of `style.css` for `#hex`/`rgba(` returns nothing; `--danger`/`--danger-line`/`--danger-fg` were added to the `:root` block **and** to design-system §1 before use |
| No web fonts | pass — no `@import`, `@font-face`, or `fonts.g*` in `style.css`/`index.html` |
| State colour is meaning | **pass — the cycle-1/2/3 `--rose` Major is closed.** §3 now reads "destructive actions use the `--danger` family (§1), never `--rose`"; every remaining `--rose` consumer is a Failed-state use (`.tile.s-failed .sdot`, `.strip .card.s-failed`, `.note.fail`, `.s-failed .stripe`/`.badge`). Measured live: Remove-confirm is `rgb(201,79,79)` on `rgb(122,53,53)`, visibly a different red from `--rose`'s `#e36a6a` |
| Colour never the sole carrier | pass — ended cards carry the word `ended`, the bottom sort position, strike-through and dimming; dead tiles carry the `stopped` marker word |
| Tabular numerics | pass — 14 declarations. The new time-varying readouts are all covered: `.endbar` (both the ended age and REQ-19's `captured <age>`), `.endcap .pill`, `.mainhead .meta`, `.card .timer`, and the tile footer's `.tage` by inheritance from `.tfoot` |
| `[hidden]` companions | pass — swept all 46 `.hidden =` sites in `web/src` against the 21 `[hidden]` rules; every element JS toggles has one (`.acts-row[hidden]`, `.mainhead[hidden]`, `.dead-surface[hidden]`, `.sizenote[hidden]`, `.model[hidden]`, `.strip[hidden]`, …). No gap |
| Honesty rules (§6) | **pass** — the cycle-3 failure is fixed: the dead surface's one recovery affordance now renders. No 0%/empty track for unknown data; context shows tokens + compactions; `permission_mode` is last-known; no "Done"; no cost display; daemon-down banner prominent; `.endbar` carries both ages |
| Terminal rules (§7) | pass — a dead session opens no client on any surface; geometry moves on focus rather than duplicating; no `resize-pane`; `pty.Setsize` then `resize-window`; xterm `scrollback: 0`; no styling applied to pane contents |

## Manual Verification

Driven in a real browser (Playwright, headed engine) against scratch `musterd` instances I
started myself — private data dir, private tmux socket, the harness stub `claude`. No real
`claude` was launched. Both throwaway specs were deleted afterwards and the tree was
verified restored (`git status` shows no `zz-*`/`test-results`; `web/dist` back to
`index-BpQXRCXO.js` / `index-KMqHG7j-.css`, the exact pre-review hashes; `md5` on
`style.css` and `render/sessions.ts` identical to my pre-experiment backups). Everything
below is observed output, not description:

1. **Cycle-3 Critical 1, re-measured on both surfaces.** Ended a session, focused it, and
   walked the computed-opacity chain from the cap's Resume button to the body:

   ```
   FOCUS cap chain: BUTTON.btn sm=1 | DIV.acts-row=1 | DIV.pill=1 | DIV.endcap=1 |
                    DIV.termwrap=1 | DIV.dead-surface=1 | SECTION.main=1 | DIV.split=1
   FOCUS capRow opacity: 1
   TILE cap resume opacity: 1     TILE cap row opacity: 1
   ```

   Compare cycle 3's measurement of the same chain: `DIV.acts-row=0`. **Genuinely fixed**,
   and the full-page screenshots confirm it visually — the "SESSION ENDED / now · last
   state: started" pill now has a painted `Resume` button where cycle 3 had a blank strip,
   in Focus and inside a 2×2 dead tile alike.

2. **The hover-only behaviour it depends on still works** (Damian's sign-off this cycle):
   `rail acts-row: atRest=0 hover=1`. The rail screenshot shows a non-hovered ended card
   with no visible action row, and the focused ended card revealing Resume + Remove via
   `:focus-within` — keyboard users are covered.

3. **`--danger` measured on the real button**, not read off the token file:
   `remove-confirm bg: rgb(201,79,79) | border: rgb(122,53,53) | color: rgb(255,255,255)`.

4. **REQ-14 dialog copy, read live** (transcribed, not composed — matches the mockup):
   - End: *"End session? / rv4-a — muster-e2e-repo-1ttjaG. Kills the tmux pane and the
     claude inside it. The card stays in the rail as ended — Resume can pick the
     conversation back up if this was a slip. / Cancel  End session"*
   - Remove, on a **live** session: *"Remove session? / rv4-b — … **This ends the session
     first.** Deletes it from Muster for good — the card disappears and it can no longer
     be resumed from here. / Cancel  Remove"* — REQ-6's alive-case clause is present.

5. **REQ-13 / REQ-19 end bar**: `ended now · last state started · last captured screen,
   not a live client · captured now` — no "now ago", and the snapshot `<pre>` held the
   stub's exact output (`"MUSTER-STUB-READY"`).

6. **REQ-7 end-to-end by hand**: clicked Resume in the cap → the card returned to live,
   and the new pane's start command read

   ```
   "…/stub-claude.sh" --model claude-haiku-4-5-20251001 --resume claude-rv4-a
   ```

   with the row reading `alive: true  endedAt: null`.

7. **Mainhead (REQ-10)** on a dead focused session: `rv4-a  muster-e2e-repo-1ttjaG · haiku
   · ended now  End Resume Remove` — End disabled, Resume enabled once a
   `claudeSessionId` existed. I also confirmed the honest inverse: with **no**
   `claudeSessionId`, the cap's Resume renders visible-but-`disabled` rather than
   pretending it can recover a conversation the daemon never learned the id for.

8. **Minor 2, measured with a control.** Two live tiles, focus on tile B's footer **End**:

   ```
   control (2.5 s of render ticks, no reorder):  BUTTON action=end id=2
   after a real priority change (reorder):       BODY   action=undefined id=undefined
   ```

   The control is what makes this a reorder finding rather than a re-opened tick finding.

9. **Console** — `pageerrors: 0` across the whole run.

**R2 was not performed**, per this cycle's explicit instruction. The reasoning is
unchanged and not waved away: REQ-8's same-`session_id` claim was measured *headless*
(`-p`) on 2.1.233, this plan resumes *interactively*, and the installed binary is 2.1.246
(the dashboard's own masthead says so: `claude 2.1.246 (drift from pinned 2.1.233)`). A
different minted id lands the session in `started` instead of `idle` — REQ-8 handles that
path explicitly, so a divergence degrades honestly rather than breaking, which is why it
does not block. Still owed, with the outcome recorded in `spikes/canary-fields.md`.

## Issues

### Critical

None.

### Major

1. **[orchestrator]** **R4 doc upkeep incomplete; R2 still owed.** — `docs/protocol.md` is
   merged and verified, but `git status` shows `TODO.md`, `SPEC.md` and
   `spikes/canary-fields.md` untouched: the four M4 TODO ticks, the SPEC §11 changelog
   entry (shutdown policy, startup sweep, snapshot in, placement C, resume → idle) and
   R2's canary-fields recording are all still outstanding. Non-blocking by the verdict
   rules; the Doc-Upkeep Backstop and Completion steps own it. Carried unchanged from
   cycles 1–3.

   *(Cycle 3's second Major — `--rose` for destructive actions — is **closed**, not
   carried: Damian chose option A, the `--danger` family is in design-system §1/§3, and
   web-impl repointed every destructive rule. Verified above.)*

### Minor

1. **[web-tests]** **Two of the new `reconcileCards` focus tests pass with the focus-restore
   branch dead.** — `web/src/render/sessions.test.ts:450,483` — the `FakeDomNode` shim
   never blurs on detach, so `document.activeElement` is unchanged across a shim reorder,
   so `reconcileCards`' restore is gated out by its own `document.activeElement !== active`
   guard and never runs. Proved rather than argued: I stubbed the restore's `target?.focus()`
   to a no-op and `npx vitest run src/render/sessions.test.ts` reported **15 passed**.

   This is a Minor and not a Major for one specific reason — the behaviour *is* covered by
   a test with teeth, just not this one. With the same stub in place I ran the E2E case and
   it failed correctly:

   ```
   > expect(endBtnB).toBeFocused()   Received: inactive   (actions.spec.ts:1115)
   ```

   So nothing is unverified; what is wrong is that two test *titles* claim coverage they
   do not provide, which is the kind of thing that quietly rots. One line fixes it: have
   `FakeDomNode.removeChild`/`insertBefore` clear `document.activeElement` when the
   detached subtree contains it — the real DOM behaviour the fix exists for. The other
   seven tests in that file (identity preservation, reorder-in-place, removal, stray text
   node, "doesn't steal focus from outside") are sound and do have teeth.

2. **[web-impl]** **The focus-on-reorder fix landed on the rail but not on the Tiles grid,
   and a tile-footer button loses focus on a real re-sort.** —
   `web/src/main.ts:433-465` (`reconcileTilesGrid`) — the same `insertBefore`-detach window
   cycle 3's Minor 1 named for `reconcileCards`, in the view REQ-12 just added action
   buttons to. Measured with a control (Manual Verification 8): focus on a tile's **End**
   survives 2.5 s of render ticks (`BUTTON action=end id=2`) and falls to `<body>` the
   moment a `Notification` promotes the other session and reorders the grid.

   web-impl flagged this itself and explained why it stopped at the rail (the cycle-3
   issue named only `sessions.ts:276`, and it did not want to touch unreviewed code in a
   fix wave) — that is the right instinct and I am recording it as a considered decision,
   not an oversight. Two things keep it Minor: the reorder path is **pre-existing m2
   code**, not this plan's (this plan only added the `connected` parameter and the dead-tile
   body), and cycle 3 explicitly ruled this defect class non-blocking for the rail. Holding
   to that precedent rather than moving the goalposts in the cycle that would block on it.

   The fix is the block already written in `reconcileCards` (capture the active element's
   `data-action` + `data-id` before the reorder loop, re-resolve and re-focus after),
   copied across — and while there, the comment at `main.ts:454-458` claiming a moved tile
   "stays mounted and keeps focus" should go: it is now measurably false for focusable
   chrome. Worth noting the same detach also blurs a focused **xterm textarea** inside a
   reordering tile, which predates this plan but is the more user-visible half.

3. **[e2e-specs]** **No spec covers the Tiles-view half of the focus-on-reorder contract.**
   — `web/e2e/actions.spec.ts:1066` — the new re-sort case is rail-only, matching the fix.
   Once Minor 2 is addressed, the symmetric tile-footer case (focus a tile's End, promote
   the neighbour to `needs_input`, assert `toBeFocused()`) is the assertion that keeps it
   fixed; the harness pattern is already in that file. Not worth adding against code that
   currently fails it.

*(Cycle-3 Minors 4 and 5 are closed: `reconcileCards` gained nine unit tests and REQ-19's
`captured <age>` clause gained eight — see Minor 1 for the one caveat on two of the nine.
Cycle-3 Minors 2, 3, 6 and 7 were closed in Fix Attempt 3 / recorded closed already.)*
