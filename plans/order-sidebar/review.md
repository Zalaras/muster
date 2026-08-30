# Review: Order the session sidebar (rail) — review cycle 2

**Plan**: order-sidebar
**Verdict**: approved

Cycle 1's review (verdict `approved`, archived at `plans/order-sidebar/review.cycle1.md`)
raised one Major routed as `[orchestrator:decision]` (⌘1–9 no longer selected the card the
user sees), one `[orchestrator]` doc-upkeep item, and two `[daemon-impl]` Minors. This cycle
re-reviews the delta `7a65f5a..HEAD` — the settled decision's implementation, its E2E
coverage and the doc upkeep — and re-runs every gate in full.

Delta reviewed (`git diff --stat 7a65f5a..HEAD`): `web/src/main.ts` (the only
implementation file), `web/e2e/rail-order.spec.ts` (+4 tests), `web/e2e/views.spec.ts`
(E7 repair, 1 line), `SPEC.md`, `TODO.md`, `docs/design/ux-flows.md`,
`docs/design/design-system.md`, `plans/order-sidebar/{plan,test-specs,web-implementation}.md`,
`plans/order-sidebar/decisions/cmd-n-ordering/*`.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 per-session order fields | Yes (`store/session.go`, `session/session.go`, `manager.CreateSession`) | Yes (Go unit + E2), browser-measured in cycle 1 | pass |
| REQ-2 order invariants | Yes (`railorder.go` rebuild) | Yes (`TestApplyPin/ApplyOrder_InvariantsHoldFromEveryStartingConfiguration`) | pass |
| REQ-3 pin | Yes (`applyPin`, `SetPinned`, `handlePinSession`) | Yes (D6–D8) + measured live | pass |
| REQ-4 order | Yes (`applyOrder`, `SetOrder`, `handleSetOrder`) | Yes (D9–D12) + measured live | pass |
| REQ-5 rail sort pref | Yes (`prefs.go`, `state.go`) | Yes; default `manual` confirmed again this cycle in the browser probe | pass |
| REQ-6 `orderRail` (**amended** 2026-08-30: ⌘1–9 is a fourth consumer) | Yes — `focusNth` now calls `orderRail(store.values(), railSort)` (`web/src/main.ts:293`); `sortSessions` has no `main.ts` call site left | Yes: 4 new E2E in `rail-order.spec.ts` (manual/needs-input-last, after drag, after pin, attention+pinned) + W3–W6/W9 unit + browser-measured below | pass |
| REQ-7 state change never moves a card in manual | Yes | Yes (E9) + re-measured this cycle (a `needs_input` `Notification` left the bottom card in place) | pass |
| REQ-8 pin control on every card | Yes (`index.html`, `render/sessions.ts`) | Yes (W13, E5) | pass |
| REQ-9 pinned block visual | Yes (`pinned`/`pinned-last`, 1px `--line2`) | Yes (W14) | pass |
| REQ-10 drag to reorder (manual only) | Yes (`dragreorder.ts`, `main.ts`) | Yes (E3, E11) | pass |
| REQ-11 pure drop math | Yes (`sessions/railorder.ts`) | Yes (W7, W8) | pass |
| REQ-12 sort toggle in rail head | Yes (`#rail-sort`) | Yes (E10, E12) | pass |
| REQ-13 strip follows rail order | Yes (`renderTilesView` → `orderRail`) | Yes (E14, W16) | pass |
| REQ-14 remove/resume keep invariants | Yes | Yes (`TestApplyOrder_EmptyIDsIsALiteralNoOpEvenWithGaps`, manager gap tests) | pass |
| REQ-15 daemon down | Yes (no optimistic state) | Yes (E16) | pass |
| REQ-16 focus survives drop/pin | Yes (`pendingRailFocus`) | Yes (unit + E2E) | pass |
| REQ-17 pin button title | Yes (`Pin to top` / `Unpin`) | Yes (W13) | pass |

## Build & Tests

E2E tests: **pass (140/140)** — full suite, `npm run e2e`, 38.0s, exit 0. Was 136 in
cycle 1; +4 new ⌘N tests, none removed or renamed.
Daemon tests: **pass** (`make test`, all 10 packages `ok`)
Web tests: **pass (549/549 in 19 files**, Vitest)
Daemon build: **pass** (`go build ./...`)
Web build: **pass** (`tsc --noEmit && vite build`)
Lint: **pass** (`golangci-lint run` — `0 issues.`)

