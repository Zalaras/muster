# Review: Rail Card Improvements

**Plan**: rail-card-improvements
**Cycle**: 1
**Verdict**: needs-changes
**Pack**: `kb: pack 31890 words (budget 8000)` — WARN exceeds budget; sections: rules 3167 · features 7327 · diagrams 3807 · decisions 8343 · proposed 1517 · facts 4111 · lessons 3610 · runbooks 2

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 card template order, wrapping `.name` | Yes — `web/index.html` template, `.stripe` / `.card-in` › `.r0`(badge,timer,pin), `.r1`(`.name`), `.r2`, `.r3`, `.activity.you`, `.activity.claude`, `.note`, `.acts-row` | E2E rail-layout E11 + reviewer browser dump (child order read off three live cards) | pass |
| REQ-2 `title` on `.r2` and `.name` | Yes — `web/src/render/sessions.ts:108-131` | rail-layout E11; reviewer confirmed `r2.title === r2.textContent` on every card at all three densities | pass |
| REQ-3 `railDensity` pref, echo-only write | Yes — `internal/server/prefs.go`, `web/src/features/rail.ts` | D13 suites, W7 parse tests, rail-layout E7 | pass |
| REQ-4 density CSS rules | **Partial** — comfortable/expanded correct; compact's ellipsis clause is not delivered (Major 2) | E11 asserts geometry only, so green | **fail** |
| REQ-5 rail-head density control | Yes — `web/index.html` `#rail-density`, `role="group" aria-label="Card density"`, three labelled `.seg-btn`s with inline `aria-hidden` SVGs | rail-layout E7/E12, edge case 22; reviewer read `aria-pressed` across all three states | pass |
| REQ-6 one masthead New session button | Yes — `web/index.html`, `web/src/features/launch.ts:488` | rail-layout E2; reviewer measured `launcherCount 1`, `tilesLauncherCount 0`, parent `masthead` | pass |
| REQ-7 `Session.Unread` | Yes — migration 0009, `internal/session/manager.go:825-832`, `session.go setState` | INV-1 table test, D5/D6/D7 manager suites, rail-unread E3/E4 | pass |
| REQ-8 `Watcher` port + `MarkSeen` | Yes — `internal/session/manager.go:42-47,937-964`, `internal/server/terminal.go:138-146,293-298`, `shells.go:290-296` | D8/D9 suites incl. real-tmux attach tests | pass |
| REQ-9 unread markup and CSS | Yes — `render/sessions.ts:168-176`, `style.css` dot/muted rules | rail-unread E3; reviewer measured dot `rgb(232,230,225)` = `--fg`, `aria-label` suffix, `data-unread` present/absent | pass (visual effect of the read-title rule is Decision 1) |
| REQ-10 unread independent of alive, survives restart | Yes — reconcile never writes it; row round-trips | D10 suites, rail-unread E10 | pass |
| REQ-11 attention priority table | Yes — `web/src/sessions/sort.ts statePriority` | `sort.test.ts` seven-group + boundary + tiebreak tests, rail-unread E5/E6 | pass |
| REQ-12 `Session.LastPrompt` | Yes — `internal/claudecode/interpret.go:83-92`, `machine.go:41-46,163`, store columns | D11/D12 suites, rail-activity E8/E9/E13 | pass |
| REQ-13 `railActivity` pref + Settings fieldset | Yes — `prefs.go`, `web/index.html`, `features/settings.ts` | D13 suites, rail-activity REQ-13 test | pass |
| REQ-14 `activityLines` | Yes — `web/src/sessions/card.ts:145-165` | `card.test.ts` mode × state matrix; reviewer read `on:`/`you:`/`claude:` text off live cards in turn and both modes | pass |
| REQ-15 no rebuild on density change | Yes — attribute/text updates plus a `mousedown` `preventDefault` on the density buttons | rail-layout E12 | pass |
| DIAG | kb:diagram/store-schema and kb:diagram/domain-model both updated in `ba3eaf6`, matching the plan's `## Diagrams` deltas verbatim (0009 columns, `rail_density`/`rail_activity` on User Settings, prose 0001-0009) | — | pass |

