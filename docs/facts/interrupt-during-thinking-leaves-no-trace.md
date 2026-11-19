---
id: interrupt-during-thinking-leaves-no-trace
type: fact
status: active
date: 2026-11-19
summary: Esc while a typed prompt's first thinking block streams rewinds it and leaves no hook or transcript line; a task-notification turn's Esc is marked.
features: [lifecycle]
tags: [claude-code-format, state-machine]
files: [internal/claudecode/interpret_transcript.go, internal/session/interrupt.go]
tests: []
refs: [kb:fact/interrupt-before-output-leaves-no-trace, kb:fact/interrupt-recorded-in-transcript, kb:adr/lifecycle-early-interrupt-gap-accepted, "#127"]
verified: 2.1.328..2.1.328
guard: none
---
The "before any output" window of kb:fact/interrupt-before-output-leaves-no-trace covers the
whole first thinking block, not only the first request. A typed prompt asking for long
reasoning showed `thinking` with a growing token count ("8s · ↓ 784 tokens · thinking"). Esc at
that point printed "Interrupted · What should Claude do instead?" and put the prompt text back
in the input box. Then:

- no hook of any kind for 63 s (the next prompt was submitted after that);
- no `idle_prompt`;
- the transcript's last line for the `promptId` stays the user's own message, followed only by
  `attachment` and `api-request` lines. No `assistant` line was written, because a thinking
  block is written only once it completes;
- the status line keeps posting the rewound `prompt_id` with `total_api_duration_ms` unchanged.

The same held for an Esc 2 s and 3.5 s after submit (3 of 3 typed prompts). Fed to
`claudecode.PromptInterruptedAt`, all three return offset 0.

A turn opened by a background task's completion (a `UserPromptSubmit` whose prompt is a
`<task-notification>`) behaves differently. Esc 0.5 s in, before any assistant line, wrote a
`user` line carrying that turn's `promptId` with text `[Request interrupted by user]`. There is
no prompt to rewind (1 of 1). `PromptInterruptedAt` finds it, so the interrupt sweep lands idle.

Consequence for Muster: a slow-thinking model (Opus 5.5 at large context) turns the accepted
early-interrupt gap from about a second into the whole thinking phase.

Evidence: interface probe 2026-11-19, instance 5, 1 interactive haiku session `5dd769da`.

Raw probe capture (local only, not in git): `capture-5.jsonl`.
