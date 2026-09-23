---
id: launch-start-in-explicit-flag-auto-fallback
type: decision
status: accepted
date: 2026-09-23
summary: Start in keeps the four tabbed modes under Claude Code's labels, sends every one as an explicit flag, and falls back to auto when nothing is remembered.
features: [launch, lifecycle]
tags: [ux, claude-code-format, user-decision]
files: [internal/claudecode/launch.go, web/src/features/launch.ts, web/src/sessions/permission.ts, web/index.html]
tests: []
refs: [plan:new-session-improvement, kb:fact/permission-mode-no-flag-follows-configured-default, kb:fact/permission-mode-flag-on-wire, kb:fact/permission-mode-auto-model-gated, kb:adr/launch-bypass-and-dontask-unoffered]
supersedes: [launch-permission-modes-offered-four-tabbed]
---
**Context.** Manual was sent as no flag at all, on the belief that no flag means manual. A probe on the ceiling version measured otherwise. With no flag, a session starts in Claude Code's configured default, which was auto on the developer's machine; an explicit default flag forces manual. Separately, issue #28 asked that the dialog not start on accept edits and that auto be the default when nothing else applies.

**Options.** (A) Keep no flag for manual. (B) Send every mode, manual included, as an explicit flag. For the fallback: (C) manual, as before, or (D) auto.

**Decision.** B with D. The offered set is unchanged: manual, accept edits, plan and auto, with default still the wire value behind manual. A remembered per-directory mode is restored as before. With none, or with a stored value the dialog has no radio for, the form checks auto.

**Consequences.** Manual now means manual on every machine, on launch and on resume. The explicit default spelling is unmeasured below 2.1.259, so the canary's permission-mode sweep carries an explicit default row from here on. An auto fallback with haiku selected is corrected to default by the first hook, through the existing honesty path. The two unoffered modes stay a separate, rejected record.
