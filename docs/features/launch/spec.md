---
id: launch
type: spec
status: active
date: 2026-09-12
summary: Launch dialog, repo browse and picker, trust prompt, project-scoped settings write, the claude argv.
features: [launch]
tags: [tmux]
go: [internal/server/browse*.go, internal/server/repos*.go, internal/server/sessions*.go, internal/server/main_test.go, internal/claudecode/launch*.go, internal/gitutil/**, internal/store/repo*.go]
web: [web/src/features/launch.ts, web/src/render/crumbs*.ts]
e2e: [web/e2e/launch.spec.ts, web/e2e/tiles-launch.spec.ts, web/e2e/permission-mode.spec.ts, web/e2e/helpers/picker.ts]
protocol: [sessions.create, repos.list, browse.get]
refs: [kb:adr/launch-picker-recent-sidebar-plus-browse-list, kb:adr/launch-browse-via-daemon-not-native-chooser, kb:adr/launch-hybrid-mru-directory-memory, kb:adr/launch-form-seeds-model-and-permission-mode, kb:adr/launch-model-presets-passed-verbatim, kb:adr/launch-permission-modes-offered-four-tabbed, kb:adr/launch-bypass-and-dontask-unoffered, kb:adr/launch-trust-prompt-never-auto-answered, kb:adr/launch-settings-local-json-not-settings-json, kb:adr/launch-project-scoped-settings-not-config-dir, kb:adr/tiles-launched-session-promoted-into-grid, kb:fact/name-flag-reaches-title, kb:fact/permission-mode-flag-on-wire, kb:fact/permission-mode-auto-model-gated, kb:fact/fable-model-alias, kb:fact/local-settings-honoured, kb:fact/config-dir-breaks-oauth, kb:fact/trust-prompt-preselects-exit, docs/design/ux-flows.md]
---
Sessions are launched from the dashboard and nowhere else: macOS gives no access to another
process's PTY, so Muster manages only what it started. The dialog opens from the rail's New
session button, the Tiles toolbar button or the launch chord (kb:spec/shortcuts).

## The picker

A Finder-style picker: a Recent sidebar beside a clickable breadcrumb over one child
listing served by `kb:anchor/browse.get`, rooted at the `-browse-root` directory
(kb:adr/launch-picker-recent-sidebar-plus-browse-list, kb:adr/launch-browse-via-daemon-not-native-chooser).
The listed directory is the selection; descending into a child changes it, the parent chord
goes up, and the footer always states where the launch will happen. Git checkouts are
marked. Recents come from `kb:anchor/repos.list`, ordered pinned then most recently
launched; clicking one navigates there and restores that directory's last model and
permission mode. Directory memory is hybrid: every launch remembers its directory as a repo
row, with promotion reserved for rows that carry per-repo config, which nothing writes yet
(kb:adr/launch-hybrid-mru-directory-memory). No worktree is created; one the picker is
pointed at is recognised so the session shows repo and branch truthfully.

## The form

Title is optional and maps to `--name` (kb:fact/name-flag-reaches-title); blank lets Claude
Code auto-generate one. Model is a segmented control of presets plus a free-text override,
passed to `--model` verbatim (kb:adr/launch-model-presets-passed-verbatim,
kb:fact/fable-model-alias). Start in offers Claude Code's four tabbed modes under its own
labels, where manual is the wire's `default` (kb:adr/launch-permission-modes-offered-four-tabbed,
kb:fact/permission-mode-flag-on-wire); bypass and don't-ask are not offered
(kb:adr/launch-bypass-and-dontask-unoffered). The chosen mode seeds the permission-mode
latch, which the first hook carrying the field corrects; a mode the model cannot run is
corrected the same way (kb:adr/launch-form-seeds-model-and-permission-mode,
kb:fact/permission-mode-auto-model-gated). Model and Start in default to the directory's
last-used values.

## What launch does

`kb:anchor/sessions.create` upserts the repo row, ensures the directory's project-scoped
`.claude/settings.local.json` carries Muster's hook and status-line entries
(kb:adr/launch-settings-local-json-not-settings-json, kb:fact/local-settings-honoured),
creates the tmux session on the muster socket with the Muster session id in the pane
environment, spawns `claude` with the assembled argv, and inserts the session row in
`started`, broadcast immediately so the card appears before any hook arrives. A settings
file that exists but is not valid JSON fails the launch and names the file. Muster never
touches the user-level settings or `CLAUDE_CONFIG_DIR`
(kb:adr/launch-project-scoped-settings-not-config-dir, kb:fact/config-dir-breaks-oauth).
A launch from Tiles promotes the new session into the grid
(kb:adr/tiles-launched-session-promoted-into-grid).

## One launch, end to end

The order matters at both ends: the settings file is written before any row exists or tmux is
touched, so a corrupt one fails with nothing to roll back; and the card is broadcast from the
inserted row, before any hook has arrived.

```mermaid
sequenceDiagram
    participant UI as dashboard
    participant S as sessions handler
    participant G as gitutil
    participant DB as store
    participant A as claudecode adapter
    participant T as tmux
    participant CC as claude
    participant I as ingest

    UI->>S: POST /api/sessions
    S->>G: is this a repo, which branch, is it a worktree
    S->>DB: UpsertRepo — MRU and per-directory defaults
    S->>A: MergeSettings into .claude/settings.local.json
    Note over S,A: before any row or tmux — invalid JSON fails the launch and names the file
    S->>A: BuildArgv — model, --name, permission mode
    S->>T: MaxSessionID, to floor the id above any orphan
    S->>DB: CreateSession — inserts the row in started

    S->>T: new-session on the muster socket, MUSTER_SESSION in the pane env
    T->>CC: runs the argv in the pane
    alt the tmux name already exists
        T-->>S: ErrSessionExists
        S->>DB: roll the row back, raise the floor, retry
    end
    S->>DB: RecordLaunch — tmux target and pane
    S-->>UI: the session, broadcast as sessionUpsert before any hook

    CC->>I: SessionStart through the wrapper, carrying the envelope
    I-->>UI: bound and transitioned
    Note over CC,I: on a first launch into an unseen directory the trust prompt<br/>blocks startup, so no hook arrives and Muster only surfaces it
```

## The trust prompt

On the first launch into a directory Claude Code has not seen, its workspace-trust prompt
blocks startup: no hooks fire and no status line renders. Muster surfaces it and never
answers it (kb:adr/launch-trust-prompt-never-auto-answered, kb:fact/trust-prompt-preselects-exit).
Detection is by absence and by Muster's own records: a session whose directory had no repo
row says "first launch here — likely waiting on Claude Code's trust prompt" from the moment
it appears, and any other session with no `SessionStart` after a short wait says "no signal
yet" (docs/design/ux-flows.md "First-launch trust prompt"). Neither reads the pane.
