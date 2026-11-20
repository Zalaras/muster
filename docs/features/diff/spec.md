---
id: diff
type: spec
status: active
date: 2026-11-19
summary: A session's code diff in the dashboard — a size-row button, Unified, Split and Review views, ticks and comments kept with the session.
features: [diff]
tags: [ux]
go: [internal/gitdiff/*.go, internal/server/diff*.go, internal/session/diffreview*.go]
web: [web/src/features/diff*.ts, web/src/render/diff*.ts, web/render/diff*.spec.ts, web/render/helpers/diff*.ts]
e2e: [web/e2e/diff*.spec.ts, web/e2e/helpers/diff*.ts]
protocol: [diff.summary, diff.read, diff.review, diff.comment, diff.comment-delete, diff.ticks]
refs: [kb:adr/diff-viewer-in-dashboard-comments-stay-local, kb:adr/diff-follows-launch-directory-checkout, kb:adr/diff-entry-button-in-size-row, kb:adr/diff-counts-polled-for-focused-session, kb:adr/diff-open-view-never-redraws, kb:adr/diff-review-on-session-row-per-item-writes, kb:adr/diff-read-only-git-cli, kb:adr/diff-comments-anchor-by-quote-ticks-by-content, kb:adr/diff-uncapped-first-pass, kb:adr/reader-docs-is-third-surface-segment, kb:adr/issue-payload-allowlist-never-dump]
---
The developer reads a session's changes in the dashboard. Nothing from the viewer reaches Claude Code (kb:adr/diff-viewer-in-dashboard-comments-stay-local).

## Which diff

The diff is of the git checkout the session's launch directory is in — the whole checkout, never
where Claude has moved to
(kb:adr/diff-follows-launch-directory-checkout). `Uncommitted` is the working tree against the last
commit, untracked files included. `Branch` is the working tree against where the branch left the
default branch; on the default branch, or with none found, it compares against the last commit and says so. A repository with no commits reads every
file as added. A rename shows as `old → new` only as git reports it. The daemon
reads git through its CLI and never writes to the repository (kb:adr/diff-read-only-git-cli). The
diff is never cut off; an untracked file over 256 KiB or holding a NUL byte reads as binary, as
does an image (kb:adr/diff-uncapped-first-pass).

## The button

At the right end of the Focus pane's size row sits the diff button; the row grows no taller, and where the pane has no size note (docs, an ended session, the viewer itself) the row holds only
the button. It reads the uncommitted counts (`8 files +51 −9`), or the branch counts prefixed
`branch ·` when only committed work differs, then `💬 n` while the session has open comments, then
`View diff ›` — `Close diff ×` while the viewer is open. It is absent while the checkout is clean
and no comment is open, and always when the launch directory is not in a git repository
(kb:adr/diff-entry-button-in-size-row). The dashboard asks for the focused session's counts every
5 s while the page is visible and in Focus, so the button follows the checkout within ten
seconds; an ended session shows it too, and it keeps its last counts while musterd cannot be
reached (kb:adr/diff-counts-polled-for-focused-session). No tile shows it; a session left on the
viewer shows its terminal in its tile and the viewer again back in Focus.

## The viewer

The button opens the viewer in place of the pane. While it is open no segment of the surface switch
is selected; the button, the viewer's `Close diff viewer`, or Escape returns to the surface that was
selected, and choosing a segment or a terminal shows that surface instead (kb:spec/surfaces). The viewer is per session and tab. It opens on `Uncommitted` when that has files, otherwise `Branch`, and states what
it compares against.

Each file is a section headed by its status, path and counts, folded by its header; a binary file
reads `Binary file not shown`; a clean scope reads `No changes`. A Files list beside the diff jumps
to each file. `Unified` is one column with old and new line numbers; `Split` puts old left and new
right with a change's rows lined up. A browser starts on Unified and remembers the chosen view.
Where a removed line and its replacement are mostly the same, the differing words carry a stronger
red or green in every view.

## Review

The file reads as the new code and each change is a block labelled `after`; clicking it shows its
removed lines as `before`, and again returns. A change's tick folds it to one muted row; a file's
tick box, on its header and its Files row, is unchecked, mixed with `2/5`, or checked, and ticks or
unticks every change in the file. The toolbar reads `6 / 17 changes reviewed` with `Reset`. A change
map at the edge marks each change unreviewed, before, reviewed or commented, and jumps to it. With
focus in the viewer and outside a text field, `j`/`k` move the current change, Space flips it, `x`
ticks it and `Shift+X` ticks its file; Escape closes an open popover menu first, then a comment box, then a selection, then the viewer.

## Comments

Hovering a line shows a `+`; clicking it, dragging from it, or clicking a line number and
shift-clicking another opens a box headed `Commenting on lines 93–96`. A saved comment sits under
its last line headed `Lines 93–96`, with Edit and Resolve; Resolve folds it with Reopen, and the
opened folded row offers Delete. The `Comments (n)` tab lists open comments and jumps to each,
resolved ones under a closed `Resolved (n)`; every count shown is of open comments. A comment that
cannot be saved keeps its box and text and reads `Not saved, musterd unreachable`.

Comments follow their code: on each diff shown, a comment is placed where its quoted first and last
lines now sit; with one end left it attaches there marked `partly outdated`; with neither it stays
in the list marked `outdated`, its line quoted. A tick is keyed on its change's content, so a change
whose lines changed reads unticked (kb:adr/diff-comments-anchor-by-quote-ticks-by-content).

## Staleness

The diff is read when the viewer opens, and the open diff never redraws by itself. When the checkout
changes, within about ten seconds a bar pinned under the toolbar, in the warning tokens, reads
`This diff has changed since you opened it — 1 new file, 2 files changed` with Refresh; the lines
on screen stay put apart from the bar's height. Refresh reads the diff again, keeps scroll position
where it can, keeps ticks and comments, and removes the bar (kb:adr/diff-open-view-never-redraws).
A diff that cannot be read says `Couldn't read the diff: <reason>` with Refresh.

## Storage and lifetime

Comments and ticks live on the session row, written one comment or one set of ticks at a time and
never broadcast; another window sees them when it next opens or refreshes the diff, and two writes
to one comment leave the later. They stay with an ended session and survive resume, reconcile and
restart; Remove deletes them with the row (kb:adr/diff-review-on-session-row-per-item-writes). No
hook, status post or `/clear` touches them. They are never in an issue snapshot
(kb:adr/issue-payload-allowlist-never-dump), and no diff line or comment text is logged.

## Does not

Stage, commit, discard or edit; highlight syntax; diff arbitrary commits or added directories.
