# Review: M4 — Reconcile, shutdown policy, end / remove / resume

**Plan**: m4-reconcile
**Cycle**: 3 (cycle 1 preserved at `review.cycle1.md`, cycle 2 at `review.cycle2.md`)
**Verdict**: needs-changes

Cycle 2's two blocking Majors are both genuinely fixed, and I re-measured each in a real
browser rather than trusting the diff: the rail card, tile footer and strip card action
buttons now survive the 1 s render tick with focus intact and open their dialog on a
separate Enter, and the two new E2E cases guard exactly that. Every suite is green,
every authored acceptance check passes, and the hard-rule checklist is clean.

One new Critical was introduced by this cycle's own Minor-4 fix. The `.acts-row`
hover-reveal rule was written unscoped, and the dead surface's "SESSION ENDED" cap
reuses that same class outside any `.card` — so REQ-13's cap **Resume button is now
invisible on every dead surface**, in Focus and in every dead tile. It is still in the
DOM and still clickable, which is why the whole suite stayed green: `actions.spec.ts:220`
asserts `toBeVisible()` on that exact button and passes, because Playwright's visibility
model does not treat `opacity: 0` as hidden. Screenshots and computed-style chains below.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 reconcile before serving | Yes | Yes (D9, E2/E4) | pass (verified live, cycle 2) |
| REQ-2 unknown panes reported, never adopted | Yes | Yes (D10) | pass — D10 now asserts the warn line too |
| REQ-3 shutdown policy (`-on-exit`) | Yes | Yes (D19/D20/D21, E3/E4) | pass |
| REQ-4 pane snapshots | Yes | Yes (D14, D18, new blank-first-capture test) | pass |
| REQ-5 End | Yes | Yes (D15, D17, E5) | pass |
| REQ-6 Remove | Yes | Yes (D16, E9/E12) | pass |
| REQ-7 Resume | Yes | Yes (D13, E7) | pass |
| REQ-8 resume lands in `idle` | Yes | Yes (D11, D12, E8) | pass |
| REQ-9 ended sort + styling | Yes | Yes (W4, W5) | pass |
| REQ-10 focus mainhead | Yes | Yes (E5, E14) | pass |
| REQ-11 card action row | Yes | Yes (E5, E9, new keyboard-after-tick case) | **pass** — cycle-2 Major 1 fixed and re-measured |
| REQ-12 tiles | Yes | Yes (E11, E12, new tile-footer keyboard case) | **pass** — same, measured on the tile footer |
| REQ-13 dead surface | Partly | Green but vacuous | **FAIL** — the cap's Resume button renders at `opacity: 0`; see Critical 1 |
| REQ-14 confirm dialogs | Yes | Yes (E10) | pass |
| REQ-15 `sessionRemoved` client handling | Yes | Yes (W6, E12 — now observes the WS frame) | pass |
| REQ-16 D5 regression guard | Yes | Yes (D8) | pass |
| REQ-17 reconcile summary line | Yes | Yes (D9) | pass |
| REQ-18 ⌘1–9 on an ended session | Yes | Yes (existing views specs) | pass |
| REQ-19 snapshot `capturedAt` age (nice-to-have) | Yes | No direct test | pass — measured live: `.endbar` reads `… not a live client · captured now` |

## Build & Tests

E2E tests: **pass** (94/94, 24.9 s — full suite, 11 spec files)
Daemon tests: **pass** (`go test -count=1 ./...`, uncached, all packages)
Web tests: **pass** (387/387, 16 files)
Daemon build: **pass**
Web build: **pass** (`tsc --noEmit && vite build`)
Lint: **pass** (`golangci-lint run` — 0 issues)

