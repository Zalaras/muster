# Review: remove-unread-right-click-1

**Plan**: remove-unread-right-click-1
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser approved, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: remove-unread-right-click-1

**Plan**: remove-unread-right-click-1
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 64053 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 `PUT /api/sessions/{id}/unread` | Yes — `internal/server/rail.go` `handleUnreadSession` (cookie guard, `*bool` body → 400 `invalid_request`, `ErrUnknownSession` → 404, 204 empty); `internal/session/manager_rail.go` `SetUnread` (true on non-idle degrades to false, unchanged → return before any write, change → one `persistWholeRowLocked` with broadcast) | Yes — D1: `TestSetUnread_*` (14-row state × value matrix with broadcast count + persisted row, unknown id, ended idle, store reload, bystander, attach still clears); `TestHandleUnreadSession_*` (401, 4 bad bodies, 404, 7-row 204/broadcast/no-broadcast table over idle/working/needs_input with a bystander); E1 mark journey asserts `GET /api/state` | pass |
| REQ-2 Mark as read / Mark as unread on every menu | Yes — `railmenuitems.ts` `marks` on both builders, disabled only by `connected`/`busy`; `railmenu.ts` appends them after Pin/Unpin (single) and after Move to behind a separator (selection), selection loops `dispatch` per id; `actions.ts` routes to `setSessionUnread` | Yes — W1 (`railmenuitems.test.ts` card/selection rows, disabled rows; `sessions.test.ts`, `http.test.ts`); R1 exact menu lists in `render/rail.spec.ts`; E1 `rail-menu.spec.ts` single and selection journeys (one PUT per id, exact bodies) and daemon-down test | pass |
| REQ-3 Remove… on live sessions | Yes — `cardMenuItems` pushes Remove unconditionally after Stop…/Resume; `selectionMenuItems` on any non-empty selection | Yes — W1 live row `[["Stop…","end",false],["Remove…","remove",true]]`, all-live selection `["Stop…","Remove…"]`; E1 live single and all-live selection remove journeys ("ends the session first", pane gone, neighbour alive) | pass |
| REQ-4 Focus header holds switch + one ⋯ | Yes — `index.html` `.acts` holds only `button.btn.icon.more` with the plan's exact attributes; `focus.ts` prepends the switch; `mainhead.ts` drops `stopResumeBtn`/`removeBtn`/`renderStopResume`; `.stop-resume` CSS gone | Yes — R1 `focus.spec.ts` live/ended pair (lifecycle buttons count 0, `.surfseg` 1, ⋯ visible, last in `.acts`, `aria-haspopup`/`aria-expanded`); E1 `focus-header.spec.ts` ⋯ keyboard + cluster tests | pass |
| REQ-5 ⋯ opens the focused card's menu | Yes — `focus.ts` click → `deps.railMenu.open({ id: focusedId, card: moreBtn })`, no `at`, so `createMenu` anchors under the button and keeps `aria-expanded` in step | Yes — R1 "the header ⋯ opens the focused card's own menu" compares labels with a right-click on the same card and checks `Actions for <title>`; E1 Stop… then Resume via ⋯ acts on the focused session only | pass |
| REQ-6 note marker inherits no title | Yes — static `title=""` on `.mk` in `#session-card-template` (shared by rail and strip cards); `.r2` keeps its title. Deviation from the plan's `applyRepoBlocks` write is recorded → kb:adr/rail-note-marker-blanks-inherited-title | Yes — R1 `notes.spec.ts` (#106) walks ancestor-or-self to the first `title`, expects `""`, `.r2` still `notes-short / main` | pass |
| DIAG | kb:diagram/daemon-components, kb:diagram/web-components (no new package or directory edge; `features/focus.ts` → `render/sessions` type import is an existing features→render edge); no mermaid fence in the rail/lifecycle/actions/focus/notes specs depicts the changed behaviour | — | pass |

## Build & Tests

