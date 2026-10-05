---
id: past-sessions
type: spec
status: active
date: 2026-09-28
summary: The launch dialog's Resume tab — a directory's Claude Code sessions listed from transcripts, the running-session guard, resume in the original mode.
features: [past-sessions]
tags: [claude-code-format, ux]
go: [internal/claudecode/launchtranscripts*.go, internal/server/launcherpast*.go]
web: [web/src/features/launchresume*.ts, web/src/features/launchpastlist*.ts, web/src/render/launchpast*.ts]
e2e: [web/e2e/past-sessions.spec.ts, web/e2e/helpers/resume.ts]
protocol: [pastsessions.list]
refs: [kb:spec/launch, kb:adr/launch-resume-listed-from-transcripts-by-cwd, kb:adr/launch-resume-running-guard-muster-only, kb:adr/launch-resume-pending-hold-persisted, kb:adr/launch-resume-one-alive-row-per-claude-session, kb:adr/launch-resume-in-original-mode-else-default, kb:adr/launch-resume-passes-any-recorded-mode, kb:adr/launch-resume-display-name-falls-back-to-id, kb:fact/transcript-dir-encoding, kb:fact/transcript-session-lines, kb:fact/no-running-session-signal, kb:fact/resume-restores-model-and-mode-except-plan, "#62", kb:adr/launch-group-row-moves-between-tabs]
---
The launch dialog's head carries New and Resume tabs (`kb:spec/launch`); the Resume tab lists a
directory's own Claude Code sessions and resumes one Muster never started (issue #62). It carries
the New tab's Group row under the list, and the resumed session joins the chosen group
(kb:adr/launch-group-row-moves-between-tabs).

## The list

`kb:anchor/pastsessions.list` reads the picker's listed directory's transcript folder — found by
Claude Code's own folder-name encoding, matched by a 200-character prefix when the encoded name
runs long — and returns every session whose transcript records that directory as `cwd`
(kb:adr/launch-resume-listed-from-transcripts-by-cwd, kb:fact/transcript-dir-encoding). Title,
last prompt, permission mode and model come from each transcript's last ~64 KB
(kb:fact/transcript-session-lines): title is the last custom-title, else the last ai-title, else
none. Rows sort newest `lastActiveAt` (the transcript file's own mtime) first, capped at 200 with
`truncated` and a "Showing the newest 200" line. A directory Claude Code never ran in, or an
unreadable projects directory, reads as an empty list, never an error; the daemon only ever reads
there, never writes. The filter box matches title and last prompt case-insensitively; a selection
the filter hides is dropped.

## The running-session guard

Each row carries `openSessionId`: the alive Muster session already holding this Claude session id
— bound to it, or itself spawned to resume it and not yet bound
(kb:adr/launch-resume-pending-hold-persisted). Such a row is disabled and its last-prompt line
reads "open in Muster"; the default selection is the first row that isn't
(kb:adr/launch-resume-running-guard-muster-only). The hold is stored with the row, so it survives a
daemon restart until the row binds or ends. A session running outside Muster — a plain terminal, another tool — cannot be
detected and stays enabled (kb:fact/no-running-session-signal); Claude Code, not Muster, owns two
processes sharing one conversation.

## Resume in the original mode

Resuming a row always creates a new Muster session, never reuses a dead one that shares the id
(kb:adr/launch-resume-one-alive-row-per-claude-session), running `claude --resume <id>
--permission-mode <mode>` with no `--model` and no `--name`. `<mode>` is the transcript's last
recorded permission mode, verbatim — including one the launch form never offers, such as
`dontAsk` — or `default` when none was recorded (kb:adr/launch-resume-in-original-mode-else-default,
kb:adr/launch-resume-passes-any-recorded-mode, kb:fact/resume-restores-model-and-mode-except-plan).
The row is seeded from the listing: `title`, and, when the transcript recorded a model,
`model.displayName` equal to that model id until the status line confirms the real name, as any
launch does — never null (kb:adr/launch-resume-display-name-falls-back-to-id); with no model
recorded, `model` is null, which `kb:spec/focus`'s mainhead renders as `unknown`. The row stays
`started` until the enveloped `SessionStart{source:"resume"}` binds it into `idle`. A resume of an
id already held — bound, or itself mid-resume — is refused `409 already_open`, naming that session;
a transcript deleted since the list was read is `404 unknown_claude_session`, caught here even
though the list already showed it.

## End to end

```mermaid
sequenceDiagram
    participant UI as dashboard
    participant P as past-sessions handler
    participant A as claudecode adapter
    participant FS as Claude Code projects dir
    participant S as sessions handler
    participant T as tmux
    participant CC as claude
    participant I as ingest

    UI->>P: GET /api/past-sessions?directory=…
    P->>A: PastSessions(projectsDir, resolved directory)
    A->>FS: folder by encoded name (200-char prefix match when long)
    A->>FS: tail 64 KB of each *.jsonl — title, last prompt, mode, model, cwd
    A-->>P: sessions whose cwd is the directory
    P->>P: mark openSessionId from alive rows (bound or pending a resume)
    P-->>UI: 200 newest first
    UI->>S: POST /api/sessions {directory, resumeSessionId}
    S->>A: look the id up again (exists? mode? model? title?)
    alt held by an alive row (bound or pending a resume)
        S-->>UI: 409 already_open
    else found
        S->>S: TouchRepo, MergeSettings, CreateSession (started, seeds)
        S->>T: new-session, MUSTER_SESSION in pane env
        T->>CC: claude --resume id --permission-mode mode
        S-->>UI: 201, broadcast sessionUpsert
        CC->>I: SessionStart{source:"resume", same id}
        I-->>UI: bound, idle
    end
```
