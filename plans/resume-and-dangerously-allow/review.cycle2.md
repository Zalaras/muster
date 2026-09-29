# Review: resume-and-dangerously-allow

**Plan**: resume-and-dangerously-allow
**Verdict**: needs-changes
**Cycle**: 2
**Gates**: 2 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser approved, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Resume and Dangerously Allow

**Plan**: resume-and-dangerously-allow
**Part verdict**: needs-changes
**Cycle**: 2
**Pack**: `kb: pack 44418 words (budget 20000)`

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes. `PermissionBypass` is in `PermissionModes`, and the Resume action passes the latched mode through `BuildArgv` | Yes: D1, E1, bypass.spec | pass |
| REQ-2 | Yes. The warning's visibility now derives from `face.danger` | Yes: W1, E1, INV-2 round trip | pass |
| REQ-3 | Yes: `permissionModeToCheck` goes through `isBypassMode` | Yes: W2, E4 | pass |
| REQ-4 | Yes: `bypassChip` goes through `isBypassMode` | Yes: W3, E2, E3, E12, INV-1 | pass |
| REQ-5 | Yes | Yes: W4, E2 | pass |
| REQ-6 | Yes. `listPastSessions` is now a domain function | Yes: D3–D8, D16, `TestListPastSessions_*` | pass |
| REQ-7 | Yes | Yes | pass |
| REQ-8 | Yes. `requestId` drops late responses | Yes: new E2E "…no longer listed is dropped (W8, edge case 19)" holds dir A's fetch, releases it after B, and asserts only B's row and the `· 1` head | pass |
| REQ-9 | Yes. `AliveByClaudeSessionID` scans `m.sessions` (`Alive && (ClaudeSessionID == id \|\| pendingResumeClaudeSessionID == id)`) | Yes: E5, resume-bound E2E, pending E2E, /clear-freed E2E (edge case 11) | pass |
| REQ-10 | Yes. The mode is passed verbatim, or `default` when none is recorded (kb:adr/launch-resume-passes-any-recorded-mode) | Yes: D9, E6, `TestLauncher_LaunchResume_RecordedUnofferedModeReachesArgvVerbatim`, dontAsk E2E (`--permission-mode dontAsk` in the pane start command) | pass |
| REQ-11 | Yes. The chip is a flex sibling of `.t` inside `.tw` | Yes: W1, E7, long-title chip E2E | pass |
| REQ-12 | Yes. Both 409s cover bound and pending rows, and `LockClaudeSession` serialises launchResume against Resume | Yes: D11, D12, `TestLauncher_Resume_Refuses…ResumeBound…`, `TestLockClaudeSession_Serializes…`, actions.spec resume-bound 409, pending E2E 201→409 | pass |
| REQ-13 | Yes | Yes: E6 | pass |
| REQ-14 | Yes | Yes: W5, E10 | pass |
| REQ-15 | Yes | Yes: D15, past-sessions REQ-15 | pass |
| INV-1 | Yes | Yes | pass |
| INV-2 | Yes | Yes: new "primary face recomputes on a tab switch in both directions" (New+bypass → Resume+plain row → New) | pass |
| INV-3 | Yes | Yes | pass |
| INV-4 | Yes, for bound and pending rows. The pending claim is in memory only, so a daemon restart drops it (Notes 2) | Yes: `TestAliveByClaudeSessionID_{ClearRebind…, LoadAllPicks…, PendingResumeHolds…, ResumeBindKeeps…, PendingResumeReleasesOnDeath, …BindsADifferentID}` | pass |
| States: null model | Yes. `mainheadMeta` pushes `unknown` for a null model (kb:adr/launch-resume-null-model-reads-unknown) | Yes: card.test mainheadMeta cases, E2E "…shows unknown in the mainhead meta" | pass |
| DIAG | `kb:diagram/containers` (fixed in 4ed877f: "lists past sessions"), `daemon-components`, `web-components`, `store-schema`, plan `## Diagrams` sequence | — | **fail** (orchestrator-owned): the plan's sequence diagram still branches on `alt bound to an alive row`, but a pending `--resume X` row now also returns `409 already_open`. See Major 2. `containers` is now true. `store-schema` is unchanged, since the pending claim is not persisted |

## Build & Tests

E2E tests: pass (497/497) · Daemon tests (race): pass (24 packages ok, 0 FAIL) · Web tests: pass (1929/1929, 77 files) · Daemon build: pass · Web build: pass · Lint: pass (golangci 0 issues; Biome clean, 262 files). All read from $GATES_LOG_DIR (`gates-resume-and-dangerously-allow-c2`).

