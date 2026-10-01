---
id: model-switch-hooks
type: fact
status: active
date: 2026-10-01
summary: /model fires PreModelSwitch and PostModelSwitch (from_model, to_model, source); the status line shows the new model at once, before any prompt.
features: [ingest, lifecycle, usage]
tags: [claude-code-format]
files: [internal/claudecode/status.go, internal/claudecode/interpret.go]
tests: [TestInstalledBinaryCarriesInterfaceStrings]
refs: [test/rig/captures/capture-3.jsonl, kb:fact/status-model-is-object, kb:fact/sessionstart-model-optional-string]
verified: 2.1.286..canary
guard: TestInstalledBinaryCarriesInterfaceStrings
---
A mid-session model change is reported two ways, with no prompt needed.

**Hooks.** `PreModelSwitch`, then `PostModelSwitch`, each reaching both an http hook and a
command wrapper. Payload beyond the common set (`cwd`, `prompt_id`, `session_id`, …):

```json
{"from_model":"claude-haiku-4-5-20251001","to_model":"claude-sonnet-5-5",
 "requested_model":"sonnet","source":"command","context_tokens":0,
 "estimated_cache_write_usd":0,"cache_ttl":"1h","prompt_cache_warm":false,"pricing":"catalog"}
```

`to_model` is the resolved id; `requested_model` is what was typed (an alias or a full id).
The bundle describes `PreModelSwitch` as covering "/model, model picker, set_model" and
`PostModelSwitch` as "after the session model changes (any cause)". Only
`source:"command"` was observed.

**Status line.** The next post, about a second later with no turn, carries the new
`model{id, display_name}` (3 of 3 switches).

`SessionStart` is no help here: it does not fire on a switch, and its `model` is often absent
(kb:fact/sessionstart-model-optional-string). The status line carries the live model.

Evidence: probe instance 3, 2026-10-01, sessions `c80dcde6` (haiku→sonnet) and `8b5e8581`
(haiku→sonnet→haiku).

The guard checks only that both events and `requested_model` are still in the bundle. A live check would need `/model`, which writes the user settings (kb:fact/slash-model-effort-write-user-settings).
