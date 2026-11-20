# Maintainability review: diff-viewer

**Plan**: diff-viewer
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 18935 words (budget 30000)
**Scope**: 40 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/gitdiff/gitdiff.go | internal/gitutil/gitutil.go, internal/commentpass/gitdiff.go, internal/locate/spotlight.go | yes | none | Major 1 |
| internal/gitdiff/tracked.go | internal/gitutil/gitutil.go, internal/commentpass/gitdiff.go | yes | none | note 2 |
| internal/gitdiff/untracked.go | internal/gitutil/gitutil.go | yes (runner only; ls-files not mentioned) | none | Major 1 |
| internal/server/diff.go | note.go, reader.go, shells.go, respond.go, usage.go | yes | none | pass |
| internal/server/diffreview.go | note.go, rename.go, rail.go, effort.go, groups.go, locate.go | yes | none | Minor 1 |
| internal/server/server.go | (composition root) | n/a | funlen `New` 55>40, pre-existing | pass (one-line registration) |
| internal/server/renderfix.go | renderfix_scenarios*.go | yes | filelen 574, reason holds | note 4 |
| internal/server/renderfix_normalise.go | renderfix.go | n/a (one line) | none | pass |
| internal/server/renderfix_scenarios_diff.go | renderfix_scenarios_notes.go, _shortcuts.go, _reader.go, renderfix.go | yes | none | note 3 |
| internal/server/renderfix_scenarios_shortcuts.go | renderfix_scenarios_rail.go, _usage.go | n/a | none | pass |
| internal/server/CLAUDE.md | generated trailer | n/a | none | pass |
| internal/session/diffreview.go | note.go, writeorder.go | yes | none | pass |
| internal/session/row.go | — | n/a (field mapping) | none | pass |
| internal/session/session.go | — | yes | none | pass |
| internal/session/writeorder.go | note.go | n/a | funlen `restoreChangedFields` 61>60, new on this branch | Minor 2 |
| internal/session/CLAUDE.md | generated trailer | n/a | none | pass |
| internal/store/session.go | migrations, row.go | n/a | funlen `UpdateSession`/`scanSession` 71, filelen 561, pre-existing | note 5 |
| internal/store/migrations/0021_diff_review.sql | 0019_restart.sql, 0020_scratchpad.sql | n/a | none | pass |
| web/src/api/diff.ts | api/reader.ts, api/http.ts | yes | none | pass |
| web/src/features/CLAUDE.md | generated trailer | n/a | none | pass |
| web/src/features/diff.ts | notes.ts, usage.ts, groupsselect.ts | yes | none | pass |
| web/src/features/diffbutton.ts | notesview.ts, render/diffbody.ts | yes | none | Minor 4 |
| web/src/features/diffcomments.ts | notesedit.ts, notessave.ts | yes | none | Minor 6 |
| web/src/features/diffmodel.ts | notesgeometry.ts | yes | none | Major 3 |
| web/src/features/diffplace.ts | notesgeometry.ts | yes | none | Minor 4 |
| web/src/features/diffreviewui.ts | notessave.ts | yes | none | Minor 6 |
| web/src/features/diffviewer.ts | notes.ts, reader.ts | yes | none | note 6 |
| web/src/features/diffviewerstate.ts | notespanelstate.ts | yes | none | Minor 6 |
| web/src/features/diffwords.ts | reader/ (find matcher) | yes | none | Major 3 |
| web/src/features/focus.ts | tiles.ts, notes.ts | no | none | Minor 5 |
| web/src/features/notes.ts | — | n/a | none | note 7 |
| web/src/main.ts | (composition root) | n/a | none | pass (one-line registration) |
| web/src/render/CLAUDE.md | generated trailer | n/a | none | pass |
| web/src/render/diffbody.ts | confirm.ts, notespanel.ts, readerfind.ts, masthead.ts | yes | none | Major 3, Minor 4 |
| web/src/render/diffchrome.ts | dom.ts, masthead.ts, notespanel.ts | yes | none | Major 2, Minor 3 |
| web/src/render/diffcomment.ts | confirm.ts, notespanel.ts | yes | none | Minor 3 |
| web/src/render/diffrows.ts | dom.ts, readerfind.ts | yes | none | Major 3 |
| web/src/render/diffside.ts | notespanel.ts | yes | none | pass |
| web/src/render/surfaceseg.ts | — | n/a (one helper) | none | pass |
| web/src/style.css | `.btn` (l.3192), `.seg-btn` (l.292) blocks | no | none | Minor 7 |

