# Correctness review: Rail card menu, drag into groups, and cache warmth

**Plan**: rail-card-organise
**Verdict**: needs-changes
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
