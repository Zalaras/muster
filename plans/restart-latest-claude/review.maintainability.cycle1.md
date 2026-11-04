# Maintainability review: Restart Latest Claude

**Plan**: restart-latest-claude
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 23938 words (budget 30000)
**Scope**: 39 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/CLAUDE.md | (generated trailer only) | n/a | none | pass |
| internal/claudecode/claudecodetest/statusline.go | statusline.go's own builders | no | funlen `statusLineFullPayload` 42 > 40 statements, new on this branch (40 on main), no reason | Minor 2 |
| internal/claudecode/status.go | version.go, status.go `interpretEffort`/`interpretPromptCache` | n/a (field) | none | pass |
| internal/claudecode/version.go | version.go `parseSemver`/`compareSemver`/`ClassifyAgainst` | no | none | Minor 3 (reuses `parseSemver`/`compareSemver`: good) |
| internal/server/CLAUDE.md | (generated trailer only) | n/a | none | pass, Note 6 |
| internal/server/claudeversion.go | reporefresh.go, usagepoll.go, server.go constructors | partly (`tellInstalled` yes, `followInstalled` no) | none | Minor 1 |
| internal/server/launcher.go | actions.go | yes (`ResumeLocked` extracted) | funlen `ResumeLocked` 62 > 60 (`Resume` was 92 lines on main); file 628 lines, reason given | pass, Note 5 |
| internal/server/renderfix_scenarios_restart.go | renderfix_scenarios_notes.go, renderfix_scenarios_misc.go:66, renderfix.go:205 | yes (`claude-restart-down` line) | none | pass |
| internal/server/restart.go | actions.go, reporefresh.go, bgloop.go, sessionwire.go, session/actions.go | yes | none | Major 1 |
| internal/server/server.go | (root) | yes | funlen `New` 55 > 40 statements, pre-existing (53 on main) | pass, Note 5 |
| internal/server/sessionwire.go | usagewire.go | yes (`ClaudeBehind` stored so the wire stays free of installed) | funlen `toWireSession` 66 > 60, pre-existing (62 code lines on main) | pass, Note 5 |
| internal/session/CLAUDE.md | (generated trailer only) | n/a | none | pass |
| internal/session/actions.go | railorder.go, writeorder.go | yes (`EndLocked` rename) | none | pass |
| internal/session/apply.go | status.go | yes (`statusWireChanged`) | none | pass |
| internal/session/liveness.go | actions.go | n/a (one clear call) | none | pass |
| internal/session/manager.go | effort.go, repo.go | yes (`installedClaude`, `onRestartDue` in `broadcast`) | file 645 lines, pre-existing, reason given | pass |
| internal/session/restart.go | effort.go, note.go, groups.go, railorder.go, writeorder.go | partly (`SetInstalledClaude`/settle yes; `RestartClass`/`ClassifyRestart` no) | none | Minor 3, Note 3 |
| internal/session/row.go | row.go mapping | n/a | none | pass |
| internal/session/session.go | session.go fields | yes | none | pass, Note 4 |
| internal/session/status.go | status.go `adopt*` | yes | none | pass |
| internal/session/writeorder.go | writeorder.go `restoredSessionFields` | n/a | none | pass |
| internal/store/migrations/0019_restart.sql | 0017_added_dirs.sql, 0018_note.sql | n/a | none | pass |
| internal/store/session.go | store/session.go | n/a | funlen `UpdateSession`, `scanSession` pre-existing (71/70 lines on main); file 558, reason given | pass, Note 5 |
| web/src/api/sessions.ts | api/sessions.ts `endSessions`/`removeSessions` | n/a | none | pass |
| web/src/app.ts | wsapp.ts, app.ts `AppEvents` | yes | none | pass, Note 2 |
| web/src/features/CLAUDE.md | — | n/a | none | pass |
| web/src/features/connection.ts | updaterestart.ts, connectionversion.ts, wsapp.ts | yes | none | pass, Note 2 |
| web/src/features/restart.ts | updaterestart.ts, notes.ts, actions.ts, usage.ts, render/menu.ts, render/confirm.ts | yes | none | pass, Note 7 |
| web/src/features/restartnotice.ts | connectionversion.ts, batchplan.ts, updaterestart.ts | yes | none | pass, Note 1 |
| web/src/features/restartplan.ts | batchplan.ts, actionscopy.ts, sessions/card.ts | yes | none | Major 3, Note 1 |
| web/src/main.ts | (root) | yes | none | pass |
| web/src/protocol/batch.ts | protocol/batch.ts | n/a (extends `BatchResult`: good reuse) | none | pass |
| web/src/protocol/session.ts | protocol/session.ts `parseEffortWarning` | n/a | none | pass |
| web/src/render/CLAUDE.md | — | n/a | none | pass |
| web/src/render/masthead.ts | masthead.ts, effortstrip.ts | yes | none | pass, Note 8 |
| web/src/render/restartdialog.ts | confirm.ts, groupdialogs.ts | yes | none | pass |
| web/src/render/restartpanel.ts | grouppopover.ts, notespanel.ts, effortstrip.ts, railsections.ts, dom.ts | yes | none | Major 2 |
| web/src/sessions/testfixtures.ts | — | n/a | none | pass |
| web/src/style.css | `.menu` (4488), `.npanel` (4962), group popover rules | n/a | none | pass |

