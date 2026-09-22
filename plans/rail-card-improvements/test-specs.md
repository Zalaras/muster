# E2E Test Specs: Rail Card Improvements

**Plan**: rail-card-improvements
**Mode**: fix (review cycle 1)
**Pack**: `kb:pack plan=rail-card-improvements role=e2e-specs features=rail,settings,views,tiles,launch,lifecycle` — 23639 words (WARN exceeds 8000-word budget); sections: rules 841, features 7327, decisions 8343, facts 4111, lessons 3009, runbooks 2
**Verdict**: pass
**Tests created**: 21
**Live run**: 416/416 passing (full suite); 460/460 passing across a 10x soak of the 7 files this plan touched (validate attempt 1); 150/150 passing across a 10x soak of the 2 files touched this fix wave (rail-layout.spec.ts, rail-unread.spec.ts)

## Tests

| File | Test Name | Requirement | What It Verifies | Status |
|------|-----------|-------------|------------------|--------|
| web/e2e/rail-unread.spec.ts | a Stop for an unwatched session sets its unread marker; a Stop for the watched session never does | E3, REQ-9 | `Stop` while unwatched sets `data-unread`/`unread` class/`aria-label` suffix; `Stop` while watched (default-focused session) never does | collection-only |
| web/e2e/rail-unread.spec.ts | clicking an unread card clears the marker, and /api/state reports unread:false | E4 | Attach via click clears `data-unread` and the daemon's own `unread` field | collection-only |
| web/e2e/rail-unread.spec.ts | a session watched only by a second window is not marked unread when its turn closes | edge case 4 | "Watched" is session-global, not per-window — window 1 sees B's stop as read even though only window 2 ever attached B | ran-green-at-authoring |
| web/e2e/rail-unread.spec.ts | attaching one session never clears a different session's unread marker | INV-2 | Attaching A leaves B's already-true `unread` untouched | collection-only |
| web/e2e/rail-unread.spec.ts | a new prompt on an unread idle session clears its marker with no attach at all | edge case 5 | `turn_activity` on an unread idle session clears `unread` without any terminal attach | collection-only |
| web/e2e/rail-unread.spec.ts | the attention-mode rail order is needs input, failed, unread idle, started, planning, working, then read idle | E5, REQ-11 | Full 7-group attention order with one session per group | collection-only |
| web/e2e/rail-unread.spec.ts | Opt+Cmd+0 focuses the unread idle session over a merely working one | E6 | `pickNeediest`'s new priority order end to end via the keyboard chord | collection-only |
| web/e2e/rail-unread.spec.ts | after a daemon restart with the tmux pane gone, an unread session reconciles to ended, keeps its marker, and sorts last | E10 | Reconcile preserves `unread` across a restart; Attention mode sorts the dead unread card last | collection-only |
| web/e2e/rail-layout.spec.ts | the masthead's New session button opens the dialog from Focus and Tiles, Opt+Cmd+N still opens it, and no other launcher exists | E2, INV-3 | Single `#new-session-button` in the masthead, visible/functional in both views; old Tiles button gone; chord still opens the dialog | collection-only |
| web/e2e/rail-layout.spec.ts | an empty rail still shows the sort select and the density control with an empty count | edge case 22 | Rail head chrome present with zero sessions | collection-only |
| web/e2e/rail-layout.spec.ts | clicking Compact echoes to body[data-rail-density], persists across a reload, mirrors to a second window, applies to the Tiles strip, and is unaffected while the daemon is down | E7 | Full `railDensity` pref round trip: broadcast-driven DOM, persistence, second-window sync, Tiles strip, daemon-down no-op | collection-only |
| web/e2e/rail-layout.spec.ts | a long title wraps to multiple lines in comfortable density and clamps to one line in compact, with title attributes on .name and .r2 throughout | E11 | Geometry-based wrap/clamp check plus REQ-2's `title` attributes on `.name`/`.r2` | collection-only |
| web/e2e/rail-layout.spec.ts | a card's End button keeps focus and node identity when a density button is clicked | E12, REQ-15 | Density change is an attribute/text update only — no card rebuild, no focus loss | collection-only |
| web/e2e/rail-activity.spec.ts | Settings offers a Rail card shows fieldset with four radios in Turn-aware/Your prompt/Claude's reply/Both order, defaulting to Turn-aware | REQ-13 | Fieldset legend, radio order/names, default checked state | collection-only |
| web/e2e/rail-activity.spec.ts | in Turn-aware mode a prompt-submit gives the card an on: line and the following Stop replaces it with a claude: line | E9 | Default `turn` mode's `activityLines` behaviour end to end, including the "no data yet" hidden state | collection-only |
| web/e2e/rail-activity.spec.ts | choosing Your prompt in Settings turns an idle card's line into a you: line, and the choice persists across a reload | E8 | `prompt` mode plus persistence across reload | collection-only |
| web/e2e/rail-activity.spec.ts | a synthetic background-completion prompt-submit leaves the card's on: line unchanged | E13 | The `<task-notification>` tag is never treated as a real prompt | collection-only |
| web/e2e/rail-activity.spec.ts | Both mode shows only the sides that have data, and hides both when neither does | edge cases 23, 24 | `both` mode's one-side-null and no-data-yet behaviour | collection-only |
| web/e2e/rail-activity.spec.ts | Turn-aware mode on a failed session shows the last reply's claude: line, not an on: line | edge case 25 | `activityLines`'s "otherwise" branch covers `failed`, not just `idle` | collection-only |
| web/e2e/rail-layout.spec.ts | in compact density a long title is truly ellipsized within the card, not overflowing it | review cycle 1 Major 1, REQ-4 | `.name` computes a block-level `display` in compact, `text-overflow: ellipsis`, `scrollWidth > clientWidth`, and the title's box stays inside the card's — added fix wave 3, review cycle 1 | ran-green (fix wave 3) |
| web/e2e/rail-unread.spec.ts | a read idle title drops to --fg-muted while a working title and an unread idle title both stay --fg | decision read-idle-title-colour, REQ-9 | Read-idle `.name` colour equals `--fg-muted`; working and unread-idle `.name` colour both equal `--fg` — added fix wave 3, review cycle 1 | ran-green (fix wave 3) |

