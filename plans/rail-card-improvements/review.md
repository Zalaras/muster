# Review: Rail Card Improvements

**Plan**: rail-card-improvements
**Cycle**: 2
**Verdict**: approved
**Pack**: `kb: pack 32183 words (budget 8000)` — sections rules 3167 · features 7327 · diagrams 3807 · decisions 8343 · proposed 1810 · facts 4111 · lessons 3610 · runbooks 2 (over budget again, see Note 3)

Cycle 1 closed with two Majors and one Minor, all `[web-impl]`, plus one
`[orchestrator:decision]`. Because Majors were open, §9's delta re-review does **not**
apply and this is a full review: every gate re-run, the daemon and web diffs re-read
against the plan, the hard-rule checklist re-derived, and the browser driven again.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 card template (layout C), strip shares it | Yes — `web/index.html` template, `.r0`/`.r1`/`.r2`/`.r3`/`.activity.you`/`.activity.claude`/`.note`/`.acts-row` | Yes — `rail-layout.spec.ts`, verified in browser | pass |
| REQ-2 `title` on `.r2` and `.name` every render | Yes — `web/src/render/sessions.ts` `applyCardText` | Yes — `rail-layout.spec.ts`; measured on every card at all three densities | pass |
| REQ-3 `railDensity` pref, body attribute from broadcast only | Yes — `internal/server/prefs.go`, `web/src/features/rail.ts` | Yes — `prefs_rail_test.go`, `rail-layout.spec.ts` | pass |
| REQ-4 density rules | Yes — `web/src/style.css` three blocks, matching `mockups/final.html` line for line | Yes — `rail-layout.spec.ts` incl. the new cycle-1 ellipsis test | pass |
| REQ-5 rail head composition | Yes — `web/index.html`, `.railhead .n { margin-left: auto }` right-aligns count and control | Yes — `rail-layout.spec.ts`; seen in browser | pass |
| REQ-6 one masthead New session button | Yes — `web/index.html`, `web/src/features/launch.ts` | Yes — `rail-layout.spec.ts`, repaired `tiles-launch.spec.ts` / `rename.spec.ts` | pass |
| REQ-7 `Session.Unread` set/cleared/persisted/broadcast | Yes — `internal/session/{session,manager}.go`, migration 0009 | Yes — `rail_unread_test.go`, `manager_rail_test.go`, `rail-unread.spec.ts` | pass |
| REQ-8 `Watcher` port + `MarkSeen` on both surfaces | Yes — `internal/session/manager.go`, `internal/server/{terminal,shells}.go` | Yes — `terminal_rail_test.go`, `shells_rail_test.go` | pass |
| REQ-9 unread class/attr/label, dot, muted read title | Yes — `render/sessions.ts`, `style.css`; the cycle-1 amendment (`.card .name { color: var(--fg) }`) shipped | Yes — `rail-unread.spec.ts` incl. the new colour test | pass |
| REQ-10 `unread` independent of `alive`, survives restart | Yes — reconcile never writes it; row round-trips | Yes — `session_rail_test.go`, `rail-unread.spec.ts` restart test | pass |
| REQ-11 attention priority table | Yes — `web/src/sessions/sort.ts` `statePriority` | Yes — `sort.test.ts`, `rail-unread.spec.ts` | pass |
| REQ-12 `Session.LastPrompt`, truncation, tag skip, clear reset | Yes — `interpret.go`, `machine.go` | Yes — `interpret_rail_test.go`, `rail-activity.spec.ts` | pass |
| REQ-13 `railActivity` pref + Settings fieldset | Yes — `prefs.go`, `web/index.html`, `features/settings.ts` | Yes — `prefs_rail_test.go`, `rail-activity.spec.ts` | pass |
| REQ-14 `activityLines(session, mode)` | Yes — `web/src/sessions/card.ts` | Yes — `card.test.ts` mode × state matrix | pass |
| REQ-15 no card rebuild on a pref change | Yes — attribute/text updates only; `mousedown` default suppressed on density buttons | Yes — `rail-layout.spec.ts` focus-survival test | pass |
| DIAG | `kb:diagram/store-schema` and `kb:diagram/domain-model` — both deltas applied verbatim, `0001-0008` → `0001-0009` | — | pass |

