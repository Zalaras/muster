# Browser review: Resume and Dangerously Allow

**Plan**: resume-and-dangerously-allow
**Verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 26542 words (budget 20000) — WARN exceeds budget
**Rig**: `make web-build build` at 84bdf43 (HEAD; the code is unchanged since 4500836). Per-test scratch daemons came from `helpers/fixtures.ts`: data dir `$TMPDIR/muster e2e-XXXX` (the path has a space), a `-S` tmux socket inside it, a scratch `-claude-projects-dir`, and the stub `claude` at `$TMPDIR/muster e2e-stub-cd75a542396fd84f/claude`. Driven in headless Chromium at 1280×800 by one throwaway spec, `web/e2e/zz-browser-probe.spec.ts`, under `bin/gatelock run --exclusive`. The spec is deleted. Fixture teardown killed every daemon and tmux server: `pgrep` finds no `musterd` or `tmux -S`. `git status --porcelain` shows only the other reviewers' part files.

Gates log (`gates-…-c3`): `e2e` passed 497 and `web-build` is green, so I drove the app that will ship. `check-kb` and `features-scope` are red; both are known and accepted.

Scope for this cycle: the two changes since cycle 2 are 3f45762 (the `PastRowView` type moved into `render/launchpast.ts`, type-only) and 4500836 (a default 500 arm in `GET /api/past-sessions`, plus comment changes). I re-measured the Resume tab's rows, chips, footer and selection end to end. I also re-measured the chip in the resumed session's hosts, the list's error states and daemon-down. Cells outside the Resume tab that cycle 2 passed on code that has not changed since are carried forward, not re-driven (Note 2).

## Matrix

