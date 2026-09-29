# Review: resume-and-dangerously-allow

**Plan**: resume-and-dangerously-allow
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 2 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser needs-changes, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Resume and Dangerously Allow

**Plan**: resume-and-dangerously-allow
**Part verdict**: needs-changes
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

## Browser review

# Browser review: Resume and Dangerously Allow

**Plan**: resume-and-dangerously-allow
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 26542 words (budget 20000) — WARN exceeds budget (rules 1455 · features 4297 · decisions 12682 · facts 7359 · lessons 741 · runbooks 2)
**Rig**: `make web-build build` at 04a9134 (under `bin/gatelock run --exclusive`); per-test scratch daemons from `helpers/fixtures.ts` (data dir `$TMPDIR/muster e2e-XXXX`, space-bearing; `-S` tmux socket inside it; `-claude-projects-dir` scratch inside it; stub `claude` at `$TMPDIR/muster e2e-stub-cd75a542396fd84f/claude`). Driven in headless Chromium, 1280×800 (plus 1280×640 for reachability), by three throwaway specs `web/e2e/zz-browser-probe*.spec.ts`, deleted afterwards. Fixture teardown killed every daemon and tmux server. `git status --porcelain` shows only the other reviewers' part files.

Gates log (`gates-…-c1`): `e2e` 484 passed and `web-build` green, so the app I drove is the one that will ship. `check-kb` and `features-scope` are red; both are known and accepted.

## Matrix

