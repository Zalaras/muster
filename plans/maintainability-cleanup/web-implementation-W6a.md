# Web Implementation: Maintainability Cleanup — Unit W6a (render layer, placement half)

**Plan**: maintainability-cleanup
**Mode**: initial
**Unit**: W6 "Placement" only (B7, B8, B9, B10, B11, e-m17, d-m4) — the options-object/VM/
keyed-reorder/template/focus-preserve-merge/attr-helper/diagrams-opts/rename-editor/render-
state-rule half of W6 is **not** done here; that's W6b.
**Pack**: not run via `go run ./tools/kb pack` this unit (offline from the pipeline's kb
tooling in this session) — read directly: plan.md's W6 bullets + "Defaults that bind the
units", findings.md's B7–B11, review.maintainability.e-webui.md (Seed check B7/B9/B10/B11,
Minor 17), review.maintainability.d-webcore.md (Minor 4).

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `docs/conventions.md` | edited | § Composition roots: new sentence — a DOM-free decision one controller calls lives in `features/`, not `render/`; `sessions/` when the logic is session-derived. |
| `web/src/render/CLAUDE.md` | edited | Owns-line updated to match the new conventions sentence; the `focus.ts` gotcha renamed to `focuskeep.ts`. |
| `web/src/terminal/CLAUDE.md` | edited | Owns-line and a gotcha updated: the segment control's DOM half now lives in `render/surfaceseg.ts`; `terminal/surfaceswitch.ts` keeps only the reducer. |
| `web/src/reader/CLAUDE.md` | edited | Owns-line: `render/frontmatter.ts` named as the frontmatter split's DOM half. |
| `docs/features/{actions,connection,update,rail,surfaces,reader,issue,settings,launch}/spec.md` | edited | `web:` glob updated to cover every moved/new file (see Decisions for the exact globs); `make gen-kb` re-run after. |
| `web/src/render/focusrestore.ts` → `web/src/features/connectionrestore.ts` | moved | B7: single-caller pure decision (`features/connection.ts`) moves beside its controller. |
| `web/src/render/launchrestore.ts` → `web/src/features/launchrestore.ts` | moved | B7: single-caller pure decision (`features/launch.ts`) moves beside its controller. |
| `web/src/features/launchcrumbs.ts` | created | B7 (missed item): `splitCrumbs` moved out of `render/crumbs.ts`, whose one caller is `features/launch.ts`. `render/crumbs.ts` keeps `Crumb` + `renderCrumbs` (the DOM half). |
| `web/src/features/connectionversion.ts` | created | B7 (missed item): `describeClaudeVersion` moved out of `render/masthead.ts`, whose one caller is `features/connection.ts`. `render/masthead.ts` keeps `ClaudeVersionDescription` (the render contract) and `renderClaudeVersion`, whose signature changes to take the description directly. |
| `web/src/features/updateview.ts` | created | B7 (named item, `buildUpdateViewModel`): moved out of `render/update.ts` along with `availableText`/`statusText`/`IN_FLIGHT_PHASES`/`CheckState`. `render/update.ts` keeps `UpdateViewModel` (the render contract) and `renderUpdateSection`, whose signature is unchanged (it always took the view-model as a parameter). |
| `web/src/features/actionscopy.ts` | created | B7 (named item, "confirm-dialog text"): `sessionLabel`/end-remove body composition moved out of `render/confirm.ts`. `ConfirmDialogs.openEnd`/`openRemove` now take the composed `bodyText` as a parameter; `features/actions.ts`'s `dispatch` computes it. |
| `web/src/render/dead.ts` | edited | B8: stops fetching. `loadPane`/`fetchPane` removed; `render/dead.ts` only ever receives a `PaneState`. |
| `web/src/features/actions.ts` | edited | B8: now owns `loadPane` (exported for the moved test) — the fetch trigger `ensurePaneFetch` already called. Also imports `endDialogBody`/`removeDialogBody` and passes composed text into `openEnd`/`openRemove`. |
| `web/src/render/settings.ts` | created | B9: `initSettingsDialog` + its three interfaces moved out of `features/settings.ts`, matching `render/confirm.ts`/`render/update.ts`'s `initRestartConfirm` shape (elements in, handlers in, controller out) already in `render/`. |
| `web/src/features/settings.ts` | rewritten | B9: now only `initSettings`, the controller entry — imports `initSettingsDialog` from `render/settings.ts`. |
| `web/src/render/issue.ts` | created | B9: `renderIssueButton` and `buildSessionOptions` moved out of `features/issue.ts` (the two genuinely DOM-only pieces — `initIssueDialog` itself stays in `features/`, since it owns async capture/submit network calls and mutable capture state, which is not what B9's "elements in, handlers in, controller out" shape describes). |
| `web/src/features/issue.ts` | edited | B9: removed the two moved functions and their constants; calls `buildSessionOptions(elements.sessionSelect, sessions, focusedId)`. |
| `web/src/render/launch.ts` | created | B9: the recents/listing/footer DOM builders moved out of `features/launch.ts` — `buildRecentButton`/`renderRecentsList`, `buildBrowseEntryButton`/`renderBrowseListing`/`renderBrowseLoading`, `renderLaunchFooter`. Each takes explicit values and an `onSelect`/`onNavigate` callback rather than closing over controller state, matching `render/crumbs.ts`'s shape; none of them call `navigate` themselves. |
| `web/src/features/launch.ts` | edited | B9: `renderRecents`/`renderListing`/`renderListingLoading`/`renderFooter` are now thin wrappers calling into `render/launch.ts`; `selectRecent` (new) is the callback a clicked Recent invokes (navigate, then apply restore on success) — same behaviour as before, just named and split out of the button-building closure. |
| `web/src/render/actionbutton.ts` | created | B11: `buildActionButton` moved out of `render/sessions.ts` — its two consumers are `render/sessions.ts` (`reconcileActsRow`) and `render/tiles.ts`. `SessionAction` (the other half of B11/B5) was already correctly in `sessions/card.ts`, not `render/sessions.ts` — nothing to move there. |
| `web/src/render/sessions.ts` | edited | B10, B11: `buildActionButton` and `renderFocusMain`/`renderSizenote`/`FocusMainElements` removed (see below); two stale `render/focus.ts` comment references fixed to `render/focuskeep.ts`. |
| `web/src/render/focusview.ts` | created | B10: `renderFocusMain`/`renderSizenote`/`FocusMainElements` moved out of `render/sessions.ts` — both are called only by `features/focus.ts`. |
| `web/src/render/tiles.ts` | edited | Imports `buildActionButton` from `./actionbutton` instead of `./sessions`; imports the surface-segment DOM builder from `./surfaceseg` instead of `../terminal/surfaceswitch`. |
| `web/src/features/focus.ts` | edited | Imports `renderFocusMain`/`renderSizenote` from `../render/focusview`; imports `buildSurfaceSegment` from `../render/surfaceseg`. |
| `web/src/render/surfaceseg.ts` | created | Minor 17: `SurfaceSegmentRefs`/`buildSurfaceSegment`/`updateSurfaceSegment` (the DOM half) moved out of `terminal/surfaceswitch.ts`, which keeps only the pure reducer. |
| `web/src/terminal/surfaceswitch.ts` | edited | Minor 17: DOM section (`buildSurfaceSegment`/`updateSurfaceSegment`/`SurfaceSegmentRefs`) removed; header comment rewritten to describe the reducer only. |
| `web/src/render/mainhead.ts` | edited | Imports the segment DOM builder from `./surfaceseg` instead of `../terminal/surfaceswitch`. |
| `web/src/features/tiles.ts` | edited | Same import re-point as `mainhead.ts`. |
| `web/src/render/frontmatter.ts` | created | d-m4: `buildFrontmatterNode`/`buildFrontmatterTable`/`buildFrontmatterFallback` moved out of `reader/markdown.ts`. |
| `web/src/reader/markdown.ts` | edited | d-m4: no longer builds or prepends a frontmatter DOM node — `renderMarkdown` now returns `frontmatter: Frontmatter \| null` alongside `fragment`/`outline`; the outline walk is unaffected (frontmatter was already prepended *after* it). |
| `web/src/render/reader.ts` | edited | d-m4: `ReaderBody`'s `"fragment"` variant gains `frontmatter: Frontmatter \| null`; `setReaderBody` calls `buildFrontmatterNode` and prepends the result before `replaceChildren` — this is the DOM half of the split, so all DOM construction stays in `render/`. |
| `web/src/features/reader.ts` | edited | d-m4: destructures `frontmatter` from `renderMarkdown`'s result and passes it through to `setReaderBody`. |
| `web/src/render/focus.ts` → `web/src/render/focuskeep.ts` | renamed | Minor 13 (naming half only — the three-implementation merge is W6b): this module's name collided with `features/focus.ts`, breaking "every `render/<x>` is the renderer for `features/<x>`". Renamed to what it does (capture/restore focus across a reorder), not merged with `render/reader.ts`'s or `features/connection.ts`'s own focus-preserve code — that consolidation is W6b's `e-m13`. |
| `web/src/features/rail.ts`, `web/src/render/dragreorder.ts`, `web/src/render/tiledrag.ts` | edited | Import-path fix only, for the `render/focus.ts` → `render/focuskeep.ts` rename. |
| `web/src/render/confirm.ts` | edited | B7: no longer composes dialog body text; `ConfirmDialogs.openEnd`/`openRemove` take `bodyText: string`. |

Test files touched, **import statements only** (see `## Constraints`'s sanctioned exception —
each is a symbol/module relocation, not a functionality change):
`web/src/features/issue.test.ts`, `web/src/render/crumbs.test.ts`, `web/src/render/dead.test.ts`,
`web/src/render/focus.test.ts`, `web/src/render/focusrestore.test.ts`,
`web/src/render/launchrestore.test.ts`, `web/src/render/masthead.test.ts` (partial — see Handoff),
`web/src/render/sessions.test.ts`, `web/src/render/tiledrag.test.ts` (incl. its `vi.mock` path,
the mock-factory's module specifier, same category as an import path), `web/src/render/update.test.ts`,
`web/src/terminal/surfaceswitch.test.ts`.

## Decisions

- Every B7–B11/e-m17/d-m4 item this unit was assigned is done above; nothing was deliberately skipped.
- design: six new `features/`-side pure-decision modules (`connectionrestore.ts`, `launchrestore.ts`,
  `launchcrumbs.ts`, `connectionversion.ts`, `updateview.ts`, `actionscopy.ts`) — one per B7 item,
  applying the new conventions.md sentence. `rg -n "^export function" web/src/features/*.ts`
  before this unit showed no pure-decision-only files in `features/` (B7's whole point); named
  `<owner><concern>.ts` to avoid colliding with the owning controller's own filename.
- design: `features/connectionversion.ts`/`features/updateview.ts` keep their **type**
  (`ClaudeVersionDescription`/`UpdateViewModel`) in `render/`, moving only the deriving
  **function**. `render/` never imports from `features/` anywhere in this codebase —
  `rg -n 'from "\.\./features/' web/src/render/*.ts web/src/terminal/*.ts web/src/reader/*.ts web/src/sessions/*.ts`
  returned nothing before this unit — so moving the type too would have created a new,
  wrong-direction edge. `render/update.ts`'s `renderUpdateSection` already took `UpdateViewModel`
  as a parameter (no signature change, no test breakage there). `render/masthead.ts`'s
  `renderClaudeVersion` did **not** — it took raw `ClaudeCodeInfo` and called
  `describeClaudeVersion` internally, so moving the derivation forced a signature change
  (`ClaudeCodeInfo | null` → `ClaudeVersionDescription`). That is sanctioned breakage on
  `render/masthead.test.ts`'s `renderClaudeVersion` describe block — see Handoff.
- design: `features/actionscopy.ts`'s `endDialogBody`/`removeDialogBody` return **strings**,
  not DOM. `render/confirm.ts`'s `ConfirmDialogs.openEnd`/`openRemove` gained a `bodyText: string`
  parameter instead of importing the composer — same reasoning as above (no render→features edge),
  and it keeps `render/confirm.ts` doing nothing but `el.textContent = bodyText`.
- design: `render/actionbutton.ts` and `render/focusview.ts` are render/-internal splits (no
  features/ involved) — `buildActionButton` is shared by `render/sessions.ts` and `render/tiles.ts`
  (B11); `renderFocusMain`/`renderSizenote` are single-caller (`features/focus.ts`, B10) DOM
  builders with no pure decision inside them, so they stay in `render/`, just their own module.
- design: `render/surfaceseg.ts` (not `render/surfaceswitch.ts`) for e-m17's DOM half — a distinct
  name reads clearer next to `terminal/surfaceswitch.ts`, which keeps the reducer under the
  original name; avoids introducing a second same-basename-different-directory pair right after
  fixing that exact complaint for `render/focus.ts`/`features/focus.ts` (Minor 13).
- design: `render/frontmatter.ts` matches the existing `reader/mermaid.ts` → `render/mermaid.ts`
  and `reader/…` → `render/diagrams.ts` precedent already in this codebase (reader/-derived data,
  render/-side DOM builder, same basename family) — `rg -n "buildFrontmatterNode\|buildFrontmatterTable\|buildFrontmatterFallback" web/src`
  before the move showed all three only in `reader/markdown.ts`, confirming no existing render-side
  home to reuse.
- design: `render/launch.ts`'s builders take an explicit `onSelect`/`onNavigate` callback and never
  call `navigate` themselves — `features/launch.ts` still owns every daemon call and the async
  navigation state machine; only the DOM construction moved. `features/issue.ts`'s
  `initIssueDialog` was **not** moved wholesale despite matching B9's "elements in, handlers in,
  controller out" shape at a glance — it owns two network calls (`captureIssueSnapshot`,
  `fileIssue`) and mutable `capture`/`submitting` state, which `render/dead.ts`'s original
  "DOM builders never fetch" invariant (the same one B8 enforces) rules out for `render/`. Only its
  two genuinely DOM-only pieces (`renderIssueButton`, `buildSessionOptions`) moved.
- `render/focus.ts` → `render/focuskeep.ts`: renamed, not merged with the other two
  focus-preservation implementations `review.maintainability.e-webui.md`'s Minor 13 names
  (`render/reader.ts`'s `focusedKeyWithin`/`restoreFocusByKey`, `features/connection.ts`'s
  identity-keyed remember/restore) — the team lead's brief scoped that merge to W6b (`e-m13`), and
  Minor 13's own text only asks for a name that "says what the [helper] does" as the immediate fix;
  the "one implementation" half is explicitly listed under W6's "Then" bullets, not "Placement".
- The `render/focus.ts` rename left several test files (`render/focusrestore.test.ts`,
  `render/launchrestore.test.ts`, `render/crumbs.test.ts`, `render/tiledrag.test.ts`'s `vi.mock`)
  needing an import-path fix; per this role's constraints I fixed only the import/mock-path
  line in each, not the file's location — `render/focusrestore.test.ts` and
  `render/launchrestore.test.ts` now physically sit in `render/` while importing from
  `../features/connectionrestore`/`../features/launchrestore`; `render/crumbs.test.ts` similarly
  imports `splitCrumbs` from `../features/launchcrumbs`. Flagged in Handoff for web-tests to
  relocate (a `git mv`, no content change) if desired.
- `docs/features/*/spec.md` `web:` glob edits made (all verified against `make gen-kb`/`make check-kb`,
  tails below): `actions`/`connection`/`update` widened `features/<name>.ts` → `features/<name>*.ts`
  (each gained one same-named `features/` sibling); `launch` widened both
  `features/launch.ts` → `features/launch*.ts` and `render/launchrestore*.ts` → `render/launch*.ts`
  (covers the new `render/launch.ts` too); `rail` gained `render/actionbutton*.ts`; `surfaces`
  gained `render/surfaceseg*.ts`; `reader` gained `render/frontmatter*.ts`; `issue` gained
  `render/issue*.ts`; `settings` gained `render/settings*.ts`.
- Size warnings kept on purpose (`make size-warn`, never a gate): `web/src/features/launch.ts`
  is 516 lines (was ~574–578 per the review; the ~120-line DOM-building block this unit moved
  out is most of the reduction — further shrinking below 500 is Major 5/other W6 items' job, not
  placement's). `web/src/render/reader.ts` is 544 lines (was 531, already accepted in the review's
  Note 6 as "holds, one component's DOM half"; the ~13-line frontmatter addition is the DOM half
  of d-m4's split and belongs here).

## Handoff

**Build status**: `npx tsc --noEmit` — **0 errors outside test files**; 6 errors confined to
`web/src/render/masthead.test.ts`'s `renderClaudeVersion` describe block (sanctioned breakage,
see below). `npm run build` therefore also fails at its `tsc` step (it type-checks tests too) —
this is the one break this role is not allowed to fix itself; `make web-lint` is clean; `make
web-test` is 59/60 files passing (1824/1829 tests), the 5 failures all in the same describe block.

**Sanctioned test breakage — `web/src/render/masthead.test.ts`, `renderClaudeVersion` describe
block (lines ~416–508 pre-existing numbering)**: `renderClaudeVersion`'s signature changed from
`(el, info: ClaudeCodeInfo | null)` to `(el, description: ClaudeVersionDescription)` (see Decisions
— `describeClaudeVersion` moved to `features/connectionversion.ts`, and `render/` cannot import
from `features/`). Five call sites need their argument wrapped in `describeClaudeVersion(...)`:
  - `renderClaudeVersion(el as unknown as HTMLElement, info)` (×3, the "no warning"/"warning
    present"/"below-range warning" cases) → `renderClaudeVersion(el as unknown as HTMLElement, describeClaudeVersion(info))`
  - `renderClaudeVersion(el as unknown as HTMLElement, null)` → `renderClaudeVersion(el as unknown as HTMLElement, describeClaudeVersion(null))`
  - the re-render transition test's inline `{ status: "verified", installed: ... }` object literal
    (×2 call sites, `info`-shaped) → wrap the same way
  `describeClaudeVersion` is already imported (I split that import in this same file to point at
  `../features/connectionversion`). This is a call-site fix (5 lines), not a behaviour or
  assertion change — the expected values in every case are unchanged.

**Not mine to fix — `docs/adr/launch-open-outcome-decided-in-controller.md`**: `make check-kb`
now reports one problem: its `files:` frontmatter lists `web/src/render/launchrestore.ts`, which
this unit moved to `web/src/features/launchrestore.ts`. `docs/adr/` is outside this unit's
authorized scope (web/, docs/conventions.md, `web/src/*/CLAUDE.md`, `docs/features/*/spec.md`
web globs only). Needs its `files:` entry updated to the new path — a one-line, non-decision
fix. I flagged this to the team lead directly since it blocks a required gate.

**Test-file comments now describing a stale location (not fixed — prose, not an import
statement)**: `web/src/render/dead.test.ts`'s header comment ("loadPane is the one export in
render/dead.ts..."); `web/src/protocol/hello.test.ts:39` ("the renderer (masthead.ts
describeClaudeVersion)"); `web/src/sessions/permission.test.ts:18` ("render/launchrestore.ts's
initialRestore/repoRestore"); `web/src/terminal/surfaceswitch.test.ts`'s header comment (still
substantively true, doesn't name `render/surfaceseg.ts`). None of these affect correctness.

**Gate tails**:
```
$ npx tsc --noEmit   (6 errors, all web/src/render/masthead.test.ts — listed above)
$ make web-lint
Checked 231 files in 186ms. No fixes applied.
$ make web-build
(fails at the tsc step — same 6 masthead.test.ts errors; vite never runs)
$ make web-test
Test Files  1 failed | 59 passed (60)
     Tests  5 failed | 1824 passed (1829)
$ make gen-kb
kb: regenerated 20 file(s): ... web/src/render/CLAUDE.md
$ make check-kb
docs/adr/launch-open-outcome-decided-in-controller.md: files entry "web/src/render/launchrestore.ts" matches no file
kb: 425 records, 23 features, 1 problem(s)
$ python3 .claude/skills/orchestrate/scripts/dead-refs.py
dead-refs: 568 references checked, 0 missing
$ make size-warn
(72 hits tree-wide, pre-existing except the two web/ files noted in Decisions; never a gate)
```
