# Review: move-tiles

**Plan**: move-tiles
**Verdict**: approved

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 slot-stable `promote`/`applyDensity` | Yes — `live.ts` `promote` writes into `worstIndex` in place; shrink keeps `stillValid` order and filters by a `toKeep` set; grow/backfill appends by §3.4 | Yes — `live.test.ts` first/middle/last-slot demotions, W4 out-of-order shrink; E2E E7 | pass |
| REQ-2 priority change never moves a tile | Yes — nothing in the render path re-sorts `tilesLive` | Yes — INV-7 unit table (18 cases); E2E E5; hand-verified in browser | pass |
| REQ-3 pure `moveTile` | Yes — `live.ts:107` | Yes — forward/backward/adjacent/identity table (8 cases) | pass |
| REQ-4 header-only drag handle | Yes — `index.html` `.thead draggable="true"`; `dragstart` guarded on `closest(".thead")` | Yes — W9 check; hand-verified (`.tbody-slot` `draggable` is `null`, a body drag does not reorder) | pass |
| REQ-5 drop on a tile reorders | Yes — `tiledrag.ts` `drop` → `onMove` → `moveTile` + `render()` | Yes — E1, E2, E8 (negative), E9 | pass |
| REQ-6 visual drag feedback | Yes — `.dragging` / `.drop-target` added and cleared in `tiledrag.ts`; CSS uses `--line2` only | Yes — E4; hand-verified computed styles and cropped screenshots | pass |
| REQ-7 / INV-6 geometry-neutral | Yes — `surfaceDiff` is set-based, so a pure reorder yields empty open/close | Yes — E3 reads the tmux oracle fresh on both sides, 6/6 on repeat | pass |
| REQ-8 works daemon-down | Yes — order is client-only; drag wiring is independent of connection state | Yes — E9 (banner visible, drag still reorders) | pass |
| REQ-9 state dot hover label | Yes — `tiles.ts` `updateTileChrome` sets `.sdot.title = stateBadgeText(...)` | Yes — `tiles.test.ts` one case per §3.4 state + update-every-pass; E2E E10 | pass |
| REQ-10 focus survives a drop | Yes — pre-blur snapshot on `mousedown`, threaded through `onMove` into `reconcileTilesGrid`'s existing capture/restore; no second DOM mover | Yes — `tiledrag.test.ts` sequencing (4 cases); E2E E6 | pass |

## Build & Tests