E2E tests: pass (383, scoped to 34 files; E1 162 in 10 files) · Daemon tests (race): pass (27 packages ok) · Web tests: pass (3041 in 106 files) · Render tests: pass (422) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues; web lint clean; contrast 0 failures in 3 themes) — all read from $GATES_LOG_DIR (0 failed lines). `WARN size` (rail.go dupl, card.ts 501 lines) is review-maintainability's.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `go test -count=1 -run 'TestSetUnread\|TestHandleUnreadSession' ./internal/session/ ./internal/server/` | pass (22-D1.log) |
| D2 | `go test -count=1 ./internal/session/ ./internal/server/` | pass (23-D2.log) |
| W1 | `cd web && npx vitest run src/features/railmenuitems.test.ts src/api/http.test.ts src/render/mainhead.test.ts` | pass, 92 tests (24-W1.log) |
| R1 | `cd web && npx playwright test -c playwright.render.config.ts render/focus.spec.ts … render/rename.spec.ts` | pass, 191 (25-R1.log) |
| E1 | `make e2e SPECS="rail-menu.spec.ts … notes.spec.ts"` | pass, 162 (26-E1.log) |
| L1 | `make lint` | pass (deduped to 03-lint.log, `golangci-lint run` 0 issues) |
| DOC | doc upkeep + Doc Delta vs what shipped | FAIL — every Doc Delta claim holds against the code, but `docs/design/design-system.md` is listed in the delta and is outside doc-reconcile's scope, so nothing will update it (correctness Major 1); web-impl's `doc-delta:` line about the menu opening "at the pointer" is not in the plan's Doc Delta (Major 2); one proposed ADR supersedes more than it restates (Major 3). TODO tick is the sweep loop's (sweep batch), not a FAIL |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | `docs/protocol.md` § kb:anchor/sessions.unread matches the Protocol delta in substance; no other protocol text changed | pass | `git diff main...HEAD -- docs/protocol.md`: four hunks only: route-table row beside pin; new `sessions.unread` section after `sessions.pin` (auth, required boolean, iff-idle set, clear in any state, no-op 204 with no write/broadcast, one `sessionUpsert`, 400/404); "Also set or cleared by the developer through kb:anchor/sessions.unread" in the session-row comment; "also set or cleared by `kb:anchor/sessions.unread`" in the value-semantics bullet. No `protocolVersion` change. The section's extra sentence (the flag lasts until the next attach or leaving idle; focus alone does not clear it) restates REQ-1's last sentence and the plan's e1 finding |
| RV2 | The header ⋯ uses the existing menu builder through `railMenu.open`; no second menu list | pass | `web/src/features/focus.ts:157-160` calls `deps.railMenu.open`; `main.ts` passes the one `railMenu` from `initRailMenu`; no other `cardMenuItems`/`selectionMenuItems` caller |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — no Claude Code format knowledge in the diff |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass — no ingest change |
| 4 | tmux via `-L muster`; no `resize-pane` sizing | pass — no tmux change |
| 5 | No payload logging | pass — `handleUnreadSession` logs only `session_id` and the error |
| 6 | Empty-gauge honesty | pass — no gauge path touched |
| 7 | Identity on the tmux target | pass — route keys on the Muster session id |
| 8 | No settings trespass | pass |
| 9 | No real `claude` outside canary/probes | pass — E2E uses the stub and `helpers/payloads.ts` builders |

## Issues

### Critical

None.

### Major