18 of the original 19 rows are `collection-only`: each depends on DOM (`data-unread`, `.activity.you`/`.activity.claude`,
`#new-session-button` inside `header.masthead`, `#rail-density`, the `railActivityLegend`/radios) or wire
fields (`unread`, `lastPrompt`) that do not exist yet, and each fails today on a genuine positive
assertion — confirmed live for three of them (see Test Run Output) rather than assumed from reading. One
row — "a session watched only by a second window is not marked unread when its turn closes" (edge case
4) — is a regression pin: its only unread-related assertion is `not.toHaveAttribute("data-unread",
"true")`, true before `data-unread` exists at all, so every other assertion in the test also already
holds against today's tree. Run live per authoring mode's rule for pins (see Test Run Output); it passed.

## Fixture Changes

- `web/e2e/helpers/session.ts` — `SessionObject` gains `unread: boolean` and `lastPrompt: string | null` (kb:anchor/ws.session, REQ-7/REQ-12), additive, no existing field changed. Needed so `/api/state`-based assertions (E4, INV-2) can read the daemon's own `unread` truth as an independent oracle rather than only the DOM.
- `web/e2e/helpers/payloads.ts` — `TurnActivityOpts` (and so `rawUserPromptSubmit`) gains an optional `prompt` field, default unchanged (`"do the thing"`, M0's fixture), exactly the change the plan's Affected Files > E2E section calls out. Used to set a specific prompt text for `lastPrompt`/activity-line assertions and to reproduce the measured `<task-notification>` background-completion shape (kb:fact/background-completion-new-prompt-id) for E13.
- `web/e2e/helpers/railcards.ts` — new file, locators for what REQ-1 through REQ-14 move or add inside the existing card/rail-head/Settings-dialog templates: `railDensityGroup`/`railDensityButton`/`bodyRailDensity` (REQ-5), `newSessionButton` (REQ-6), `cardStateRow`/`cardName`/`cardRepoLine`/`cardActivityYou`/`cardActivityClaude` (REQ-1, REQ-2, REQ-14), `railActivityLegend`/`railActivityRadio`/`railActivityRadios` (REQ-13). Mirrors `helpers/theme.ts`'s one-small-file-per-plan pattern rather than growing `helpers/railorder.ts` (a different plan's file) or `helpers/session.ts` (the shared session-object shape).

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 (card template order/wrap) | rail-layout E11 (geometry), covered structurally by every test that reads `.name`/`.r2`/`.activity.*` |
| REQ-2 (`.r2`/`.name` title attrs) | rail-layout E11 |
| REQ-3 (`railDensity` pref, echo-only write) | rail-layout E7 |
| REQ-4 (density CSS rules) | rail-layout E11 (wrap/clamp geometry), review cycle 1 Major 1 test (compact ellipsis actually applies) |
| REQ-5 (rail-head density control) | rail-layout E7, E12, edge case 22 |
| REQ-6 (single masthead New session button) | rail-layout E2 |
| REQ-7 (`Session.Unread`) | rail-unread E3, E4, edge case 4, edge case 5, INV-2 |
| REQ-8 (watched port) | rail-unread E3, edge case 4, INV-2 |
| REQ-9 (unread markup) | rail-unread E3, decision read-idle-title-colour test (`.name` colour ladder) |
| REQ-10 (unread survives restart) | rail-unread E10 |
| REQ-11 (attention priority table) | rail-unread E5, E6 |
| REQ-12 (`Session.LastPrompt`) | rail-activity E8, E9, E13 |
| REQ-13 (`railActivity` pref + Settings fieldset) | rail-activity REQ-13 test, E8 |
| REQ-14 (`activityLines`) | rail-activity E9, E8, edge cases 23/24/25 |
| REQ-15 (no rebuild on density/activity change) | rail-layout E12 |
| INV-2 | rail-unread INV-2 test |
| INV-3 | rail-layout E2 |

