---
id: actions
type: spec
status: active
date: 2026-09-12
summary: End, Resume and Remove a session, the pane snapshot for dead sessions, confirm dialogs.
features: [actions]
tags: [ux]
go: [internal/server/sessions*.go]
web: [web/src/features/actions.ts, web/src/render/confirm.ts, web/src/render/dead*.ts]
e2e: [web/e2e/actions.spec.ts]
protocol: [sessions.end, sessions.resume, sessions.remove, sessions.pane, ws.session-removed]
refs: [kb:adr/actions-placement-mainhead-and-card-rows, kb:adr/actions-pane-snapshot-display-only, kb:adr/actions-remove-allowed-on-live-session, kb:adr/lifecycle-resume-rebinds-existing-session, kb:adr/lifecycle-ended-rows-swept-next-start, kb:adr/surfaces-shell-lifetime-until-exit-remove-or-reconcile, kb:adr/theme-danger-tokens-not-rose, kb:fact/resume-keeps-session-identity]
---
Three actions apply to a session: End, Resume and Remove. They live in the Focus mainhead
above the terminal and in hover-revealed action rows on rail cards and tile footers, each
behind a confirm dialog (kb:adr/actions-placement-mainhead-and-card-rows). Destructive
buttons use the danger token family (kb:adr/theme-danger-tokens-not-rose). Every trigger
routes through one dispatcher in the actions controller.

**End** (`kb:anchor/sessions.end`) applies to a live session. The daemon captures a final
pane snapshot, kills the session's tmux session, closes its terminal sockets with the
pane-ended code and broadcasts the session with `alive:false`. The row and its Claude
session id survive, so the session can be resumed. End does not kill the session's shell
surface (kb:adr/surfaces-shell-lifetime-until-exit-remove-or-reconcile).

**Resume** (`kb:anchor/sessions.resume`) applies to a dead session with a bound Claude
session id. The daemon rewrites the directory's project settings and relaunches `claude`
with `--resume` in a fresh tmux session under the same Muster row; the title and rail
position are kept, the pane target is the new one, and the state stays until the resume
`SessionStart` lands it in `idle` (kb:adr/lifecycle-resume-rebinds-existing-session,
kb:fact/resume-keeps-session-identity). Resume is refused while the session is alive, when
no Claude session id is bound, or when the directory no longer exists.

**Remove** (`kb:anchor/sessions.remove`) is allowed on a live session: it ends it first and
the dialog says so (kb:adr/actions-remove-allowed-on-live-session). The row is deleted, any
shell surface is killed, and `kb:anchor/ws.session-removed` is broadcast; event rows keep
their session id as an audit trail. A removed session cannot be resumed.

**The dead surface.** When a session is not alive, the Focus main slot and its tile replace
the terminal with an end bar, the last captured pane screen dimmed under a "session ended"
cap, and a Resume control. The screen comes from `kb:anchor/sessions.pane`: the daemon
captures every live pane on each liveness tick and immediately before End, persists the text
only when it changes, and serves the last capture. It is display only and never a state
source (kb:adr/actions-pane-snapshot-display-only). The dashboard fetches it once per dead
session and caches the result. Dead sessions ended in an earlier daemon lifetime are swept
at the next start (kb:adr/lifecycle-ended-rows-swept-next-start), so a Resume chance is one
daemon lifetime long.

Session-focusing shortcuts are inert while a confirm dialog is open. There are no bulk
actions and no undo for Remove.