1. **[orchestrator]** `docs/design/design-system.md:278-282` (Focus mainhead) still says the surface switch sits "before the one Stop/Resume button (the same box under both labels) and Remove, so a longer title or readout never moves it", and cites kb:adr/focus-surface-switch-pinned-with-actions and kb:adr/actions-mainhead-one-stop-resume-button, which this plan supersedes. That is false about what shipped (REQ-4). The plan's Doc Delta names the sentence under "Also:", but `.claude/agents/doc-reconcile.md` § Boundaries limits doc-reconcile to `docs/features/*/spec.md` and `docs/protocol.md`, so no remaining step will edit it. What a fix must make true: the sentence names the switch and the Session actions ⋯, says they move together, and cites kb:adr/focus-header-holds-switch-and-session-menu.
2. **[orchestrator]** The plan's Doc Delta does not reflect web-impl's `doc-delta:` line (`web-implementation.md` Decisions). Its claim is that the card menu now also opens under the header ⋯, not only at the pointer. The sentence it affects is `docs/features/actions/spec.md:17`: "That menu opens at the pointer, or just under the card from the keyboard". The log names `docs/features/rail`, but the sentence is in the actions spec. The plan's **actions** delta strikes "They live in the Focus mainhead …" but leaves this sentence, which becomes incomplete once the ⋯ opens the same menu anchored under itself. What a fix must make true: amend the **actions** delta to "…at the pointer, just under the card from the keyboard, or under the Focus header's ⋯".
3. **[orchestrator]** kb:adr/rail-card-menu-offers-remove-and-marks-whatever-the-state has `supersedes: [rail-card-menu-on-selected-card-acts-on-selection]`, which supersedes the whole record. The plan's Doc Delta says it supersedes only "the menu-contents part". These parts of the superseded decision still stand but are not restated, so they leave the binding record set:
   - right-clicking a card outside the selection opens that card's ordinary menu and leaves the selection alone;
   - outside Select mode and on the Tiles strip card nothing changes;
   - the carried-forward clause "no action buttons on the card, the pin control on it, no Rename".

   Its Consequences sentence "Remove… is reachable on a live session from the rail and strip menus, the only route to it in Focus now that the header holds none" also leaves out the header ⋯, which opens the same menu. What a fix must make true: the new ADR restates the clauses that still stand and names the header ⋯ as a route to Remove…. The plan's "amending" ADR, kb:adr/rail-unread-also-marked-by-hand, does restate the inference rule in full, so that one is fine.

### Minor

1. **[e2e-specs]** `web/e2e/rail-menu.spec.ts:130`: the test title "Resume resumes the ended session at once as the Focus header's Resume does, …" compares against a control this plan removed (REQ-4). The test body is honest; only the title is now false. What a fix must make true: the title states the behaviour without the header comparison (for example, "as the dead surface's Resume does", if that is what the body checks, or no comparison at all).
2. **[daemon-impl]** `internal/server/CLAUDE.md:3` (hand-written **Owns** line) lists `rail.go (pin, order)`, but `rail.go` now also holds `PUT /api/sessions/{id}/unread`. What a fix must make true: `rail.go (pin, unread, order)`.

### Notes

1. **[note]** Plan Edge Case 3 says "the loop over ids is W1", but W1 tests only the pure item builders. The per-id loop lives in `railmenu.ts` and is covered at E2E instead (`rail-menu.spec.ts` "Mark as read and Mark as unread from a selected card's menu send one request per selected session …", which asserts exactly one PUT per selected id per choice). Coverage exists; only the plan's attribution is wrong.
2. **[note]** REQ-6 names "a rail or strip card". The render test covers the rail card only. The strip card is cloned from the same `#session-card-template`, so the static `title=""` reaches it; no separate strip assertion exists.
3. **[note]** Repairs: I accept all three. In particular, Repair 3 (focus-header E4 viewport pair `[2000, 1000]` → `[2000, 1500]`) is not a weakening. The test's precondition was that the cluster stays on one row through the lengthening. With the narrower switch+⋯ cluster, at 1000 px the cluster fits on row one before the lengthening and wraps to row two after it, so at 1000 px the precondition no longer holds. That wrap is the designed give-way (kb:adr/focus-header-give-way-order-title-last). All four assertions and the lengthening are unchanged, and the 1000 px header is still exercised by the E7 test.
4. **[note]** For review-maintainability: `web/src/features/railmenuitems.test.ts` still reads `marks` through an `as unknown` cast, with a "so it compiles today" rationale that web-impl's typed `marks` field made obsolete. Also, `.btn.icon` has no CSS rule of its own; the header ⋯ matches its sibling `#rail-actions-button`.
5. **[note]** For review-browser: the header ⋯ is static markup with no per-tick write and no disabled state while disconnected (plan Edge Case 5: the menu opens and its items are disabled). Worth measuring live alongside the card menu's daemon-down state.

