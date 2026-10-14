# Review: rail-card-organise

**Plan**: rail-card-organise
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 1 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser approved, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Rail card menu, drag into groups, and cache warmth

**Plan**: rail-card-organise
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 62081 words (budget 30000)

The verdict is `needs-changes` for one reason: a red gate line, K1 `make check-kb`. That line
belongs to `[orchestrator]` and is waiting on the developer. No issue is tagged to a pipeline
agent. Every must-have requirement is implemented and tested, the protocol contract matches on
both sides, and the hard-rule checklist is clean. The Majors below are all `[orchestrator]` doc
work.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes — `render/sessions.ts` `contextmenu` → `preventDefault` + `onMenu`; `features/railmenu.ts`; strip via `render/tiles.ts` | E2E rail-menu (live menu, `defaultPrevented`; strip menus) | pass |
| REQ-2 | Yes — `railmenuitems.ts` + `groups.moveToEntries`; order: actions, sep, Move to, groups, New group…, sep, No group, sep, Pin/Unpin | W5 unit; E2E E1/E2 | pass |
| REQ-3 | Yes — `canResume(claudeSessionId)` gates the Resume… push (absent, not disabled) | unit + E2E `toHaveCount(0)` | pass |
| REQ-4 | Yes — `actions.dispatch`: end/remove open the Focus header's dialogs; Resume acts at once like the header's (see Note 3) | E2E Stop…/Remove…/Resume… tests | pass |
| REQ-5 | Yes — Move to entries come from the one `moveToEntries` builder; Pin dispatches `pin` → `doPin(!pinned)` | E2E Move to / New group… / No group, Pin/Unpin with bystanders | pass |
| REQ-6 | Yes — `.acts-row` gone from `session-card-template`; `reconcileActsRow` removed; pin stays | E2E INV-3 rail + strip; adapted rail-cards / focus-marker | pass |
| REQ-7 | Yes — `contextmenu` is independent of selection | E2E Select-mode menu | pass |
| REQ-8 | Yes — `menu.ts` `at` path closes before reopening (replaces, never toggles); Escape → `close(true)` focuses the card | E2E Escape/replace, outside click, rail ⋯ open | pass |
| REQ-9 | Yes — `isMenuKey` (ContextMenu, Shift+F10) on the card; first enabled item focused | E2E keyboard walk + tick survival | pass |
| REQ-10 | Yes — `cardMenuItems` disables every item when not connected; Move to entries take `disabled` | W5 unit; E2E E6 | pass |
| REQ-11 | Yes — `railmenu.ts` closes on `sessionRemoved` for `openFor` | E2E E8 | pass |
| REQ-12 | Yes — `rail.ts` `drop` → `planDrop`; header/body → section target, card → card target | W6 unit; E2E attention + manual drops | pass |
| REQ-13 | Yes — attention card drop → `groupMove` (pin kept); same-section drops plan `null` | W6; E2E E10, own-section no-op | pass |
| REQ-14 | Yes — manual among-cards → `moveCard` → `PUT /api/sessions/order` with `groupId`; manual header/body drop stays on `sessions.group` as today (orchestrator call; see Major 4) | W6; E2E manual order body | pass |
| REQ-15 | Yes — `draggable` = `!selecting` or selected; a press with no movement is the existing click toggle | E2E E11/E12 (both sorts) | pass |
| REQ-16 | Yes — `carriedBy` returns the selection; `moveCard` riders land together in display order | W6 multi-id; E2E contiguous + cross-group with an ended session | pass |
| REQ-17 | Yes — outside Select mode the carried set is just the dragged card | E2E REQ-17 test | pass |
| REQ-18 | Yes — `planDrop` returns null for own card or carried target; disconnected returns early; outside the rail never reaches `onMove`/`onDropZone` | E2E four no-op drags (both sorts) | pass |
| REQ-19 | Unchanged header drag in `groups.ts` | existing groups.spec.ts (E20), green in the sweep | pass |
| REQ-20 | Yes — `moveSessions`/`reorderSection` settle through `groups.settle` into `#action-error` (before this change the rail's order call had no `settle`) | E2E E13 (both sorts) | pass |
| REQ-21 | Yes — `claudecode.interpretPromptCache` (integer `expires_at`, `<digits><s\|m\|h>` > 0); `adoptCache` keeps the value on a nil reading | D1 30-row table; D2 tests; ingest route test | pass |
| REQ-22 | Yes — the column is persisted (0014); only `applyBind`'s rebind block sets `Cache = nil` | D5/D6 cross-state walks; manager lifecycle test; E2E kept/cleared | pass |
| REQ-23 | Yes — `beforeCache != sess.Cache` (pointer identity; `adoptCache` reallocates only on a real change, using `Equal`) | D3/D4 manager tests; E2E upsert count | pass |
| REQ-24 | Yes — `--warmth` + `color-mix(in oklab, var(--fg) …, var(--fg-dim))` on rail/strip `.card .timer`; ended included | E2E E14, straight line, every state, strip | pass |
| REQ-25 | Yes — `remaining*100 <= ttl*15` and `remaining > 0` → `cooling` + dotted underline | W1/W2; E2E 15% boundary | pass |
| REQ-26 | Yes — null → `unknown`, no `--warmth`, base `--fg-dim` | W3; E2E E16 | pass |
| REQ-27 | Yes — `remainingText` (see Note 2 on the sub-second window below 60 s) | W1 table; E2E 61/60/59 s | pass |
| REQ-28 | Yes — derived from `now` on every render pass; nothing reads the socket | unit "fades with the clock alone"; E2E daemon down | pass |
| REQ-29 | Yes — `headerTimer`: alive idle/needs_input/failed, latest `stateSince`; `.gsum .gt` removed when none | W4; E2E E18 incl. collapsed | pass |
| REQ-30 | Yes — `groupWarmthHover` counts known-warmth members only; three texts | W4; E2E hover test | pass |
| REQ-31 | Yes — `popoverModel(section, now)` rows `{title, timer, warmth}`; `.pl .tt` with `data-cache`, no `title` | sections unit; E2E E19 | pass |
| REQ-32 | Yes — store round trip + snapshot | D7; E2E E15 | pass |
| REQ-33 | Yes — `TestPromptCacheExpiryIsStopPlusTTL` reads ttl through `claudecode.InterpretStatus` | compiled; `go vet -tags canary ./test/canary/` clean (my run); not run against a real `claude` (canary tier) | pass |
| DIAG | domain-model (updated, matches the plan delta); **store-schema stale**; **web-components stale**; daemon-components unaffected | — | fail (Major 1) |

## Build & Tests

E2E tests: pass (840 passed, `17-e2e.log`) · Daemon tests (race): pass (24 packages `ok`, no FAIL, `02-test.log`) · Web tests: pass (2617 in 93 files, `05-web-test.log`) · Daemon build: pass (`01-build.log` empty, exit 0) · Web build: pass (`04-web-build.log`) · Lint: pass (golangci `0 issues.`; web-lint `No fixes applied`) — all read from $GATES_LOG_DIR

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| build | `go build ./...` | pass |
| test | `make test-race` | pass |
| lint | `make lint` | pass (`0 issues.`) |
| web-build | `make web-build` | pass |
| web-test | `make web-test` | pass (2617) |
| web-lint | `make web-lint` | pass |
| contrast | `make contrast` | pass (instrument/dark/light: 46 pairs, 0 failures) |
| features-inventory | (baseline) | pass (empty log) |
| versions | `make check-versions` | pass (all fragments fresh) |
| e2e-honest | (baseline) | pass (empty log) |
| kb-check | `make check-kb` | **FAIL**: 2 fact records claim `verified` up to 2.1.300, above the ceiling 2.1.296 (Critical 1) |
| e2e-lint | `make e2e-lint` | pass (`e2e-lint: clean`) |
| features | features-scope | pass |
| comments | comment-checks | pass |
| comment-ledger | comment-pass verify | pass (8 blocks, all kept) |
| size | size-warn | WARN, 7 hits (review-maintainability's) |
| e2e | `make e2e` | pass (840) |
| D1 | `make test` | pass (deduped to `make test-race`) |
| D2 | `make lint` | pass (deduped) |
| D3 | `go build ./...` | pass (deduped) |
| D9 | `! rg -n '"(prompt_cache\|expires_at)"' cmd/ internal/ --glob '!internal/claudecode/**'` | pass (`18-D9.log` empty, exit 0) |
| W1 | `make web-test` | pass (deduped) |
| W2 | `make web-build` | pass (deduped) |
| E1 | `make e2e` | pass (deduped) |
| K1 | `make check-kb` | **FAIL** (deduped to kb-check; Critical 1) |
| DOC | doc upkeep + Doc Delta vs what shipped | FAIL: two stale diagrams (Major 1); web-impl `doc-delta:` lines not reflected in the plan's Doc Delta (Major 3). The 4 proposed ADRs are present with `refs: plan:rail-card-organise`; there are no `deviation:` lines; the fact guard is set; TODO ticks correctly wait for approval. Every plan Doc Delta assertion is supported by the code |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W7 | no `any` in new web code | pass | `git diff main..HEAD -- 'web/src/**/*.ts' \| grep '^+' \| grep -E '\bany\b\|as unknown\|innerHTML'` → no hits |
| W8 | tint uses `:root` tokens, no hard-coded white; Light reads dark→grey | pass (code) | `style.css` warmth rule mixes `var(--fg)` and `var(--fg-dim)` with no literal. The Light theme was not measured in a browser (web-impl says so); that is review-browser's |
| W9 | no state colour for warmth | pass | no `--amber`/`--rose`/`--violet`/`--teal` or state token in the warmth rules; `make contrast` green |
| W10 | card menu built by `render/menu.ts` | pass | `railmenu.ts` uses `createMenu()` from `render/menu.ts`; Move to entries come from the one `groups.moveToEntries`; no second builder |
| D10 | REQ-33 reads `ttl` through Muster's interpreter | pass | `test/canary/canary_test.go:473` `claudecode.InterpretStatus(c.ev.Payload).Cache`, `TTLSeconds` drives the expected expiry |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: D9 green; the cache is the neutral `StatusCache`/`session.Cache`/`expiresAt` outside `internal/claudecode`; the raw key appears only in `test/canary/` and in e2e fixtures |
| 2 | Terminal-output state parsing | pass: no `capture-pane` or pane-text read added |
| 3 | Blocking hook handler | pass: no hook path changed; status adoption rides the existing async apply |
| 4 | Bare tmux / resize-pane | pass: no tmux invocation added |
| 5 | Payload logging | pass: no new logging in `claudecode/status.go` or `session/status.go` |
| 6 | Empty-gauge dishonesty | pass: null cache → `data-cache="unknown"`, `cache unknown`, plain timer; never reads as cold |
| 7 | Identity on `session_id` | pass: the cache keys on the Muster session; a rebind clears it, nothing keys on it |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary | pass: only `test/canary/` (haiku harness), and it was not run in this cycle |

## Delta (delta re-review only)

Not a delta cycle.

## Issues

### Critical
1. **[orchestrator]** Gate line K1 / kb-check `make check-kb` FAIL. `docs/facts/haiku-main-cache-ttl-5m-on-2-1-299.md` and `docs/facts/resume-reads-prior-prompt-cache.md` claim `verified: 2.1.299..2.1.300`, above the ceiling 2.1.296 in `internal/claudecode/observed_versions.txt`. Both records were written at planning. The fix is the developer's call: either a green `make canary` on 2.1.300 through `/claude-code-upgrade`, which raises the ceiling, or a change to how those two facts record their range. This is already with the developer; it is not routed to any agent.

### Major
1. **[orchestrator]** DIAG: two diagrams are now wrong about what shipped.
   - `docs/diagrams/store-schema.md`: the summary and body say "after migrations 0001-0013", and the `session` entity has no `cache_expires_at TEXT "0014, NULL = unknown"` or `cache_ttl_seconds INTEGER "0014"`. `kb for internal/store/migrations/0014_prompt_cache.sql` names this record.
   - `docs/diagrams/web-components.md`: its counts matched `main` exactly and are now stale. `main.ts` "inits 18 controllers" is now 19 (`initRailMenu`). `features/` "34 modules … 18 stateful … 12 DOM-free helpers" is now 36, 19 and 13 (`railmenu.ts`, `railmenuitems.ts`). `render/` 37 is now 38 (`warmth.ts`). `sessions/` 14 is now 15 (`cache.ts`).
   - The plan's `## Diagrams` delta named only domain-model, which shipped correctly.
2. **[orchestrator]** `docs/design/design-system.md` is false about shipped behaviour in three places:
   - `:213-214`: the `current` card has "its action row shown unconditionally". No card has an action row now.
   - `:218-219`: in select mode every card "loses `draggable`". A selected card is now `draggable="true"`.
   - §5 Menu `:300-304`: the menu is "anchored below its opener" and "the opener carries `aria-haspopup="menu"` and `aria-expanded`". The card menu opens at a point (pointer, or under the card's top-left for the keyboard), names itself `Actions for <title>`, and the card carries neither attribute (`render/menu.ts` `at` branch).
   - `doc-reconcile` does not own `docs/design/`, so this is orchestrator doc work.
3. **[orchestrator]** `web-implementation.md` has three `doc-delta:` lines that the plan's `## Doc Delta` does not reflect, and there is no `plans/rail-card-organise/doc-delta.md` amendment:
   - (a) the design-system statements in Major 2;
   - (b) the groups sentence "a drag released where it started changes nothing": in Select mode a press released without moving is the toggle click, so only a real moved-and-returned drag is a no-op (this is what the repaired E2E spec measures);
   - (c) the popover and header markup (`.pl`/`.pt`/`.tt`, `.gsum .gt`).
   Each needs a disposition (amend, or record "no spec change") before `doc-reconcile` promotes the delta verbatim.
4. **[orchestrator]** The proposed ADR `docs/adr/rail-cards-drag-in-both-sort-modes-selection-together.md` describes something other than what shipped. It says "In manual mode the drop also sets position and pin (`kb:anchor/sessions.order` with `groupId`), as before". What shipped, by the orchestrator's call and as before: a manual-mode drop on a header or section body goes through `kb:anchor/sessions.group` (end of section, pin kept). Only a drop among a section's cards uses `sessions.order` (`sessions/railorder.ts` `planDrop`: a section target always returns `groupMove`). REQ-14 has the same ambiguity. Amend the ADR sentence to "a drop among a section's cards also sets position and pin; a header drop joins at the section's end with its pin kept".

### Minor

None.

### Notes
1. **[note]** `test/canary/canary_test.go:457`: the comment says the test reads "the first post carrying the key". The loop actually skips any post whose `prompt_cache` the interpreter rejects and asserts on the first one it accepts. So a first post with an unreadable `ttl`, followed by a readable one, passes.
2. **[note]** `web/src/sessions/cache.ts` `remainingText` rounds up before comparing, so between 60 s and 59 s remaining (fractional, because the page clock is in ms) the hover reads `cold in 1m` rather than seconds. `cache.test.ts` pins this as `[59.2, "1m"]`. REQ-27's "≥ 60 s" reading would give seconds; it is a one-second window that can also be read as "rounded up". No change requested.
3. **[note]** REQ-4 says `Resume…` opens "the same confirm dialog the Focus header opens". The header's Resume has none, so `Resume…` acts at once, by the orchestrator's call and pinned by rail-menu.spec.ts. The ellipsis in the pinned label `Resume…` normally signals a dialog. The plan wording and the label stay as they are unless the developer wants a confirm.
4. **[note]** `docs/references/data-model.md:26-31` lists the `session` columns and omits the two new cache columns. It already omitted several earlier ones (`claude_dir`, `unread`, …), so this is not a new falsehood.
5. **[note]** W5's in-flight disable (`actions.inFlight` → `cardMenuItems.busy`) is covered by the pure `railmenuitems.test.ts` only. E2E declined it with a reason (test-specs Handoff 6). The wiring is a single `Set` read on open.
6. **[note]** Repairs honesty checked: all 7 rows in `test-specs.md ## Repairs` keep their requirement's assertion. Row 2 swaps the endpoint to the sanctioned one and still pins the carried set. Row 4's `dragWithin` was proven red against a sabotaged `dragstart`. No assertion was weakened, and the e2e `prompt_cache` block matches kb:fact/prompt-cache-status-shape key for key.
7. **[note]** For review-maintainability: `16-size.log` WARNs (`claudecodetest.go` 641 lines, `features/groups.ts` 507, the funlen hits) come with the implementers' reasons in their logs.
8. **[note]** The review pack is 62081 words against a 30000 budget (features 21081, decisions 15290, facts 14249).

## Browser review

# Browser review: Rail card menu, drag into groups, and cache warmth

**Plan**: rail-card-organise
**Part verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 13140 words (budget 30000)
**Rig**: `make web-build build` at 063587c0 (dirty: `orchestration-state.json` only) → `bin/musterd`, driven per test through `web/e2e/helpers/fixtures.ts` `daemon` (data dir `$TMPDIR/muster e2e-XXXX`, space-bearing; private `-tmux-socket` per run, killed at teardown), stub `claude` at `$TMPDIR/muster e2e-stub-cd75a542396fd84f`; headless Chromium, throwaway spec `web/e2e/zz-review-browser.spec.ts` (deleted; `git status --porcelain` shows nothing of mine).

Gates log read, not re-run: `17-e2e` 840 passed, `04-web-build` green, so the app I drove is the one that ships. The one red line, `11-kb-check` (two fact records' verified bound 2.1.300 > ceiling 2.1.296), is orchestrator-owned and has nothing visible in the app.

Hosts: **focus** = the Focus view's rail; **tiles** = the Tiles strip (the plan scopes strip cards to the menu and the timer; groups, headers, popovers and drag do not exist there, kb:spec/groups "the Tiles grid and strip ignore groups", Out of scope "Drag in the Tiles strip"); **pop-out** = `/doc.html`, which renders no session cards, headers or menus, so every pop-out cell is N/A for that reason and not repeated below. States: **none** = no data yet (empty rail, or `cache` null); **data**; **down** = scratch daemon SIGTERMed (`daemon.kill()`).

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | focus | data | right-click opens the card menu, at the pointer, inside the viewport | pass | `role=menu` "Actions for rb-live-a", display block/visible/opacity 1; box 149,217–339,435 in vp 1280×720; the ended card's menu was clamped to bottom 712 ≤ 720−8 |
| REQ-1 | focus | data | menu at the viewport's bottom edge stays inside it | pass | vp 1000×480, right-click at y 476 on a card cut off at 480: menu 293,227–483,472 (clamped), menu is not a scroller (sh 243 = ch 243) |
| REQ-1 | tiles | data | strip card right-click opens the menu inside the viewport | pass | strip 0,605–1280,720; card 0,606–640,720; menu 319,548–509,712 |
| REQ-1 | focus/tiles | none | — | N/A — no card exists with no session; `nodata-empty`: 0 cards, 0 menus, 0 `.gt` |
| REQ-2 | focus | data | live: Stop… / groups in rail order / New group… / No group / Pin; tick on the current group | pass | items `Stop…, review(aria-current=true), docs, New group…, No group, Pin` |
| REQ-2 | focus | data | ended: Resume…, Remove…, Move to, Pin; no Stop… | pass | items `Resume…, Remove…, review, docs, New group…, No group(current), Pin` |
| REQ-2 | tiles | data | strip menu lists the same entries | pass | `Stop…, New group…, No group(current), Pin` (no groups exist in that test) |
| REQ-3 | focus | data | Resume… absent without a Claude id | N/A here — covered by `rail-menu.spec.ts` (green at gate); not re-measured, see Note 4 |
| REQ-4 | focus | data | Stop… opens the Stop confirm; Cancel sends nothing and the session stays alive | pass | dialog "Stop session? rb-live-c — …" box 420,262–860,458; after Cancel `/api/state` alive true |
| REQ-4 | focus | data | Remove… opens the Remove confirm; Cancel sends nothing | pass | dialog "Remove session? rb-mx-ended — …"; 0 mutations after Cancel |
| REQ-4 | focus | data | Resume… acts | pass (see Note 2) | one `POST /api/sessions/3/resume`, 0 dialogs; the Focus header's own control reads `Resume` and opens none either |
| REQ-4 | tiles | data | Stop… from the strip menu by keyboard opens the confirm | pass | Enter on the focused `Stop…` → 1 dialog "Stop session? rb-strip-0 …" |
| REQ-5 | focus | data | Move to → a group by keyboard moves only that session | pass | Shift+F10, ArrowDown to `docs`, Enter: `/api/state` rows `[1,2]`; bystanders `[2,null]`, `[3,null]` unchanged; focus back on the card |
| REQ-5 | focus | data | Pin by pointer acts as the pin control | pass | `/api/state` pinned true; card `.pin` aria-pressed "true"; next menu reads `Unpin` |
| REQ-6 / INV-3 | focus | data | no Stop/Resume/Remove button on a live or ended card, plain, hovered (settled 600 ms) or focused | pass | every card's only button is `Pin` (opacity 0 plain, 1 hovered) for live A, ended B, live C |
| REQ-6 / INV-3 | tiles | data | none on a strip card, live or ended, hovered | pass | live strip card and ended `rb-td-ended` strip card: only `Pin` |
| REQ-7 | focus | data | right-click in Select mode opens the single-session menu, selection unchanged | pass | `#select-bar .cnt` "1 selected" before and after; menu "Actions for rb-live-c" |
| REQ-8 | focus | data | Escape closes and returns focus to the card, held across a tick | pass | activeElement `ARTICLE[data-session-id=1]`, same marked node after 1.3 s |
| REQ-8 | focus | data | a second right-click replaces the menu | pass | one menu, label changed to "Actions for rb-live-c" |
| REQ-8 | focus | data | right-click while the header ⋯ menu is open replaces it | pass | header menu (Rename…Delete group…) → one menu "Actions for rb-live-c" |
| REQ-8 | focus | data | a click outside closes | pass | 0 menus after a click at 1260,700 |
| REQ-8 | tiles | data | Escape returns focus to the strip card | pass | activeElement `ARTICLE[data-session-id=1]` in the strip |
| REQ-9 | focus | data | Shift+F10 opens with the first item focused, focus held across a tick | pass | activeElement `menuitem "Stop…"`, same marked node after 1.3 s; menu 16,291 under card bottom 287 |
| REQ-9 | focus | data | the ContextMenu key opens it | pass | menu open, activeElement `menuitem "Stop…"` |
| REQ-9 | focus | data | Shift+F10 on a card cut off at the viewport bottom: menu inside the viewport | pass | vp 1000×480, card 341–480: menu 16,227–206,472 (clamped; see Note 1) |
| REQ-9 | tiles | data | Shift+F10 on a strip card, first item focused across a tick | pass | `menuitem "Stop…"` before and after 1.3 s; menu 16,548–206,712 |
| REQ-10 | focus | down | every item disabled; a menu open at the kill closes | pass | open menu closed when the daemon died (0 menus); reopened: 5/5 items `disabled`, colour rgb(90,96,112), cursor default; a forced click sent 0 requests |
| REQ-10 | tiles | down | every strip-menu item disabled | pass | `Stop…, New group…, No group, Pin` all `disabled` |
| §6.7 | focus/tiles | down | daemon-down shown loudly | pass | `role=alert` "musterd unreachable — hook output in open panes is Muster's absence, not session failure." display block/visible/opacity 1, box 0,46–1280,78 |
| REQ-11 | focus | data | a session removed while its menu is open closes the menu | pass | after `DELETE /api/sessions/{id}`: 0 menus, 0 cards for it |
| REQ-12/13 | focus | data | attention: a drop on another group's header joins it through one group request | pass | real mouse drag; `PUT /api/sessions/group {ids:[1],groupId:2}`; header got `.drop-target` during the drag; section bravo DOM `[1,3]` = oracle |
| REQ-13 | focus | data | attention: a drop inside the card's own section sends nothing, nothing moves while dragging | pass | bravo DOM `[1,3]` before, during dragover and after; 0 requests |
| REQ-14 | focus | data | manual: a drop among a section's cards sets group and position | pass | drop on C's upper half: `PUT /api/sessions/order {ids:[2,1,3],pinnedCount:0,groupId:1}`; alpha DOM `[2,1,3]` matches the oracle |
| REQ-15 | focus | data | Select mode: unselected `draggable="false"`, selected `"true"`; a real press-and-drag on an unselected card starts no drag | pass | attrs false → true after the click; manual mouse drag on unselected D: 0 `dragstart`, 0 requests (see Note 3) |
| REQ-16 | focus | data | a selection (one ended, from two groups) dropped on a header moves all of it; mode and selection stay | pass | `PUT /api/sessions/group {ids:[2,5],groupId:3}`; `/api/state` both in 3; "2 selected" after |
| REQ-17 | focus | data | outside Select mode a drag carries one card | pass | the REQ-12 drop listed `ids:[1]` only |
| REQ-18 | focus | data | a drag released outside the rail changes nothing | pass | drop at 800,400 in the main slot: 0 requests, 0 `.dragging` left |
| REQ-18/E12 | focus | down | a drag while the daemon is down sends nothing | pass | 0 requests; the card is not in the target section |
| REQ-19 | focus | data | headers reorder by drag in attention order | pass | `PUT /api/groups/order {order:[2,1,0]}`; `/api/state` positions swapped |
| REQ-20 | focus | data | a drop on a group deleted meanwhile shows the error and moves nothing | pass | `groups` frame withheld; `PUT /api/sessions/group` refused; `#action-error` "unknown group", not hidden, display block/visible, box 0,59–1280,91; `/api/state` groupId null; card not in the stale section |
| REQ-12–20 | tiles | any | — | N/A — Out of scope: no drag in the Tiles strip; strip cards measured `draggable` false by `render/tiles.ts` |
| REQ-24 | focus | data | warm timer tinted on the fg→fg-dim line (dark) | pass | covered by `cache-warmth.spec.ts` colour oracles (green at gate); my down-state reading: rgb(176,180,194) at warmth 14.9% between fg (232,230,225) and fg-dim (166,171,188) |
| REQ-24 / W8 | focus | data | Light theme: dark foreground fading to grey, not white on white | pass | Light: f=1 timer (28,30,38) = `--fg` (dist 0); f=0.5 (50,53,64) vs mix (50.5,53.5,65), dist 1; `--fg-dim` (73,77,92) on card bg (237,236,231) |
| REQ-24/25 | tiles | data | strip card timer tinted and underlined in the last 15% | pass | 30 s of 5m: `data-cache="cooling"`, title `cache warm · cold in 30s`, `text-decoration: underline dotted` |
| REQ-26 / INV-2 | focus | none | started session with no cache: plain timer, word on hover | pass | `data-cache="unknown"`, title `cache unknown`, colour (166,171,188) = `--fg-dim`; no `--warmth` |
| REQ-27 | focus/tiles | data | hover text formats | pass | `cold in 49s`→`45s` (real clock), `cold in 30s`, `cold in 9m`, `cold in 5m` read off the `title` |
| REQ-28 | focus | down | keeps fading on the tick with no messages, from the last-known expiry, on the real clock | pass | posted 49 s of 5m, killed the daemon: `warm`/`cold in 49s` → `cooling`/`cold in 45s`, underline dotted, `--warmth` 14.9% with no frame received |
| REQ-28 | tiles | down | strip timer keeps fading while down | pass | 48 s of 5m → `cooling`, `cache warm · cold in 45s` after the kill |
| REQ-29 | focus | data | header extra timer after the dots, inside the header, picks the latest-entered waiting member | pass | dots' right edges 154–223, `.gt` 232–263, `.gsum` 124–263 (sw 139 = cw 139, no overflow), ⋯ at 269–291, head 0–299; picked the failed member (latest `stateSince`): `cooling`, same text as its card |
| REQ-29 | focus | data | collapsed section keeps the timer | pass | collapsed head 0,114–299,148: `.gt` count 1, box 232,125–263,136 |
| REQ-29 | focus | none | no waiting member → no extra timer | pass | `.gsum .gt` count 0 with only a started member |
| REQ-30 | focus | data | hover counts known-warmth members | pass | `2 of 2 warm · next cold in 5m` (idle warm + failed cooling; needs_input unknown not counted) |
| REQ-31 | focus | data | popover timer beside every title, inside the popover | pass | popover 8,152–308,325 in vp 1100×800; four `.pl` rows: `.pt` 9–254, `.tt` 264–295, all visible/opacity 1; `data-cache` unknown/cooling(underline)/unknown/warm; no `title` |
| REQ-31 | focus | data | the popover opens from the keyboard too | pass | caret focused → `role=tooltip` visible |
| REQ-29–31 | tiles | any | — | N/A — the strip has no group headers (kb:spec/groups) |
| REQ-32 | focus | data | warmth the same after a daemon restart and a reload | pass | before: `cooling`, `cache warm · cold in 9m`, rgb(175,179,193); after `daemon.restart()` + `page.reload()`: identical |
| §7.1 | tiles | data | opening the strip menu adds no live client | pass | 4 `/ws/terminal/` sockets open for 4 tiles after the menu and the dialog |
| REQ-21–23, REQ-33 | — | — | daemon adoption, broadcast, canary | N/A — no display of their own; their visible effect is REQ-24–32 above (review-work owns them) |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** The card menu closes on any `scroll` (`web/src/render/menu.ts` `onViewportChange`, the pre-existing anchored-menu rule). In one run, Shift+F10 pressed within the same frame as Escape's return of focus to a card cut off at the viewport's foot was closed by the trailing `scroll:sessions` event. Three repeats with a frame between the two passed, and nobody types that fast, so I'm not asking for a change.
2. **[note]** `Resume…` carries an ellipsis but acts at once, with no dialog: one `POST …/resume`, 0 dialogs. The Focus header's own control reads `Resume`, without the ellipsis, and also opens no dialog. So the behaviour matches the Focus header as REQ-4 asks, but the label promises a dialog that never comes. The Testable UI Elements table fixes the label as `Resume…`, so dropping the ellipsis would be an orchestrator wording call, not a fix for an agent.
3. **[note]** `locator.dragTo` on an unselected card in Select mode started the drag on a selected neighbour 4/4 times (`dragstart` on card 2 while dragging card 4) and moved the selection. The cause is Playwright scrolling the rail after the mouse goes down. A real press at the same card, after `scrollIntoViewIfNeeded`, hit card 4 (`draggable="false"`) and fired no `dragstart` and no request. So the product is correct. Any spec that `dragTo`s a card the rail must scroll to has this hazard; it is the same one web-impl's spec defect 3 names.
4. **[note]** Not re-measured by me, but each is asserted by a spec that was green in this cycle's gate (`17-e2e`): REQ-3 (Resume… absent without a Claude id, `rail-menu.spec.ts`), the exact 15% underline boundaries (`cache-warmth.spec.ts`), `/clear` returning a session to unknown (E16), and the manual-order contiguous selection drop (REQ-16, `rail-drag-groups.spec.ts`).
5. **[note]** Unknown and cold warmth look the same, today's plain grey timer; only the hover tells them apart (`cache unknown` / `cache cold`). This is the plan's stated rule (REQ-26, the States table). It does not break §6: the plain timer is the timer's pre-feature look, not a "cold" claim, and the word is there on hover.

## Maintainability review

# Maintainability review: Rail Card Organise

**Plan**: rail-card-organise
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 21303 words (budget 30000)
**Scope**: 37 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (31 code, 1 migration, 5 CLAUDE.md docs)

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/status.go | usageapi.go (`parseResetsAt`), interpret.go | partial: types yes; `interpretPromptCache`/`parseCacheTTL` none | none | Minor 1 |
| internal/claudecode/claudecodetest/claudecodetest.go | (same file's `StatusLineFullOpts`) | yes | filelen 641, reason holds | pass (Note 2) |
| internal/claudecode/CLAUDE.md | — | doc | — | review-work's |
| internal/server/sessionwire.go | sessionWireContext in same file | yes | none | pass |
| internal/session/apply.go | status.go, location.go | yes | none | pass |
| internal/session/machine.go | apply.go | n/a (one line in `applyBind`) | funlen `applyInput` 51, pre-existing, untouched | pass (Note 3) |
| internal/session/row.go | `contextFromRow`/`contextToRow` same file | yes | none | pass (Note 9) |
| internal/session/session.go | `Context` same file | yes | none | pass (Note 8) |
| internal/session/status.go | location.go (`adoptClaudeDir`) | yes | none | pass |
| internal/session/writeorder.go | — | n/a (field-list rows) | none | pass |
| internal/session/CLAUDE.md | — | doc | — | review-work's |
| internal/store/migrations/0014_prompt_cache.sql | 0003 | yes | none | pass |
| internal/store/session.go | `last_snapshot_at` decode same file | yes | none | pass (Note 9) |
| web/src/features/actions.ts | groups.ts, rename.ts | bullet in Decisions (`actions.inFlight`) | none | pass (Note 5) |
| web/src/features/groups.ts | groupsdialogs.ts, groupsselect.ts, rail.ts | yes | filelen 507, reason partly holds | pass (Note 1) |
| web/src/features/rail.ts | groups.ts, tiles.ts | yes (`planDrop`) | none | pass |
| web/src/features/railmenu.ts | groups.ts, groupsdialogs.ts, actions.ts, usage.ts | yes | none | pass (Note 7) |
| web/src/features/railmenuitems.ts | actionscopy.ts, groupscopy.ts, ../sessions/card.ts | yes | none | Major 1 |
| web/src/features/tiles.ts | rail.ts | yes (railmenu line) | none | pass |
| web/src/features/CLAUDE.md | — | doc | — | review-work's |
| web/src/main.ts | — | n/a (one-line registration) | none | pass |
| web/src/protocol/session.ts | `parseContext`, `parseSessionPlan` same file | yes (wire) | none | pass |
| web/src/render/anchored.ts | menu.ts, grouppopover.ts | n/a | none | pass (Note 8) |
| web/src/render/grouppopover.ts | railsections.ts | yes | none | pass |
| web/src/render/menu.ts | anchored.ts, grouppopover.ts | Decisions bullet (point-open) | none | pass |
| web/src/render/railsections.ts | sessions.ts, grouppopover.ts | yes (header `.gt`) | none | pass (Note 6) |
| web/src/render/sessions.ts | tiles.ts, railsections.ts, focuskeep.ts | partial | none | Minor 3 |
| web/src/render/tiles.ts | sessions.ts | n/a (option pass-through) | none | pass |
| web/src/render/warmth.ts | context.ts, actionbutton.ts | yes | none | pass |
| web/src/render/CLAUDE.md | — | doc | — | review-work's |
| web/src/sessions/cache.ts | format.ts, sections.ts, sort.ts, card.ts | yes | none | Minor 2 (Note 4) |
| web/src/sessions/card.ts | format.ts, sections.ts | yes (moved `cardTimerText`) | none (495 lines) | pass |
| web/src/sessions/railorder.ts | reorder.ts, sections.ts | yes | none | pass |
| web/src/sessions/sections.ts | cache.ts, card.ts | yes | none | pass |
| web/src/sessions/testfixtures.ts | — | n/a | none | pass |
| web/src/sessions/CLAUDE.md | — | doc | — | review-work's |
| web/src/style.css | — (contrast gate's) | Decisions bullet (tint) | none | pass |

## Issues

### Critical

### Major
1. **[web-impl]** `cardMenuItems` re-derives the action-enablement rule and the action vocabulary rather than asking their owner. See `web/src/features/railmenuitems.ts:39` (`const disabled = !state.connected || state.busy;`), `:13-18` (`CardMenuAction.action: "end" | "resume" | "remove"`) and `:47-54` (alive → Stop, else Resume when `canResume`, then Remove). Cites § Design "Reuse before add" and "One owner per concept". `web/src/sessions/card.ts` already holds each piece:
   ```
   sessions/card.ts:21   export type SessionAction = "end" | "resume" | "remove" | "pin";
   sessions/card.ts:23   export const ACTION_BY_LABEL = { Stop: "end", Resume: "resume", Remove: "remove" } …
   sessions/card.ts:126  export function actionEnabled(label: CardAction, claudeSessionId: string | null, connected: boolean): boolean
   sessions/card.ts:150  export function stopResumeButton(session: Pick<Session, "alive" | "claudeSessionId">, connected: boolean): StopResumeButton
   ```
   The doc comment on `actionEnabled` (card.ts:123-125) reads: "The one rule every rail, tile, mainhead and dead-surface button reads, so no surface re-derives it." The card menu is a new surface for Stop, Resume and Remove, and it does not read `actionEnabled`. `rg -n "actionEnabled|canResume" web/src --glob '!*.test.ts'` shows `render/dead.ts:79`, `render/tiles.ts:293` and `card.ts:161` calling `actionEnabled`. `railmenuitems.ts` imports only `canResume`. A fix must make two things true. First, the menu's enabled state for each action comes from `actionEnabled`, with in-flight (`busy`) layered on top. Second, its action type comes from `SessionAction`/`ACTION_BY_LABEL`, not a third spelling. A later change to the enable rule then reaches the menu without anyone editing `railmenuitems.ts`.

### Minor
1. **[daemon-impl]** `parseCacheTTL` hand-parses an `s`/`m`/`h` duration string even though the standard library already has a parser for it, and Decisions has no `design:` line for it or for `interpretPromptCache`. See `internal/claudecode/status.go:194-215` (`cacheTTLUnits` map, a digit loop, overflow check). Cites § Design "Reuse before add" and question 7 (every new seam explained). `rg -n "ParseDuration" internal cmd --glob '!*_test.go'` returns nothing (exit 1). `time.ParseDuration` parses `"1h"`, `"5m"` and `"90s"`. The sibling `parseResetsAt` (`internal/claudecode/usageapi.go:138`) leans on stdlib parsing (`time.Parse`, `json.Unmarshal`) rather than a digit loop. A fix must make one of two things true. Either the TTL goes through `time.ParseDuration` with only the extra constraints the wire needs (positive, whole seconds, a single unit), or a `design:` line names what `ParseDuration` accepts that must be rejected here (fractions like `1.5h`, compounds like `1h30m`, `ms`/`us`), so the next reader does not "simplify" it back.
2. **[web-impl]** `remainingText` is a time formatter in `sessions/cache.ts`, outside the module that owns formatters. See `web/src/sessions/cache.ts:19` (`whole >= 60 ? \`${Math.ceil(whole / 60)}m\` : \`${whole}s\``). Cites § Design "One owner per concept". `web/src/sessions/format.ts:1` introduces that module as "Pure time/number formatters" and holds the neighbours `formatTimer`, `formatAge` (`now`/`Nm`/`Nh`) and `elapsedSeconds`. This new countdown formatter, and its `remainingSeconds` mirror of `elapsedSeconds` (cache.ts:15 against format.ts:14), live elsewhere. A fix must make one of two things true. Either the countdown formatter sits in `format.ts` beside `formatAge`, where the next person looking for "how is a duration shown" finds every variant, or a `design:` line says why it belongs to `cache.ts` alone.
3. **[web-impl]** Whether a card can be dragged is now decided in two places: the controller passes a flag and the renderer overrides it. See `web/src/render/sessions.ts:229` (`options.draggable || isSelected`) against `web/src/features/rail.ts:191` (`draggable: !selecting`). The doc comment that said "the caller decides which, per its own context" was removed from `CardOptions.draggable` (render/sessions.ts:39), and the select-mode policy ("a selected card stays draggable while selecting") now sits in `render/`. Cites conventions § Composition roots: "`render/` holds the DOM half only, taking the already-computed value as a parameter". A fix must make one place, the controller, the whole answer for a given card's draggability, with render applying the value it is handed. For example, a per-id predicate or a per-card value instead of a single boolean that render then amends.

### Notes
1. **[note]** `web/src/features/groups.ts` is 507 lines (filelen). The Decisions reason ("`moveToEntries`/`moveSessions`/`reorderSection` use this module's `settle` and dialogs") holds for `moveToEntries`. It holds less well for `reorderSection` (groups.ts:382), a card-order `PUT /api/sessions/order` that `rail.ts` called directly on `main`. It moved here only to share `settle` (groups.ts:163, three lines over `deps.actions.showError`, which `RailDeps.actions` could reach as well). This is not a request, just context for the next person who wants `groups.ts` under 500.
2. **[note]** `internal/claudecode/claudecodetest/claudecodetest.go` is 641 lines (filelen). The reason holds: the file was already about 620 lines, and the 20 added lines are options that belong beside `StatusLineFullOpts`.
3. **[note]** `internal/session/machine.go:23` `applyInput` funlen 51 > 40 is pre-existing. This branch changes only `applyBind` (one line, machine.go:164), and `applyInput` holds the ADR'd complexity exemption. The test-file funlen hits (`status_test.go`, `cache_test.go` 80, `store/session_test.go` 99, `canary_test.go` 44) belong to the test agents. There are no `dupl` hits.
4. **[note]** `waitingMembers` and `latestEntered` (`web/src/sessions/cache.ts:36,40`) pick which section members a header timer reads. They are not about cache warmth, and their one caller is `headerTimer` in `sessions/sections.ts:326`. They would read more naturally beside it.
5. **[note]** `actions.ts:86` `inFlight` is a `Set`, so two overlapping requests for one id lose track of each other. Example: a single Stop on 5, then a batch Remove of [5, 6] confirmed before the Stop answers. The first `finally` deletes 5 while the second request is still pending, and a card menu opened in that window shows 5's items enabled. A count per id would hold. This is single-threaded JS, so it is not a race, and the daemon serialises per session (kb:adr/actions-serialized-per-session).
6. **[note]** Two writers share `header.summary`'s children. `writeSummary` (`render/railsections.ts:118-133`) `replaceChildren`s on a signature change and so drops the `.gt` node owned by `writeHeaderTimer` (`:135`). It works only because `updateHeader` calls them in that order (`:237-238`), and nothing at either function says so.
7. **[note]** Naming: the module and its handle are `railmenu.ts`/`RailMenuHandle`/the `railMenu` dep, yet `features/tiles.ts` hands it to strip cards too, and everything it carries is named `CardMenu*` (`CardMenuRequest`, `cardMenuItems`, `CARD_MENU_LABELS`). `features/CLAUDE.md` does describe it as "the rail and strip cards' right-click menu".
8. **[note]** Comments (the comment pass owns these):
   - New exported types and methods have no doc comment, unlike their documented siblings: `StatusCache` (status.go:73), `Cache` (session.go:91), `PromptCacheOpts`, `sessionWireCache`, `GroupsHandle.moveToEntries`/`moveSessions`/`reorderSection` (groups.ts:77-79), `ActionsHandle.inFlight` (actions.ts:67).
   - The new modules `railmenu.ts`, `railmenuitems.ts`, `render/warmth.ts` and `sessions/cache.ts` have no header comment; their siblings `groupsdialogs.ts` and `format.ts` do.
   - `Session.Clone`'s doc (session.go:224) lists only Attention, Failure and Model as shared immutable pointers, and Cache (like Context) is one too.
   - `render/anchored.ts:1` still says "The one placement routine" beside the new `placeAtPoint`.
9. **[note]** Both-or-neither for the two cache columns is enforced twice: `scanSession` nils the TTL when the expiry fails to decode (`internal/store/session.go:459`), and `cacheFromRow` checks both (`internal/session/row.go:75`). The sibling `last_snapshot_at` decode does not normalise its partner in `scanSession`. The `design:` line names both places, so this stands as stated.
10. **[note]** For review-work's DIAG row: `docs/diagrams/web-components.md:50` still says `features/` is "34 modules … 12 DOM-free helpers" (now 36, with `railmenu.ts` and `railmenuitems.ts`). `docs/diagrams/store-schema.md` describes migrations 0001-0013, and 0014 adds two `session` columns. Neither diagram is in this branch's diff.
