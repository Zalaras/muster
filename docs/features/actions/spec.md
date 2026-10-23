---
id: actions
type: spec
status: active
date: 2026-09-12
summary: Stop, Resume and Remove a session, the pane snapshot for dead sessions, confirm dialogs.
features: [actions]
tags: [ux]
go: [internal/server/actions*.go]
web: [web/src/features/actions*.ts, web/src/features/batchplan*.ts, web/src/render/confirm.ts, web/src/render/dead*.ts, web/src/render/actionerror*.ts, web/render/actions.spec.ts, web/render/helpers/actions.ts]
e2e: [web/e2e/actions.spec.ts]
protocol: [sessions.end, sessions.resume, sessions.remove, sessions.pane, ws.session-removed, sessions.end-many, sessions.remove-many]
refs: [kb:adr/actions-bulk-stop-remove-are-daemon-batches, kb:adr/rail-card-menu-on-selected-card-acts-on-selection, kb:adr/actions-mainhead-one-stop-resume-button, kb:adr/actions-pane-snapshot-display-only, kb:adr/actions-remove-allowed-on-live-session, kb:adr/lifecycle-resume-rebinds-existing-session, kb:adr/lifecycle-ended-rows-swept-next-start, kb:adr/surfaces-shell-dies-at-kill-shutdown-too, kb:adr/theme-danger-tokens-not-rose, kb:adr/launch-resume-one-alive-row-per-claude-session, kb:adr/launch-resume-pending-hold-persisted, kb:fact/resume-keeps-session-identity]
---
Three actions apply to a session: Stop, Resume and Remove. They live in the Focus mainhead
above the terminal, in tile footers, and in the right-click menu of rail and strip cards; no card
renders an action button. That menu opens at the pointer, or just under the card from the keyboard,
and is named `Actions for <title>`, or `Actions for N sessions` on a selected card in Select mode (kb:adr/rail-card-menu-on-selected-card-acts-on-selection). Stop and
Remove sit behind a confirm dialog; Resume acts at once. In the Focus mainhead Stop and Resume are one button, labelled by
whether the session is alive, that keeps its box across the swap
(kb:adr/actions-mainhead-one-stop-resume-button); tile footers keep their separate buttons. Destructive
buttons use the danger token family (kb:adr/theme-danger-tokens-not-rose). Every trigger
routes through one dispatcher in the actions controller.

**Stop** (`kb:anchor/sessions.end`; the endpoint keeps the name `end`) applies to a live
session. The daemon captures a final pane snapshot, kills the session's tmux session, closes its terminal sockets with the
pane-ended code and broadcasts the session with `alive:false`. The row and its Claude
session id survive, so the session can be resumed. Stop does not kill the session's shell
surface (kb:adr/surfaces-shell-dies-at-kill-shutdown-too). A failed Stop or Remove returns a
fixed-phrase `message`; the raw tmux or OS error goes to the daemon log only
(kb:anchor/transport).

**Resume** (`kb:anchor/sessions.resume`) applies to a dead session with a bound Claude
session id. The daemon rewrites the directory's project settings and relaunches `claude`
with `--resume` and the session's last-known effort as `--effort` (none when it never reported one;
kb:fact/resume-does-not-restore-effort) in a fresh tmux session under the same Muster row; the title and rail
position are kept, the header keeps the effort until the next report, a still-pending first-report effort
check is cancelled so no later mismatch warning follows (a daemon restart keeps it), the pane target is the new one, and the state stays until the resume
`SessionStart` lands it in `idle` (kb:adr/lifecycle-resume-rebinds-existing-session,
kb:fact/resume-keeps-session-identity). Resume is refused while the session is alive, when
no Claude session id is bound, when the directory no longer exists, or when another alive
session already holds that Claude session id — bound to it, or itself spawned to resume it and
not yet bound, a hold that survives a daemon restart
(kb:adr/launch-resume-one-alive-row-per-claude-session, kb:adr/launch-resume-pending-hold-persisted).

**Remove** (`kb:anchor/sessions.remove`) is allowed on a live session: it ends it first and
the dialog says so (kb:adr/actions-remove-allowed-on-live-session). The row is deleted, any
shell surface is killed, and `kb:anchor/ws.session-removed` is broadcast; event rows keep
their session id as an audit trail. A removed session cannot be resumed.

**The dead surface.** When a session is not alive, the Focus main slot and its tile replace
the terminal with an end bar, the last captured pane screen dimmed under a "session ended"
cap, and a Resume control. The screen comes from `kb:anchor/sessions.pane`: the daemon
captures every live pane on each liveness tick and immediately before Stop, persists the text
only when it changes, and serves the last capture. It is display only and never a state
source (kb:adr/actions-pane-snapshot-display-only). The dashboard fetches it once per dead
session and caches the result. Dead sessions ended in an earlier daemon lifetime are swept
at the next start (kb:adr/lifecycle-ended-rows-swept-next-start), so a Resume chance is one
daemon lifetime long.

**Batches.** Stop and Remove also apply to a rail selection, from the select bar or the menu of a selected card, and Stop to a group's members through
its header's Stop all…, by `kb:anchor/sessions.end-many` and `kb:anchor/sessions.remove-many`: daemon
batches that run each id under its own lock and report done, skipped and failed, never a dashboard
loop (kb:adr/actions-bulk-stop-remove-are-daemon-batches). Each batch confirms with its count; a bulk
Remove of live sessions says it stops them first; a partial result shows in the action-error line. That line clears a `Could not reach musterd.` message at the next hello and keeps any other message until the next action replaces or clears it.
Deleting a group can stop and remove its members the same way (kb:spec/groups).

Session-focusing shortcuts are inert while a confirm dialog is open. There is no undo for Remove.