Shared state (question 3): `restartFeature.mu` guarding `queued` (writers `enqueue`/`next`), `Manager.installedClaude`/`installedChecked` under `mu` (writer `SetInstalledClaude`) and the loop-only `toldInstalled` all name their guard and writers where they are declared. The gate's `make test-race` timed out in both `internal/session` and `internal/server`, so I ran the restart paths under the detector myself: `go test -race -count=1 -timeout 540s -run 'Restart|ClaudeVersion|InstalledClaude' ./internal/session ./internal/server` gave `ok internal/session 388.971s` and `ok internal/server 135.190s`. I traced one interleaving with no lock or ordering bug. The handler classifies `RestartQueue`, then the ingest worker makes the session free before `SetRestartPending`. `SetRestartPending`'s upsert then fires `onRestartDue`, and `fire` waits on the per-session lock, so the restart runs once the handler releases it.

## Issues

### Critical

### Major

1. **[daemon-impl]** The restart batch is a second batch runner beside `session.Manager.runBatch`: `internal/server/restart.go:122-196`. It does its own repeated-id refusal (`:127`, sort and compact), its own per-id `LockSession`, its own mapping of `ErrUnknownSession`/`ErrSessionNotAlive` to skipped and anything else to a warn log plus failed, and its own `restartBatchWire` (`:115`). This breaks conventions § Design "Reuse before add … What it finds is reused or generalised, never copied, whatever Decisions says" and "One owner per concept". `rg -n 'hasRepeat|ErrInvalidOrder' internal -g '!*_test.go'` shows that every other list endpoint already has one owner for these rules: `internal/session/actions.go:132` `if hasRepeat(ids) { return result, ErrInvalidOrder }` in `runBatch` (the loop behind `EndMany`/`RemoveMany`, `:130`, whose `switch` at `:141-148` is the bucketing that `restartNow` re-spells), `internal/session/railorder.go:255` `func hasRepeat(values []int64) bool`, and the 400 mapping in `internal/server/actions.go:143` `writeBatchError`. The wire half already exists as `internal/server/sessionwire.go:247` `type batchWire struct { Done, Skipped, Failed }` plus `toWireBatch`/`nonNil`. The sibling `decodeBatchRequest` also states at `actions.go:131-132` that "A repeated id is the manager's to refuse (writeBatchError)", and this handler contradicts that. The Decisions reason ("`session.hasRepeat` is private and its test file may not be touched, so no export") does not hold: a generalised or exported runner needs no edit to `railorder_test.go`, and the line never mentions `runBatch` at all. A fix must make this true: end, remove and restart share one owner for the repeated-id refusal, the per-id lock and the done/skipped/failed bucketing (generalised so it can carry `queued`), and restart's report reuses the `batchWire` shape instead of re-declaring its three lists. If restart truly cannot share it, Decisions must say why in a reason the code bears out.

