# Browser review: Rail groups

**Plan**: groups
**Verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 39368 words (budget 20000)
**Rig**: `bin/musterd` built fresh by `make web-build build` (under `bin/gatelock run --exclusive`) at 6bb10267. Each test ran its own `ScratchDaemon` from `web/e2e/helpers/fixtures.ts`: a space-bearing data dir `$TMPDIR/muster e2e-XXXX`, a private socket `<data dir>/tmux.sock` removed with it, and the shared E2E stub `claude` at `$TMPDIR/muster e2e-stub-cd75a542396fd84f/claude`. Driven by headless Chromium (1280×900) through a throwaway `web/e2e/zz-rb3-dialogs.spec.ts` in the foreground, now deleted. Afterwards no `musterd` or tmux process was left, and `git status --porcelain` showed nothing of mine.

Gates log read, not re-run (`gates-groups-c3`). Every line is green: `web-build` built, `e2e` reads `713 passed (5.7m)`, `dead-refs` reads `0 missing`. The app I drove is the one that ships.

Scope. Since my cycle-2 approval the only web source change is fdb5aed3. It moves the lookup of the new-group and delete-group dialog elements from `features/groupsdialogs.ts` into `features/groups.ts`, which hands them to `initGroupsDialogs`. 6bb10267 edits package guides only. This cycle re-drives every surface that wiring touches, in both sort modes (manual and attention): the New group from selection modal, reached from select mode's Move to and from the Focus header's group control, and the Delete group dialog. The rest of the cycle-2 matrix (`review.browser.cycle2.md`, commit 8a2bdd36) stands. Its dialog-adjacent cells were re-observed in passing and agree: the Move to menu, Escape closing only the modal and keeping the selection, and the daemon-down disabled controls.

Sort mode was set by keyboard typeahead on the rail's Sort select. Dialog controls were driven by pointer clicks and keys; the Target group select by typeahead, never `selectOption`.

## Matrix