Hosts: **focus** (rail card + mainhead), **tiles** (tile `.thead`, strip card), **dialog** (the launch modal, opened over either view). A pop-out host does not exist for anything in this plan (`/doc.html` is the reader's).

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-2 | dialog | data | `#bypass-warning` hidden until bypass | pass | unchecked: `hidden`, computed `display:none`, box 0×0 |
| REQ-2 | dialog | data | bypass can be picked by keyboard | pass | focus `auto` radio, then ArrowRight: `bypass` checked |
| REQ-2 | dialog | data | warning shows and text is exact | pass | `display:block`, box 297,569–983,611 inside dialog 280,98–1000,702; textContent is exactly the specified string |
| REQ-2 | dialog | data | primary face `Launch without checks`, danger | pass (label wraps, Minor 3) | class `btn key-danger`, bg rgb(194,70,70) = resolved `--danger`; box 117×49, two lines |
| REQ-2 | dialog | data | ArrowLeft back restores `Launch`, amber | pass | `btn key`, bg rgb(242,163,60) = `--amber`; warning `display:none` |
| REQ-2/R1 | dialog | data | bypass segment uses `--danger`, never `--rose` | pass | checked label bg rgb(194,70,70); `--rose` is rgb(231,127,127) |
| R2 | dialog | New+bypass / Resume+bypass row | exactly one filled button | pass | the only filled `.btn` is `#launch-button`; the other painted backgrounds are the selected tab and the selected row (`--bg-hover`) |
| REQ-3 | dialog | data | open never restores bypass | pass | directory whose last launch was bypass: on open, `auto` is checked, face `Launch`, warning `display:none` |
| REQ-3 | dialog | data | Recent click never restores bypass | pass | Recent click on that directory: `auto`. Control: Recent click on a plan directory restores `plan` |
| REQ-4 | focus rail card | started / working / dead | chip iff bypass | pass | chip `display:inline`, box 75,155–128,168 inside `.r1` 14,94–288,169, with a 110-character title |
| REQ-4 | focus mainhead | started / dead | chip iff bypass | pass | chip 734,77–787,90 inside `#mainhead` 300,46–1280,122, sitting between `.name` (…722) and `.meta` (799…) |
| REQ-4 | tiles tile `.thead` | started / dead | chip iff bypass | pass | chip 377,95–430,108 inside `.thead` 2,86–639,117; `.nm` ellipsises (sw 748 > cw 339), chip not clipped |
| REQ-4 | tiles strip card | started | chip iff bypass | pass | fifth bypass session in the strip: chip 68,666–121,679 inside card 0,652–1280,800 |
| REQ-4 | focus + tiles | latch → default → bypass | chip follows the latch | pass | after `permission_mode:"default"`: `display:none` in card, mainhead and tile (settled after 1.2 s); back to bypass: shown again |
| REQ-4 | all | non-bypass session | no chip | pass | plan session: chip `hidden`, `display:none` |
| REQ-5 | focus rail card | started, first launch | combined note | pass | card text `first launch here — likely waiting on Claude Code's trust prompt, then its bypass warning` |
| REQ-5 | focus rail card | started, repeat directory | bypass note | pass | `likely waiting on Claude Code's bypass warning` |
| REQ-5 | tiles | started | note | N/A: tiles carry no card note | the strip card (the card template) shows it: `likely waiting on C…` |
| REQ-7 | dialog | — | tab pair, always opens on New | pass | aria snapshot shows `tablist "Session kind"`, `tab "New" [selected]`; focus on open is `#title-input` |
| REQ-7 | dialog | — | tabs operable by keyboard | pass (Minor 4) | Shift+Tab to `#launch-tab-resume`, Enter: `aria-selected=true`. ArrowLeft does not move between tabs |
| REQ-8 | dialog | Resume | picker, list, form hidden | pass | `.picker` height 300 → 220; `.fields` `hidden` and `display:none`; `#past-sessions` `display:grid`, 281,380–999,640 inside dialog 280,111–1000,690 |
| REQ-8 | dialog | Resume | back to New restores the form | pass | `#past-sessions` `display:none`, `.fields` `display:grid`, picker 300, face `Launch` |
| REQ-8 | dialog | Resume | refetch on directory change | pass | root → `· 0` empty; empty directory → `No Claude Code sessions in this directory`; the head follows each directory |
| REQ-8 / edge 19 | dialog | late response | stale response dropped | pass | the other directory's response delayed 3 s while I navigated back: the list settled on the current directory (`· 1`, its own row) |
| REQ-6/8 | dialog | data | newest first, agrees with the API | pass | the first 4 rows match `GET /api/past-sessions`'s order (`sess-planmodel`, `sess-bypass-long`, `sess-untitled`, `sess-029`) |
| REQ-8 | dialog | data, 33 rows | list reachable | pass | `#past-list` `overflow:auto`, sh 1353 > ch 231; wheel moves scrollTop 0 → 400; the last row can be clicked and scrollTop stays 1122 |
| REQ-8 | dialog | data, 1280×640 | dialog and footer inside the viewport | pass | dialog 31–610, footer 560–609 |
| REQ-8 | dialog | Resume, no selection | footer names the target | **FAIL** | `Resume (untitled) in <path>` shown with no row selected (Major 1) |
| REQ-9 | dialog | open row (bound by `source:"startup"`) | disabled, `open in Muster` | pass | `disabled`, text `Bound one now open in Muster`, color `--disabled-fg`; button disabled |
| REQ-9 | dialog | open row (resumed from list, bound by `source:"resume"`) | disabled, `open in Muster` | **FAIL** | `openSessionId` null, row enabled (Critical 1) |
| REQ-11 | dialog | bypass row selected | `Resume without checks`, danger | pass (label wraps, Minor 3) | `btn key-danger`, bg `--danger`; box 72×49, two lines |
| REQ-11 | dialog | other rows | `Resume`, amber | pass | `btn key`, `--amber` |
| REQ-11 | dialog | long-title bypass row | row chip visible | **FAIL** | chip box 1130–1182 is outside row 281–999, clipped by `.t`'s `overflow:hidden` (Major 2) |
| REQ-12 / INV-4 | dialog + API | resumed row bound via `resume` | second resume refused `409 already_open` | **FAIL** | second POST → 201; two alive rows (Critical 1) |
| REQ-12 / INV-4 | dialog | two resumes before either binds | refused | **FAIL** | row enabled on the 2nd open; both bind; `/api/state` shows `[1,alive,"sess-dup"]`, `[2,alive,"sess-dup"]` (Critical 2) |
| REQ-12 | focus mainhead | dead row, id held by an alive resumed row | Resume refused `not_resumable` | **FAIL** | Resume enabled; click → both alive with `sess-x`, no `#action-error` (Critical 1) |
| REQ-10 | focus | resume a plan row | argv | pass | pane start command `… --resume sess-plan --permission-mode plan`, no `--model`/`--name` |
| REQ-10 | focus | resume a row with no mode | argv `default` | pass | `… --resume sess-nomodel --permission-mode default`; seed `{default, seed}` |
| REQ-10 (decision) | focus mainhead | resumed, model recorded | displayName = id | pass | API `{id:"claude-opus-4-1-20250805", displayName: same}`; mainhead meta `… · claude-opus-4-1-20250805` |
| States: model unknown | focus mainhead / card / tile | resumed, no model | reads `unknown` | **FAIL** | API `model:null`; mainhead meta `probe-open-yxDQ32`, no model word; card and tile show nothing (Minor 1) |
| REQ-13 | focus | resume | opens like a launch | pass | new card `aria-current=true`; activeElement `xterm-helper-textarea` |
| REQ-13 | tiles | resume | promoted into the grid | pass | bypass row resumed from Tiles: live tile 1,443–640,799 with the chip; activeElement inside that tile |
| REQ-14 | dialog | data | filter narrows, keeps focus | pass | typed by keys: 33 → 11 rows; `document.activeElement` still `past-filter` after 1.2 s; `PROMPT TEXT FOR 29` matches last prompt regardless of case |
| REQ-14 | dialog | filter excludes all | `No sessions match`, disabled | pass (footer wrong, Major 1) | list text and disabled button correct |
| States: loading | dialog | no data yet | `Loading sessions…`, disabled | pass | response delayed 1.5 s: list text, button `disabled`, head has no count |
| States: all disabled | dialog | only an open row | no selection, disabled | pass (footer wrong, Major 1) | button disabled |
| States: truncated | dialog | 205 transcripts | `Showing the newest 200` reachable | pass | 200 rows; `.trunc` scrolled into view at y 594 inside list 408–639 |
| Edge 7 | dialog | transcript deleted | 404 message, refetch | pass (Minor 2) | `#launch-error` `display:block` with the message; the row is gone after the refetch |
| Keyboard select | dialog | data | focus kept on the chosen row | **FAIL** | Space on row 4: `aria-pressed=true`, but activeElement is `BODY` after 1.2 s; the next Tab lands on row 1 (Major 3) |
| States: daemon-down | dialog | Resume, refetch | error line, disabled | pass | `Couldn't read sessions — try again`, button disabled, head count dropped |
| States: daemon-down | all | — | daemon-down surfaced prominently | pass | `#banner` `musterd unreachable — …` at top 46 (visible behind the modal backdrop), `connection-status` reads `reconnecting…` |
| States: daemon-down | dialog | Resume, no refetch | stale list | note | rows stay and Resume stays enabled until the tab is re-entered (Note 3) |
| §7 | focus / tiles | — | one live client, scrollback 0 | N/A: this plan changes no terminal surface | — |

## Issues

### Critical

1. **[daemon-impl]** A session resumed from the list never counts as "open in Muster" once Claude Code binds it through `SessionStart{source:"resume"}`, the event a real `claude --resume` sends (kb:fact/resume-restores-model-and-mode-except-plan). As a result REQ-9, REQ-12 and INV-4 fail for exactly the sessions this plan creates:
   - I resumed `sess-one`, bound it with an enveloped `source:"resume"` SessionStart, and got `/api/state` `[1, alive, "sess-one", idle]`. `GET /api/past-sessions` then still returned `openSessionId: null`, the row stayed enabled, and a second `POST {resumeSessionId:"sess-one"}` returned **201** (session 2) instead of `409 already_open`.
   - Dead session A bound `sess-x`. B was resumed from the list and bound `sess-x` via `resume`. A's mainhead Resume stayed enabled, and clicking it made both alive with `sess-x` (`[[2,true],[1,true]]`). No `not_resumable` came back.
   - Cause, read to explain the measurement: `Manager.Apply` (`internal/session/apply.go`) writes `byClaude[id]` for `KindBind`/`KindClearRebind` but not for `KindResumeBind`. `AliveByClaudeSessionID` reads only `byClaude`.
   - A fix must make true: after any bind kind, including resume, `AliveByClaudeSessionID(id)` returns that alive row, so the list disables the row and both 409s fire.
   - **[e2e-specs]** E5 and the INV-4 tests bind the bystander with `source:"startup"`, so they could not have failed for this. One resumed-from-list row bound via `sessionStartResume` must be asserted disabled and refused.
2. **[daemon-impl]** Two resumes of one past session before either binds leave two alive rows bound to one Claude session id (INV-4). I resumed `Dup fixture` from the dialog, reopened the dialog, and the row was still enabled (`Dup fixture now d`). I resumed it again and bound both. `/api/state` shows `[1,true,"sess-dup",idle]`, `[2,true,"sess-dup",idle]`. The window is not a race: Claude Code's trust prompt and bypass warning suppress every hook until answered (kb:fact/bypass-acceptance-blocks-startup), so a pending resume can sit unbound for as long as the user leaves it. A fix must make true: an alive row created with `resumeSessionId X` holds X for `openSessionId`, `already_open` and `not_resumable` from the moment it is created, not from its bind.

### Major

1. **[web-impl]** The Resume footer claims a target when nothing is selected. It shows `Resume (untitled) in <path>` in the no-match, all-rows-disabled and post-filter-deselect states (measured in all three; the screenshot shows it beside a disabled `Resume` button). `renderResumeFooter` (`web/src/render/launch.ts`) collapses "no selection" and "selected row has a null title" into the same `title ?? "(untitled)"`. A fix must make true: with no selection, the footer shows the dash (or no title), and `(untitled)` appears only for a selected untitled row.
2. **[web-impl]** A long-titled bypass row's chip is invisible. The chip is appended inside `.t`, which has `overflow:hidden; text-overflow:ellipsis`. With a 110-character title, the chip's box was 1130–1182 against a row of 281–999 (`.t` sw 889 > cw 670), so it is fully clipped. The danger marker on a listed session disappears exactly when the title is long. `web/src/render/launchpast.ts` `buildPastRow`. A fix must make true: the chip is a sibling of the ellipsised title text and stays inside the row box for any title length.
3. **[web-impl]** Selecting a past-session row by keyboard throws focus to `<body>`. Focusing row 4 and pressing Space selects it (`aria-pressed=true`). But `renderPastList` rebuilds every row (`replaceChildren`), so `document.activeElement` is `BODY` 1.2 s later, and the next Tab restarts at row 1 (kb:lesson/select-rebuilt-every-tick-passed-selectoption). A fix must make true: after a keyboard selection, `document.activeElement` is the chosen row, either by updating `aria-pressed` in place or by restoring focus to the rebuilt row.

### Minor

1. **[orchestrator:decision]** A resumed session with no recorded model shows no model word anywhere. The plan's States row says it reads `unknown`, never blank. With API `model: null`, the mainhead meta shows only the directory (`mainheadMeta` now skips the clause when there is no `displayName`), and the card and tile carry no model field. Option A: the mainhead meta renders `model unknown` for a null model, and a spec asserts it. Option B: amend the States row to "the clause is omitted, as for any null model today".
2. **[web-impl]** `#launch-error` outlives its cause. The `404 unknown_claude_session` message stayed visible after switching to the New tab (`display:block`, box 281,603–999,625). It was still showing during daemon-down beside an unrelated error line. A fix must make true: a tab switch or a new selection clears `#launch-error`.
3. **[web-impl]** The danger faces wrap to two lines on a realistic path. `Launch without checks` measured 117×49 and `Resume without checks` 72×49 with the scratch path in the footer; with `/Users/dev/code/muster` the same button is 166×25, one line. The footer `#launch-target` flex-shrinks the button (`white-space: normal`). A fix must make true: `#launch-button` never shrinks below its one-line label (`flex-shrink:0` / `white-space:nowrap`), and the target ellipsises instead.
4. **[web-impl]** The `role="tab"` pair does not behave as tabs. ArrowLeft/ArrowRight do not move between them (focus stayed on `#launch-tab-resume`, New not selected), and there is no `tabpanel`/`aria-controls`. Because the tablist sits inside the dialog's labelling `<h2>`, the dialog's accessible name became `New session Session kind` (aria snapshot). A fix must make true: arrow keys switch tabs, and the dialog's name is `New session`, for example by moving the tablist out of `#launch-dialog-title` or labelling the dialog by a span around the title text.

### Notes

1. **[note]** A resumed-from-list session into a directory with no repo row reads `first launch here — likely waiting on Claude Code's trust prompt`. The directory has transcripts, so Claude Code has run there before. This follows the contract (`firstLaunchHere` iff no repo row) and is recorded only as an observation.
2. **[note]** Past-row ages (`1m`, `7d`) are computed once per render and do not tick while the dialog stays open. No change requested.
3. **[note]** When the daemon dies while the Resume list is showing, the stale rows and an enabled `Resume` stay until the tab is re-entered. The global `musterd unreachable` banner is up, so the honesty rule holds. A POST would fail through `#launch-error`.
4. **[note]** In the truncated state the head reads `· 200`, which is the number listed, not the number that exist. The `Showing the newest 200` line explains it.
5. **[note]** Not measured: light theme (the contrast gate covers the chip/danger pairs, 43/43 in both themes), and the real bypass warning (R3 is the orchestrator's real verification).

## Maintainability review

# Maintainability review: Resume and Dangerously Allow

**Plan**: resume-and-dangerously-allow
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 31118 words (budget 20000) — rules 1938 · features 4297 · diagrams 4305 · decisions 12682 · proposed 0 · facts 7359 · lessons 529 · runbooks 2 (WARN over budget)
**Scope**: 29 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/main.go | — (composition root) | size: line | filelen 513, funlen parseFlags/run; reason holds | pass |
| internal/claudecode/launch.go | launchtranscripts.go | n/a (edit) | — | pass |
| internal/claudecode/launchtranscripts.go | status.go, ingest.go, launch.go | yes (`transcriptScan`) | — | pass |
| internal/claudecode/claudecodetest/transcripts.go | claudecodetest.go | no (reason in file comment) | — | note |
| internal/server/launcher.go | launcherrors.go, launchermodels.go, sessions.go | yes (`repoContext`/`createAndSpawn`) | filelen 525; reason holds | pass |
| internal/server/launcherpast.go | launcher.go | **no** | — | Major 1, Major 3, Minor 1 |
| internal/server/launcherpastlist.go | repos.go, browse.go, locate.go | yes, contradicted by code | — | Major 2, Minor 2 |
| internal/server/launcherrors.go | respond.go | yes | — | pass |
| internal/server/respond.go | launcherrors.go | yes | — | pass |
| internal/server/server.go | — (composition root) | n/a (one-line registration) | funlen New 43 (+1 registration line) | pass |
| internal/server/sessions.go | respond.go | n/a | — | pass |
| internal/session/manager.go | apply.go, writeorder.go | no (Handoff bullet only) | — | Major 3, Minor 1 |
| internal/session/session.go | manager.go | n/a | — | note |
| internal/store/repo.go | repo.go's UpsertRepo | **no** | — | Minor 1 |
| web/src/api/launch.ts | http.ts, sessions.ts | **no** | — | Minor 3 |
| web/src/features/launch.ts | launchmodels.ts, launchrestore.ts, issue.ts | size reason only | filelen 719; reason holds | Minor 5 |
| web/src/features/launchpastlist.ts | launchcrumbs.ts, launchmodels.ts | **no** (header comment only) | — | Minor 3 |
| web/src/features/launchresume.ts | launchmodels.ts, surfaces.ts, issue.ts | **no** (header comment only) | — | Minor 3 |
| web/src/render/launchpast.ts | render/launch.ts, render/CLAUDE.md | **no** (header comment only) | — | Minor 3, Minor 4 |
| web/src/render/launch.ts | render/launchpast.ts | n/a | — | Minor 4 |
| web/src/render/mainhead.ts, tiles.ts, sessions.ts | each other | Decisions bullet | — | pass |
| web/src/render/masthead.ts | — | Decisions bullet | — | pass |
| web/src/sessions/card.ts | permission.ts | Decisions bullet | — | pass |
| web/src/sessions/permission.ts | card.ts | **no** (`launchPrimaryFace`/`LaunchTab`) | — | Minor 3, Minor 5 |
| web/src/protocol/session.ts | usage.ts | Decisions bullet | — | pass |
| web/src/style.css | own `.recents` block | n/a | — | pass |

## Issues

### Critical

### Major
1. **[daemon-impl]** Directory validation now has three hand-copied implementations — `internal/server/launcherpast.go:20-25` (`validateResumeRequest`), `internal/server/launcher.go:155-160` (`validateLaunchRequest`) and `internal/server/launcherpastlist.go:67-73` (the handler). `validateResumeRequest`'s own doc comment says "directory rules first (shared with the ordinary form)", but nothing is shared — the lines are copied verbatim. Cites § Design "Reuse before add" and "One owner per concept". `rg` output:
   ```
   internal/server/launcherpast.go:20:	if req.Directory == "" || !filepath.IsAbs(req.Directory) {
   internal/server/launcherpast.go:21:		return invalidRequest("directory must be an absolute path")
   internal/server/launcherpast.go:24:		return invalidRequest("directory does not exist or is not a directory")
   internal/server/launcherpastlist.go:67:	if dir == "" || !filepath.IsAbs(dir) {
   internal/server/launcherpastlist.go:68:		writeJSONError(w, http.StatusBadRequest, "invalid_request", "directory must be an absolute path")
   internal/server/launcherpastlist.go:72:		writeJSONError(w, http.StatusNotFound, "not_found", "directory does not exist or is not a directory")
   internal/server/launcher.go:155:	if req.Directory == "" || !filepath.IsAbs(req.Directory) {
   internal/server/launcher.go:156:		return invalidRequest("directory must be an absolute path")
   internal/server/launcher.go:159:		return invalidRequest("directory does not exist or is not a directory")
   ```
   A fix must leave the launch form's directory rule with one owner, used by both POST forms. The GET's check may still map the not-found case to its own 404 code, but it must use the same predicate, so a change to what counts as a valid directory lands in one place.

2. **[daemon-impl]** `handleListPastSessions` (`internal/server/launcherpastlist.go:65-108`) does much more than decode, delegate and encode. It validates the directory, sorts newest-first, caps at 200 and sets `truncated`, looks up `openSessionId` for each row, and applies the wire prompt truncation, all inside the handler. Cites § Go "Business logic never lives in HTTP handlers; handlers decode, delegate, encode". Its nearest sibling `internal/server/browse.go:60-81` shows the house shape: `handleBrowse` calls `browseDirectory(ctx, root, path)`, a domain function whose doc cites that exact convention bullet, and only maps its sentinel errors to status codes. The `design:` line for `pastSessionsFeature` says the handler "decodes the query param, delegates to a store/adapter call, and encodes", which the code contradicts. A fix must make the handler decode, delegate and encode only, with the list derivation (order, cap, open-row marking, prompt cut) callable and testable without an `http.Request`, as `browseDirectory` is.

3. **[daemon-impl]** The one-alive-row guard is a check-then-act with an unguarded window. `launchResume` (`internal/server/launcherpast.go:62-64`) and the Resume action (`internal/server/launcher.go`, the new `AliveByClaudeSessionID` check in `Resume`) both ask `Manager.AliveByClaudeSessionID`. That lookup reads `byClaude`, which only gets filled when a hook binds (`internal/session/apply.go:62-85`). `CreateParams` carries no Claude session id (`internal/session/manager.go`), so a newly spawned resume-from-list row is invisible to the guard until its first enveloped hook arrives. `launchResume` also takes no lock, and `Resume`'s `LockSession(id)` is keyed by Muster id, so the two paths never exclude each other. Concrete interleaving:
   1. Dead row 3 is bound to Claude id X.
   2. `POST /api/sessions {directory, resumeSessionId: X}` passes the guard (row 3 is not alive) and spawns row 7, alive and still unbound.
   3. Before row 7's SessionStart arrives, the user clicks Resume on row 3. `Resume` passes `sess.Alive == false`, then `AliveByClaudeSessionID(X)` returns row 3 (not alive), so the result is false and it spawns row 3.
   4. Two alive rows now resume X.

   The same holds for two resume-from-list POSTs for X. The window is human-scale, not microseconds. Resuming a transcript whose last mode was bypass leaves Claude Code blocked on its bypass warning before any hook fires (kb:fact/bypass-acceptance-blocks-startup), and `bindClaudeSession` in `Apply` has no refusal for an id another alive row owns. `make test-race` cannot see this: no memory is shared unguarded, the gap is in the application logic. Cites § Design "Shared state names its writers and its guard" and kb:adr/launch-resume-one-alive-row-per-claude-session ("no path may leave two alive sessions bound to one Claude session id"). A fix must make "Claude id X has an alive or spawning owner" true from the moment a resume path commits to spawning for X. Both resume paths must check and claim under one guard. The fix need not close the unbounded case of the user typing `claude --resume X` outside Muster.

### Minor
1. **[daemon-impl]** New types, seams and modules with no `design:` line in `daemon-implementation.md` § Decisions. Cites § Design ("a `design:` line per new type, module or seam"). They are:
   - `launcherpast.go` as a file, plus `validateResumeRequest`, `findPastSession` and `launchResume`.
   - `store.TouchRepo`/`TouchRepoParams` (`internal/store/repo.go:74-109`). This is a second near-copy of `UpsertRepo`'s statement (`repo.go:52-68`) that differs only in the two `last_*` columns. It needs its reason for being a sibling function rather than a parameter of `UpsertRepo` stated.
   - `Manager.AliveByClaudeSessionID` (`internal/session/manager.go:450`). It is a filtered variant of `Resolve` just above it and is described only in a Handoff bullet.
   - `claudecodetest/transcripts.go`. Its regex copy of `nonTranscriptDirChar` is justified in the file: `internal/claudecode`'s in-package tests import `claudecodetest`, so it cannot import back. That reason belongs in Decisions too.

   A fix must add a line per item stating the shape, why, and what it reused or matched.

2. **[daemon-impl]** `pastSessionsFeature` lives in `internal/server/launcherpastlist.go`. Every other `mount`-bearing feature in the package sits in `internal/server/<name>.go` (`repos.go`/`reposFeature`, `browse.go`/`browseFeature`, `locate.go`, `usage.go`), and § Composition roots bullet 2 names that shape ("a new handler type with a `mount` (`internal/server/<name>.go` …)"). The `launcher*` prefix is `sessionLauncher`'s own family (`launcher.go`, `launchermodels.go`, `launcherrors.go`), and this feature is not part of `sessionLauncher`. A fix must either match the siblings' file naming or state in Decisions why this feature belongs to the launcher family.

3. **[web-impl]** `web-implementation.md` § Decisions has no `design:` line at all. The new modules and seams it does not cover:
   - `features/launchresume.ts`: the `initLaunchResume` sub-controller with its `LaunchResumeElements`/`LaunchResumeHandlers`/`LaunchResumeHandle` seam and the `onFaceChange` callback.
   - `features/launchpastlist.ts`.
   - `render/launchpast.ts`.
   - `sessions/permission.ts`'s `LaunchTab`/`LaunchPrimaryFace`/`launchPrimaryFace`.
   - `render/launch.ts`'s `renderResumeFooter`/`renderLaunchButtonFace`.
   - `api/launch.ts`'s `resumeFromList`/`fetchPastSessions`.

   Several carry the reasoning in a file-header comment (for example `launchresume.ts:1-11`), but § Design puts it in Decisions, where the reviewer meets it. A sub-controller handed elements by a parent controller is also a seam no sibling in `features/` has. `launchmodels.ts`/`launchrestore.ts` are pure, so the seam's reason matters. A fix must add the `design:` lines.

4. **[web-impl]** `render/launchpast.ts:52-53` and `render/launch.ts:272` make view decisions in `render/`. They are the `"(untitled)"` title fallback (written twice, once per file) and the row's bypass-chip condition `session.permissionMode === "bypassPermissions"`. Cites § Composition roots bullet 4 ("`render/` holds the DOM half only, taking the already-computed value as a parameter") and `web/src/render/CLAUDE.md` ("a builder here takes the computed value, never the raw data"). The sibling `sessions/card.ts` owns the equivalent session-card decisions (`bypassChip`, `title: session.title ?? "untitled"`) and `render/sessions.ts` only reads `vm.bypassChip`. A fix must move the row's title text and chip flag into a pure derivation in `features/`, beside `launchpastlist.ts`, so the two footer and row fallbacks have one owner.

5. **[web-impl]** "Is this mode bypass?" is now answered by five separate literal comparisons:
   ```
   sessions/permission.ts:23:  if (stored === "bypassPermissions") return "auto";
   sessions/permission.ts:45:    const danger = selectedRowMode === "bypassPermissions";
   sessions/permission.ts:48:  const danger = mode === "bypassPermissions";
   features/launch.ts:345:    elements.bypassWarning.hidden = !(tab === "new" && mode === "bypassPermissions");
   sessions/card.ts:90:  return session.permissionMode.value === "bypassPermissions";
   ```
   There is a sixth in `render/launchpast.ts:53` (Minor 4). The clearest case is `features/launch.ts:345`, which recomputes the New-tab danger condition that `launchPrimaryFace` returned two lines earlier as `face.danger`. Cites § Design "One owner per concept" ("Two places that must agree will not"). A fix must give the bypass predicate one owner. The warning's visibility must be derived from the same answer that drives the button's danger face.

### Notes
1. **[note]** Size warnings on touched files, each read against its reason:
   - `internal/server/launcher.go` filelen 525: holds. `createAndSpawn`/`repoContext` really are shared by both launch forms, and the file is `sessionLauncher`'s documented home.
   - `cmd/musterd/main.go` filelen 513 and funlen on `parseFlags`/`run`: holds. One flag plus its default stanza, placed beside `defaultClaudeConfigFile`, the file's per-flag pattern.
   - `web/src/features/launch.ts` filelen 719 (Decisions says 713): holds. The Resume tab's state was split into `launchresume.ts`, and what stays is the one `refreshDialogFace` recompute over both tabs.
   - `internal/server/server.go` `New` funlen 43: one registration line.
   - `internal/claudecode/launch_test.go` `TestBuildArgv` 78 lines: it grew by table rows, which is the shape § Testing asks for.
2. **[note]** `internal/server/launcherpastlist.go:21-23`'s `maxPastSessionPromptLen` comment is right that it is not `internal/session/session.go:239`'s `truncate`. That one cuts by bytes at a rune boundary; this one cuts by runes after the first line. No change requested.
3. **[note]** `web/src/features/launch.ts`'s `submit()` and `submitNew()` each spell out the same success/failure tail (`showError` / `dialog.close()` / `onLaunched`). `launchresume.ts:submit` also returns a fabricated `invalid_request` `ApiResult` for "nothing selected", while `submitNew` calls `showError` directly for the same kind of guard. Two shapes for one idea, small enough to leave.
4. **[note]** For `review-work`, a stale comment: `internal/session/session.go:47` still says `ValidPermissionMode` covers "the four permission modes"; there are now five.
5. **[note]** For `review-work`'s DIAG row: no record under `docs/diagrams/` names `pastSessionsFeature`, `launcherpast`, `launchresume` or `launchpast`. The new `pastSessionsFeature` → `claudecode.PastSessions` edge and the `features/launch.ts` → `features/launchresume.ts` sub-controller edge are not on the component diagrams.
6. **[note]** `web/src/render/launchpast.ts` and `render/launch.ts` write `"(untitled)"`, while every other title fallback in `web/src` writes `"untitled"` without parentheses (`sessions/card.ts:352`, `render/mainhead.ts:77`, `render/issue.ts:34`, `terminal/pane.ts:96`). This may be specified copy. It is flagged only as a divergence.
