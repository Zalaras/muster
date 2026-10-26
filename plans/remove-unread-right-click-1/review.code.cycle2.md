# Correctness review: remove-unread-right-click-1

**Plan**: remove-unread-right-click-1
**Verdict**: approved
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
