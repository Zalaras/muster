# Maintainability review: Masthead Indicators

**Plan**: masthead-indicators
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 12169 words (budget 30000)
**Scope**: 14 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (4 of them generated `CLAUDE.md` trailers), plus `internal/server/usagebroadcast_test.go` because the gates' `size` log names it

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/server/usagewire.go | usagewire.go's own `UsageBucket`/`UsageModelWindow`/`emptyUsageInfo`, sessionwire.go (`sessionWireModel` still used at :168) | yes (field removal, rg pasted) | none | pass (see Note 2) |
| web/src/features/connection.ts | connectionversion.ts, connectionrestore.ts, updaterestart.ts, update.ts | yes | none | pass (see Note 2) |
| web/src/features/connectionhealth.ts | connectionversion.ts, connectionrestore.ts, updateview.ts | yes (matches connectionversion.ts) | none | pass |
| web/src/features/usage.ts | connection.ts, update.ts | n/a (call removed) | none | pass (see Note 2) |
| web/src/protocol/messages.ts | protocol/usage.ts, protocol/session.ts | n/a | none | pass (see Note 2) |
| web/src/protocol/usage.ts | protocol/decode.ts, protocol/session.ts, protocol/messages.ts | n/a (removal) | none (biome-ignore kept) | pass (see Note 1) |
| web/src/render/masthead.ts | render/tiles.ts, render/sessions.ts, render/banner.ts | yes | none | pass |
| web/src/sessions/format.ts | sessions/usage.ts, features/issue.ts (`pad2` user) | yes (`clockText` shared) | none | pass |
| web/src/sessions/usage.ts | sessions/format.ts, sessions/card.ts | yes | none | pass |
| web/src/style.css | own theme blocks, `.banner.neutral`, `.sdot`-family rules | yes (tokens, dot) | none | pass (see Note 4) |
| internal/server/CLAUDE.md, web/src/{features,render,sessions}/CLAUDE.md | — | generated trailer | none | pass |
| internal/server/usagebroadcast_test.go (test; named by the size log) | reader_test.go, terminal_test.go, ws_test.go | no reason in daemon-tests.md | funlen ×1 (47 > 40), no reason | Minor 1 |

Duplicate checks run:

- `rg -n "describeClaudeVersion|ClaudeVersionDescription|describeConnectionHealth|ConnectionHealthDescription" web/src --glob '!*.test.ts'`: the only description pair is `connectionversion.ts` → `render/masthead.ts:305`, and the new pair copies it: a pure `describe*` in `features/` with one controller caller, returning a type declared beside its renderer in `render/masthead.ts:6`. Nothing else works out a health state.
- `rg -n "formatResets|pad2\(|getHours\(\)" web/src --glob '!*.test.ts'`: `clockText` (`sessions/format.ts:77`) is the only local-time `HH:MM` builder, and both `formatResets` and `formatResetsTitle` use it. `features/issue.ts:78` builds a UTC `HH:MM:SS`, which is a different idea.
- `rg -n "func readUntil" internal/server/*_test.go`: `reader_test.go:722 readUntilDocChanged`, `terminal_test.go:119/132`, `usagebroadcast_test.go:21 readUntilType` (see Note 3).

No shared state was added. `renderConnectionStatus` compares against the DOM and holds no state across calls. The dot holds no state of its own: it reads `frame.connection` and the same `deps.restartBanner(...)` result that the banner uses in the same `onRender` pass (`connection.ts:144-148`). No layer is crossed: `render/masthead.ts` imports only `../dom` and `protocol` types, and `main.ts` is untouched.

## Issues

### Critical

### Major

### Minor
1. **[daemon-tests]** The `funlen` warning (47 > 40) on `internal/server/usagebroadcast_test.go:53` `TestIngestStatusLine_ModelOnlyChangeRecordsRowCarryingModelButBroadcastsNoModel` has no reason in `plans/masthead-indicators/daemon-tests.md`. The body checks three separate things in turn: the WS `usage` broadcasts (:63-83), the `usage_sample` rows in the DB (:85-101), and the `GET /api/state` snapshot (:103-112). It cites conventions § Design "Size is read, not obeyed" and the maintainability rule that a size hit on a touched file needs a stated reason. A fix must either record a reason that holds in the test log's Decisions, or split the test where those three checks already divide. A split made only to get under 40 statements does not count (kb:adr/process-size-linters-warn-never-fail).

### Notes
1. **[note]** `web/src/protocol/usage.ts:74`: the `biome-ignore` reason still says "present-only key blocks whose comments must stay with their fields", but the comment pass removed those per-field comments and the doc comment that explained the suppression (2e678971). The reason now contradicts the code, so a newcomer would split the function. The comment pass owns comments (kb:adr/process-comment-pass-owns-code-comments), so this is not routed.
2. **[note]** The cycle-1 comment pass (2e678971, 12 of 13 candidates dropped) removed comments that existed before this plan, along with this plan's edits to them. That leaves four files out of step with their siblings:
   - `web/src/features/connection.ts:1` and `web/src/features/usage.ts:1` are now the only non-test `features/*.ts` files with no module header. All 29 others have one (checked with `head -1`).
   - `internal/server/usagewire.go:25`: `UsageInfo` is the only exported type in its file with no doc comment. The nil-vs-empty `ModelScoped` semantics it described are still true.
   - `web/src/protocol/messages.ts:43`: `shellsBusy?` lost its additive-evolution explanation, which `update` (:36-39) and `groups` (:44-46) keep. This field has nothing to do with the plan.

   These are for the orchestrator or `/retro` to weigh against the judge's edited-comment rule. They are not routed.
3. **[note]** `internal/server/usagebroadcast_test.go:21` `readUntilType` is a general version of `reader_test.go:722` `readUntilDocChanged`. Both read until a message with a given `type` arrives. One helper could serve both, but this is test code, the `dupl` check did not flag it, and no change is requested this cycle.
4. **[note]** `web/src/style.css`: the base `#connection-status::before` rule already sets `background: var(--health-pending)`, so the `[data-health="pending"]::before` rule just below it has no effect. It is harmless and reads as an explicit list of all three states.
5. **[note]** Changes for `review-work`'s DIAG row: `features/connectionhealth.ts` is a new web module with the edge `connection.ts → connectionhealth.ts`, and the `features/usage.ts → renderUsageModel` edge is gone. Whether `kb:diagram/web-components` shows either change is for that review to check.