## Repairs (validate / fix modes only)

Not applicable — authoring mode.

## Test Run Output

Full suite not run (authoring mode). Gates executed instead:

```
$ npx playwright test --list
Total: 414 tests in 38 files
(19 new tests collected: rail-unread.spec.ts ×8, rail-layout.spec.ts ×5, rail-activity.spec.ts ×6)

$ sh scripts/e2e-lint.sh
e2e-lint: clean

$ npx tsc --noEmit -p .
(no output, exit 0)

$ npx biome check e2e/rail-unread.spec.ts e2e/rail-layout.spec.ts e2e/rail-activity.spec.ts \
    e2e/helpers/railcards.ts e2e/helpers/session.ts e2e/helpers/payloads.ts
Checked 6 files in 15ms. No fixes applied.
```

The one regression pin was run live per authoring mode's rule (`make web-build build` from the project
root, then the filtered run below), and it passed against the pre-implementation tree:

```
$ make web-build build
✓ built in 2.02s
go build -ldflags "-X main.version=v0.15.0-3-g5264b87" -o bin/musterd ./cmd/musterd

$ npx playwright test rail-unread.spec.ts -g "a session watched only by a second window is not marked unread when its turn closes"
Running 1 test using 1 worker
  ✓  1 [chromium] › e2e/rail-unread.spec.ts:122:1 › a session watched only by a second window is not marked unread when its turn closes (edge case 4) (2.8s)
  1 passed (3.6s)
```

Three of the eighteen `collection-only` rows were also spot-checked live (not required by the mode, done
here to corroborate the "genuinely red today" claim rather than assert it from reading) and each failed
exactly at its first new-behaviour assertion, restored to collection-only status afterward (no product or
test files changed by these runs):

