---
id: update-check-pref-governs-automatic-checking-only
type: decision
status: accepted
date: 2026-09-22
summary: The update-check pref governs the daemon's automatic schedule only; a user-initiated check always runs, and canCheck says when one is possible.
features: [update, settings]
tags: [ux, user-decision]
files: [internal/server/update.go, web/src/render/update.ts, web/src/features/update.ts]
tests: []
refs: [plan:rail-card-improvements-2, "#48", kb:adr/update-check-pref-governs-checking-only, kb:adr/update-check-runs-in-daemon-daily, kb:adr/update-install-kinds-decide-who-may-apply, kb:anchor/update.check, kb:anchor/ws.update]
supersedes: [update-check-pref-governs-checking-only]
---
**Context.** The dashboard cannot ask for a check now. The daemon checks once after listen and then every `-update-check-interval`, default 24 h, so a user who wants to know today can wait a day. The only user-reachable trigger is toggling the pref off and on, a side effect rather than an action. The superseded decision made one boolean govern checking outright, with off meaning no request to the release host at all — which would make a manual check contradict the pref beside it.

**Options.** (A) Keep the pref absolute and disable the button while it is off. (B) Scope the pref to the automatic schedule and let a user-initiated check always run. (C) Make pressing the button turn the pref back on, so one rule still covers both.

**Decision.** B, the developer's call: the pref is about what the daemon does on its own, and a user asking directly should be answered. Off stays verifiable in the sense that matters — while false the daemon issues no check of its own, on a tick or at startup. Turning it off still clears `available` and `checkedAt`; a later manual check repopulates them.

**Consequences.** `available` may be non-null while the pref is false, so the Settings badge can appear with daily checks off — the user asked, and there is news. The readout branch reporting checking as disabled goes, since it would contradict a result just fetched. The wire gains `canCheck`, true iff `-update-base-url` is non-empty and the install is not `dev`: there was no way to tell "disabled by flag" from "installer that has not checked yet", the state every test daemon is in. A dev build has it false, since `ParseRelease` cannot parse a dev version string and the comparison would never run.
