# Maintainability review: Stale dirs, models and branches

**Plan**: stale-dirs-models-branches
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 42147 words (budget 20000)
**Scope**: 32 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`. This is a full cycle: the spawn prompt did not ask for a delta. Files with no change since the cycle 1 review commit (`2a12f7f`) keep their cycle 1 result, after a re-check against `git diff 2a12f7f..HEAD`. The files that diff touches (`cmd/musterd/main.go`, `internal/server/bgloop.go`, `internal/server/launcher.go`, `internal/server/reporefresh.go`, `web/src/style.css`) were re-read in full along with their siblings.

## Cycle 1 Minors

| Prior Minor | Fix commit | Verified how |
|-------------|------------|--------------|
| 1: `resolvePath` duplicates `claudecode.resolveTranscriptDir`, and the design line said no such helper existed | 02c9493 (Decisions only) | The new `design:` line names `launchtranscripts.go:54`, says it is the same body, and gives the reason it is not reused. The helper is unexported inside the Claude-format adapter, which is a leaf with no internal imports. A shared home would be a new leaf package, which needs kb ownership and a diagram edit. The false "found no helper" claim is withdrawn. The reason holds. The follow-up (`internal/<leaf>.ResolveDir`) is handed to the orchestrator, see Note 1. |
| 2: `deriveLocation` copies `repoContext`'s Branch/IsWorktree body | 02c9493 | The new `checkoutState(ctx, dir) (branch *string, isWorktree bool)` at `internal/server/launcher.go:336` is now the only caller of `gitutil.Branch` + `gitutil.IsWorktree` in `internal/server`. `repoContext` (`launcher.go:329`) and `deriveLocation` (`reporefresh.go:131`) both use it. A `design:` line explains why it skips `IsRepo`. |
| 3: size warnings with no reason (`parseFlags` 48, `server.New` 44, `claudecodetest.go` 630) | 02c9493 (Decisions) | The "Size warnings kept on purpose" bullet gives a reason for each one, and each reason fits the code. `parseFlags` is one statement per flag plus the validation switch. `New`'s doc comment already gives the composition-root reason, and this diff adds only a `register` line and a callback. `claudecodetest.go` is a flat list of independent payload builders. |
| 4: the `↳` block's layout written twice in `style.css` (4px vs 5px gap, `align-self` on one host only) | 627d509 | One selector list, `.r2c, .mainhead .meta .claude-at`, now declares the grid, the 5px gap, `min-width`, `line-height`, the `[hidden]` companion, the `.lead` span with `align-self: start`, and column 2 for `.rf`/`.rb` (`style.css:2177-2203`). What is left per host is a real difference: the card's margin, font and colour (`.r2c`, `style.css:2205`) and the header's 30ch/44ch caps (`.mainhead .meta .rf`/`.rb`, `style.css:739-753`). `rg` finds no other `.claude-at` layout rule. |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/main.go | in-file flag siblings (`usage-poll`, `claude-theme-poll`) | n/a (one flag) | filelen 525, reason holds; funlen `parseFlags` 48, reason holds (fix attempt 1); funlen `run` 44, function untouched | pass (since cycle 1, only the help text changed) |
| internal/claudecode/CLAUDE.md | (generated trailer) | n/a | — | pass |
| internal/claudecode/claudecodetest/claudecodetest.go | `EnvelopedHookBody`, `SessionStartOpts` in-file | n/a | filelen 630, reason holds (fix attempt 1) | pass |
| internal/claudecode/interpret.go | per-arm `agent_id` reads in-file, doc.go | yes | — | pass (unchanged since cycle 1) |
| internal/claudecode/status.go | interpret.go | covered | — | pass (unchanged) |
| internal/gitutil/gitutil.go | `Branch`/`IsWorktree`/`IsRepo` in-file | yes | — | pass (unchanged) |
| internal/server/bgloop.go | usagepoll.go, themepoll.go, shellactivity.go, updatemanager.go | yes | — | pass (comment now names `repoRefreshFeature`) |
| internal/server/launcher.go | reporefresh.go (the second `checkoutState` caller), `repoContext` in-file | yes (`checkoutState` placement) | filelen 559 (was 553), reason given, see Note 2 | pass |
| internal/server/reporefresh.go | usagepoll.go, themepoll.go, launcher.go, updatemanager.go | yes | — | pass: `readRepoState`'s `(state, ok)` has one caller (`tick`), and the doc comment says what `ok` guards |
| internal/server/server.go | usage/theme/shellActivity registration lines | yes | funlen `New` 44, reason holds | pass (unchanged) |
| internal/server/sessionwire.go | `sessionWireRepo`, `toWireSession` in-file | n/a | — | pass (unchanged) |
| internal/session/CLAUDE.md | — | n/a | — | pass |
| internal/session/actions.go | liveness.go, reader.go | covered | — | pass (unchanged) |
| internal/session/apply.go | status.go, reader.go | covered | — | pass (unchanged) |
| internal/session/liveness.go | actions.go | covered | — | pass (unchanged) |
| internal/session/location.go | session.go, status.go | yes | — | pass (unchanged) |
| internal/session/machine.go | status.go | n/a | funlen `applyInput` 51, function untouched | pass (unchanged) |
| internal/session/manager.go | liveness.go, actions.go | yes | filelen 580, reason holds | pass (unchanged) |
| internal/session/repo.go | reader.go (`SetPlan`), title.go | yes | — | pass (unchanged) |
| internal/session/row.go | — | n/a | — | pass (unchanged) |
| internal/session/session.go | — | yes | — | pass (unchanged) |
| internal/session/status.go | apply.go | covered | — | pass (unchanged) |
| internal/session/writeorder.go | — | n/a | — | pass (unchanged) |
| internal/store/migrations/0012_claude_dir.sql | 0011_turn_state.sql | n/a | — | pass (unchanged) |
| internal/store/session.go | — | n/a | — | pass (unchanged) |
| web/src/protocol/session.ts | `parseRepoInfo`, `parseModelInfo` in-file | n/a | — | pass (unchanged) |
| web/src/render/mainhead.ts | render/tiles.ts, render/sessions.ts | yes | — | pass (unchanged) |
| web/src/render/repolines.ts | render/context.ts | yes | — | pass (unchanged) |
| web/src/render/sessions.ts | render/context.ts, render/tiles.ts | covered | — | pass (unchanged) |
| web/src/render/tiles.ts | render/sessions.ts | covered | — | pass (unchanged) |
| web/src/sessions/card.ts | sessions/paths.ts, sessions/context.ts | yes | — | pass (unchanged) |
| web/src/style.css | `.mainhead .name` (`style.css:645`), `.r2 .rf` block (`:2163`), compact-density block (`:2420`) | yes | — | pass: `.thead .nm` gets `flex: 0 1000 auto; min-width: 5rem`, the same shape as `.mainhead .name` (`style.css:655-656`, `min-width: 6rem; flex: 0 1000 auto`), and its comment points to that rule |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** Orchestrator follow-up from cycle 1 Minor 1. `resolvePath` (`internal/server/reporefresh.go:139`) and `claudecode.resolveTranscriptDir` (`internal/claudecode/launchtranscripts.go:54`) are still two copies of the same resolve-else-clean body. The reason for keeping both holds for this plan. The design line suggests one leaf `ResolveDir` as the follow-up, and that is a backlog item, not part of a fix wave.
2. **[note]** `repoContext` and `checkoutState` are git-reading helpers. Since cycle 1, two features share them (the launcher and the repo poll), but they live in `launcher.go`, which is 559 lines and already over the threshold. The design line's reason ("beside its other caller") is valid. A newcomer looking for "how the server reads a checkout" would still look in `reporefresh.go` before `launcher.go`. Taste only, no change asked.
3. **[note]** `tick` checks `isDir(t.Directory)` before the reads, and `readRepoState` checks it again after them (`reporefresh.go:86`, `:114`). The two checks guard different windows, and `readRepoState`'s doc comment explains why. They are not a duplicate.
4. **[note]** Each host still has its own per-line ellipsis rule: `.mainhead .meta .rf/.rb` (`style.css:739`, adds `min-width: 2ch` and the caps) and `.r2 .rf … .r2c .rb` (`style.css:2163`, `display: block`). Each rule covers both of its host's blocks, and the hosts differ for real, so this is not the cycle 1 split again.
5. **[note]** Shared state is unchanged since cycle 1 (cycle 1 Note 10 still holds). The fix wave adds no field and no new writer. `readRepoState`'s `ok` is local to one tick on the loop goroutine.
