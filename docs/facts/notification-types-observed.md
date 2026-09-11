---
id: notification-types-observed
type: fact
status: active
date: 2026-09-11
summary: Notification.notification_type: idle_prompt ~60 s after Stop, and permission_prompt sharing PermissionRequest's prompt_id.
features: [lifecycle, ingest]
tags: [claude-code-format]
files: [internal/claudecode/interpret.go, internal/session/machine.go]
tests: [TestInterpret_Notification]
refs: [spikes/FINDINGS.md, plan:canary-full-coverage]
verified: 2.1.233..canary
guard: TestNotifications
---
Two `notification_type` values are observed. `"idle_prompt"` (message `"Claude is waiting for
your input"`) follows `Stop` after about a minute: 60.04 s on 2.1.267, 60.03 s on 2.1.259.
`"permission_prompt"` (message `"Claude needs your permission"`) follows
`PreToolUse{ExitPlanMode}` → `PermissionRequest{ExitPlanMode}` and shares that request's
`prompt_id`. A `Notification` carries `prompt_id`, `notification_type`, `message` and no
`permission_mode`.

Other values present in the binary but never observed: `auth_success`, `agent_needs_input`,
`agent_completed`, `elicitation_dialog`.

Evidence: 2.1.233 spikes (FINDINGS §5); asserted since 2026-09-10 by run D (idle_prompt after
Stop, waited up to 90 s, the gap logged never asserted) and run E (prompt_id match, 1/1).
