---
id: plan-approval-request-teammate-only
type: fact
status: active
date: 2026-09-13
summary: plan_approval_request is sent only by a teammate agent spawned with plan mode required, into the lead's file inbox; a top-level session never emits it.
features: [lifecycle]
tags: [claude-code-format]
files: []
tests: []
refs: [docs/history/design/markdown-viewing.md, kb:fact/plan-mode-hook-sequence, kb:fact/permission-request-races-terminal-prompt]
verified: 2.1.268..2.1.269
guard: none
---
Claude Code's `ExitPlanMode` has two exits. When the caller is a **teammate** (`dynamicTeamContext`
with `agentId` + `teamName`, or in-swarm) **and** plan mode is required for it (`planModeRequired`
on the team context, or `CLAUDE_CODE_PLAN_MODE_REQUIRED`), it builds

```js
{type:"plan_approval_request", from, timestamp, planFilePath, planContent, requestId}
```

and writes it into the **team lead's inbox** — a JSON file at `~/.claude/teams/<team>/inboxes/<agent>.json`
(`[TeammateMailbox] getInboxPath`) — then returns "Your plan has been submitted to the team lead for
approval … you will receive a message in your inbox". The lead, another Claude session, answers with
`plan_approval_response {requestId, approved, feedback?, permissionMode?}` through the same mailbox.

Every other caller — including the top-level interactive session Muster launches — takes the
local branch: the plan-approval dialog, the `PermissionRequest` hook, and the `prePlanMode` →
`acceptEdits` switch (kb:fact/plan-mode-hook-sequence). **No inter-process plan-approval message
exists for a top-level session**, so Muster cannot observe or answer plan approval through the
teammate mailbox or the `/tmp/cc-socks/<pid>.sock` peer socket (which carries `notify_when_idle`,
`peer_message_status` and file attachments, not plan approval). Plan approval from the dashboard
still rests on kb:fact/permission-request-races-terminal-prompt.

Evidence: code read from the installed 2.1.268, 2.1.269 and 2.1.270 bundles (identical string
counts for `plan_approval_request`, `awaitingLeaderApproval`, the lead-inbox error and
`getInboxPath`); on disk, 15 inbox files and 0 carry a `plan_approval_request`; 51 `ExitPlanMode`
calls across 281 transcripts, every plan-mode reminder `isSubAgent:false`, none "submitted to the
team lead". No live session was launched — the gate is a plain teammate check, so the zero-token
read answers it. The range stops at 2.1.269 because that is the canary ceiling; 2.1.270 holds.