No spec outside this plan failed, so this cycle's `main.ts` change caused no regression.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass |
| D2 | `go build ./...` | pass |
| D3 | `make lint` | pass |
| D4 | `rg -q "rail_pos" internal/store/migrations/0006_rail_order.sql` | pass |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass |
| W11 | `! rg -n "from \"../protocol\"\|sessions/store" web/src/render/dragreorder.ts` | pass |
| E1 | `make e2e` | pass (140/140) |

Each line was run verbatim from the repo root.

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D5–D18 | daemon behaviours (railorder/manager/prefs) | pass | Unchanged this cycle (`git diff --name-only 7a65f5a..HEAD -- internal/ cmd/` is empty); verified by reading in cycle 1, Go suite still green |
| W3–W10, W12–W18 | web behaviours (sort/railorder/render/style) | pass | Only `main.ts` changed this cycle; `sort.ts`, `railorder.ts`, `render/sessions.ts`, `style.css` untouched. Re-swept `web/src` for `any` (0 hits outside tests) and for `[hidden]` companions (45 `.hidden =` sites, all covered — no new site added) |
| E2–E16 | Playwright spec presence | pass | `npx playwright test --list` → 140 in 14 files; full suite green |
| REQ-6 amendment | ⌘1–9 indexes the rail's displayed order | pass | `focusNth` and the rail render both call `orderRail(store.values(), railSort)` (`main.ts:293` vs `main.ts:663`) over the identical `store.values()` set — no filtering between them, so index *n* is literally the *n*th rail card. Measured in the browser (below) |
| Decision compliance | Option A landed as written, dissent recorded | pass | `decisions/cmd-n-ordering/decision.md` outcome A; implemented in one line; dissent ("no keyboard path to jump-to-neediest") is recorded in `TODO.md` as a follow-up |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary (`internal/claudecode/`) | pass — no daemon code changed this cycle; sweep for `hook_event_name`/`rate_limits`/`permission_mode` outside the package returns only DB column names, comments and tests, as in cycle 1 |
| 2 | No terminal-output state parsing | pass — `capture-pane` appears only in `tmux.go`, the snapshot display path, and test oracles |
| 3 | Non-blocking hook handler / ≤2 s timeouts | pass — ingest path untouched |
| 4 | tmux always on a private socket; no `resize-pane` | pass — `rg "resize-pane"` returns nothing repo-wide; every bare `tmux` invocation passes `-S <private socket>` |
| 5 | No payload logging | pass — no logging changed |
| 6 | No empty-gauge dishonesty | pass — no gauge/render code changed |
| 7 | Session identity on the tmux target | pass — unchanged |
| 8 | No `~/.claude/settings.json` trespass, no `CLAUDE_CONFIG_DIR` | pass — hits are project-scoped scratch `.claude/settings.local.json` and `newprobe.sh`'s explicit `unset CLAUDE_CONFIG_DIR` |
| 9 | No real `claude` outside canary/probes | pass — E2E still drives the `-claude-bin` stub only |

Design-system re-check on the delta: no CSS, no tokens, no colours, no new `hidden`
toggles and no terminal geometry touched this cycle (`main.ts`'s `focusNth` body is the
whole implementation change), so §6 honesty and §7 terminal rules are unaffected. ⌘N still
moves focus rather than duplicating a live client — `focusNth` sets `focusedId` and
re-renders through the same single-surface `surfaceDiff` path as a rail click.

## Manual Verification

Booted a scratch `musterd` (own port, data dir, tmux socket, stub `-claude-bin`), launched
three real sessions through `POST /api/sessions`, faked Claude Code with the real
`SessionStart → UserPromptSubmit → Notification` hook chain, and drove the dashboard in
Chromium, dumping the observed rail DOM and `#mainhead .name` after each keystroke (probe
file and screenshot deleted afterwards; `git status` shows only the pre-existing untracked
`masthead.png` and `plans/new-session-dialog/`).

Observed, verbatim:

```
manual default        rail=[probe-one(started), probe-two(started), probe-three(started)]  mainhead=probe-one
probe-three→needs_input rail=[probe-one, probe-two, probe-three(needs input)]              mainhead=probe-one
click rail card #2     rail unchanged                                                      mainhead=probe-two
⌘1  (manual)          rail unchanged                                                      mainhead=probe-one
⌘3  (manual)          rail unchanged                                                      mainhead=probe-three
switch to attention   rail=[probe-three(needs input), probe-one, probe-two]                mainhead=probe-three
⌘1  (attention)       rail unchanged                                                      mainhead=probe-three
⌘9  (3 sessions)      rail unchanged                                                      mainhead=probe-three
```

