---
id: launch-bypass-never-restored-as-default
type: decision
status: proposed
date: 2026-09-27
summary: A directory's remembered bypass mode is never restored; the dialog checks auto instead, so bypass is always chosen fresh.
features: [launch]
tags: [ux, security, user-decision]
files: [web/src/sessions/permission.ts, web/src/features/launchrestore.ts]
tests: []
refs: [plan:resume-and-dangerously-allow, kb:adr/launch-start-in-explicit-flag-auto-fallback]
supersedes: []
---
**Context.** Start in restores the directory's last-used mode. With bypass offered, one bypass
launch would make every later launch there default to bypass.

**Options.** (A) Restore it like any mode. (B) Never restore it: a remembered bypass reads as
auto, the existing fallback. (C) Stop recording it.

**Decision.** B. The repo row still records the truth; only the dialog's restore maps
`bypassPermissions` to auto, on open and on a Recent click.

**Consequences.** Bypass needs a deliberate click every launch. `lastPermissionMode` on the wire
can be `bypassPermissions` while the dialog shows auto.