```
$ npx playwright test rail-unread.spec.ts -g "a Stop for an unwatched session sets its unread marker"
  1 failed — rail-unread.spec.ts:72: expect(cardB).toHaveAttribute("data-unread", "true")
    Received: "" (attribute absent — data-unread does not exist on today's card template)

$ npx playwright test rail-layout.spec.ts -g "the masthead's New session button opens the dialog"
  1 failed — rail-layout.spec.ts:29: expect(page.locator("#tiles-new-session-button")).toHaveCount(0)
    Received: 1 (the pre-plan Tiles toolbar button still exists today)

$ npx playwright test rail-activity.spec.ts -g "in Turn-aware mode a prompt-submit gives the card an on: line"
  1 failed — rail-activity.spec.ts:72: expect(cardActivityYou(card)).toHaveText("on: fix the flaky retry")
    element(s) not found (.activity.you does not exist on today's card template)
```

## Notes

- **Fixture plan followed as specified**: all three new files take the per-test `daemon`
  fixture (rail order/attach/restart state and prefs are daemon-global; two tests in
  rail-unread.spec.ts and one in rail-layout.spec.ts open a second browser context).
- **Existing specs the plan names for validate-mode repair** (`tiles-launch.spec.ts`,
  `rail-order.spec.ts`, `shortcuts.spec.ts`, `rename.spec.ts`, and
  `helpers/railorder.ts`/`helpers/session.ts` locators touching `.r1`) were deliberately
  **not** touched here — that repair is explicitly validate mode's job once the
  implementation exists, so today's collection-clean run of those files is the pre-plan
  baseline, not a claim they already reflect the new layout.
- **`.r1` naming drift**: the plan's REQ-1 moves `.name`/badge/pin out of `.r1` into a new
  `.r0`, and repositions `.r1` to be the title row alone containing `.name`. My locators
  (`cardName`, `cardStateRow`) go directly to the leaf classes (`.name`, `.r0`) rather than
  assuming a specific parent nesting, so they should survive whichever exact nesting
  web-impl ships; if validate mode finds the classes don't exist as named, that's a
  `[web-impl]` defect against REQ-1's own literal class list, not a locator guess.
- **Unmeasured wire shape**: none new. `lastPrompt`/`unread` are new fields on an existing,
  already-measured wire object (`Session`); their *shapes* (`string | null`, `boolean`) are
  the plan's own Protocol Contract, not a Claude Code capture, so no `/interface-probe` is
  needed.
- **Geometry-based wrap/clamp assertion (rail-layout E11)**: deliberately avoids asserting a
  specific CSS property (`white-space`, `-webkit-line-clamp`, …) since REQ-4 doesn't pin
  one — it pins the *effect* ("clamps to one line" / "never truncates outside compact").
  Bounding-box height versus computed line-height is the effect itself, so it survives
  whichever CSS technique web-impl picks.
- **"Dead sessions sort last" mode caveat**: `web/src/sessions/sort.ts`'s `orderRail`
  delegates to `sortSessions` (which enforces alive-last) only in `attention` mode; `manual`
  mode's unpinned branch sorts purely by `railPos`/`id` and ignores `alive` entirely. The
  E10 test therefore switches to Attention before asserting "sorts last", mirroring
  `rail-cards.spec.ts`'s pre-existing REQ-9 test — this is existing, unrelated-to-this-plan
  behaviour, not something REQ-10 changes.
- **`.note` element on a failed card** (edge case 25): not asserted — the failure note's
  exact text is pre-existing behaviour outside REQ-14's scope; the test only asserts the
  new `.activity.claude` line REQ-14 adds.
- No test launches a real `claude`; every Claude Code interaction is a synthesized hook POST
  via `helpers/payloads.ts`, per CLAUDE.md's hard rule.

## Validate Attempt 1

Rebuilt (`make web-build build`) and ran the three new spec files live: 18 of 19 passed on the
first run. The one red — "Turn-aware mode on a failed session shows the last reply's claude: line,
not an on: line (edge case 25)" — was my own fixture defect, not an implementation defect, per the
Repairs table below. After that repair all 19 new tests, plus the plan's four named pre-existing
specs (`tiles-launch.spec.ts`, `rail-order.spec.ts`, `shortcuts.spec.ts`, `rename.spec.ts`) and a
full-suite sweep, are green.

