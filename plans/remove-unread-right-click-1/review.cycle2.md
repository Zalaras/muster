# Review: remove-unread-right-click-1

**Plan**: remove-unread-right-click-1
**Verdict**: needs-changes
**Cycle**: 2
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code approved, browser approved, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: remove-unread-right-click-1

**Plan**: remove-unread-right-click-1
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 64081 words (budget 30000)

Scope: delta re-review (§0) against `git diff 63252581..HEAD` (`review_commits[1]`). The diff also
changes `internal/session/manager_rail.go`, which is outside every prior Minor's scope because it
fixes maintainability Major 1. I reviewed that area in full (Notes 1).

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 `PUT /api/sessions/{id}/unread` | Yes. The route is unchanged since cycle 1. `SetUnread` (`internal/session/manager_rail.go`) is now the only locked body that writes `Unread` outside `Apply`/`setState`, and `MarkSeen` is `return m.SetUnread(ctx, id, false)`. Same behaviour on every input: a miss returns `ErrUnknownSession`; an already-read session gets no write and no broadcast; a clear works in any state, because the idle guard applies only when `unread` is true; a change makes one `persistWholeRowLocked(..., true)`. Only the wrapped error text changed, and the one production caller (`internal/server/terminal.go:382`) just logs it | Yes. D1 and D2 pass with no change to any `_test.go` under `internal/` in this cycle (`git diff 63252581..HEAD --stat` lists none), so the `TestSetUnread_*` and `MarkSeen` tests pass unchanged, as maintainability Major 1 required | pass |
| REQ-2 Mark as read / Mark as unread on every menu | Yes, unchanged. The `CardMenuRequest.card` → `opener` rename only renames a destructured field in `railmenu.ts` (`openCard`, `openSelection`) | Yes. W1 (100 tests, up from 92), R1, E1 | pass |
| REQ-3 Remove… on live sessions | Yes. `cardMenuItems` now picks the primary label inline (`session.alive ? "Stop" : "Resume"`). It still pushes the primary only when `alive \|\| canResume(...)` and still pushes Remove unconditionally. Enablement is still `entry()` → `actionEnabled`, the same two rules the removed `stopResumeButton` applied | Yes. The new `railmenuitems.test.ts` table covers all 8 `{alive, claudeSessionId, connected}` cells of the primary entry. The ended unbound cells correctly have no primary. The live row still expects `["Stop…","end",false],["Remove…","remove",true]` | pass |
| REQ-4 Focus header holds the switch and one ⋯ | Yes, unchanged | Yes. R1, E1 | pass |
| REQ-5 ⋯ opens the focused card's menu | Yes. `focus.ts:160` → `deps.railMenu.open({ id, opener: moreBtn })` | Yes. R1, E1 | pass |
| REQ-6 Note marker inherits no title | Yes, unchanged | Yes. R1 | pass |
| DIAG | kb:diagram/daemon-components (`manager_rail.go`) and kb:diagram/web-components (`card.ts`, `railmenuitems.ts`, `railmenu.ts`, `render/sessions.ts`). Both are package/directory diagrams. This cycle adds no import edge and removes none: `railmenuitems.ts` still imports `../sessions/card` | — | pass |

## Build & Tests

