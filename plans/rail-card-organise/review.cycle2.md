# Review: rail-card-organise

**Plan**: rail-card-organise
**Verdict**: needs-changes
**Cycle**: 2
**Gates**: 1 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser approved, maintainability approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Rail card menu, drag into groups, and cache warmth

**Plan**: rail-card-organise
**Part verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 62113 words (budget 30000)

The verdict is `needs-changes` for one reason: a red gate line, K1 `make check-kb`. It is the same
line as cycle 1, and it is `[orchestrator]` work waiting on the Claude Code red ritual. No issue is
tagged to a pipeline agent.

This is a full cycle, not a delta cycle (cycle 1 had Majors). The diff since the cycle-1 review
(`ba934267..HEAD`) has three parts:
- 82b2f55a, the orchestrator's doc fixes;
- 1b59d50c, aa58c364 and d520217f, the daemon and web fix waves for maintainability Major 1 and Minors 1-3;
- 45f533fe, the comment pass.

I re-read each changed source file against the plan. The fix waves change no behaviour: the
menu's enable rule, the TTL accept set and each card's `draggable` value are the same as before,
for every input. All four cycle-1 correctness Majors are fixed. The rest of the cycle-1 Requirements
table still holds: no other wire, store or render path changed, and the full sweep is green again.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes. `render/sessions.ts` `contextmenu` → `preventDefault` + `onMenu`; `features/railmenu.ts`; strip via `render/tiles.ts` | E2E rail-menu | pass |
| REQ-2 | Yes. `railmenuitems.ts` now takes Stop/Resume from `stopResumeButton` and each action from `ACTION_BY_LABEL`. Order is unchanged: actions, separator, Move to (via `groups.moveToEntries`), separator, Pin/Unpin | W5 `railmenuitems.test.ts` (unchanged, green); E2E E1/E2 | pass |
| REQ-3 | Yes. The primary entry is pushed only when `session.alive \|\| canResume(claudeSessionId)`, so Resume… is absent, not disabled, when the session cannot resume | unit + E2E `toHaveCount(0)` | pass |
| REQ-4 | Yes. `actions.dispatch` opens the Focus header's Stop and Remove dialogs. Resume… acts at once, as the header's Resume does (Note 3) | E2E | pass |
| REQ-5 | Yes. One `moveToEntries` builder; Pin dispatches `pin` | E2E with bystanders | pass |
| REQ-6 | Yes. No `.acts-row` in `session-card-template`; the pin control stays | E2E INV-3 rail + strip | pass |
| REQ-7 | Yes | E2E | pass |
| REQ-8 | Yes. `menu.ts`'s `at` path replaces the open menu; Escape returns focus to the card | E2E E7 | pass |
| REQ-9 | Yes. `isMenuKey` (ContextMenu, Shift+F10) | E2E | pass |
| REQ-10 | Yes. Each action's `disabled` = `busy \|\| !actionEnabled(label, claudeSessionId, connected)`. For every label it reaches, this equals the old `!connected \|\| busy`, because the Resume entry exists only when `canResume` holds. Pin and Move keep `!connected \|\| busy` | W5; E2E E6 | pass |
| REQ-11 | Yes. `railmenu.ts` closes on `sessionRemoved` for `openFor` | E2E E8 | pass |
| REQ-12 | Yes. `rail.ts` `drop` → `planDrop` | W6; E2E | pass |
| REQ-13 | Yes. An attention-order card drop → `groupMove`; a drop in the card's own section → null | W6; E2E E10 | pass |
| REQ-14 (amended) | Yes. In manual order a drop on a card goes to `moveCard` → `sessions.order` with `groupId`; a drop on a header or the section body goes to `sessions.group`. This matches the amended REQ-14 and the amended ADR | W6; E2E manual order body | pass |
| REQ-15 | Yes. `draggable` is now a controller predicate, `(id) => !selecting \|\| selectedIds.has(id)` (`features/rail.ts:192`); render writes `options.draggable(session.id)` (`render/sessions.ts:229`). It gives the same per-card value as cycle 1's `draggable \|\| isSelected` | new per-id case in `render/sessions.test.ts`; E2E E11/E12 green in `17-e2e` | pass |
| REQ-16 | Yes. `carriedBy` returns the selection; `moveCard` riders land together | W6; E2E | pass |
| REQ-17 | Yes | E2E | pass |
| REQ-18 | Yes | E2E (four no-op drags) | pass |
| REQ-19 | Unchanged | E2E E20 (groups.spec, green) | pass |
| REQ-20 | Yes. Through `groups.settle` into `#action-error` | E2E E13 | pass |
| REQ-21 | Yes. `interpretPromptCache` / `parseCacheTTL` now parse the digits with `strconv.ParseUint(…, 10, 63)`. ParseUint rejects a sign, a fraction, a space, an empty string and `_` at base 10. A value of 2^63 or more is a range error, and the scale-overflow guard is kept. The accept set is unchanged | D1 table (30 rows, incl. `+5m`, `1.5h`, `05m`, `00h`, `99999999999999999h`), green in `02-test.log` | pass |
| REQ-22 | Yes. Only `applyBind`'s rebind sets `sess.Cache = nil` (`internal/session/machine.go:164`) | D5/D6 | pass |
| REQ-23 | Yes | D3/D4 | pass |
| REQ-24 | Yes. `color-mix(in oklab, var(--fg) var(--warmth), var(--fg-dim))` | E2E E14 + every-state | pass |
| REQ-25 | Yes. `remaining*100 <= ttl*15` and `remaining > 0` | W1/W2; E2E | pass |
| REQ-26 | Yes | W3; E2E E16 | pass |
| REQ-27 | Yes. `remainingText` moved to `sessions/format.ts` unchanged; `cache.ts` imports it | its table moved to `format.test.ts` with every row (59.2/59/60/60.5/61/120); new `remainingSeconds` table | pass |
| REQ-28 | Yes. Computed from `now` on every pass | unit; E2E daemon down | pass |
| REQ-29 | Yes. `headerTimer` | W4; E2E E18 | pass |
| REQ-30 | Yes. `groupWarmthHover` now reads `remainingSeconds(m.cache.expiresAt, now)`, same value | W4; E2E | pass |
| REQ-31 | Yes | sections unit; E2E E19 | pass |
| REQ-32 | Yes | D7; E2E E15 | pass |
| REQ-33 | Yes. `TestPromptCacheExpiryIsStopPlusTTL` | compiled under the canary tag; a canary-tier test, not run in this cycle | pass |
| DIAG | `kb:diagram/domain-model` (`CacheWarmth` box and edge, matches the plan delta); `kb:diagram/store-schema` (now 0001-0014, both `cache_*` columns with the plan's NULL notes); `kb:diagram/web-components` (`main.ts` inits 19 controllers, matching `grep -o 'init[A-Z][A-Za-z]*(' main.ts \| sort -u` = 19; `features/` 36, `render/` 38, `sessions/` 15 incl. `testfixtures.ts`, all counted on disk); `kb:diagram/daemon-components` (no import edge changed). Every file changed this cycle maps to one of these via `kb for` | — | pass |

## Build & Tests

E2E tests: pass (840 passed, `17-e2e.log`) · Daemon tests (race): pass (24 packages `ok`, 0 `FAIL`, `02-test.log`) · Web tests: pass (2622 passed in 93 files, `05-web-test.log`) · Daemon build: pass (`01-build.log` empty) · Web build: pass (`04-web-build.log`, only the chunk-size advisory) · Lint: pass (golangci `0 issues.`; biome `No fixes applied`) — all read from $GATES_LOG_DIR

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| build | `go build ./...` | pass |
| test | `make test-race` | pass |
| lint | `make lint` | pass (`0 issues.`) |
| web-build | `make web-build` | pass |
| web-test | `make web-test` | pass (2622) |
| web-lint | `make web-lint` | pass |
| contrast | `make contrast` | pass (instrument/dark/light: 46 pairs, 0 failures) |
| features-inventory | (baseline) | pass (empty log) |
| versions | `make check-versions` | pass (`all fragments fresh`) |
| e2e-honest | (baseline) | pass (empty log) |
| kb-check | `make check-kb` | **FAIL**: `haiku-main-cache-ttl-5m-on-2-1-299.md` and `resume-reads-prior-prompt-cache.md` claim `verified` up to 2.1.300, above the ceiling 2.1.296 (Critical 1) |
| e2e-lint | `make e2e-lint` | pass (`e2e-lint: clean`) |
| features | features-scope | pass |
| comments | comment-checks | pass (`clean`) |
| comment-ledger | comment-pass verify | pass (8 blocks, all kept) |
| size | size-warn | WARN, 7 hits (review-maintainability's) |
| e2e | `make e2e` | pass (840) |
| D1 | `make test` | pass (deduped to test-race) |
| D2 | `make lint` | pass (deduped) |
| D3 | `go build ./...` | pass (deduped) |
| D9 | `! rg -n '"(prompt_cache\|expires_at)"' cmd/ internal/ --glob '!internal/claudecode/**'` | pass (`18-D9.log` empty) |
| W1 | `make web-test` | pass (deduped) |
| W2 | `make web-build` | pass (deduped) |
| E1 | `make e2e` | pass (deduped) |
| K1 | `make check-kb` | **FAIL** (deduped to kb-check; Critical 1) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. All four proposed ADRs are present with `refs: plan:rail-card-organise`. There are no `deviation:` lines (the fix-wave logs add only `design:` lines). Every `doc-delta:` line in both implementation logs now has a disposition under `doc-delta.md` "Amendments from the run": the design-system lines, the corrected "released where it started" sentence, the popover/header markup, and the daemon's corrupt-expiry note. The TODO ticks correctly wait for an approved review (SKILL.md:178). The cycle-1 doc fixes are in place: two diagrams (DIAG row), three `design-system.md` passages (`:213`, `:218-220`, §5 Menu `:299-309`, each now true of the code), the drag ADR's manual-mode sentence, and REQ-14's amendment. I checked the Doc Delta and its amendments against the code: each one holds (Note 2 on one wording) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W7 | no `any` in new web code | pass | `git diff main..HEAD -- 'web/src/**/*.ts' \| grep '^+' \| grep -E '\bany\b\|innerHTML'` gives no hits. The four `as unknown as` hits are in `render/sessions.test.ts`: reflowed existing lines, plus the new predicate case using the file's existing `el as unknown as HTMLElement` cast |
| W8 | tint uses `:root` tokens, no hard-coded white; Light reads dark→grey | pass (code) | the warmth rule is `color-mix(in oklab, var(--fg) var(--warmth), var(--fg-dim))`, with no literal. The Light theme's look is review-browser's to measure; it was measured in cycle 1, and this cycle changed no CSS |
| W9 | no state colour for warmth | pass | none of `--amber`/`--rose`/`--violet`/`--teal` appears in the added warmth rules; `make contrast` green |
| W10 | card menu built by `render/menu.ts` | pass | `features/railmenu.ts:23` `createMenu()`. The only other `createMenu` caller is `groups.ts:150`; there is no second builder |
| D10 | REQ-33 reads `ttl` through Muster's interpreter | pass | `test/canary/canary_test.go` reads `claudecode.InterpretStatus(...).Cache`, and its `TTLSeconds` drives the expected expiry |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. D9 is green. Grepping the branch's added lines, raw `prompt_cache` appears only in `internal/claudecode/claudecodetest/claudecodetest.go`, `internal/claudecode/status_test.go` and `test/canary/canary_test.go` |
| 2 | Terminal-output state parsing | pass. No `capture-pane` or pane-text read added |
| 3 | Blocking hook handler | pass. No hook path changed |
| 4 | Bare tmux / resize-pane | pass. No tmux invocation added |
| 5 | Payload logging | pass. No logging added in `claudecode/status.go` or `session/status.go` |
| 6 | Empty-gauge dishonesty | pass. A null cache → `unknown` / `cache unknown` / plain timer, never cold (`sessions/cache.ts:16`) |
| 7 | Identity on `session_id` | pass. The cache keys on the Muster session; a rebind only clears it |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary | pass. Only `test/canary/` (haiku harness) |

## Delta (delta re-review only)

Not a delta cycle. For the record, the cycle-1 correctness Majors were checked against
`git diff ba934267..HEAD`:

| Prior issue | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 1 correctness Major 1 `[orchestrator]` DIAG: store-schema and web-components stale | `82b2f55a` | diff read; columns and counts checked on disk (DIAG row) |
| cycle 1 correctness Major 2 `[orchestrator]` design-system.md false in three places | `82b2f55a` | each passage re-read against `render/menu.ts` `at` branch, `features/rail.ts:192`, and the template's missing `.acts-row` |
| cycle 1 correctness Major 3 `[orchestrator]` unamended `doc-delta:` lines | `82b2f55a` | `doc-delta.md` "Amendments from the run" covers all four log lines |
| cycle 1 correctness Major 4 `[orchestrator]` drag ADR / REQ-14 wording | `82b2f55a` | ADR and plan diff read; matches `sessions/railorder.ts` `planDrop` |
| cycle 1 maintainability Major 1 / Minors 1-3 (theirs to verify; behaviour checked here) | `1b59d50c`, `aa58c364`, `d520217f` | menu enable rule, TTL accept set and per-card `draggable` value shown unchanged above (REQ-10, REQ-21, REQ-15 rows) |

## Issues

### Critical
1. **[orchestrator]** Gate line K1 / kb-check `make check-kb` FAIL, unchanged from cycle 1.
   - **What fails.** `docs/facts/haiku-main-cache-ttl-5m-on-2-1-299.md` and `docs/facts/resume-reads-prior-prompt-cache.md` claim `verified: 2.1.299..2.1.300`. That is above the ceiling 2.1.296 in `internal/claudecode/observed_versions.txt`.
   - **Why the usual fix is stuck.** The developer chose a canary on 2.1.300. It ran on `main` and went red on `TestModelCatalogPrecheck`, which guards kb:fact/model-catalog-precheck-zero-token: an unknown model is no longer reported as unrecognised. That failure is unrelated to this plan, but it means 2.1.300 cannot be recorded.
   - **What clears it.** Either the red ritual (`docs/claude-code-versions.md`, via `/claude-code-upgrade`) settles the model-catalog fact and a green canary raises the ceiling, or the developer changes how these two planning-time facts record their range.
   - **Owner.** No pipeline agent can fix this, and nothing in this branch's code is involved.

### Major

None.

### Minor

None.

### Notes
1. **[note]** `test/canary/canary_test.go:457` (carried from cycle 1): the comment says the test reads "the first post carrying the key". The loop actually skips posts whose `prompt_cache` the interpreter rejects, and asserts on the first post it accepts.
2. **[note]** For doc-reconcile, on `doc-delta.md`'s manual-mode amendment ("A drop among a section's cards sets position and pin … A drop on a header changes only the group"). A drop in a section's `.gbody` that misses every card is a zone drop: `features/rail.ts` `dropZoneSelector: ".ghead, .gbody"` → `planDrop`'s section branch → `sessions.group`. So it behaves like a header drop (joins the section with its pin kept), not like a drop on a card. Read "among a section's cards" as "on a card" when promoting it. The behaviour itself is as before and is not in question.
3. **[note]** `Resume…` still acts at once with no dialog, matching the Focus header's Resume. REQ-4's "same confirm dialogs" is met only because the header's Resume has none. The ellipsis in the pinned label is a wording call the developer can make. This is carried from cycle 1 and recorded in `doc-delta.md`.
4. **[note]** `web-tests.md` has no section for the review-cycle-1 fix wave (`d520217f`: the per-id `draggable` case, and the `remainingText`/`remainingSeconds` tables moved to `format.test.ts`). Its last recorded count is 2617, while the gate run shows 2622 passed. The tests are in the tree and green; only the log lags.
5. **[note]** For review-maintainability: `railmenuitems.ts` now uses `stopResumeButton` only for its `label`, and gates the push with its own `session.alive || canResume(...)`. That is correct, but the Stop/Resume choice is read from two places.
6. **[note]** The review pack is 62113 words against a 30000 budget (features 21081, decisions 15290, facts 14249).

## Browser review

# Browser review: Rail card menu, drag into groups, and cache warmth

**Plan**: rail-card-organise
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 13140 words (budget 30000)
**Rig**: `make web-build build` at 45f533fe (dirty: plan-dir review files only) → `bin/musterd`, driven per test through `web/e2e/helpers/fixtures.ts` `daemon` (data dir `$TMPDIR/muster e2e-XXXX`, space-bearing; private `-tmux-socket` inside it, killed at teardown), stub `claude` at `$TMPDIR/muster e2e-stub-cd75a542396fd84f`; headless Chromium, throwaway spec `web/e2e/zz-review-browser-c2.spec.ts` (deleted; `git status --porcelain` shows nothing of mine).

Scope: a delta re-review. Cycle 1 approved the full matrix (`review.browser.cycle1.md`). The web changes since ba934267 are three refactors: menu enablement now reads `card.ts`'s `actionEnabled`/`stopResumeButton`, card draggability is now a per-id predicate the controller passes (`draggable: (id) => !selecting || selectedIds.has(id)`), and `remainingText`/`remainingSeconds` moved to `sessions/format.ts`. I re-measured the cells those three touch. I did not re-drive the other cycle-1 cells, because their code did not change.

Gates log read, not re-run: `17-e2e` 840 passed and `04-web-build` is green, so the app I drove is the one that ships. The one red line, `11-kb-check` (a fact record's verified version bound), belongs to the orchestrator and shows nothing in the app.

Hosts: **focus** = the Focus view's rail; **tiles** = the Tiles strip; **pop-out** = `/doc.html`, which renders no cards, menus or headers, so every pop-out cell is N/A for that reason (as in cycle 1). States: **none** = no cache yet / no waiting member; **data**; **down** = scratch daemon SIGTERMed (`daemon.kill()`).

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-2 | focus | data | live bound card: Stop… enabled; no Resume…/Remove… | pass | items `Stop…, New group…, No group, Pin`, all `disabled` false, cursor pointer, display flex/visible/opacity 1; oracle `/api/state` id 1 alive, `claudeSessionId` set |
| REQ-2 | focus | data | live card with no Claude id: Stop… still enabled (Resume rule doesn't leak onto Stop) | pass | id 3 `claudeSessionId` null: `Stop…` enabled, pointer |
| REQ-2/3 | focus | data | ended bound: Resume…, Remove… both enabled | pass | `Resume…, Remove…, New group…, No group, Pin`, all enabled; Remove… danger colour rgb(194,70,70) |
| REQ-3 | focus | data | ended without a Claude id: Resume… absent, Remove… enabled | pass | `Remove…, New group…, No group, Pin`; oracle id 5 `claudeSessionId` null |
| REQ-4 | focus | data | in-flight Stop: the card's menu reopened mid-request is all disabled, still so after a tick, enabled again after | pass | `/end` held open by a route: `Stop…, New group…, No group, Pin` all `disabled` true, colour rgb(90,96,112), cursor default; same after 1.2 s; released: card `.ended`, menu `Resume…, Remove…, …` all enabled |
| REQ-2 | tiles | data | strip menu: live, ended-bound and ended-unbound entries match the rail | pass | strip held `rb2-t-4` (live), `rb2-t-endb`, `rb2-t-endu`: `Stop…`/`Resume…, Remove…`/`Remove…` + Move to + Pin, all enabled |
| REQ-10 | focus | down | every item disabled for live, ended-bound, ended-unbound | pass | all entries `disabled` true, rgb(90,96,112), cursor default; a real pointer click on the first entry of each opened 0 dialogs; `trackMutationBodies` recorded 0 requests |
| REQ-10 | tiles | down | every strip-menu item disabled, all three kinds | pass | the same three strip cards: every entry `disabled` true, cursor default |
| §6.7 | focus/tiles | down | daemon-down shown loudly | pass | `role=alert` "musterd unreachable — …" visible in both views |
| REQ-1 | focus/tiles | data | menu inside the viewport | pass | every opened menu box inside vp 1280×720 (lowest: 30,548–220,712) |
| REQ-15 | focus | data | outside Select mode every rail card `draggable="true"` | pass | `[[1,true],[2,true],[3,true],[4,true]]` |
| REQ-15 | focus | data | Select mode, nothing selected: every card `draggable="false"` | pass | all four `"false"` |
| REQ-15 | focus | data | select A by a real click: only A `"true"`, settled across a tick | pass | `[[1,true],[2,false],[3,false],[4,false]]` at once and after 1.2 s |
| REQ-15 | focus | data | real press-and-drag on unselected B to bravo's header: no drag, nothing sent | pass | 0 `dragstart`, header got no `.drop-target`, 0 requests, bravo DOM `[3]`, "1 selected" kept |
| REQ-16/17 | focus | data | real drag of selected A to bravo's header moves the selection; mode and selection stay | pass | `dragstart` on card 1; header `.drop-target` during the drag; `PUT /api/sessions/group {ids:[1],groupId:2}`; bravo DOM `[3,1]` = oracle (1→2, 3→2); "1 selected", Select `aria-pressed` true |
| REQ-15 | focus | data | the predicate follows the selection after a move and a second pick, and resets on leaving Select | pass | after move `1` true, others false; select D (ungrouped): `1`,`4` true, `2`,`3` false (after 1.2 s); Select off: all four `"true"` |
| REQ-12–20 | tiles | data | strip cards never draggable | pass | strip cards 5 and 6: `draggable="false"` |
| REQ-12–20 | tiles | any | drag behaviour | N/A — Out of scope: no drag in the Tiles strip |
| REQ-27 | focus | data | hover text across the s/m boundary on the page clock | pass | 5m cache 61 s out: `cache warm · cold in 2m` → +1 s `cold in 1m` → +2 s `cold in 59s`; 59 s out: `59s`→`58s`→`57s`; 1h cache: `cold in 60m`, +52 min `cold in 8m` (cooling, `text-decoration-line: underline`) |
| REQ-26 | focus | none | no cache: plain timer, `cache unknown` | pass | started member: `data-cache="unknown"`, title `cache unknown`, rgb(166,171,188) = `--fg-dim` |
| REQ-24/27 | focus | data | past expiry: plain, `cache cold` | pass | the 59 s cache at +60 s: `data-cache="cold"`, title `cache cold`, rgb(166,171,188), no underline |
| REQ-29 | focus | data | header timer follows the latest-entered waiting member | pass | oracle `stateSince` id 2 19:12:09 > id 1 19:12:08; header `data-cache="cooling"` = card 2's, card 1 `warm` (see Note 2) |
| REQ-30 | focus | data | header hover counts warm members and the nearest expiry | pass | `3 of 3 warm · next cold in 59s` → `58s` → `57s`; +60 s `2 of 3 warm · next cold in 1s`; +52 min `1 of 3 warm · next cold in 8m`; the started (unknown) member is never counted |
| REQ-29 | focus | none | no waiting member, no extra timer | N/A here — unchanged code; cycle 1 measured `.gsum .gt` count 0 |
| REQ-31 | focus | data | popover row timers inside the popover, visible | pass | popover 8,152–228,298; four `[data-cache]` rows at x 184–215, y 202–290, visibility visible, opacity 1; states warm/unknown/warm/warm |
| REQ-27 | tiles | data | strip timer hover text | pass | `rb2-w-a` strip card `cache warm · cold in 60m`; `rb2-w-f` (no cache) `cache unknown` |
| REQ-28 | tiles | down | strip hover keeps counting from the last-known expiry with the daemon gone | pass | +30 s after the kill: `cold in 60m` (3570 s, which rounds up to 60m) |
| REQ-28 | focus | down | rail and header keep counting with no frames | pass | +30 s: 59 s cache `cooling`/`cold in 29s`, 61 s cache `cooling`/`cold in 31s`, header `3 of 3 warm · next cold in 29s`; +70 s: both `cache cold`, header `1 of 3 warm · next cold in 59m` |
| all | pop-out | any | — | N/A — `/doc.html` renders no session cards, menus or group headers |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** If you open a card menu while the daemon is down, it closes itself at the next reconnect attempt, with no input. I opened it untouched three times; it was gone after 2.07 s, 3.9 s and 8.0 s, and each close fell on the next `/ws` open (backoff 1/2/4/8 s). The cause is `app.on("status", () => menu.close())` (`web/src/features/railmenu.ts:50`). It runs on every non-connected status emission (`web/src/features/connection.ts:108`), not only on the transition away from connected. This is the codebase-wide pattern: groups menu, popover, confirm dialogs, settings, issue and update all subscribe the same way. So I'm not filing it as a card-menu defect. Fixing only the card menu would make it diverge from those siblings. REQ-10 still holds: every item is disabled whenever the menu is open. Whether the menus and dialogs opened while the daemon is down should survive reconnect retries is a cross-cutting question for the backlog. Separately, clicking a disabled entry closed the menu in some repeats and not in others. That variance is the same retry timing, not the click: the click sent 0 requests and opened 0 dialogs every time.
2. **[note]** `stateSince` has whole-second resolution. When two waiting members enter their states within the same second, the header timer's "latest-entered" pick falls to the tie-break. In my first warmth run, every hook post landed in one second and the header followed the first-driven member. With a 1.5 s gap it followed the later one, which is correct. A real user can't tell the difference, and this code did not change this cycle.
3. **[note]** The masthead's Focus/Tiles switch does not change the view while the daemon is down. The click lands, but the view preference goes through the daemon. That is pre-existing behaviour outside this plan. I mention it only because it is why I measured the focus-down and tiles-down cells from separate daemons.
4. **[note]** The status-line `prompt_cache.expires_at` is parsed as an integer (`strconv.ParseInt`, `internal/claudecode/status.go:179`). A fractional value leaves `cache` null, which shows as `unknown`. My first fixture posted `59.2` and got `unknown`. The measured wire shape is integer seconds, so this is no defect.

## Maintainability review

# Maintainability review: Rail Card Organise

**Plan**: rail-card-organise
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 21319 words (budget 30000)
**Scope**: 38 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (32 code, 1 migration, 5 CLAUDE.md docs). This is a full cycle, because cycle 1 had a Major. Since cycle 1's review commit (`ba934267`), the only non-test code that changed is `internal/claudecode/status.go`, `web/src/features/rail.ts`, `web/src/features/railmenuitems.ts`, `web/src/render/sessions.ts`, `web/src/render/tiles.ts`, `web/src/sessions/cache.ts` and `web/src/sessions/format.ts` (the last one new to the diff). I checked each of these again with its siblings open. Every other file is byte-identical to what cycle 1 reviewed (`git diff --stat ba934267..HEAD` lists no other code file), so cycle 1's result stands for them.

## Cycle 1 issues

| Cycle 1 issue | Fix commit | Verified how |
|---------------|------------|--------------|
| Major 1: `cardMenuItems` re-derived the enable rule and the action vocabulary | aa58c364 | `railmenuitems.ts:2-9` imports `ACTION_BY_LABEL`, `actionEnabled`, `CardAction`, `SessionAction` and `stopResumeButton` from `sessions/card.ts`. `CardMenuAction.action` is typed `SessionAction` (`:21`). Each entry's `action` is `ACTION_BY_LABEL[label]`, and its `disabled` is `state.busy \|\| !actionEnabled(label, …)` (`:53-58`). A change to `actionEnabled` now reaches the menu with no edit to this file. Pin and Move keep `!connected \|\| busy` (`:52`) because they are not `CardAction`s, and the `design:` row says so. |
| Minor 1: `parseCacheTTL` digit loop, with no `design:` line | 1b59d50c | `status.go:196-209`: the loop is gone, and the digits go through `strconv.ParseUint(…, 10, 63)`, which rejects a sign, a fraction and an empty string. A `design:` line in daemon Decisions (Fix Attempt 1) lists what `time.ParseDuration` accepts that the wire must reject (`+5m`, `1.5h`, `1h30m`, `ms`/`us`/`ns`, `0`). A second `design:` line covers `interpretPromptCache`. Both hold. |
| Minor 2: `remainingText` sat outside `format.ts` | aa58c364 | `remainingSeconds`/`remainingText` are now at `sessions/format.ts:20-27`, beside `elapsedSeconds`/`formatTimer`/`formatAge`. `cache.ts:2` imports them. `rg -n "remainingSeconds\|remainingText" web/src --glob '!*.test.ts'` finds one definition each (format.ts) and callers only in cache.ts. |
| Minor 3: draggability was decided in both the controller and render | aa58c364 | `CardOptions.draggable` is now `(id: number) => boolean` (`render/sessions.ts:39`), and render writes `options.draggable(session.id)` without amending it (`:229`). The select-mode policy is only in the controller (`features/rail.ts:192`), and the strip passes `() => false` (`render/tiles.ts:241`). `rg -n "draggable" web/src --glob '!*.test.ts'` shows no other writer of the card attribute. |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/status.go | usageapi.go (`parseResetsAt`), interpret.go | yes (Fix Attempt 1: `parseCacheTTL`, `interpretPromptCache`) | none | pass (Minor 1 fixed) |
| internal/claudecode/claudecodetest/claudecodetest.go | same file's `StatusLineFullOpts` | yes | filelen 641, reason holds | pass (unchanged since c1; Note 4) |
| internal/claudecode/CLAUDE.md | — | doc | — | review-work's |
| internal/server/sessionwire.go | `sessionWireContext` in same file | yes | none | pass (unchanged since c1) |
| internal/session/apply.go | status.go, location.go | yes | none | pass (unchanged since c1) |
| internal/session/machine.go | apply.go | n/a (one line in `applyBind`) | funlen `applyInput` 51, pre-existing, untouched | pass (unchanged since c1; Note 4) |
| internal/session/row.go | `contextFromRow`/`contextToRow` same file | yes | none | pass (unchanged since c1) |
| internal/session/session.go | `Context` same file | yes | none | pass (unchanged since c1) |
| internal/session/status.go | location.go (`adoptClaudeDir`) | yes | none | pass (unchanged since c1) |
| internal/session/writeorder.go | — | n/a (field-list rows) | none | pass (unchanged since c1) |
| internal/session/CLAUDE.md | — | doc | — | review-work's |
| internal/store/migrations/0014_prompt_cache.sql | 0003 | yes | none | pass (unchanged since c1) |
| internal/store/session.go | `last_snapshot_at` decode same file | yes | none | pass (unchanged since c1) |
| web/src/features/actions.ts | groups.ts, rename.ts | Decisions bullet (`actions.inFlight`) | none | pass (unchanged since c1) |
| web/src/features/groups.ts | groupsdialogs.ts, groupsselect.ts, rail.ts | yes | filelen 507, reason partly holds | pass (unchanged since c1; Note 3) |
| web/src/features/rail.ts | groups.ts, tiles.ts, ../sessions/railorder.ts | yes (`planDrop`; Fix Attempt 1 `draggable` predicate) | none | pass (Note 2) |
| web/src/features/railmenu.ts | groups.ts, groupsdialogs.ts, actions.ts | yes | none | pass (unchanged since c1) |
| web/src/features/railmenuitems.ts | ../sessions/card.ts, actionscopy.ts | yes | none | pass (Major 1 fixed; Note 1) |
| web/src/features/tiles.ts | rail.ts | yes (railmenu line) | none | pass (unchanged since c1) |
| web/src/features/CLAUDE.md | — | doc | — | review-work's |
| web/src/main.ts | — | n/a (one-line registration) | none | pass (unchanged since c1) |
| web/src/protocol/session.ts | `parseContext`, `parseSessionPlan` same file | yes (wire) | none | pass (unchanged since c1) |
| web/src/render/anchored.ts | menu.ts, grouppopover.ts | n/a | none | pass (unchanged since c1) |
| web/src/render/grouppopover.ts | railsections.ts | yes | none | pass (unchanged since c1) |
| web/src/render/menu.ts | anchored.ts, grouppopover.ts | Decisions bullet (point-open) | none | pass (unchanged since c1; Note 6) |
| web/src/render/railsections.ts | sessions.ts, grouppopover.ts | yes (header `.gt`) | none | pass (unchanged since c1; c1 Note 6 stands) |
| web/src/render/sessions.ts | tiles.ts, railsections.ts | yes (Fix Attempt 1) | none | pass (Minor 3 fixed) |
| web/src/render/tiles.ts | sessions.ts | n/a (option pass-through) | none | pass |
| web/src/render/warmth.ts | context.ts, actionbutton.ts | yes | none | pass (unchanged since c1) |
| web/src/render/CLAUDE.md | — | doc | — | review-work's |
| web/src/sessions/cache.ts | format.ts, sections.ts, card.ts | yes | none | pass (Minor 2 fixed; c1 Note 4 stands) |
| web/src/sessions/card.ts | format.ts, sections.ts | yes (moved `cardTimerText`) | none | pass (unchanged since c1) |
| web/src/sessions/format.ts | card.ts (`elapsedSeconds` caller), cache.ts | yes (Fix Attempt 1) | none | pass (Note 5) |
| web/src/sessions/railorder.ts | reorder.ts, sections.ts | yes | none | pass (unchanged since c1) |
| web/src/sessions/sections.ts | cache.ts, card.ts | yes | none | pass (unchanged since c1) |
| web/src/sessions/testfixtures.ts | — | n/a | none | pass (unchanged since c1) |
| web/src/sessions/CLAUDE.md | — | doc | — | review-work's |
| web/src/style.css | — (the contrast gate's: 46 pairs, 0 failures) | Decisions bullet (tint) | none | pass (unchanged since c1) |

## Issues

### Critical

### Major

### Minor

### Notes
1. **[note]** `cardMenuItems` calls `stopResumeButton(session, state.connected)` (`web/src/features/railmenuitems.ts:59`) only for its `.label`. The `disabled` and `reason` it computes are thrown away, and `entry` recomputes `disabled` through `actionEnabled`. The result is correct and reads the owner. `session.alive ? "Stop" : "Resume"` would say the same thing with less indirection, but both are acceptable.
2. **[note]** `features/rail.ts` now states the select-mode drag rule twice, both in the controller: `carriedBy` (`:119-121`, "selecting and selected → the whole selection") and the `draggable` predicate (`:192`, "selecting → only selected cards"). They agree. Because of the predicate, `carriedBy`'s single-card fallback while selecting can no longer be reached from the UI. One owner is kept, so nothing is requested.
3. **[note]** `web/src/features/groups.ts` is 507 lines (filelen), unchanged since cycle 1. The Decisions reason holds for `moveToEntries`/`moveSessions`, and less well for `reorderSection` (cycle 1 Note 1 stands).
4. **[note]** The size log's other hits fall to others or are carried forward. `claudecodetest.go` is 641 lines, and its reason holds (it was about 620 before this branch). `machine.go:23` `applyInput` is pre-existing and untouched. The test-file funlen hits (`status_test.go:148` 62 > 60, `session/cache_test.go:291` 80, `store/session_test.go:181` 99, `canary_test.go:369` 44) are the test agents'. There are no `dupl` hits.
5. **[note]** `remainingSeconds` (`web/src/sessions/format.ts:20`) sits beside `elapsedSeconds`, which guards `NaN` and clamps to zero. `remainingSeconds` does neither. Not clamping is deliberate, because a negative remainder is how `cacheWarmth` reads cold. The `NaN` case is shut out upstream: `parseCache` (`protocol/session.ts:255`) rejects an unparseable `expiresAt`. A future caller that passes an unvalidated string would get `NaN`, so a doc comment saying "may be negative; caller passes a validated ISO" would help the next reader. That belongs to the comment pass.
6. **[note]** Comments the point-open path made stale, for the comment pass. `render/menu.ts:8-9`'s header ("the opener … only has its `aria-expanded` written") and the `Menu.open` doc (`:34`, "Opens `entries` under `opener`, or closes the menu if `opener` already has it open") both describe only the anchored path. With `at`, the menu opens at a point, writes nothing on the opener and never toggles. `render/sessions.ts:201` ("never set to 'false', matching the pattern `draggable` below uses") is wrong too: `draggable` is written as an explicit `"false"` (`:229`). That line is pre-existing.
7. **[note]** `features/railmenu.ts:24` `openFor` is never cleared when the menu closes some other way. A later `sessionRemoved` for that id calls `menu.close()` on a closed menu, which is a no-op. Harmless.
8. **[note]** For review-work, outside my scope: the gates' one red line is `11-kb-check.log`. `docs/facts/haiku-main-cache-ttl-5m-on-2-1-299.md` and `docs/facts/resume-reads-prior-prompt-cache.md` have a verified upper bound of 2.1.300, above the version record ceiling of 2.1.296 (`internal/claudecode/observed_versions.txt`).
