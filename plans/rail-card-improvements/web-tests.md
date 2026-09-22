# Web Tests: Rail Card Improvements

**Plan**: rail-card-improvements
**Verdict**: pass
**Pack**: `kb:pack plan=rail-card-improvements role=web-tests features=rail,settings,views,tiles,launch,lifecycle` — 21616 words (WARN exceeds 8000-word budget); sections: rules 841, features 7327, decisions 8343, facts 4111, lessons 986, runbooks 2

## Summary

Repaired the eleven `*.test.ts` files whose `Session`/`Prefs` fixtures no longer compiled
against the plan's new required `unread`/`lastPrompt`/`railDensity`/`railActivity` fields
(sanctioned wave-1 breakage per web-implementation.md's Handoff), plus wrote the plan's new
Vitest coverage for REQ-11 (`sortSessions`/`pickNeediest`'s amended attention table), REQ-14
(`activityLines`'s mode × state matrix) and the protocol layer's `unread`/`lastPrompt`/
`railDensity`/`railActivity` parsing. `card.test.ts` and `sort.test.ts` needed both fixture
repair and new/updated assertions (their old REQ-16/single-`activity`-string assertions no
longer matched the shipped shape); `protocol.test.ts` needed new assertions only, no fixture
repair (its `validSession`/`validSnapshot.prefs` literals needed the four new fields added
throughout, not a generic `makeSession` helper).

Tests created: 47 new test cases (38 new `it`/`it.each` call sites; three `it.each` blocks
expand to 3–4 cases each) | Fixture-only repairs: 9 files | Passing: 1772/1772 | Failing: 0

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|----------------|--------|
| `sessions/sort.test.ts` | orders needs_input, failed, unread idle, started, planning, working, read idle | REQ-11's full seven-group table, shuffled input | pass |
| `sessions/sort.test.ts` | sorts an unread idle session ahead of started | REQ-11's "your turn" group boundary | pass |
| `sessions/sort.test.ts` | sorts a read idle session after working | REQ-11's tail-group boundary | pass |
| `sessions/sort.test.ts` | orders the unread idle group by stateSince ascending | REQ-11's longest-idle-first tiebreak, both idle groups | pass |
| `sessions/sort.test.ts` | picks an unread idle session over a working one | `pickNeediest` reads the amended table (E6 at unit level) | pass |
| `sessions/card.test.ts` | shows 'on: <prompt>' and hides the reply while working/planning/needs_input | `activityLines` turn mode, open-turn branch | pass |
| `sessions/card.test.ts` | shows 'claude: <reply>' and hides the prompt while started/failed/idle | `activityLines` turn mode, closed-turn branch (edge case 25) | pass |
| `sessions/card.test.ts` | hides the prompt line when a turn is open but no prompt recorded yet | no empty-prefix line (edge case 23) | pass |
| `sessions/card.test.ts` | prompt/reply/both mode show/hide rules | REQ-14's remaining three modes, null-source hiding (edge cases 23/24) | pass |
| `sessions/card.test.ts` | `buildCardViewModel` defaults to turn mode / passes mode through | REQ-14 wiring from the view-model builder | pass |
| `sessions/card.test.ts` | `unreadLabel` appends/omits ', unread' | REQ-9's accessible-name suffix | pass |
| `sessions/card.test.ts` | `buildCardViewModel(...).unread` passes `session.unread` through | REQ-9 wiring | pass |
| `protocol.test.ts` | parses/rejects `unread`/`lastPrompt` (8 cases) | REQ-7/REQ-12 wire fields, required-never-defaulted (W7) | pass |
| `protocol.test.ts` | parses/defaults/rejects `railDensity` (6 cases) | REQ-3, D13's client-side mirror of the enum fallback | pass |
| `protocol.test.ts` | parses/defaults/rejects `railActivity` (7 cases) | REQ-13, same fallback discipline | pass |
| `api.test.ts`, `ws.test.ts`, `render/update.test.ts`, `render/mainhead.test.ts`, `render/tiles.test.ts`, `render/dead.test.ts` (×2), `render/sessions.test.ts`, `sessions/store.test.ts`, `sessions/live.test.ts` | (fixture repair only) | added `unread: false, lastPrompt: null` / `railDensity`, `railActivity` to each file's base `Session`/`Prefs` fixture so the tree compiles against the new required fields; no assertion logic changed | pass |

## Coverage vs. plan's unit-test list

- **W5** (`sortSessions`/`pickNeediest`/`initialLive` agree on REQ-11's table): `sort.test.ts`'s
  new tests. `initialLive` (`sessions/live.test.ts`) needed no REQ-11-specific test — its
  existing suite deliberately gives every fixture session the same state so the sort order
  collapses to id order (its own header comment says so), and it's a thin `sortSessions(...)
  .slice(0, n)` wrapper the sort.test.ts suite already exercises at the source; only its
  fixture got the two-field repair.
- **W6** (`activityLines` returns REQ-14's exact strings for every mode × state, null →
  null, `both` with one null → one line): `card.test.ts`'s new `activityLines`/
  `buildCardViewModel` tests, all four modes, both `TURN_OPEN_STATES` branches, and the
  no-data-yet / one-side-null edge cases.
- **W7** (`parsePrefs` defaults `railDensity`/`railActivity`, rejects out-of-enum;
  `parseSession` rejects a session missing `unread`/`lastPrompt`): `protocol.test.ts`'s three
  new describe blocks, plus the pre-existing `validSnapshot`/`validPrefsMessage`/inline
  "ignores unknown fields" tests updated so their `toEqual` still matches the parser's
  now-larger output.
- **W9** (prefs-broadcast-driven DOM state), **W10/W11** (rendered card markup: `.r0`
  order, `title` attributes, `unread`/`data-unread`/aria-label): these are DOM-rendering
  assertions, not logic — `render/sessions.ts` builds them from `<template>` clones, and per
  this project's testing convention (`docs/conventions.md` §Testing: "E2E fakes Claude Code
  ... rendering/interaction is Playwright's job") they belong to the E2E suite, not Vitest.
  `plans/rail-card-improvements/test-specs.md`'s `rail-layout.spec.ts` E11/E12 and
  `rail-unread.spec.ts` E3/E9 own W10/W11/W9 respectively — I read those specs and confirmed
  each asserts exactly the DOM shape W9/W10/W11 name (the `.r0`/`.name`/`.r2` `title`
  attributes, the `unread` class/`data-unread`/aria-label suffix, and the
  broadcast-only-write rule for `body[data-rail-density]` and the checked radio). Building a
  parallel DOM-simulation harness here (as `render/sessions.test.ts`'s pre-existing
  `FakeDomNode` shim does for `reconcileCards`'s *reuse/reorder* contract, a different and
  already-covered concern) would duplicate that coverage against my agent instructions to
  not build a DOM-simulation suite for rendering.
- **REQ-15** (density/activity change never rebuilds cards — attribute/text update only,
  focus survives): DOM/focus behaviour, owned by `rail-layout.spec.ts` E12, which I read and
  confirmed asserts node identity and focus survival across a density click.

No item was left uncovered without a named owner.

## Test Run Output

```
$ npx tsc --noEmit -p .
(no output, exit 0)

$ npx vitest run
 Test Files  43 passed (43)
      Tests  1772 passed (1772)
   Duration  2.46s

$ npx biome check src/api.test.ts src/ws.test.ts src/protocol.test.ts src/render/update.test.ts \
    src/render/mainhead.test.ts src/render/tiles.test.ts src/render/dead.test.ts \
    src/render/sessions.test.ts src/sessions/store.test.ts src/sessions/sort.test.ts \
    src/sessions/card.test.ts src/sessions/live.test.ts
Checked 12 files in 55ms. No fixes applied.

$ make web-lint   # full 177-file repo scan
Checked 177 files in 254ms. No fixes applied.

$ make web-build
✓ built in 1.60s   (exit 0)

$ make web-test
 Test Files  43 passed (43)
      Tests  1772 passed (1772)
```

`dead-refs.py` run against all twelve touched files: `17 references checked, 0 missing`.

## Notes

- Did not touch any implementation file, the E2E specs, or `web/vitest.config.ts` (no setup
  file was needed).
- Left `plans/rail-card-improvements/orchestration-state.json` and `plan.md` untouched, and
  did not stage the daemon-tests agent's concurrent uncommitted `internal/**/*_test.go`
  files — `git status` at the end of this step shows only the twelve `web/src/**/*.test.ts`
  files this agent changed, plus `orchestration-state.json` modified by another process,
  which is excluded from the commit below.
- `web-impl`'s Decisions section flags a daemon-side data gap (`StopFailure` never populates
  `LastActivity`, so `rail-activity.spec.ts`'s edge-case-25 E2E test currently fails against
  the daemon build) — not a web defect and not something a unit test can surface, since
  `card.test.ts`'s own edge-case-25 coverage (`activityLines` turn mode, closed-turn branch)
  constructs `lastActivity` directly on the fixture and correctly validates the pure
  function's contract independent of what the daemon populates. No new implementation-bug
  found by this pass; verdict is `pass`.
