---
id: launch-refuses-model-outside-binary-catalog
type: decision
status: superseded
date: 2026-09-23
summary: Launch refuses a model the installed Claude Code's catalog does not describe, via a fail-open zero-token --bare check run on every launch, uncached.
features: [launch]
tags: [claude-code-format, ux, user-decision]
files: [internal/claudecode/modelcheck.go, internal/server/sessions.go, internal/server/server.go]
tests: []
refs: [plan:new-session-improvement, kb:fact/model-catalog-precheck-zero-token, kb:fact/unknown-model-fails-first-turn, kb:fact/fable-model-alias, kb:anchor/sessions.create]
supersedes: [launch-model-presets-passed-verbatim]
---
**Context.** Issue #29: a machine whose Claude Code predated the fable alias launched a fable session. The session started normally and failed on its first turn, which is the outcome the superseded record called honest. The developer wants the launch itself refused. A probe measured a way to ask the installed binary: a bare, empty-prompt run prints a catalog warning on stderr for a model it does not describe. The run spends no tokens, fires no hooks and takes about a second.

**Options.** (A) Keep failing inside the session. (B) Check in the dialog, per preset. (C) Have the daemon run the binary's own catalog check before any write, and refuse on the measured warning. (D) C with a cache of recognised models.

**Decision.** C, the developer's choice. The check is not cached: "pay the price of 1s otherwise cache invalidation etc becomes a whole thing". Presets and the free-text override are still passed to --model verbatim.

**Consequences.** Every launch pays about a second, and a refused launch writes nothing. The check fails open: only the measured sentence blocks. A run that errors, times out, or meets a binary with no catalog lets the launch proceed. A model the binary knows but the account cannot run still fails its first turn. The sentence and the flags are guarded by the canary.
