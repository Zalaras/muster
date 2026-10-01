# Maintainability review: Stale dirs, models and branches

**Plan**: stale-dirs-models-branches
**Verdict**: needs-changes
**Cycle**: 5
**Pack**: kb: pack 42147 words (budget 20000)
**Scope**: 33 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`. This is a full cycle, because the spawn prompt did not ask for a delta. Since the cycle 4 review commit (`3a4a3a6`), `git diff 3a4a3a6..HEAD` over the same paths touches three files, all from fix commit `dfb8100`: `web/src/features/focus.ts` (+8 −1, new to the branch diff), `web/src/render/mainhead.ts` (+22) and `web/src/style.css` (+8 −4). I re-read those three diffs in full, with their siblings open. The other 30 files have not changed since cycle 4, so they keep their cycle 4 result.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/main.go | in-file flag siblings | n/a (one flag) | filelen 525, funlen `parseFlags` 48: reasons hold; funlen `run` 44: function untouched | pass (unchanged since cycle 4) |
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
| web/src/features/focus.ts | features/CLAUDE.md `init<Name>` shape, terminal/pane.ts (the other resize-driven refit), index.html `.main` | **no** (the new ResizeObserver seam) | — | Minor 1 |
| web/src/protocol/session.ts | in-file parsers | n/a | — | pass (unchanged) |
| web/src/render/mainhead.ts | render/reader.ts (the other layout-measuring builder, `:515-542`), render/CLAUDE.md render-state rule, render/tiles.ts | **no** (`fitMainheadMeta`); web-implementation.md:85 and :135 still say "CSS only, instead of a `ResizeObserver`" and "rather than a JS fit" | — | Minor 1 |
| web/src/render/repolines.ts | render/context.ts | yes | — | pass (unchanged) |
| web/src/render/sessions.ts | render/context.ts | covered | — | pass (unchanged) |
| web/src/render/tiles.ts | render/sessions.ts | covered | — | pass (unchanged) |
| web/src/sessions/card.ts | sessions/paths.ts | yes | — | pass (unchanged) |
| web/src/style.css | `.mainhead .meta` owner comment (`:727-733`), `.mainhead .name` (`:660-668`), the `--block-floor` precedent | covered for the custom-property owners; `--loc-cap` is documented in the owner comment (`:731-733`) | — | pass. The new variable is declared beside its siblings' owner comment, and that comment names its one writer |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[web-impl]** The cycle 4 fix adds a JS layout fit with no `design:` line, and two standing `design:` lines now describe the opposite choice. The fit is `fitMainheadMeta` (`web/src/render/mainhead.ts:62-80`), called last in `renderMainhead` (`:147-148`) and from a new `ResizeObserver` on the pane (`web/src/features/focus.ts:116-121`). It is the only `ResizeObserver` in `web/src`: `rg -n "ResizeObserver|getBoundingClientRect|offsetParent|getComputedStyle|style.setProperty|removeProperty" web/src --glob '!*.test.ts'` shows `features/focus.ts:120` as the only `ResizeObserver`, and `render/mainhead.ts:70-79` as the only render-pass writer of a custom property. The other layout measurers are `render/reader.ts:520-542` (scroll position) and `render/diagramdialog.ts:141`. Meanwhile `plans/stale-dirs-models-branches/web-implementation.md:85` says "the give-way is CSS only … instead of a `ResizeObserver`", and `:135` says "rather than a JS fit or a container query". Its known-limits bullet (`:137`) says "CSS has no `min(8ch, max-content)`" for the short-folder case, which `--loc-cap` now handles. This breaks question 7: the review asks that every new seam carry a `design:` line (conventions § Design). A newcomer reading Decisions would expect no JS fit, then find one. **A fix must make true**: Decisions carries one `design:` line for the fit. It names the problem CSS could not solve (a `↳` block that gives way whole leaves `.loc` holding unshown room, and the floor cannot follow a short folder line). It says why the observer watches the pane and not the header, and it cites the precedent check, for example `rg -n 'ResizeObserver' web/src` finding none. Lines `:85` and `:135` are marked superseded by it, and the `:137` limit is updated, so Decisions no longer contradicts the code. No code change is asked for.

### Notes

1. **[note]** The no-loop claim at `features/focus.ts:116-117` ("the pane's own size never depends on the header") holds. The observed node is `#mainhead`'s parent, `section.main` (`web/index.html:75`). `.main` is `flex: 1` in its row with `min-width: 0; min-height: 0` (`style.css:606-612`), so the header gaining a row does not resize it. The observer is never disconnected, which matches the controller's lifetime (it is created once in `initFocus`, like the `app.on` subscriptions beside it).
2. **[note]** The render-state rule holds (`web/src/render/CLAUDE.md`): `fitMainheadMeta` keeps no state across calls. It clears `--loc-cap` before every measurement (`mainhead.ts:70`), so the inline style is the element's own state, recomputed every time. One cost of shape: every `renderMainhead` pass now forces a synchronous layout (`removeProperty` followed by `getBoundingClientRect`). If the render pass ever measures in a second place, that cost is worth collapsing into one read phase.
3. **[note]** The `- 1` tolerance at `mainhead.ts:76` is an unnamed literal. Its sibling `render/reader.ts:515` names its own (`const TOP_TOLERANCE_PX = 24`). Naming it would be a small readability gain. This is not filed.
4. **[note]** `var(--loc-cap, 100vw)` inside the grid track's `min()` (`style.css:740`) uses `100vw` as a "no cap" sentinel. `max-width: var(--loc-cap, none)` (`:763`) uses `none`, because `min()` cannot take `none`. The two fallbacks differ for a stated reason, and the comment at `:731-733` covers both uses.
5. **[note]** For `review-work`: the doc-delta and the design-system §5 / focus spec wording on how the header gives way may need a sentence for the JS trim, now that the give-way is no longer CSS only. The doc-delta is out of scope here.
6. **[note]** Cycle 2 Notes 1 to 4 still apply as written (carried in cycle 4 Note 3): `resolvePath` and `resolveTranscriptDir` are two copies (an orchestrator follow-up), `checkoutState` lives in `launcher.go`, `isDir` is checked twice, and each host has its own ellipsis rule. None of the files they cite changed in this cycle.
