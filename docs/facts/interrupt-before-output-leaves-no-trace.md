---
id: interrupt-before-output-leaves-no-trace
type: fact
status: active
date: 2026-10-12
summary: Esc before any assistant output, API retries included, rewinds the prompt into the input box and leaves no hook, transcript line or idle_prompt.
features: [lifecycle]
tags: [claude-code-format, state-machine]
files: [internal/claudecode/interpret_transcript.go, internal/session/interrupt.go]
tests: []
refs: [test/rig/captures/capture-3-state-2026-10-12.jsonl, kb:fact/interrupt-recorded-in-transcript, kb:fact/interrupt-emits-no-turn-end, "#78"]
verified: 2.1.296..2.1.296
guard: none
---
If Esc lands before the turn has produced any assistant output, the TUI shows "Interrupted ·
What should Claude do instead?" and puts the prompt text back in the input box. The turn's
`UserPromptSubmit` has already fired, but after the Esc there is nothing:

- no hook of any kind for 80 s (31 of the binary's 33 events were registered, all but `WorktreeCreate`/`WorktreeRemove`);
- no `[Request interrupted by user…]` line in the transcript, whose last line for the prompt
  stays the user's own message;
- no `idle_prompt`;
- nothing on the status line, which keeps naming the rewound `prompt_id`, with
  `total_api_duration_ms` unchanged;
- no change to the tmux `pane_title`, which never changed during a working turn either.

This holds when Esc comes 0.4, 1.0 and 1.8 s after submitting (3 of 3). It also holds during
the API retry loop ("500 … Retrying in 7s · attempt 5/10") against the fail-proxy (1 of 1).
Left alone, that retry loop ends in `StopFailure{error:"server_error"}` after about 3 min
(1 of 1).

Once output exists, an interrupt does write the line kb:fact/interrupt-recorded-in-transcript
describes. Ctrl+C mid-stream wrote `[Request interrupted by user]` with the turn's `promptId`
(1 of 1).

Fed through `Interpret` + `applyInput`, a rewound turn stays `working` until the next prompt's
`UserPromptSubmit`.

Evidence: interface probe 2026-10-12, instance 3. Sessions `f7c88c` (3 early Esc, 1 Ctrl+C,
real API), `d51ae8` (Esc during retries) and `3e7d2c` (retries left to run out), the last two
through `bin/probe-failproxy -status 500`.
