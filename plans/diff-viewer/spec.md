# Spec: Code diff viewing

**Plan**: diff-viewer
**Created**: 2026-11-19
**Features**: new: diff, focus, surfaces
**Touches**: notes, tiles, shortcuts, lifecycle
**Status**: Approved

## Goal

The developer can read what a session has changed in its checkout without leaving the dashboard:
the two views GitHub offers, plus a Review view built for clicking through a diff — hiding one
change at a time to see the code as it was, ticking changes and files off, and leaving comments to
come back to. Closes `TODO.md` § Features "Code diff viewing".

Drafted from a prototype the developer used and accepted on 2026-11-19
(kb:adr/process-prototype-first-track); `prototype-log.md` records each round and
`prototype/` holds a screenshot of each accepted state.

## Background & Context

- **This reverses a recorded non-goal.** kb:adr/nongoal-diff-review-placeholder-button kept diff
  review out of the dashboard and allowed only a placeholder "open in editor" button. The developer
  has now chosen to build it. `/plan-work` authors the superseding decision record; one half of the
  old record still stands here — comments are not fed back to the agent (Out of Scope).
- **Which checkout.** A session's shell, docs reader and file drop all stay on its launch directory
  even while Claude works elsewhere (kb:adr/lifecycle-card-shows-launch-directory-marks-claude-elsewhere,
  kb:spec/card-location). The diff follows the same rule: it is the diff of the git checkout the
  launch directory is in, the whole checkout even when the session was launched in a subdirectory.
  The developer weighed following Claude instead and chose the launch directory, to match how the
  shell and docs work (2026-11-19).
- **Git through the CLI**, never a library (kb:adr/stack-git-and-gh-clis-not-go-git).
- **The Focus header is full.** It already gives way in a fixed order as it narrows
  (kb:adr/focus-header-give-way-order-title-last, kb:spec/focus), and under a long title, directory
  and branch a control added there is squeezed onto a second row. That is why the way in is not in
  the header (`mockups/entry-points.html` shows the four placements that were compared).
- **`docs` is the precedent for replacing the pane**: a third surface that shows in the main slot
  instead of the terminal (kb:adr/reader-docs-is-third-surface-segment, kb:spec/surfaces). The diff
  replaces the pane the same way but is deliberately not a segment of the switch.
- **A Muster-owned thing kept with the session already exists**: the note lives on the session row,
  survives resume, restart and reconcile, and is deleted with the row
  (kb:adr/notes-muster-owned-session-field-whole-text, kb:adr/notes-ended-row-sweep-takes-its-note).
  Comments and review ticks have the same lifetime. The developer will revisit storage as a whole
  later, so the simplest storage that keeps them with the session is wanted, not a design.
- **Issue snapshots are an explicit allowlist** (kb:adr/issue-payload-allowlist-never-dump).
- Diagrams: kb:diagram/domain-model and kb:diagram/store-schema describe what a session carries;
  both change in the same commit as whatever holds comments and ticks. No new diagram — a comment's
  states (open, resolved, outdated) and the viewer's (closed, open) are few enough for prose.
- No Claude Code wire format is involved: nothing here reads a hook, the status line or a
  transcript.

## Scope

**In Scope:**
- A diff button at the right end of the Focus pane's size row, present only while there is
  something to open, and the viewer it opens in place of the pane.
- Two scopes (`Uncommitted`, `Branch`) and three views (`Unified`, `Split`, `Review`), with
  word-level highlight inside a changed line in all three.
- Review: flipping one change between after and before, ticking a change or a whole file reviewed,
  a progress readout, a change map, and keyboard keys.
- Comments on a line or a range of lines, with Resolve, Reopen and Delete, and a Comments list.
- Comments and review ticks stored with the session.
- A feature spec for the new `diff` feature (authored by `/plan-work`) and the decision record
  superseding the non-goal.

**Out of Scope:**
- **The diff as a tab in the `claude | shell | docs` switch** — tried first and rejected: a
  permanent tab offers a view that is usually empty.
- **A chip in the Focus header, a line on the rail card, a strip of its own under the pane, and a
  tab on the pane's edge with a side panel** — the placements compared and not chosen.
