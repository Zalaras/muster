# Maintainability review: Masthead Indicators

**Plan**: masthead-indicators
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 12169 words (budget 30000)
**Scope**: 14 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (4 of them generated or hand-written `CLAUDE.md`), plus `internal/server/usagebroadcast_test.go` because cycle 1's Minor 1 was raised on it. Since the cycle-1 review commit (`b09a5047..HEAD`), the only change to a non-test source file is `web/src/features/CLAUDE.md`, which adds `connectionhealth.ts` to the list of pure helpers.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/server/usagewire.go | sessionwire.go (`sessionWireModel` still used) | yes (field removal, rg pasted) | none | pass (Note 2) |
| web/src/features/connection.ts | connectionversion.ts, connectionrestore.ts, updaterestart.ts | yes | none | pass (Note 2) |
| web/src/features/connectionhealth.ts | connectionversion.ts, connectionrestore.ts, updateview.ts | yes (matches connectionversion.ts) | none | pass |
| web/src/features/usage.ts | connection.ts, update.ts | n/a (call removed) | none | pass (Note 2) |
| web/src/features/CLAUDE.md | — | hand-written list + generated trailer | none | pass (`connectionhealth.ts` now listed) |
| web/src/protocol/messages.ts | protocol/usage.ts, protocol/session.ts | n/a | none | pass (Note 2) |
| web/src/protocol/usage.ts | protocol/decode.ts, protocol/session.ts | n/a (removal) | none | pass (Note 1) |
| web/src/render/masthead.ts | render/tiles.ts, render/banner.ts | yes | none | pass |
| web/src/sessions/format.ts | sessions/usage.ts, features/issue.ts | yes (`clockText` shared) | none | pass |
| web/src/sessions/usage.ts | sessions/format.ts, sessions/card.ts | yes | none | pass |
| web/src/style.css | own theme blocks, `.banner.neutral` | yes (tokens, dot) | none | pass (Note 3) |
| internal/server/CLAUDE.md, web/src/{render,sessions}/CLAUDE.md | — | generated trailer | none | pass |
| internal/server/usagebroadcast_test.go (test; cycle-1 Minor 1) | reader_test.go, terminal_test.go | reason in daemon-tests.md Fix Attempt | none (`size-warn: 0 hits`) | pass |

Duplicate checks were re-run on HEAD:

- `rg -n "describeConnectionHealth|ConnectionHealthDescription|describeClaudeVersion|ClaudeVersionDescription" web/src --glob '!*.test.ts'` finds two pairs: `connectionversion.ts:21` with `render/masthead.ts:305`, and `connectionhealth.ts:25` with `render/masthead.ts:6`. Each pair has one caller in `connection.ts` (`:88/:166` and `:147`). The new pair copies the old pair's shape. No third module works out a health state.
- `rg -n "formatResets|clockText|getHours\(\)" web/src --glob '!*.test.ts'` finds one builder of local `HH:MM` text, `sessions/format.ts:77 clockText`. Both `formatResets` (:81) and `formatResetsTitle` (:92) use it.

No shared state was added. The dot gets its value from `frame.connection` and from the same `deps.restartBanner(...)` result that the banner reads in the same `onRender` pass. `renderConnectionStatus` compares against the DOM, so it keeps no state between calls. No layer is crossed: `render/masthead.ts` imports only `../dom` and `protocol` types, and `main.ts` and `server.go` are untouched.

Cycle-1 Minor 1 (`[daemon-tests]`, funlen 47 > 40 on `usagebroadcast_test.go`) is fixed. The test now uses one scenario helper, `modelOnlyScenario` (`t.Helper()`, with its cleanups moved to `t.Cleanup`), and three tests, one per effect: the WS broadcasts, the `usage_sample` rows and the `/api/state` snapshot. Those are the three checks the old body already ran one after another. `daemon-tests.md` § Fix Attempt says the split follows the subject and not the line count, and that holds. The gates' size log reports `size-warn: 0 hits`.

## Issues

### Critical

### Major

### Minor

### Notes
1. **[note]** Carried from cycle 1, still true: the `biome-ignore` reason at `web/src/protocol/usage.ts:74` still says "present-only key blocks whose comments must stay with their fields". The comment pass removed those comments. Separately, `web-implementation.md` Decisions says the function's "doc comment now says 20", but `parseUsage` has no doc comment on HEAD. The comment pass owns comments (kb:adr/process-comment-pass-owns-code-comments), so this is not routed.
2. **[note]** Carried from cycle 1, still true: the comment pass removed comments that were there before this plan, so these files now differ from their siblings. `features/connection.ts` and `features/usage.ts` have no module header. `UsageInfo` (`usagewire.go:25`) has no doc comment. `messages.ts` `shellsBusy?` lost its additive-evolution note. This is for the orchestrator or `/retro` to weigh. It is not routed.
3. **[note]** In `style.css`, the `#connection-status[data-health="pending"]::before` rule sets the same value the base `::before` rule already sets. It does no harm and lists all three states explicitly.
4. **[note]** All three new tests in `usagebroadcast_test.go` run `modelOnlyScenario` in full, which costs two posts and two WS reads each. That is acceptable for a test, and each test stays independent.
5. **[note]** `features/connectionhealth.ts` is a new web module with the edge `connection.ts → connectionhealth.ts`. Whether `kb:diagram/web-components` shows it is `review-work`'s DIAG row.
