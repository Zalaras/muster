# Correctness review: remove-unread-right-click-1

**Plan**: remove-unread-right-click-1
**Verdict**: needs-changes
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
