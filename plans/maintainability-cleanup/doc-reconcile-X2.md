# Doc Reconcile: maintainability-cleanup — Unit X2

**Mode**: ad-hoc (changed-file list: `git diff --name-only 47325f7..HEAD`, 42 commits)
**Verdict**: reconciled
**Scope derived**: the diff touches every one of the plan's 23 named features
(`kb pack --plan maintainability-cleanup --role doc-reconcile` lists exactly:
actions, canary, connection, drop, focus, ingest, issue, knowledge, launch, lifecycle,
rail, reader, release, rename, settings, shortcuts, surfaces, theme, tiles, triage,
update, usage, views — same set as `plan.md`'s `**Features**` header). `make check-kb`
passed with 0 problems / 426 records / 23 features before I touched anything, so no
file mapped outside the registry and no file mapped to nothing.

## Note on scope: docs/diagrams/

My role's boundaries normally exclude `docs/diagrams/` (a "record under `docs/diagrams/`
is not [yours]"). `plan.md` § X2 explicitly assigns `kb:diagram/web-components` and
`kb:diagram/daemon-components` to this unit, and the team lead's brief named both files
by path as items 1–2 of my scope. I followed that explicit, plan-scoped instruction and
edited both diagrams. Flagging this rather than silently overriding my own stated
boundary.

## Claims verified against code

| Area | Claim | Verified against | Action |
|---|---|---|---|
| daemon diagram | `internal/boundedwait` and `internal/keyedlock` are new leaf primitives, no internal imports | `go list -f '{{.ImportPath}} {{.Imports}}'` — both import only `context`/`sync`(+`zerolog` for boundedwait) | added nodes + edges |
| daemon diagram | `boundedwait.Wait` used by server's ingest queue, bgloop, updatemanager, and `session.Manager.Stop`'s liveness poll | `internal/server/bgloop.go:37`, `ingest.go:113`, `updatemanager.go:160`, `internal/session/liveness.go:32` | edge labels |
| daemon diagram | `keyedlock.Locks[K]` used by `session.Manager` (row lock) and server's shell/terminal registries | `internal/session/manager.go:122`, `internal/server/shells.go:59`, `internal/server/terminal.go:97` | edge labels |
| daemon diagram | `internal/evict` is a new package, `Oldest` used by server's issue-capture store and `internal/reader`'s `WriteLog`, because `internal/reader` must not import `internal/server` | `internal/server/issuecapture.go:49`, `internal/reader/writelog.go:39`; `daemon-implementation-D11.md` "Follow-up" section states the layering reason | added node + edges |
| daemon diagram | `internal/reader` is a new domain package (session's markdown scope/confinement/write-log), imports nothing from server/session/claudecode | `internal/reader/reader.go`, `internal/reader/writelog.go`, `internal/reader/CLAUDE.md`; import list shows only stdlib + `internal/evict` | added node under "Domain" boundary, not "Adapters" (it wraps no external system) |
| daemon diagram | port rename `Killer`→`TmuxSessions` | `grep -rn Killer internal/ docs/` — only test-double names (`fakeKiller`, `errKiller`) remain, no production or doc reference | no doc change needed (already correct) |
| web diagram | `protocol.ts`→`web/src/protocol/*` (8 files), `api.ts`→`web/src/api/*` (8 production files + 1 test fixture `testfakes.ts`), both no-barrel | `find web/src/protocol web/src/api -maxdepth 1 -name '*.ts' ! -name '*.test.ts'`; `web/src/api/testfakes.ts` is imported only from `*.test.ts` | updated node types, counts, prose |
| web diagram | new root modules `dragmime.ts` (shared DRAG_MIME const), `storage.ts` (localStorage seam), `wsapp.ts` (WS-to-app mapping, `coreWsHandlers`) | file headers of each; `main.ts`/`doc.ts` both import `wsapp.ts` | added nodes + edges |
| web diagram | `features/` now 22 files: 16 controllers registered by `main.ts` (unchanged count) + 6 DOM-free helpers each owned by one controller (`actionscopy`, `connectionrestore`, `connectionversion`, `launchcrumbs`, `launchrestore`, `updateview`) | `grep -n '^import' main.ts \| grep features/` = 16; each helper's own header comment cites `docs/conventions.md § Composition roots` and names its one caller | updated node label |
| web diagram | `render/` 28, `sessions/` 11, `terminal/` 8 (unchanged), `reader/` 10 (unchanged) | file counts per directory | updated counts |
| web diagram | `ConnectionStatus` moved from `render/masthead.ts` to `app.ts`; `render/masthead.ts` now imports it, cutting the old reader/app↔render cycle | `app.ts:24`, `render/masthead.ts:7` (`import type { ConnectionStatus } from "../app"`) | reversed `Rel(app, render, ...)` → `Rel(render, app, "status type")`; added `Rel(reader, app, "connection state")` for `reader/notice.ts:3` |
| web diagram | drag-MIME cycle (`terminal`↔`render`) resolved: both now import the new `dragmime.ts` leaf instead of `terminal` importing `render/dragreorder.ts` | `render/dragreorder.ts` and `terminal/pane.ts` both import `./dragmime`/`../dragmime` | replaced `Rel(terminal, render, "drag MIME")` with `Rel(render, dragmime, ...)` + `Rel(terminal, dragmime, ...)` |
| web diagram | segment-builder cycle (`render`↔`terminal`) resolved: the DOM half moved to `render/surfaceseg.ts`, which imports types from `terminal/surfaceswitch.ts` and `terminal/shellactivity.ts`; nothing in `terminal/` imports `render/` | `render/surfaceseg.ts:15-16` | kept one-directional `Rel(render, terminal, "segment types")`, no reverse edge |
| web diagram | full re-derived import graph (built by script from every non-test `.ts` file's relative imports, bucketed by directory) is acyclic | DFS cycle check over the derived edge set: 0 cycles found across 17 nodes | prose changed from "acyclic and strictly layered" (single line) to "acyclic but no longer a single line down" — `render/`, `terminal/`, `reader/`, `api/` all sit below `features/`, several bypass to `api/` directly |
| web diagram | "no feature imports another" still holds | grepped each of the 16 controllers' own imports for a sibling controller file — none found (only their own private DOM-free helper) | kept claim, unchanged |
| conventions.md | "the only two live suppressions are `protocol.ts`'s wire validators" | `rg biome-ignore web/src/protocol/*.ts` → exactly 2, in `session.ts` and `usage.ts` | fixed path reference (`protocol.ts` → `protocol/` + both filenames) |
| conventions.md § Testing | run-func seam text no longer names `claudecode`'s `execFunc` as a cross-package seam, matches the `adapter-run-seam-shape` decision (Option A, landed) | `docs/adr/process-adapter-run-seam-constructor-default.md` (accepted 2026-09-24); `grep -rn 'RunCommand\|RunModelCheck\|RunVersionProbe\|ExeRun'` finds no exported production symbol left, only test names | no change needed — already correct |
| feature specs / protocol.md | no body prose in any `docs/features/*/spec.md` or `docs/protocol.md` names `web/src/api.ts`, `web/src/protocol.ts`, `render/focusrestore`, `render/launchrestore`, `render/tiledrag`, `SessionKiller`, `RunCommand`, `RunModelCheck`, `RunVersionProbe`, `ExeRun`, `requireTemplate`, `formatEndedAge(o)`, `readThemeHint`, `evictOldest`, `writeLog`, `readerPathQualifies`, `walkMarkdown`, `gitFilesFunc`, `KindDeathHint`'s old protocol text | targeted `grep -rn` for each term across `docs/features/*/spec.md docs/protocol.md` — zero hits | no change needed (already reconciled by the units that made each change: D7b, D11, F3, W1–W6b) |
| feature specs frontmatter | `go:` globs for `internal/reader/**` (reader), `internal/evict/**` (issue), `internal/boundedwait/**`/`internal/keyedlock/**` (lifecycle) | `grep -n '^go:' docs/features/{reader,issue,lifecycle}/spec.md` | no change needed (D7b/D11 already added them) |
| directory CLAUDE.md | `internal/session`, `internal/server`, `internal/store`, `internal/reader`, `cmd/musterd`, `web/src/{render,features,sessions,terminal,reader}` Owns/Exemplar/Invariants/Gotchas | read each file in full against the current package contents (file lists, exemplar files, cited symbols) | no change needed — all already accurate; `internal/reader/CLAUDE.md` is new and correct |

## Contradictions

None.

## For the orchestrator

- `docs/adr/process-web-lint-format-biome.md:33` (accepted ADR, body prose) still says
  "Two `biome-ignore`s, both in `protocol.ts`" — its own `files:` frontmatter was already
  corrected to `web/src/protocol/usage.ts, web/src/protocol/session.ts`, but the body
  sentence wasn't. `docs/adr/` is outside my boundary; this needs an ADR-owning edit
  (or accept it as historical prose describing the decision's origin — the frontmatter
  is what `refs`/`check-kb` actually validate, and that's already correct).
- `TODO.md:77` ("I lost my session from yesterday", #47) cites
  `internal/session/manager.go:376-383` for the ownership classifier. D2 split
  `manager.go` from 1809 to 429 lines and moved `classifySessionsByOwnership` to
  `internal/session/reconcile.go`. The line reference is stale. `TODO.md` is the user's
  file; not editing it per my boundary.
- `TODO.md:203` ("Codebase maintainability cleanup" backlog entry, now superseded by
  this very plan) cites `web/src/protocol.ts 877 and api.ts 745` as the measured
  starting point. Both files are gone (split into `protocol/` and `api/` directories by
  W2/W3). This is a historical measurement inside a backlog entry describing why the
  plan was filed, not a claim about current state — flagging for awareness, not
  necessarily something to fix, since the entry is about to be ticked into
  `docs/history/todo-done.md` once this plan lands.
- No feature-set widening: every changed file mapped to one of the plan's 23 named
  features; `check-kb` was already green (0 problems) before I started.

## Checks

```
$ make gen-kb
go run ./tools/kb gen
kb: all generated files fresh

$ make check-kb
go run ./tools/kb check
kb: 426 records, 23 features, 0 problem(s)
kb: all checks pass

$ make refs
python3 .claude/skills/orchestrate/scripts/dead-refs.py --all
dead-refs: 3126 references checked, 0 missing
```

Word counts of every record I touched (all are `type: diagram`, budget 300 words of
prose outside the mermaid fence — mermaid fence content doesn't count per
`internal/kb/mermaid.go`'s `wordsOutsideMermaid`):

- `docs/diagrams/daemon-components.md`: 300 words prose (was 189)
- `docs/diagrams/web-components.md`: 298 words prose (was 186)

`docs/conventions.md` has no frontmatter/budget (plain rules doc, not a kb record).

## Files touched

- `docs/diagrams/daemon-components.md`
- `docs/diagrams/web-components.md`
- `docs/conventions.md`

No `git add`/commit performed, per the team lead's instruction.
