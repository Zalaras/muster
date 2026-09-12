---
id: lifecycle
type: spec
status: active
date: 2026-09-12
summary: The session state machine, liveness, reconcile on start, shutdown policy, resume to idle.
features: [lifecycle]
tags: [state-machine, store, tmux]
go: [internal/session/**, internal/server/sessionwire*.go, internal/store/session*.go, internal/store/store*.go, internal/store/migrate*.go, internal/store/migrations/**]
web: [web/src/sessions/store*.ts, web/src/sessions/live*.ts]
e2e: [web/e2e/reconcile.spec.ts, web/e2e/helpers/session.ts]
protocol: [state, state.displayed, state.tracked, state.transitions, state.ordering, state.liveness, ws.session, ws.session-upsert]
refs: [kb:adr/lifecycle-session-identity-is-tmux-target, kb:adr/lifecycle-alive-flag-not-a-state, kb:adr/lifecycle-liveness-from-pane-existence, kb:adr/lifecycle-prompt-ordering-guards, kb:adr/lifecycle-subagent-marked-events-not-stragglers, kb:adr/lifecycle-reconcile-before-first-snapshot, kb:adr/lifecycle-ended-rows-swept-next-start, kb:adr/lifecycle-resume-rebinds-existing-session, kb:adr/lifecycle-shutdown-leaves-sessions-running, kb:adr/ingest-seq-assigned-at-ingest, kb:fact/hook-delivery-best-effort, kb:fact/stopfailure-replaces-stop, kb:fact/sessionend-reason-ambiguous, kb:fact/notification-types-observed, kb:fact/permission-mode-presence-split, kb:fact/subagent-hooks-carry-agent-id, kb:fact/resume-keeps-session-identity, kb:fact/clear-mints-new-session-id, kb:ref/data-model, docs/design/ux-flows.md]
---
A Muster session is one `claude` process the daemon launched into its own tmux session.
Its identity is the tmux target; the Claude `session_id` is a mutable attribute that
`/clear` replaces in the same pane (kb:adr/lifecycle-session-identity-is-tmux-target,
kb:fact/clear-mints-new-session-id). The persisted row and its columns are described in
kb:ref/data-model.

## States

Six displayed states (`kb:anchor/state.displayed`): `started` (launched, nothing has
happened), `planning` (mid-turn with the permission-mode latch on `plan`), `working`
(mid-turn), `needs_input` (a permission or idle prompt is waiting, with `attention.reason`
and `attention.since`), `failed` (a turn ended in an error, with the raw error token and
message) and `idle` (a turn finished, with `lastActivity`). There is deliberately no
"Done": Claude Code knows a turn ended, not that a task completed, so `idle` plus the last
activity line is the honest representation (docs/design/ux-flows.md "States and ordering").
Liveness is an orthogonal `alive` flag, never a seventh state
(kb:adr/lifecycle-alive-flag-not-a-state): a dead session keeps its last state, greys out,
sorts last and offers Resume or Remove.

## Inputs

State is derived only from ingested hook events, Muster's own launch and resume actions and
tmux pane liveness. Terminal output is never a state source. The interpreter in the Claude
Code adapter turns each event into a neutral input kind; the state machine sees no payload
vocabulary. `Stop` closes a turn into `idle`; `StopFailure` closes it into `failed`
(kb:fact/stopfailure-replaces-stop). Notification `permission_prompt` and `idle_prompt`,
and `PermissionRequest`, enter `needs_input` (kb:fact/notification-types-observed).
Turn-activity events (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`) enter `working` or
`planning` and clear attention and failure. `PreCompact` increments the compaction counter.
`SessionEnd` is a death hint only (kb:fact/sessionend-reason-ambiguous). The permission
mode is a last-known latch seeded by the launch form and overwritten by any event that
carries the field; events without it never reset it (kb:fact/permission-mode-presence-split).
The full table is `kb:anchor/state.transitions`; tracked variables are `kb:anchor/state.tracked`.

## Ordering and loss

Events apply in ingest `seq` order (kb:adr/ingest-seq-assigned-at-ingest). A Stop-family
event closes its `prompt_id`; an unmarked later event for a closed prompt is a straggler
that changes nothing, while a subagent-marked one moves the session back to active without
reopening the prompt (kb:adr/lifecycle-prompt-ordering-guards,
kb:adr/lifecycle-subagent-marked-events-not-stragglers, kb:fact/subagent-hooks-carry-agent-id).
Any unseen `prompt_id` starts a turn, so every transition self-heals a lost predecessor.
Delivery is lossy and unordered by nature (kb:fact/hook-delivery-best-effort); the machine
never waits for an event to make progress (`kb:anchor/state.ordering`).

## Liveness, reconcile, shutdown

`alive` is decided by pane existence on the muster socket, polled and nudged by
`SessionEnd`, PTY EOF and End (kb:adr/lifecycle-liveness-from-pane-existence,
`kb:anchor/state.liveness`). Reconcile at daemon start runs before the first snapshot is
served: rows already ended are deleted, live rows whose pane is gone are marked ended at
startup time and kept for one resume chance, unknown Muster-shaped tmux sessions are logged
and never adopted, and every shell tmux session is killed
(kb:adr/lifecycle-reconcile-before-first-snapshot, kb:adr/lifecycle-ended-rows-swept-next-start).
Resume relaunches a dead session with `--resume` into a fresh pane under the same Muster row
and title; the resume `SessionStart` rebinds it and lands it in `idle`
(kb:adr/lifecycle-resume-rebinds-existing-session, kb:fact/resume-keeps-session-identity).
Shutdown leaves sessions running by default; the `-on-exit` flag offers ask, leave and kill
(kb:adr/lifecycle-shutdown-leaves-sessions-running).

## Wire

Every change broadcasts the whole Session object (`kb:anchor/ws.session`,
`kb:anchor/ws.session-upsert`); the client replaces by id and sorts for display. Status
posts refresh title, model and context only and never touch a state-machine field.
