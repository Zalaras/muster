# Browser review: claude-tmp-files

**Plan**: claude-tmp-files
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 12898 words (budget 30000)
**Rig**: `make web-build build` at 161961cb; scratch daemons from `web/e2e/helpers/fixtures.ts` (data dir `TMPDIR/muster e2e-<id>-*`, space-bearing; private `-tmux-socket` inside it, killed and removed at teardown); stub `claude` (`helpers/daemon.ts`, `2.0.0-e2e-stub`); headless Chromium 1280x720 via a throwaway spec (7 tests, run in the foreground, spec deleted, `git status` shows nothing of this reviewer).

Gates log read, not re-run: 2 red lines, `03-lint` (testifylint in `test/canary/resume_test.go:240`) and `09-web-lint` (biome format in `web/src/api/reader.test.ts`). Neither is the shipped bundle; `04-web-build` and `21-e2e` (272 passed) are green, so the app driven is the one that ships. The red lines are review-work territory.

Scenario used for "data": live session with a plan (transcript-located) and a scratchpad holding `findings.md` (3 min old), `notes/options.md` (2 h), a long nested `.md` (2 d), plus `data.json`, `.hidden/secret.md` and a sibling `tasks/x.output` that must not list.

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-4/D5 | API | data | listing holds exactly the 3 `.md`, newest first; json, dot-dir, `tasks/` absent | pass | reader listing scratch.files = findings.md 12:22, notes/options.md 10:25, long one 11-10 |
| REQ-7 | focus | data | summary row folded, `claude` + `plan` + `3 tmp`, no rows in DOM | pass | aria-expanded false; text `claude plan 3 tmp`; chips opacity 1, display block; plan-slot and scratch-rows children 0 |
| REQ-7 | focus | data | summary row placed inside nav | pass | sum box x 1045 w 235 (right 1280) y 127 inside nav 1044-1280 x 127-720 |
| REQ-7 | focus | no data yet | listing in flight: `claude` + plan chip from session, no tmp chip; unfolded loading row | pass | held listing: chips [`no plan` off, opacity 0.45]; rows `.f.none`, `.f.scratch-loading` |
| REQ-7 | focus | nothing from Claude | `claude [no plan]`, unfolded `no plan yet` only | pass | chips [`no plan`]; rows [`.f.none`] after release |
| REQ-7/INV-3 | tiles 2x2 | data | chips agree with rows | pass | `plan`, `3 tmp`; plan row + 3 scratch rows |
| REQ-7/INV-3 | tiles 3x2 | data | chips agree with rows | pass | same; sum box 236-425 inside nav 235-425 |
| REQ-7/INV-3 | pop-out | data | chips agree with rows | pass | `plan`, `3 tmp`; sum box y 30 inside region 0-720 |
| REQ-8 | focus | data | pointer click toggles | pass | aria-expanded false to true via click |
| REQ-8 | focus | data | keyboard Enter/Space toggle and keep focus | pass | Enter: true, Space: false, Space: true; activeElement same node after 1.2 s, connected |
| REQ-8 | focus | data | fold remembered per session, folded by default | pass | `muster.reader.1` holds `claudeFolded:false` beside filesFolded/outlineFolded; reload: expanded true; toggle + reload: false |
| REQ-8 | pop-out | data | fold shared live with the dashboard | pass | toggled in dashboard; pop-out aria-expanded true 1.5 s later |
| REQ-9 | focus | data | plan row then scratch rows in listing order; `tmp` badge first, path, age last | pass | kids `badge scratch:tmp`, `nm:findings.md`, `when:3m ago`; order findings, options, long = API order |
| REQ-9 | focus | data | ages from the later of mtime and docChanged | pass | rows read `3m ago`, `2h ago`, `2d ago` for mtimes -3 min / -2 h / -2 d; a file just written reads `now` |
| REQ-9/edge 16 | tiles 3x2 | data | long nested path ellipsized, no horizontal scroll | pass | `.nm` scrollWidth 409 > clientWidth 88, text-overflow ellipsis; nav sw 189 = cw 189; title = absolute path |
| REQ-9 | tiles 2x2, focus | data | unfolded section leaves Files and Outline reachable | FAIL | 2x2 tile, 3 scratch rows: outline clientHeight 0 of scrollHeight 21; focus, 30 scratch rows: tree 0/252, outline 0/441, a tree row 0 of 21 px visible (Major 1) |
| REQ-10 | focus | data | open scratch row: docbar `tmp` badge + absolute path; aria-current on that row only | pass | badge `tmp` dashed border, color rgb(178,182,195), not `--teal` #56c5d0; bar path absolute; aria-current on findings only |
| REQ-10 | tiles 2x2, 3x2 | data | docbar badge in compact host | pass | badge box 14-48 inside docbar 2-638 / 2-425; docbar sw = cw |
| REQ-10 | pop-out | data | open scratch row in pop-out | pass | bar `tmp findings.md <abs>`; aria-current on findings |
| REQ-10 | focus | data | dirty dot as tree files | pass | an unopened scratch file written by hook shows `.dot`; the open file none |
| REQ-11 | focus | data | docChanged for an unlisted scratch path re-fetches silently | pass | chip 3 to 4, new row on top; exactly 1 listing request; MutationObserver saw no loading row; body text unchanged |
| REQ-11 | focus | data | keyboard focus kept on a row while the re-fetch inserts above it | pass | focused `notes/options.md` row; same node 1.2 s after the insert |
| REQ-11/edge 14 | focus | data | a write to a listed path (and the sessionUpsert it causes) does not re-fetch | pass | 0 listing requests in 1.5 s after a second Write of the same file |
| REQ-11 | focus | late data | a first scratchpadDir arriving after the listing landed re-fetches | pass | docs opened before SessionStart; hook: chip `1 tmp`, row `late.md` |
| REQ-11 | pop-out | data | pop-out re-fetches on a new scratch write | pass | pop-out chip 3 to 4 |
| REQ-11/E3 | focus | data | `/clear` moves the folder: tmp chip gone, open file stays with `tmp` badge | pass | chips [`plan`]; rows [plan]; docbar still `tmp findings.md`, body unchanged |
| REQ-12 | focus | ended | section present, plan openable | pass | sum box inside nav after end; plan row present |
| REQ-12 | tiles 2x2 | ended | section present with scratch rows, openable | pass | ended tile, docs: `plan 3 tmp`, 4 rows; findings opens with `tmp` badge |
| REQ-12/edge 7 | focus | ended + daemon restart | section survives restart, plan opens | pass | after restart + reload: `claude plan`, plan opens (bar path = plan file) |
| REQ-12 | pop-out | ended | | N/A - not separately driven (Note 2) | |
| REQ-13 | focus, tiles, pop-out | data | plan row shows its age | pass | plan row `when:now` (plan written at setup) in every host |
| daemon down | focus | daemon-down | surfaced loudly; rows stay as last rendered | pass | `#banner` display block, unreachable text with the pane-noise sentence; reader notice `musterd unreachable - showing last render`; chips and 5 rows unchanged |
| daemon down | pop-out | daemon-down | status line names it; rows stay | pass | notice `musterd unreachable - showing last render`, display block; chips `plan 4 tmp` unchanged |
| daemon down | tiles | daemon-down | | N/A - not separately driven (Note 2) | |
| hidden | all | all | nothing relies on `[hidden]` against an author display rule | pass | tmp chip removed, not hidden, at 0; nothing sets `hidden` on the plan slot any more |
| V2 | focus | data | summary row, chips, badge, ages match `opt-b-summary.html` | pass (instrument) | computed styles match `mockup.css` new (B) rules; teal replaced by dashed neutral per kb:adr/reader-scratch-badge-neutral-not-teal |
| design-system 6 | all | all | no 0% track, cost, Done or unaged stale state | pass | every row carries its age; no gauge or cost added |
| design-system 7 | all | all | | N/A - plan adds no terminal surface | |