`rail-order.spec.ts` and `shortcuts.spec.ts` needed no changes — both were already green against
the implementation (22 and 14 tests respectively). `tiles-launch.spec.ts` and `rename.spec.ts` had
genuine locator drift from REQ-6's masthead move, repaired below. A first full-suite sweep
(`make e2e`, 414 tests) surfaced two more pre-existing specs — `shell.spec.ts` and `views.spec.ts`
— asserting the exact M0/M2 `prefs` snapshot object with `toEqual`; the plan's approved protocol
delta (plan.md line 175: the merged `GET /api/state` example carries `railDensity`/`railActivity`)
directly contradicts their old exact-equality expectations, so those two are sanctioned-breakage
repairs, not implementation bugs. A second full sweep after both rounds of repair: 414/414 passing.

### Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|------------------------|-----|------------------------|
| 1 | rail-activity.spec.ts: "Turn-aware mode on a failed session shows the last reply's claude: line, not an on: line (edge case 25)" | `expect(cardActivityClaude(card)).toHaveText("claude: hit an error")` timed out — element stayed hidden | The fixture drove `UserPromptSubmit` straight into `StopFailure` with no prior successful `Stop`. `internal/session/machine.go`'s `KindTurnFailed` arm never writes `sess.LastActivity` (only `sess.Failure.Message`, the failure note) — confirmed by reading the arm (lines 95-108) and by `web/src/sessions/card.ts`'s `activityLines`, whose "otherwise" branch for `failed` reads `session.lastActivity`, never `Failure`. With no prior `Stop`, `lastActivity` is null, so REQ-14's null-hides-the-line rule (edge case 23) correctly hides it — the fixture could never have exercised "the last reply" the test's own title names. | Added a first `UserPromptSubmit`/`Stop` pair (reply "here's an attempt") before the second `UserPromptSubmit`/`StopFailure` pair (failure message "hit an error"), then assert the claude: line still reads "here's an attempt" — the *prior* reply — not "hit an error". | REQ-14's `failed`-state "otherwise" branch and edge case 25 exactly as named: the last reply displays, not the failure note. Distinguishes the two by using different, non-interchangeable strings for the reply and the failure message. |
| 2 | tiles-launch.spec.ts: "Tiles exposes a New session button that opens the launch modal" | `expect(page.locator("#new-session-button")).toBeHidden()` failed — element visible | Asserted the pre-plan behaviour (masthead button hidden in Tiles, a separate `#tiles-new-session-button` visible) that REQ-6/INV-3 (`kb:adr/launch-new-session-button-in-masthead`) replaces: one masthead button, visible in both views, Tiles' own button removed. Retitled since the old title claimed the now-superseded "Tiles exposes a New session button" scope. | Asserts the shared masthead button (`helpers/railcards.ts`'s `newSessionButton`) is visible in Tiles and `#tiles-new-session-button` has count 0 (deliberately proven red — see below); switched the file's own view-scoped `newSessionButton` helper for the shared masthead-scoped one, since the button no longer lives inside `#view-tiles`. | INV-3 (one launcher, visible in both views) and REQ-6's retired-id half, both from the plan's approved delta. |
| 3 | tiles-launch.spec.ts: "a session launched from Tiles appears as a live tile" / "launching from Tiles with a full 2×2 grid…" | `locator.click: Test timeout of 60000ms exceeded` waiting for `#view-tiles` >> role=button "New session" | Same REQ-6 move: the file's local `newSessionButton()` was scoped to `#view-tiles`, and the button no longer renders there. | Removed the file-local helper; both tests now call the imported `helpers/railcards.ts` `newSessionButton`. | Unchanged test bodies/assertions — only the button locator moved to match the approved delta. |
| 4 | rename.spec.ts: "clicking an unrelated control (New session) still commits an open mainhead rename…" | `locator.click: Test timeout of 60000ms exceeded` waiting for `#view-focus` >> role=button "New session" | Same REQ-6 move: the rail-head button this test clicked to trigger an ordinary blur no longer exists inside `#view-focus`. | Swapped for the shared masthead-scoped `newSessionButton`. | REQ-14's ordinary blur-commit path — the test still clicks a same-named, unrelated control and asserts the rename commits; only which control moved. |
| 5 | shell.spec.ts: "GET /api/state returns exactly the M0 snapshot object once authenticated" | `toEqual` diff: received two extra keys, `railActivity`/`railDensity`, in `prefs` | This is a sanctioned-breakage repair, not my defect: the plan's approved Protocol Contract (plan.md line 175, the merged `GET /api/state` prefs example) adds these two keys with defaults `"comfortable"`/`"turn"`. The pre-existing spec's exact-equality assertion predates the delta. | Added `railDensity: "comfortable", railActivity: "turn"` to the expected `prefs` object, with a comment citing the plan and following the file's own established pattern for every prior protocol addition to this same object. | The M0 snapshot is still asserted byte-for-byte exact (`toEqual`, not a partial match) — strengthened to the new merged contract, not loosened. |
| 6 | views.spec.ts: "GET /api/state's prefs snapshot carries both view and density (M2 protocol delta)" | Same `toEqual` diff, twice — once before and once after a `PUT /api/prefs` | Same sanctioned-breakage cause as #5. | Added the same two keys to both the `before` and `after` expected objects (and the inline type annotations), with a comment citing the plan. | Same as #5 — still an exact match at both snapshot points, extended to the new contract rather than weakened. |