E2E tests: pass (383, scoped to 34 files; E1 162 in 10 files) · Daemon tests (race): pass (`make test-race`, 27 `ok` packages) · Web tests: pass (3041 in 106 files) · Render tests: pass (422) · Daemon build: pass · Web build: pass (`tsc --noEmit && vite build`) · Lint: pass (golangci-lint 0 issues; web lint clean; contrast 0 failures in 3 themes). All read from $GATES_LOG_DIR: 27 lines, 0 failed, 2 warn-only. `WARN size` (`rail.go` dupl ×2; `card.ts` is now under 500 lines and no longer warns) belongs to review-maintainability. `WARN e2e-level` is a census of specs this plan did not author.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `go test -count=1 -run 'TestSetUnread\|TestHandleUnreadSession' ./internal/session/ ./internal/server/` | pass (22-D1.log) |
| D2 | `go test -count=1 ./internal/session/ ./internal/server/` | pass (23-D2.log) |
| W1 | `cd web && npx vitest run src/features/railmenuitems.test.ts src/api/http.test.ts src/render/mainhead.test.ts` | pass, 100 tests in 3 files (24-W1.log) |
| R1 | `cd web && npx playwright test -c playwright.render.config.ts render/focus.spec.ts render/notes.spec.ts render/rail.spec.ts render/actions.spec.ts render/theme.spec.ts render/card-location.spec.ts render/rename.spec.ts` | pass, 191 (25-R1.log) |
| E1 | `make e2e SPECS="rail-menu.spec.ts focus-header.spec.ts effort-header.spec.ts actions.spec.ts rail-cards.spec.ts terminal.spec.ts resilience.spec.ts focus-marker.spec.ts groups.spec.ts notes.spec.ts"` | pass, 162 (26-E1.log) |
| L1 | `make lint` | pass (deduped to the baseline `lint` line, 03-lint.log, 0 issues) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. All three cycle-1 `[orchestrator]` Majors were fixed in `80b26cc4`. **Major 1**: `docs/design/design-system.md:279-282` now names the `claude \| shell \| docs` switch and one "Session actions" ⋯, says the header has no Stop, Resume or Remove, and cites kb:adr/focus-header-holds-switch-and-session-menu. **Major 2**: the actions Doc Delta (`plan.md:258-261`) now ends "…or just under the header ⋯ when opened from it". **Major 3**: kb:adr/rail-card-menu-offers-remove-and-marks-whatever-the-state now restates three things: the outside-the-selection right-click, the rule for outside Select mode and the strip card, and the "no action button, keeps its pin control, no Rename" clause. Its Consequences now name the header ⋯ as a route to Remove…. This cycle's `doc-delta:` lines (daemon and web fix attempts) both say "none", and the `stopResumeButton` removal and the `opener` rename are named in no doc (`rg` outside `plans/` finds nothing). TODO tick is the sweep loop's |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | `docs/protocol.md` § kb:anchor/sessions.unread matches the Protocol delta in substance; no other protocol text changed | pass | Verified in cycle 1. `git diff 63252581..HEAD --stat -- docs/` is empty, so it is unchanged since then |
| RV2 | The header ⋯ uses the existing menu builder through `railMenu.open`; no second menu list | pass | `web/src/features/focus.ts:160` calls `deps.railMenu.open({ id, opener: moreBtn })`. `rg 'cardMenuItems\(\|selectionMenuItems\('` outside tests finds only their definitions and the two calls in `railmenu.ts:69,82` |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. The delta adds no Claude Code format knowledge |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass. No ingest change |
| 4 | tmux via `-L muster`; no `resize-pane` sizing | pass. No tmux change |
| 5 | No payload logging | pass. The attach path still logs only `session_id` and the error |
| 6 | Empty-gauge honesty | pass. No gauge path touched |
| 7 | Identity on the tmux target | pass |
| 8 | No settings trespass | pass |
| 9 | No real `claude` outside canary/probes | pass |

## Delta (delta re-review only)

