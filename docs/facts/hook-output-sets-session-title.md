---
id: hook-output-sets-session-title
type: fact
status: active
date: 2026-10-05
summary: A UserPromptSubmit hook's hookSpecificOutput.sessionTitle renames the session (nameSource "hook"); SessionStart's output accepts the same field.
features: [rename, ingest]
tags: [claude-code-format]
files: []
tests: []
refs: [test/rig/captures/capture-3.jsonl, kb:fact/hook-await-per-event, kb:fact/slash-rename-immediate-no-hook]
verified: 2.1.289..2.1.289
guard: none
---
An http `UserPromptSubmit` hook that answered
`{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","sessionTitle":"ProbeFoxtrot71"}}`
renamed the session when the prompt was submitted: the prompt box relabelled, and the registry
read `name: "ProbeFoxtrot71"`, `nameSource: "hook"` (1/1). The name took effect at that prompt,
so this route renames on the session's next submitted prompt, never in between.

The 2.1.289 hook-output schema also gives `SessionStart`'s `hookSpecificOutput` an optional
`sessionTitle` ("Set the session title"). That half was read from the bundle and not exercised.
A hook-set title goes through the same uniqueness check as `/rename`
(kb:fact/session-name-uniqueness-flagged), and an unchanged title is skipped.

The answering hook must print to stdout (command hook) or return the body (http hook), and
`UserPromptSubmit` is awaited (kb:fact/hook-await-per-event). The probe's canned body went to
every event, so the turn's Stop hook reported "Stop hook error occurred"; scope such a reply to
`UserPromptSubmit` alone.

Evidence: probe session s2 on capture-3, 2026-10-05.