E2E tests: **pass (104/104)** — full suite, `make e2e`, exit 0
Daemon tests: **pass** (`make test`, all packages ok)
Web tests: **pass (450/450)**, 18 files
Daemon build: **pass** (`go build ./...`)
Web build: **pass** (`tsc --noEmit` + `vite build`)
Lint: **pass** (`golangci-lint run` — 0 issues)

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass (450/450) |
| W9 | `test "$(rg -c 'draggable="true"' web/index.html)" = "1"` | pass |
| E1 | `make e2e` | pass (104/104) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W3 | `promote` demotes in place, first/middle/last slot | pass | `live.test.ts`: first-slot `promote([4,1,2,3],7)→[7,1,2,3]`; middle-slot `promote([1,4,2,3],7)→[1,7,2,3]`; last-slot `promote([1,2,3,4],7)→[1,2,3,7]`; plus the stale-id in-place case `[1,999,2]→[1,7,2]` |
| W4 | shrink keeps survivors' relative order | pass | `applyDensity([6,1,5,2,4,3],4,…)→[1,2,4,3]` — deliberately non-§3.4 input, survivors keep input order |
| W5 | INV-7 order-unchanged table | pass | 18 parameterized cases (6 states × first/middle/last slot) at capacity, all asserting `[1,2,3,4]` |
| W6 | forward/backward match Edge Case 2 | pass | `moveTile([1,2,3,4],1,3)→[2,3,1,4]`; `moveTile([1,2,3,4],4,2)→[1,4,2,3]`; plus both adjacent directions |
| W7 | identity for self / unknown ids | pass | three cases, each also asserting `result).not.toBe(input)` |
| W8 | no `any` in new web code | pass | grepped `tiledrag.ts`, `live.ts`, `tiles.ts`, `main.ts`, `tiledrag.test.ts` — only hits are the English word in comments/test names |
| W10 | `tiledrag.ts` boundary | pass | its only import is `./focus` (`captureFocusedControl`, `FocusedControl`); no `Session`, no store, no `protocol` import; it maps DOM → numeric ids and calls `onMove` |
| W11 | no state colour on drag feedback | pass | `style.css` drag rules use `--line2` only; **measured in the browser**: drop-target computed outline `rgb(52,58,74)` == `--line2` `#343a4a`; `.dragging` is `opacity: .6` (no colour at all) |
| E3 | tmux oracle read before *and* after | pass | `views.spec.ts` calls `daemon.tmuxDisplay(target, "#{window_width}"/"#{window_height}")` fresh on both sides into `widthBefore`/`heightBefore` maps; the footer string is used only for the settle-wait, never as the assertion |
| INV-7 coverage | every §3.4 state × first/middle/last slot | pass (see Minor 1 for the below-capacity half) | the 18-case table above |
| Doc upkeep | ux-flows §3.7 / design-system §4–§5 amended | pass | both amended in the working tree: ux-flows §3.7 now states slot-stable + header drag + per-window ephemeral order with the 2026-08-29 amendment note; design-system §4/§5 document the drag handle, `.dragging`/`.drop-target` neutral tokens, and the dot `title` |
| Doc upkeep | SPEC.md changelog / TODO tick | **not done** | see Major 1/2 — orchestrator-owned, non-blocking |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary (`internal/claudecode`) | pass — web-only plan; no Go file touched; no Claude-Code field names introduced |
| 2 | No terminal-output state parsing | pass — no `capture-pane` use added; tile state still comes from the session model |
| 3 | Non-blocking hook handler | pass — no ingest code touched |
| 4 | tmux always on a dedicated socket; no `resize-pane` | pass — no tmux invocation added; E2E reads only via the harness's per-run `-S` socket; `rg resize-pane` finds nothing new |
| 5 | No payload logging | pass — nothing logged |
| 6 | No empty-gauge dishonesty | pass — context row still renders `ctx unknown` (observed in the browser), untouched by this plan |
| 7 | Session identity on tmux target | pass — `tiledrag` keys on `dataset.sessionId`, which is Muster's own session id, not Claude's `session_id` |
| 8 | No settings trespass | pass — nothing reads `~/.claude/settings*.json`; no `CLAUDE_CONFIG_DIR` |
| 9 | No real `claude` outside canary/probes | pass — every new E2E test uses the harness stub binary |

Design-system §6 (honesty) and §7 (terminal) both clean: no gauge/cost/Done surface added; a reorder opens no socket (`surfaceDiff` is set-based, so an order-only change yields empty `toOpen`/`toClose`, and the existing INV-2 socket-count spec still passes), geometry is moved not duplicated (INV-3 spec passes), no `resize-pane`, xterm `scrollback` untouched, no styling applied to pane contents.

## Manual Verification

Drove the real dashboard in Chromium against a scratch daemon (four stub sessions, Tiles at 2×2) with a throwaway spec using **raw `page.mouse` steps** rather than `dragTo`, so the gesture matched a real user's, and read computed styles and attributes by hand at each stage. The spec was deleted afterwards; the tree is clean.

Confirmed by hand:

