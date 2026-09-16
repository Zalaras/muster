---
id: domain-model
type: diagram
status: active
date: 2026-09-15
kind: domain
summary: The logical model in plain terms — a Session, its Repo, Terminals, Tabs, Events, Context Usage and plan, beside Account Usage and User Settings.
features: []
tags: []
files: []
tests: []
refs: [kb:ref/data-model, kb:spec/lifecycle, kb:spec/launch, kb:spec/surfaces, kb:spec/reader, kb:spec/ingest, kb:spec/usage, kb:spec/settings, kb:adr/lifecycle-session-identity-is-tmux-target, kb:adr/surfaces-one-live-client-per-attach-target, kb:adr/launch-hybrid-mru-directory-memory]
---
What Muster keeps track of and how the pieces relate, in the dashboard's words, as it exists
today; each box names its identity and its vocabularies.

A **Session** is one Claude Code run that Muster launched, identified by the Terminal it
runs in; its Claude session id is an attribute that `/clear` replaces. It is launched into a
**Repo**, a directory remembered by path with its last launch choices; branch and
worktree flag are recorded on the session at launch, and Muster never creates a worktree. Every session runs inside a **Terminal** kept
alive by tmux, and may have a second, shell one that outlives its end; only the Claude
terminal carries liveness and a snapshot when dead. Claude Code reports back as **Events**,
numbered per Claude session id; hook events drive state, the status-line event refreshes
readings and never touches state, and an event whose envelope names no session is kept
unrouted.
**Context Usage** is the session's reading of its context window. **Account Usage** is the
account's rate-limit readings, fed by status events from any session and Muster's poll.
**Claude's Session Plan** is the document Claude writes in plan mode, at most one per
session. The dashboard looks at a session through three **Tabs**; the Claude and
Shell tabs each attach to their own Terminal, and each Terminal is live in one client at a
time. **User Settings** are one set per install.

Rules the boxes cannot say: state comes only from events and launch actions, never
terminal text; a dead session keeps its last state; pinned sessions precede unpinned ones.
Tab stays because it is the word the user sees.

```mermaid
%%{init: {"layout": "elk"}}%%
classDiagram
    direction LR
    class Session {
        identity: its Claude Terminal
        claude_session_id
        state: started, planning, working,
        needs_input, failed, idle
        alive
        permission_mode: default, acceptEdits, plan, auto
        title, title_override
        branch, is_worktree
        pane snapshot when dead
        pinned, position
    }
    class Repo {
        identity: path
        is_git
        last_model, last_permission_mode
        launch_count, last_launched
        pinned
    }
    class Terminal {
        identity: tmux target
        kind: claude, shell
        live in one client at a time
    }
    class Tab {
        identity: session + kind
        kind: claude, shell, docs
    }
    class Event {
        identity: claude_session_id + sequence
        type: hook name, or status_line
        muster_session, null when unrouted
        prompt_id
        payload
    }
    class ContextUsage["Context Usage"] {
        identity: its Session
        percent_used
        tokens, window
        compactions
    }
    class AccountUsage["Account Usage"] {
        identity: the one account
        five_hour_bucket
        seven_day_bucket
        per_model_weekly_window
    }
    class ClaudesSessionPlan["Claude's Session Plan"] {
        identity: file path
        exists
    }
    class UserSettings["User Settings"] {
        identity: the one install
        view: focus, tiles
        density: 2x2, 3x2
        rail_sort: manual, attention
        usage_model
        theme: follow, instrument, dark, light
        update_check
    }
    Repo "1" --> "*" Session : is launched into by
    Session "1" *-- "1..2" Terminal : runs in
    Session "1" *-- "*" Event : receives, in sequence
    Session "1" *-- "1" ContextUsage : reports
    Session "1" --> "0..1" ClaudesSessionPlan : writes in plan mode
    Session "1" *-- "3" Tab : is looked at through
    Tab "1" --> "0..1" Terminal : attaches to
    Tab --> ClaudesSessionPlan : Docs tab shows
    Event "*" ..> "1" AccountUsage : status events feed
```

Not shown: the rail and tiles, which only draw the session list; the access tokens, on the
containers diagram; the transcript, which only locates the plan.
