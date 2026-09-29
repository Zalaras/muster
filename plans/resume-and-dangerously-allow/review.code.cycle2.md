# Correctness review: Resume and Dangerously Allow

**Plan**: resume-and-dangerously-allow
**Verdict**: needs-changes
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