Both invariants that no command can express were checked directly: INV-5 (one comparator)
holds because `pickNeediest` and `initialLive` both call `sortSessions`; INV-1
(`unread ⇒ idle`) holds structurally because `setState` clears the flag for every
non-idle target and `KindTurnClosed` reaches `setState(StateIdle)` unconditionally, so
`Manager.Apply`'s post-`applyInput` set can never strand it.

## Build & Tests

E2E tests: pass (416, full regression sweep over all 38 spec files, 2.6 min)
Daemon tests: pass (20 packages, `make test`)
Web tests: pass (1772 in 43 files)
Daemon build: pass
Web build: pass
Lint: pass (`make lint` 0 issues; `make web-lint` 177 files clean; `make e2e-lint` clean)

## Acceptance Checks

All run in one `gates.sh` invocation; full logs in `/tmp/review-gates`. A row marked
"deduped" is a pass against this exact tree, not a skip.

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass |
| D2 | `go build ./...` | pass |
| D3 | `make lint` | pass |
| D4 | `! rg -n "UserPromptSubmit\|last_assistant_message\|task-notification" internal/session internal/server internal/store --glob '!*_test.go'` | pass |
| W1 | `make web-build` | pass (deduped) |
| W2 | `make web-test` | pass (deduped) |
| W3 | `make web-lint` | pass (deduped) |
| E1 | `make e2e` | pass (deduped) |
| — | `make contrast` | pass — 43 pairs × 3 themes, 0 failures |
| — | `make check-versions` | pass |
| — | `make check-kb` | pass — 391 records, 23 features, 0 problems |
| — | `make e2e-lint` | pass |
| — | `! rg -n 'test\.(skip\|fixme\|only)\(' web/e2e` | pass |
| — | `dead-refs.py --all` | **FAIL — environmental, not this plan** (Note 1) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass |

No soak was needed: none of the six Repairs rows, and no `TODO.md` or plan entry, names a
flaky spec. Every repair is a contract-delta breakage or a fixture defect.

