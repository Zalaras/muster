# Maintainability review: Resume and Dangerously Allow

**Plan**: resume-and-dangerously-allow
**Verdict**: needs-changes
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
