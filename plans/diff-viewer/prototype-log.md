# diff-viewer — prototype log

**Description** (the developer, 2026-11-17): Code diff viewing (`TODO.md` § Features — view a
session's code diff directly in the dashboard). It should not only follow the normal GitHub route,
although GitHub's two views (unified and split) are the two default options. Look for something
more interactive that gets the user clicking on the diff — showing or hiding a specific change, or
something more interesting than just reading the diff.

**Started:** 2026-11-17
**Weekly usage at start:** 23.0 %

Built by Sonnet subagents, overseen from the main session (the developer's request).

### First build — 2026-11-17
- Asked: the description above.
- Changed: a `diff` segment beside `claude | shell | docs` in the Focus header opens a diff viewer in
  place of the pane, for a live or ended session. A scope toggle picks `Uncommitted` (working tree
  against HEAD, untracked files included) or `Branch` (everything since the branch left the default
  branch). Three views: `Unified` and `Split` (GitHub's two, Unified the default) and `Review`. In
  Review the file reads as the new code and each change is a block: clicking it flips it between
  *after* and *before* (hiding that one change), ✓ marks it reviewed and folds it to one row, a
  toolbar readout counts `n / m changes reviewed`, `j`/`k`/`Space`/`x` drive it from the keyboard,
  and a strip down the edge has one tick per change to jump to. A file list on the right jumps to a
  file.

### Round 1 — 2026-11-19
- Asked: (1) show a change inside a line better — when a long line such as a sentence changes by one
  word, that word should stand out; (2) a way to leave comments on a diff, to come back to later;
  (3) the diff should not be a tab at the top, and there should be no button at all when there is
  no diff — the developer is not sure where it should go instead.
- Changed: (1) in all three views, the words that changed inside a changed line carry a stronger red
  or green than the rest of the line; a line that was mostly rewritten stays plainly red or green.
  (2) Hovering a line shows a `+` in its gutter; clicking it opens a comment box under the line. A
  saved comment shows under its line with Edit and Delete, stays with the session across reloads
  and daemon restarts, and is listed in a `Comments (n)` tab beside `Files`, where clicking an entry
  jumps to it. A comment whose line is no longer in the diff is kept in the list, marked outdated,
  with the line it was written on quoted. (3) The `diff` segment is gone. A chip in the Focus
  header, left of the surface switch, reads e.g. `7 files +35 −21` (or `branch · …` when only
  committed work differs, plus a comment count) and exists only while the session has changes or
  saved comments; clicking it opens the viewer, and clicking it again, `×` or Esc returns to the
  surface that was showing.
- Accepted: nothing stated yet.
- Changed mind: the diff as a fourth tab in the surface switch → no tab; a way in that only exists
  when there is a diff, because a permanent tab offers a view that is usually empty.

### Round 2 — 2026-11-19
- Asked: (1) highlight several lines to comment on, as on GitHub; (2) how the information is
  stored today and whether it is linked to the session; (3) mocks of three more places the way
  into the diff could live — the developer worries the Focus header gets crowded with a long title
  or long file names.
- Changed: (1) pressing a line's `+` and dragging over more lines of the same file selects them
  (amber tint), and releasing opens the comment box under the last one, headed `Commenting on lines
  91–95`; clicking a line number then shift-clicking another selects the same way. A saved range
  comment sits under the last line of its range headed `Lines 91–95`, its lines keep a thin amber
  bar in the gutter, and hovering the comment tints them. The Comments list shows `path:91–95` with
  the first line quoted and `… +4 lines`. Esc clears a selection before it closes the viewer.
  (2) Answered: in the prototype, comments live in the browser only, one list per session; the
  reviewed marks and before/after flips last only until the page reloads; the view mode is one
  browser-wide setting; the scope is chosen fresh on each open; the diff is read live from git and
  never stored. The developer was told the real feature would more likely keep comments in the
  daemon with the session, as session notes are. (3) Mocks in `mockups/entry-points.html`: today's
  header chip under a long title, directory and branch for reference, then A — on the rail card,
  B — a strip under the pane, C — a tab on the pane's right edge that slides the diff in beside the
  terminal.
- Accepted: nothing stated yet.

### Round 3 — 2026-11-19
- Asked: after seeing the mocks — "I actually really like the idea behind B", the strip under the
  pane, but it must show the numbers as well, not just "View diff".
- Changed: the header chip is gone and the Focus header carries nothing about the diff. A thin
  strip along the bottom edge of the Focus pane reads, grouped at its left, `8 files changed +51 −9
  · 💬 2 comments · View diff ›`; the whole strip is one click target that opens the viewer. It
  exists only while the session has changes or saved comments, sits under `claude`, `shell` and
  `docs` alike, and is absent from Tiles. While the viewer is open it stays and reads `Close diff ×`.
- Accepted: the strip under the pane as the place the way into the diff lives (over the header chip,
  the rail card and the right-edge tab).
- Changed mind: a chip in the Focus header → a strip under the pane, because the header is already
  crowded and a long title, directory or branch squeezes anything added there.

### Round 4 — 2026-11-19 (feedback batch 1)
- Asked: (1) on the pane's size row (`198×35 · one live client · geometry owned by this pane`):
  "I wanted the diff button in this row on the far right, not a row underneath"; (2) on a comment's
  `Delete`: "Can we change this to Resolve".
- Changed: (1) the separate strip is gone. The diff button sits at the right end of the size row —
  `8 files +51 −9 · 💬 2 · View diff ›`, `Close diff ×` while the viewer is open — and the row is no
  taller than before. Where the pane has no size note (docs, an ended session, the diff itself)
  the row still shows with only the button. In the prototype the button stops short of the right
  edge to clear the feedback overlay; the real one would sit flush right. (2) A comment has
  `Resolve` in place of `Delete`. Resolving folds it to one muted row under its line, `✓ Resolved ·
  Lines 91–95 · <start of the comment>`, with `Reopen`; expanding that row offers `Delete`, which
  removes it for good. The Comments tab counts open comments and lists resolved ones in a
  collapsed `Resolved (n)` section; the button's 💬 count, the file rows and the change map count
  open comments only. (Resolve-as-GitHub was the builder's reading of the note, put to the
  developer to confirm.)
- Accepted: nothing stated yet.
- Changed mind: a strip of its own under the pane → the button inside the existing size row, so the
  pane gives up no extra height.

### Round 5 — 2026-11-19 (feedback batch 2)
- Asked: (1) on the diff button, which sat 340px in from the right to clear the feedback bar: "can
  we put it on the far right otherwise it just seems to hang in the middle of nowhere"; (2) in
  Review: "I'd like to be able to tick an entire file rather than each diff individually.
  Basically I want both options."
- Changed: (1) the diff button sits at the right end of the size row. (2) In Review each file's
  header carries a tick box at its right end, and so does the file's row in the Files list. Empty
  when none of the file's changes are reviewed, a dash with `2/5` when some are, ticked when all
  are. Ticking it marks every change in the file reviewed and folds the file; unticking it unmarks
  them all and opens the file. A ticked file can still be opened to look at without unticking it.
  Ticking the changes one by one arrives at the same ticked file. `Shift+X` ticks the file the
  current change is in. Unified and Split have no ticks.
- Accepted: "Alright I like that" — said of the prototype as it stood after this round (the diff
  button at the right end of the size row, file-level and per-change ticks), before asking what
  the next steps are.

### Done — 2026-11-19
The developer accepted the prototype ("Done") and settled the four things left open:

1. **Comments are stored with the session**, not in the browser. "I don't want to think too hard
   about this as I will be looking at storage in the future" — the simplest storage that keeps
   them with the session is wanted; a storage design is not.
2. **Review ticks are stored with the session too**, so they survive a reload.
3. **Tiles view gets no way into the diff.** Tiles is being reworked later; leaving it out is fine.
4. **What nobody tried in the prototype is for the build pipeline to cover**: comments and
   Resolve in Split and Review, the light theme, and a live terminal resizing as the size row
   appears or disappears.

Accepted as it stands (screenshots in `prototype/`):
- The way in: a button at the right end of the pane's size row, present only while the session has
  changes or open comments, reading the counts and `View diff ›`, and `Close diff ×` while open.
- `Uncommitted` and `Branch` scopes; `Unified` and `Split` views; word-level highlight inside a
  changed line in every view.
- `Review`: a change flips between after and before on a click; a change or a whole file is ticked
  reviewed and folds away; a progress readout; the change map; the keyboard keys.
- Comments on a line or a dragged or shift-clicked range of lines; `Resolve` folds a comment away
  and keeps it in a `Resolved` list, from which it can be reopened or deleted.

**Weekly usage at done:** 10.0 % (2026-11-19). The weekly window reset between the start (23.0 %
on 2026-11-17) and now, so the two figures do not subtract to this prototype's cost.

Not accepted, only passed over: the Comments list's exact layout, the Review keys beyond their
existence, and the copy of every label — none were commented on.