- **Any way into the diff from Tiles.** Tiles is being reworked later.
- **Sending comments, or anything else from the viewer, to Claude Code**, and Claude reading them.
- Staging, committing, discarding or editing changes from the dashboard; the diff is read-only.
- Syntax highlighting, a diff between two arbitrary commits, and a diff for a directory added to
  the session.
- Showing images before and after (an image reads `Binary file not shown`), and folding large files
  behind a Load control — left for a later pass.
- **A diff that follows Claude to another checkout** — considered and rejected: the shell and docs
  stay on the launch directory, and the diff matches them.
- **The diff re-drawing itself while it is open** — rejected in favour of a notice (requirement 4):
  a diff that moves under the developer loses their place mid-read and mid-comment.
- **The other two notices mocked** — the Refresh button changing in place, and a floating pill
  with dots on the changed files — not chosen: the first is easy to miss, the second covers lines.
- A storage design for comments and ticks beyond "with the session".
- The open-in-editor button (`TODO.md` § Tweaks "A `code <worktree>` button") — its own entry.

## Requirements

### Journeys

1. **The button follows the checkout.** With a session focused, changing a file in the checkout its
   launch directory is in makes the diff button appear in the size row within about ten seconds,
   without a reload; undoing every change makes it disappear the same way. An ended session shows
   it too.
2. **Opening and closing.** Clicking the button shows the viewer in place of the pane, listing the
   changed files. The button's action then reads `Close diff ×`; clicking it, the viewer's `×`, or
   Escape returns to the surface that was showing before, and choosing `claude`, `shell` or `docs`
   in the switch closes the viewer and shows that surface.
3. **Scopes.** `Uncommitted` shows the working tree against the last commit, untracked files
   included. `Branch` shows everything since the branch left the repository's default branch,
   committed or not. The viewer opens on `Uncommitted` when that has files, otherwise on `Branch`,
   and says what it is comparing against.
4. **One rule for staleness.** The button's counts and the open diff never silently disagree. The
   diff is read when the viewer opens. If the checkout changes while it is open, within about ten
   seconds a bar appears pinned directly under the viewer's toolbar, in the warning tokens, saying
   the diff has changed since it was opened and what changed (`1 new file, 2 files changed`), with
   a filled Refresh at its right end (`mockups/changed-notice.html`, option A). The bar does not
   scroll away with the diff, and apart from moving down by the bar's height the lines on screen
   stay put until the developer refreshes. The bar goes when the diff is refreshed.
   Refresh keeps scroll position where it can, and keeps ticks and comments (requirements 6 and 7).
5. **Comments keep.** A comment saved on a line or range is there after a reload, after a daemon
   restart, and in another browser. So are Resolve, Reopen, Edit and Delete.
6. **Ticks keep.** Changes and files ticked reviewed are still ticked after a reload and a daemon
   restart. A change whose lines have since changed comes back unticked.
7. **Comments follow the code.** After the code changes and the diff is refreshed, a comment sits on
   its line wherever that line now is. A comment whose line is no longer in the diff is not lost: it
   stays in the Comments list marked outdated, with the line it was written on quoted.
8. **Lifetime.** Comments and ticks stay with an ended session and survive resume and restart;
   removing the session removes them.

### Properties

9. **The button.** It sits at the right end of the size row and the row is no taller for it. It
   reads the file count and the added and removed line counts (`8 files +51 −9`), prefixed
   `branch ·` when only committed work differs, then `💬 n` while the session has open comments, then
   `View diff ›`. It is absent when the checkout is clean and has no open comments, and when the
   launch directory is not in a git repository. Where the pane has no size note (docs, an ended
   session, the viewer itself) the row still shows, holding only the button.
10. **Switch.** While the viewer is open, no segment of the surface switch looks selected.
11. **Files.** Each changed file is a section headed by its status (added, modified, deleted,
    renamed as `old → new`), its path and its counts; clicking the header folds it. A binary file
    says so instead of showing lines. A list of the files beside the diff jumps to each. A clean
    scope reads `No changes`.