| Prior Minor | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 1 correctness Minor 1 `[e2e-specs]`: `rail-menu.spec.ts:130` title compared against the removed header Resume | `738489bf` | Diff read. The title now reads "Resume in the card menu resumes the ended session at once, with no confirm dialog, and leaves another ended session ended (REQ-4, INV-4)". The body is untouched, nothing else in the file changed, and E1 ran it green |
| cycle 1 correctness Minor 2 `[daemon-impl]`: `internal/server/CLAUDE.md` Owns line omitted unread | `5013a95d` | Diff read. `rail.go (pin, unread, order)`; one-word change in the hand-written line; `kb-check` green |
| cycle 1 maintainability Minor 1 `[web-impl]`: `stopResumeButton` fields read only by a test | `8c72b894` (+ `7538ecf4` tests) | Diff read. `StopResumeButton`/`stopResumeButton` deleted; `rg` finds no reference in `web/`. `resumeDisabledReason` stays and is used by `render/dead.ts:81`; its text is still asserted through `web/render/helpers/actions.ts:30` (R1 `actions.spec.ts` E7). The 8-cell W3 table moved to `railmenuitems.test.ts` and asserts the menu entry, which is what the menu reads. The dropped `reason` column belonged to a control that no longer exists. `card.ts` is now under the 500-line warning |
| cycle 1 maintainability Minor 2 `[web-impl]`: `CardMenuRequest.card` held an opener | `8c72b894` | Diff read. The field is `opener` in `render/sessions.ts` (type and both `onMenu` calls), `railmenu.ts` (both destructures and both `menu.open`) and `focus.ts`. `rg '\bcard:'` over the forwarding files finds only an unrelated `drop(…, { card: targetId })` in `rail.ts:152`. `tsc --noEmit` is green in the web-build gate |
| cycle 1 correctness Note 4 (for maintainability): `marks` read through an `as unknown` cast | `7538ecf4` | Diff read. `markRows` now takes `{ marks: CardMenuAction[] }` and the cast is gone |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** For the orchestrator: cycle 1's open agent-tagged issues included maintainability **Major** 1 `[daemon-impl]` (`SetUnread` copied `MarkSeen`), so the precondition for a Minors-only delta cycle did not strictly hold. Its fix (`5013a95d`) is outside every Minor's scope, so I reviewed it normally under §0. `MarkSeen` → `SetUnread(ctx, id, false)` behaves the same on every input (REQ-1 row). `rg '\.Unread\s*='` over non-test `internal/` now finds one write outside the state machine (`manager_rail.go:188`), plus `apply.go:94`, `session.go:321` and the store's row scan. That makes the Major resolved from the correctness side. Whether one locked body is enough is review-maintainability's call.
2. **[note]** `web-tests.md` has no fix-attempt section for `7538ecf4`, which removed the `stopResumeButton` table from `card.test.ts` and added the primary-entry table to `railmenuitems.test.ts`. The only record of that work is web-impl's handoff paragraph. The tests themselves are honest and green (W1 100 tests, web-test 3041).

## Browser review

# Browser review: remove-unread-right-click-1

