---
id: update-check-pref-governs-checking-only
type: decision
status: accepted
date: 2026-09-10
summary: One boolean pref, default on, governs only whether the daemon checks for a newer release; applying is always explicit via a button or the update flag.
features: [update, settings]
tags: [ux, security, user-decision]
files: [internal/server/prefs.go, internal/server/update.go, web/src/features/update.ts, cmd/musterd/update.go]
tests: [TestUpdateManager_DisabledCheckingMakesNoRequests, TestUpdateManager_LateResponseAfterDisableIsDiscarded, TestUpdateManager_SetCheckEnabledFalseClearsAndBroadcastsOnce, web/e2e/update.spec.ts]
refs: [docs/history/spec-changelog.md, docs/history/protocol-changelog.md, plan:auto-update, kb:anchor/prefs.put, kb:anchor/update.apply, kb:anchor/ws.update, kb:adr/update-check-runs-in-daemon-daily, kb:adr/update-restart-is-in-place-reexec-not-shutdown]
supersedes: []
---
**Context.** A user who installs once never learns a newer release exists. The interview weighed how much the daemon should do about that on its own, given that it holds live terminal sessions and that a self-replacing binary is a security-relevant act.

**Options.** (A) Fully automatic: check, download and swap without asking. (B) Check-only: a dashboard cue and instructions to reinstall by hand. (C) One pref that governs checking, default on, where off means no request to the release host at all and an in-flight result is discarded; apply is never automatic but offered as an Update button that swaps and asks for a restart, an Update-and-restart button, or a command-line flag that swaps only.

**Decision.** C, settled in the interview. Checking is the part a user wants to be able to switch off entirely; applying is the part that must never surprise them.

**Consequences.** Only a strictly newer semantic version badges. The command-line path never restarts, so a script can stage an update without touching sessions. Off is verifiable: the manager makes no request, on a tick or at startup.
