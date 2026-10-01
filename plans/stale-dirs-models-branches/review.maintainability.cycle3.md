# Maintainability review: Stale dirs, models and branches

**Plan**: stale-dirs-models-branches
**Verdict**: needs-changes
**Cycle**: 3
**Pack**: kb: pack 42147 words (budget 20000)
**Scope**: 32 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`. This is a full cycle, because the spawn prompt did not ask for a delta. Cycle 2's part had no agent-tagged issues. Files with no change since the cycle 2 review commit (`6dfe798`) keep their cycle 2 result, which I re-checked against `git diff 6dfe798..HEAD`. That diff touches 7 files: `internal/server/reporefresh.go`, `internal/session/{liveness,repo,session,writeorder}.go`, `web/src/render/mainhead.ts` and `web/src/style.css`. I re-read each of them in full with its siblings, plus `web/index.html`'s `.meta` markup.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/main.go | in-file flag siblings | n/a (one flag) | filelen 525, funlen `parseFlags` 48: both reasons hold; funlen `run` 44: function untouched | pass (unchanged since cycle 2) |
| internal/claudecode/CLAUDE.md | (generated trailer) | n/a | — | pass |
| internal/claudecode/claudecodetest/claudecodetest.go | in-file builders | n/a | filelen 630, reason holds | pass (unchanged) |
| internal/claudecode/interpret.go | doc.go, in-file arms | yes | — | pass (unchanged) |
| internal/claudecode/status.go | interpret.go | covered | — | pass (unchanged) |
| internal/gitutil/gitutil.go | in-file | yes | — | pass (unchanged) |
| internal/server/bgloop.go | usagepoll.go, themepoll.go | yes | — | pass (unchanged) |
| internal/server/launcher.go | reporefresh.go | yes | filelen 559, reason holds | pass (unchanged) |
| internal/server/reporefresh.go | launcher.go, usagepoll.go | yes | — | pass. The one-field change copies `t.Epoch` into the reading the same way `ClaudeDir` is already carried |
| internal/server/server.go | registration lines | yes | funlen `New` 44, reason holds | pass (unchanged) |
| internal/server/sessionwire.go | in-file | n/a | — | pass (unchanged) |
| internal/session/CLAUDE.md | — | n/a | — | pass |
| internal/session/actions.go | liveness.go | covered | — | pass (unchanged) |
| internal/session/apply.go | status.go | covered | — | pass (unchanged) |
| internal/session/liveness.go | actions.go, repo.go | covered (repoEpoch design line) | — | pass. `repoEpoch++` sits beside the other death-time clears (`pendingResumeClaudeSessionID`, `ClaudeLocation`), before `post` is taken |
| internal/session/location.go | session.go | yes | — | pass (unchanged) |
| internal/session/machine.go | status.go | n/a | funlen `applyInput` 51, function untouched | pass (unchanged) |
| internal/session/manager.go | liveness.go | yes | filelen 580, reason holds | pass (unchanged) |
| internal/session/repo.go | reader.go, liveness.go | yes ("stale-reading guard is a death counter…") | — | pass, see Note 1 |
| internal/session/row.go | — | n/a | — | pass (unchanged) |
| internal/session/session.go | `pendingResumeClaudeSessionID`, `ClaudeLocation` declarations | yes | — | pass. The guard and the single writer are named where the field is declared (`session.go:181`) |
| internal/session/status.go | apply.go | covered | — | pass (unchanged) |
| internal/session/writeorder.go | `CheckSessionFieldCoverage` (`:295`) | covered | — | pass. `repoEpoch` is in both the restore call and `restoredSessionFields`, and the reflection check covers unexported fields too (`t.Field(i).Name`) |
| internal/store/migrations/0012_claude_dir.sql | 0011_turn_state.sql | n/a | — | pass (unchanged) |
| internal/store/session.go | — | n/a | — | pass (unchanged) |
| web/src/protocol/session.ts | in-file parsers | n/a | — | pass (unchanged) |
| web/src/render/mainhead.ts | render/tiles.ts, index.html `.meta` | covered ("`.sep` stays two elements") | — | pass. The new comment names the markup that `requireElement(".sep", loc)`'s first-match depends on |
| web/src/render/repolines.ts | render/context.ts | yes | — | pass (unchanged) |
| web/src/render/sessions.ts | render/context.ts | covered | — | pass (unchanged) |
| web/src/render/tiles.ts | render/sessions.ts | covered | — | pass (unchanged) |
| web/src/sessions/card.ts | sessions/paths.ts | yes | — | pass (unchanged) |
| web/src/style.css | `.rnav .sep` (`:1519`), `.crumbs .sep` (`:2914`), shared `.r2c, .claude-at` rule (`:2232`), `--block-floor` (`:774`, `:780`) | yes (CSS give-way vs ResizeObserver, `.sep` stays markup, shared-rule fix) | — | Minor 1 |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[web-impl]** The Focus header's new give-way layout uses three pairs of hand-copied lengths. Each pair has to stay equal or the layout breaks, and nothing in the CSS ties the two copies together. This cites `docs/conventions.md` § Design, "One owner per concept … Two places that must agree will not". The three pairs:
   - `web/src/style.css:748` `.loc { height: 2.7em }` and `:758` `.loc::before { height: 2.7em }` are both `2 × line-height` from `:751` `line-height: 1.35`. If someone changes the line-height and not both heights, the clip no longer starts at the second flex line. That brings back the half-drawn block this rule exists to prevent.
   - `:780` `--block-floor: calc(1ch + 5px + 8ch)` copies the glyph gap that is set at `:2245` `.claude-at .lead { padding-right: 5px }`, in the shared rule. If the gap changes, the `↳` block's floor drifts away from its contents.
   - `:805` `.loc .sep { left: -1.875ch }` is worked out by hand from `:770` `margin-right: 2.75ch` (`-(2.75ch + 1ch) / 2`, which centres the dot in the margin).

   The same diff already names one length, `--block-floor`, so this would not be a new pattern here. A fix must make each of these lengths live in one place, so the other uses are derived from it (`calc`/`var`) and cannot drift. The rendered layout must stay the same.

### Notes

1. **[note]** I checked `repoEpoch` (`internal/session/session.go:186`) against question 3. Its one writer is `markEnded`, which holds `Manager.mu` (`liveness.go:220`; `rg "Alive = false" internal` lists only that site). Its readers, `RepoTargets` and `SetRepoState` (`repo.go:37`, `:59`), take the same lock. The gate's `test` line ran `go test -race -count=1 ./...`. The one interleaving left is a reading snapshotted between the bump and a rollback after a failed persist. That reading carries epoch N+1 against a restored N, so it is dropped and the next tick re-reads it. That is a lost reading, not a race. `rg -i "epoch|generation|incarnation" internal --glob '!*_test.go'` lists only this field, so it is not a second copy of an existing counter.
2. **[note]** The comment on the shared `↳` rule (`style.css:2225`) still says the header adds only "its ellipsis caps". The header now also sets the block's floor, its margin and its line-height (`:766-781`, `:751`). Whether the comment is accurate is for `review-work` to judge.
3. **[note]** Cycle 2 Notes 1 to 4 still apply as written: `resolvePath` and `resolveTranscriptDir` are still two copies (an orchestrator follow-up), `checkoutState` still lives in `launcher.go`, `isDir` is still checked twice, and each host still has its own ellipsis rule. None of the files they cite changed except `reporefresh.go`, and its change was one field.
