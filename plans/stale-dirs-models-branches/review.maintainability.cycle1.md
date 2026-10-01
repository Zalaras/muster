# Maintainability review: Stale dirs, models and branches

**Plan**: stale-dirs-models-branches
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 42147 words (budget 20000)
**Scope**: 31 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (plus `web/index.html`, read as the markup half of the web change)

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/main.go | (its flag/const siblings in-file: usagePoll, claudeThemePoll) | n/a (one flag) | filelen 525, reason holds; funlen `parseFlags` 48, no reason; funlen `run` 44, function untouched | Minor 3 |
| internal/claudecode/CLAUDE.md | (generated trailer) | n/a | — | pass |
| internal/claudecode/claudecodetest/claudecodetest.go | `EnvelopedHookBody`, `SessionStartOpts`, `ToolFileOpts` in-file | n/a (one helper, `EnvelopedHookBody`'s shape) | filelen 630, no reason | Minor 3 |
| internal/claudecode/interpret.go | per-arm `agent_id` reads in-file, doc.go | yes (`interpretKind` split) | — | pass |
| internal/claudecode/status.go | interpret.go | covered by the interpret line | — | pass |
| internal/gitutil/gitutil.go | `Branch`/`IsWorktree`/`IsRepo` in-file | yes (in the reporefresh line) | — | pass: `TopLevel` takes the exported-wrapper-over-`gitRunner` shape its siblings use |
| internal/server/bgloop.go | usagepoll.go, themepoll.go, shellactivity.go, updatemanager.go | yes | — | pass (see Note 5) |
| internal/server/reporefresh.go | usagepoll.go, themepoll.go, shellactivity.go, launcher.go (`repoContext`), updatemanager.go | yes | — | Minor 1, Minor 2 |
| internal/server/server.go | (composition root) usage/theme/shellActivity registration lines | yes (`OnClaudeDirChange`) | funlen `New` 44, no reason | Minor 3; the root still holds one `register` line per feature, and the closure matches `OnUpsert`/`OnRemoved` |
| internal/server/sessionwire.go | `sessionWireRepo`, `toWireSession` in-file | n/a | — | pass: `sessionWireLocation` reuses `sessionWireRepo` |
| internal/session/CLAUDE.md | — | n/a | — | pass |
| internal/session/actions.go | liveness.go, reader.go | covered by the session line | — | pass |
| internal/session/apply.go | status.go, reader.go | covered | — | pass |
| internal/session/liveness.go | actions.go | covered | — | pass |
| internal/session/location.go | session.go, status.go | yes (`Elsewhere` pure) | — | pass |
| internal/session/machine.go | status.go | n/a (rule change in `applyBind`) | funlen `applyInput` 51: function untouched, the documented exemption | pass |
| internal/session/manager.go | liveness.go, actions.go | yes (callback) | filelen 580, reason holds (one field) | pass |
| internal/session/repo.go | reader.go (`SetTranscript`, `SetPlan`), title.go | yes | — | pass: `SetRepoState` uses the same lock / unknown-id / no-op / `persistWholeRowLocked` shape as `SetPlan` |
| internal/session/row.go | — | n/a | — | pass |
| internal/session/session.go | — | yes (`ClaudeDir`/`ClaudeLocation` writers named at declaration) | — | pass |
| internal/session/status.go | apply.go | covered | — | pass |
| internal/session/writeorder.go | — | n/a | — | pass: restored/immutable lists kept in step with `CheckSessionFieldCoverage` |
| internal/store/migrations/0012_claude_dir.sql | 0011_turn_state.sql | n/a | — | pass (same header shape) |
| internal/store/session.go | — | n/a | — | pass |
| web/src/protocol/session.ts | `parseRepoInfo`, `parseModelInfo` in-file | n/a | — | pass (see Note 9) |
| web/src/render/mainhead.ts | render/tiles.ts, render/sessions.ts, render/context.ts | yes | — | pass |
| web/src/render/repolines.ts | render/context.ts ("one builder, two renderers") | yes | — | pass |
| web/src/render/sessions.ts | render/context.ts, render/tiles.ts | covered | — | pass |
| web/src/render/tiles.ts | render/sessions.ts | covered | — | pass |
| web/src/sessions/card.ts | sessions/paths.ts, sessions/context.ts | yes | — | pass (see Note 3) |
| web/src/style.css | its own `.r2`, `.mainhead .meta` and `.thead` blocks | yes (`.sr-only`, compact flex) | — | Minor 4 |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[daemon-impl]** `resolvePath` (`internal/server/reporefresh.go:130`) is a second copy of an existing helper, and the `design:` line says there was none. Decisions: "Grep: `rg "TopLevel|show-toplevel|EvalSymlinks" internal --glob '!*_test.go'` found no existing top-level or path-resolving helper". Running that grep today returns, among others:
   ```
   internal/claudecode/launchtranscripts.go:56:	if r, err := filepath.EvalSymlinks(dir); err == nil {
   internal/locate/locate.go:129:		resolved, err := filepath.EvalSymlinks(path)
   internal/claudecode/claudecodetest/transcripts.go:31:	if resolved, err := filepath.EvalSymlinks(cwd); err == nil {
   cmd/musterd/main.go:193:		if resolved, err := filepath.EvalSymlinks(exePath); err == nil {
   ```
   `internal/claudecode/launchtranscripts.go:54` `func resolveTranscriptDir(dir string) string` does exactly what `func resolvePath(path string) string` does: it resolves symlinks, falls back to the input, and cleans the result. This goes against conventions § Design, "Reuse before add … paste the grep in Decisions". A fix must make one of these true. Either both callers use one resolve-or-clean helper in a home that is not Claude-Code-specific. Or the `design:` line names `resolveTranscriptDir` and says why it is not reused (for example: it is unexported inside the Claude-format adapter, and the server must not reach into it for generic path code). The design line's "found no … path-resolving helper" must not stay as written.

2. **[daemon-impl]** `deriveLocation` (`internal/server/reporefresh.go:123`) gets the branch and worktree flag for Claude's directory by calling `gitutil.Branch` and `gitutil.IsWorktree` directly. That is the body of `repoContext` (`internal/server/launcher.go:326`) again. Decisions says: "`repoContext` in `launcher.go` is reused unchanged for the launch directory read, so launch and poll answer 'branch and worktree flag' through one function". That holds for the launch directory only. The Claude directory has a second, hand-copied path. This goes against conventions § Design, "One owner per concept … Two places that must agree will not". A fix must make one of these true. Either one function answers "branch and worktree flag of a checkout" for both directories (it can skip `IsRepo` when the top level is already known). Or the `design:` line says why the second path exists.

3. **[daemon-impl]** Some size warnings on touched code have no reason in Decisions. The Decisions "Size warnings" line covers only the file lengths of `internal/session/manager.go` (580) and `cmd/musterd/main.go` (525). The `size` log also lists these, each touched by this diff:
   - `cmd/musterd/main.go:112` `parseFlags` funlen 48 > 40 (this diff adds a flag and a validation branch)
   - `internal/server/server.go:149` `New` funlen 44 > 40 (this diff adds a `register` line and a callback)
   - `internal/claudecode/claudecodetest/claudecodetest.go:1` filelen 630 > 500 (this diff adds `EnvelopedHookInDirectory`)

   The rule is conventions § Design, "Size is read, not obeyed … Exceeding one is fine with a reason in Decisions". A fix must make true that each of the three has a reason in Decisions that holds (for example, one flag declaration per statement; one registration line per feature), or a real restructure. A split made only to silence the warning does not count (kb:adr/process-size-linters-warn-never-fail).

4. **[web-impl]** `web/src/style.css` lays out the `↳` two-line block twice, with differences nobody explained. `repolines.ts` renders the same `RepoParts` into `.r2c` and `.mainhead .meta .claude-at`. Its header says the readout is "the same `RepoParts` rendered four times". But the CSS that shapes that one readout has two owners:
   - `.mainhead .meta .claude-at` at `style.css:739`: `grid-template-columns: auto minmax(0, 1fr); column-gap: 4px`. Its `.lead` has `grid-row: 1 / span 2; align-self: start`.
   - `.r2c` at `style.css:2191`: `grid-template-columns: auto minmax(0, 1fr); column-gap: 5px`. Its `.lead` has `grid-row: 1 / span 2` and no `align-self`.

   On top of that, each host has its own `.rf`/`.rb` ellipsis rule (`.mainhead .meta .rf, .mainhead .meta .rb` and `.r2 .rf … .r2c .rb`). The 4px against 5px gap and the `align-self` on one side only look accidental, and a later change to one host will not reach the other. This goes against conventions § Design, "One owner per concept". A fix must make one of these true. Either the shared block layout (lead column spanning both lines, the line column, per-line ellipsis) is declared once and both hosts use it, keeping only real per-host differences such as `max-width`. Or the `design:` line states why the two hosts must differ.

### Notes

1. **[note]** The coalescing nudge (`select { case ch <- struct{}{}: default: }` on a `chan struct{}` of size 1) now exists three times: `internal/server/usagepoll.go:65`, `internal/server/updatemanager.go:376` and `internal/server/reporefresh.go:70`. The design line's grep `rg "refresh chan struct"` missed `updatemanager.go` because of field alignment padding. It is a four-line idiom that was already copied before this plan, so this review asks for no change. If it is ever extracted, its natural home is `bgLoop`, beside `runTicked`, which already takes the channel.
2. **[note]** `Server.StopLivenessPoll` (`internal/server/server.go:324`) now also stops the repo poll. Decisions says the name is now narrower than what the function does, and the doc comment says so. The rename touches test files that are not daemon-impl's to edit, so it is a candidate follow-up for the orchestrator to propose, not a fix-wave item.
3. **[note]** The `CardViewModel.hover` field (`web/src/sessions/card.ts:48`) is filled by `locationHover` and used only by the tile's `.wh`. A comment has to explain that, which suggests `locationHover` would be the clearer field name. Taste only; no citation.
4. **[note]** For review-work: the `comments` gate is red on `web/src/style.css:2429` (`/* REQ-11: …`, a plan ID in a comment).
5. **[note]** For review-work: `runTicked`'s doc comment (`internal/server/bgloop.go:42`) names the type `repoRefresher`, while the type and `bgLoop`'s own comment say `repoRefreshFeature`.
6. **[note]** For review-work (DIAG): `kb:diagram/web-components` says `render/` has "28 modules". It had 29 on `main`, and `render/repolines.ts` makes 30. The daemon diagram's `gitutil` description ("Repo, branch and worktree detection") now also covers the top-level read. It still reads true, but review-work may want it updated.
7. **[note]** For review-work: `-repo-poll 0` means "no timer; start tick and nudges still run". Its siblings `-usage-poll 0` and `-claude-theme-poll 0` mean the poller is never built (`internal/server/themepoll.go:14`). The difference follows the plan's contract (Decisions lists it as a doc-delta), so it is not a shape finding here. A newcomer reading the flags will still expect "0 disables".
8. **[note]** Test-file funlen hits on new tests (`TestRepoPoll_ClaudeLocationMatrix` 113 lines, `TestSetRepoState` 145 lines) are daemon-tests' to read. No `dupl` warning names a test file.
9. **[note]** For review-work: `parseSession` reads an absent `claudeLocation` as `null` (`web/src/protocol/session.ts`, "An older daemon omits the key"), while `sessionwire.go` calls it a "Required key on every Session object". Whether the decoder may tolerate a missing key is a contract question.
10. **[note]** Shared state checked: `repoRefreshFeature.refresh` is written by the ingest worker (through `OnClaudeDirChange`) and read by the loop goroutine, and the design line names both. `Session.ClaudeDir` and `Session.ClaudeLocation` name their writers and `Manager.mu` where they are declared (`internal/session/session.go`). `s.repoRefresh` is assigned in `New` before any goroutine starts, so the closure's read is ordered by `Start`. `SetRepoState` drops a stale reading on a `ClaudeDir` mismatch or a dead session, and its own writes go under `Manager.mu` and the per-id write turnstile. The gates' `test` line is `go test -race -count=1 ./...` with 0 FAIL. I found no interleaving it would miss.
