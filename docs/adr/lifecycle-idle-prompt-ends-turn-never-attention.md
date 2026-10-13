---
id: lifecycle-idle-prompt-ends-turn-never-attention
type: decision
status: accepted
date: 2026-10-13
summary: An idle_prompt never raises needs_input; naming an open prompt of a working or planning session it ends the turn into idle, else it only closes that prompt.
features: [lifecycle]
tags: [state-machine]
files: [internal/claudecode/interpret.go, internal/session/machine.go, internal/session/session.go]
tests: [TestApplyInput_IdleNotice, TestApplyInput_LegacyIdleWaitEndsOnAnyAgentsActivity, TestApplyInput_CardStateInvariants_D3]
refs: [plan:state-issues, kb:fact/local-command-orphan-idle-prompt, kb:fact/compact-hook-sequence, kb:fact/permission-wait-gets-no-idle-prompt, kb:fact/background-subagent-fresh-prompt-id, kb:adr/lifecycle-attention-owned-by-raising-agent, "#72", "#87"]
supersedes: []
---
**Context.** The first UX design mapped `Notification{idle_prompt}` to Needs-Input before anything
was measured. A later guard made one that names a closed prompt inert, which covers every
`idle_prompt` after a normal turn. What still moved the card were `idle_prompt`s naming prompts
that no hook ever closes: local commands such as `/context` and `/rc`, compactions, and
background-subagent stretches under a fresh prompt id. In each, nothing was waiting on the
developer. The background case also stuck: the wait was recorded as the main agent's, so the
subagent's activity could not clear it (#72, #87). An unanswered permission dialog gets no
`idle_prompt` at all.

**Options.** (A) Keep the mapping and special-case each orphan source. (B) Ignore `idle_prompt`
entirely. (C) Read it as "Claude is at its input box": it ends an open turn into `idle` and never
raises attention.

**Decision.** C, chosen by the developer 2026-10-12. An `idle_prompt` naming an open prompt of a
`working` or `planning` session closes that prompt and the current one, and lands `idle` as `Stop`
would, minus `lastActivity`. In `started`, `idle`, `failed`, or a permission wait, it only closes
the prompt it names. A wait's owner is consulted for permission waits only, as
kb:adr/lifecycle-attention-owned-by-raising-agent already says.

**Consequences.** `attention.reason:"idle"` is no longer raised; it stays on the wire for rows an
earlier daemon persisted. A lost `Stop` or compaction end self-heals about 60 s later. An Esc that
leaves text in the input box gets no `idle_prompt`, so it is not healed
(kb:adr/lifecycle-early-interrupt-gap-accepted).