Note on the regression sweep, so the record is honest: my **first** full-suite run showed
2 failures, both in `views.spec.ts` (E8 and E9), both a 60 s timeout waiting for the
static `Tiles` button. That run was my own fault — I had `go test -count=1 ./...`,
`make lint` and the web build running concurrently, and those two tests each launch five
real tmux sessions (the suite took 1.3 m instead of the usual ~25 s). `views.spec.ts`
alone re-ran 11/11 in 7.7 s, and a clean full re-run with nothing else executing was
94/94. **Not a regression from this plan** — recorded only so nobody re-derives it.

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
| D9–D21 | listed unit/HTTP tests exist and assert what the criterion says | pass | verified in full in cycles 1–2; unchanged this cycle except D10 (below) |
| D10 | reconcile reports **and logs** unknown `muster-*` without inserting | pass — gap closed | `manager_test.go` now builds the Manager with `zerolog.New(&logBuf)` and asserts both the warn message and `"tmux_session":"muster-999999"`; daemon-tests proved teeth by deleting the `Warn()` call and showing the failure |
| D14/REQ-4 | write-side blank-first-capture edge (cycle-2 Minor 2) | pass | `storeSnapshot`'s guard is now `sess.LastSnapshot == text && !sess.LastSnapshotAt.IsZero()` (`manager.go:495`); `TestSnapshot_VeryFirstCaptureBlankStillSetsCapturedAt` (`manager_test.go:1252`) is the only test that exercises it, and daemon-tests showed it failing against the pre-fix guard |
| W3 | no `any` in new web code | pass | `rg ': any\b\|as any\|<any>' web/src --glob '!*.test.ts'` — zero hits |
| W4–W8 | as stated | pass | unchanged from cycle 2's verification |
| E2–E15 | present in the specs and green | pass | 94/94; E12 now observes the `sessionRemoved` frame directly (`routeWebSocket` proxy, exactly-one-frame assertion) rather than inferring it from `GET /api/state`, and the pre-existing state assertion is unchanged, not replaced |
| R1 | `internal/session` stores capture text, never inspects it | pass | the one changed line compares text for equality-to-persist only; no state field is derived from it |
| R2 | real-haiku resume check | **not performed** | out of scope by explicit instruction this cycle; carried as an `[orchestrator]` item |
| R3 | snapshot text in no log line | pass | `manager.go`'s three snapshot log sites carry `err` + `session_id` only; `runCapture` still keeps stdout out of the error |
| R4 | doc upkeep | **incomplete** | `docs/protocol.md` merged and correct; `TODO.md`, `SPEC.md`, `spikes/canary-fields.md` still untouched (`git status`) — carried `[orchestrator]` item |

### Repairs audit (`test-specs.md` → `## Repairs`)

Fix Attempt 2 records **no repairs**, and the diff bears that out. Sweeps:
`test.skip` / `test.fixme` / `.only(` across `web/e2e` and `web/src` — **zero hits**. The
two `t.Skip` calls in Go are pre-existing `curl`/`sh`-on-PATH environment guards in
`internal/server/settings_shell_test.go`, untouched by this plan. No assertion was
replaced by a container-level `toBeVisible()`; E12's edit is strictly additive. The
earlier repair tables (Validate Attempt 1's 7 cookie fixes, Fix Attempt 1's one race
reorder) were audited in cycles 1–2 and are unchanged.

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — D4/D5/D6 green; `--resume` only in `internal/claudecode/launch.go` |
| 2 | No terminal-output state parsing | pass — `capture-pane` appears only in `tmux.CapturePane` and the store-only snapshot path; liveness still decided solely by `PaneExists` |
| 3 | Non-blocking hook handler; timeouts ≤ 2 s | pass — `hookTimeoutSeconds = 2` (`internal/claudecode/settings.go:17`), used for both the http and command hooks |
| 4 | tmux always on a dedicated socket; no `resize-pane` | pass — both `exec.CommandContext` sites (`tmux.go:264,279`) and the attach argv (`:161`) prepend `socketFlag()`; D7 green |
| 5 | No payload logging | pass (R3) |
| 6 | No empty-gauge dishonesty | pass — `no snapshot captured` / `loading last screen…` / masthead `unknown` all intact |
| 7 | Session identity keys on the tmux target | pass |
| 8 | No settings trespass | pass — `rg 'CLAUDE_CONFIG_DIR\|\.claude/settings\.json'` over `cmd/` + `internal/` returns nothing; isolation is the project-scoped `settings.local.json` only |
| 9 | No real `claude` outside canary/probes | pass — every test drives the stub via `-claude-bin`; no test invokes the real binary |