2. **[web-impl]** `web/src/render/restartpanel.ts:40` declares a private `function setText(el: HTMLElement, text: string): void { if (el.textContent !== text) el.textContent = text; }`, which is byte-for-byte `web/src/dom.ts:42` `export function setText(el: HTMLElement, text: string): void`. This breaks conventions § Design "Reuse before add". `rg -n 'function setText|export function setText' web/src`:
   ```
   ./dom.ts:42:export function setText(el: HTMLElement, text: string): void {
   ./render/restartpanel.ts:40:function setText(el: HTMLElement, text: string): void {
   ```
   Its render siblings already import the shared one: `render/context.ts:5`, `render/notes.ts:1`, `render/repolines.ts:5` (`import { … setText } from "../dom"`). A fix must make true: `restartpanel.ts` declares no text-write helper of its own.

3. **[web-impl]** `web/src/features/restartplan.ts:35-37` `backgroundTaskReason` re-spells the singular and plural "background task(s)" wording that `web/src/sessions/card.ts:415-419` `backgroundLine` already owns (`n === 1 ? "1 background task" : \`${n} background tasks\``). `card.ts`'s neighbouring doc comments state the rule for these strings: "one source of truth for the word, never a second copy". This breaks conventions § Design "Reuse before add" and "One owner per concept". `rg -n 'background (task|tasks)|"task" : "tasks"' web/src --glob '!*.test.ts'` shows the two spellings: `sessions/card.ts:418` and `features/restartplan.ts:36`. A fix must make true: the restart reason's background-task count phrase comes from the one owner in `sessions/card.ts`, so a wording change there reaches the card line and the restart row together.

### Minor

1. **[daemon-impl]** `internal/server/claudeversion.go:92` `followInstalled(fn)` is a setter called after construction (`internal/server/server.go:230` `claudeVersion.followInstalled(s.manager.SetInstalledClaude)`). It is the only post-construction setter among the server features: `rg -n '^func \(\w+ \*\w+\) (set|follow|on)[A-Z]\w*\(fn' internal/server -g '!*_test.go'` returns only this line. Its siblings take their callbacks through the constructor, for example `server.go:221` `newGroupsFeature(s.manager, actions.teardownRemoved, cfg.Logger)` and `server.go:231` `newIssueFeature(…, claudeVersion.Current, …)`. `s.manager` already exists when `newClaudeVersionFeature` runs, so there is no ordering cycle to explain the setter, and no `design:` line covers it (the Fix Attempt line names `tellInstalled` only). Cites conventions § Design "Match the siblings … constructor, seam … or says in Decisions why it diverges". A fix must make true: the installed-version consumer reaches `claudeVersionFeature` the way its siblings' collaborators do, or Decisions states why it cannot.

2. **[daemon-impl]** `internal/claudecode/claudecodetest/statusline.go:90` `statusLineFullPayload` now trips funlen at 42 > 40 statements. It was at 40 on main, and the new `Version` branch (`:123-125`) pushed it over. Decisions gives no reason (its Size line covers only the three file lengths). Cites kb:adr/process-size-linters-warn-never-fail and conventions § Design "Size is read, not obeyed … fine with a reason in Decisions". A fix must make true: Decisions carries a reason that holds for this builder, or the builder is restructured for a real reason. A split made only to silence the warning does not count.