**DOC detail.** Seven ADRs exist with `status: proposed` and `refs: [plan:rail-card-improvements, …]` —
the plan's six plus `kb:adr/rail-card-title-foreground-token`, added for the cycle-1
decision, whose Context/Options/Decision/Consequences describe exactly the single
`color: var(--fg)` line that shipped. No implementation log carries a `deviation:` line
without a record. Both diagram deltas are applied verbatim. `docs/design/design-system.md`
§5's Masthead and Rail card sentences are updated, and the Rail card sentence now names
the title token. The `TODO.md` rail-cards block (#30/#34/#38/#42) is still unticked and not
yet moved to `docs/history/todo-done.md`; the plan assigns that to the orchestrator's
Completion step, which runs after this review, so it is outstanding rather than missing.
The out-of-scope backlog entry the plan promised (ended sessions surviving one daemon
start) is filed in `TODO.md`.

**Doc Delta vs what shipped.** Every line now checks out against code. The rail line "a
read idle title is muted" was the one that did not in cycle 1; it is now true of the render
as well as the token, measured below. `plans/rail-card-improvements/doc-delta.md` — the
working copy `doc-reconcile` will promote — carries the fix wave's amendment recording the
title token and the compact ellipsis. The settings, views, tiles, launch, lifecycle and
protocol lines all hold against the shipped wire and validation behaviour.

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D5–D14 | daemon behaviour by reading and running the daemon tests | pass | Read the eight new `*_rail_test.go` files and the diff they cover. `TestApplyInput_Unread_INV1` is genuinely table-driven — 6 source states × 2 unread seeds × every input row, with per-row clears/untouched expectations, not a sample |
| W5 | one comparator across `sortSessions`, `pickNeediest`, `initialLive` | pass | `pickNeediest` is `sortSessions(alive)[0]`; `live.ts` maps `sortSessions(sessions)`. `statePriority` encodes REQ-11's seven ranks exactly |
| W6 | `activityLines` mode × state matrix | pass | `card.test.ts`; re-derived the four modes and both turn branches from the source |
| W7 | `parsePrefs` defaults / rejects; `parseSession` rejects missing keys | pass | `parsePrefsField` defaults only on `undefined`; an absent `lastPrompt` fails the `!== null && typeof !== "string"` guard, so a missing key rejects |
| W8 | no `any` in new web code | pass | `rg ':\s*any\b|<any>|as any'` over `web/src` and `web/e2e` returns only the English word in five comments |
| W9 | the prefs handler is the only writer of the three prefs-driven DOM states | pass | `document.body.dataset["railDensity"]`, `app.state.railDensity` and `app.state.railActivity` each have exactly one assignment, all inside `features/rail.ts`'s `prefs` handler; the pressed button and the checked radio derive from those |
| W10, W11 | card attributes and template child order | pass | No Vitest coverage by design (Note 2, carried); verified in the browser — child order `["r0","r1","r2","r3 unk","activity you","activity claude","note","acts-row"]`, aria-label `"review-unread, unread"` on the unread card and the bare title on the read one |
| INV-6 | prompt text never logged | pass | No log call in `internal/session`, `internal/server` or `internal/claudecode` references `Prompt` or `LastPrompt`; the two new `Warn` lines in the attach handlers carry only `session_id` |
| E2–E13 | by reading the specs and the validate report | pass | Read all three new spec files and the Repairs table; the full sweep is green |
| Mockup fidelity | rendered rail at each density matches `mockups/final.html` | pass | The shipped compact and expanded CSS blocks match `final.html:36-43` and the expanded rule line for line, plus the `display: block` the cycle-1 fix added. Screenshots below |

## Manual Verification

Drove the real app in Chromium against a real scratch `musterd` (throwaway Playwright
spec, deleted afterwards; `git status --porcelain` clean). Three sessions: one with a
long title driven to **read** idle while its terminal was attached, one left **working**,
one driven to idle while unwatched (**unread**). Screenshots in `/tmp/review-gates/`:
`c2-comfortable.png`, `c2-compact.png`, `c2-compact-title.png`, `c2-expanded.png`,
`c2-tiles.png`.

Measured by hand, not trusted because the suite is green:

- **Cycle-1 Major 1 (compact ellipsis) is genuinely fixed.** Compact now computes
  `display: block`, `text-overflow: ellipsis`, `white-space: nowrap`; the title box is
  one line (17px at 16.69px line-height), `scrollWidth` 578 against `clientWidth` 274,
  and its right edge sits at 288 inside the card's 299. Cycle 1 measured 566px wide and
  281px past the card edge. The cropped title screenshot shows a painted `…` character,
  not a mid-word clip, which is what the E2E test's geometry assertions alone cannot
  prove.
- **Cycle-1 Decision 1 (read-idle title colour) shipped as Option A and reads correctly.**
  Working title `rgb(232, 230, 225)` = `--fg` `#e8e6e1`; read idle `rgb(178, 182, 195)`
  = `--fg-muted` `#b2b6c3` at weight 600; unread idle `--fg`. The drop is now a real drop
  in the rail, where cycle 1 measured a rise.
- **Honesty rule 6 survives compact.** With no status post, the context row renders
  `ctx unknown` with no track at every density; compact's `.r3 .ctx` rule hides a track
  that does not exist in the unknown state, so the honest word is never replaced by an
  empty gauge.
- **`[hidden]` companion holds in expanded.** A null activity line on the working card
  computes `display: none` and zero height under `body[data-rail-density="expanded"]`,
  despite that block declaring `display: -webkit-box`.
- **Turn-aware activity.** Working card `on: still thinking about this one`; read-idle
  card `claude: Done: the ellipsis now renders properly`. The unread card that received
  a default `Stop` shows `claude: hi`.
- **One launcher.** Exactly one `#new-session-button`, parent `masthead`, zero
  `#tiles-new-session-button`, visible in Focus and in Tiles.
- **Density reaches Tiles.** `body[data-rail-density]` stays `expanded` across the view
  switch; the Tiles toolbar carries only the 2×2/3×2 group.

Not verified: a compact render with **known** context numbers — my synthetic sessions
never posted a status line, so every gauge was in its unknown state. The CSS is
unambiguous (`body[data-rail-density="compact"] .r3 .ctx` hides only the track span,
leaving the percent and token siblings), and cycle 1 recorded the same gap, but I did not
see it with real numbers either.

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — the background-completion tag and the `prompt` payload key live only in `internal/claudecode/interpret.go`; `internal/session` sees `StateInput.Prompt *string`. D4's negative grep is green over the non-test files of all three packages |
| 2 | No terminal-output state parsing | pass — nothing in the diff reads pane text; `Watched` keys on the registry map, not on output |
| 3 | No blocking hook handler | pass — the ingest path is untouched; `MarkSeen` runs on the WebSocket attach path, not a hook |
| 4 | tmux always via a dedicated socket; no `resize-pane` | pass — no tmux invocation in the diff; the only `resize-pane` mention repo-wide is the prohibition in `internal/tmux/CLAUDE.md` |
| 5 | No payload logging | pass — see INV-6 above |
| 6 | No empty-gauge dishonesty | pass — confirmed in the browser at compact density |
| 7 | Session identity on the tmux target | pass — `Watched` and `MarkSeen` take the Muster session id; no `session_id` identity added |
| 8 | No settings trespass | pass — no `~/.claude/settings.json`, `settings.local.json` write or `CLAUDE_CONFIG_DIR` anywhere in the diff |
| 9 | No real `claude` outside canary/probes | pass — every Claude Code interaction in the new specs is a synthesized hook POST through `helpers/payloads.ts` |

## Repairs Table Verification

All six rows re-read against the requirement each assertion is meant to carry. None
deleted, skipped or weakened an assertion:

- Rows 5 and 6 (`shell.spec.ts`, `views.spec.ts`) **strengthened** their exact-equality
  `toEqual` on the `GET /api/state` prefs object to the plan's merged contract, rather
  than relaxing it to a partial match.
- Rows 2, 3 and 4 moved a locator from a view-scoped or now-deleted button to the shared
  masthead button, which is the approved REQ-6 delta; row 2 additionally proves its
  `toHaveCount(0)` absence assertion red by temporarily reintroducing the deleted markup.
- Row 1 is the only substantive repair: the failed-state fixture drove `UserPromptSubmit`
  straight into `StopFailure`, so `lastActivity` was null and the test could never have
  exercised "the last reply" its own title names. The repair adds a prior successful turn
  and asserts the `claude:` line shows the **prior reply**, not the failure message, using
  non-interchangeable strings. That is the assertion REQ-14 and edge case 25 describe.

No fixture payload drifted from the measured captures — the two cycle-1 wave-3 additions
drive the same `SessionStart` / `UserPromptSubmit` / `Stop` sequence the rest of the suite
uses, and assert on computed CSS and DOM geometry rather than on any wire field.

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** The `dead-refs` baseline gate is red for the second cycle running, and it is
   still not this plan's doing. All 27 missing references point at
   `.claude/settings.local.json` (24) and `test/rig/captures/…` (3). Both are gitignored,
   both exist in the main checkout, and neither exists in this worktree. Nothing in the
   diff introduced one and no pipeline agent can fix it. `dead-refs --all` will fail for
   any review run out of a fresh worktree — worth a pipeline note at retro rather than a
   fix here.
2. **[note]** Carried from cycle 1: W10 and W11 have no Vitest coverage by design
   (`web-tests.md` routes them to Playwright under docs/conventions.md §Testing), which
   makes the plan's Reviewer-Verified wording "W5–W7, W10, W11: by reading the Vitest
   suites" impossible as written. Verified in the browser again this cycle. The plan's
   wording is what was off, not the split.
3. **[note]** Every agent's `kb pack` overran the 8000-word budget again; mine is 32183
   words, 4× the budget, and `decisions` alone is 8343. Six runs in a row across two
   cycles is a signal about the pack's own budget or scoping, not about any one role.
4. **[note]** REQ-4's closing sentence "Nothing else differs between densities" is looser
   than the plan's own named design authority: `mockups/final.html:36-43` also varies
   `.r1`/`.r2`/`.r3` top margins, `.name`'s font size and `.note`'s top margin in compact,
   and the shipped CSS matches that file line for line. The implementation followed the
   authority, which is the right call; recording it so the prose/mockup gap is not
   rediscovered as a deviation.
5. **[note]** Carried from cycle 1: `StopFailure` never populates `Session.LastActivity`,
   so a session that fails on its very first turn shows no `claude:` line in turn mode.
   Pre-existing daemon behaviour that REQ-14 does not change, and REQ-14's null-source rule
   makes hiding the line the honest outcome.