## Issues

### Critical

None.

### Major

1. **[daemon-impl]** `internal/gitdiff` runs the same git queries `internal/gitutil` already owns, with a second runner, instead of reusing or generalising them. Conventions § Design: "Reuse before add ... What it finds is reused or generalised, never copied, whatever Decisions says." The `design:` line names `gitutil.runGit` and gives its reason for a new runner (lock-free env, 30 s timeout). It does not mention that the same argv is also copied:
   ```
   internal/gitutil/gitutil.go:127:	out, err := g.run(ctx, dir, "git", "ls-files", "-co", "--exclude-standard", "-z")
   internal/gitdiff/untracked.go:21:	out, err := r.git(ctx, top, "ls-files", "-co", "--exclude-standard", "-z")
   internal/gitutil/gitutil.go:73:	out, err := g.run(ctx, dir, "git", "rev-parse", "--show-toplevel")
   internal/gitdiff/gitdiff.go:107:	out, err := r.run(ctx, dir, "git", "rev-parse", "--show-toplevel")
   internal/gitutil/gitutil.go:145:func runGit(ctx context.Context, dir, name string, args ...string) ([]byte, error) {
   internal/gitdiff/gitdiff.go:87:func runGit(ctx context.Context, dir, name string, args ...string) ([]byte, error) {
   ```
   `gitutil.ListFiles`'s own doc says it is "the one place that runs `git ls-files` at all, so a caller never carries its own git argv". `splitNul` (untracked.go:28) also repeats `listFiles`'s NUL split (gitutil.go:131–135). After the fix, the daemon must have exactly one git subprocess runner for a checkout, and each of `ls-files -co --exclude-standard -z` and `rev-parse --show-toplevel` must exist in one place. The lock-free env and the timeout can become an option of that one runner, or the diff reader can move under the package that owns it. The not-a-repo distinction (exit 128 → `ErrNotRepo`) must survive the move.
   id: internal/gitdiff/gitdiff.go:runGit:second git runner copies gitutil | confidence: 85

2. **[web-impl]** `writeText` (`web/src/render/diffchrome.ts:180`) is a byte-for-byte copy of `setText` in `web/src/dom.ts:42`. Conventions § Design: "Reuse before add".
   ```
   web/src/dom.ts:42:export function setText(el: HTMLElement, text: string): void {
   web/src/dom.ts:43:  if (el.textContent !== text) el.textContent = text;
   web/src/render/diffchrome.ts:180:export function writeText(node: HTMLElement, text: string): void {
   web/src/render/diffchrome.ts:181:  if (node.textContent !== text) node.textContent = text;
   ```
   `render/context.ts`, `render/notes.ts`, `render/repolines.ts` and `render/restartpanel.ts` import `setText` from `../dom`. The diff modules (`features/diff.ts`, `diffcomments.ts`, `diffreviewui.ts`, `diffviewer.ts`) import the copy, 15 call sites in all. After the fix, one helper exists and every diff module uses it.
   id: web/src/render/diffchrome.ts:writeText:copy of dom setText | confidence: 95

3. **[web-impl]** `render/` now imports from `features/`, which reverses the directory layering every other render module follows. `rg -n 'from "\.\./features/' web/src/render` returns only the new diff builders:
   ```
   web/src/render/diffbody.ts:2:import type { Change, Entry, FileModel } from "../features/diffmodel";
   web/src/render/diffrows.ts:1:import type { Entry } from "../features/diffmodel";
   web/src/render/diffrows.ts:2:import { entryLine } from "../features/diffmodel";
   web/src/render/diffrows.ts:3:import type { Seg } from "../features/diffwords";
   ```
   Conventions § Composition roots says `render/` holds the DOM half only and takes the computed value as a parameter. `web/src/render/CLAUDE.md` says "a builder takes the computed value, never the raw data". `kb:diagram/web-components` draws features above render and says the graph is acyclic. `features → render` (`diffviewer.ts:8–11`) plus `render → features` is now a directory cycle. After the fix, no module under `web/src/render/` imports from `web/src/features/`. The model and segment shapes the builders read must live where both directories may import them, or the builders must take render-owned inputs. `entryLine` (a decision) must be computed before the builder is called.
   id: web/src/render/diffrows.ts:imports:render imports features | confidence: 90

