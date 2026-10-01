# Maintainability review: Stale dirs, models and branches

**Plan**: stale-dirs-models-branches
**Verdict**: approved
**Cycle**: 4
**Pack**: kb: pack 42147 words (budget 20000)
**Scope**: 32 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`. This is a full cycle, because the spawn prompt did not ask for a delta. Since the cycle 3 review commit (`9ebea56`), `git diff 9ebea56..HEAD` over the same paths touches one file, `web/src/style.css` (+58 −39, from fix commit `061f424`). I re-read that diff in full, along with the rules it shares lengths with: the shared `↳` rule (`:2239-2266`), `.mainhead .name` (`:651-669`) and the picker's unrelated `line-height: 1.35` (`:2865`). Every other file has not changed since cycle 3, so it keeps its cycle 3 result.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/main.go | in-file flag siblings | n/a (one flag) | filelen 525, funlen `parseFlags` 48: reasons hold; funlen `run` 44: function untouched | pass (unchanged since cycle 3) |
| internal/claudecode/CLAUDE.md | (generated trailer) | n/a | — | pass (unchanged) |
| internal/claudecode/claudecodetest/claudecodetest.go | in-file builders | n/a | filelen 630, reason holds | pass (unchanged) |
| internal/claudecode/interpret.go | doc.go, in-file arms | yes | — | pass (unchanged) |
| internal/claudecode/status.go | interpret.go | covered | — | pass (unchanged) |
| internal/gitutil/gitutil.go | in-file | yes | — | pass (unchanged) |
| internal/server/bgloop.go | usagepoll.go, themepoll.go | yes | — | pass (unchanged) |
| internal/server/launcher.go | reporefresh.go | yes | filelen 559, reason holds | pass (unchanged) |
| internal/server/reporefresh.go | launcher.go, usagepoll.go | yes | — | pass (unchanged) |
| internal/server/server.go | registration lines | yes | funlen `New` 44, reason holds | pass (unchanged) |
| internal/server/sessionwire.go | in-file | n/a | — | pass (unchanged) |
| internal/session/CLAUDE.md | — | n/a | — | pass (unchanged) |
| internal/session/actions.go | liveness.go | covered | — | pass (unchanged) |
| internal/session/apply.go | status.go | covered | — | pass (unchanged) |
| internal/session/liveness.go | actions.go, repo.go | covered | — | pass (unchanged) |
| internal/session/location.go | session.go | yes | — | pass (unchanged) |
| internal/session/machine.go | status.go | n/a | funlen `applyInput` 51, function untouched | pass (unchanged) |
| internal/session/manager.go | liveness.go | yes | filelen 580, reason holds | pass (unchanged) |
| internal/session/repo.go | reader.go, liveness.go | yes | — | pass (unchanged) |
| internal/session/row.go | — | n/a | — | pass (unchanged) |
| internal/session/session.go | sibling field declarations | yes | — | pass (unchanged) |
| internal/session/status.go | apply.go | covered | — | pass (unchanged) |
| internal/session/writeorder.go | `CheckSessionFieldCoverage` | covered | — | pass (unchanged) |
| internal/store/migrations/0012_claude_dir.sql | 0011_turn_state.sql | n/a | — | pass (unchanged) |
| internal/store/session.go | — | n/a | — | pass (unchanged) |
| web/src/protocol/session.ts | in-file parsers | n/a | — | pass (unchanged) |
| web/src/render/mainhead.ts | render/tiles.ts, index.html `.meta` | covered | — | pass (unchanged) |
| web/src/render/repolines.ts | render/context.ts | yes | — | pass (unchanged) |
| web/src/render/sessions.ts | render/context.ts | covered | — | pass (unchanged) |
| web/src/render/tiles.ts | render/sessions.ts | covered | — | pass (unchanged) |
| web/src/sessions/card.ts | sessions/paths.ts | yes | — | pass (unchanged) |
| web/src/style.css | shared `↳` rule (`:2248-2266`), `.mainhead .name` (`:651`), `--block-floor` precedent | yes (web-implementation.md:134-135, the custom-property owners and the title-first priority) | — | pass. Cycle 3 Minor 1 is fixed (see Delta) |

## Delta

| Prior item | Fix commit | Verified how |
|------------|-----------|--------------|
| Cycle 3 Minor 1: three pairs of hand-copied lengths in the Focus header's give-way layout | `061f424` | `rg -n "2\.75ch\|1\.35\b\|2\.7em\|1\.875ch\|8ch\|--floor\|--sep-gap\|--loc-lh\|--loc-h\|--lead-gap\|--block-floor" web/src/style.css` shows each length declared once: `--floor: 8ch`, `--sep-gap: 2.75ch`, `--loc-lh: 1.35` and `--loc-h: calc(2em * var(--loc-lh))` on `.mainhead .meta` (`:732-735`), and `--lead-gap: 5px` in the shared `↳` rule (`:2250`). Each use reads the variable: `.loc` `height`/`line-height` (`:764`, `:767`), `.loc::before` `height` (`:774`), the blocks' `margin-right` (`:787`), `--block-floor` (`:791`, `:797`), `.sep` `left: calc((var(--sep-gap) + 1ch) / -2)` (`:822`) and `.lead` `padding-right` (`:2264`). No literal `2.75ch`, `2.7em`, `1.875ch` or `8ch` is left, and the header's `5px` gap is gone. The one remaining `line-height: 1.35` (`:2865`) belongs to the picker's recent-row button, an unrelated rule. The derived values match the old literals: `2em × 1.35 = 2.7em`, and `-(2.75ch + 1ch)/2 = -1.875ch`. |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** `--loc-h` is declared on `.meta` but uses `em`. The variable is substituted at its use sites, so the `em` resolves against `.loc`'s font size, as the old `2.7em` literal did. If someone later sets a different font size on `.meta` and `.loc`, the clip height will follow `.loc`, which is the right behaviour.
2. **[note]** The grid track `minmax(calc(var(--floor) + var(--sep-gap)), max-content)` (`style.css:737`) is a new consumer of the shared lengths. It derives from the same owners, so it adds no new pair that must be kept equal by hand.
3. **[note]** Cycle 3 Note 2 is resolved: the shared `↳` rule's comment (`:2242-2247`) now lists what the header adds, including floor, margin and line height. Cycle 2 Notes 1 to 4, carried in cycle 3 Note 3, still apply as written: `resolvePath` and `resolveTranscriptDir` are two copies (an orchestrator follow-up), `checkoutState` lives in `launcher.go`, `isDir` is checked twice, and each host has its own ellipsis rule. None of the files they cite changed in this cycle.
4. **[note]** Swapping which item gets free space first (`.name` now grows at 1000 and `.meta` at 1, `:667`, `:739`) is a change of behaviour, not of shape. Whether it matches the wrap ADR is for `review-work` and `review-browser` to judge.
