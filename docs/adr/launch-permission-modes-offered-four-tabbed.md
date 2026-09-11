---
id: launch-permission-modes-offered-four-tabbed
type: decision
status: accepted
date: 2026-09-03
summary: The Start-in control offers Claude Code's four tabbed modes under its own labels; default stays the wire value behind manual and auto is new end to end.
features: [launch, lifecycle]
tags: [ux, claude-code-format, state-machine, user-decision]
files: [web/src/features/launch.ts, internal/claudecode/launch.go, internal/server/sessions.go]
tests: [TestHandleCreateSession_UnknownPermissionModeMessageNamesAllFour, TestLauncher_AutoPermissionModeSeedsLatchAndRepoDefault, web/e2e/permission-mode.spec.ts]
refs: [docs/history/spec-changelog.md, docs/history/protocol-changelog.md, plan:fix-auto-mode-select, kb:fact/permission-mode-flag-on-wire, kb:fact/permission-mode-auto-model-gated, kb:fact/permission-mode-presence-split, kb:anchor/sessions.create, kb:anchor/ws.session, kb:adr/launch-form-seeds-model-and-permission-mode, kb:adr/launch-bypass-and-dontask-unoffered, "#12"]
supersedes: []
---
**Context.** The launcher's "auto-accept" radio sent accept-edits. The shorthand was coined when that was the only auto-ish mode; Claude Code has since grown a distinct mode literally named auto, which hooks report by that name and which is model-gated. Picking auto-accept and getting accept-edits was a vocabulary bug, not a wire bug, and Muster had no way to request auto at all.

**Options.** (A) Relabel the radio to accept edits and offer nothing new. (B) Offer the four modes Claude Code cycles through with Shift+Tab, under its own labels, keeping default as the wire value behind manual and adding auto end to end. (C) Also accept manual as a fifth request value as an alias.

**Decision.** B, Damian's list. Default stays behind manual because it is what hooks report, so the seed and the hook agree with no mapping and stored rows need no migration; default still emits no flag, the one spelling known to work on both supported versions. C was rejected as an alias with no behavioural difference.

**Consequences.** A stored per-directory mode the dialog has no radio for falls back to manual, so the checked radio always matches what the form sends. There is no dialog-side model-versus-mode warning: a seeded auto on a model that cannot run it is corrected by the first hook through the ordinary honesty path. The two unoffered modes are a separate, rejected record.
