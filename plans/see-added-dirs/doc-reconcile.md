# Doc Reconcile: see-added-dirs

**Verdict**: reconciled
**Pack**: kb: pack 28322 words (budget 30000)
**Features derived**: focus, card-location (plan header: focus, card-location; touches: usage, lifecycle, connection, rail, groups, actions, tiles, launch)

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| card-location | addedDirs from status posts, launch dir removed, normalised (absolute, cleaned, symlink-resolved; relative against launch dir; nonexistent only cleaned) | `internal/session/addeddirs.go:normalizeAddedDirs` | added |
| card-location | empty until first post after launch/resume and on dead sessions; kept by /clear and restart | `internal/session/actions.go` (launch, resume clearAddedDirs), `liveness.go` (death), `store/migrations/0017_added_dirs.sql`, `store/session.go:encodeAddedDirs` | added |
| card-location | repo poll refreshes each dir's reading under its own deadline; unread/missing dir keeps last reading | `internal/server/reporefresh.go:readRepoState,readAddedRepos`, `session/repo.go:withAddedRepos` | added |
| card-location | worktree flag compares resolved paths | `internal/gitutil/gitutil.go:IsWorktree,resolveFrom` | added |
| card-location | Focus header is the only surface rendering addedDirs; summary gains added directories | `web/src/features/focus.ts`, `render/mainhead.ts`, `render/repolines.ts`; rail card and tiles do not read addedDirs for render | added |
| focus | folder line ends `+N` while dirs added (`muster+2`), ` /` while none | `web/src/render/repolines.ts:writeFolder`, `sessions/card.ts` (repoParts(session, addedCount === 0)) | added |
| focus | hovering readout opens location panel (location, Claude-at, added dirs with branch and path) | `web/src/render/locationpanel.ts`, `sessions/locationpanel.ts`, `features/focus.ts` attach on `.loc` | added |
| focus | panel follows focused session; closed with no session; no Added section when ended | `render/hovertip.ts:refresh`, `focus.ts` (refresh each render), `addedDirs` empty on dead | added |
| focus | panel lists every dir; moves to viewport top when it does not fit below | `render/anchored.ts:placeAnchored` (flip above, clamped to top edge) | added |
| focus | readout hover text and name+readout hover sentence | `render/mainhead.ts` (name title only) | deleted/replaced |

## Contradictions
None

## For the orchestrator
- [orchestrator] The delta amendments for design-system, store-schema, web-components and render CLAUDE.md were skipped as instructed. `docs/protocol.md` already carries `addedDirs` (the plan's own edit); nothing to change there.
- [orchestrator] `plans/see-added-dirs/proposed-backlog.md` is untracked and was left alone.
- No touched feature's behaviour changed beyond the plan's two features.

## Checks
```
kb: regenerated 6 file(s): .claude/rules/card-location.md, docs/INDEX.md, docs/features/card-location/INDEX.md, internal/server/CLAUDE.md, internal/session/CLAUDE.md, web/e2e/CLAUDE.md
kb: 613 records, 28 features, 0 problem(s)
kb: all checks pass
```
Word counts (whole file, frontmatter included): focus 804, card-location 675. Commits: 7f349ae0 (focus), 5a8bff93 (card-location plus regenerated files).
