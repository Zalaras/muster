# Web Tests: Resume and Dangerously Allow

**Plan**: resume-and-dangerously-allow
**Verdict**: pass
**Pack**: `kb: pack 35369 words (budget 20000)` — WARN exceeds budget (sections: rules 953 · features 13208 · decisions 12682 · facts 7359 · lessons 1159 · runbooks 2)

## Summary

Tests created: 65 new cases (across 2 new files and 6 extended files) | Sanctioned fixture repairs: 3 files (unblocked 46 previously-failing tests, 0 new cases). Final `npx vitest run`: **77 files, 1920 tests, all passing, 0 failing.**

## Fix Attempt 1 (review cycle 1)

**Failures addressed** (all `[web-tests]` from `review.md` cycle 1):

- Correctness Major 4 — three tests pinned the superseded null-`displayName` wire shape and stated it as the contract in their comments.
- Correctness Major 5 — W8 (edge case 19, stale past-sessions response dropped) had no test anywhere, unit or E2E.

**Changes made** (repairing web-impl's Fix Attempt 3, which reverted `displayName` to a non-null string per kb:adr/launch-resume-display-name-falls-back-to-id and made `mainheadMeta` read "unknown" for a null model per kb:adr/launch-resume-null-model-reads-unknown — the 7 failures it named as sanctioned):

- `web/src/api/launch.test.ts` — the resume-from-list 201 fixture's `model.displayName` is now the model id (`"claude-opus-4-1-20250805"`), not `null`; reworded the "Protocol Contract" comment to cite the ADR instead of stating the superseded null claim.
- `web/src/protocol/session.test.ts` — "parses a model with a null displayName" now asserts `parseSession` rejects it (`toBeNull()`), since `parseModelInfo` requires `typeof displayName === "string"` again; reworded the comment.
- `web/src/protocol/usage.test.ts` — same repoint for `Usage.model`, which shares `parseModelInfo` verbatim.
- `web/src/render/launch.test.ts` — replaced "falls back to '(untitled)' for a selected row with no title" (Major 1's now-fixed bug, encoded as a test) with a case for the real remaining behaviour: `title === null` always means "nothing selected" and shows the dash, even when a directory is passed — that combination can no longer mean "selected but untitled" now that `renderResumeFooter`'s caller resolves the fallback before calling.
- `web/src/sessions/card.test.ts` — the three `mainheadMeta` tests that passed a null model now expect `"· unknown"` appended (kb:adr/launch-resume-null-model-reads-unknown), not the clause omitted.
- Added coverage for the web-impl fix wave's new pure code, previously untested:
  - `web/src/sessions/permission.test.ts` — a direct `isBypassMode` describe block (5 cases: the exact bypass string, every other recognised mode, `null`, an unrecognised string, empty string). Previously only exercised indirectly through `permissionModeToCheck`/`launchPrimaryFace`.
  - `web/src/features/launchpastlist.test.ts` — a `pastRowView` describe block (4 cases: title passed through verbatim with `bypassChip: false`, the `"(untitled)"` fallback for a null title, `bypassChip: true` for `bypassPermissions`, `bypassChip: false` for a null `permissionMode`).

**W8 (Major 5) — could not be unit-tested; declined, see Declined coverage below for the reason and the routing this asks the orchestrator for.**

**Verification**:
- `npx tsc --noEmit` — clean.
- `npx vitest run` — **77 files, 1929 tests, all passing, 0 failing** (1920 + 9 new: 5 `isBypassMode` + 4 `pastRowView`).
- `make web-lint web-build` — both clean (only the pre-existing >500kB mermaid-chunk warning, unrelated).
- `python3 .claude/skills/orchestrate/scripts/comment-checks.py web-tests` → `comment-checks: clean`.
- `python3 .claude/skills/orchestrate/scripts/dead-refs.py` → `830 references checked, 0 missing`.

Fixed the four sanctioned test breaks web-impl's Handoff named (all mine per the task):
- `render/sessions.test.ts`'s `buildCardTemplateFragment()` — added a `.chip-danger` sibling of `.name` inside `.r1`, matching `index.html`'s real `#session-card-template`.
- `render/tiles.test.ts`'s `fakeTileRoot()` — added a `.chip-danger` entry to its `byClass` map, matching `#tile-template`'s real `.thead`.
- `render/mainhead.test.ts`'s `fakeMainheadElements()` — `root` is now a `fakeMainheadRoot()` with a real `querySelector` resolving `.chip-danger` (previously `fakeElement()`, no `querySelector` at all — threw on every session-present render).
- `sessions/permission.test.ts` — `PERMISSION_MODES` now asserts the five-value set; `permissionModeToCheck`'s round-trip loop excludes `bypassPermissions` (moved to its own "never-restored" case, per REQ-3/INV-3/W2); added coverage for the new `launchPrimaryFace` (REQ-2/REQ-11/INV-2), which had none.

Also found and fixed one **stale-but-passing** test while extending `api/launch.test.ts`: "decodes the 400 invalid_request naming all four accepted values for an unknown permissionMode (D4)" used `bypassPermissions` as its example of an *unrecognised* mode — REQ-1 makes that value legitimate now, so the scenario had become factually wrong even though the assertion still passed (it only replays a mocked response, so nothing failed). Swapped the example to `dontAsk` (still deliberately refused) and updated the pinned message to the five-value list; added a new adjacent test that `bypassPermissions` itself now serialises and decodes as an accepted value.

New coverage by module:
- **Protocol decoding** — `api/launch.ts`'s `parsePastSessions`/`fetchPastSessions`/`resumeFromList` (new endpoint, zero prior coverage): valid full list, the all-nullable-fields-at-once "measured absence" row (no title, no prompt, no recorded mode, not open elsewhere — a directory Claude Code has barely touched), empty list, `truncated: true`, every malformed shape (missing/non-array `sessions`, non-boolean `truncated`, one bad element among several rejecting the whole list, non-record top level), all four documented errors (`invalid_request` ×2, `not_found`, `unknown_claude_session`, `already_open`), network failure, non-JSON body. `protocol/session.ts`'s and `protocol/usage.ts`'s `SessionModelInfo.displayName` widening to `string | null` — added the one case neither file had (`{id, displayName: null}`, distinct from `model: null` itself), since this is exactly the resumed-from-list wire shape the plan's Protocol Contract calls out.
- **State derivation** — `sessions/card.ts`'s `bypassChip` (INV-1: true only for `bypassPermissions`, false for the other four; true across every state/alive combination; flips off when a hook corrects the latch) and the bypass-warning `firstLaunchNote` variants (REQ-5: combined trust-then-bypass text on a first launch, bypass-only text shown immediately — no `NO_SIGNAL_THRESHOLD_SECONDS` wait — for a known directory, and no note once `claudeSessionId` binds). `sessions/permission.ts`'s `launchPrimaryFace` (REQ-2/REQ-11/INV-2): all four tab×mode/selection combinations, plus that each tab ignores the other's argument. `features/launchpastlist.ts`'s `filterPastSessions` (REQ-14: case-insensitive substring over title and last prompt, empty/whitespace query is no-filter, a null-title row still matches via its prompt, no-match returns empty) and `defaultSelection` (kb:adr/launch-resume-running-guard-muster-only: skips rows already open elsewhere, null when every row is or the list is empty).
- **Formatting** — `render/launchpast.ts`'s `renderPastHead` (design-system §6 honesty: omits the count while unknown, shows a real zero once known, never fabricates `· 0`) and `render/launch.ts`'s new `renderResumeFooter`/`renderLaunchButtonFace` (both ref-only writers, same testable category as the file's pre-existing `renderLaunchFooter`): em dash/hidden-suffix at rest, title-or-`(untitled)` plus ` in <dir>` once selected, the two button faces and their class toggle, re-render-cleanly-from-the-other-state for all three.

## Declined coverage

- **W8 / edge case 19 ("a past-sessions response for a directory no longer listed is dropped") — Correctness review Major 5.** Not unit-testable as built. The guard lives entirely inside `features/launchresume.ts`'s `initLaunchResume` closure: `fetchList` bumps a closed-over `requestId` and a landing response is dropped when `id !== requestId` — there is no extracted pure function this reduces to; `requestId`, `directory` and `listState` are all private closure variables with no getter. Exercising it requires calling `initLaunchResume(elements, handlers)` and driving `onDirectoryChanged`/two overlapping `fetchPastSessions` calls through to `render()`, which calls `render/launchpast.ts`'s `renderPastHead`/`renderPastList` — and those allocate real DOM (`document.createElement`, confirmed by `rg -n "document.createElement" web/src/render/launchpast.ts`, 10 hits). `web/vitest.config.ts` has no jsdom (`test.environment` unset, default `node`); `document` is undefined in this test run. This is the same category `render/launch.test.ts`'s own header comment already carves out for `renderRecentsList`/`renderBrowseListing`/`renderBrowseLoading` ("no jsdom configured … not covered here"), and I am not able to extract the guard into a pure function myself (test agents may not edit implementation code). Per the task's own conditional instruction, routing this to `[e2e-specs]` is the only path — the review's own suggested pattern (`past-sessions.spec.ts:380`'s route-hold: hold dir A's fetch, navigate to B, release A, assert only B's rows show) is a Playwright-shaped fix, not a unit one.
- **`features/launchresume.ts`** (the Resume-tab controller, `initLaunchResume`, the rest of it beyond the stale-response guard above) — not unit-tested, matching the established convention for this exact category: `.claude/rules` / `web/src/features/CLAUDE.md`'s own exemption list names `launchcrumbs.ts`/`launchmodels.ts`/`launchrestore.ts`/`updateview.ts` as the *pure* decision modules that get Vitest coverage, and `features/launch.ts` itself — the sibling controller this module was split from, with the same elements/listeners/render shape — has no test file at all (`ls web/src/features/launch*.test.ts` confirms). `launchresume.ts` wires real DOM listeners (`tabNewBtn.addEventListener`, etc.) and its own render pass; the interaction/rendering half of its behavior (tab switching, fetch-triggered list rendering, filter-driven re-render) is `past-sessions.spec.ts`'s job per `test-specs.md`'s Coverage table (REQ-7/REQ-8/REQ-14/User Flow 3/4). Its extracted pure pieces (`filterPastSessions`/`defaultSelection`/`pastRowView`) are covered above.
- **`render/launchpast.ts`'s `renderPastLoading`/`renderPastError`/`renderPastList`** — not unit-tested, same category as this file's own precedent: `render/launch.test.ts`'s header comment excludes `renderRecentsList`/`renderBrowseListing`/`renderBrowseLoading` for the identical reason (`document.createElement`/`replaceChildren` with no jsdom configured in `vitest.config.ts`), and I extended that same file's comment to explain why `renderResumeFooter` *is* covered alongside `renderLaunchFooter`. `past-sessions.spec.ts`'s "the Resume tab shows a loading state..." and the empty/no-match/truncation rows in the States section are these three functions' Playwright coverage.
- **REQ-6/REQ-9/REQ-15's daemon-side transcript scanning and repo-touch behaviour** — not web's; `internal/claudecode/launchtranscripts_test.go` and `internal/server/launcherpast(list)_test.go` exist in the tree (daemon-tests' concurrent work) and own this.
- **REQ-1's second clause** ("the existing Resume action passes a latched bypassPermissions") — web-implementation.md's Decisions log records this needed no web change (`resumeSession(id)` sends no body, the daemon reads the session's own latch). `api/sessions.test.ts`'s `"posts to the id-scoped resume endpoint and decodes the 200 Session response..."` (kb:anchor/sessions.resume) already pins the exact call: `expect(fetchMock).toHaveBeenCalledWith("/api/sessions/1/resume", { method: "POST", credentials: "same-origin" })` — no `body` key at all, for any session regardless of its latched mode. Since the request shape carries no mode-dependent branch, this test already exercises the bypass case as thoroughly as any other latch value would be; no separate bypass-flavoured test adds real coverage.

## Tests

| File | Test Name (representative) | What It Tests | Status |
|------|-----------|---------------|--------|
| `api/launch.test.ts` | decodes a session with every nullable field null (no title, no prompt, no recorded mode, not open elsewhere) | measured-absence past-session row | pass |
| `api/launch.test.ts` | rejects the whole list when one element among several is malformed (all-or-nothing) | `parsePastSessions` all-or-nothing decode | pass |
| `api/launch.test.ts` | decodes a 201 seeded Session — displayName falls back to the model id, permissionMode source 'seed', claudeSessionId still null | `resumeFromList` seed shape (fixed cycle 1) | pass |
| `api/launch.test.ts` | decodes a 409 already_open for a session already bound to an alive Muster row (REQ-12) | error decode | pass |
| `api/launch.test.ts` | serialises permissionMode: 'bypassPermissions' on the request body and decodes it back (REQ-1) | new accepted wire value | pass |
| `protocol/session.test.ts` | rejects a model with an explicit null displayName | `parseModelInfo` boundary (fixed cycle 1) | pass |
| `protocol/usage.test.ts` | rejects a usage.model with an explicit null displayName | shared parser boundary (fixed cycle 1) | pass |
| `sessions/card.test.ts` | is true regardless of state, alive or not — the chip tracks the latch, not liveness (INV-1) | `bypassChip` across all states×alive | pass |
| `sessions/card.test.ts` | flips back to false once a hook corrects the latch away from bypass (edge case 17) | latch-correction derivation | pass |
| `sessions/card.test.ts` | shows the combined trust-prompt-then-bypass-warning text on a first launch into a new directory | REQ-5 combined note | pass |
| `sessions/card.test.ts` | shows the bypass-only warning immediately (0s elapsed) for a known directory, no NO_SIGNAL wait | REQ-5 no-threshold rule | pass |
| `sessions/permission.test.ts` | is exactly the five accepted wire values in dialog/cycle order | fixed frozen assertion | pass |
| `sessions/permission.test.ts` | falls back to auto for the never-restored bypassPermissions | fixed frozen assertion | pass |
| `sessions/permission.test.ts` | Resume tab, selected row's last mode is bypassPermissions: danger 'Resume without checks' | `launchPrimaryFace` INV-2 | pass |
| `sessions/permission.test.ts` | is true only for the exact string 'bypassPermissions' | `isBypassMode` (new cycle 1) | pass |
| `sessions/permission.test.ts` | is false for null (a past session's unrecorded mode) | `isBypassMode` boundary (new cycle 1) | pass |
| `features/launchpastlist.test.ts` | matches a session with a null title via its lastPrompt | `filterPastSessions` REQ-14 | pass |
| `features/launchpastlist.test.ts` | returns null when every row is already open (no selectable row) | `defaultSelection` guard | pass |
| `features/launchpastlist.test.ts` | falls back to '(untitled)' for a null title | `pastRowView` (new cycle 1) | pass |
| `features/launchpastlist.test.ts` | sets bypassChip true iff the row's last mode was bypassPermissions | `pastRowView` (new cycle 1) | pass |
| `render/launchpast.test.ts` | includes the count once the fetch has landed, even when it's zero | honesty rule, real zero vs unknown | pass |
| `render/launch.test.ts` | shows the dash and hides the suffix when title is null, even with a directory present | `renderResumeFooter` (fixed cycle 1) | pass |
| `render/launch.test.ts` | renders the danger face: label verbatim, class 'btn key-danger' | `renderLaunchButtonFace` | pass |
| `sessions/card.test.ts` | appends 'unknown' for a null model on an alive session | `mainheadMeta` (fixed cycle 1) | pass |
| `sessions/card.test.ts` | omits the ended clause for a dead session with no endedAt..., still appends 'unknown' for the null model | `mainheadMeta` (fixed cycle 1) | pass |
| `render/sessions.test.ts` | (fixture repair — `.chip-danger` node added to fake template) | unblocks 46 existing tests across 3 files | pass |
| `render/tiles.test.ts` | (fixture repair — `.chip-danger` entry added to `byClass`) | ditto | pass |
| `render/mainhead.test.ts` | (fixture repair — `root` now has a real `querySelector`) | ditto | pass |

(65 new cases from the initial wave, plus 9 more added in review cycle 1's fix wave (5 `isBypassMode` + 4 `pastRowView`) = 74 new cases total across the extended/created files; the full per-test list is in the diff — the table above samples the ones with real decision content, per the instruction not to pad with mechanical restates.)

## Test Run Output (initial wave)

```
$ npx tsc --noEmit
(clean, no output)

$ npx vitest run
 RUN  v5.0.0 .../web
 Test Files  77 passed (77)
      Tests  1920 passed (1920)

$ npm run build
✓ built in 1.63s
(pre-existing >500kB mermaid-chunk warning only, unrelated to this plan)

$ npm run lint
Checked 262 files in 214ms. No fixes applied.

$ python3 .claude/skills/orchestrate/scripts/comment-checks.py web-tests
comment-checks: clean

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py <touched files>
dead-refs: 15 references checked, 0 missing

$ bash .claude/skills/orchestrate/scripts/size-warn.sh --changed
(16 hits, all pre-existing Go/`features/launch.ts` warnings already logged in web-implementation.md's Decisions; none of my test files hit filelen — dupl only runs on Go, and file-length only scores non-`.test.ts` TypeScript)
```

## Test Run Output (review cycle 1 fix wave)

```
$ npx tsc --noEmit
(clean, no output)

$ npx vitest run
 RUN  v5.0.0 /Users/.../web
 Test Files  77 passed (77)
      Tests  1929 passed (1929)
   Duration  3.43s

$ make web-lint web-build
(web-lint clean; web-build ✓ built in 1.63s — only the pre-existing >500kB mermaid-chunk
warning, unrelated to this plan)

$ python3 .claude/skills/orchestrate/scripts/comment-checks.py web-tests
comment-checks: clean

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py
dead-refs: 830 references checked, 0 missing
```
