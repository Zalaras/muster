---
id: ingest-envelope-authoritative-binding
type: decision
status: accepted
date: 2026-08-27
summary: Every event is enveloped; a new session_id on an enveloped event is a clear-style rebind, a never-bound session binds on it, raw and status posts never bind.
features: [ingest, lifecycle]
tags: [envelope, state-machine, claude-code-format]
files: [internal/session/manager.go, internal/claudecode/ingest.go]
tests: [TestApply_NeverBoundSessionBindsWithNoTransitionThenAppliesItsOwnEvent, TestApply_INV3_RawEventNeverBindsFromAnyState, TestApplyStatus_INV4_NeverTouchesBindingOrStateFromAnyState, TestIngestRouting_EnvelopeNamingAnUnknownMusterSessionPersistsUnrouted]
refs: [docs/history/spec-changelog.md, plan:m4-hook-lifetime, kb:anchor/ingest.envelope, kb:anchor/state.transitions, kb:adr/ingest-monotonic-rebind, kb:adr/lifecycle-session-identity-is-tmux-target]
supersedes: [ingest-envelope-binds-never-cwd]
---
**Context.** Binding had depended on the one enveloped start event, with raw hooks routed through the Claude-id map. Once every hook became a command wrapper, every event carried the Muster session and pane, and a lost start event no longer had to leave a session unbound.

**Options.** (A) Keep binding on the start event only. (B) Make the envelope authoritative: an enveloped non-status event whose Claude id differs from the bound one is treated as a clear rebind before the event applies, an enveloped event on a never-bound session binds it without a transition, raw posts route by the existing map and never bind, and status-line posts never bind or rebind.

**Decision.** B. The manager's apply path learns whether the post was enveloped.

**Consequences.** Working-directory matching remains forbidden; an envelope naming an unknown Muster session persists unrouted. Raw posts stay accepted for the canary and legacy paths. The monotonic guard bounds this rule so a reordered straggler cannot rebind backwards.
