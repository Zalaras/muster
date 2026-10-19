---
id: card-location
type: spec
status: active
date: 2026-10-01
summary: The card's launch directory, its branch kept fresh by the repo poll, where Claude works when elsewhere, the directories added to it, and the bind's model name.
features: [card-location]
tags: [state-machine, ux]
go: [internal/server/reporefresh*.go, internal/session/location*.go, internal/session/repo*.go, internal/session/addeddirs*.go]
web: []
e2e: [web/e2e/card-location.spec.ts, web/e2e/helpers/card-location.ts, web/e2e/added-dirs.spec.ts, web/e2e/helpers/added-dirs.ts]
protocol: [ws.session]
refs: [kb:adr/lifecycle-card-shows-launch-directory-marks-claude-elsewhere, kb:adr/lifecycle-branch-refreshed-by-repo-poll, kb:adr/lifecycle-claude-location-from-main-agent-cwd, kb:adr/lifecycle-bind-model-display-name-is-id, kb:adr/ingest-claude-cwd-read-in-interpret-only, kb:adr/focus-header-readout-sized-by-text, kb:fact/cwd-follows-claude-mid-session, kb:fact/enter-worktree-moves-project-dir, kb:fact/cwd-changed-hook, kb:fact/hook-delivery-best-effort, kb:fact/sessionstart-model-optional-string, kb:fact/status-model-is-object, kb:fact/model-switch-hooks]
---
A card names the directory the session was launched in, and that stays true for the row's
lifetime: the shell, the docs reader, file drop and resume all use it
(kb:adr/lifecycle-card-shows-launch-directory-marks-claude-elsewhere). Claude's own working
directory moves mid-session (kb:fact/cwd-follows-claude-mid-session,
kb:fact/enter-worktree-moves-project-dir), so a second readout says where it is, and only
when that is a different checkout.

## Branch

The daemon re-reads a session's branch and worktree flag from its launch directory on a repo
poll: at start, every `-repo-poll` (default 5 s) and whenever Claude's reported directory
changes. `-repo-poll 0` disables the timer, leaving the start read and the nudge. A checkout
made by Claude, the shell pane or anything outside Muster therefore shows within one tick
(kb:adr/lifecycle-branch-refreshed-by-repo-poll). Only alive sessions whose launch directory
still exists are read. A dead card keeps its last-known `repo`; a directory that is gone keeps
both `repo` and `claudeLocation`. A reading in flight when the session died is dropped whole, even if a
resume lands before it does, and the next tick reads afresh. Git runs outside the session
manager's lock; an unchanged reading broadcasts nothing, and a changed one is a single
`sessionUpsert`.

## Where Claude is

Claude's directory is recorded from every main-agent hook's `cwd` and from the status line's
working directory. Subagent-marked events, `SubagentStart`, `SubagentStop` and absent or
empty values change nothing, and `CwdChanged` stays unregistered
(kb:adr/lifecycle-claude-location-from-main-agent-cwd, kb:fact/cwd-changed-hook). Hooks
arrive unordered (kb:fact/hook-delivery-best-effort), so a straggler can briefly revert it.

The poll derives `claudeLocation` from it: non-null only while the recorded directory is a
different checkout from the launch directory. Inside a git checkout the top levels decide, so
a worktree under the launch path still counts as elsewhere; outside one, the paths decide.
Both sides are symlink-resolved. It is display-only, never read by the state machine, and
null on a dead session. Launch and resume clear it, because Claude restarts in the launch
directory.

## Added directories

`addedDirs` is the status line's `workspace.added_dirs` from every status post, the launch
directory removed and each entry normalised like Claude's directory: absolute (a relative entry
resolves against the launch directory), cleaned and symlink-resolved; an entry that does not
exist is only cleaned. It is empty until the first such post after a launch or resume and on
every dead session; `/clear` and a daemon restart keep it. The repo poll refreshes each
directory's checkout reading under its own deadline, so a long list never stops the launch
directory's branch, worktree flag and `claudeLocation` refreshing; a directory missing or not
finished reading keeps its last reading. A worktree flag compares resolved paths, so a
subdirectory of an ordinary checkout is not a worktree and one inside a linked worktree is.

## Effort

The session's effort is the status line's `effort.level` from each post, `{"level": null}` when the key
is absent. No hook carries it, so a missed post leaves it stale until the next
(kb:fact/effort-changes-mid-session).

## Model name

A bind (`SessionStart`) naming a different model than the session holds sets its display name
to the id until the status line confirms a name, so it is never blank or stale. A bind naming
the held id changes nothing, so a confirmed name survives
(kb:adr/lifecycle-bind-model-display-name-is-id, kb:fact/sessionstart-model-optional-string,
kb:fact/status-model-is-object, kb:fact/model-switch-hooks).

The rail and tiles render the other fields; the Focus header alone renders `addedDirs`
(kb:spec/rail, kb:spec/tiles, kb:spec/focus). Their shapes are in `kb:anchor/ws.session`.

```mermaid
flowchart LR
    H[main-agent hook cwd] --> D[recorded Claude directory]
    S[status line directory] --> D
    L[launch or resume] -. clears .-> D
    D -- nudge --> P[repo poll]
    T[-repo-poll timer] --> P
    P -- git reads outside the lock --> R[repo and claudeLocation]
    R -- only when changed --> U[sessionUpsert]
```
