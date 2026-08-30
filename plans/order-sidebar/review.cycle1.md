# Review: order-sidebar

**Plan**: order-sidebar
**Verdict**: approved

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 per-session order fields | Yes (`store/session.go`, `session/session.go`, `manager.CreateSession`) | Yes (Go unit + E2), plus browser-measured (`railPos` 0,1,2,3 in creation order) | pass |
| REQ-2 order invariants | Yes (`railorder.go` rebuild) | Yes (`TestApplyPin/ApplyOrder_InvariantsHoldFromEveryStartingConfiguration`) | pass |
| REQ-3 pin | Yes (`applyPin`, `SetPinned`, `handlePinSession`) | Yes (D6/D7/D8 tests) + measured live | pass |
| REQ-4 order | Yes (`applyOrder`, `SetOrder`, `handleSetOrder`) | Yes (D9–D12 tests) + measured live | pass |
| REQ-5 rail sort pref | Yes (`prefs.go`, `state.go`) | Yes; `/api/state` returned `"railSort":"manual"` by default, `"attention"` after a PUT | pass |
| REQ-6 `orderRail` | Yes (`sessions/sort.ts`) | Yes (W3–W6, W9 in `sort.test.ts`) | pass |
| REQ-7 state change never moves a card in manual | Yes | Yes (E9) + measured: a `needs_input` `Notification` left the bottom card in place | pass |
| REQ-8 pin control on every card | Yes (`index.html` template, `render/sessions.ts`) | Yes (W13, E5) + measured aria-label/aria-pressed/reveal | pass |
| REQ-9 pinned block visual | Yes (`pinned`/`pinned-last`, 1px `--line2`) | Yes (W14) + measured computed border `1px solid rgb(52,58,74)` | pass |
| REQ-10 drag to reorder (manual only) | Yes (`dragreorder.ts`, `main.ts`) | Yes (E3, E11) + measured `draggable` flips true/false with the mode | pass |
| REQ-11 pure drop math | Yes (`sessions/railorder.ts`) | Yes (W7, W8 in `railorder.test.ts`) | pass |
| REQ-12 sort toggle in rail head | Yes (`#rail-sort`) | Yes (E10, E12) + measured persistence | pass |
| REQ-13 strip follows rail order | Yes (`renderTilesView` → `orderRail`; `renderStrip` forces `draggable=false`) | Yes (E14, W16) + measured strip order/pin/never-draggable | pass |
| REQ-14 remove/resume keep invariants | Yes (no rail writes on those paths; gaps tolerated) | Yes (`TestApplyOrder_EmptyIDsIsALiteralNoOpEvenWithGaps`, manager gap tests) | pass |
| REQ-15 daemon down | Yes (no optimistic state) | Yes (E16) + measured: daemon stopped, Pin click changed nothing, banner shown | pass |
| REQ-16 focus survives drop/pin | Yes (`pendingRailFocus`, pre-blur capture) | Yes (unit + E2E) | pass |
| REQ-17 pin button title | Yes (`Pin to top` / `Unpin`) | Yes (W13) | pass |

## Build & Tests

