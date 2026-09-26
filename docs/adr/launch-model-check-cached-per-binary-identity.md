---
id: launch-model-check-cached-per-binary-identity
type: decision
status: accepted
date: 2026-09-26
summary: The model check runs when the launch dialog opens and caches verdicts against the resolved claude binary path, size and mtime; launch reads the cache.
features: [launch]
tags: [claude-code-format, ux, user-decision]
files: [internal/server/launcher*.go, internal/claudecode/modelcheck*.go]
tests: []
refs: [plan:maintainability-regressions, kb:fact/model-catalog-precheck-zero-token, kb:anchor/models.check, kb:anchor/sessions.create, https://github.com/Zalaras/muster/issues/55]
supersedes: [launch-refuses-model-outside-binary-catalog, launch-model-presets-passed-verbatim]
---
**Context.** Issue #55: launching felt slow. The uncached pre-check the superseded record chose costs about 1.0 s on every launch (measured 2026-09-25 on 2.1.282), before tmux is touched. That record declined a cache because invalidation "becomes a whole thing". The daemon learns the Claude Code version only once, at startup, while Claude Code updates itself underneath it.

**Options.** (A) Keep the uncached launch check. (B) Check in the dialog only. (C) Cache per model, invalidated by running `claude --version`. (D) Check the presets when the dialog opens, and cache each definite verdict against the binary's file identity: the `-claude-bin` value resolved on `$PATH` with symlinks followed, plus size and mtime.

**Decision.** D, the developer's choice. Launch keeps its refusal and reads the same cache. `unchecked` (error, timeout, no identity) is never cached and fails open.

**Consequences.** A launch after the dialog's check pays no subprocess. An update invalidates the cache on the next lookup, because a new file is resolved, without running `claude` to ask. The first dialog open after an update pays about a second, in the background. Concurrent lookups of one model share one run. A model the binary knows but the account cannot run still fails its first turn.