**Plan**: remove-unread-right-click-1
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 14319 words (budget 30000)
**Rig**: `make web-build build` at 8052e4ed (v0.25.3-33-g8052e4ed-dirty; the dirty files are the orchestrator's plan/review files only). Each daemon is a fresh copy of `bin/musterd` from `helpers/fixtures.ts`, on a space-bearing data dir `$TMPDIR/muster e2e-6908ffbc-*` with a private `-S <data-dir>/tmux.sock` (killed and deleted at teardown, none left afterwards), using the shared stub `claude` (`$TMPDIR/muster e2e-stub-*/claude`). Driven in headless Chromium through one throwaway spec, now deleted. The gates log has 0 failed lines; `e2e` (383 passed) and `web-build` are green.

This cycle's diff (63252581..8052e4ed) touches three things the browser can see: `MarkSeen` now delegates to `SetUnread` (the attach clear), `CardMenuRequest.card` is renamed to `opener` (the menu anchor for card, strip and header ⋯), and `cardMenuItems` derives Stop/Resume without `stopResumeButton`. I re-ran the whole matrix and added rows for the attach clear and the leave-idle clear.

## Matrix

Hosts:
- **focus**: the Focus rail card and the Focus header ⋯.
- **tiles**: the Tiles strip card, plus the tile header for REQ-6.
- **pop-out**: `/doc.html`, the docs reader pop-out. It holds no session card, mainhead or note marker (`grep -c 'mainhead\|session-card\|class="mk"' web/doc.html` → 0), so every pop-out cell is N/A for that reason.

**Daemon-down** means the scratch daemon got SIGTERM (`daemon.kill()`) with the page left open.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-2/3 | focus rail | data | every card's menu: lifecycle item first, then `Remove…` (danger), then the two marks after Pin, non-danger, enabled whatever the state | pass | idle-read alpha, idle-unread beta, working gamma: `Stop…, Remove…, New group…, No group, Pin, Mark as read, Mark as unread`. Ended delta: `Resume, Remove…, …`. Every item has `aria-disabled` false and computes `flex/visible/1`; only `Remove…` carries `danger`. Covers the cycle-2 `primary` rewrite |
| REQ-1/2 | focus rail | data | Mark as unread (pointer) sets the flag on an idle read card | pass | `data-unread="true"`, aria-label `br-alpha, unread`, `/api/state` `unread:true`, unchanged after a 1.2 s settle |
| REQ-1/2 | focus rail | data | Mark as read (pointer) clears it | pass | `data-unread` absent and wire `false` after a 1.2 s settle |
| REQ-1/2 | focus rail | data | keyboard round-trip | pass | card focused, Shift+F10, ArrowDown until activeElement reads `Mark as unread`, Enter → wire `true`, `data-unread="true"` after a 1.2 s settle, focus back on the card |
| REQ-1 | focus rail | data | **attach still clears unread** (the cycle-2 `MarkSeen` → `SetUnread`) | pass | clicking unread beta to Focus it → wire `false`, `data-unread` absent after 1.2 s. Hand-marked alpha, no longer focused, stayed `true`. Re-focusing alpha → `false`, attribute gone |
| REQ-1 | focus rail | data | leaving idle clears a hand-set unread | pass | beta (idle, unattached) Mark as unread → `true`; then a `UserPromptSubmit` moves the badge to working → wire `false`, attribute absent |
| REQ-1/2 | focus rail | data | Mark as unread on a working or ended session is a no-op, and the item stays enabled | pass | gamma (working): item `flex/visible/1`, not disabled; after the click the wire stays `false` and there's no `data-unread`. delta (ended): wire `false` |
| REQ-2 | focus rail | data | selection menu: marks after Move to, one call per id | pass | `Actions for 2 sessions`: `Stop…, Remove…, New group…, No group, Mark as read, Mark as unread`. Mark as unread over idle alpha and working gamma → alpha `true`, gamma `false` (Edge case 3) |
| REQ-2 | tiles strip | data | both marks shown; round-trip | pass | `Actions for tl-g3`, the same 7 items, all enabled and `flex/visible/1`. Mark as read → `false`; Mark as unread → `data-unread="true"`, wire `true`; Mark as read → absent, `false` (each after a 1.5 s settle) |
| REQ-2 | focus / tiles | no data | marks on the menu | N/A — there's no card to open a menu on | |
| REQ-2/3 | focus rail, header ⋯, tiles strip | daemon-down | menu opens; every item, both marks included, is disabled like Pin | pass | banner `display:block`, `musterd unreachable — hook output in open panes is Muster's absence…`, 0,46–1440,78. In the rail, header and strip menus all 7 items have `aria-disabled` true and stay visible (Edge case 5) |
| REQ-3 | focus rail | data | Remove… on a live card opens today's confirm | pass | `Remove session? br-gamma — … This ends the session first. …`, box 500,352–940,548 inside 1440×900; after Cancel, gamma is still `alive` |
| REQ-3 | focus rail | data | an all-live selection offers Remove… | pass | dialog `Remove 2 sessions? 2 of them are alive and will be stopped first.` |
| REQ-3 | tiles strip | data | live strip card Remove… → confirm → removed | pass | first two items `Stop…, Remove…`; dialog `…This ends the session first.…`; after confirming, the strip card count is 0 and `/api/state` no longer has the id |
| REQ-3 | any | no data | | N/A — no card | |
| REQ-4 | focus header | data (live idle) | no Stop/Resume/Remove; `.acts` = switch then ⋯ | pass | visible `#mainhead` buttons: `Note, br-alpha, no group▾, claude, shell, docs, Session actions`; `getByRole(button,/^(Stop|Resume|Remove)/)` count 0; `.acts` children are `DIV.surfseg, BUTTON.btn icon more` |
| REQ-4 | focus header | data (ended) | no Resume/Remove; ⋯ still visible | pass | `Note, br-delta, no group▾, claude, shell, docs, Session actions`; ⋯ `block/visible/1` |
| REQ-4 | focus header | data | ⋯ placement and aria attributes | pass | ⋯ 1395,58–1426,83 inside `.acts` 1223,58–1426,83, inside `#mainhead` 300,46–1440,95; `aria-label`/`title` `Session actions`, `aria-haspopup=menu`, `aria-expanded=false` |
| REQ-4 | focus header | data, narrow | ⋯ stays inside the header as the window narrows | pass ≥ 490 px | 1000: 955–986 in a head ending at 1000; 800: 755–786; 640: 601–626; 500: 461–486; 490: 460–485. At 480 and below the cluster overflows (Note 1) |
| REQ-4 | focus header | no data | header hidden | pass | `#mainhead` has `hidden` and computes `display:none`; ⋯ has no box |
| REQ-4 | tiles | data | header ⋯ | N/A — the mainhead belongs to the Focus view; measured `checkVisibility()` false in Tiles | |
| REQ-4 | focus header | daemon-down | ⋯ stays visible | pass | `block/visible/1`, 1395,90–1426,115, below the banner |
| REQ-5 | focus header | data | ⋯ opens the same menu as right-clicking the focused card | pass | the `{label, items with class, disabled flag and computed style}` JSON is identical on both: `Actions for br-alpha`, 7 items |
| REQ-5 | focus header | data | anchored to the button (the cycle-2 `opener` rename), inside the viewport | pass | menu 1236,87–1426,341: right edge flush with the ⋯ right edge at 1426, top 4 px under the ⋯ bottom at 83. At 1000/800/640/500/490 the menu is anchored under the ⋯ and inside the viewport (e.g. 500: 296–486) |
| REQ-5 | focus header | data | `aria-expanded` kept in step; a second click closes | pass | open → `true`; second click → 0 menus, `false`; after choosing an item → `false` and activeElement back on the ⋯ |
| REQ-5 | focus header | data | choosing an item acts on the focused session | pass | Mark as unread from the ⋯ on focused, attached alpha → `data-unread="true"`, wire `true`, still `true` after 2.5 s (Edge case 2). Remove… → `Remove session? br-alpha — … This ends the session first.` |
| REQ-5 | focus header | data | keyboard: keeps focus across a tick, opens, returns | pass | Shift+Tab then Tab onto the ⋯ → activeElement === ⋯, still so after 1.3 s; Enter → menu holds focus; Escape → focus back on the ⋯, `aria-expanded=false` |
| REQ-5 | focus header | data (ended) | the menu offers Resume | pass | `Actions for br-delta`: `Resume, Remove…, New group…, No group, Pin, Mark as read, Mark as unread` |
| REQ-5 | focus header | data, Select mode | focused card is selected → selection menu (Edge case 4) | pass | focused delta selected with alpha and gamma → the ⋯ opens `Actions for 3 sessions` with the selection items |
| REQ-6 | focus rail | data | the marker inherits no title; `.r2` keeps its own | pass | `elementFromPoint` at the marker centre → `use`; the first titled ancestor-or-self is `SPAN.mk=""`; `.r2` title is the repo line. Note tip shown after a 1.2 s hover (`block/visible/1`, 277,297–577,367). The repo text still resolves to `DIV.r2`'s title |
| REQ-6 | tiles strip | data | as above | pass | first titled = `SPAN.mk=""` |
| REQ-6 | tiles tile header | data | the tile marker has no titled ancestor | pass | first titled ancestor-or-self of the hit point: none |
| REQ-6 | any | no data / daemon-down | | N/A — there's no note marker without a session, and the marker's title is a static template attribute that a disconnect doesn't touch | |
| §6/§7 | focus, tiles | all | honesty and terminal rules on the surfaces this plan touches | pass | no Done or cost text in any menu or header; the daemon-down banner is `block/visible/1` in both Focus and Tiles; before data, the context and masthead read `unknown`; the Tiles 2×2 holds 4 `.xterm` for 4 grid sessions and the strip card is static |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes
1. **[note]** Below about 490 px the Focus header's right cluster overflows the header, and the ⋯ overflows the viewport. Measurements: at 480, ⋯ 460–485 in a 480 viewport (`#mainhead` scrollWidth 210 vs clientWidth 180); at 440, ⋯ 208–233 against a header that ends at 188. This is cycle 1's Note 1, now measured further. A real pointer click at the ⋯ centre opens the menu at 480 (checked twice, including with the ⋯ previously focused), and keyboard Enter opens it at every width down to 400. A Playwright locator `click()` at 480 and 470 does not open it, because the auto scroll-into-view scrolls `#app` (`overflow-x: hidden`) by 5 px (`scrollLeft=5`). That `scroll` event closes the menu 8 ms after it opens (`+menu` then `-menu` in the event log). So any focus-driven scroll-into-view of an overflowing ⋯ can leave `#app` shifted 5 px with the menu closed. The overflow predates this plan (the removed Stop+Remove pair made the cluster wider), and this desktop dashboard is used at ≥ 1000 px, so no change is requested. A spec that drives the ⋯ below 490 px with `locator.click()` will see the menu vanish.
2. **[note]** Headless Chromium can't show the native `title` tooltip itself. So REQ-6 was measured on what Chrome reads to show it: the first ancestor-or-self with a `title` attribute from the element under the pointer.

## Maintainability review

# Maintainability review: Remove, unread and right-click (1)

**Plan**: remove-unread-right-click-1
**Part verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 26100 words (budget 30000)
**Scope**: 18 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (4 of them generated `CLAUDE.md` trailers). Full re-review: the spawn prompt did not mark this cycle as a delta. I also opened `internal/session/session.go` and `internal/session/writeorder.go`, which are outside the diff, because they declare and describe the state that `SetUnread` writes.

## Cycle 1 findings, re-checked

| Cycle 1 finding | Fix commit | Verified how |
|-----------------|------------|--------------|
| Major 1: `SetUnread` copied `MarkSeen` | 5013a95d | `manager_rail.go:169-171`: `MarkSeen` is now `return m.SetUnread(ctx, id, false)`. `rg -n "\.Unread\s*=" internal --type go -g '!*_test.go'` finds one write outside the state machine (`manager_rail.go:188`), plus `apply.go:94` and `session.go:321`. The idle guard applies only to `unread=true`, so `MarkSeen` still returns before any write when the session is already read. `02-test.log`: `internal/session ok` under `-race`. Resolved |
| Minor 1: `stopResumeButton` had dead fields | 8c72b894 | `StopResumeButton`/`stopResumeButton` are deleted. `rg -n "stopResumeButton\|StopResumeButton" web/src web/render web/e2e` finds nothing. `cardMenuItems` picks `primary` inline (`railmenuitems.ts:71`) and gets enablement from `actionEnabled` through `entry()`. `card.ts` went from 501 to 477 lines, so its file-length warning is gone. Resolved |
| Minor 2: `CardMenuRequest.card` named the wrong thing | 8c72b894 | The field is now `opener` (`render/sessions.ts:22`), and every producer and consumer uses the new name: `sessions.ts:302`, `:313`, `railmenu.ts:68`, `:80`, `focus.ts:160`. It matches `createMenu().open(opener, …)`. Resolved |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/server/rail.go | groups.go, actions.go, note.go, respond.go (`writeInvalidRequest` vs `writeJSONError` usage) | yes (daemon Decisions 2, 3) | dupl ×2 (41-65 / 71-95), reason given, mostly holds (Note 1) | pass |
| internal/session/manager_rail.go | session.go (`Unread` declaration, `setState`), writeorder.go (`persistWholeRowLocked`), apply.go | yes (Fix Attempt 1: "`MarkSeen` delegates to `SetUnread`") | none | Minor 1 |
| internal/server/CLAUDE.md | n/a | n/a (generated kb trailer) | none | pass |
| internal/session/CLAUDE.md | n/a | n/a (generated kb trailer) | none | pass |
| web/src/api/sessions.ts | same file's `pinSession`, `putTitle` | covered by web Decisions | none | pass (Note 2) |
| web/src/features/actions.ts | railmenu.ts, focus.ts | no new type | none | pass (Note 3) |
| web/src/features/focus.ts | rail.ts:38, tiles.ts:66 (`railMenu` dep shape identical), groups.ts | yes (header ⋯ reuses `railMenu.open`; not in `MainheadElements` because `renderMainhead` never writes it) | none | pass |
| web/src/features/railmenu.ts | railmenuitems.ts, groups.ts | yes (marks field, separators, per-id loop) | none | pass |
| web/src/features/railmenuitems.ts | sessions/card.ts, batchplan.ts | yes (`marks: CardMenuAction[]`) | none | pass |
| web/src/features/CLAUDE.md | n/a | n/a (generated kb trailer) | none | pass |
| web/src/main.ts | n/a (composition root) | n/a | none | pass: one-line `railMenu` dep; `railMenu` is already built at `:53`, before `initFocus` |
| web/src/render/mainhead.ts | focusview.ts, dead.ts, effortstrip.ts | n/a (removal) | none | pass |
| web/src/render/menu.ts | sessions.ts (`CardMenuRequest.at?`) | covered by the header ⋯ design line | none | pass |
| web/src/render/rename.ts | n/a (comment-only change) | n/a | none | pass |
| web/src/render/sessions.ts | tiles.ts, rail.ts, railmenu.ts (every `CardMenuRequest` consumer) | yes | none | pass |
| web/src/render/CLAUDE.md | n/a | n/a (generated kb trailer) | none | pass |
| web/src/sessions/card.ts | render/dead.ts, railmenuitems.ts | no new type | none (477 lines, was 501) | pass (Note 4) |
| web/src/style.css | n/a (removal of `.stop-resume` and two comments) | n/a | none | pass (Note 5) |

## Issues

### Critical

### Major

### Minor

1. **[daemon-impl]** The `Unread` field's declaration still lists its writers as they were before this branch. Two places describe them:
   - `internal/session/session.go:168-173` reads: "The invariant Unread implies State == idle is enforced by setState — the one place every applyInput arm routes through. Set by Manager.Apply after a turn_closed input per the watcher's answer; cleared by Manager.MarkSeen (attach on either surface)."
   - `MarkSeen`'s own doc comment (`manager_rail.go:162-168`) adds: "set by Apply's turn_closed handling (apply.go), cleared here".

   On this branch, `SetUnread` (`manager_rail.go:173`), called from `PUT /api/sessions/{id}/unread` (`rail.go:83`), both sets and clears the flag. It also enforces the `unread ⇒ idle` half itself (`manager_rail.go:180-182`, `if unread && sess.State != StateIdle { unread = false }`) without going through `setState`. `MarkSeen` now holds no body; it delegates. `writeorder.go:72` still lists `MarkSeen` as the whole-row setter that calls `persistWholeRowLocked`, but `SetUnread` is the one that calls it now.

   This breaks `docs/conventions.md` § Design, "Shared state names its writers and its guard", and the "One owner per concept" line: the invariant now has two homes, and the declaration names one of them. A newcomer asking "why is this card unread" reads the field, sees only Apply and attach, and never finds the route. The comment pass judges only comments the diff touched, so it never saw these three. `rg -n "cleared by|MarkSeen" internal/session -g '!*_test.go'` shows them:
   ```
   internal/session/session.go:172:	// input per the watcher's answer; cleared by Manager.MarkSeen (attach on either
   internal/session/writeorder.go:72:// persistWholeRowLocked is the shared tail every whole-row setter (SetTitle, MarkSeen,
   internal/session/manager_rail.go:162:// MarkSeen clears id's Unread flag (kb:adr/rail-unread-inferred-from-live-terminal-client):
   ```
   What a fix must make true:
   - The `Unread` declaration names every writer: Apply, `SetUnread` (the developer's request) and `MarkSeen` (attach, through `SetUnread`).
   - The declaration names both places that keep `Unread ⇒ idle` (`setState` for transitions, `SetUnread` for a request that causes none), or the enforcement moves so that one place is true.
   - `writeorder.go`'s setter list and `MarkSeen`'s comment no longer say the clear happens in `MarkSeen`'s own body.
   - No behaviour changes.

### Notes

1. **[note]** The `dupl` warning (`rail.go:41-65` / `71-95`, pin vs unread handler) is unchanged from cycle 1, and so is my reading of it. The reason's first half holds: a shared helper would take a field name, a message and a setter, which is more indirection than the 25 lines it saves, and `groups.go`'s collapsed handler is the same shape and is not shared either. The second half ("pin renumbers, unread does not") describes the managers, not the handlers. The handler's `writeJSONError(w, http.StatusBadRequest, "invalid_request", …)` matches its own file (`rail.go:49`, `:110`) and most packages (`note.go:47`, `issue.go:197`, `prefs.go:293`). Only `groups.go` and `actions.go` use `respond.go`'s `writeInvalidRequest`, so this is not a divergence from its siblings.
2. **[note]** `handleUnreadSession`/`unreadSessionRequest` (`rail.go:67-71`) and `setSessionUnread` (`api/sessions.ts:103`) have no comment. Their siblings `handlePinSession` (`rail.go:40`) and `pinSession` (`api/sessions.ts:94-98`) cite `kb:anchor/sessions.pin`. `internal/server/CLAUDE.md`'s invariant "a route comment cites its anchor as `kb:anchor/<area>.<name>`" is a stated rule, so it belongs to review-work. Under conventions § Comments ("Default to none"), it is not a maintainability finding.
3. **[note]** The mark actions call `setSessionUnread` inline and outside `track` (`actions.ts:229-230`), as `doPin` does. So `inFlight`/`busy` never cover a mark, the same as for pin. The shape is consistent; I am not asking for a change.
4. **[note]** The cycle 2 comment pass dropped `actionEnabled`'s doc comment (`sessions/card.ts:124`, "The one rule every rail, tile, mainhead and dead-surface button reads, so no surface re-derives it"), which exists on `main`. That was the judge's call under kb:adr/process-comment-pass-owns-code-comments. It means the only text that marked `actionEnabled` as the single source of the enablement rule is gone. `canResume`'s kept comment still says "the one place that rule is written".
5. **[note]** `style.css:901-903`: removing the ADR citation left one comment line well over 100 characters ("…changes neither the meta's size nor the row the cluster wraps on, at any width. While it is hidden its slot stays"). Biome does not format `style.css`, so nothing will reflow it. This is cosmetic.
6. **[note]** The cycle 1 notes on the selection marks' per-id `dispatch` loop (`railmenu.ts:90`), and on the header ⋯ opening the selection menu in Select mode, still apply unchanged. Neither is a maintainability finding.