E2E tests: pass (136/136 — full suite, not just this plan's spec)
Daemon tests: pass (`make test` green across every package)
Web tests: pass (`make web-test`, 549 tests)
Daemon build: pass (`go build ./...`)
Web build: pass (`make web-build`, tsc + Vite)
Lint: pass (`make lint`, 0 issues)

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
| E1 | `make e2e` | pass (136 passed) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D5 | new session `pinned=false`, `railPos` > every existing | pass | four live launches returned `railPos` 0,1,2,3, `pinned:false`; `maxRailPosLocked()+1` under `m.mu` |
| D6 | pin → bottom of pinned block | pass | live: pinning id 3 then id 1 gave order 3,1; `TestApplyPin_PinMovesToBottomOfPinnedBlock` |
| D7 | unpin → top of unpinned block | pass | `applyPin` flips the flag inside the railPos-sorted candidate, so the unpinned target precedes every previously-unpinned entry; `TestApplyPin_UnpinMovesToTopOfUnpinnedBlock` |
| D8 | matching-flag pin is 204, broadcasts nothing | pass | short-circuit `current.Pinned == pinned → nil, nil` before rebuild; two gap-regression tests (both flag directions) |
| D9 | order applies ids/pinnedCount | pass | live drag produced `railPos` 0..3 in the dropped order; `TestApplyOrder_AppliesListedIDsAsPositionsAndFlags` |
| D10 | unknown/duplicate id → 400, nothing changes | pass | `TestApplyOrder_{Duplicate,Unknown}IDReturnsErrInvalidOrder`, `..._InvalidRequestChangesNothing`; validation runs before any mutation |
| D11 | `pinnedCount` out of range → 400 | pass | bounds check is the first statement in `applyOrder`; two tests |
| D12 | unlisted sessions keep flag, follow in relative order | pass | `TestApplyOrder_UnlistedSessionsKeepFlagAndFollowInExistingRelativeOrder` + `..._UnlistedPinnedBystanderIsPushedToEndOfPinnedBlockNotStranded` |
| D13/D14 | INV-1/INV-2 after every mutation, every starting config | pass | `assertInvariants` checks the **reconstructed full rail** (not just the diff) for uniqueness and pinned-before-unpinned; table covers none/all-unpinned/all-pinned/mixed × top/middle/bottom with bystanders |
| D15 | only changed sessions broadcast | pass | `diffChanged`; `TestApplyOrder_PartialChangeOnlyReturnsTheSessionsThatActuallyMoved` |
| D16 | `railSort` default/validation | pass | `defaultRailSort`/`validRailSort`; live `/api/state` default `"manual"`; 400 path in `handlePutPrefs` |
| D17 | `pinned`/`railPos` never written by the state machine | pass | `grep -rn "\.Pinned = \|\.RailPos = " internal/ --exclude tests` → only `railorder.go`, `manager.go`'s `applyRailChangesLocked`, and row scanning. No `Apply`/`ApplyStatus` path touches them |
| D18 | remove leaves others unchanged | pass | Remove has no rail code path; gaps tolerated and covered by the gap tests |
| W3–W6 | `orderRail` orderings | pass | read `sort.ts`; pinned filtered/sorted by `railPos`→`id`, unpinned by `railPos` (manual) or `sortSessions` (attention) |
| W7/W8 | `moveCard` semantics | pass | read `railorder.ts`; target index read from the *original* array (matching `moveTile`), dragged entry inherits `target.pinned`; `null` on self-drop/absent id |
| W9 | no input mutation | pass | `filter()`/spread produce new arrays throughout both functions |
| W10 | no `any` in new web code | pass | grepped every file in `web-implementation.md` for `: any` / `as any` / `<any>` — 0 hits |
| W12 | `tiledrag.test.ts` unchanged | pass | file absent from `git diff main...HEAD`; suite green |
| W13/W14 | pin attrs and `pinned-last` | pass | measured in the browser on build and across a pin transition; `pinned-last` moved to the newly-last pinned card |
| W15/W16 | `draggable` per mode / strip never draggable | pass | measured `drag=true` in manual, `drag=false` in attention, `drag=false` on every strip card |
| W17 | pin click doesn't focus/promote | pass | `stopPropagation` in the build-time listener; measured — focused session stayed `alpha` across a pin |
| W18 | neutral tokens only | pass | read `style.css`: `--dim`, `--paper`, `--line2`, `--muted`, `--mono` only; no state colour, no hex literal, no web font |
| E2–E16 | Playwright specs present and green | pass | 18 specs in `rail-order.spec.ts`, one per criterion; whole suite green |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary (`internal/claudecode/`) | pass — no Claude-Code field names in any new file |
| 2 | No terminal-output state parsing | pass — no `capture-pane` in the diff |
| 3 | No blocking hook handler | pass — ingest untouched |
| 4 | tmux via dedicated socket, no `resize-pane` | pass — no tmux code in the diff |
| 5 | No payload logging | pass — the two new `log.Error()` calls carry `session_id` only |
| 6 | No empty-gauge dishonesty | pass — no gauge or value display added |
| 7 | Session identity on tmux target | pass — identity untouched |
| 8 | No settings trespass | pass |
| 9 | No real `claude` outside canary | pass — E2E uses the `-claude-bin` stub |

Design-system §6 (honesty) and §7 (terminal) sweeps: nothing in this plan renders a
value, opens a client, or touches geometry. One live client per session held throughout
the manual session (verified in the mainhead's `one live client · geometry owned by this
pane` readout).

## Manual Verification

Booted a scratch `musterd` (own port, own data dir, own tmux socket path, stub
`-claude-bin`), launched real sessions through `POST /api/sessions`, faked Claude Code
with synthesized hook POSTs, and drove the dashboard in Chromium.

- **Creation order** — four launches returned `pinned:false`, `railPos` 0,1,2,3; the rail
  rendered them in that order with `Manual` selected and `draggable="true"` on each.
- **Pin** — clicking Pin on card 3 moved it to the top with `class="card s-start pinned
  pinned-last"`, `aria-label="Unpin"`, `aria-pressed="true"`; the focused session stayed
  `alpha`. Pinning card 1 next placed it *below* card 3 and moved `pinned-last` to it.
- **Pinned-block rule** — computed style on `.pinned-last` is `1px solid rgb(52,58,74)`
  (`--line2`), against `rgb(40,45,59)` on an ordinary card divider. Neutral, not a state
  colour. (See Notes 1 on how weakly this reads.)
- **Attention mode** — after a `Notification` made `delta` `needs_input`, selecting
  `Attention` moved it above `beta` while `gamma`/`alpha` stayed pinned on top, and every
  card flipped to `draggable="false"`. Switching back to `Manual` returned `delta` to its
  opened slot — REQ-7 confirmed against a real state change.
- **Drag** — a real `dragTo` of `delta` onto `beta` produced daemon-side `railPos`
  0 gamma(P), 1 alpha(P), 2 delta, 3 beta. A second drag of `beta` (unpinned, bottom) onto
  `gamma` (pinned, top) pinned it at position 0 — cross-boundary pin-at-drop confirmed.
- **Invariants, live** — after every mutation the `/api/state` set had unique `railPos`
  and every pinned session below every unpinned one (checked programmatically).
- **Persistence** — a full page reload reproduced the order and `Manual` selection.
- **Strip** — in Tiles, the two non-live sessions appeared in rail order, never
  `draggable="true"`, each with a working pin button; pinning from the strip pinned the
  session and drew the strip's vertical `--line2` rule on `pinned-last`.
- **Daemon down** — with `musterd` killed, a Pin click left the card unpinned, the order
  unchanged, and the `musterd unreachable` banner visible.
- **⌘1 divergence** — see Major 1: measured, with the rail showing `one, two, three` and
  `three` in `needs_input`, ⌘1 focused `three`, not the top card.

Scratch daemon, tmux server, scratch repos and the screenshot were all removed afterwards;
`git status` shows only the pre-existing untracked `masthead.png` and
`plans/new-session-dialog/`.

## Issues

### Critical

None.

### Major

1. **[orchestrator:decision]** ⌘1–9 no longer selects the card the user sees. `focusNth`
   (`web/src/main.ts:290`) still ranks by `sortSessions`, while the rail, strip and
   default-focus pick now go through `orderRail`. Measured: rail showing `one, two, three`
   in manual order with `three` in `needs_input` — ⌘1 focused `three`. Before this plan the
   two orders were the same function, so the shortcut and the rail could not disagree;
   ux-flows §3.8 and design-system §4.1 both describe it as "focus session *n*".
   web-impl flagged this explicitly and implemented REQ-6 literally (it names exactly three
   consumers), which was the right call for an impl agent — the choice is yours:
   - **Option A — ⌘N follows the rail**: change `focusNth` to `orderRail(store.values(),
     railSort)`. One line. Restores "⌘N = the nth card I can see" in both modes, which is
     the mental model the manual order exists to create; costs the current quick jump to
     the most-blocked session (⌘1 no longer means "whatever needs me most").
   - **Option B — ⌘N stays attention-ranked**: leave `focusNth` on `sortSessions` and
     document it in ux-flows §3.8 as "the nth by attention, independent of rail order".
     Zero code; keeps a one-key jump to the neediest session; costs the correspondence
     between the shortcut and the visible rail, and the docs currently say otherwise.

2. **[orchestrator]** Plan doc upkeep not yet done (the plan assigns it to you, not to the
   impl agents): `TODO.md`'s "Pre-v1 Cleanup" sidebar bullet (line 396) is unticked;
   `SPEC.md` has no changelog entry for "rail order is user-owned; §2.1's
   needs-input-first sort is now the rail's *attention* mode (default manual)";
   `docs/design/ux-flows.md` §3.4 has no note that the order it describes is the attention
   mode, and §3.5's "Everything else is a snapshot card in the strip, still §3.4-sorted"
   (line 269–270) now contradicts REQ-13 — the strip follows the rail order.
   `docs/protocol.md` §3.3/§3.10/§3.11/§5.3 **are** merged and committed on the branch.

### Minor

1. **[daemon-impl]** `maxRailPosLocked`'s doc comment says it "returns 1 + the largest
   RailPos among known sessions, or 0 when there are none" — it returns the largest itself,
   or `-1` when there are none; the `+1` is the caller's
   (`internal/session/manager.go:718-729`, called at `:177`). Behaviour is correct; the
   comment describes a different function. Fix the comment (or fold the `+1` in and rename).

2. **[daemon-impl]** `handlePinSession` and `handleSetOrder` put `err.Error()` into the
   500 response body (`internal/server/sessions.go:429` and `:459`). Every other
   `internal_error` in the package sends a fixed string (`"persisting prefs"`,
   `"could not list repos"`, …), and the wrapped error here carries a session id and a
   SQLite message. Use a static message and keep the detail in the `s.log.Error()` line
   that already precedes it.

### Notes

1. **[note]** The pinned-block boundary reads very weakly. `--line2` (`#343a4a`) on
   `.pinned-last` sits directly against the ordinary inter-card divider (`#282d3b`) —
   1px against 1px, adjacent hues, measured in the browser. This is exactly what REQ-9
   specified ("the observable is a 1px `--line2` rule below the last pinned card"), so it
   is not a defect; recording it in case the block turns out to need a stronger separator
   (a gap, not a brighter colour — brighter would start competing with state).

2. **[note]** `CreateSession` computes `max(railPos)+1` under `m.mu`, then releases the
   lock before the insert, so two concurrent launches could in principle read the same max.
   daemon-impl documented the choice; single-user tool, launches are one UI click at a
   time, and a duplicate `railPos` would be repaired by the next pin or drop. Fine as is.

3. **[note]** `persistAndBroadcastRail` is a per-row loop, not a transaction: a persist
   failure mid-batch leaves earlier rows persisted and broadcast. Matches every other
   multi-row path in `manager.go`, and the failure mode is a should-never-happen SQLite
   write error.

4. **[note]** `pendingRailFocus` is consumed by whichever render runs next rather than a
   render the drop itself triggers (there is no optimistic reorder to trigger one). If the
   `PUT /api/sessions/order` round-trip is slow, an unrelated 1s tick can consume the
   snapshot first; `restoreFocusedControl`'s "already focused" guard makes that harmless.
   Documented by web-impl.

5. **[note]** `test-specs.md`'s five repairs all check out: each added `railSort:"manual"`
   to a `toEqual` fixture or gated a pre-existing ordering assertion on `Attention` mode
   (the mode this plan moved that ordering into). Every original assertion survives
   verbatim — I read all five diffs. No `test.skip`/`test.fixme`/`.only` anywhere in the
   branch diff, and the Go fixture repairs are likewise purely additive.