12. **Unified and Split.** Unified is one column with old and new line numbers, removed lines red
    and added lines green. Split puts old on the left and new on the right with the rows of a change
    lined up. `Unified` is the view a browser starts on, and the chosen view is remembered.
13. **Word-level highlight.** Where a removed line and the added line that replaced it are mostly
    the same, the words that differ carry a stronger red or green than the rest of the line, in
    every view. A line that was mostly rewritten stays plainly red or green.
14. **Review — changes.** The file reads as the new code and each change (a run of removed and added
    lines) is a bounded block labelled `after`. Clicking it shows the removed lines in its place,
    labelled `before`; clicking again returns. A pure addition shown as before, and a pure removal
    shown as after, each leave a thin placeholder row so the block stays clickable.
15. **Review — ticks.** A change's ✓ folds it to one muted row that reopens on a click. A file's
    tick box, on its header and on its row in the file list, is empty, a dash with `2/5`, or ticked;
    ticking it marks every change in the file reviewed and folds the file, unticking it unmarks them
    all, and ticking every change one by one arrives at the same ticked file. A ticked file can be
    opened to look at without unticking it. The toolbar reads `6 / 17 changes reviewed` with a
    Reset.
16. **Review — change map.** A strip beside the diff carries one mark per change, showing whether it
    is unreviewed, flipped to before, or reviewed, and which carry open comments; clicking a mark
    jumps to the change.
17. **Comment on lines.** Hovering a line shows a `+` in its gutter. Clicking it opens a comment box
    under the line; pressing it and dragging over more lines of the same file, or clicking a line
    number and shift-clicking another, selects a range first, tinted so it reads apart from added,
    removed and current-change marking. The box says `Commenting on lines 93–96`. Selecting never
    flips a change.
18. **A saved comment** sits under the last line of its range, headed `Lines 93–96`, with Edit and
    Resolve; its lines carry a thin bar in the gutter. Resolve folds it to one muted row with
    Reopen; opened, that row offers Delete, which removes it for good.
19. **Comments list.** Beside `Files`, a `Comments (n)` tab counts and lists open comments —
    `path:93–96`, the first line quoted, the comment — and jumps to each, opening a folded file or
    change on the way. Resolved comments sit in a `Resolved (n)` section that starts closed. Every
    count shown elsewhere is of open comments.
20. **Keys.** In Review, with focus in the viewer: `j` and `k` move the current change, Space flips
    it, `x` ticks it, `Shift+X` ticks its file. None acts while the developer types in a comment
    box. Escape closes a comment box first, then clears a line selection, then closes the viewer.
21. **Both themes.** Added, removed, word-level, selection and comment marking are each
    distinguishable in the light and the dark theme.
22. **The terminal keeps its fit.** When the row appears or disappears the terminal resizes to the
    space left, with no clipped last row and no page scrollbar.
23. **Tiles.** No tile shows a diff button, and a session left on the diff shows its terminal in
    its tile.
24. **Privacy.** A comment never appears in an issue snapshot, and diff contents are never logged.

## Edge Cases & Considerations

- **Claude working in another checkout** (a worktree it moved to): the button and the diff stay on
  the launch directory's checkout, so they can be empty while Claude changes files elsewhere; the
  `↳` readout in the header is what tells the developer Claude is elsewhere.
- **No default branch found, or already on it**: `Branch` falls back to comparing with the last
  commit and says so in what it is comparing against.
- **A repository with no commits yet**: every file reads as added; nothing errors.
- **A very large diff**: never cut off and never folded — every file and line is sent and drawn,
  and issues are handled if they arrive (the developer, at `/plan-work`, 2026-11-19). An untracked
  file that is binary or over 256 KiB reads as a binary file, and so does an image.
- **The diff cannot be read** (git fails, the directory is gone, the daemon is unreachable): the
  viewer says so and offers Refresh; the button keeps its last known counts until it can ask again.
- **A comment cannot be saved** (daemon unreachable): the box stays open with its text and says it
  was not saved; nothing is silently dropped.
- **A range where only one end still exists**: the comment attaches to that line alone and is
  marked partly outdated.
- **A change folded as reviewed** cannot be selected or commented on until reopened; jumping to a
  comment inside one reopens it.