Baseline gate lines:
- contrast pass (43 pairs × 3 themes)
- versions pass
- e2e-honest pass
- **kb-check FAIL**: the same 3 unowned e2e files. The developer accepted this until Step 7 doc-reconcile. It is unchanged since cycle 1 and no larger.
- dead-refs pass (3328 checked, 0 missing)
- e2e-lint pass
- **features FAIL**: 2 `ingest` touches, `claudecodetest/transcripts.go` and `e2e/helpers/payloads.ts`. The developer accepted this. Neither file changed this cycle (`git diff 3735df2..HEAD` does not list them), so both are still minor: one is a test-only fixture writer, the other a type-only union widening. `render/masthead.ts` left the list when the `displayName` widening was reverted.
- comments pass
- size WARN (`review-maintainability`'s)

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D0 | `make build` | pass (17-D0.log) |
| D17 | `! rg -n '"custom-title"\|"ai-title"\|"last-prompt"\|\.claude/projects' cmd/ internal/ --glob '!internal/claudecode/**' --glob '!**/*_test.go'` | pass (18-D17.log empty) |
| D18 | `make test` | pass (deduped to 02-test.log, race) |
| D19 | `make lint` | pass (deduped to 03-lint.log) |
| W0 | `make web-build` | pass (deduped to 04-web-build.log) |
| W10 | `make web-lint` | pass (deduped to 06-web-lint.log) |
| W11 | `make web-test` | pass (deduped to 05-web-test.log) |
| E0 | `make e2e` | pass (deduped to 16-e2e.log, 497 passed) |
| K1 | `make check-kb` | **FAIL** (10-kb-check.log): `web/e2e/bypass.spec.ts`, `web/e2e/helpers/resume.ts` and `web/e2e/past-sessions.spec.ts` are owned by no feature. The developer accepted this until doc-reconcile registers them, so it is not routed |
| DOC | doc upkeep + Doc Delta vs what shipped | **FAIL**, `[orchestrator]` only (Major 2). The three new ADRs (`launch-resume-passes-any-recorded-mode`, `-pending-resume-holds-id`, `-null-model-reads-unknown`) exist as `proposed` with `refs: plan:resume-and-dangerously-allow` and describe what shipped. No `deviation:` lines. The `containers` label is fixed. The superseded `doc-delta:` line 43 is to be excluded at Step 7, as the orchestrator stated. The Doc Delta's "running-session guard" and "resume in the original mode" claims now hold in code |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W9 | no `any` in new web code | pass | Grepped the cycle-2 diff of `web/src` and `web/e2e`: the only hit is the English word in a comment (`protocol/session.test.ts`) |
| R1 | chip and danger button use `--danger`, never `--rose` | pass | No `--rose` added. `.bypass-warn b` now uses `--banner-fg`, which is paired with `--banner-bg` in `contrast-pairs.json:32` |
| R2 | exactly one filled button | pass (code) | `renderLaunchButtonFace` is unchanged. `#launch-button` only gains `flex-shrink:0; white-space:nowrap` |
| R3 | real verification on haiku | not yet run | This runs post-pipeline in the main session |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. D17 is green. The new `pendingResumeClaudeSessionID` and `LockClaudeSession` are neutral ids, and `--resume`/`--permission-mode` stay in `claudecode.BuildArgv` |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler / ≤2 s timeouts | pass. No hook code was touched. `applyBind` only clears one field |
| 4 | tmux `-L muster` / sizing | pass. The spawn is unchanged. tmux `new-session -- argv…` runs without a shell, so a verbatim transcript mode cannot inject |
| 5 | No payload logging | pass |
| 6 | Empty-gauge honesty | pass. A null model now reads `unknown` instead of an omitted clause, and `parseModelInfo` rejects a null `displayName`, so a model is either real or null |
| 7 | Identity on the tmux target | pass. The claude-id scan and lock are a guard, not identity |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary | pass |

## Cycle 1 issues

| Cycle-1 issue | Fix commit | Verified how |
|---------------|------------|--------------|
| code Major 1 `[daemon-impl]` `AliveByClaudeSessionID` trusts `byClaude` | `86ed7af` | Diff read: it scans `m.sessions` for `Alive` plus current or pending id. A /clear-freed id and a restart ordering both answer from the row |
| code Major 2 `[daemon-tests]` no clear-rebind / LoadAll test | `b7b0a15` | `TestAliveByClaudeSessionID_ClearRebindReleasesTheOldClaudeID` and `…_LoadAllPicksTheAliveRowRegardlessOfCreationOrder` run both orders across a fresh Manager |
| code Major 3 `[web-impl]` false null-displayName comments | `14b3aee` | The widening is reverted (`displayName: string`, `parseModelInfo` requires a string), and all three comments are gone |
| code Major 4 `[web-tests]` tests pin the null wire shape | `6d77a1e` | The fixture uses `displayName: <id>`, and the two parser tests now assert rejection |
| code Major 5 `[web-tests]`→`[e2e-specs]` W8 untested | `79f4ddc` | Route-hold E2E read (past-sessions.spec.ts:551). The hold is keyed on the `directory` param and the absence is asserted after release |
| code Major 6 `[e2e-specs]` INV-2 across tab switches | `79f4ddc` | past-sessions.spec.ts:511 checks face, class and warning on each of the three legs |
| code Major 7 `[orchestrator]` containers label | `4ed877f` | Diff read |
| code Major 8 `[orchestrator]` superseded doc-delta line 43 | — | The orchestrator will exclude it at Step 7. The code it described has since been reverted |
| code Minor 1 `[web-impl]` `.bypass-warn b` on `--danger-fg` | `14b3aee` | Now `var(--banner-fg)`. The pair is contrast-gated |
| code user-decision 1 (unoffered mode) | `86ed7af` | `launchResume` drops the `ValidPermissionMode` gate, and so does `BuildArgv` (see Notes 1) |
| code user-decision 2 (pending window) | `86ed7af` | `CreateParams.ResumeClaudeSessionID` becomes `pendingResumeClaudeSessionID`, which is cleared in `applyBind` and rolled back in `restoreChangedFields`. `LockClaudeSession` covers both paths. Lock order is session→claude in Resume and claude→(new id's) session in launchResume, which cannot cycle because a new row's id is never the Resume target's |

Browser and maintainability cycle-1 items are for their own reviewers to verify. From the code: the footer dash with no selection (`renderResumeFooter`), the `.tw` chip sibling, focus restored across the rebuild (`captureFocusedKey`/`restoreFocusedKey`), `#launch-error` cleared on `onUserAction`, arrow-key tabs and `aria-labelledby="launch-dialog-name"`, the shared `validateLaunchDirectory`, the `listPastSessions` domain function, `pastRowView`, and the single `isBypassMode` owner are all present.

## Issues

### Critical

None.

### Major

1. **[daemon-impl]** Two comments state a permission-mode set that this plan made false:
   - `internal/claudecode/launch.go:33-38`: `LaunchParams`' doc says validation of "a known permission mode" is the caller's job, and the field comment says `PermissionMode string // one of PermissionModes`. Under kb:adr/launch-resume-passes-any-recorded-mode, `launchResume` deliberately passes a mode outside `PermissionModes` (`dontAsk`, which the dontAsk E2E asserts), and the Resume action passes the hook latch, which `latchPermissionMode` never validated. `BuildArgv`'s own doc two functions down already says the opposite.
   - `internal/session/session.go:47`: `ValidPermissionMode` "reports whether s is one of the four permission modes". There are five since `PermissionBypass` joined.

   Fix: have the field comment say what `BuildArgv` actually does (any non-empty mode is emitted verbatim; the caller validates or deliberately doesn't), and change "four" to "five", or better, drop the count.

2. **[orchestrator]** The pending-resume amendment (kb:adr/launch-resume-pending-resume-holds-id) reached `already_open` and `openSessionId`. It did not reach these texts that doc-reconcile promotes or that bind:
   - The plan's `## Diagrams` sequence (`plan.md:190`) reads `alt bound to an alive row`. The Doc Delta promotes it verbatim into the past-sessions spec. It should read "held by an alive row (bound, or pending a resume)".
   - The Resume action's `409 not_resumable` cause, "another alive session is bound to the same `claudeSessionId`" (`docs/protocol.md:326`; plan REQ-12 `plan.md:66-67` and line 53). The code (`launcher.go` `Resume` → `AliveByClaudeSessionID`) also refuses when another row is *pending* a resume of that id.
   - kb:adr/launch-resume-running-guard-muster-only's summary ("disabled only when an alive Muster session is bound to it") is a `proposed` record of this plan and is now narrower than what shipped.

   None of these is a pipeline agent's to fix, so this does not block.

### Minor

None.

### Notes

1. **[note]** Dropping `ValidPermissionMode` from `BuildArgv` changes the existing Resume action too. A hook-latched mode Muster does not list, such as `dontAsk` in a payload, now reaches `--permission-mode` verbatim. Before, it sent no flag and so followed Claude Code's configured default, which can be auto. This fits the protocol's `[--permission-mode <latched>]` and the ADR's "a resumed session comes back as it was". The ADR's `files`/Consequences name only the resume-from-list path, though. The log's claim that all three callers pass "previously-validated" modes is also not true of the Resume action's latch. doc-reconcile may want the actions/lifecycle wording to mention it.
2. **[note]** The pending claim is in memory only, as the decision chose ("The pending id lives in memory"). After a daemon restart, an alive resumed row that has not bound yet no longer holds X. `openSessionId` then reads null, and a second resume succeeds, so the amended contract text ("or was spawned to resume it and has not bound yet") is false in that window. The trigger is narrow: a restart while a resumed session still sits at the trust prompt or bypass warning. doc-reconcile could qualify the protocol sentence with "since this daemon started".
3. **[note]** `mainheadMeta`'s `unknown` applies to every null-model session, not only resumed ones (on `main` the clause was omitted). This matches the plan's States-row premise ("reads as any null model does today (`unknown`)") and design-system §6.
4. **[note]** The null-model E2E asserts `#mainhead .meta` `toContainText("unknown")`. It is loose, but the directory basename cannot contain "unknown", so it is not vacuous.
5. **[note]** For `review-maintainability`: `claudeLocks` entries are never `Forget`-ed. Growth is bounded by the number of distinct resumed ids, and the daemon log states the trade-off.
6. **[note]** No new Repairs rows this cycle. The 13 new E2E tests use measured payload shapes (`sessionStartResume`, `rawSessionEnd(…,"clear")` plus `SessionStart{source:"clear"}`), and none weakens an earlier assertion.

## Browser review

# Browser review: Resume and Dangerously Allow

**Plan**: resume-and-dangerously-allow
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 26542 words (budget 20000) — WARN exceeds budget
**Rig**: `make web-build build` at 173a55f. Per-test scratch daemons came from `helpers/fixtures.ts`: data dir `$TMPDIR/muster e2e-XXXX` (the path has a space), a `-S` tmux socket inside it, a scratch `-claude-projects-dir` inside it, and the stub `claude` at `$TMPDIR/muster e2e-stub-cd75a542396fd84f/claude`. Driven in headless Chromium at 1280×800 by one throwaway spec, `web/e2e/zz-browser-probe.spec.ts`, under the Playwright gatelock. The spec is deleted. Fixture teardown killed every daemon and tmux server: `pgrep` finds no musterd or `tmux -S`. `git status --porcelain` shows only the other reviewers' part files.

Gates log (`gates-…-c2`): `e2e` passed 497 and `web-build` is green, so I drove the app that will ship. `check-kb` and `features-scope` are red. Both are known and accepted.

## Matrix

Hosts: **focus** (rail card and mainhead), **tiles** (tile `.thead` and strip card), and **dialog** (the launch modal). No pop-out host exists for this plan: `/doc.html` belongs to the reader.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| cycle-1 Critical 1 / REQ-9 | dialog | a row resumed from the list, bound by `source:"resume"` | disabled, reads `open in Muster` | pass | `/api/past-sessions` returns `["sess-one",2]`. Row `disabled`, text `One fixture267dopen in Muster`, no `aria-pressed`. Default selection moved to the next enabled row, `X fixture` |
| cycle-1 Critical 1 / REQ-12 | dialog + API | the same row | second resume refused | pass | POST → `409 {"code":"already_open","id":2}` |
| cycle-1 Critical 1 / REQ-12 | focus mainhead | dead A holds `sess-x`; C was resumed from the list and bound `sess-x` via `resume` | A's Resume refused | pass | Click → `#action-error` `display:block` at 0,59–1280,91, text `that claude session is already open in Muster session 3`. `/api/state`: `[1,false,"sess-x"]`, `[3,true,"sess-x"]`, so only one row is alive |
| cycle-1 Critical 2 / INV-4 | dialog + API | pending resume (alive, not yet bound) | holds the id | pass | pending row `[1,true,null,"started"]`. `openSessionId` is 1. Row disabled, `.lp` reads `open in Muster` in `--disabled-fg` rgb(166,171,188). POST → `409 already_open id 1` |
| decision pending-resume-holds-id | dialog | the pending row's pane is killed | claim released on death | pass | row goes dead. `openSessionId` null, row enabled, footer `Resume Dup fixture in <path>` |
| decision pending-resume-holds-id | focus mainhead | dead A holds `sess-p`; the resume of `sess-p` from the list is still pending | A's Resume refused | pass | `#action-error` `display:block` `…open in Muster session 2`. A stays dead, one alive row |
| cycle-1 Major 1 | dialog | Resume, no match | footer shows no target | pass | `No sessions match`; footer `Resume —`, button disabled |
| cycle-1 Major 1 | dialog | the filter deselects the selected row | footer shows no target | pass | selected row filtered out: 1 row, `aria-pressed=false`, footer `Resume —`, button disabled |
| cycle-1 Major 1 | dialog | every row disabled | footer shows no target | pass | footer `Resume —`, button disabled |
| cycle-1 Major 1 / edge 3 | dialog | untitled row selected | `(untitled)` only then | pass | footer `Resume (untitled) in <path>`, `Resume` enabled |
| cycle-1 Major 2 / REQ-11 | dialog | bypass row with a 112-character title | chip inside the row | pass | chip 904,516–957,529 inside row 281,508–999,549. `.t` 293–898 ellipsises (sw 829 > cw 605). Chip `display:block`, opacity 1, bg rgb(194,70,70) |
| cycle-1 Major 3 | dialog | keyboard selection | focus stays on the chosen row | pass | Tab ×4 from the filter to row 4, then Space. After 1.2 s, activeElement is `sess-k4`, pressed. The next Tab goes to `sess-k5`. Enter behaves the same way |
| cycle-1 Minor 1 / decision null-model | focus mainhead | resumed, model null | reads `unknown` | pass | API `model:null`. `.meta` reads `probe-p6-… · unknown` |
| States: model unknown | focus card / tile | resumed, model null | — | N/A: the card and the tile carry no model field for any session | the card shows `ctx unknown`; no model word on any session's card |
| cycle-1 Minor 2 | dialog | 404 error, then a tab switch | `#launch-error` cleared | pass | `display:block` with the 404 message, then `display:none` after the New tab click |
| cycle-1 Minor 2 | dialog | 404 error, then a new row selection | cleared | pass | `display:none`, `hidden` set |
| edge 7 | dialog | transcript deleted | 404 shown, then refetch | pass | message shown. After the refetch the only row left is `Stay fixture` |
| cycle-1 Minor 3 | dialog | Resume bypass row with a 1,768-px-wide target path | one-line danger face | pass | `Resume without checks` box 817,562–983,587 (166×25). `#launch-target` 297–736 ellipsises (sw 1768 > cw 439). Everything is inside the footer 281–999 |
| cycle-1 Minor 3 / REQ-2 | dialog | New + bypass | one-line danger face | pass | `Launch without checks` 166×25, `btn key-danger`, bg rgb(194,70,70) |
| cycle-1 Minor 4 / REQ-7 | dialog | keyboard | arrow keys switch tabs | pass | New focused → ArrowRight: focus on `#launch-tab-resume`, `aria-selected=true`, `#past-sessions` `display:grid`. ArrowLeft: back to New, `.fields` `display:grid` |
| cycle-1 Minor 4 | dialog | — | accessible name exactly `New session` | pass | `getByRole('dialog',{name:'New session',exact:true})` count is 1. Aria snapshot `dialog "New session"` (the heading's own name, Note 4) |
| REQ-2 | dialog | New, not bypass | warning hidden | pass | `hidden`, `display:none` |
| REQ-2 | dialog | New + bypass by keyboard | warning shows, text exact | pass | ArrowRight from `auto` checks `bypassPermissions`. `display:block` at 297,582–983,624, inside the dialog 280,111–1000,689. textContent is the specified string exactly. `<b>` rgb(243,183,183) on rgb(58,30,30), the `--banner-*` pair |
| REQ-3 / INV-3 | dialog | directory whose last launch was bypass | opening the dialog restores `auto` | pass | `auto` checked, face `Launch`, warning `display:none`, target is that directory |
| REQ-3 / INV-3 | dialog | Recent click on that directory | `auto` | pass | `auto` checked |
| REQ-1 | focus | New + bypass launch | argv | pass | `… --model sonnet --name probe-bypass-new --permission-mode bypassPermissions` |
| REQ-4 | focus rail card | bypass launch, started | chip | pass | `display:inline` at 159,99–212,112 |
| REQ-4 | focus mainhead | bypass launch | chip | pass | `display:block` |
| REQ-4 | tiles `.thead` | bypass launch | chip | pass | chip 162,95–214,108 inside `.thead` 2,86–639,117 |
| REQ-4 | focus + tiles | resumed bypass session, long title | chip in each host | pass | card chip 14,134–67,147 inside `.r1` 14,94–288,147. Mainhead chip 1201,120–1254,133 inside mainhead 300–1280. Tile chip 307,95–360,108 inside `.thead` 2,86–639,117 |
| REQ-4 / INV-1 / edge 17 | focus + tiles | resumed bypass session; latch → default → bypass | chip follows the latch | pass | enveloped prompt with `default`: card `none`, mainhead `none`, tile `none`, mode `{default,hook}`. Back to bypass: tile chip `block` at 117,153–170,166 |
| REQ-4 | all | non-bypass session (`default`, `dontAsk`) | no chip | pass | chip `display:none` on the card and in the mainhead |
| REQ-4 | tiles strip card | — | chip | note | not re-measured this cycle (Note 5) |
| REQ-5 | focus rail card | bypass, first launch | combined note | pass | `first launch here — likely waiting on Claude Code's trust prompt, then its bypass warning`, both for a New launch and for a resume from the list |
| REQ-8 | dialog | Resume, 200 rows | list reachable | pass | `#past-list` `overflow-y:auto`, sh 8256 > ch 231. Wheel scrollTop → 8024. The last row can be clicked (pressed; scrollTop settles at 7969) |
| States: truncated | dialog | 205 transcripts | `Showing the newest 200` reachable | pass | 200 rows. `.trunc` at 595–628, inside the list 408–639 after the scroll |
| REQ-14 | dialog | typing in the filter | keeps focus | pass | typed by keys. activeElement is `#past-filter` 1.6 s later |
| REQ-10 | focus | resume a row with no mode | `default` | pass | `… --resume sess-nomodel --permission-mode default`, seed `{default}` |
| REQ-10 / decision any-mode-verbatim | dialog + focus | `dontAsk` row | passed verbatim | pass | face `Resume`, `btn key`, no row chip. argv `… --resume sess-dontask --permission-mode dontAsk`. Seed `{dontAsk,seed}`; the dashboard renders it with no chip and no error |
| REQ-10 / decision displayName | focus mainhead | resumed, model recorded | displayName = id | pass | API `{id:"claude-opus-4-1-20250805",displayName:same}`. Meta `… · claude-opus-4-1-20250805` |
| REQ-11 | dialog | non-bypass row | `Resume`, amber | pass | `btn key` |
| REQ-13 | focus / tiles | resume | opens like a launch | pass (cycle-1 measurement, path unchanged) | the rail card and tile each appeared for every resume in this run; not re-measured separately |
| States: daemon-down | dialog | Resume, re-entering the tab | error line, disabled | pass | `Couldn't read sessions — try again`, head has no count, button disabled, footer `Resume —` |
| States: daemon-down | dialog / focus / tiles | — | surfaced prominently | pass | `#banner` `display:block` 0,46–1280,78, `musterd unreachable — …`. Status `reconnecting…` in both Tiles and Focus |
| States: daemon-down | dialog | Resume list showing, no refetch | stale rows | note | rows stay and Resume stays enabled until the tab is re-entered (Note 3) |
| §7 | focus / tiles | — | one live client, scrollback 0 | N/A: this plan changes no terminal surface | — |

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** Measured again: every cycle-1 issue is fixed in the running app. That covers Criticals 1–2, Majors 1–3 and Minors 1–4, as the matrix rows prefixed `cycle-1` show.
2. **[note]** An existing mainhead layout defect that this plan's chip makes a little worse. For a title with no break opportunity, `.name` does not ellipsise (sw = cw = 875), so the mainhead's actions leave the viewport:
   - `.acts` measured 1495–1683 against a 1280 viewport with the chip, and 1457–1645 without it, so End, Resume and Remove are off-screen either way.
   - With the chip, `.meta` also crosses the mainhead edge: 1266–1307 against 1280. Without the chip it measured 1228–1269, just inside.
   - A title with spaces wraps and lays out correctly.

   Nothing in this plan changed the mainhead layout; its CSS diff adds only `.chip-danger`. This is a backlog item, not a change requested here.
3. **[note]** Carried from cycle 1: when the daemon dies while the Resume list is showing, the stale rows and an enabled `Resume` stay until the tab is re-entered. The global banner is up, so the honesty rule holds.
4. **[note]** The dialog's accessible name is now exactly `New session`. The `<h2>` heading's own accessible name is still `New session Session kind` (aria snapshot), because the tablist sits inside it. No change requested.
5. **[note]** Cells not measured this cycle:
   - The strip-card chip: eight sessions all stayed in the grid, so the strip never showed. The strip card uses the rail-card template, whose chip passes, and cycle 1 measured it directly.
   - The light theme: the contrast gate covers it.
   - The real Claude Code bypass warning: that is R3, the orchestrator's real verification.
6. **[note]** For `review-work`: a raw (non-enveloped) hook for a session bound through `SessionStart{source:"resume"}` is not routed to that session. A raw `UserPromptSubmit` carrying `permission_mode:"default"` left the mode at `{bypassPermissions, seed}`, while the same payload enveloped flipped it to `{default, hook}`. `Manager.Apply` writes the `byClaude` routing index only for `KindBind` and `KindClearRebind`, which is what `Resolve` reads. Real hooks are always enveloped (kb:adr/ingest-envelope-authoritative-binding), so only the canary and legacy raw paths are affected.
7. **[note]** The `not_resumable` message reads `that claude session is already open in Muster session N`: lowercase `claude`, where `already_open` says `Claude Code session`. It is a wording inconsistency the user sees in `#action-error`, and it belongs to `review-work` if it is worth a change.
8. **[note]** Carried from cycle 1: a session resumed from the list into a directory with no repo row reads `first launch here — likely waiting on Claude Code's trust prompt`, even though transcripts show Claude Code has run there before. This follows the contract.

## Maintainability review

# Maintainability review: Resume and Dangerously Allow

**Plan**: resume-and-dangerously-allow
**Part verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 31121 words (budget 20000) (WARN pack exceeds budget of 20000 words)
**Scope**: 32 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`. This is a full re-review, not a delta, because cycle 1 had open Majors. The fix diff `3735df2..HEAD` (21 non-test files) was read against every cycle-1 issue.

## Prior cycle (cycle 1) issues

| Prior issue | Fix commit | Verified how | Result |
|---|---|---|---|
| Major 1: directory validation copied three times | 86ed7af | `rg validateLaunchDirectory\|errLaunchDir` finds one owner at `launcher.go:150-170`. Its three callers are `launcher.go:178`, `launcherpast.go:19` and `launcherpastlist.go:68`. No copied `filepath.IsAbs(req.Directory)` lines remain. | fixed |
| Major 2: `handleListPastSessions` did business logic | 86ed7af | The handler (`launcherpastlist.go:66-87`) now decodes, validates, calls `listPastSessions` and encodes. `listPastSessions(projectsDir, dir, manager)` takes no `http.Request`, the same shape as `browseDirectory`. | fixed (a new Minor 2 below covers the error switch) |
| Major 3: one-alive-row guard was an unguarded check-then-act | 86ed7af | See the interleaving analysis below. `claudeLocks keyedlock.Locks[string]` (`manager.go:126-136`) is named, and its writers are named. `launchResume` holds it from its check through `createAndSpawn` (`launcherpast.go:73-127`). `Resume` holds it from its check through `RecordResume` (`launcher.go:460-510`). `CreateSession` sets `pendingResumeClaudeSessionID` before the row enters `m.sessions`. `AliveByClaudeSessionID` matches that pending id too, and `applyBind` clears it. The race is covered by `TestLockClaudeSession_SerializesTheCheckThenClaimRaceForOneClaudeID` (`manager_test.go:3523`), and the gates' `02-test.log` shows `go test -race` ok for `internal/session` and `internal/server`. | fixed |
| Minor 1: missing daemon `design:` lines | 86ed7af (log) | `daemon-implementation.md` Fix Attempt 3 § Decisions has lines for `launcherpast.go` and its functions, `TouchRepo`, `AliveByClaudeSessionID` and `claudecodetest/transcripts.go`. The `TouchRepo` reason holds against `UpsertRepoParams`' plain-string fields. | fixed |
| Minor 2: `pastSessionsFeature` file naming | 86ed7af (log) | Decisions now says why the feature is in the `launcher*` family: it only serves the Resume tab, and the plan globs `launcherpast*.go`. That is the "or state why" branch the finding offered. | fixed |
| Minor 3: no web `design:` lines | 14b3aee (log) | `web-implementation.md` Fix Attempt 3 § Decisions has one line for each of the six items. | fixed (the `PastRow` line's reason is contested in Minor 4 below) |
| Minor 4: view decisions in `render/` | 14b3aee | `pastRowView` (`features/launchpastlist.ts:37-43`) owns the title fallback and the chip flag. `render/launchpast.ts` reads `row.title` and `row.bypassChip`. `renderResumeFooter` no longer has its own fallback. | fixed |
| Minor 5: five bypass literals | 14b3aee | `rg '"bypassPermissions"' web/src -g '!*.test.ts'` now finds only `isBypassMode` (`sessions/permission.ts:15`) and the protocol's mode list. `features/launch.ts:357` reads `face.danger`. | fixed |

**Major 3 interleaving check (the cycle-1 sequence, replayed on the fix).** Dead row 3 is bound to X, and `POST {resumeSessionId: X}` holds `claude(X)`. `CreateSession` then puts row 7 into `m.sessions` with `Alive=true` and `pending=X` under `mu`. The user's Resume on row 3 takes `session(3)`, then blocks on `claude(X)`. Once it gets the lock, `AliveByClaudeSessionID(X)` returns 7, so the Resume is refused. Two resume-from-list POSTs for X are serialized the same way.

Lock order is inverted between the two paths. `launchResume` takes `claude(X)` and then `session(new)` in `spawnAndRecordLaunch`. `Resume` takes `session(id)` and then `claude(X)`. I could not build a cycle from this. A `Resume(N)` aimed at the row that `launchResume` has just created sees `Alive == true` and returns before it asks for `claude(X)`, and fresh ids are never reused. See Note 3.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/main.go | (composition root) | size: line | filelen 513, funlen parseFlags/run; reason holds | pass |
| internal/claudecode/launch.go | launchtranscripts.go | n/a (edit; decision record cited) | none | pass |
| internal/claudecode/launchtranscripts.go | status.go, ingest.go | yes | none | pass |
| internal/claudecode/claudecodetest/transcripts.go | claudecodetest.go | yes (cycle-1 fix) | none | pass |
| internal/server/launcher.go | browse.go, launcherpast.go | yes (`validateLaunchDirectory`) | filelen 553, reason given for 525 still holds | note |
| internal/server/launcherpast.go | launcher.go | yes | **funlen `launchResume` 61, no reason** | Minor 3 |
| internal/server/launcherpastlist.go | browse.go, repos.go | yes (`listPastSessions`) | none | Minor 2 |
| internal/server/launcherrors.go, respond.go, sessions.go, server.go | each other | yes / n/a | funlen `New` 43 (one line) | pass |
| internal/session/manager.go | apply.go, writeorder.go, session.go | yes (Fix Attempt 3) | **filelen 542 (469 on main), no reason** | Minor 1, Minor 3 |
| internal/session/machine.go | apply.go | n/a (one-field clear) | funlen `applyInput` 52, already present on main and not touched | note |
| internal/session/session.go, writeorder.go | manager.go | n/a | none | pass |
| internal/store/repo.go | repo.go's `UpsertRepo` | yes (cycle-1 fix) | none | pass |
| web/src/api/launch.ts | http.ts | yes | none | pass |
| web/src/features/launch.ts | launchmodels.ts, launchresume.ts | size reason | filelen 731; reason holds | pass |
| web/src/features/launchpastlist.ts | launchmodels.ts, launchrestore.ts | yes | none | Minor 4 |
| web/src/features/launchresume.ts | updaterestart.ts, launch.ts | yes | none | pass |
| web/src/render/launchpast.ts | render/launch.ts, reader.ts, focuskeep.ts, render/CLAUDE.md | yes, contested | none | Minor 4 |
| web/src/render/launch.ts | render/launchpast.ts | yes | none | pass |
| web/src/render/mainhead.ts, tiles.ts, sessions.ts, masthead.ts | each other | Decisions bullet | none | pass |
| web/src/sessions/card.ts, permission.ts | each other | yes | none | pass |
| web/src/protocol/session.ts | usage.ts | reverted to main's shape | none | pass |
| web/src/style.css | own `.recents`/`.chip-danger` blocks | n/a (scoped `.past-list` rules) | none | pass |

## Issues

### Critical

### Major

### Minor
1. **[daemon-impl]** `internal/session/manager.go:126-136`: a new guard's key invariant is kept in a plan log instead of beside the guard. The `claudeLocks` declaration ends with "Unlike locks, no caller ever calls Forget on an entry here — daemon-implementation.md's Decisions has the trade-off." That Decisions entry holds the load-bearing rule: calling `Forget` here "would silently reopen Maintainability Major 3's race". Right above it, `locks`, the sibling field of the same `keyedlock.Locks` type, does reclaim its entries, and the Decisions log says this map grows without bound. A newcomer who sees that growth next to a sibling that reclaims would add the `Forget` and bring the double-claim back.
   - Cites § Design "Shared state names its writers and its guard". The guard's rules belong where it is declared.
   - Cites § Comments "a subtle invariant … cite `kb:adr/<slug>`". The comment points at an unnamed plan file, not a kb record.
   - A fix must put at the declaration both the rule (entries are never forgotten) and the reason (a forgotten entry lets a second claimant get a fresh mutex while the first still holds the old one). It must not point into `plans/`.

2. **[daemon-impl]** `internal/server/launcherpastlist.go:68-75`: the error switch has no `default` arm. Any error from `validateLaunchDirectory` other than the two sentinels hits `return` with nothing written, so the client gets an empty 200 instead of a JSON error. Its sibling, `internal/server/browse.go:62-72` (`handleBrowse`, the shape this handler's own doc cites), ends its sentinel switch with a `default:` that logs and writes `500 internal_error`. Today `validateLaunchDirectory` returns only the two sentinels, so nothing fails yet. But the one-owner function was written so that a later rule lands in one place, and a new failure added there would reach this handler as a silent empty 200. Cites § Design "Match the siblings … error path". A fix must make every non-nil error from the validator produce an error response here, as `handleBrowse`'s does.

3. **[daemon-impl]** Two size warnings are new in this cycle's fix wave, and neither has a reason in `daemon-implementation.md` § Decisions:
   - `internal/session/manager.go` filelen 542: 469 on main, 497 at `3735df2`, now 542.
   - `internal/server/launcherpast.go:50` `launchResume` funlen 61 > 60. This follows the lock and comment block the wave added.

   The only size line in Decisions (`size:`) covers `launcher.go` at 525 and `main.go`. This is kb:adr/process-size-linters-warn-never-fail plus the reviewer's question 6: a hit with no reason is a Minor. A fix must add a reason for each warning or change the shape. A split is not being asked for.

4. **[web-impl]** One row-view shape is declared twice. `web/src/render/launchpast.ts:21-25` declares `interface PastRow`, and `web/src/features/launchpastlist.ts:31-35` declares `interface PastRowView`, with identical fields. The `design:` line explains the copy by dependency direction ("render/ must take `pastRowView`'s output structurally rather than import its type"). That rules out only render/ importing from features/. It misses the direction this feature's own sibling already uses: `web/src/features/launchmodels.ts:7`, `import type { ModelRowState, ModelSelection } from "../render/launch";`. There, the view type is declared once in `render/`, and the pure `features/` derivation (`deriveModelRowState`) returns it. `rg 'from "\.\./render/' web/src/features` shows the same pattern in `rename.ts`, `connectionversion.ts`, `tiles.ts` and `surfaces.ts`. Cites § Design "One owner per concept" and "Match the siblings". A fix must leave the past-row view shape declared in one place, with the dependency still running features/ → render/.

### Notes
1. **[note]** `internal/server/launcher.go` filelen 553. The stated reason (525, `sessionLauncher`'s home file, and `createAndSpawn`/`repoContext` are shared) still holds for the 28 lines this wave added: `validateLaunchDirectory` and the claim lock in `Resume`. The number in the reason is out of date.
2. **[note]** `internal/session/machine.go` `applyInput` funlen 52 is already present on main. This branch touches only `applyBind`, at +6 lines.
3. **[note]** The two resume paths take the two locks in opposite orders. `launchResume` takes `claudeLocks(X)` and then `locks(newID)` inside `spawnAndRecordLaunch`. `Resume` takes `locks(id)` and then `claudeLocks(X)`. No deadlock is reachable: a Resume aimed at the row `launchResume` just created returns on `sess.Alive` before it asks for the Claude lock, and ids are never reused. Still, the ordering and why it is safe are written nowhere. No change is requested. If a third caller of `LockClaudeSession` is ever added, this is the thing to write down first.
4. **[note]** `render/launchpast.ts`'s `renderPastList` rebuilds its rows with `replaceChildren` and restores focus through `focuskeep.ts`. `render/CLAUDE.md` says "Focusable controls inside the render tick are reused, never rebuilt". This list is not on the 1-second tick: it renders on fetch, filter and select. The rebuild-and-restore follows `reader.ts`'s tree/outline precedent, which the doc comment cites. It is consistent as it stands.
5. **[note]** For `review-work`, comment truth: `internal/session/session.go:47` still says `ValidPermissionMode` covers "the four permission modes". Also, `manager.go:135` names a plan file in production code (see Minor 1).
6. **[note]** For `review-work`'s DIAG row (carried from cycle 1, not re-checked here): the `pastSessionsFeature` → `claudecode.PastSessions` edge and the `features/launch.ts` → `features/launchresume.ts` sub-controller edge.
7. **[note]** The `"(untitled)"` wording (in parentheses) still differs from `"untitled"` elsewhere, as noted in cycle 1 Note 6. It now has one owner (`pastRowView`), so any change is a one-line edit.