## Build & Tests

E2E tests: pass (414)
Daemon tests: pass (all packages)
Web tests: pass (1772)
Daemon build: pass
Web build: pass
Lint: pass (`make lint`, `make web-lint`, `make e2e-lint`)

## Acceptance Checks

All run in one `gates.sh` invocation; full logs in `/tmp/review-gates`.

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass |
| D2 | `go build ./...` | pass |
| D3 | `make lint` | pass |
| D4 | `! rg -n "UserPromptSubmit\|last_assistant_message\|task-notification" internal/session internal/server internal/store --glob '!*_test.go'` | pass |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass |
| W3 | `make web-lint` | pass |
| E1 | `make e2e` (full 414-test regression sweep) | pass |
| — | `make contrast` | pass |
| — | `make check-versions` | pass |
| — | `make check-kb` | pass |
| — | `make e2e-lint` | pass |
| — | `! rg -n 'test\.(skip\|fixme\|only)\(' web/e2e` | pass |
| — | `dead-refs.py --all` | **FAIL — environmental, not this plan** (Note 1) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass, one caveat (below) |

**DOC detail.** All six plan ADRs exist with `status: proposed` and `refs: [plan:rail-card-improvements, …]`: `launch-new-session-button-in-masthead`, `rail-activity-line-turn-aware-default-with-pref`, `rail-attention-order-your-turn-before-active`, `rail-card-state-row-then-wrapping-title`, `rail-unread-inferred-from-live-terminal-client`, `rail-unread-marker-neutral-dot`. No `deviation:` line in any implementation log lacks a record — `daemon-implementation.md` records a spelling correction (`watched` → `Watched`, forced by Go's method-set rules and already spelled with the capital in REQ-8 itself), not a deviation; `web-implementation.md` states `deviation: none` and `doc-delta: none`. Both diagram deltas are applied. `docs/design/design-system.md` §5's Masthead and Rail card sentences are updated. The `TODO.md` rail-cards block (#30/#34/#38/#42) is still unticked and not yet moved to `docs/history/todo-done.md` — the plan assigns that to the orchestrator's Completion step, which runs after this review, so it is outstanding rather than missing.

**Doc Delta vs what shipped.** Every line checks out against code except one: the **rail** line "a read idle title is muted" is true of the token but not of the render (Decision 1). The **settings**, **views**, **tiles**, **launch**, **lifecycle** and **protocol** lines all hold. `docs/protocol.md` was merged at plan approval by the planning session (`c6b775a`), not by an implementation agent, and its text matches the shipped wire and validation behaviour.

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D5–D14 | daemon behaviour by reading and running the daemon tests | pass | Read `internal/session/rail_unread_test.go`, `manager_rail_test.go`, `internal/server/prefs_rail_test.go`, `terminal_rail_test.go`, `shells_rail_test.go`, `sessionwire_rail_test.go`, `internal/store/session_rail_test.go`; INV-1 is genuinely table-driven (6 states × 2 unread seeds × 17 input rows) with per-row clears/untouched expectations, not a per-transition sample |
| W5 | one comparator across sort, `pickNeediest`, `initialLive` | pass | `sort.test.ts` seven-group shuffled-input test, unread-before-started and read-after-working boundary tests, both idle groups' tiebreak, `pickNeediest` head |
| W6 | `activityLines` mode × state matrix | pass | `card.test.ts` covers all four modes, both turn branches, null-source hiding and one-side-null `both` |
| W7 | prefs defaulting / session rejection | pass | `protocol.test.ts` defaults a missing key, parses each enum member, rejects out-of-enum and non-string; `parseSession` rejects a missing `unread`/`lastPrompt` |
| W8 | no `any` in new web code | pass | grepped every added line under `web/src` and `web/e2e` for `: any`, `as any`, `<any>`, `any[]` — no hits |
| W9 | prefs handler is the only writer of the three prefs-driven DOM states | pass | `body.dataset.railDensity` written once, inside `features/rail.ts`'s `prefs` handler; the pressed button and the checked radio both derive from `app.state`/the broadcast, never from the click |
| W10 | `title` attrs, unread class/attr/label | pass | Verified in a real browser, not Vitest — see Manual Verification and Note 2 |
| W11 | template child order | pass | Verified in a real browser — `["r0","r1","r2","r3 unk","activity you","activity claude","note","acts-row"]` on every card |
| INV-6 | prompt text never logged | pass | No `zerolog` call in `internal/session`, `internal/server`, `internal/claudecode`, `internal/store` or `cmd` references `LastPrompt` or `Prompt`; the two new log lines (`MarkSeen` failure, both attach handlers) carry only `session_id` and the error |
| E2–E13 | by reading the specs and the validate report | pass | Read all three new spec files and the six Repairs rows; no assertion deleted, skipped or weakened (detail below) |
| Mockup fidelity | rendered rail matches `mockups/final.html` | **fail on two points** | Row order, dot, icon buttons and masthead placement all match. The compact title has no ellipsis (Major 2) and the read-idle title brightens rather than dims (Decision 1) |

**Repairs table audit.** All six rows verified against the current spec files. Repair #1 is a genuine strengthening: the fixture now closes a first turn successfully ("here's an attempt") before the failing turn ("hit an error") and asserts the `claude:` line still reads the prior reply while the `on:` line is hidden — non-interchangeable strings, so it cannot pass vacuously. Repairs #2–#4 move locators to the masthead button the approved delta mandates and keep the test bodies; #2's `toHaveCount(0)` was proven red by temporarily reintroducing the retired button. Repairs #5–#6 extend two `toEqual` snapshot literals to the approved prefs contract and remain exact-equality assertions, not partial matches. No container-level `toBeVisible()` substitutions, no synthesized payload field that Claude Code does not send (`prompt` on the prompt-submit helper is the measured field of kb:fact/hook-payload-fields).

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — `rg` for `hook_event_name`, `rate_limits`, `"permission_mode"`, `last_assistant_message`, `UserPromptSubmit`, `task-notification` over non-test files of `internal/session`, `internal/server`, `internal/store` returns nothing; the background-completion tag is a const in `internal/claudecode/interpret.go` only, and the neutral field is `StateInput.Prompt *string` |
| 2 | No terminal-output state parsing | pass — no `capture-pane` anywhere in the diff; `unread` is inferred from the terminal registry, not pane text |
| 3 | No blocking hook handler | pass — ingest path untouched; `MarkSeen` sits on the WS attach path, not a hook handler |
| 4 | No bare tmux, no `resize-pane` | pass — no tmux invocation and no `resize-pane` in the diff |
| 5 | No payload logging | pass — see INV-6 above |
| 6 | No empty-gauge dishonesty | pass — `renderContextRow` still builds no track for unknown context and writes "ctx unknown"; compact hides only `.r3 .ctx`, a child that does not exist in the unknown state, so the honest words survive every density (confirmed in the browser: `ctxTrackShown: "(no track)"`, `ctxText: "ctx unknown"` in compact) |
| 7 | Session identity on tmux target | pass — `Watched`/`MarkSeen` key on the Muster session id; no `session_id` identity added |
| 8 | No settings trespass | pass — no `~/.claude/settings.json`, `settings.local.json` write or `CLAUDE_CONFIG_DIR` in the diff |
| 9 | No real `claude` outside canary/probes | pass — every Claude Code interaction in the new specs is a synthesized hook POST via `helpers/payloads.ts` |

## Manual Verification

Drove the real app in Chromium against a real `musterd` (Playwright, a throwaway spec removed afterwards; `git status` clean). Three launched sessions: one with a long title driven to unread idle by a prompt-submit plus `Stop` while the Focus pane showed a third session, one left mid-turn (working), one freshly started.

Checked by hand, not trusted because the suite is green:

- **Masthead and rail head.** Exactly one `#new-session-button`, parent `masthead`; zero `#tiles-new-session-button`. Rail head reads sort select on the left, count and the three density icons on the right. Screenshots at `/tmp/review-gates/rail-comfortable.png`, `rail-compact.png`, `full-focus.png`, `full-tiles.png`.
- **Card anatomy.** Child order on every card is `.r0`, `.r1`, `.r2`, `.r3`, `.activity.you`, `.activity.claude`, `.note`, `.acts-row`. `.name.title` and `.r2.title` equal their own text on all three cards at all three densities.
- **Unread.** Only the unwatched idle card carries `data-unread="true"`, class `unread` and the `, unread` aria-label suffix. Its `::before` dot computes `rgb(232, 230, 225)` = `--fg`. Clicking it attached the terminal and the marker cleared within one render.
- **Density.** Pressed state and `body[data-rail-density]` both follow the echo. Comfortable: the long title wraps to 3 lines (56px box, 18.75px line-height). Compact: one line (16px box at 16.69px line-height, `--fs-md`), both activity lines `display: none`, note clamped. Expanded: activity line becomes `-webkit-box` with a 3-line clamp and a hidden line stays hidden.
- **Activity line.** Turn mode showed `on: add the three-step density control` on the working card and `claude: Found it: …` on the idle one; the no-data card hid both lines with no empty prefix. Switching the Settings radio to Both re-rendered both cards to `you: …` / `claude: …` from the echo.
- **Two defects found here that no gate caught** — the compact ellipsis (Major 2) and the read-idle title's direction of travel (Decision 1). Both measured, not inferred; the numbers are in those entries.

Not verified: a compact render with *known* context data (my fake sessions had no status post, so every gauge was in its unknown state). The CSS is unambiguous on this point — `body[data-rail-density="compact"] .r3 .ctx` hides only the track span, and `renderContextRow` puts the percent and token counts in sibling spans — but I did not see it with real numbers.

## Issues

### Critical

None.

### Major

1. **[web-impl]** REQ-4's compact ellipsis is not delivered — `web/src/style.css:2069-2074` — the rule is inert and the title overflows instead of ellipsizing. `.name` is a `<span>` and `.r1` is now `display: block` (`style.css:1834`), so `.name` computes `display: inline`; `overflow` and `text-overflow` do not apply to a non-replaced inline box. Measured in Chromium at compact density on an 87-character title:

   ```
   nameDisplay      "inline"
   nameTextOverflow "ellipsis"   (declared, inert)
   nameBoxWidth     566px        .r1 is 274px
   nameRight        580          card right edge 299
   ```

   The line is clipped by an ancestor's overflow with no ellipsis character — visible in `/tmp/review-gates/rail-compact.png` as "…a straggler S" cut mid-word. REQ-4 and edge case 15 both say "one line with an ellipsis"; E11 asserts only bounding-box geometry plus the `title` attribute, which is why the suite is green. Fix: give `.name` a block-level formatting context in compact (`display: block` on `.card .name`, or move the clamp onto `.r1`) so the declared `text-overflow` applies. The same inert rule is in `mockups/final.html`, so the mockup does not vindicate the shipped render.

2. **[web-impl]** False comment about shipped parsing behaviour — `web/src/protocol.ts:543-546` — the `railDensity` comment ends "parsePrefs applies the same fallback client-side for a wire value it can't recognise." It does not. `parsePrefsField` (`protocol.ts:512-515`) substitutes the fallback only when the raw value is `undefined`; a present-but-out-of-enum value fails the guard, returns `null`, and rejects the whole prefs object. That rejection is what W7 requires and what `protocol.test.ts:339-347` asserts ("rejects a railDensity value outside the compact|comfortable|expanded enum"). The comment tells the next reader the opposite of what the code and its test do. Fix: say the daemon falls back on a stored value and the client rejects an out-of-enum wire value.

### Minor

1. **[web-impl]** Wrong requirement cited on the strip's new parameter — `web/src/render/tiles.ts:202` — the comment reads `REQ-4/"the strip follows the density pref"` above the `railActivity` parameter. Density reaches the strip through `body[data-rail-density]` and CSS, never through this parameter — the plan's Implementation Notes are explicit that `railDensity` is not threaded through the view-model. The parameter is REQ-14. Cite REQ-14 and drop the density clause.

### Decisions for the orchestrator

1. **[orchestrator:decision]** A read idle card's title renders *brighter* than every other card's, inverting the "drops to muted" intent. `.card.s-idle:not(.unread) .name { color: var(--fg-muted) }` (`style.css:1855-1858`) is REQ-9 to the letter, but the card title's inherited colour is `--fg-dim`, set by `.cards { color: var(--fg-dim) }` (`style.css:522`). In the instrument theme the ladder is `--fg` #e8e6e1 › `--fg-muted` #b2b6c3 › `--fg-dim` #a6abbc, so the rule moves a read title *up* the ladder. Measured side by side in one render: working card title `rgb(166, 171, 188)`, read idle title `rgb(178, 182, 195)`. The mockup does not show this because `mockups/mock.css` omits the `.cards` colour rule, so its titles start at `--fg` and the drop is real there. This also decides whether the plan's Doc Delta line "a read idle title is muted" ships true.

   - **Option A — match the mockup's ladder**: add `color: var(--fg)` to `.card .name`, leaving the read-idle rule as shipped. The drop becomes real, but every card title in the rail and the strip gets brighter than it has ever been, which is a visual change wider than this plan's scope and would want a fresh `make contrast` read.
   - **Option B — keep the base, drop the colour change**: leave titles at the inherited `--fg-dim` and let the read-idle treatment carry itself on the weight drop alone (700 → 600), since no token sits below `--fg-dim`. Narrower, but weight becomes the sole carrier of "read" on the title, with the dot's presence/absence as the second carrier.

### Notes

1. **[note]** The `dead-refs` baseline gate is red, and it is not this plan's doing. All 27 missing references point at `.claude/settings.local.json` (24) and `test/rig/captures/…` (3). Both are gitignored (`.gitignore:32,42`), both exist in the main checkout at `/Users/damian/Documents/code/Projects/muster`, and neither exists in this worktree. Nothing in the diff introduced one, and no pipeline agent can fix it. Worth knowing that `dead-refs --all` will fail for any review run out of a fresh worktree.
2. **[note]** W10 and W11 have no Vitest coverage. `web-tests.md` routes them to `rail-layout.spec.ts` and `rail-unread.spec.ts` under docs/conventions.md §Testing ("rendering/interaction is Playwright's job"), which is the right call and names the owner explicitly. The plan's Reviewer-Verified list says "W5–W7, W10, W11: by reading the Vitest suites and running them", which that split makes impossible. I verified both directly in the browser instead. No change wanted in the code; the plan's wording is what was off.
3. **[note]** `StopFailure` never populates `Session.LastActivity` (only `Failure.Message`), so a session that fails on its very first turn shows no `claude:` line at all in turn mode. `web-implementation.md` flagged this; the E2E repair covered edge case 25 by giving the fixture a prior successful turn, which is what the plan's own wording ("the last reply") describes. This is pre-existing daemon behaviour that REQ-14 does not change, and REQ-14's null-source rule makes hiding the line the honest outcome. Recording it so it is not rediscovered as a bug.
4. **[note]** Every agent's `kb pack` overran the 8000-word budget by 2.5–4×, mine included (31890 words). Five runs in a row is a signal about the pack itself rather than about any one role.
