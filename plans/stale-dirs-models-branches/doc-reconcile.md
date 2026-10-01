# Doc Reconcile: stale-dirs-models-branches

**Verdict**: reconciled
**Pack**: kb: pack 51754 words (budget 20000)
**Features derived**: lifecycle, card-location, ingest, rail, focus, tiles (also usage, launch, connection, actions by file ownership only) (plan header: lifecycle, ingest, usage, launch, connection, rail, focus, tiles, actions, card-location)

The earlier run was `blocked`: lifecycle could not hold its delta inside 800 words. The developer chose to split, and the plan's **Features** header now names `card-location`. The derived set sits inside the header. ingest, rail, focus and tiles were reconciled in b78bcd3, f8662d8, 374a2f5 and eacb74d and re-checked here against their specs and the code; card-location and lifecycle were reconciled in 913eb9a.

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------------------|--------|
| card-location | The card shows the launch directory for the row's lifetime; the shell, docs reader, file drop and resume use it | `internal/server/sessionwire.go` (`directory`), `web/src/sessions/card.ts:repoParts` (`session.repo`, `session.directory`) | added (new spec) |
| card-location | The repo poll re-reads branch and worktree flag at start, every `-repo-poll` (default 5 s) and on a nudge when Claude's reported directory changes; `-repo-poll 0` disables the timer | `internal/server/reporefresh.go:tick`, `internal/server/bgloop.go:runTicked`, `cmd/musterd/main.go:defaultRepoPoll` and the `-repo-poll` flag, `internal/server/server.go` (`OnClaudeDirChange` nudges) | added |
| card-location | Only alive sessions with an existing launch directory are read; a dead card keeps its last-known `repo` (its `claudeLocation` goes null on death); a gone directory keeps both | `reporefresh.go:tick` (`!t.Alive \|\| !isDir`), `readRepoState` (`ok`), `internal/session/liveness.go` (`sess.ClaudeLocation = nil` on death; `Branch` untouched) | added |
| card-location | A reading in flight when the session died is dropped whole, even if a resume lands first; the next tick reads afresh | `internal/session/repo.go:SetRepoState` (`repoEpoch` check), `internal/session/liveness.go` (`repoEpoch++`) | added |
| card-location | Git runs outside the manager's lock; an unchanged reading broadcasts nothing, a changed one is one `sessionUpsert` | `repo.go:SetRepoState` (equality early return, `persistWholeRowLocked`), `reporefresh.go:readRepoState` | added |
| card-location | Claude's directory is recorded from every main-agent hook's `cwd` and the status line's directory; subagent-marked events, `SubagentStart`/`SubagentStop` and empty values change nothing; `CwdChanged` stays unregistered | `internal/claudecode/interpret.go:mainAgentCwd`, `internal/claudecode/status.go:statusDir`, `internal/session/apply.go` and `status.go` (`adoptClaudeDir`), `internal/claudecode/settings.go` (no `CwdChanged`) | added |
| card-location | `claudeLocation` is non-null only while the recorded directory is a different checkout (top levels inside a checkout, paths outside; symlink-resolved); display-only; null on a dead session; launch and resume clear it | `internal/session/location.go:Elsewhere,clearClaudeLocation`, `reporefresh.go:deriveLocation,resolvePath`, `internal/session/actions.go:25,239`, `liveness.go` | added |
| card-location | A bind naming a different model sets its display name to the id until the status line confirms one; a bind naming the held id changes nothing | `internal/session/machine.go:applyBind` | added |
| lifecycle | Status posts also refresh Claude's recorded directory | `internal/session/status.go` (`adoptClaudeDir`), `docs/protocol.md` status-post bullet | edited (one sentence in `## Wire`, with a pointer to kb:spec/card-location); this is the only lifecycle body change |
| lifecycle | "Branch and worktree flag are recorded at launch and fixed" stopped being true | `grep -n "branch\|worktree\|immutable" docs/features/lifecycle/spec.md` finds no such sentence in the body | nothing to delete |
| lifecycle | Globs: `reporefresh*.go` and the two `card-location` e2e files move to card-location | `docs/features/*/spec.md` frontmatter | edited |
| ingest | Every main-agent hook's `cwd` and the status line's `workspace.current_dir` are read, inside `internal/claudecode` alone; `CwdChanged` stays unregistered | `internal/claudecode/interpret.go:mainAgentCwd`, `internal/claudecode/status.go:statusDir`, `internal/claudecode/settings.go:httpHookEvents` (no `CwdChanged`) | added (signals table row; the sequence diagram's `ApplyStatus` line now names the directory) |
| ingest | `ingest.go` is unchanged | `git diff main...HEAD --name-only` lists no `internal/server/ingest.go` | no spec change |
| rail | The repo line wraps at the `/`, folder over branch, each line truncated, one line in compact | `web/src/render/repolines.ts:renderRepoLines`, `web/src/style.css` (`.r2 .rf/.rb`, compact `.r2` flex block) | edited |
| rail | A `↳` block shows where Claude is when it works in another checkout | `web/src/render/sessions.ts:applyRepoBlocks`, `web/src/sessions/card.ts:claudeLocationParts` | added |
| rail | "then the repo and branch line" as one line | same files | deleted |
| focus | The meta's repo readout is folder over branch, capped (30ch and 44ch) | `web/src/style.css` (`.mainhead .meta .rf/.rb`) | edited |
| focus | `↳` shows a move; the repo readout and session name carry hover text | `web/src/render/mainhead.ts:renderMeta` (`loc.title`), `mainhead.ts` (`renameBtn.title`), `web/src/sessions/card.ts:locationHover` | added |
| focus | The model never truncates; the `↳` block hides whole first, then the title shortens, the repo block never hides; the mainhead wraps its surface switch and actions to a second row (a third in the narrowest windows) | `web/src/style.css` (`.mainhead` `flex-wrap`, `.mainhead .name`, `.mainhead .meta`); `review.browser.cycle5.md` measured 1300 to 740 px | added (the delta's "about 740 px" threshold is not in the CSS or a measured breakpoint, so the spec says "narrowest windows" without a number) |
| focus | "a meta line of repo and branch, model" as one line | same files | deleted |
| tiles | The tile header's repo readout carries hover text; a `↳` glyph marks a move | `web/src/render/tiles.ts` (`where.title = vm.hover`, `applyClaudeMarker`), `web/index.html` (`.wh-claude`) | added |
| protocol.md | `claudeLocation`, the refreshed `repo` comment, the `model` comment, the value-semantics bullets, the status-post row | `internal/server/sessionwire.go:toWireLocation`, `internal/session/location.go`, `machine.go:applyBind`, `liveness.go` (null on a dead session) | already present on the branch (commit 9fcbc11); each statement verified, no edit |
| protocol.md | `-repo-poll 0` disables the timer; the poll still runs at start and on a nudge | `internal/server/bgloop.go:runTicked`, `cmd/musterd/main.go` flag help | not in protocol.md (it says "start, every `-repo-poll`, and on a nudge"). That is true and not contradicted, and the delta says not to re-add it, so I left it and recorded the flag semantics in the card-location spec. |
| usage, launch, connection, actions | No doc change | — | none |

## Contradictions
None. Every claim above was located in code.

## For the orchestrator
- [orchestrator] `-repo-poll 0` (timer off, start read and nudge only) is recorded in the card-location spec, not in `docs/protocol.md`: the delta says protocol.md already states it, but its repo bullet reads "start, every `-repo-poll`, and on a nudge", which is true and not contradicted. It is a daemon flag, not wire shape, so I did not add it there.
- [orchestrator] card-location owns `internal/session/location*.go` and `repo*.go`, but lifecycle's `internal/session/**` glob still covers them: glob ownership may overlap (`rename` already sits inside it), and narrowing a `**` is not possible, so I left lifecycle's glob. `kb for` names both features on those files.
- [orchestrator] card-location lists the plan's proposed ADRs in `refs` (`lifecycle-card-shows-launch-directory-marks-claude-elsewhere`, `lifecycle-branch-refreshed-by-repo-poll`, `lifecycle-claude-location-from-main-agent-cwd`, `lifecycle-bind-model-display-name-is-id`). Their `features:` frontmatter still says `[lifecycle, ...]` and not card-location; ADRs are not mine, so flip them to `card-location` (and `accepted` at Completion) if you want them to match. The superseded `lifecycle-card-directory-follows-claude-cwd` is still `accepted` and still says the card follows Claude's directory; it flips with the others at Completion.
- [orchestrator] kb:adr/lifecycle-branch-refreshed-by-repo-poll says a dead session keeps `repo` and `claudeLocation`; the code nulls `claudeLocation` on death (`liveness.go`, protocol.md agrees). The spec follows the code. The ADR sentence is loose (an ADR, so not mine).
- [orchestrator] `docs/design/design-system.md` §5 "Focus mainhead" (not mine): web-implementation.md's doc-delta says its sentence "the `↳` block and then the repo block hide whole" is no longer true, because the repo block never hides. Check that it already says so.
- [orchestrator] `plans/stale-dirs-models-branches/proposed-backlog.md` is untracked and not mine. I left it.

## Checks
```
$ make gen-kb && make check-kb
go run ./tools/kb gen
kb: regenerated 9 file(s): .claude/rules/card-location.md, .claude/rules/lifecycle.md, docs/INDEX.md, docs/features/card-location/INDEX.md, docs/features/card-location/contract.md, docs/features/lifecycle/INDEX.md, internal/server/CLAUDE.md, internal/session/CLAUDE.md, web/e2e/CLAUDE.md
go run ./tools/kb check
kb: 493 records, 25 features, 0 problem(s)
kb: all checks pass
```
Body words (mermaid fences excluded, `check-kb` passing the 800 budget): card-location about 380 (new), lifecycle 798 (unchanged at 798: the Wire sentence gained two words and the budget has two to spare). ingest, rail, focus and tiles are as committed earlier.

Commits: `b78bcd3` ingest, `f8662d8` rail, `374a2f5` focus, `eacb74d` tiles, `913eb9a` card-location and lifecycle (one commit, since the regenerated files span both), plus a follow-up commit correcting card-location's dead-card sentence (a dead card's `claudeLocation` is null, as `liveness.go` and protocol.md say; kb:adr/lifecycle-branch-refreshed-by-repo-poll's "keeps them" is looser than the code, which is the source of truth).