No assertion was deleted, skipped, or weakened.

**Absence-assertion proof (Repair #2's `toHaveCount(0)` on `#tiles-new-session-button`)**: temporarily
reintroduced a `<button id="tiles-new-session-button">` into `web/index.html`'s Tiles density
toolbar, ran `make web-build build`, re-ran the test — it failed exactly at that assertion
(`Expected: 0, Received: 1`). Reverted the markup, rebuilt, and re-ran the file: 3/3 green again.
`git diff --stat web/index.html` shows no residual change.

**Additional file touched, no test-behaviour change**: `web/e2e/helpers/railorder.ts`'s `pinButton`
doc comment named the pin control's container as `.r1`; REQ-1 moved that container to `.r0`
(confirmed in `web/src/render/sessions.ts`, the pin button lives inside `.r0`). The locator itself
(`getByRole("button", { name: /^(Pin|Unpin)$/ })`) is role-based and needed no change — all 22
`rail-order.spec.ts` tests were already green — only the now-false class name in the comment was
corrected, per docs/conventions.md §Comments.

### Test Run Output

```
$ make web-build build && npx playwright test e2e/rail-unread.spec.ts e2e/rail-layout.spec.ts e2e/rail-activity.spec.ts
...
  ✘ Turn-aware mode on a failed session shows the last reply's claude: line... (edge case 25)
  18 passed, 1 failed

# after Repair #1:
$ npx playwright test e2e/rail-activity.spec.ts -g "edge case 25"
  1 passed

$ npx playwright test e2e/tiles-launch.spec.ts e2e/rail-order.spec.ts e2e/shortcuts.spec.ts e2e/rename.spec.ts
  50 passed, 4 failed (tiles-launch ×3, rename ×1 — Repairs #2-4)

# after Repairs #2-4:
$ npx playwright test e2e/tiles-launch.spec.ts e2e/rename.spec.ts e2e/rail-unread.spec.ts e2e/rail-layout.spec.ts e2e/rail-activity.spec.ts
  37 passed

$ npx playwright test --list
  Total: 414 tests in 38 files

$ make e2e   # first full sweep
  412 passed, 2 failed (shell.spec.ts ×1, views.spec.ts ×1 — Repairs #5-6)

# after Repairs #5-6:
$ npx playwright test e2e/shell.spec.ts e2e/views.spec.ts
  9 passed

$ npx playwright test --list
  Total: 414 tests in 38 files

$ make e2e   # second full sweep
  414 passed (2.6m)

$ make e2e-soak SPEC="e2e/rail-unread.spec.ts e2e/rail-layout.spec.ts e2e/rail-activity.spec.ts \
    e2e/tiles-launch.spec.ts e2e/rename.spec.ts e2e/shell.spec.ts e2e/views.spec.ts" N=10
  460 passed (2.1m)   # 46 tests x 10 repeats, zero flakes

$ sh scripts/e2e-lint.sh && npx tsc --noEmit -p . && npx biome check <all 6 touched files>
  e2e-lint: clean; tsc: no output, exit 0; biome: Checked 6 files, no fixes applied
```

### Notes (validate)

- The orchestrator's context named `rail-order.spec.ts` and `shortcuts.spec.ts` as needing
  possible repair for E10/E11 attention order and `.r1` locators; both were already fully green
  (22 and 14 tests) with no repair needed — the plan's REQ-11 attention-order change and REQ-1's
  `.r1`→`.r0` card restructure didn't touch any locator either file uses.
- `web/e2e/helpers/session.ts` needed no repair: its one `.name` reference (`#mainhead h2.name`)
  is the mainhead's own title heading, unrelated to the rail card's `.r0`/`.name` this plan moved.
- Git shows exactly six modified files: `web/e2e/helpers/railorder.ts`, `web/e2e/rail-activity.spec.ts`,
  `web/e2e/rename.spec.ts`, `web/e2e/shell.spec.ts`, `web/e2e/tiles-launch.spec.ts`,
  `web/e2e/views.spec.ts` — no product code under `web/src/`, `cmd/`, or `internal/` was touched.

## Fix Attempt 1 (review cycle 1)

**Task**: cover, without any tagged `[e2e-specs]` issue (kb:lesson/dom-behaviour-gap-between-test-agents), the two user-visible
behaviours this cycle's `## Fix Attempt 1 (review cycle 1)` section of `web-implementation.md` changed —
review cycle 1 Major 1 (the compact ellipsis was inert) and the orchestrator's `read-idle-title-colour`
decision (Outcome A) — which the existing suite passed both before and after the fix, since E11 only
asserts bounding-box geometry and neither existing test reads `.name`'s computed colour.

### New tests

1. **`web/e2e/rail-layout.spec.ts`** — "in compact density a long title is truly ellipsized within the
   card, not overflowing it (review cycle 1 Major 1, REQ-4)". Launches a session with a long title,
   confirms the comfortable-density reference render wraps to more than one line, switches to compact,
   then asserts: computed `display` is not `inline` (the pre-fix defect: `.name` is a bare `<span>`
   inside a block `.r1`, so without a block-level `display` the declared `overflow`/`text-overflow`
   never apply), computed `text-overflow` is `ellipsis`, `scrollWidth` exceeds `clientWidth` (the text
   still logically overflows its box — what `text-overflow` clips — which is also why this comparison
   only discriminates once `display` is block-level: an inline box reports 0 for both), the title's own
   bounding box stays inside the card's (pre-fix the title overflowed ~281px past the card's right
   edge per the review's measurement), and the clamped compact height stays ≤ one line while the
   `title` attribute is preserved.
2. **`web/e2e/rail-unread.spec.ts`** — "a read idle title drops to --fg-muted while a working title and
   an unread idle title both stay --fg (decision read-idle-title-colour, REQ-9)". Builds three sessions
   in one render: a read-idle card (attached, then `Stop`s a watched turn), a working card (`working`
   state, never attached), and an unread-idle card (`Stop`s an unwatched turn). Reads `--fg`/`--fg-muted`
   from the live theme via `helpers/theme.ts`'s `resolvedCssVar` (never hardcoded hex, so the assertion
   holds under whichever of the three themes the daemon fixture starts in) and asserts the read-idle
   card's `.name` computed colour equals `--fg-muted`, differs from `--fg`, and that both the working
   card's and the unread-idle card's `.name` computed colour equal `--fg` — proving the unread-idle
   title is marked only by the dot and weight, never by colour, and that only the read-idle rule drops.