### Design-system compliance

| Check | Result |
|---|---|
| Tokens — no hard-coded hex/rgba in components | pass — an `awk` sweep of `style.css` for `#hex`/`rgba(` outside the `:root` block returns nothing |
| No web fonts | pass — no `@import`, no `@font-face`, no `fonts.googleapis` |
| State colour is meaning | pass with the known `--rose` exception (Major 2, `[orchestrator]`, carried) — no new state-colour use this cycle |
| Colour never the sole carrier | pass |
| Tabular numerics | pass — 14 declarations, covering every time-varying readout including the new `· captured <age>` clause's host (`.endbar`) |
| `[hidden]` companions | pass — `.acts-row[hidden] { display: none; }` at `style.css:384` still accompanies the new `display: flex`; the `.mainhead` and `.dead-surface` companions are unchanged |
| Honesty rules (§6) | **FAIL** — see Critical 1: the dead surface's only recovery affordance renders invisible, so the surface understates what the user can do. §6.8's stale-age rule is now satisfied (REQ-19 shipped) |
| Terminal rules (§7) | pass — a dead session opens no client anywhere; geometry still moves on focus; no `resize-pane`; `scrollback: 0` untouched; no styling on pane contents |

## Manual Verification

Driven in a real browser (Playwright) against scratch `musterd` instances I started
myself — private data dir, private tmux socket, the harness stub `claude`. No real
`claude` was launched. All three throwaway measurement specs were deleted afterwards
(`git status --short web/e2e/` shows only the plan's own files). Everything below is
observed:

1. **Cycle-2 Major 1, re-measured on all three surfaces.** Focused the button, waited
   1.5 s (past the 1 s render tick), re-checked `document.activeElement`, then pressed
   Enter as a separate action:

   ```
   rail card End:    before=true  after1.5s=true  activeTag=BUTTON  Enter opened the dialog
   tile footer End:  before=true  after1.5s=true
   ```

   Compare cycle 2's measurement of the same thing: `after1.4s=false, activeTag=BODY`.
   **Genuinely fixed.** `reconcileCards`/`reconcileActsRow`/`renderTileFooterActions`'s
   shape-diff do what the log claims, and `dispatchAction` is a stable module-level
   function so the once-wired click listeners carry no stale closure.

2. **Critical 1, measured.** Ended a session, focused it, and read the computed style
   chain of the cap's Resume button:

   ```
   ENDCAP resume opacity chain:
     BUTTON.btn sm=1 | DIV.acts-row=0 | DIV.pill=1 | DIV.endcap=1 | DIV.dead-surface=1 | …
   ENDCAP .acts-row opacity = 0   box = {x:763.8, y:428.8, w:52.3, h:19}
   DEAD TILE endcap .acts-row opacity = 0
   ```

   And in the full-page screenshots the "SESSION ENDED / now · last state: started" pill
   has a blank strip where the button should be — in Focus and in the 2×2 dead tile
   alike. The tile *footer*'s Resume/Remove are unaffected (they use `.tfoot .acts`, a
   different class, measured at opacity 1 / 0.55-dimmed-chrome).

3. **The hover behaviour itself works as web-impl describes**, for cards:
   `RAIL acts-row: atRest=0  hover=1  focusWithin=1`. Keyboard users are covered —
   tabbing into the row raises it via `:focus-within`.

