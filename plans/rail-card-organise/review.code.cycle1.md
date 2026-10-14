# Correctness review: Rail card menu, drag into groups, and cache warmth

**Plan**: rail-card-organise
**Verdict**: needs-changes
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
