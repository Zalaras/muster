# Web Tests: m1-sessions

**Plan**: m1-sessions
**Verdict**: pass

## Summary

Tests created/added: 128 new | Existing (unchanged) kept: 58 | Total suite: 186 passing
Test files: 10 (5 new, 3 extended, 1 repaired, 1 unchanged)

`npx tsc --noEmit`, `npm test`, `npm run build`, `make web-test`, `make web-build` all exit 0.

Updated in fix cycle 1 / wave 2 (review cycle 1): 2 assertions in `card.test.ts` repinned to
the new attention-note since-timer behavior (review Major 4), plus 1 new regression test —
see "Fix Cycle 1, Wave 2" below.

## Tests

| File | Test Name (representative) | What It Tests | Status |
|------|-----------|---------------|--------|
| `sessions/sort.test.ts` (new, 13 tests) | state priority ordering, needs_input longest-blocked-first, failed most-recent-first, planning/working/started/idle `stateSince` ascending, id tiebreak, unparsable timestamp doesn't throw | REQ-16 sort function, every state + all three orderings + tiebreaks | pass |
| `sessions/format.test.ts` (new, 24 tests) | `elapsedSeconds`/`formatTimer`/`formatAge` boundary values (0/59/60/3599/3600/86399/86400s), future timestamp clamped to zero, unparsable/empty timestamp → 0 | pure formatter boundaries and null/unparsable-input safety | pass |
| `sessions/card.test.ts` (new, 26 tests) | title→"untitled", badge/class for all 6 states, repo-line (present/absent/worktree/no-branch), context row always "ctx unknown" even when usedPct etc. present, note precedence attention>failure>first-launch, REQ-17 trust-vs-no-signal timing at exact 10s boundary, `ended` flag | the honesty-rule view-model REQ-15/16/17/18/21 | pass |
| `sessions/store.test.ts` (new, 6 tests) | `replaceAll` wholesale replace, `upsert` add/overwrite-by-id, replaceAll then upsert only touches one id | `SessionStore` snapshot-replace + upsert-merge semantics | pass |
| `api.test.ts` (new, 15 tests) | `launchSession`/`fetchRepos`/`browse` success decode, 4xx/5xx error-envelope decode, malformed success body, malformed error body, `res.json()` throwing, path URL-encoding, omitted optional `title` | protocol decoding for the three new HTTP endpoints, including malformed/error paths | pass |
| `protocol.test.ts` (extended, +32 tests) | `parseSession` full §5.3 shape, every state value, the "no data yet" fresh-launch shape (null repo/model/claudeSessionId, all-null context) decodes successfully, every reject branch (bad attention/failure/repo/model/permissionMode/context), `sessionUpsert` parse + reject, snapshot with populated sessions array | protocol decoding for the M1 Session shape + `sessionUpsert` message | pass |
| `ws.test.ts` (extended, +2 tests) | `dispatch` routes `sessionUpsert` to `onSessionUpsert` not `onSnapshot`; full fake-socket lifecycle test dispatches a `sessionUpsert` frame | new WS message-type routing added in M1 | pass |
| `render/sessions.test.ts` (repaired) | kept only the honest-empty-state assertion; removed the two M0-placeholder-text assertions that now throw | see Implementation Bugs note below — this was a **test bug**, not an implementation bug | pass |
| `render/masthead.test.ts`, `render/banner.test.ts` | unchanged | pre-existing M0 coverage, still valid | pass |

## Implementation Bugs

None. Verdict is `pass`, not `implementation-bug`.

## Test-bug fix (not an implementation bug) — `render/sessions.test.ts`

web-impl's handoff note flagged that `render/sessions.test.ts`'s two non-empty-list
assertions (`"3 sessions"` / `"1 sessions"`) now throw `ReferenceError: document is not
defined` because the M0 placeholder text they pinned was correctly replaced by real
`#session-card-template` DOM rendering, per the plan's own Affected Files entry for
`render/sessions.ts` ("Real rail cards, built from `#session-card-template`... Replaces
the 'N sessions' stub"). This is a test bug (stale expected value asserting removed
behavior), not an implementation defect — the plan explicitly calls for this file to
change.

Per `docs/conventions.md` ("interaction and rendering are Playwright's job") and this
agent's brief ("do not build a DOM-simulation test suite"), the fix was not to build a
jsdom harness for the non-empty branch — that DOM-rendering path is already covered by
`web/e2e/sessions.spec.ts` (card rendering, badges, notes, sort order) and by the new
`sessions/card.test.ts`, which unit-tests the exact view-model `render/sessions.ts`
paints into the DOM. I removed the two stale assertions and kept the one assertion that
is genuinely DOM-free (`renderSessions(el, [])` short-circuits before touching
`document`), with a comment pointing at where the removed coverage now lives.

## Test Run Output

