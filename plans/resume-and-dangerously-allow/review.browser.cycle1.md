# Browser review: Resume and Dangerously Allow

**Plan**: resume-and-dangerously-allow
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 26542 words (budget 20000) — WARN exceeds budget (rules 1455 · features 4297 · decisions 12682 · facts 7359 · lessons 741 · runbooks 2)
**Rig**: `make web-build build` at 04a9134 (under `bin/gatelock run --exclusive`); per-test scratch daemons from `helpers/fixtures.ts` (data dir `$TMPDIR/muster e2e-XXXX`, space-bearing; `-S` tmux socket inside it; `-claude-projects-dir` scratch inside it; stub `claude` at `$TMPDIR/muster e2e-stub-cd75a542396fd84f/claude`). Driven in headless Chromium, 1280×800 (plus 1280×640 for reachability), by three throwaway specs `web/e2e/zz-browser-probe*.spec.ts`, deleted afterwards. Fixture teardown killed every daemon and tmux server. `git status --porcelain` shows only the other reviewers' part files.

Gates log (`gates-…-c1`): `e2e` 484 passed and `web-build` green, so the app I drove is the one that will ship. `check-kb` and `features-scope` are red; both are known and accepted.

## Matrix

Hosts: **focus** (rail card + mainhead), **tiles** (tile `.thead`, strip card), **dialog** (the launch modal, opened over either view). A pop-out host does not exist for anything in this plan (`/doc.html` is the reader's).

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-2 | dialog | data | `#bypass-warning` hidden until bypass | pass | unchecked: `hidden`, computed `display:none`, box 0×0 |
| REQ-2 | dialog | data | bypass can be picked by keyboard | pass | focus `auto` radio, then ArrowRight: `bypass` checked |
| REQ-2 | dialog | data | warning shows and text is exact | pass | `display:block`, box 297,569–983,611 inside dialog 280,98–1000,702; textContent is exactly the specified string |
| REQ-2 | dialog | data | primary face `Launch without checks`, danger | pass (label wraps, Minor 3) | class `btn key-danger`, bg rgb(194,70,70) = resolved `--danger`; box 117×49, two lines |
| REQ-2 | dialog | data | ArrowLeft back restores `Launch`, amber | pass | `btn key`, bg rgb(242,163,60) = `--amber`; warning `display:none` |
| REQ-2/R1 | dialog | data | bypass segment uses `--danger`, never `--rose` | pass | checked label bg rgb(194,70,70); `--rose` is rgb(231,127,127) |
| R2 | dialog | New+bypass / Resume+bypass row | exactly one filled button | pass | the only filled `.btn` is `#launch-button`; the other painted backgrounds are the selected tab and the selected row (`--bg-hover`) |
| REQ-3 | dialog | data | open never restores bypass | pass | directory whose last launch was bypass: on open, `auto` is checked, face `Launch`, warning `display:none` |
| REQ-3 | dialog | data | Recent click never restores bypass | pass | Recent click on that directory: `auto`. Control: Recent click on a plan directory restores `plan` |
| REQ-4 | focus rail card | started / working / dead | chip iff bypass | pass | chip `display:inline`, box 75,155–128,168 inside `.r1` 14,94–288,169, with a 110-character title |
| REQ-4 | focus mainhead | started / dead | chip iff bypass | pass | chip 734,77–787,90 inside `#mainhead` 300,46–1280,122, sitting between `.name` (…722) and `.meta` (799…) |
| REQ-4 | tiles tile `.thead` | started / dead | chip iff bypass | pass | chip 377,95–430,108 inside `.thead` 2,86–639,117; `.nm` ellipsises (sw 748 > cw 339), chip not clipped |
| REQ-4 | tiles strip card | started | chip iff bypass | pass | fifth bypass session in the strip: chip 68,666–121,679 inside card 0,652–1280,800 |
| REQ-4 | focus + tiles | latch → default → bypass | chip follows the latch | pass | after `permission_mode:"default"`: `display:none` in card, mainhead and tile (settled after 1.2 s); back to bypass: shown again |
| REQ-4 | all | non-bypass session | no chip | pass | plan session: chip `hidden`, `display:none` |
| REQ-5 | focus rail card | started, first launch | combined note | pass | card text `first launch here — likely waiting on Claude Code's trust prompt, then its bypass warning` |
| REQ-5 | focus rail card | started, repeat directory | bypass note | pass | `likely waiting on Claude Code's bypass warning` |
| REQ-5 | tiles | started | note | N/A: tiles carry no card note | the strip card (the card template) shows it: `likely waiting on C…` |
| REQ-7 | dialog | — | tab pair, always opens on New | pass | aria snapshot shows `tablist "Session kind"`, `tab "New" [selected]`; focus on open is `#title-input` |
| REQ-7 | dialog | — | tabs operable by keyboard | pass (Minor 4) | Shift+Tab to `#launch-tab-resume`, Enter: `aria-selected=true`. ArrowLeft does not move between tabs |
| REQ-8 | dialog | Resume | picker, list, form hidden | pass | `.picker` height 300 → 220; `.fields` `hidden` and `display:none`; `#past-sessions` `display:grid`, 281,380–999,640 inside dialog 280,111–1000,690 |
| REQ-8 | dialog | Resume | back to New restores the form | pass | `#past-sessions` `display:none`, `.fields` `display:grid`, picker 300, face `Launch` |
| REQ-8 | dialog | Resume | refetch on directory change | pass | root → `· 0` empty; empty directory → `No Claude Code sessions in this directory`; the head follows each directory |
| REQ-8 / edge 19 | dialog | late response | stale response dropped | pass | the other directory's response delayed 3 s while I navigated back: the list settled on the current directory (`· 1`, its own row) |
| REQ-6/8 | dialog | data | newest first, agrees with the API | pass | the first 4 rows match `GET /api/past-sessions`'s order (`sess-planmodel`, `sess-bypass-long`, `sess-untitled`, `sess-029`) |
| REQ-8 | dialog | data, 33 rows | list reachable | pass | `#past-list` `overflow:auto`, sh 1353 > ch 231; wheel moves scrollTop 0 → 400; the last row can be clicked and scrollTop stays 1122 |
| REQ-8 | dialog | data, 1280×640 | dialog and footer inside the viewport | pass | dialog 31–610, footer 560–609 |
| REQ-8 | dialog | Resume, no selection | footer names the target | **FAIL** | `Resume (untitled) in <path>` shown with no row selected (Major 1) |
| REQ-9 | dialog | open row (bound by `source:"startup"`) | disabled, `open in Muster` | pass | `disabled`, text `Bound one now open in Muster`, color `--disabled-fg`; button disabled |
| REQ-9 | dialog | open row (resumed from list, bound by `source:"resume"`) | disabled, `open in Muster` | **FAIL** | `openSessionId` null, row enabled (Critical 1) |
| REQ-11 | dialog | bypass row selected | `Resume without checks`, danger | pass (label wraps, Minor 3) | `btn key-danger`, bg `--danger`; box 72×49, two lines |
| REQ-11 | dialog | other rows | `Resume`, amber | pass | `btn key`, `--amber` |
| REQ-11 | dialog | long-title bypass row | row chip visible | **FAIL** | chip box 1130–1182 is outside row 281–999, clipped by `.t`'s `overflow:hidden` (Major 2) |
| REQ-12 / INV-4 | dialog + API | resumed row bound via `resume` | second resume refused `409 already_open` | **FAIL** | second POST → 201; two alive rows (Critical 1) |
| REQ-12 / INV-4 | dialog | two resumes before either binds | refused | **FAIL** | row enabled on the 2nd open; both bind; `/api/state` shows `[1,alive,"sess-dup"]`, `[2,alive,"sess-dup"]` (Critical 2) |
| REQ-12 | focus mainhead | dead row, id held by an alive resumed row | Resume refused `not_resumable` | **FAIL** | Resume enabled; click → both alive with `sess-x`, no `#action-error` (Critical 1) |
| REQ-10 | focus | resume a plan row | argv | pass | pane start command `… --resume sess-plan --permission-mode plan`, no `--model`/`--name` |
| REQ-10 | focus | resume a row with no mode | argv `default` | pass | `… --resume sess-nomodel --permission-mode default`; seed `{default, seed}` |
| REQ-10 (decision) | focus mainhead | resumed, model recorded | displayName = id | pass | API `{id:"claude-opus-4-1-20250805", displayName: same}`; mainhead meta `… · claude-opus-4-1-20250805` |
| States: model unknown | focus mainhead / card / tile | resumed, no model | reads `unknown` | **FAIL** | API `model:null`; mainhead meta `probe-open-yxDQ32`, no model word; card and tile show nothing (Minor 1) |
| REQ-13 | focus | resume | opens like a launch | pass | new card `aria-current=true`; activeElement `xterm-helper-textarea` |
| REQ-13 | tiles | resume | promoted into the grid | pass | bypass row resumed from Tiles: live tile 1,443–640,799 with the chip; activeElement inside that tile |
| REQ-14 | dialog | data | filter narrows, keeps focus | pass | typed by keys: 33 → 11 rows; `document.activeElement` still `past-filter` after 1.2 s; `PROMPT TEXT FOR 29` matches last prompt regardless of case |
| REQ-14 | dialog | filter excludes all | `No sessions match`, disabled | pass (footer wrong, Major 1) | list text and disabled button correct |
| States: loading | dialog | no data yet | `Loading sessions…`, disabled | pass | response delayed 1.5 s: list text, button `disabled`, head has no count |
| States: all disabled | dialog | only an open row | no selection, disabled | pass (footer wrong, Major 1) | button disabled |
| States: truncated | dialog | 205 transcripts | `Showing the newest 200` reachable | pass | 200 rows; `.trunc` scrolled into view at y 594 inside list 408–639 |
| Edge 7 | dialog | transcript deleted | 404 message, refetch | pass (Minor 2) | `#launch-error` `display:block` with the message; the row is gone after the refetch |
| Keyboard select | dialog | data | focus kept on the chosen row | **FAIL** | Space on row 4: `aria-pressed=true`, but activeElement is `BODY` after 1.2 s; the next Tab lands on row 1 (Major 3) |
| States: daemon-down | dialog | Resume, refetch | error line, disabled | pass | `Couldn't read sessions — try again`, button disabled, head count dropped |
| States: daemon-down | all | — | daemon-down surfaced prominently | pass | `#banner` `musterd unreachable — …` at top 46 (visible behind the modal backdrop), `connection-status` reads `reconnecting…` |
| States: daemon-down | dialog | Resume, no refetch | stale list | note | rows stay and Resume stays enabled until the tab is re-entered (Note 3) |
| §7 | focus / tiles | — | one live client, scrollback 0 | N/A: this plan changes no terminal surface | — |

## Issues

### Critical

1. **[daemon-impl]** A session resumed from the list never counts as "open in Muster" once Claude Code binds it through `SessionStart{source:"resume"}`, the event a real `claude --resume` sends (kb:fact/resume-restores-model-and-mode-except-plan). As a result REQ-9, REQ-12 and INV-4 fail for exactly the sessions this plan creates:
   - I resumed `sess-one`, bound it with an enveloped `source:"resume"` SessionStart, and got `/api/state` `[1, alive, "sess-one", idle]`. `GET /api/past-sessions` then still returned `openSessionId: null`, the row stayed enabled, and a second `POST {resumeSessionId:"sess-one"}` returned **201** (session 2) instead of `409 already_open`.
   - Dead session A bound `sess-x`. B was resumed from the list and bound `sess-x` via `resume`. A's mainhead Resume stayed enabled, and clicking it made both alive with `sess-x` (`[[2,true],[1,true]]`). No `not_resumable` came back.
   - Cause, read to explain the measurement: `Manager.Apply` (`internal/session/apply.go`) writes `byClaude[id]` for `KindBind`/`KindClearRebind` but not for `KindResumeBind`. `AliveByClaudeSessionID` reads only `byClaude`.
   - A fix must make true: after any bind kind, including resume, `AliveByClaudeSessionID(id)` returns that alive row, so the list disables the row and both 409s fire.
   - **[e2e-specs]** E5 and the INV-4 tests bind the bystander with `source:"startup"`, so they could not have failed for this. One resumed-from-list row bound via `sessionStartResume` must be asserted disabled and refused.
2. **[daemon-impl]** Two resumes of one past session before either binds leave two alive rows bound to one Claude session id (INV-4). I resumed `Dup fixture` from the dialog, reopened the dialog, and the row was still enabled (`Dup fixture now d`). I resumed it again and bound both. `/api/state` shows `[1,true,"sess-dup",idle]`, `[2,true,"sess-dup",idle]`. The window is not a race: Claude Code's trust prompt and bypass warning suppress every hook until answered (kb:fact/bypass-acceptance-blocks-startup), so a pending resume can sit unbound for as long as the user leaves it. A fix must make true: an alive row created with `resumeSessionId X` holds X for `openSessionId`, `already_open` and `not_resumable` from the moment it is created, not from its bind.

### Major

1. **[web-impl]** The Resume footer claims a target when nothing is selected. It shows `Resume (untitled) in <path>` in the no-match, all-rows-disabled and post-filter-deselect states (measured in all three; the screenshot shows it beside a disabled `Resume` button). `renderResumeFooter` (`web/src/render/launch.ts`) collapses "no selection" and "selected row has a null title" into the same `title ?? "(untitled)"`. A fix must make true: with no selection, the footer shows the dash (or no title), and `(untitled)` appears only for a selected untitled row.
2. **[web-impl]** A long-titled bypass row's chip is invisible. The chip is appended inside `.t`, which has `overflow:hidden; text-overflow:ellipsis`. With a 110-character title, the chip's box was 1130–1182 against a row of 281–999 (`.t` sw 889 > cw 670), so it is fully clipped. The danger marker on a listed session disappears exactly when the title is long. `web/src/render/launchpast.ts` `buildPastRow`. A fix must make true: the chip is a sibling of the ellipsised title text and stays inside the row box for any title length.
3. **[web-impl]** Selecting a past-session row by keyboard throws focus to `<body>`. Focusing row 4 and pressing Space selects it (`aria-pressed=true`). But `renderPastList` rebuilds every row (`replaceChildren`), so `document.activeElement` is `BODY` 1.2 s later, and the next Tab restarts at row 1 (kb:lesson/select-rebuilt-every-tick-passed-selectoption). A fix must make true: after a keyboard selection, `document.activeElement` is the chosen row, either by updating `aria-pressed` in place or by restoring focus to the rebuilt row.

### Minor

1. **[orchestrator:decision]** A resumed session with no recorded model shows no model word anywhere. The plan's States row says it reads `unknown`, never blank. With API `model: null`, the mainhead meta shows only the directory (`mainheadMeta` now skips the clause when there is no `displayName`), and the card and tile carry no model field. Option A: the mainhead meta renders `model unknown` for a null model, and a spec asserts it. Option B: amend the States row to "the clause is omitted, as for any null model today".
2. **[web-impl]** `#launch-error` outlives its cause. The `404 unknown_claude_session` message stayed visible after switching to the New tab (`display:block`, box 281,603–999,625). It was still showing during daemon-down beside an unrelated error line. A fix must make true: a tab switch or a new selection clears `#launch-error`.
3. **[web-impl]** The danger faces wrap to two lines on a realistic path. `Launch without checks` measured 117×49 and `Resume without checks` 72×49 with the scratch path in the footer; with `/Users/dev/code/muster` the same button is 166×25, one line. The footer `#launch-target` flex-shrinks the button (`white-space: normal`). A fix must make true: `#launch-button` never shrinks below its one-line label (`flex-shrink:0` / `white-space:nowrap`), and the target ellipsises instead.
4. **[web-impl]** The `role="tab"` pair does not behave as tabs. ArrowLeft/ArrowRight do not move between them (focus stayed on `#launch-tab-resume`, New not selected), and there is no `tabpanel`/`aria-controls`. Because the tablist sits inside the dialog's labelling `<h2>`, the dialog's accessible name became `New session Session kind` (aria snapshot). A fix must make true: arrow keys switch tabs, and the dialog's name is `New session`, for example by moving the tablist out of `#launch-dialog-title` or labelling the dialog by a span around the title text.

### Notes

1. **[note]** A resumed-from-list session into a directory with no repo row reads `first launch here — likely waiting on Claude Code's trust prompt`. The directory has transcripts, so Claude Code has run there before. This follows the contract (`firstLaunchHere` iff no repo row) and is recorded only as an observation.
2. **[note]** Past-row ages (`1m`, `7d`) are computed once per render and do not tick while the dialog stays open. No change requested.
3. **[note]** When the daemon dies while the Resume list is showing, the stale rows and an enabled `Resume` stay until the tab is re-entered. The global `musterd unreachable` banner is up, so the honesty rule holds. A POST would fail through `#launch-error`.
4. **[note]** In the truncated state the head reads `· 200`, which is the number listed, not the number that exist. The `Showing the newest 200` line explains it.
5. **[note]** Not measured: light theme (the contrast gate covers the chip/danger pairs, 43/43 in both themes), and the real bypass warning (R3 is the orchestrator's real verification).