- **Cycle 1's Major is fixed, measured not asserted.** The exact repro (rail
  `one, two, three` in manual order with `three` in `needs_input`) now focuses `probe-one`
  on ⌘1 — the rail's first card — where cycle 1 measured `probe-three`.
- **⌘N is an index, not a special case for 1**: ⌘3 landed on the third rail card.
- **Mode-aware**: after switching to Attention the rail re-sorted and ⌘1 followed it to
  `probe-three`.
- **Switching mode does not steal focus** (`mainhead` stayed on `probe-three` across the
  Manual→Attention switch) — REQ-7's sibling behaviour, unchanged.
- **Out-of-range is a no-op**: ⌘9 with three sessions changed nothing (the `if (!session)
  return` guard), no console error.
- REQ-7 re-confirmed live: the `needs_input` transition left `probe-three` in its bottom
  slot in manual mode.

## Repairs audit

`test-specs.md`'s `## Repairs (fix cycle, wave 3)` adds one entry (#6, `views.spec.ts` E7).
Verified against the file: the repair inserts one `selectOption("attention")` plus a
value-set wait before `Meta+1`, and every original assertion survives verbatim — both
`Meta+Backslash` toggle assertions, the "focus B first" precondition, `terminalRegion(prio-a)`
visible, and `terminalRegion(prio-b)` `toHaveCount(0)` (the REQ-18 "unmounted, not covered"
check). Nothing was deleted, skipped or weakened, and the manual-mode case the repair moved
out of E7 is now covered by a *stronger* new test (`rail-order.spec.ts:583`) that asserts
manual order is followed even with the needs-input session last. `rg "test.skip|test.fixme"`
over `web/e2e` returns nothing. The four new tests drive real ingest payloads and real
keyboard input (the attention-mode test selects the mode by focusing the select and pressing
`A`, not by a synthetic value assignment).

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[web-impl]** `focusNth`'s new doc comment says the order is "the same order the
   rail/strip currently display" — `web/src/main.ts:289`. True of the rail (both call
   `orderRail(store.values(), railSort)` over the same set), but the strip renders
   `orderRail(sessions.filter(s => !liveIds.has(s.id)), railSort)` (`main.ts:614`), i.e.
   the same order *minus the live tiles*, so in Tiles ⌘3 is not the strip's third card. One
   word: drop "/strip", or qualify it as "the rail's order (the strip shows that order minus
   the live tiles)". Behaviour is correct and matches the decision — this is comment
   accuracy only.

### Notes

1. **[note]** ⌘N in **Tiles** has no E2E assertion in any spec (`rg "Meta\+[0-9]"` hits only
   `views.spec.ts:110` and the four new `rail-order.spec.ts` tests, all in Focus view). This
   is a pre-existing gap, not one this cycle opened: the Tiles branch of `focusNth`
   (`promoteSession`) is unchanged, and promotion itself is covered by E7/E9 in
   `views.spec.ts`. Worth knowing if ⌘N is touched again.
2. **[note]** The decision's recorded dissent stands and is honestly logged: with Option A
   there is no keyboard path to SPEC §2.1's needs-input-first session in any mode (in
   Attention mode the pinned block still precedes it), and in Tiles ⌘N indexes an order
   whose `#rail-sort` control is hidden with the rail. `TODO.md` carries the "jump to
   neediest" follow-up. No change requested.
3. **[note]** Cycle 1's two `[daemon-impl]` Minors (`maxRailPosLocked`'s doc comment says
   "returns 1 + the largest" but returns the largest or `-1`; `handlePinSession`/
   `handleSetOrder` put `err.Error()` in the 500 body where the rest of the package sends a
   fixed string) were recorded in `TODO.md` rather than fixed, which is the sanctioned
   handling for Minors on an approved review. Re-listed here only so they are not lost — not
   re-routed.
4. **[note]** Doc upkeep from cycle 1's issue 2 is done and accurate: `SPEC.md` §2.1 now
   scopes the needs-input-first rule to Attention mode with a §11 changelog entry naming the
   decision; `ux-flows.md` §3.4/§3.5/§3.8 and `design-system.md` §4.1 all state that *n*
   counts the rail's displayed order; `TODO.md`'s "Pre-v1 Cleanup" sidebar item is ticked
   with the follow-ups spelled out. `docs/protocol.md`'s approved delta is already committed
   on this branch (`36eb355`), and the working tree is clean apart from the untracked
   `masthead.png` and `plans/new-session-dialog/`, both left alone per instructions.