Both tests reuse existing helpers only (`helpers/railcards.ts`'s `cardName`, `helpers/theme.ts`'s
`resolvedCssVar`, `helpers/session.ts`/`helpers/railorder.ts`/`helpers/payloads.ts`'s launch and hook
builders) — no new fixture or locator file was needed. `rail-unread.spec.ts` gained two new imports
(`cardName` from `./helpers/railcards`, `resolvedCssVar` from `./helpers/theme`); no existing import,
locator or assertion in either file was touched.

### Red-then-green proof (both are new assertions pinned to this cycle's fix, not repairs of an
existing one, but each is exactly the kind of "does this really fail against the pre-fix code" claim
the pipeline requires evidence for)

**Test 1** — temporarily removed the one line `display: block;` from
`body[data-rail-density="compact"] .card .name` in `web/src/style.css` (review cycle 1's Major 1 fix
line), rebuilt (`make web-build build`), and ran the test alone:

```
$ npx playwright test e2e/rail-layout.spec.ts -g "review cycle 1 Major 1"
  1 failed — rail-layout.spec.ts:186: expect(metrics.display).not.toBe("inline")
    Expected: not "inline"
```

Restored the line, rebuilt, re-ran: 1 passed. `git diff --stat web/src/style.css` showed no residual
change afterward.

