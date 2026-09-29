# Correctness review: Resume and Dangerously Allow

**Plan**: resume-and-dangerously-allow
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: `kb: pack 44050 words (budget 20000)` — WARN exceeds budget (sections: rules 2052 · features 13192 · diagrams 4305 · decisions 12682 · proposed 1322 · facts 7359 · lessons 3130 · runbooks 2)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes: `claudecode.PermissionBypass` is in `PermissionModes`; the Resume action passes the latched mode through `BuildArgv` | Yes: D1, E1, bypass.spec "existing Resume action…" | pass |
| REQ-2 | Yes: fifth radio, `#bypass-warning`, `launchPrimaryFace` / `refreshDialogFace` | Yes: W1, E1, INV-2 uncheck test | pass |
| REQ-3 | Yes: `permissionModeToCheck("bypassPermissions") → "auto"`; `selectedPermissionMode` reads the live radio | Yes: W2, E4 | pass |
| REQ-4 | Yes: `bypassChip` shared by card, mainhead and tile | Yes: W3, E2, E3, E12, INV-1 | pass |
| REQ-5 | Yes: `firstLaunchNote`, both texts | Yes: W4, E2 | pass |
| REQ-6 | Yes: `launcherpastlist.go` + `claudecode.PastSessions` | Yes: D3–D8, D16 | pass |
| REQ-7 | Yes: `resume.reset()` in `resetForm` | Yes: past-sessions REQ-7 test | pass |
| REQ-8 | Yes: `navigate()` → `resume.onDirectoryChanged`; `requestId` drops late responses | Partly: no test of the stale-response drop (W8, edge case 19). See Major 5 | fail (coverage) |
| REQ-9 | Yes, but a stale mapping over-reports "open in Muster" after a `/clear`. See Major 1 | Yes: E5 | pass (edge case 11 fails, see Major 1) |
| REQ-10 | Yes: `launchResume`, no `--model` / `--name`, mode or `default` | Yes: D9, E6 | pass. A recorded but unrecognised mode is sent as `default`: user-decision 1 |
| REQ-11 | Yes | Yes: W1, E7 | pass |
| REQ-12 | Partly: both 409s exist, but the one-alive-row lookup is wrong. See Major 1 and user-decision 2 | Partly: D11, D12, actions.spec REQ-12 | **fail** |
| REQ-13 | Yes: shared `createAndSpawn` → `onLaunched` | Yes: E6 | pass |
| REQ-14 | Yes | Yes: W5, E10 | pass |
| REQ-15 | Yes: `store.TouchRepo` | Yes: D15, past-sessions REQ-15 | pass |
| INV-1 | Yes | Yes | pass |
| INV-2 | Yes: one recompute runs on every tab and mode change | Partly: nothing asserts the face across tab switches. See Major 6 | fail (coverage) |
| INV-3 | Yes | Yes | pass |
| INV-4 | No: see Major 1 and user-decision 2 | Partly | **fail** |
| DIAG | `kb:diagram/containers`, `kb:diagram/daemon-components`, `kb:diagram/web-components`, `kb:diagram/store-schema`, plan `## Diagrams` sequence | — | fail: `containers`' musterd → Claude Code files label is now incomplete (Major 7). The plan's sequence diagram matches what shipped. `daemon-components` and `web-components` are package-level and still true. `store-schema` is unchanged, since there is no migration |

## Build & Tests

E2E tests: pass (484/484) · Daemon tests (race): pass (24 packages ok, 0 FAIL) · Web tests: pass (1920/1920, 77 files) · Daemon build: pass · Web build: pass · Lint: pass (golangci 0 issues; Biome clean) — all read from $GATES_LOG_DIR