### Minor

1. **[daemon-impl]** The three diff review writes pass the request context straight into the manager: `internal/server/diffreview.go:68` `PutDiffComment(r.Context(), …)`, `:80` `DeleteDiffComment(r.Context(), …)` and `:101` `UpdateDiffTicks(r.Context(), …)`. Every sibling manager write wraps it: `note.go:57` `f.manager.SetNote(context.WithoutCancel(r.Context()), id, note)`, and the same in `rename.go:78`, `rail.go:53/85/126`, `effort.go:32` and `groups.go:139/181/225/251/275`. Conventions § Design: "Match the siblings". No `design:` line gives a reason. As written, a client that goes away mid-request cancels the persist, and the in-memory review is restored. Each sibling avoids exactly that. After the fix, the diff review writes follow the siblings' context rule, or a `design:` line says why they differ.
   id: internal/server/diffreview.go:handlePutComment:request ctx cancels persist | confidence: 85

2. **[daemon-impl]** This branch adds a `funlen` hit, `internal/session/writeorder.go:209 restoreChangedFields` (61 > 60), by adding the `DiffReview` restore line, and gives it no reason. The daemon log's `design: size:` line says "No funlen/dupl hit on touched files", which the gates' size log contradicts. The pre-existing hits on touched files (`server.go:138 New`, `store/session.go UpdateSession`/`scanSession`, `store/session.go` at 561 lines) are listed there too. Conventions § Design, "Size is read, not obeyed", and kb:adr/process-size-linters-warn-never-fail. After the fix, Decisions gives a reason for the new hit that holds: one restore line per field is a flat list, not interleaved concerns. Do not split the function only to silence the warning.
   id: internal/session/writeorder.go:restoreChangedFields:funlen hit no reason | confidence: 90

3. **[web-impl]** There are two private `button()` builders, `web/src/render/diffchrome.ts:33` `function button(text: string, className = "dv-btn"): HTMLButtonElement` and `web/src/render/diffcomment.ts:22` with the same signature. They differ only in the `aria-pressed` default. Conventions § Design: "Reuse before add". After the fix, one builder serves both.
   id: web/src/render/diffcomment.ts:button:duplicate button builder | confidence: 90

4. **[web-impl]** The diff modules compose the same display text in more than one place:
   - "+a −d": `features/diffbutton.ts:15` `countsText` and `render/diffbody.ts:42` `countsLabel`.
   - The minus sign: declared at `diffbutton.ts:4` `MINUS`, `diffbody.ts:36` `MINUS` and `diffrows.ts:16` `SIGNS.del`.
   - The singular or plural line label: `features/diffplace.ts:13` `lineLabel` and `features/diffcomments.ts:38` `headingFor` both branch on `lines.includes("–")`.

   Conventions § Design: "One owner per concept". `web/src/render/CLAUDE.md`: "a builder never composes a second copy". After the fix, each of these strings has one owner in `features/` that render takes as a value.
   id: web/src/render/diffbody.ts:countsLabel:counts text composed twice | confidence: 85

5. **[web-impl]** `features/focus.ts` gains a new seam, `FocusDeps.diff { viewerRoot, mounted, close }`, which lets the diff viewer take over the main slot. It also gains a new `ResizeObserver` on `#main-terminal-slot` that refits the selected surface (`focus.ts:164–169`). Neither has a `design:` line. Before this, the terminal refit only on the render pass (`focus.ts:267`). Question 7 and conventions § Design: "the shape is the implementer's, reported ... as a `design:` line per new type, module or seam". After the fix, `web-implementation.md` Decisions says why focus asks diff for the slot root, and why the refit moved onto a ResizeObserver, including what it reused or matched.
   id: web/src/features/focus.ts:FocusDeps.diff:seam without design line | confidence: 75