**Test 2** — temporarily removed `color: var(--fg);` from the base `.card .name` rule (the Decision
Outcome A fix line, `web/src/style.css`), rebuilt, and ran the test alone:

```
$ npx playwright test e2e/rail-unread.spec.ts -g "read-idle-title-colour"
  1 failed — rail-unread.spec.ts:497: expect(await cardName(cardW)...).toBe(fg)
    Expected: "rgb(232, 230, 225)"   # --fg
    Received: "rgb(166, 171, 188)"   # --fg-dim, the pre-fix inherited value
```

This reproduces the review's own finding from the other direction: pre-fix, the working card's title
inherited `.cards { color: var(--fg-dim) }` (rgb(166,171,188)), which is *dimmer* than the read-idle
rule's explicit `--fg-muted` (rgb(178,182,195)) — i.e. the read-idle title rendered brighter than a
working card's, exactly the defect the decision names. Restored the line, rebuilt, re-ran: 1 passed.
`git diff --stat web/src/style.css` showed no residual change afterward.

### Gates run this wave

```
$ npx playwright test --list
Total: 416 tests in 38 files   # was 414; +2 new tests, no duplicate titles

$ sh scripts/e2e-lint.sh
e2e-lint: clean

$ npx tsc --noEmit -p .
(no output, exit 0)

$ npx biome check e2e/rail-layout.spec.ts e2e/rail-unread.spec.ts
Checked 2 files in 16ms. No fixes applied.

$ make web-build build && npx playwright test e2e/rail-layout.spec.ts e2e/rail-unread.spec.ts
15 passed (6.0s)   # both files' full suites, including the 2 new tests

$ make e2e   # full-suite sweep
416 passed (2.6m)

$ make e2e-soak SPEC="e2e/rail-layout.spec.ts" N=10
60 passed (26.9s)   # 6 tests x 10 repeats, zero flakes

$ make e2e-soak SPEC="e2e/rail-unread.spec.ts" N=10
90 passed (41.4s)   # 9 tests x 10 repeats, zero flakes
```

### Repairs

None — no existing test was edited; both changes are additive new tests.

No assertion was deleted, skipped, or weakened.

### Notes (fix attempt 1)

- Neither test needed a new fixture shape: both drive the same `SessionStart` /
  `UserPromptSubmit` / `Stop` hook sequence every other test in these two files already uses via
  `helpers/payloads.ts`; no unmeasured wire field is involved (colour and layout are pure CSS/DOM
  reads, not wire assertions).
- `git status --porcelain` after this wave shows exactly two modified files:
  `web/e2e/rail-layout.spec.ts`, `web/e2e/rail-unread.spec.ts`. No product code under `web/src/`,
  `cmd/`, or `internal/` carries any residual change — both temporary reverts used for the red/green
  proof were restored and rebuilt before this log was written.