Baseline gate lines: contrast pass (43 pairs × 3 themes) · versions pass · e2e-honest pass · **kb-check FAIL** (the 3 unowned e2e files; the developer accepted this until doc-reconcile) · dead-refs pass · e2e-lint pass · **features FAIL** (3 touches outside **Features**; the developer accepted this. I read the touches and give my view in Notes 1) · comments pass · size WARN (`review-maintainability`'s).

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D0 | `make build` | pass (17-D0.log) |
| D17 | `! rg -n '"custom-title"\|"ai-title"\|"last-prompt"\|\.claude/projects' cmd/ internal/ --glob '!internal/claudecode/**' --glob '!**/*_test.go'` | pass (18-D17.log empty, exit 0) |
| D18 | `make test` | pass (deduped to 02-test.log, `go test -race`) |
| D19 | `make lint` | pass (deduped to 03-lint.log) |
| W0 | `make web-build` | pass (deduped to 04-web-build.log) |
| W10 | `make web-lint` | pass (deduped to 06-web-lint.log) |
| W11 | `make web-test` | pass (deduped to 05-web-test.log) |
| E0 | `make e2e` | pass (deduped to 16-e2e.log, 484 passed) |
| K1 | `make check-kb` | **FAIL**: `web/e2e/bypass.spec.ts`, `web/e2e/past-sessions.spec.ts`, `web/e2e/helpers/resume.ts` owned by no feature. The developer accepted this until doc-reconcile's Step 7 registers them (Doc Delta, past-sessions/launch `e2e` globs), so it is not routed |
| DOC | doc upkeep + Doc Delta vs what shipped | **FAIL**, `[orchestrator]` only: web-impl's `doc-delta:` line 43 is superseded (Major 8), and `containers` is stale (Major 7). The 8 proposed ADRs exist with `refs: plan:resume-and-dangerously-allow`, and there are no `deviation:` lines. The `TODO.md` ticks for #61/#62 are due at Completion. The Doc Delta's past-sessions claims ("the running-session guard", "resume in the original mode") hold only once Major 1 is fixed and user-decision 1 is settled |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W9 | no `any` in new web code | pass | Grepped every added line under `web/src` and `web/e2e` for `: any`, `as any`, `<any>` and `any[]`. The only hits are the English word "any" in comments |
| R1 | chip and danger button use `--danger`, never `--rose` | pass | `.chip-danger` uses `--danger`/`--danger-fg`/`--danger-line`; `renderLaunchButtonFace` toggles the existing `.btn.key-danger` (style.css:2499); the bypass segment uses `--danger`. The one `--rose` mention in the diff is a comment |
| R2 | exactly one filled button in every configuration | pass (code) | `renderLaunchButtonFace` sets `className` to exactly `btn key` or `btn key-danger`. The selected head tab is `--bg-hover` with an inset rule, which is not a fill. What it looks like on screen is `review-browser`'s to measure |
| R3 | real verification on haiku | not yet run | This runs in the main session after the pipeline (kb:adr/process-real-verification-post-run-by-pipeline) and is not checkable here |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: D17 is green. Transcript layout, line types and the projects path live only in `internal/claudecode/launchtranscripts.go`. The server reaches them through `claudecode.PastSessions`, and tests use `claudecodetest.WriteTranscript` |
| 2 | No terminal-output state parsing | pass: none added |
| 3 | Non-blocking hook handler / ≤2 s timeouts | pass: no hook code or registration touched |
| 4 | tmux always `-L muster` / sizing | pass: spawns through the existing `spawnSession` |
| 5 | No payload logging | pass: the new logs carry `directory` and the error only, never title or lastPrompt |
| 6 | Empty-gauge honesty | pass: `renderPastHead` omits the count while unknown; a null model stays null (`CreateSession`'s nil-model fix) |
| 7 | Identity on the tmux target | pass: the claude-id lookups are a guard, not identity |
| 8 | Settings trespass | pass: `ProjectsDir` comes from `os.UserHomeDir()`, never `CLAUDE_CONFIG_DIR`; nothing reads `~/.claude/settings*.json`; the store is read-only |
| 9 | Real `claude` outside canary | pass: E2E uses the stub binary, Go tests use `fakeTmux` |

## Issues

### Critical

None.

### Major

1. **[daemon-impl]** `AliveByClaudeSessionID` asks the wrong question. It trusts `byClaude[id]` (`internal/session/manager.go:455`). That map is not an index of "who is alive on this conversation now". Two paths break it:
   - **After `/clear`.** `Apply` never deletes a session's previous claude id on a rebind (`internal/session/apply.go:67`, "byClaude never deletes an old claude id on rebind"). So once an alive Muster session B `/clear`s from X to Y, `byClaude[X]` still names B:
     - `GET /api/past-sessions` lists X disabled, "open in Muster".
     - `POST {resumeSessionId: X}` gets `409 already_open`.
     - The Resume action on a dead row holding X gets `409 not_resumable`.

     This contradicts plan edge case 11 ("the old id becomes listable and resumable") and the running-session guard the past-sessions Doc Delta promotes. It affects every Muster session that ever ran `/clear`, not only resumed ones. It also goes away after a daemon restart, because `LoadAll` indexes only each row's current id. The same state then answers differently before and after a restart.
   - **After a restart.** `LoadAll` (`manager.go:224-230`) fills `byClaude` in `ListSessions` order, and that query has no `ORDER BY`. Take a dead row and an alive row that both carry X, with the dead one loaded last, for example dead B (newer id) and alive A revived by the Resume action. The lookup then lands on the dead row and reports "not open". A resume from the list then succeeds, and two alive sessions run on one conversation (INV-4).

   Fix: answer from `m.sessions` (`Alive && ClaudeSessionID == id`), not from the routing index. This also makes the three call sites (`launcherpast.go:70`, `launcherpastlist.go:94`, `launcher.go:438`) correct without touching them.
2. **[daemon-tests]** Major 1 has no test. None of the five `TestAliveByClaudeSessionID_*` tests (`internal/session/manager_test.go:3260-3350`) cross a clear-rebind or a `LoadAll`. Two tests would pin the fix:
   - A session binds X, clear-rebinds to Y, and `AliveByClaudeSessionID(X)` is false.
   - A dead row and an alive row both carry X, `LoadAll` runs in each order, and the lookup returns the alive row.
3. **[web-impl]** Three comments still state the pre-amendment contract, and each is false now. The contract was amended to kb:adr/launch-resume-display-name-falls-back-to-id: `displayName` is the model id and "stays a non-null string on the wire".
   - `web/src/protocol/session.ts:36-39`: "a resumed-from-list session's `model.displayName` is `null` until the status line confirms it"
   - `web/src/sessions/card.ts:135-138`: the same claim
   - `web/src/render/masthead.ts:148-151`: "widened for a resumed-from-list session's unconfirmed model"

   The `string | null` widening of `SessionModelInfo` has no remaining reason, and the ADR says so ("the web's tolerance of null is unused by this path"). The cleanest fix reverts the widening and the `renderUsageModel` fallback. That leaves `render/masthead.ts` untouched and clears one of the three features-scope lines. At a minimum, the three comments must stop saying the wire sends null.
4. **[web-tests]** Three tests pin the superseded wire shape, and their comments state it as the contract:
   - `web/src/api/launch.test.ts:759-766`: "Protocol Contract: a resume-from-list response's model.displayName is null…", with a mocked 201 carrying `displayName: null`
   - `web/src/protocol/session.test.ts:138-144`
   - `web/src/protocol/usage.test.ts:39-44`

   The daemon never sends that fixture shape (see the plan's amended Response 201). Repoint the resume-from-list 201 fixture to `displayName: <the id>`. Drop or reword the null-tolerance cases to follow whatever Major 3 lands.
5. **[web-tests]** Acceptance criterion **W8** ("a past-sessions response for a directory no longer listed is dropped", edge case 19) has no test. `web-tests.md` declines `features/launchresume.ts`, but W8 is the plan's own Web criterion, and no E2E row covers it either: the refetch test at `past-sessions.spec.ts:413` never holds the first response back. If a unit test is impractical without jsdom, the route-hold pattern `past-sessions.spec.ts:380` already uses would cover it: hold dir A's fetch, navigate to B, release A, then assert only B's rows show. In that case the orchestrator may route it to `[e2e-specs]` instead.
6. **[e2e-specs]** INV-2 says it is "asserted … across tab switches in both directions", and no test does that. W1 covers the pure `launchPrimaryFace`, and E1/E7 cover each tab alone. Nothing checks that `refreshDialogFace` re-runs on a tab switch. The needed round trip: New with `bypass` checked → `Resume` tab with a non-bypass row selected (face `Resume`, not `key-danger`, `#bypass-warning` hidden) → `New` again (`Launch without checks`, `key-danger`, warning shown).
7. **[orchestrator]** `kb:diagram/containers` (`docs/diagrams/containers.md`) is stale. `Rel(musterd, claudefiles, "Finds plan via transcript; reads plan, theme", "filesystem")` now omits a new read: musterd lists and looks up past sessions from the transcript store (`-claude-projects-dir`). Add "lists past sessions" to that label.
8. **[orchestrator]** web-impl's `doc-delta:` line 43 (`web-implementation.md`) says the contract states "model.displayName may be null on a resumed-from-list session". The amendment superseded that, and the plan's Doc Delta rightly does not carry it. The line needs to be marked superseded, so doc-reconcile does not promote a nullable `displayName` into `ws.session` / `ws.usage`.

### Minor

1. **[web-impl]** `.bypass-warn b { color: var(--danger-fg); }` (`web/src/style.css:3130`) uses the text-on-danger-fill token on `--banner-bg`. In the light theme that is `#ffffff` on `#fbe8e8`, about 1.2:1, so the bold "Bypass permissions" is effectively invisible. `make contrast` stays green only because `web/scripts/contrast-pairs.json` has no `--danger-fg`/`--banner-bg` pair. The mockup's `mockup.css:69` carries the same rule, so it was copied faithfully from a rule that was only ever tried on a dark background. Fix: inherit `--banner-fg`, or use a token paired with `--banner-bg`, and add the pair to `contrast-pairs.json`. `review-browser` may measure the same defect from the rendered page; file it once.

### Decisions for the orchestrator

1. **[orchestrator:user-decision]** What should a resume send when the transcript records a mode Muster does not offer? `launcherpast.go:96` sends `default` for a recorded but unrecognised mode such as `dontAsk` or a future mode. The contract (REQ-10, `sessions.create`) and kb:adr/launch-resume-in-original-mode-else-default say "the transcript's last mode, or `default` when it records none". Meanwhile `GET /api/past-sessions` lists such a row's `permissionMode` verbatim. This touches the protocol contract, so it is not debated.
   - **Option A**: pass any recorded mode verbatim, as the contract reads. `dontAsk` then reaches the argv, although kb:adr/launch-bypass-and-dontask-unoffered keeps it off the launch form.
   - **Option B**: keep the `default` fallback for unrecognised modes. Amend the contract and the ADR to say "or `default` when it records none or one Muster does not offer". This fails safe: it never escalates.
2. **[orchestrator:user-decision]** INV-4 has a window while a resumed row is unbound. A resumed-from-list row has `claudeSessionId` null until its `SessionStart{source:"resume"}`, and that can be indefinite for a bypass session sitting at Claude Code's warning, which emits no hooks. Until then, nothing counts that row as holding X, so two paths put a second process on X:
   - A second resume from the list of X.
   - The Resume action on a dead row bound to X, since `byClaude[X]` names the dead row itself.

   The plan's diagram and REQ-12 word the guard as "bound", while INV-4 says "no Muster path". The fix touches the meaning of `openSessionId` / `already_open`, which is contract text.
   - **Option A**: count an alive, unbound row spawned with `--resume X` as holding X until it binds or dies. The daemon remembers the pending id in memory. The list shows the row disabled, and both 409s cover it. `openSessionId` would then mean "alive session bound to or resuming this id".
   - **Option B**: accept the window and narrow INV-4 to "bound". The developer then relies on the card's "likely waiting on Claude Code's bypass warning" note to avoid resuming the same session twice.

### Notes

1. **[note]** The three features-scope touches the developer declined to widen for are minor, and none threatens `usage` or `ingest`:
   - `render/masthead.ts` is a defensive `displayName ?? model.id` branch. Under the amended contract it is dead code, and Major 3's revert would remove it.
   - `e2e/helpers/payloads.ts` widens the `permissionMode` union by one value. That is type-only, and no existing call site changes.
   - `claudecodetest/transcripts.go` is a new test-only fixture writer, which the D17 carve-out requires.
2. **[note]** kb:fact/transcript-session-lines' summary says the title, last-prompt, permission-mode and model lines are "all in its last 35 KB". Its body measured only title-line offsets, and it says `permission-mode` is written "as it changes". A long session whose mode never changed could therefore have its only mode line beyond the 64 KB tail, and it would resume as `default`. That direction is safe, since it never escalates. The out-of-scope canary backlog line already covers guarding these facts.
3. **[note]** `claudecodetest.CwdLine` writes a line with only `cwd` and no `type`, a shape Claude Code never writes. It masks nothing, because `transcriptScan.apply` reads `cwd` from any line. The E2E writer (`ScratchDaemon.writeTranscript`) uses the measured shapes, with `cwd` on `user`/`assistant` lines.
4. **[note]** For `review-browser`: the Resume tab fetches with an empty `directory` when it is opened before the picker's first browse resolves (a deliberate choice, `web-implementation.md` Decisions). On a healthy daemon this is a `400`, so `Couldn't read sessions — try again` can flash until the browse lands.
5. **[note]** In a past-session row the chip sits inside `.t` rather than beside it. That matches the mockup, and the row's `textContent` order is unchanged.
6. **[note]** The E2E Repairs table checks out. All four repairs keep their requirement asserted. Repair 2 (`toHaveCount(0)` → `toBeHidden()`) is correct, because `.chip-danger` is a permanent slot toggled through `hidden` with a `[hidden]` companion. Repair 3 follows the amended contract. No assertion was weakened.