- **Two windows**: a comment or tick saved in one shows in another the next time that window opens
  or refreshes the diff; two windows editing the same comment — last write wins.
- **Switching the focused session** shows that session's diff, scope, ticks and comments; nothing
  carries over.
- **Hook loss is irrelevant**: no hook, status post or transcript line feeds any of this.

## Acceptance Criteria

- [ ] Changing a file in a focused session's checkout shows the diff button within about ten
      seconds; reverting removes it; a session outside a git repository never shows it.
- [ ] While Claude works in another checkout, the button and the diff still show the launch
      directory's checkout.
- [ ] Changing a file while the viewer is open shows the changed bar under the toolbar within about
      ten seconds, naming what changed, with the diff's own lines unchanged; it stays in view while
      the diff scrolls; Refresh shows the new diff with ticks and comments kept and removes the bar.
- [ ] The button opens the viewer in place of the pane and each of `Close diff ×`, the viewer's `×`,
      Escape and a switch segment closes it, returning to the right surface.
- [ ] `Uncommitted` lists a modified, an added (untracked), a deleted, a renamed and a binary file
      correctly; `Branch` additionally includes committed changes since the default branch.
- [ ] Unified, Split and Review each render the same diff, and a one-word change in a long line
      shows that word highlighted in all three.
- [ ] In Review, a change flips to before and back; a ticked change folds; a file tick marks and
      unmarks every change in the file; the progress readout matches.
- [ ] A comment on a single line and on a dragged range can be saved, edited, resolved, reopened
      and deleted, and all of it survives a reload and a daemon restart.
- [ ] Ticks survive a reload and a daemon restart.
- [ ] After the commented line moves, the comment follows it; after it is deleted, the comment is
      listed as outdated with its line quoted.
- [ ] Removing the session removes its comments and ticks; an ended session still opens its diff.
- [ ] Under the stress header of `mockups/entry-points.html` (long title, directory and branch) the
      Focus header looks exactly as it does without this feature.
- [ ] The row under the pane is no taller than before, and the terminal refits when it appears.
- [ ] The Review keys never fire while typing in a comment box.
- [ ] No tile shows a diff button.
- [ ] An issue snapshot of a session with comments contains none of their text.

## Feature Spec Delta

**diff** — new feature. `/plan-work` authors `docs/features/diff/spec.md` from this spec.

**focus** — becomes true:
- The row under the pane holds the size note, stating the pane's real geometry, and at its right
  end the diff button while the session's checkout has changes or open comments (kb:spec/diff); the
  row shows with only the button where the pane has no size note.
- The main slot shows the diff viewer while it is open.

**focus** — stops being true:
- "A size note under the pane states the pane's real geometry." (replaced by the row sentence
  above.)

**surfaces** — becomes true:
- While the diff viewer is open no segment of the surface switch is selected; choosing a segment
  closes the viewer and shows that surface, and closing it any other way returns to the surface
  that was selected.

**surfaces** — stops being true:
- nothing.

## References

- `plans/diff-viewer/prototype-log.md` — the rounds, what was asked, changed, accepted and
  reversed.
- `plans/diff-viewer/prototype/01`–`10` — screenshots of each accepted state.
- `plans/diff-viewer/mockups/entry-points.html` — the placements compared for the way in.
- `plans/diff-viewer/mockups/changed-notice.html` — the three "diff has changed" notices compared;
  option A was chosen.
- `plans/diff-viewer/prototype-feedback.jsonl` — the notes sent from the page.
- kb:adr/nongoal-diff-review-placeholder-button (to be superseded),
  kb:adr/lifecycle-card-shows-launch-directory-marks-claude-elsewhere,
  kb:adr/reader-docs-is-third-surface-segment, kb:adr/focus-header-give-way-order-title-last,
  kb:adr/notes-muster-owned-session-field-whole-text, kb:adr/notes-ended-row-sweep-takes-its-note,
  kb:adr/issue-payload-allowlist-never-dump, kb:adr/stack-git-and-gh-clis-not-go-git,
  kb:adr/process-prototype-first-track.
- `TODO.md` § Features "Code diff viewing"; § Tweaks "A `code <worktree>` button" (not closed by
  this).