- **Drag handle scope** — the only `[draggable="true"]` elements inside `#tiles-grid` are the four `.thead`s; `.tbody-slot`'s `draggable` attribute is `null`. A drag started from a tile's terminal body and released on another tile left the order at `["rv-1","rv-2","rv-0","rv-3"]` — unchanged. (REQ-4)
- **Cursors** — `.thead` computed `cursor: grab`; the dragged tile's header computed `cursor: grabbing` mid-drag. (REQ-4)
- **Drag feedback, measured not assumed** — mid-drag the source tile `rv-0` carried `.dragging` with computed `opacity: 0.6`, and `rv-2` carried `.drop-target` with computed `outline: rgb(52, 58, 74) solid 1px`, `outline-offset: -1px`. `rgb(52,58,74)` is exactly `--line2` (`#343a4a`) — no state token anywhere near it. Cropped screenshots of the drop-target tile against an untouched control tile show the outline is genuinely visible (a lighter 1px edge the control tile does not have), and the dragged tile's header text is perceptibly dimmer. Both are quiet, which is consistent with the rest of the instrument palette. (REQ-6, W11)
- **Reorder result** — real-mouse drag of `rv-0`'s header onto `rv-2` took `["rv-0","rv-1","rv-2","rv-3"]` → `["rv-1","rv-2","rv-0","rv-3"]`, i.e. plan Edge Case 2's forward worked example exactly. Afterwards `article.tile.dragging` and `article.tile.drop-target` both had count 0. (REQ-3, REQ-5, REQ-6)
- **Priority change does not move a tile** — posting `SessionStart` + `UserPromptSubmit` + `Notification(permission_prompt)` at the first tile flipped its class to `tile s-blocked` and its dot's computed `background-color` to `rgb(242,163,60)` == `--amber` (`#f2a33c`), while the grid order stayed byte-identical to the pre-event order. (REQ-2)
- **Dot hover labels** — all four dots read `title="started"` initially; after the transition the titles read `["needs input","started","started","started"]`. (REQ-9)

Also re-ran the geometry spec that web-impl had flagged as flaky (`E1, E3, E4`) at `--repeat-each 6 --workers 3` after the e2e-specs repair: 6/6 pass, ~2.0s each. The repair moved only *when* the baseline is captured (`expectAllTileGeometrySettled` waits for all four tiles to agree with tmux in one poll callback); the assertion itself — `expect(widthAfter).toBe(widthBefore.get(t))` against a fresh tmux read on both sides — is unchanged. Repairs-table claim verified.

Also verified the `actions.spec.ts` retarget did not weaken anything: the old single test's focus-restore, Enter-still-operable and dialog assertions all carry over verbatim into the new REQ-10/E6 test, and the priority half became a strictly new REQ-2/E5 assertion. No `test.skip` / `test.fixme` / `.only` anywhere in `web/e2e` or `web/src`.

## Issues

### Critical

None.

### Major

1. **[orchestrator]** `SPEC.md` §11 changelog entry is missing — `rg 'move-tiles' SPEC.md` finds nothing. The plan's Doc-upkeep section specifies the exact line: "2026-08-29 — move-tiles: Tiles grid slot-stable + drag reorder; ordering decision amended; state dot already shipped, hover label added". Non-blocking (orchestrator-owned).
2. **[orchestrator]** `TODO.md` Pre-v1 Cleanup second bullet (line 397) is not ticked — it should be marked done, noting that the status dot was pre-existing and that the bullet's green/orange/red palette was deliberately not adopted (design-system §3: a state colour may only mean that state). Non-blocking (orchestrator-owned).

### Minor

1. **[web-tests]** The INV-7 table is at-capacity only. `live.test.ts`'s table pins `live=[1,2,3,4]`, `n=4` for all 18 cases; the plan's INV-7 source-state list says "at **and below** capacity". The below-capacity path is the grow branch (`result = [...stillValid]` then append), which structurally cannot reorder survivors, and the existing grow case `applyDensity([1,3], 4, …) → [1,3,2,4]` already pins order preservation for an out-of-§3.4-order input — so this is a table-completeness gap, not a behaviour gap. Three more cases (`live=[2,1]`, `n=4`, transitioning each slot) would close it.
2. **[web-tests]** `tiledrag.test.ts`'s third and fourth cases dispatch a `dragstart` with no preceding `mousedown` to model "a later drag". That sequence is unreachable in a real browser (a mouse drag always begins with a mousedown on the handle), so the framing overstates the hazard — though the assertion itself is still worth having, since it is the only thing pinning `clearDragState`'s unconditional `focusedBeforeDrag = null`. Worth a comment saying it is a defensive invariant rather than a reachable sequence.
3. **[web-impl]** `main.ts`'s `pendingTileFocus` is consumed inside `reconcileTilesGrid`, so if the post-drop `render()` ever skipped that function the snapshot would linger to the next Tiles pass. Unreachable today (a drop requires ≥2 live tiles, so the reconciler always runs) and harmless if reached (`restoreFocusedControl` no-ops when the element is gone or already focused), but clearing it in the `installTileDrag` callback's own `finally`-equivalent, or right after `render()`, would make the single-pass lifetime local rather than dependent on a callee.