## Browser review

# Browser review: remove-unread-right-click-1

**Plan**: remove-unread-right-click-1
**Part verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 14319 words (budget 30000)
**Rig**: `make web-build build` at 5190e9e1 (v0.25.3-24-g5190e9e1-dirty; dirty = orchestrator's plan/state files only), each daemon a fresh copy of `bin/musterd` from `helpers/fixtures.ts` on a space-bearing data dir `$TMPDIR/muster e2e-6908ffbc-*` with private `-S <data-dir>/tmux.sock` (killed and deleted at teardown), shared stub `claude` (`$TMPDIR/muster e2e-stub-*/claude`); headless Chromium through two throwaway specs (deleted); gates log 0 failed lines, `e2e`/`web-build` green.

## Matrix

Hosts: **focus** = Focus rail card / Focus header ⋯; **tiles** = Tiles strip card (and the tile header for REQ-6); **pop-out** = `/doc.html`, the docs reader pop-out. It holds no session card, no mainhead and no note marker (`grep -c "mainhead|session-card|class=\"mk\"" web/doc.html` → 0), so every pop-out cell is N/A for that reason. **Daemon-down** = scratch daemon sent SIGTERM (`daemon.kill()`), page left open.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1/2 | focus rail | data | Mark as unread sets `unread` on an idle read card | pass | pointer click → `data-unread="true"`, aria-label `br-alpha, unread`, `/api/state` `unread:true`, still so after a 1.2 s settle |
| REQ-1/2 | focus rail | data | Mark as read clears it | pass | pointer click → `data-unread` absent, wire `false` (settled 1.2 s); keyboard path too: Shift+F10, ArrowDown to `Mark as read` (activeElement checked), Enter → wire `false` |
| REQ-1/2 | focus rail | data | Mark as unread on working / ended session is a no-op, item still enabled | pass | gamma (working): item display flex, visibility visible, opacity 1, not disabled; after click wire `false`, no `data-unread`. delta (ended): wire `false` |
| REQ-2 | focus rail | data | both marks on every card, after Pin, non-danger, enabled whatever the state | pass | idle/idle/working/ended menus each end `…Pin, Mark as read, Mark as unread`; class `mi` (no `danger`), `aria-disabled` false, computed visible/opacity 1 |
| REQ-2 | focus rail | data | selection menu: marks after Move to, per id | pass | `Actions for 2 sessions`: `Stop…, Remove…, New group…, No group, Mark as read, Mark as unread`; Mark as unread over idle+working → alpha `true`, gamma `false` (Edge case 3); Mark as read → both `false` |
| REQ-2 | tiles strip | data | both marks shown; round-trip | pass | `Actions for tl-g1` same 7 labels; Mark as read → wire `false`; Mark as unread → `data-unread="true"`, wire `true`; Mark as read → absent, `false` (each settled 1.5 s) |
| REQ-2 | focus / tiles | no data | marks on menu | N/A — no card exists to open a menu on | |
| REQ-2 | focus rail, header ⋯, tiles strip | daemon-down | menu opens, marks disabled like Pin | pass | banner shown (display block, `musterd unreachable — hook output in open panes…`); every item incl. both marks `aria-disabled` true in rail, header and strip menus (Edge case 5) |
| REQ-3 | focus rail | data | live card offers `Stop…` then `Remove…` (danger) | pass | items 0,1 = `Stop…` (`mi`), `Remove…` (`mi danger`) on idle and working cards; ended card `Resume, Remove…` |
| REQ-3 | focus rail | data | Remove… on live opens today's confirm | pass | dialog `Remove session? br-gamma — … This ends the session first. …`, box 500,352–940,548 inside 1440×900; Cancel sent nothing visible |
| REQ-3 | focus rail | data | all-live selection offers Remove… | pass | labels `Stop…, Remove…, New group…, No group, Mark as read, Mark as unread`; dialog `Remove 2 sessions? 2 of them are alive and will be stopped first.` |
| REQ-3 | tiles strip | data | live strip card Remove… → confirm → removed | pass | dialog `…This ends the session first.…`; confirmed → strip card count 0, `/api/state` titles no longer list `tl-g4` |
| REQ-3 | any | no data / daemon-down | | N/A — no card / disabled per the daemon-down row above | |
| REQ-4 | focus header | data (live idle) | no Stop/Resume/Remove; `.acts` = switch then ⋯ | pass | `#mainhead` buttons: Note, name, group, claude, shell, docs, Session actions; `getByRole(button,/^(Stop|Resume|Remove)/)` count 0; `.acts` children `[DIV.surfseg, BUTTON.btn icon more]` |
| REQ-4 | focus header | data (ended) | no Resume/Remove in header; ⋯ still visible | pass | visible buttons `Note, br-delta, no group▾, claude, shell, docs, Session actions`; ⋯ display block, visible, opacity 1 |
| REQ-4 | focus header | data | ⋯ placed inside the header and the cluster, aria attrs | pass | ⋯ 1395,58–1426,83 inside `.acts` 1223,58–1426,83 inside `#mainhead` 300,46–1440,95; `aria-haspopup=menu`, `aria-expanded=false`, `title=Session actions` |
| REQ-4 | focus header | data, narrow | ⋯ stays in the header as it narrows | pass ≥ 500 px | 1000/800: cluster on row two, ⋯ inside head; 620–500: inside; 480: ⋯ right 485 > head right 480 (see Note 1) |
| REQ-4 | focus header | no data | header hidden | pass | `#mainhead` `hidden`, computed display none; ⋯ width 0 |
| REQ-4 | tiles | data / no data | header ⋯ | N/A — the mainhead is the Focus view's; measured hidden in Tiles (`checkVisibility()` false, width 0) | |
| REQ-4 | focus header | daemon-down | ⋯ stays visible | pass | display block, visible, opacity 1, 1395,90–1426,115 (below the banner) |
| REQ-5 | focus header | data | ⋯ opens the same menu as right-clicking the focused card | pass | label `Actions for br-beta` on both; item labels, classes and disabled flags identical (7 items) |
| REQ-5 | focus header | data | anchored to the button, inside the viewport | pass | menu 1236,87–1426,341 right-aligned with ⋯ right edge 1426, top 4 px below ⋯ bottom 83; at 1000/800/640/480 menu inside viewport (480: 282–472) |
| REQ-5 | focus header | data | `aria-expanded` kept in step, second click closes | pass | open → `true`; second click → no menu, `false`; after choosing an item `false` and activeElement back on the ⋯ |
| REQ-5 | focus header | data | choosing an item acts on the focused session | pass | Mark as unread from ⋯ on focused idle beta → `data-unread="true"`, wire `true`, still `true` after 2.5 s (Edge case 2); Remove… → `Remove session? br-beta — … This ends the session first.` |
| REQ-5 | focus header | data | keyboard: keeps focus across a tick, opens and returns | pass | Shift+Tab/Tab onto ⋯ → activeElement === ⋯, still so after 1.3 s; Enter → menu, activeElement inside menu; Escape → back on ⋯, `aria-expanded=false` |
| REQ-5 | focus header | data (ended) | menu offers Resume | pass | `Actions for br-delta`: `Resume, Remove…, New group…, No group, Pin, Mark as read, Mark as unread` |
| REQ-5 | focus header | data, Select mode | focused card selected → selection menu (Edge case 4) | pass | focused ended delta selected with alpha and gamma → ⋯ opens `Actions for 3 sessions` with the selection items |
| REQ-6 | focus rail | data | the marker inherits no title; `.r2` keeps its own | pass | `elementFromPoint` at marker centre → `use`; first titled ancestor-or-self `SPAN.mk=""`; `.r2` title = repo line; note tip shown after 1.2 s hover (display block, visible, opacity 1, 277,736–577,806). The repo text (`.rf`) still resolves to `.r2`'s title |
| REQ-6 | tiles strip | data | as above | pass | first titled = `SPAN.mk=""`, `.r2` titled |
| REQ-6 | tiles tile header | data | tile marker has no titled ancestor | pass | first titled ancestor-or-self of the tile `.mk` hit point: none |
| REQ-6 | any | no data / daemon-down | | N/A — no note marker without a session; the marker's title is a static template attribute that a disconnect doesn't touch | |
| §6/§7 | focus, tiles | all | honesty/terminal rules on surfaces this plan touches | pass | no Done/cost text in any menu or header; daemon-down banner visible in both hosts; context reads `ctx unknown` and the masthead `unknown` before data; Tiles 2×2 holds 4 `.xterm` for 4 grid sessions, strip cards static |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes
1. **[note]** At a 480 px window the Focus header's content box is 152 px and the cluster (surface switch 141 px plus the ⋯ 25 px) overflows it: ⋯ 460–485 against `#mainhead` right 480 and viewport 480 (`scrollWidth` 185 vs `clientWidth` 180). From 500 px up it fits (500: ⋯ right 486 < head 500). It still opens its menu, and the menu stays in the viewport. The removed Stop+Remove pair made the cluster wider, so this change only improves the old overflow. No change requested.
2. **[note]** The native `title` tooltip itself can't be seen in headless Chromium. REQ-6 was measured on what Chrome reads to show it: the first ancestor-or-self with a `title` attribute from the element under the pointer.
3. **[note]** The single-card menu also has a separator before the marks (web-implementation.md Decisions). That matches REQ-2's ordering ("after Pin/Unpin"); the selection menu has its separator after the Move to entries as REQ-2 says.

## Maintainability review

# Maintainability review: Remove, unread and right-click (1)

**Plan**: remove-unread-right-click-1
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 26100 words (budget 30000)
**Scope**: 18 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (4 of them generated `CLAUDE.md` trailers); `web/index.html` (outside the scope glob) was opened for the header ⋯ markup only

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/server/rail.go | groups.go (`handleSetAllCollapsed`), actions.go (`decodeBatchRequest`), respond.go | yes (daemon Decisions 2, 3) | dupl ×2 (41-65 / 71-95), reason given, mostly holds (Note 1) | pass |
| internal/session/manager_rail.go | apply.go, session.go (`setState`), writeorder.go (`persistWholeRowLocked`), title.go, note.go | yes ("shaped like `MarkSeen`") | none | Major 1 |
| internal/server/CLAUDE.md | — | n/a (generated kb trailer) | none | pass |
| internal/session/CLAUDE.md | — | n/a (generated kb trailer) | none | pass |
| web/src/api/sessions.ts | same file's `pinSession`, `resumeSession` | covered by web Decisions | none | pass |
| web/src/features/actions.ts | railmenu.ts, focus.ts, tiles.ts | no new type | none | pass (Note 3) |
| web/src/features/focus.ts | rail.ts, tiles.ts (`railMenu` dep), groups.ts (`#rail-actions-button`) | yes (header ⋯ reuses `railMenu.open`) | none | pass |
| web/src/features/railmenu.ts | railmenuitems.ts, groups.ts | yes (marks field, separators, per-id loop) | none | pass |
| web/src/features/railmenuitems.ts | sessions/card.ts, batchplan.ts | yes (`marks: CardMenuAction[]`) | none | pass |
| web/src/features/CLAUDE.md | — | n/a (generated kb trailer) | none | pass |
| web/src/main.ts | — (composition root) | n/a | none | pass — one-line `railMenu` dep, already constructed above `initFocus` |
| web/src/render/mainhead.ts | focusview.ts, dead.ts, effortstrip.ts | n/a (removal) | none | pass |
| web/src/render/menu.ts | sessions.ts (`CardMenuRequest`) | covered by the header ⋯ design line | none | pass |
| web/src/render/rename.ts | — (comment-only change) | n/a | none | pass |
| web/src/render/sessions.ts | tiles.ts, rail.ts, railmenu.ts (every `CardMenuRequest` consumer) | yes ("`card` is therefore the opener") | none | Minor 2 |
| web/src/render/CLAUDE.md | — | n/a (generated kb trailer) | none | pass |
| web/src/sessions/card.ts | render/dead.ts, render/tiles.ts, railmenuitems.ts | no new type | filelen 501, unchanged from `main` (501), reason given and holds | Minor 1 |
| web/src/style.css | — (removal of `.stop-resume` and two comments) | n/a | none | pass |

## Issues

### Critical

### Major

1. **[daemon-impl]** `SetUnread` copies `MarkSeen`'s body instead of generalising it — `internal/session/manager_rail.go:189-210` against `:169-187`. This breaks `docs/conventions.md` § Design "Reuse before add": "What it finds is reused or generalised, never copied, whatever Decisions says." `SetUnread(ctx, id, false)` and `MarkSeen(ctx, id)` do the same thing on every input. Both lock `m.mu`, return `ErrUnknownSession` on a miss, return nil without writing when `Unread` is already false, and otherwise clone, clear, clone and call `persistWholeRowLocked(..., true)`. Only the wrapped error text differs. The daemon Decisions line says it "is a setter shaped like `MarkSeen` … rather than a new write path", so the two were meant to share one path, but they are two copies. The Unread lock, no-op check and persist tail now live in two places that must stay in step. Evidence:
   ```
   $ rg -n "\.Unread\s*=|Unread =" internal --type go -g '!*_test.go'
   internal/session/apply.go:94:     sess.Unread = m.watcher == nil || !m.watcher.Watched(musterSessionID)
   internal/session/manager_rail.go:181:     sess.Unread = false        // MarkSeen
   internal/session/manager_rail.go:204:     sess.Unread = unread       // SetUnread
   internal/session/session.go:321:  s.Unread = false               // setState
   ```
   `func (m *Manager) MarkSeen(ctx context.Context, id int64) error` beside `func (m *Manager) SetUnread(ctx context.Context, id int64, unread bool) error`. A fix must leave exactly one locked body that writes `Unread` from outside the state machine. `MarkSeen`'s callers (`internal/server/terminal.go:382`, `renderfix_scenarios_rail.go:214`) must keep their behaviour: no write and no broadcast when the session is already read. The existing `TestSetUnread_*` and `MarkSeen` tests in `internal/session/rail_unread_test.go` must stay green unchanged.

### Minor

1. **[web-impl]** `stopResumeButton` keeps three fields that no production code reads — `web/src/sessions/card.ts:146-166`. The function existed for the Focus header's Stop/Resume button, which this branch deletes (`render/mainhead.ts` `renderStopResume`, `features/focus.ts` click listener). Its one remaining caller, `features/railmenuitems.ts:72`, reads only `primary.label`. `action`, `disabled` and `reason` (and the `resumeDisabledReason` call in it) are now computed for nobody but `sessions/card.test.ts:1125`. Evidence:
   ```
   $ rg -n "stopResumeButton|StopResumeButton" web/src -g '!*.test.ts'
   web/src/features/railmenuitems.ts:8:  stopResumeButton,
   web/src/features/railmenuitems.ts:72:  const primary = stopResumeButton(session, state.connected);
   web/src/sessions/card.ts:146:export interface StopResumeButton {
   web/src/sessions/card.ts:153:export function stopResumeButton(
   ```
   A newcomer reading the type will look for the consumer of `reason`, and the file it sits in is already over the 500-line threshold. A fix must leave no exported field or computation in `sessions/card.ts` that only a test reads. The dead surface keeps its own `resumeDisabledReason`/`actionEnabled` path (`render/dead.ts:79-81`). The matching W3 table in `sessions/card.test.ts:1122-1200` follows in `[web-tests]`'s wave.

2. **[web-impl]** `CardMenuRequest.card` no longer names what it holds — `web/src/render/sessions.ts:20-24`, `web/src/features/focus.ts:160`. The header ⋯ passes `{ id, card: moreBtn }`, a button and not a card. The web Decisions line states the new meaning ("`CardMenuRequest.card` is therefore 'the opener'"), but the field name still says the old one. Every sibling consumer destructures it as `card` (`features/railmenu.ts:68`, `:80`) and passes it to `createMenu().open(opener, …)` (`render/menu.ts`), whose own parameter is already called the opener. This breaks § Design "Match the siblings … naming": the request type and the menu it feeds now use different names for the same value. A fix must make the field name match what every caller passes (the element the menu anchors to and toggles from) across `render/sessions.ts`, `render/tiles.ts`, `features/rail.ts`, `features/tiles.ts`, `features/railmenu.ts` and `features/focus.ts`.

### Notes

1. **[note]** The `dupl` warning on `internal/server/rail.go:41-65 / 71-95` (pin handler vs unread handler) has a two-part reason in daemon Decisions. The first part holds: a shared helper would take the field name, the 400 message and the setter as parameters, which is more indirection than the 25 lines it saves. The groups `collapsed` handler (`groups.go:268`) is the same shape and is also not shared. The second part, "the two handlers are expected to diverge (pin renumbers, unread does not)", describes the managers (`SetPinned` vs `SetUnread`), not the handlers, which stay identical. One small divergence came along with the copy. `handleUnreadSession` writes its 400 with `writeJSONError(w, http.StatusBadRequest, "invalid_request", …)` (`rail.go:79`), copied from the older pin handler. Its neighbour `handleSetAllCollapsed` uses `respond.go:53`'s `writeInvalidRequest`, which that file calls "the rejection every request-body validator answers with". A fix to Major 1 or a later cleanup could align both rail handlers.
2. **[note]** `SetUnread` checks `unread && sess.State != StateIdle` itself (`manager_rail.go:196`), so the `unread ⇒ idle` rule now has two homes: `setState` (`session.go:318-321`) for transitions, and this setter for a request that causes none. The guard is needed because no transition runs on this path. Shared state is fine: the check and the mutation sit under one `m.mu` section, the persist goes through the per-id write turnstile, and `go test -race ./...` (gates `02-test.log`, `internal/session ok`) covers `TestSetUnread_FromEveryReachableState`. I found no interleaving that leaves `Unread` true on a non-idle session.
3. **[note]** In `features/actions.ts:229-230` the marks call `setSessionUnread` inline, while the pin branch beside them calls the one-line wrapper `doPin` (`:161`). Both work the same way (fire and forget, no optimistic state). The difference is cosmetic, and `doPin` arguably earns nothing either.
4. **[note]** The selection menu's marks loop `dispatch` once per id (`features/railmenu.ts:90`, `else for (const id of ids) …`). The web Decisions line gives the reason (the plan has no batch route). Because the `else` branch catches every action that is not `end`/`remove`, any action added to `items.marks` later will loop by default. That is fine today. kb:adr/actions-bulk-stop-remove-are-daemon-batches ("the dashboard never loops") covers Stop/Remove only.
5. **[note]** The header ⋯ uses `railMenu.open`, so in Select mode, with the focused session among the selected cards, it opens the selection menu ("Actions for N sessions") rather than the focused card's own menu (`features/railmenu.ts:110-114`). Whether that is the intended header behaviour belongs to review-work/review-browser.
