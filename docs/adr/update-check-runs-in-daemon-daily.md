---
id: update-check-runs-in-daemon-daily
type: decision
status: accepted
date: 2026-09-10
summary: The update check runs in the daemon after listen and then daily via the redirect; an empty base URL disables checking and apply, as every test daemon sets.
features: [update]
tags: [testing, deps]
files: [internal/server/update.go, internal/selfupdate/release.go, cmd/musterd/main.go, web/e2e/helpers/daemon.ts]
tests: [TestUpdateManager_FailedCheckKeepsPreviousResultAndBroadcastsNothing, TestVersion_CompareOnlyStrictlyGreaterIsAvailable, TestLatestTag_RequestCarriesTenSecondDeadline]
refs: [docs/history/spec-changelog.md, plan:auto-update, kb:anchor/ws.update, kb:anchor/ws.snapshot, kb:adr/release-latest-resolved-via-redirect-not-api, kb:adr/update-check-pref-governs-checking-only, kb:adr/issue-auth-gh-token-at-time-of-use]
supersedes: []
---
**Context.** Once checking was a pref, it needed a home and a cadence. The dashboard could poll the release host itself, or the daemon could and push the result over the state socket like every other fact.

**Options.** (A) The dashboard checks on load. (B) The daemon checks once after it starts listening and then on a long interval, broadcasting the result; a base URL flag points it at the release host, and empty disables checking and apply together, following the shape the issue-filing endpoint already used.

**Decision.** B with a daily interval. A daemon runs for days and every open tab should agree; the flag shape means no E2E daemon can ever reach the real host.

**Consequences.** A failed check keeps the previous result and broadcasts nothing, so a flaky network never flickers the badge. Only a strictly newer release counts as available. The interval is a flag for tests and for anyone who wants it slower.
