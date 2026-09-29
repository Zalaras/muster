# Browser review: Resume and Dangerously Allow

**Plan**: resume-and-dangerously-allow
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 26542 words (budget 20000) — WARN exceeds budget
**Rig**: `make web-build build` at 173a55f. Per-test scratch daemons came from `helpers/fixtures.ts`: data dir `$TMPDIR/muster e2e-XXXX` (the path has a space), a `-S` tmux socket inside it, a scratch `-claude-projects-dir` inside it, and the stub `claude` at `$TMPDIR/muster e2e-stub-cd75a542396fd84f/claude`. Driven in headless Chromium at 1280×800 by one throwaway spec, `web/e2e/zz-browser-probe.spec.ts`, under the Playwright gatelock. The spec is deleted. Fixture teardown killed every daemon and tmux server: `pgrep` finds no musterd or `tmux -S`. `git status --porcelain` shows only the other reviewers' part files.

Gates log (`gates-…-c2`): `e2e` passed 497 and `web-build` is green, so I drove the app that will ship. `check-kb` and `features-scope` are red. Both are known and accepted.

## Matrix

Hosts: **focus** (rail card and mainhead), **tiles** (tile `.thead` and strip card), and **dialog** (the launch modal). No pop-out host exists for this plan: `/doc.html` belongs to the reader.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| cycle-1 Critical 1 / REQ-9 | dialog | a row resumed from the list, bound by `source:"resume"` | disabled, reads `open in Muster` | pass | `/api/past-sessions` returns `["sess-one",2]`. Row `disabled`, text `One fixture267dopen in Muster`, no `aria-pressed`. Default selection moved to the next enabled row, `X fixture` |
| cycle-1 Critical 1 / REQ-12 | dialog + API | the same row | second resume refused | pass | POST → `409 {"code":"already_open","id":2}` |
| cycle-1 Critical 1 / REQ-12 | focus mainhead | dead A holds `sess-x`; C was resumed from the list and bound `sess-x` via `resume` | A's Resume refused | pass | Click → `#action-error` `display:block` at 0,59–1280,91, text `that claude session is already open in Muster session 3`. `/api/state`: `[1,false,"sess-x"]`, `[3,true,"sess-x"]`, so only one row is alive |
| cycle-1 Critical 2 / INV-4 | dialog + API | pending resume (alive, not yet bound) | holds the id | pass | pending row `[1,true,null,"started"]`. `openSessionId` is 1. Row disabled, `.lp` reads `open in Muster` in `--disabled-fg` rgb(166,171,188). POST → `409 already_open id 1` |
| decision pending-resume-holds-id | dialog | the pending row's pane is killed | claim released on death | pass | row goes dead. `openSessionId` null, row enabled, footer `Resume Dup fixture in <path>` |
| decision pending-resume-holds-id | focus mainhead | dead A holds `sess-p`; the resume of `sess-p` from the list is still pending | A's Resume refused | pass | `#action-error` `display:block` `…open in Muster session 2`. A stays dead, one alive row |
| cycle-1 Major 1 | dialog | Resume, no match | footer shows no target | pass | `No sessions match`; footer `Resume —`, button disabled |
| cycle-1 Major 1 | dialog | the filter deselects the selected row | footer shows no target | pass | selected row filtered out: 1 row, `aria-pressed=false`, footer `Resume —`, button disabled |
| cycle-1 Major 1 | dialog | every row disabled | footer shows no target | pass | footer `Resume —`, button disabled |
| cycle-1 Major 1 / edge 3 | dialog | untitled row selected | `(untitled)` only then | pass | footer `Resume (untitled) in <path>`, `Resume` enabled |
| cycle-1 Major 2 / REQ-11 | dialog | bypass row with a 112-character title | chip inside the row | pass | chip 904,516–957,529 inside row 281,508–999,549. `.t` 293–898 ellipsises (sw 829 > cw 605). Chip `display:block`, opacity 1, bg rgb(194,70,70) |
| cycle-1 Major 3 | dialog | keyboard selection | focus stays on the chosen row | pass | Tab ×4 from the filter to row 4, then Space. After 1.2 s, activeElement is `sess-k4`, pressed. The next Tab goes to `sess-k5`. Enter behaves the same way |
| cycle-1 Minor 1 / decision null-model | focus mainhead | resumed, model null | reads `unknown` | pass | API `model:null`. `.meta` reads `probe-p6-… · unknown` |
| States: model unknown | focus card / tile | resumed, model null | — | N/A: the card and the tile carry no model field for any session | the card shows `ctx unknown`; no model word on any session's card |
| cycle-1 Minor 2 | dialog | 404 error, then a tab switch | `#launch-error` cleared | pass | `display:block` with the 404 message, then `display:none` after the New tab click |
| cycle-1 Minor 2 | dialog | 404 error, then a new row selection | cleared | pass | `display:none`, `hidden` set |
| edge 7 | dialog | transcript deleted | 404 shown, then refetch | pass | message shown. After the refetch the only row left is `Stay fixture` |
| cycle-1 Minor 3 | dialog | Resume bypass row with a 1,768-px-wide target path | one-line danger face | pass | `Resume without checks` box 817,562–983,587 (166×25). `#launch-target` 297–736 ellipsises (sw 1768 > cw 439). Everything is inside the footer 281–999 |
| cycle-1 Minor 3 / REQ-2 | dialog | New + bypass | one-line danger face | pass | `Launch without checks` 166×25, `btn key-danger`, bg rgb(194,70,70) |
| cycle-1 Minor 4 / REQ-7 | dialog | keyboard | arrow keys switch tabs | pass | New focused → ArrowRight: focus on `#launch-tab-resume`, `aria-selected=true`, `#past-sessions` `display:grid`. ArrowLeft: back to New, `.fields` `display:grid` |
| cycle-1 Minor 4 | dialog | — | accessible name exactly `New session` | pass | `getByRole('dialog',{name:'New session',exact:true})` count is 1. Aria snapshot `dialog "New session"` (the heading's own name, Note 4) |
| REQ-2 | dialog | New, not bypass | warning hidden | pass | `hidden`, `display:none` |
| REQ-2 | dialog | New + bypass by keyboard | warning shows, text exact | pass | ArrowRight from `auto` checks `bypassPermissions`. `display:block` at 297,582–983,624, inside the dialog 280,111–1000,689. textContent is the specified string exactly. `<b>` rgb(243,183,183) on rgb(58,30,30), the `--banner-*` pair |
| REQ-3 / INV-3 | dialog | directory whose last launch was bypass | opening the dialog restores `auto` | pass | `auto` checked, face `Launch`, warning `display:none`, target is that directory |
| REQ-3 / INV-3 | dialog | Recent click on that directory | `auto` | pass | `auto` checked |
| REQ-1 | focus | New + bypass launch | argv | pass | `… --model sonnet --name probe-bypass-new --permission-mode bypassPermissions` |
| REQ-4 | focus rail card | bypass launch, started | chip | pass | `display:inline` at 159,99–212,112 |
| REQ-4 | focus mainhead | bypass launch | chip | pass | `display:block` |
| REQ-4 | tiles `.thead` | bypass launch | chip | pass | chip 162,95–214,108 inside `.thead` 2,86–639,117 |
| REQ-4 | focus + tiles | resumed bypass session, long title | chip in each host | pass | card chip 14,134–67,147 inside `.r1` 14,94–288,147. Mainhead chip 1201,120–1254,133 inside mainhead 300–1280. Tile chip 307,95–360,108 inside `.thead` 2,86–639,117 |
| REQ-4 / INV-1 / edge 17 | focus + tiles | resumed bypass session; latch → default → bypass | chip follows the latch | pass | enveloped prompt with `default`: card `none`, mainhead `none`, tile `none`, mode `{default,hook}`. Back to bypass: tile chip `block` at 117,153–170,166 |
| REQ-4 | all | non-bypass session (`default`, `dontAsk`) | no chip | pass | chip `display:none` on the card and in the mainhead |
| REQ-4 | tiles strip card | — | chip | note | not re-measured this cycle (Note 5) |
| REQ-5 | focus rail card | bypass, first launch | combined note | pass | `first launch here — likely waiting on Claude Code's trust prompt, then its bypass warning`, both for a New launch and for a resume from the list |
| REQ-8 | dialog | Resume, 200 rows | list reachable | pass | `#past-list` `overflow-y:auto`, sh 8256 > ch 231. Wheel scrollTop → 8024. The last row can be clicked (pressed; scrollTop settles at 7969) |
| States: truncated | dialog | 205 transcripts | `Showing the newest 200` reachable | pass | 200 rows. `.trunc` at 595–628, inside the list 408–639 after the scroll |
| REQ-14 | dialog | typing in the filter | keeps focus | pass | typed by keys. activeElement is `#past-filter` 1.6 s later |
| REQ-10 | focus | resume a row with no mode | `default` | pass | `… --resume sess-nomodel --permission-mode default`, seed `{default}` |
| REQ-10 / decision any-mode-verbatim | dialog + focus | `dontAsk` row | passed verbatim | pass | face `Resume`, `btn key`, no row chip. argv `… --resume sess-dontask --permission-mode dontAsk`. Seed `{dontAsk,seed}`; the dashboard renders it with no chip and no error |
| REQ-10 / decision displayName | focus mainhead | resumed, model recorded | displayName = id | pass | API `{id:"claude-opus-4-1-20250805",displayName:same}`. Meta `… · claude-opus-4-1-20250805` |
| REQ-11 | dialog | non-bypass row | `Resume`, amber | pass | `btn key` |
| REQ-13 | focus / tiles | resume | opens like a launch | pass (cycle-1 measurement, path unchanged) | the rail card and tile each appeared for every resume in this run; not re-measured separately |
| States: daemon-down | dialog | Resume, re-entering the tab | error line, disabled | pass | `Couldn't read sessions — try again`, head has no count, button disabled, footer `Resume —` |
| States: daemon-down | dialog / focus / tiles | — | surfaced prominently | pass | `#banner` `display:block` 0,46–1280,78, `musterd unreachable — …`. Status `reconnecting…` in both Tiles and Focus |
| States: daemon-down | dialog | Resume list showing, no refetch | stale rows | note | rows stay and Resume stays enabled until the tab is re-entered (Note 3) |
| §7 | focus / tiles | — | one live client, scrollback 0 | N/A: this plan changes no terminal surface | — |

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** Measured again: every cycle-1 issue is fixed in the running app. That covers Criticals 1–2, Majors 1–3 and Minors 1–4, as the matrix rows prefixed `cycle-1` show.
2. **[note]** An existing mainhead layout defect that this plan's chip makes a little worse. For a title with no break opportunity, `.name` does not ellipsise (sw = cw = 875), so the mainhead's actions leave the viewport:
   - `.acts` measured 1495–1683 against a 1280 viewport with the chip, and 1457–1645 without it, so End, Resume and Remove are off-screen either way.
   - With the chip, `.meta` also crosses the mainhead edge: 1266–1307 against 1280. Without the chip it measured 1228–1269, just inside.
   - A title with spaces wraps and lays out correctly.

   Nothing in this plan changed the mainhead layout; its CSS diff adds only `.chip-danger`. This is a backlog item, not a change requested here.
3. **[note]** Carried from cycle 1: when the daemon dies while the Resume list is showing, the stale rows and an enabled `Resume` stay until the tab is re-entered. The global banner is up, so the honesty rule holds.
4. **[note]** The dialog's accessible name is now exactly `New session`. The `<h2>` heading's own accessible name is still `New session Session kind` (aria snapshot), because the tablist sits inside it. No change requested.
5. **[note]** Cells not measured this cycle:
   - The strip-card chip: eight sessions all stayed in the grid, so the strip never showed. The strip card uses the rail-card template, whose chip passes, and cycle 1 measured it directly.
   - The light theme: the contrast gate covers it.
   - The real Claude Code bypass warning: that is R3, the orchestrator's real verification.
6. **[note]** For `review-work`: a raw (non-enveloped) hook for a session bound through `SessionStart{source:"resume"}` is not routed to that session. A raw `UserPromptSubmit` carrying `permission_mode:"default"` left the mode at `{bypassPermissions, seed}`, while the same payload enveloped flipped it to `{default, hook}`. `Manager.Apply` writes the `byClaude` routing index only for `KindBind` and `KindClearRebind`, which is what `Resolve` reads. Real hooks are always enveloped (kb:adr/ingest-envelope-authoritative-binding), so only the canary and legacy raw paths are affected.
7. **[note]** The `not_resumable` message reads `that claude session is already open in Muster session N`: lowercase `claude`, where `already_open` says `Claude Code session`. It is a wording inconsistency the user sees in `#action-error`, and it belongs to `review-work` if it is worth a change.
8. **[note]** Carried from cycle 1: a session resumed from the list into a directory with no repo row reads `first launch here — likely waiting on Claude Code's trust prompt`, even though transcripts show Claude Code has run there before. This follows the contract.
