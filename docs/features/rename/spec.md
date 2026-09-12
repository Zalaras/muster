---
id: rename
type: spec
status: active
date: 2026-09-12
summary: Muster-owned session title override, inline rename in the mainhead and tiles.
features: [rename]
tags: [ux]
go: [internal/server/sessions*.go, internal/server/title_test.go, internal/session/title_test.go]
web: [web/src/features/rename.ts, web/src/render/rename.ts, web/src/sessions/rename*.ts]
e2e: [web/e2e/rename.spec.ts]
protocol: [sessions.title]
refs: [kb:adr/rename-title-from-status-line-session-name, kb:adr/rename-muster-owned-title-override-wins, kb:adr/views-active-segment-click-commits-rename, kb:fact/name-flag-reaches-title, kb:fact/status-session-name-source]
---
A session's displayed title has two sources. Claude Code's own name is read from the status
line's `session_name`, which reflects the launch `--name`, a `/rename` in the session and
the title Claude Code auto-generates when none was given
(kb:adr/rename-title-from-status-line-session-name, kb:fact/status-session-name-source,
kb:fact/name-flag-reaches-title). The launch form's title reaches Claude Code unchanged as
`--name` and is not an override.

A rename from the dashboard is Muster-owned: it sets a nullable `titleOverride` on the
session row, and the wire `title` is the override when set, else Claude's last-known name,
else null (kb:adr/rename-muster-owned-title-override-wins, `kb:anchor/sessions.title`).
Status posts keep refreshing Claude's name into its own column but never read or write the
override; while an override is set, a post that changes only Claude's name broadcasts
nothing. Clearing the override with an empty rename falls back to Claude's name. The
override survives rebinds, resume and reconcile, and a dead session can be renamed.

The editor is inline: the Focus mainhead's name and each tile's header open an editor on
activation. Enter commits, Escape cancels, and the trimmed value must be one to one hundred
characters or the request is refused. The commit is fire-and-forget: the resulting session
upsert drives the redraw, never the locally typed text. Switching views cancels an open
rename; clicking the already-active view segment commits it instead
(kb:adr/views-active-segment-click-commits-rename).

Rename does not change Claude Code's own session name and does not touch the rail order
or any state-machine field.