Hosts: **dialog** (the launch modal's Resume tab), **focus** (rail card and mainhead), **tiles** (tile `.thead`). No pop-out host exists for this plan.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-8 / REQ-9 | dialog | 5 transcripts, one bound to an alive session | rows newest first, head count | pass | head `Claude sessions in probe-rows-… · 5`. Row order matches `lastActiveAt`: plain 1m, bypass 1h, open 2h, untitled 1d, dontAsk 2d. `/api/past-sessions` returns the same order |
| REQ-9 | dialog | row bound elsewhere | disabled, reads `open in Muster` | pass | `sess-open` is `disabled` with no `aria-pressed`, text `Open one2hopen in Muster`, `.lp` rgb(166,171,188). API `openSessionId:1` |
| REQ-9 / default selection | dialog | data | first enabled row selected | pass | `sess-plain` `aria-pressed=true`, others `false` |
| REQ-11 | dialog | bypass row, 112-char title | chip inside the row, title ellipsises | pass | chip 910,475–963,488 inside row 281,467–999,508. `.t` 293–904, sw 800 > cw 611. Chip `display:block`, opacity 1, visible, bg rgb(194,70,70), fg white |
| REQ-11 | dialog | non-bypass rows (`acceptEdits`, none, `dontAsk`) | no chip | pass | `.chip-danger` absent on all four rows |
| REQ-11 / INV-2 | dialog | bypass row selected by pointer | danger face, one line | pass | `Resume without checks`, `btn key-danger`, box 817,633–983,658 (166×25). `#launch-target` sw 1456 > cw 439 (ellipsised). Footer 281,621–999,670, horizontally inside the dialog's 280–1000 column. I measured the dialog's height on the New tab only (Note 3) |
| REQ-11 | dialog | non-bypass row selected | ordinary face | pass | `Resume`, `btn key`, 918–983 (plain, untitled and dontAsk rows alike) |
| REQ-2 | dialog | Resume tab, bypass row | New tab's bypass warning not shown | pass | `#bypass-warning` `display:none` in every footer read |
| edge 3 | dialog | untitled row selected | footer `(untitled)` | pass | `Resume (untitled) in <path>` |
| cycle-1 Major 1 | dialog | filter matches nothing | footer shows no target | pass | list `No sessions match`, footer `Resume —`, button disabled |
| cycle-1 Major 1 | dialog | selected row filtered out | deselected | pass | bypass selected, then `Plain` typed: one row, `aria-pressed=false`, footer `Resume —`, disabled |
| REQ-14 | dialog | typing in the filter by keys | keeps focus | pass | activeElement is `past-filter` 1.2 s after typing `zzzz` |
| cycle-1 Major 3 | dialog | keyboard selection (Space) | focus stays on the row | pass | filter, Tab ×2 → `sess-byp`, Space. After 1.2 s activeElement is still `sess-byp`, which is pressed, and the footer switched to the danger face. The next Tab goes to `sess-untitled` (it skips the disabled `sess-open`) |
| cycle-1 Major 3 | dialog | keyboard selection (Enter) | same | pass | Enter on `sess-untitled`: after 1.2 s focus is still there, footer `Resume (untitled) …` |
| REQ-10 / REQ-12 | focus | Resume clicked on the bypass row | argv | pass | pane start command `"…/muster e2e-stub-…/claude" --resume sess-byp --permission-mode bypassPermissions`. `/api/state`: id 2, alive, `permissionMode {bypassPermissions, seed}` |
| INV-4 | dialog | that resume still pending (alive, not bound) | row holds the id | pass | `claudeSessionId:null` in state. Reopened list: `sess-byp` disabled, `…bypass1hopen in Muster`. Default selection skips it (`Plain newest`) |
| REQ-9 | dialog | after `SessionStart{source:"resume"}` binds it | still disabled | pass | state `claudeSessionId:"sess-byp"`, API `openSessionId:2`, row disabled |
| REQ-4 | focus rail card | resumed bypass session | chip | pass | chip 14,277–67,290 inside card 0,210–299,387, `display:inline`, opacity 1. The bystander (`default`) card chip is `display:none` |
| REQ-4 | focus mainhead | same | chip | pass | chip 688,77–740,90 inside mainhead 300,46–1280,122, `display:block` |
| REQ-10 / decision displayName | focus mainhead | resumed, model recorded | model shown | pass | `.meta` `probe-rows-… · claude-opus-4-1-20250805` |
| REQ-4 | tiles `.thead` | same | chip | pass | chip 1018,95–1071,108 inside `.thead` 642,86–1278,117, `display:block` |
| REQ-8 / truncated | dialog | 205 transcripts | 200 rows reachable, truncation line | pass | head `· 200`. `#past-list` `overflow-y:auto`, sh 8256 > ch 231. Wheel scrollTop → 8024. `.trunc` `Showing the newest 200` at 595–628, inside the list 408–639. Clicking `Row 199` presses it; footer `Resume Row 199 in …` |
| edge 7 / E8 | dialog | transcript deleted between list and POST | 404 message, then refetch | pass | `#launch-error` `display:block`, `no Claude Code session with that id in this directory`. After the refetch there are 200 rows, the first is `Row 1` (the deleted `Row 0` is gone) |
| States: fetch failed (404 dir) | dialog | directory removed, tab re-entered | error line, disabled | pass | `Couldn't read sessions — try again`. Head has no count. Footer `Resume —`, disabled. `#launch-error` `display:none` |
| 4500836 default 500 arm | API | a validation error that is neither sentinel | 500 `internal_error` | N/A: unreachable | `validateLaunchDirectory` returns only `errLaunchDirNotAbsolute` or `errLaunchDirNotFound`. The two arms still hold: relative and empty → 400 `invalid_request`, a missing path → 404 `not_found` |
| States: daemon-down | dialog | Resume re-entered after SIGTERM | error line, disabled | pass | `Couldn't read sessions — try again`, footer `Resume —`, disabled |
| States: daemon-down | dialog / page | — | surfaced prominently | pass | `#banner` `display:block` at 0,46–1280,78: `musterd unreachable — hook output in open panes is Muster's absence, not session failure.` |
| States: daemon-down | dialog | list showing, no refetch | stale rows | note | 200 rows and an enabled `Resume` stay until the tab is re-entered (carried from cycle 1; Note 4) |
| States: no data | dialog | directory with no transcripts | empty line | pass (cycle 2, unchanged path) | not re-driven; `renderPastList` is untouched except for its parameter type |
| REQ-1/2/3/5/7, REQ-13, §7 | dialog / focus / tiles | — | New tab, bypass warning, trust note, tabs, terminal rules | pass (cycle 2, carried) | no web code outside the `PastRowView` type moved since cycle 2 (Note 2) |

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** The two changes since cycle 2 have no visible effect. 3f45762 is type-only: the rows, chips, the footer and selection by pointer and by keyboard all measure as they did in cycle 2. 4500836's new default arm cannot be reached through the running app, since `validateLaunchDirectory` returns only the two sentinel errors. It is a defensive arm, and the 400 and 404 arms beside it still hold.
2. **[note]** Carried forward rather than re-driven, because the code under them has not changed since cycle 2's pass:
   - the New tab (the bypass segment, its warning, the `auto` restore);
   - tab keyboard navigation and the dialog's accessible name;
   - the trust-prompt note;
   - the latch-follows-mode chip rows;
   - `dontAsk` resumed verbatim;
   - `already_open` / `not_resumable` from the mainhead Resume.

   The strip-card chip and the light theme stay unmeasured, as in cycle 2 Note 5.
3. **[note]** The dialog changes height with the list's content. The footer's Resume button sits at y 633 with 5 rows, 564 with `No sessions match` or the error line, and 652 with 200 rows. So the primary button moves under the pointer when a filter keystroke empties the list. I measured the dialog box only on the New tab (280,136–1000,664), so the Resume tab's vertical containment rests on cycle 2's measurement. Horizontally, the footer stays inside 281–999 in every state. It is outside this plan's requirements, so no change is requested.
4. **[note]** Carried from cycles 1–2: when the daemon dies while the Resume list is showing, the stale rows and an enabled `Resume` stay until the tab is re-entered. The global banner is up, so the honesty rule holds.
5. **[note]** Carried from cycle 2 Note 2: a title with no break opportunity pushes the mainhead's actions off-screen. This is an existing layout defect and a backlog item.