Hosts are `focus` (rail, select bar, mainhead) and `pop-out` (`/doc.html`). Every cell below ran once with `manual` sort and once with `attention` sort, with the same result; where the two differ, the evidence says so.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| all rows | pop-out | all | — | N/A — `/doc.html` hosts only the reader (cycle 2) | |
| all rows | tiles | all | — | N/A — the rail, the select bar and the Focus header control are not in Tiles; both dialogs open only from them | |
| REQ-13 | focus | data, 2 selected | Move to → New group… by pointer opens the modal titled from the count, named by role | pass | title `New group from 2 sessions`; `getByRole('dialog', {name})` count 1 |
| REQ-13 | focus | data | modal placed inside the viewport; field, Cancel and Create inside it; no overflow | pass | dialog 420,374–860,527 in 1280×900; input 521,435–843,463; Cancel 706,489–770,514; Create 778,489–843,514; scroll 151/151 |
| REQ-13 | focus | data | `Group name` field focused on open and the same node after a tick | pass | active `#new-group-input`; tagged node still active after 1300 ms |
| REQ-13 | focus | data | the error line is not laid out at rest | pass | `#new-group-error` display none, 0 rects |
| REQ-13 | focus | data | Cancel by pointer closes, sends nothing, keeps the selection | pass | open false, display none; `POST /api/groups` 0; `2 selected`; groups `Existing` only |
| REQ-13 | focus | data | Move to → New group… by keyboard (Enter, ArrowDown, Enter) opens it focused | pass | menu `Existing, New group…, ✓Ungrouped`; active `#new-group-input` |
| REQ-13/REQ-12 | focus | data | Escape with typed text closes only the modal; nothing sent; selection kept; focus back on Move to | pass | posts 0; bar flex, `2 selected`; active `Move to ▾` |
| REQ-13 | focus | data | reopening starts with an empty field | pass | value `""` |
| REQ-1/REQ-13 | focus | data | Create with an empty name and Enter with a whitespace-only name send nothing; the modal stays, the field keeps focus | pass | open true; active `#new-group-input`; posts 0 |
| REQ-13/I6 | focus | data | Create by pointer with `  From selection  ` makes the trimmed group holding the selection; DOM = daemon | pass | groups `Existing, From selection`; members `[1,2]` = DOM `[1,2]`; one `POST /api/groups`; sections `["1","2","ungrouped"]` = oracle; modal display none |
| REQ-13 | focus | data, a selected session removed behind the open modal | the daemon's refusal shows inside the modal; nothing is created; typing clears it | pass | error `unknown session` display block 437,449–843,487 inside dialog 420,349–860,551; groups unchanged; display none after a key |
| REQ-10/REQ-13 | focus | data, ungrouped focused session | Focus control → New group… opens `New group from 1 session`, focused, inside the viewport | pass | dialog 420,374–860,527; active `#new-group-input` |
| REQ-10 | focus | data | Escape and Cancel each close it with nothing sent; focus returns to the control | pass | posts `[]` both; active `.ingroup` `no group▾` |
| REQ-10 | focus | data | typed name and Enter create the group with the session; the control relabels | pass | one `POST /api/groups`; members `[1]` = DOM `[1]`; label `Solo group▾` |
| REQ-5 | focus | data | header ⋯ → Delete group… by pointer opens the dialog named by role | pass | `getByRole('dialog', {name: 'Delete group “Alpha”?'})` count 1 |
| REQ-5 | focus | data | title, count body, three labels and hints, Ungrouped checked, confirm `Delete group` enabled | pass | `The group goes away. Choose what happens to its 2 sessions.`; checked `ungroup` |
| REQ-5 | focus | data | dialog inside the viewport with no overflow; choices and confirm inside it | pass | dialog 420,255–860,645, scroll 388/388 × 438/438; choices 421,361–859,595; confirm 738,607–843,632 |
| REQ-5 | focus | data, five groups | Target group select is laid out in the move row and lists the other groups in rail order | pass | select 471,468–749,494 display block in row 437,440–843,520; options `Bravo, Charlie, Delta, Echo` for rail `Alpha…Echo`; for Bravo `Charlie, Delta, Echo` |
| REQ-5 | focus | data | focus lands on the checked radio on open | pass | active `#delete-choice-ungroup` (pointer and keyboard opens) |
| REQ-5 | focus | data | Cancel by pointer closes; no `DELETE`; members kept; focus back on the header ⋯ | pass | dels `[]`; Alpha `[1,2]`; active `Group actions` |
| REQ-5 | focus | data | opened by keyboard (Enter on ⋯, arrows, Enter), Escape closes; no `DELETE`; focus back on ⋯ | pass | dels `[]`; Alpha `[1,2]`; active `Group actions` |
| REQ-5 | focus | data | Tab from the move radio reaches Target group; typeahead picks Charlie and checks the move radio; focus holds across a tick | pass | active `#delete-group-target`; value `3` = Charlie; move checked; same node after 1300 ms |
| REQ-5/E7 | focus | data | Move them to another group: Alpha's members join the end of Charlie | pass | daemon Charlie `[4,1,2]`; DOM manual `[4,1,2]`, attention `[1,2,4]` (cards sort by attention inside a section, REQ-18) |
| REQ-5/E7 | focus | data | Move them to Ungrouped (default), confirmed by Enter on the focused button | pass | b1 groupId null; Ungrouped daemon `[7,3]`; DOM manual `[7,3]`, attention `[3,7]` |
| REQ-5/E7/I3 | focus | data, one live and one ended member | Stop and remove them: both sessions and cards gone; the live member's tmux window gone | pass | sessions `[7,1,2,3,4]`; cards 0; tmux windows 6 → 5 |
| REQ-4/REQ-5 | focus | data, empty group | the one line shows; choices not laid out; confirm deletes it | pass | `The group is empty; nothing else changes.`; choices display none, 0 rects; dialog 420,382–860,518 |
| REQ-5 | focus | data, one group left | the move row and Target group are not laid out; two radios remain | pass | row display none; select 0 rects; labels `Move them to Ungrouped, Stop and remove them` |
| REQ-5 | focus | data | each confirm sent exactly one `DELETE` and Cancel/Escape sent none | pass | `DELETE /api/groups/1, /2, /5, /4` in order |
| States/E24 | focus | daemon-down, new-group modal open with typed text | the modal closes; Move to and the header ⋯ are disabled; select mode stays | pass | open false, display none; both `disabled`; bar flex; banner 1280×32 at 0,46 |
| States/E24 | focus | daemon-down | forced clicks on Move to and the header ⋯ open no menu and no dialog | pass | menus 0; both dialogs closed |
| States/E24 | focus | reconnect | the modal reopens with an empty field and Create enabled | pass | value `""`; Create enabled; `New group from 1 session` |
| REQ-5/E24 | focus | daemon-down, delete dialog open | the dialog closes; the header ⋯ is disabled | pass | open false, display none; ⋯ `disabled` |
| REQ-5/E24 | focus | reconnect | sections render once each; the dialog reopens with confirm enabled; nothing was deleted | pass | `["1","ungrouped"]`; confirm enabled; groups `Alpha` |
| §6 | focus | all | neither dialog shows a gauge, cost, Done state or unlabelled stale value | pass | text above is the whole content |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** The cycle-2 matrix was not re-driven outside the two dialogs. fdb5aed3 changes only where their elements are looked up, and the gates' `e2e` line is green on this tree. Cycle 2's notes still hold.
2. **[note]** After Create from a selection, select mode stays on with the same two sessions selected (`2 selected`). This matches cycle 2's Move to behaviour. No change requested.
3. **[note]** The new-group refusal shows the daemon's raw message `unknown session` when a selected session is removed behind the open modal. It sits inside the dialog and clears on the next keystroke. Whether that wording is enough is review-work's to weigh against the plan's copy.