```
$ npx tsc --noEmit
(exit 0, no output)

$ npm test
 Test Files  10 passed (10)
      Tests  185 passed (185)
   Duration  498ms

$ npm run build
> tsc --noEmit && vite build
✓ built in 69ms
```

## Fix Cycle 1, Wave 2 (review cycle 1)

**Trigger**: web-impl's Fix Attempt 2 (review Major 4) changed `attentionNote` in
`web/src/sessions/card.ts` to append a since-timer derived from `attention.since`
(`formatTimer(session.attention.since, now)`), per plan line 287 and design-system §3's
escalating Needs-Input timer. This left two `card.test.ts` assertions red (confirmed by
running the suite before editing):

```
$ npm test -- --run
 × shows the permission attention note with reason 'permission'
   AssertionError: expected 'needs your permission — 00:10' to be 'needs your permission'
 × shows the idle attention note with reason 'idle'
   AssertionError: expected 'waiting for your input — 00:10' to be 'waiting for your input'
 Test Files  1 failed | 9 passed (10)
      Tests  2 failed | 183 passed (185)
```

Both are test bugs (stale expected values pinning the pre-fix behavior), not implementation
bugs — the plan and design-system explicitly call for the since-timer.

**Changes made** (`web/src/sessions/card.test.ts`, describe block "note precedence: attention
> failure > first-launch"):
- Updated the two failing assertions' expected `noteText` to include the timer suffix:
  `"needs your permission — 00:10"` / `"waiting for your input — 00:10"` (NOW is fixed 10s
  after the fixtures' `attention.since`, so `formatTimer` yields `"00:10"`).
- Added a new test, "drives the since-timer from attention.since, not stateSince (they
  diverge on re-entry)": sets `stateSince` 2h10m in the past (would format as `"2h"` if the
  note wrongly read it) and `attention.since` 30s in the past (`"00:30"`), asserting the note
  reads `attention.since`. This pins the exact distinction the implementation's own comment
  makes (`card.ts`'s `attentionNote` doc comment: "deliberately not `session.stateSince`...
  `attention.since` is the fact that matters here") — the old two tests alone could not have
  caught a regression back to `stateSince`, since both fixtures happened to set `stateSince`
  and `attention.since` to the same value.
- Left "shows the raw failure token verbatim..." and "prefers attention over failure..."
  untouched — neither asserts `noteText` for an attention note, so Major 4 didn't affect them
  (confirmed: they were already green in the pre-fix run above).

**Audit of other wave-1 fixes for untested pure logic** (Majors 5–7, Minor 1, Minor 9): all
remaining web-impl changes in this fix cycle are DOM wiring in `web/src/render/launch.ts`
(MRU path span, git-checkout marker text, browse/repos error surfacing, ⌘N keydown listener)
or CSS/markup only (aria roles, tabular-nums, tokens) — no new pure-logic function was
introduced or changed. The one piece of decoding involved (`Repo.path`, `BrowseEntry.isGit`)
lives in `web/src/api.ts` and was already exercised by `api.test.ts` (`isGit` markers and
`path` fields both appear in existing fixtures, e.g. "decodes dirs with isGit markers and a
null parent at filesystem root") — unaffected by this fix cycle since `api.ts` itself wasn't
touched. This matches the review's own Minor 14, which concluded the DOM branch is
Playwright's job and explicitly did not ask for a jsdom harness. No implementation bug found;
no other test file needed changes.

**Verification**:
```
$ npx tsc --noEmit          # exit 0
$ npm test -- --run          # Test Files 10 passed (10) / Tests 186 passed (186)
$ npm run build               # ✓ built in 87ms
$ make web-test  (repo root)  # Test Files 10 passed (10) / Tests 186 passed (186)
$ make web-build (repo root)  # ✓ built in 47ms
```

## Notes

- `sessions/card.ts`, `sessions/sort.ts`, `sessions/format.ts`, `sessions/store.ts` are
  all pure logic with no DOM dependency — exactly the modules web-impl's handoff flagged
  as needing coverage. All are now exhaustively tested including boundary values.
- `api.ts` has no injectable fetch seam, so tests use `vi.stubGlobal("fetch", ...)` /
  `vi.unstubAllGlobals()` per test — matching the existing `ws.test.ts` pattern of
  injecting fakes at the one integration seam a pure-logic module has.
- Confirmed the "no data yet" measured absence (spikes/canary-fields.md: a fresh launch
  has no Claude session id, no repo, no model, fully-null context) decodes via
  `parseSession` without rejection, and that `buildCardViewModel` renders it as
  `"ctx unknown"` with no gauge and `"untitled"`/trust-prompt text — never an empty
  gauge or a rejected/dropped session.
- No new `any` types introduced in any test file (spot-checked via grep; only prose
  matches for the English word "any").
- Did not modify any implementation file, any E2E spec, or `vitest.config.ts`.