3. **[daemon-impl]** These new seams have no `design:` line. `internal/session/restart.go` adds the three-way `RestartClass` (`RestartSkip`/`RestartQueue`/`RestartNow`, `:13-19`) with `ClassifyRestart` (`:99`), which is the seam `restartFeature.restartOne` switches on. `internal/claudecode/version.go` adds two exported functions to the boundary package, `LeadingVersion` (`:139`) and `OlderVersion` (`:147`). Decisions explains `SetInstalledClaude`, the settle rule and the queue, but not why a classification enum sits between session and server, or that the version helpers are the boundary's new public surface. Cites conventions § Design "reported in its log's `## Decisions` as a `design:` line per new type, module or seam". A fix must make true: each of these has a `design:` line naming the shape, why, and what it reused (here `parseSemver`/`compareSemver`).

### Notes

1. **[note]** "Free" is spelled out in both tiers: the daemon's `Session.restartFree` (`internal/session/restart.go:21-23`) and the dashboard's `isFree` (`web/src/features/restartplan.ts:18-20`). The same is true of semver ordering: `claudecode.compareSemver` in Go and `compareVersions`/`parseTriple` in `web/src/features/restartnotice.ts:18-29`. No TS helper existed to reuse (`rg 'semver|compareVersion|Triple' web/src` finds only these). But the dialog's "Restart now" and "Restart when free" split is the dashboard's guess at a rule the daemon re-decides at POST time, and "Two places that must agree will not" (§ Design "One owner per concept"). Moving the rule to one side would change the wire, so it is a protocol question for the plan, not a fix here.
2. **[note]** Every other WS-message-to-`app` event mapping lives in `web/src/wsapp.ts` (`prefs`, `groups`, `snapshot`, `claudeTheme`, `update`, `usage`, `shellActivity`). The new `claudeCode` event is the first one emitted from a controller (`features/connection.ts:203,209`), and a reader looking for its source will look in `wsapp.ts` first. Decisions gives a reason for the divergence ("it already receives hello and the push"), so no change is requested.
3. **[note]** `ClassifyRestart` (`internal/session/restart.go:104`, skips unless alive, versioned, behind and bound) and `SetRestartPending` (`:120`, refuses unless alive and behind) state the eligibility rule twice, with different subsets. Today the two agree, because `settleClaudeBehindLocked` never sets `ClaudeBehind` without a version.
4. **[note]** `Session.ClaudeBehind` is derived state that is stored (`internal/session/session.go:219`). Correctness depends on every writer of `ClaudeVersion` or the installed version calling `settleClaudeBehindLocked`: the status post, `SetInstalledClaude`, `LoadAll`, and `clearClaudeVersion` on death, launch and resume. Decisions states the reason (the wire mapping stays free of the installed version), and it holds today.
5. **[note]** Pre-existing size warnings on touched files, not caused by this branch and not asked about: `server.go` `New` (53 statements on main), `sessionwire.go` `toWireSession` (62 code lines on main), `store/session.go` `UpdateSession`/`scanSession`, `launcher.go` `ResumeLocked` (the extraction shrank the 92-line `Resume`), and the three over-500 files, whose reason is given in Decisions. The `restart_test.go`/`restart_invariants_test.go`/`restart_writes_test.go` funlen hits are on test files, not `dupl`, so they are outside this part.
6. **[note]** This one is for review-work (doc truth and DIAG). `internal/server/CLAUDE.md`'s **Owns** line lists the `/api/sessions` route files by feature but not `restart.go`. The `kb:diagram/web-components` features/ count ("45 modules … 18 DOM-free helpers") and its `Rel(features, storage, …)` label (which does not name restart's per-tab Ignore) predate the three new modules.
7. **[note]** `features/restart.ts:83-131` is a third inline outside-pointerdown/Escape dismiss, after `render/menu.ts:170-190` and `features/notes.ts:193-241`. There was no shared helper to reuse, so it matches what its siblings do. It is a candidate for extraction if a fourth appears.
8. **[note]** `render/masthead.ts` `renderNotice` wires `notice.onActivate` only when it first builds the button (`buildNoticeButton`). A later call with a different handler is ignored. That is harmless today because `connection.ts` always passes the stable `deps.toggleRestartPanel`, but it is a surprise for anyone who passes a fresh closure.