6. **[web-impl]** `ViewerState.comments` and `ViewerState.ticks` each have two writers: the write path in `diffcomments.ts`/`diffreviewui.ts`, and `load()`'s review read (`diffviewer.ts:134–139`). The ordering between them is guarded only for ticks, by `flushPending` before a load. Comment writes have no guard. Interleaving: Save on a new draft sends the PUT (`diffcomments.ts:165`). Before it answers, Refresh calls `load()`, whose `fetchDiffReview` is served after the PUT applied, so `s.comments` is replaced with a list that already holds the comment. Then the PUT's continuation runs `s.comments.push(comment)` (`:170`), and the comment renders twice until the next load. With Resolve instead (`write`, `:110–119`), `Object.assign(comment, patch)` mutates an object `load()` has already discarded. Consecutive tick flushes are not serialised either: `flush` (`diffreviewui.ts:94`) has no in-flight guard, so an add and a remove of one key can be in flight together. The windows are small on localhost, but they are real. Conventions § Design: "Shared state names its writers and its guard". After the fix, a load's review read can neither lose nor duplicate an in-flight comment write, and consecutive tick posts reach the daemon in the order they were made.
   id: web/src/features/diffcomments.ts:saveDraft:load overwrites in-flight write | confidence: 65

7. **[web-impl]** `web/src/style.css` adds a second button and segmented-control family, `.dv-btn`/`.dv-btn.primary` (l.5436–5454) and `.dv-seg`/`.dv-seg-btn`/`.dv-tab` (l.5412–5434). The existing families are `.btn`/`.btn.key` (l.3192, design-system §5) and `.seg-btn` (l.292, design-system §4.1). No `design:` line says why the viewer cannot use them. Conventions § Design: "Reuse before add", "Match the siblings". After the fix, the viewer's controls use `.btn`/`.seg-btn` with a `dv-` modifier for what really differs, or a `design:` line states the reason, for example a look from the accepted prototype.
   id: web/src/style.css:.dv-btn:second button family | confidence: 70

### Notes

1. **[note]** For `review-work` (DIAG): `kb:diagram/daemon-components` does not show the new `internal/gitdiff` package or the `server → gitdiff` edge (`docs/diagrams/daemon-components.md:64,94` show only `gitutil`). If Major 3 is not fixed, `kb:diagram/web-components` would also need the `render → features` edge.
2. **[note]** `internal/gitdiff/tracked.go:170 parseRanges`/`parseRange` and `internal/commentpass/gitdiff.go:26 hunkRE`/`startHunk` both parse `@@ -a,b +c,d @@`. `commentpass` is a dev tool that does not ship and needs less, so no change is asked.
3. **[note]** `renderfix_scenarios_diff.go:245 diffChangeKey` is a Go port of `features/diffmodel.ts:36 hash`/`changeKey`. The `design:` line states it and names the render test that catches drift, so the reason holds.
4. **[note]** `renderfix.go` is past 500 lines (574). The reason in Decisions (it was already 564 on main) holds. Its "564 → 579" figure is stale after the comment pass.
5. **[note]** The size log's test-file hits (`gitdiff_test.go:92 TestRead_TrackedChangeShapes`, `:269 TestRead_BranchScopeBases`, `server/diff_test.go:186 TestHandleDiffRead`) are `funlen`, not `dupl`. No test work is asked from this part.
6. **[note]** `features/diffviewer.ts:104,109` builds the error and loading nodes itself with render's `el`. It is a small DOM write in a controller, and folding it into the render builders would be tidier.
7. **[note]** `features/notes.ts:56` still names its element `sizenoteEl` although it now looks up `#sizerow`.
8. **[note]** `features/diffbutton.ts` also holds the viewer's summary line, change notice and error text (`summaryLine`, `whatChanged`, `diffErrorText`), so its name undersells it next to the `notes<concern>` siblings.