4. **REQ-19 measured**: `.endbar` reads
   `ended now · last state started · last captured screen, not a live client · captured now`
   — no "now ago", the clause only appears in the `ok` pane state.

5. **Focus across a genuine sort change (new finding, Minor 1)**: focused card B's End
   button, then posted a `Notification` so B re-sorted above A:

   ```
   ORDER before=["rv-sort-a","rv-sort-b"]  after=["rv-sort-b","rv-sort-a"]
   SORT-CHANGE focus: before=true  after=false  active=BODY
   ```

   `insertBefore` on an already-mounted node still detaches it, and Chrome blurs a
   focused element on detach. Far rarer trigger than the per-tick rebuild (a real state
   change, not a clock tick), hence Minor, not a re-opened Major.

6. **Console** — no application errors at any point.

**R2 was not performed**, per this cycle's explicit instruction not to run a real
`claude`. The reasoning still stands and is not waved away: the same-`session_id` claim
behind REQ-8 was measured headless (`-p`) on 2.1.233, this plan resumes interactively,
and the installed binary is 2.1.246. A different minted id would land the session in
`started` rather than `idle` — a degradation, not a break, which is why it does not
block. Still owed, together with recording the outcome in `spikes/canary-fields.md`.

## Issues

### Critical

1. **[web-impl]** **REQ-13's "session ended" cap Resume button is invisible on every dead
   surface.** — `web/src/style.css:371-381`; markup at `web/index.html:57` and `:202` —
   this cycle's Minor-4 fix added

   ```css
   .acts-row { … opacity: 0; transition: opacity 120ms ease; }
   .card:hover .acts-row,
   .card:focus-within .acts-row { opacity: 1; }
   ```

   but `.acts-row` is not a card-only class: the dead surface's cap reuses it (there is
   even a dedicated `.endcap .pill .acts-row` rule at `style.css:557`), and neither
   `#dead-surface` nor a tile's cloned `.dead-surface` is ever inside a `.card`. The
   reveal rule therefore never matches and the cap's Resume stays at `opacity: 0`
   permanently. Measured chain and screenshots in Manual Verification 2 — confirmed on
   **both** surfaces (Focus's `#dead-surface` and a dead tile's cloned instance).

   This breaks the plan's Testable UI Elements row *"Dead surface cap … contains a
   `Resume` button"* as a **user-facing** claim, and design-system §6: the dead surface
   is where a user recovers a session, and its only recovery affordance is now
   unreadable. It is also why the suite stayed green over it —
   `web/e2e/actions.spec.ts:220` asserts
   `expect(cap.getByRole("button", { name: "Resume" })).toBeVisible()` and **passes**,
   because Playwright's actionability model does not treat `opacity: 0` as hidden. That
   is a textbook vacuous pass and worth naming as such: the assertion is the right one,
   the model just cannot see this failure mode.

   Fix: scope the reveal to cards only — `.card .acts-row { opacity: 0 }` plus the two
   existing `.card:hover` / `.card:focus-within` rules — so the cap's row keeps its
   default opacity. Re-measure the cap's computed opacity on both surfaces after the
   change; do not rely on the suite going green, since it is green today.

### Major

1. **[orchestrator]** **R4 doc upkeep still incomplete; R2 still owed.** — `docs/protocol.md`
   is merged and verified clause-by-clause against the Protocol Contract, but
   `TODO.md`, `SPEC.md` and `spikes/canary-fields.md` remain untouched: the four M4 TODO
   ticks, the SPEC §11 changelog entry (shutdown policy, startup sweep, snapshot in,
   placement C, resume → idle) and R2's canary-fields recording are all still owed.
   Non-blocking; the Doc-Upkeep Backstop and Completion steps own it. Carried unchanged
   from cycles 1 and 2.

