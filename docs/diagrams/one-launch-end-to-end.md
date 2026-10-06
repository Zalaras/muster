---
id: one-launch-end-to-end
type: diagram
status: active
date: 2026-10-05
kind: sequence
summary: One POST /api/sessions launch end to end — validation, model verdict, repo/settings/tmux side effects in order, then the trust prompt.
features: []
tags: [tmux, claude-code-format]
files: [internal/server/launcher.go, internal/server/launchergroup.go, internal/session/grouplaunch.go, internal/server/launchcreate.go, internal/claudecode/launch.go, internal/gitutil/**, internal/store/repo*.go]
tests: []
refs: [kb:spec/launch, kb:adr/launch-new-group-created-with-the-row-or-not-at-all, kb:adr/launch-trust-prompt-never-auto-answered, kb:adr/launch-settings-local-json-not-settings-json]
---
Moved out of `docs/features/launch/spec.md` (kb:spec/launch) once the resume-and-dangerously-allow
additions pushed that spec past its 800-word budget; the launch feature it depicts is unchanged.

The order matters at both ends: the settings file is written before any row exists or tmux is
touched, so a corrupt one fails with nothing to roll back. A `newGroup` row is inserted right
before the session row and held out of every snapshot and broadcast until the launch is
recorded; the rollback discards it, so a failed launch creates neither
(kb:adr/launch-new-group-created-with-the-row-or-not-at-all).

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
    S->>S: validateLaunchRequest — directory, model, permissionMode
    S->>S: verdict(model) from the model catalog cache — normally a hit (previous diagram)
    alt unrecognized
        S-->>UI: 400 model_unrecognized — nothing written
    else groupId names no group
        S-->>UI: 404 unknown_group — nothing written
    else recognized or unchecked
        S->>G: is this a repo, which branch, is it a worktree
        S->>DB: UpsertRepo — MRU and per-directory defaults
        S->>A: MergeSettings into .claude/settings.local.json
        Note over S,A: before any row or tmux — invalid JSON fails the launch and names the file
        S->>A: BuildArgv — model, --name, permission mode
        S->>T: MaxSessionID, to floor the id above any orphan
        opt newGroup
            S->>DB: CreateLaunchGroup — the rail_group row, held out of snapshots
        end
        S->>DB: CreateSession — inserts the row in started, groupId set

        S->>T: new-session on the muster socket, MUSTER_SESSION in the pane env
        T->>CC: runs the argv in the pane
        alt the tmux name already exists
            T-->>S: ErrSessionExists
            S->>DB: roll the row back, raise the floor, retry — the held group survives the retry
        end
        Note over S,DB: on final failure the rollback also runs DiscardLaunchGroup, so no group outlives a failed launch
        S->>DB: RecordLaunch — tmux target and pane; announces the held group
        S-->>UI: groups (when newGroup), then the session as sessionUpsert, before any hook

        CC->>I: SessionStart through the wrapper, carrying the envelope
        I-->>UI: bound and transitioned
        Note over CC,I: on a first launch into an unseen directory the trust prompt<br/>blocks startup, so no hook arrives and Muster only surfaces it
    end
```