## Issues

### Critical

### Major
1. **[web-impl]** An unfolded claude section takes its full content height and starves the Files tree and the Outline to zero height, so their rows cannot be reached. In a default 2x2 tile with only 3 scratch files the Outline measures clientHeight 0 against scrollHeight 21; in Focus with 30 scratch files the tree measures 0/252 and the Outline 0/441, and scrolling the 6th file row into view leaves it 0 of 21 px visible inside `.tree` (the nav itself scrolls, 876 vs 593, but that only moves the zero-height boxes). Folded, the same tile gives the tree 16 px and the Outline 40 px. The plan slot and `.scratch-rows` sit in `.rnav` as non-shrinking content while `.tree`/`.outline` shrink with no floor (kb:adr/reader-nav-sections-shrink-without-floor) and have nothing left. `web/src/style.css` (`.rnav` section rules), `web/index.html` / `web/doc.html` (`scratch-rows`). A fix must make true: with the section unfolded in every host (Focus, 2x2, 3x2, pop-out) and any number of scratch files, the Files tree and the Outline each keep a non-zero box whose rows can be scrolled into view, and the scratch rows scroll inside their own share. R5 measured only horizontal fit, so no committed test could have failed for this (kb:lesson/surface-never-measured-against-its-host).
   id: web/src/style.css:.rnav .scratch-rows:starves files and outline | confidence: 95

### Minor

### Notes
1. **[note]** Ages render as `ageAgo` output (`3m ago`, `2h ago`, `2d ago`, `now`), as REQ-9 names; the plan Testable UI Elements table and mockup B show bare `2m`/`1h`/`2d`. The plan disagrees with itself (review-work territory). In a 3x2 tile the suffix costs the path about 30 px.
2. **[note]** Not measured: edge case 13 (docChanged while the listing is in flight, no double fetch) - the race cannot be staged reliably from the browser and is W3 unit coverage. Daemon-down in a tile and the ended pop-out were not separately driven; both run the same `ReaderInstance` and notice as the measured Focus and pop-out cells.
3. **[note]** V2 checked in the instrument theme only; dark and light rest on the design tokens the new rules use and the gates `10-contrast` line (54 pairs, 0 failures in each theme).
4. **[note]** Gate lines `03-lint` and `09-web-lint` are red (testifylint in `test/canary/resume_test.go`, biome format in `web/src/api/reader.test.ts`); review-work owns them.