2. **[orchestrator]** **`--rose` for destructive actions still contradicts design-system
   §3.** — `web/src/style.css:1069-1079`, `web/index.html:144,153` — unchanged and
   correctly left alone by web-impl (the plan authorised the reuse at `plan.md:234`). §3
   says a state colour may only mean that state and that "rose is never 'delete'"; a
   `failed` card's rose stripe can sit on screen beside a rose Remove hover. Either amend
   §3 to record the exception or add a `--danger` family. No pipeline agent may edit
   `docs/design/design-system.md`. Damian's call. Carried unchanged from cycles 1 and 2.

### Minor

1. **[web-impl]** A focused action button still loses focus when the rail's **sort order**
   changes. — `web/src/render/sessions.ts:276` — `container.insertBefore(card, …)` moves
   an already-mounted node, which detaches it first, and Chrome blurs a focused
   descendant on detach. Measured: `SORT-CHANGE focus: before=true after=false
   active=BODY` when a `Notification` promoted the focused card to needs-input
   (Manual Verification 5). Much narrower than cycle-2 Major 1 — it needs a genuine
   priority change rather than a clock tick — so not blocking, but it is the same class
   of defect and the natural moment to close it: note the active element's
   `data-action` + `data-id` before the reorder loop and re-focus the match afterwards
   (or use `moveBefore` where available, which preserves focus by design).

2. **[e2e-specs]** No spec can see the Critical-1 class of defect. —
   `web/e2e/actions.spec.ts:220` — `toBeVisible()` is the right assertion and cannot be
   blamed for Playwright's model, but once Critical 1 is fixed, one computed-style guard
   on the cap's row (`expect(capRow).toHaveCSS("opacity", "1")`, or the same on the
   button) would keep a future unscoped CSS rule from silently blanking the dead
   surface's only recovery affordance again. One assertion, one surface — not a sweep.

3. **[web-impl]** The hover-only `.acts-row` behaviour was decided inside the fix cycle,
   not signed off. — `web/src/style.css:371-381` — cycle 2's Minor 4 asked for *Damian's
   conscious sign-off* on always-on versus hover-only; web-impl implemented hover-only
   instead, reasoning from the mockup (`opt-c-both.html:277`), which is a defensible
   reading and is documented honestly in `web-implementation.md`. The behaviour itself
   measures correctly for both mouse and keyboard (Manual Verification 3). Flagging only
   so the decision is visible rather than absorbed: it changes rail density from what
   shipped in cycles 1–2, and it is what produced Critical 1. Worth a line from Damian at
   completion either way.

4. **[web-tests]** `reconcileCards` — the cycle's largest new piece of logic — has no unit
   test. — `web/src/render/sessions.ts:236`, `web/src/render/sessions.test.ts` — its
   reorder / insert / remove / update-in-place branches are covered only indirectly, by
   the two new E2E keyboard cases and by whatever the existing view specs happen to
   exercise. The E2E coverage is real and I am not asking for duplication of it; a small
   jsdom test that reconciles a container across an id set change (add, remove, reorder)
   and asserts node identity is preserved for surviving ids would pin the contract the
   focus fix depends on, and would also cover Minor 1 once that is fixed.

5. **[web-tests]** REQ-19's `· captured <age>` clause has no test on either side. —
   `web/src/render/dead.ts:80` — `dead.test.ts` covers `loadPane` only, and no E2E
   asserts the clause. I verified it live, so this is a coverage gap rather than a
   defect; `renderDeadSurface` is pure enough to test directly against a jsdom fixture.

6. **[daemon-tests]** `tmux.CapturePane`'s regression guard still cannot reproduce the
   failure mode it guards. — `internal/tmux/tmux_test.go` — daemon-tests took the right
   action on cycle-2 Minor 8 (expanded the doc comment to say a green result is not
   evidence a leak ever fired, rather than manufacturing process-mocking scaffolding for
   one Minor). Recorded as closed, not outstanding.

7. **[web-impl]** `.acts-row` is unconditionally visible on every live rail card —
   **resolved** this cycle by Minor 3 above. Carried from cycles 1 and 2 and closed here
   for the record.
