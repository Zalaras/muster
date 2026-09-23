---
id: unknown-model-fails-first-turn
type: fact
status: active
date: 2026-09-23
summary: An interactive session launched with an unknown model starts normally and reports it verbatim; the first turn fails with StopFailure.error model_not_found.
features: [launch, lifecycle]
tags: [claude-code-format]
files: [internal/claudecode/interpret.go]
tests: []
refs: [test/rig/captures/capture-3.jsonl, kb:fact/stopfailure-error-taxonomy, kb:fact/model-catalog-precheck-zero-token, plan:new-session-improvement]
verified: 2.1.280..2.1.280
guard: none
---
`claude --model zephyr` in a tmux pane starts like any session. The banner reads `zephyr with
high effort`, and the TUI shows no startup warning (the catalog line of
kb:fact/model-catalog-precheck-zero-token goes to stderr). `SessionStart.model` is `"zephyr"`
and the status line's `model` is `{"id":"zephyr","display_name":"zephyr"}`. Nothing is
substituted. The failure arrives only with the first prompt. Headless `-p "say hi"` against the
real API prints `There's an issue with the selected model (zephyr). It may not exist or you may
not have access to it. Run --model to pick a different model.` on stdout and exits 1. It emits
`StopFailure` with `error: "model_not_found"`, which is the first observation of that
taxonomy value, and carries the same sentence as `last_assistant_message`. The API rejects the
request before running it, so no tokens are spent. Switching to an uncatalogued model inside
a session goes through the binary's `model_switch` path, which rejects it with an error. This
was read from the bundle and not driven.

Evidence: interface probe 2026-09-23, instance 3. There were 4 interactive sessions through the
fail-proxy (banner, `SessionStart.model` and status-line model, 4 of 4), plus 1 headless
real-API run for the `model_not_found` failure.
