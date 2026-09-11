---
id: permission-suggestions-optional
type: fact
status: active
date: 2026-09-11
summary: PermissionRequest.permission_suggestions is optional: present on a Write request in default mode, absent on ExitPlanMode in plan mode.
features: [ingest]
tags: [claude-code-format]
files: [web/e2e/helpers/payloads.ts]
tests: []
refs: [spikes/FINDINGS.md, plan:canary-full-coverage]
verified: 2.1.233..canary
guard: TestNotifications
---
`PermissionRequest.permission_suggestions` is optional. When present it is an array of
`{type:"setMode", mode:"acceptEdits", destination:"session"}` — seen on a `Write` request in
`default` mode (2.1.233 FINDINGS; 2.1.259 subagent capture). It is absent on the
`ExitPlanMode` request in `plan` mode: on 2.1.267 (run E, 1/1) the keys were exactly `cwd,
scratchpad_dir, prompt_id, permission_mode, session_id, transcript_path, hook_event_name,
tool_name, tool_input`.

No production code reads it. The guard logs presence and shape-checks the first entry
(`type`, `mode`, `destination`) only when present.
